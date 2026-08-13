<?php

namespace App\Services\Saas;

use App\Models\Master\ActivityLog;
use App\Models\Master\OrganizationBillingInvoice;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class PaymentApprovalService
{
    /**
     * Approve a pending payment invoice.
     *
     * Idempotent: if already approved, returns the invoice without error.
     */
    public function approve(
        OrganizationBillingInvoice $invoice,
        string $approvedBy,
        ?string $notes = null,
    ): OrganizationBillingInvoice {
        if ($invoice->status === 'approved' || $invoice->status === 'paid') {
            return $invoice;
        }

        if ($invoice->status !== 'pending') {
            throw new \RuntimeException("Only pending invoices can be approved. Current status: {$invoice->status}");
        }

        $oldStatus = $invoice->status;

        $invoice->update([
            'status'      => 'approved',
            'approved_at' => now(),
            'approved_by' => $approvedBy,
            'paid_at'     => $invoice->paid_at ?? now(),
            'notes'       => $notes ? ($invoice->notes ? $invoice->notes . "\n" . $notes : $notes) : $invoice->notes,
        ]);

        $this->logActivity(
            action: 'Payment approved',
            target: $invoice->organization->name ?? "Org #{$invoice->organization_id}",
            details: "Invoice {$invoice->invoice_number} — \${$invoice->total_amount} — {$oldStatus} → approved",
            user: $approvedBy,
        );

        return $invoice->fresh();
    }

    /**
     * Reject a pending payment invoice.
     *
     * Idempotent: if already rejected, returns the invoice without error.
     */
    public function reject(
        OrganizationBillingInvoice $invoice,
        string $rejectedBy,
        ?string $reason = null,
    ): OrganizationBillingInvoice {
        if ($invoice->status === 'rejected') {
            return $invoice;
        }

        if (!in_array($invoice->status, ['pending', 'approved'])) {
            throw new \RuntimeException("Cannot reject invoice with status: {$invoice->status}");
        }

        $oldStatus = $invoice->status;

        $invoice->update([
            'status'           => 'rejected',
            'rejection_reason' => $reason,
            'notes'            => $reason ? ("Rejected: " . $reason . ($invoice->notes ? "\n" . $invoice->notes : '')) : $invoice->notes,
        ]);

        $this->logActivity(
            action: 'Payment rejected',
            target: $invoice->organization->name ?? "Org #{$invoice->organization_id}",
            details: "Invoice {$invoice->invoice_number} — \${$invoice->total_amount} — {$oldStatus} → rejected" . ($reason ? " — Reason: {$reason}" : ''),
            user: $rejectedBy,
        );

        return $invoice->fresh();
    }

    /**
     * Get billing summary stats for all organizations or a specific org.
     */
    public function getBillingSummary(?int $organizationId = null): array
    {
        $query = OrganizationBillingInvoice::on('mysql_master');

        if ($organizationId) {
            $query->where('organization_id', $organizationId);
        }

        $totalBilling = (clone $query)->sum('total_amount');
        $pendingAmount = (clone $query)->where('status', 'pending')->sum('total_amount');
        $approvedAmount = (clone $query)->whereIn('status', ['approved', 'paid'])->sum('total_amount');
        $rejectedAmount = (clone $query)->where('status', 'rejected')->sum('total_amount');
        $totalInvoices = (clone $query)->count();
        $pendingCount = (clone $query)->where('status', 'pending')->count();

        return [
            'total_billing'   => round($totalBilling, 2),
            'pending_amount'  => round($pendingAmount, 2),
            'approved_amount' => round($approvedAmount, 2),
            'rejected_amount' => round($rejectedAmount, 2),
            'total_invoices'  => $totalInvoices,
            'pending_count'   => $pendingCount,
        ];
    }

    /**
     * Create a pending billing invoice for a subscription renewal.
     *
     * Uses renewal_reference for idempotency — prevents duplicate invoices
     * for the same subscription renewal period.
     */
    public function createRenewalInvoice(
        int $organizationId,
        int $subscriptionId,
        int $planId,
        float $amount,
        string $currency,
        string $billingPeriod,
        \Carbon\Carbon $periodStart,
        \Carbon\Carbon $periodEnd,
        ?string $renewalReference = null,
        ?string $description = null,
    ): ?OrganizationBillingInvoice {
        // Idempotency check: skip if invoice already exists for this renewal reference
        if ($renewalReference) {
            $existing = OrganizationBillingInvoice::on('mysql_master')
                ->where('renewal_reference', $renewalReference)
                ->first();

            if ($existing) {
                Log::info("Duplicate renewal invoice prevented for reference: {$renewalReference}");
                return $existing;
            }
        }

        $taxRate = 0.10;
        $taxAmount = round($amount * $taxRate, 2);
        $totalAmount = round($amount + $taxAmount, 2);

        $invoiceNumber = 'INV-' . strtoupper(substr(uniqid(), -4)) . '-' . now()->format('YmdHis');

        return OrganizationBillingInvoice::on('mysql_master')->create([
            'organization_id'      => $organizationId,
            'subscription_id'      => $subscriptionId,
            'plan_id'              => $planId,
            'invoice_number'       => $invoiceNumber,
            'status'               => 'pending',
            'amount'               => $amount,
            'tax_amount'           => $taxAmount,
            'total_amount'         => $totalAmount,
            'currency'             => $currency,
            'billing_period'       => $billingPeriod,
            'billing_period_start' => $periodStart,
            'billing_period_end'   => $periodEnd,
            'payment_method'       => null,
            'description'          => $description ?? "Subscription renewal — {$billingPeriod}",
            'renewal_reference'    => $renewalReference,
            'due_at'               => $periodEnd,
        ]);
    }

    /**
     * Create a manual one-off invoice (status = paid immediately).
     */
    public function createManualInvoice(
        int $organizationId,
        ?int $subscriptionId,
        ?int $planId,
        float $amount,
        string $currency,
        string $billingPeriod,
        ?string $paymentMethod = 'card',
        ?string $description = null,
    ): OrganizationBillingInvoice {
        $taxRate = 0.10;
        $taxAmount = round($amount * $taxRate, 2);
        $totalAmount = round($amount + $taxAmount, 2);

        $invoiceNumber = 'INV-' . strtoupper(substr(uniqid(), -4)) . '-' . now()->format('YmdHis');

        return OrganizationBillingInvoice::on('mysql_master')->create([
            'organization_id'  => $organizationId,
            'subscription_id'  => $subscriptionId,
            'plan_id'          => $planId,
            'invoice_number'   => $invoiceNumber,
            'status'           => 'paid',
            'amount'           => $amount,
            'tax_amount'       => $taxAmount,
            'total_amount'     => $totalAmount,
            'currency'         => $currency,
            'billing_period'   => $billingPeriod,
            'payment_method'   => $paymentMethod,
            'description'      => $description ?? 'Manual invoice',
            'paid_at'          => now(),
        ]);
    }

    /**
     * Log activity to the activity_logs table.
     */
    private function logActivity(string $action, string $target, string $details, string $user): void
    {
        try {
            ActivityLog::on('mysql_master')->create([
                'user'    => $user,
                'action'  => $action,
                'target'  => $target,
                'details' => $details,
                'ip'      => request()->ip() ?? null,
                'status'  => 'success',
            ]);
        } catch (\Throwable $e) {
            Log::warning("Failed to log billing activity: " . $e->getMessage());
        }
    }
}
