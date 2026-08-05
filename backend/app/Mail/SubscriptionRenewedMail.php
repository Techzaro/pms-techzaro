<?php

namespace App\Mail;

use App\Models\Master\Organization;
use App\Models\Master\OrganizationSubscription;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Queue\SerializesModels;

class SubscriptionRenewedMail extends Mailable
{
    use Queueable, SerializesModels;

    public Organization $organization;
    public OrganizationSubscription $subscription;
    public string $recipientType;
    public string $loginUrl;

    public function __construct(
        Organization $organization,
        OrganizationSubscription $subscription,
        string $recipientType = 'admin',
        string $loginUrl = ''
    ) {
        $this->organization = $organization;
        $this->subscription = $subscription;
        $this->recipientType = $recipientType;
        $this->loginUrl = $loginUrl ?: rtrim(config('app.frontend_url'), '/');
    }

    public function envelope(): Envelope
    {
        $orgName = $this->organization->name;
        $subject = $this->recipientType === 'super_admin'
            ? "Subscription Renewed — {$orgName}"
            : "Your Subscription Has Been Renewed — {$orgName}";

        return new Envelope(
            from: new Address(config('mail.from.address'), config('mail.from.name')),
            subject: $subject,
        );
    }

    public function content(): Content
    {
        return new Content(
            htmlString: $this->buildHtml(),
        );
    }

    private function buildHtml(): string
    {
        $orgName = e($this->organization->name);
        $plan = $this->subscription->plan;
        $planName = e($plan->name ?? 'Unknown');
        $currentYear = date('Y');
        $startsAt = $this->subscription->starts_at?->format('M d, Y g:i A') ?? 'N/A';
        $endsAt = $this->subscription->ends_at?->format('M d, Y g:i A') ?? 'N/A';
        $billingPeriod = e(ucfirst($this->subscription->billing_period ?? 'monthly'));

        if ($plan && $plan->slug === 'trial') {
            $trialDuration = e($plan->trial_duration . ' ' . $plan->trial_duration_unit);
            $planDetails = "Trial Plan — {$trialDuration}";
            $price = 'Free';
        } else {
            $amount = e($this->subscription->amount ?? '0');
            $currency = e($this->subscription->currency ?? 'USD');
            $periodShort = $this->subscription->billing_period === 'monthly' ? 'mo' : 'yr';
            $price = "{$currency} {$amount}/{$periodShort}";
            $planDetails = "{$billingPeriod} billing — {$price}";
        }

        $maxUsers = $plan && $plan->max_users == 9999 ? 'Unlimited' : ($plan->max_users ?? 'N/A');
        $maxProjects = $plan && $plan->max_projects == 9999 ? 'Unlimited' : ($plan->max_projects ?? 'N/A');
        $maxStorage = ($plan->max_storage_gb ?? 'N/A') . ' GB';

        if ($this->recipientType === 'super_admin') {
            $greeting = "Hello TechXaro Admin,";
            $body = "<p style='color:#111827;font-size:15px;line-height:1.7;margin:0 0 12px;'>The subscription for organization <strong>{$orgName}</strong> has been <strong style='color:#059669;'>automatically renewed</strong>.</p>";
            $body .= "<p style='color:#111827;font-size:15px;line-height:1.7;margin:0 0 12px;'>The previous subscription period had expired, and the system has automatically extended it to ensure uninterrupted service.</p>";
        } else {
            $greeting = "Hello,";
            $body = "<p style='color:#111827;font-size:15px;line-height:1.7;margin:0 0 12px;'>Your subscription for <strong>{$orgName}</strong> has been <strong style='color:#059669;'>automatically renewed</strong>.</p>";
            $body .= "<p style='color:#111827;font-size:15px;line-height:1.7;margin:0 0 12px;'>Your previous subscription period had expired, and we've automatically extended it so your team can continue working without any interruption.</p>";
        }

        $ctaButton = $this->recipientType === 'super_admin'
            ? "<a href='{$this->loginUrl}/super-admin/organizations/{$this->organization->id}' style='display:inline-block;background-color:#4f46e5;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;'>View Organization</a>"
            : "<a href='{$this->loginUrl}' style='display:inline-block;background-color:#4f46e5;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;'>Login to Portal</a>";

        return <<<HTML
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 20px;">
                <tr><td align="center">
                    <table width="640" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

                        <!-- Header -->
                        <tr>
                            <td style="background:linear-gradient(135deg,#059669,#10b981);padding:36px 30px;text-align:center;">
                                <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">Subscription Renewed</h1>
                                <p style="color:#d1fae5;margin:8px 0 0;font-size:14px;">{$orgName}</p>
                            </td>
                        </tr>

                        <!-- Body -->
                        <tr>
                            <td style="padding:36px 34px;">

                                <p style="color:#111827;font-size:15px;line-height:1.7;margin:0 0 12px;">{$greeting}</p>

                                {$body}

                                <!-- Subscription Details -->
                                <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border:2px solid #22c55e;border-radius:12px;margin:20px 0;">
                                    <tr><td style="padding:18px 24px;">
                                        <table width="100%" cellpadding="0" cellspacing="0">
                                            <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;font-weight:600;width:160px;">Organization:</td><td style="padding:5px 0;color:#111827;font-size:14px;font-weight:600;">{$orgName}</td></tr>
                                            <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;font-weight:600;">Plan:</td><td style="padding:5px 0;color:#111827;font-size:14px;font-weight:600;">{$planName}</td></tr>
                                            <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;font-weight:600;">Details:</td><td style="padding:5px 0;color:#111827;font-size:14px;font-weight:600;">{$planDetails}</td></tr>
                                            <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;font-weight:600;">Started:</td><td style="padding:5px 0;color:#111827;font-size:14px;">{$startsAt}</td></tr>
                                            <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;font-weight:600;">Expires:</td><td style="padding:5px 0;color:#111827;font-size:14px;font-weight:600;">{$endsAt}</td></tr>
                                            <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;font-weight:600;">Limits:</td><td style="padding:5px 0;color:#111827;font-size:14px;">{$maxUsers} users, {$maxProjects} projects, {$maxStorage} storage</td></tr>
                                        </table>
                                    </td></tr>
                                </table>

                                <p style="color:#111827;font-size:15px;line-height:1.7;margin:0 0 16px;">No action is required from your end. Your team can continue using all features as normal.</p>

                                <table cellpadding="0" cellspacing="0" style="margin:20px 0;">
                                    <tr><td>{$ctaButton}</td></tr>
                                </table>

                                <p style="color:#6b7280;font-size:14px;line-height:1.7;margin:0 0 20px;">If you have any questions about your subscription, please contact our support team.</p>

                                <!-- Signature -->
                                <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;padding-top:20px;">
                                    <tr><td style="padding:20px 0 0;">
                                        <p style="color:#111827;font-size:14px;line-height:1.6;margin:0;">Best regards,</p>
                                        <p style="color:#111827;font-size:14px;line-height:1.6;margin:8px 0 0;"><strong>TechXaro Team</strong></p>
                                    </td></tr>
                                </table>

                            </td>
                        </tr>

                        <!-- Footer -->
                        <tr>
                            <td style="background-color:#f9fafb;padding:18px 30px;text-align:center;border-top:1px solid #e5e7eb;">
                                <p style="color:#9ca3af;font-size:12px;margin:0;">&copy; {$currentYear} TechXaro. All rights reserved.</p>
                            </td>
                        </tr>

                    </table>
                </td></tr>
            </table>
        </body>
        </html>
        HTML;
    }
}
