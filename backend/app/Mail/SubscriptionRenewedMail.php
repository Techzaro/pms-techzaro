<?php

namespace App\Mail;

use App\Models\Master\Organization;
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
    public $subscription;
    public string $recipientType;
    public string $loginUrl;

    public function __construct(
        Organization $organization,
        $subscription,
        string $recipientType,
        string $loginUrl
    ) {
        $this->organization = $organization;
        $this->subscription = $subscription;
        $this->recipientType = $recipientType;
        $this->loginUrl = $loginUrl;
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            from: new Address(config('mail.from.address'), config('mail.from.name')),
            subject: "Subscription Renewed — {$this->organization->name}",
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
        $planName = e($this->subscription->plan->name ?? 'Unknown');
        $billingPeriod = e(ucfirst($this->subscription->billing_period ?? 'monthly'));
        $amount = e($this->subscription->amount ?? '0');
        $currency = e($this->subscription->currency ?? 'USD');
        $periodShort = ($this->subscription->billing_period ?? 'monthly') === 'yearly' ? 'yr' : 'mo';
        $recipientLabel = $this->recipientType === 'super_admin' ? 'Super Admin' : 'Organization Admin';
        $loginUrl = e($this->loginUrl);
        $year = date('Y');

        return <<<HTML
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 20px;">
                <tr><td align="center">
                    <table width="640" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
                        <tr>
                            <td style="background:linear-gradient(135deg,#059669,#10b981);padding:36px 30px;text-align:center;">
                                <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">Subscription Renewed</h1>
                                <p style="color:#d1fae5;margin:8px 0 0;font-size:14px;">{$orgName}</p>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:36px 34px;">
                                <p style="color:#111827;font-size:15px;line-height:1.7;margin:0 0 12px;">Hello {$recipientLabel},</p>
                                <p style="color:#111827;font-size:15px;line-height:1.7;margin:0 0 16px;">The subscription for <strong>{$orgName}</strong> has been automatically renewed.</p>
                                <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;margin:16px 0;">
                                    <tr><td style="padding:18px 24px;">
                                        <table width="100%" cellpadding="0" cellspacing="0">
                                            <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;font-weight:600;width:160px;">Plan:</td><td style="padding:5px 0;color:#111827;font-size:14px;font-weight:600;">{$planName}</td></tr>
                                            <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;font-weight:600;">Billing:</td><td style="padding:5px 0;color:#111827;font-size:14px;">{$billingPeriod} — {$currency} {$amount}/{$periodShort}</td></tr>
                                            <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;font-weight:600;">Status:</td><td style="padding:5px 0;color:#16a34a;font-size:14px;font-weight:600;">Active</td></tr>
                                        </table>
                                    </td></tr>
                                </table>
                                <p style="color:#6b7280;font-size:14px;line-height:1.7;margin:20px 0;">
                                    <a href="{$loginUrl}" style="color:#2563eb;text-decoration:none;font-weight:600;">Log in to Dashboard</a>
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td style="background-color:#f9fafb;padding:18px 30px;text-align:center;border-top:1px solid #e5e7eb;">
                                <p style="color:#9ca3af;font-size:12px;margin:0;">&copy; {$year} TechXaro. All rights reserved.</p>
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
