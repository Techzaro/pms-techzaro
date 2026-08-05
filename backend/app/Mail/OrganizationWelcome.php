<?php

namespace App\Mail;

use App\Models\Master\Organization;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Queue\SerializesModels;

class OrganizationWelcome extends Mailable
{
    use Queueable, SerializesModels;

    public Organization $organization;
    public string $adminName;
    public string $adminEmail;
    public string $plainPassword;
    public string $loginUrl;

    public function __construct(
        Organization $organization,
        string $adminName,
        string $adminEmail,
        string $plainPassword,
        string $loginUrl
    ) {
        $this->organization = $organization;
        $this->adminName = $adminName;
        $this->adminEmail = $adminEmail;
        $this->plainPassword = $plainPassword;
        $this->loginUrl = $loginUrl;
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            from: new Address(config('mail.from.address'), config('mail.from.name')),
            subject: 'Welcome to TechXaro PMS — Your Organization is Ready',
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
        $name = e($this->adminName);
        $email = e($this->adminEmail);
        $password = e($this->plainPassword);
        $loginUrl = e($this->loginUrl);
        $orgName = e($this->organization->name);
        $currentYear = date('Y');

        $subscription = $this->organization->subscription;
        if ($subscription && $subscription->plan) {
            $planName = e($subscription->plan->name);
            if ($subscription->plan->slug === 'trial') {
                $trialLabel = e($subscription->plan->getTrialLabel());
                $trialEnds = e($this->organization->trial_ends_at?->format('M d, Y') ?? $trialLabel);
                $planLine1 = "Plan: {$planName}";
                $planLine2 = "Free {$trialLabel} trial";
                $planLine3 = "Trial Expires: {$trialEnds}";
            } else {
                $billingPeriod = e(ucfirst($subscription->billing_period));
                $amount = e($subscription->amount ?? '0');
                $currency = e($subscription->currency ?? 'USD');
                $periodShort = $subscription->billing_period === 'monthly' ? 'mo' : 'yr';
                $maxUsers = $subscription->plan->max_users == 9999 ? 'Unlimited' : $subscription->plan->max_users;
                $maxProjects = $subscription->plan->max_projects == 9999 ? 'Unlimited' : $subscription->plan->max_projects;
                $planLine1 = "Plan: {$planName}";
                $planLine2 = "{$billingPeriod} billing — {$currency} {$amount}/{$periodShort}";
                $planLine3 = "Limits: {$maxUsers} users, {$maxProjects} projects, {$subscription->plan->max_storage_gb} GB storage";
            }
        } else {
            $trialEnds = e($this->organization->trial_ends_at?->format('M d, Y') ?? '14 days');
            $planLine1 = "Plan: Trial";
            $planLine2 = "Free 14-day trial";
            $planLine3 = "Trial Expires: {$trialEnds}";
        }

        $planRow3 = $planLine3
            ? "<tr><td style='padding:5px 0;color:#6b7280;font-size:13px;font-weight:600;'></td><td style='padding:5px 0;color:#6b7280;font-size:13px;'>{$planLine3}</td></tr>"
            : '';

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
                            <td style="background:linear-gradient(135deg,#4f46e5,#6366f1);padding:36px 30px;text-align:center;">
                                <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">Welcome to TechXaro PMS</h1>
                                <p style="color:#c7d2fe;margin:8px 0 0;font-size:14px;">Your organization has been created</p>
                            </td>
                        </tr>

                        <!-- Body -->
                        <tr>
                            <td style="padding:36px 34px;">

                                <p style="color:#111827;font-size:15px;line-height:1.7;margin:0 0 12px;">Hello {$name},</p>

                                <p style="color:#111827;font-size:15px;line-height:1.7;margin:0 0 12px;">Your organization <strong>{$orgName}</strong> has been successfully created on the TechXaro Project Management Platform.</p>

                                <p style="color:#111827;font-size:15px;line-height:1.7;margin:0 0 16px;">You have been registered as the organization administrator. Below are your login credentials:</p>

                                <!-- Login Credentials -->
                                <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border:2px solid #3b82f6;border-radius:12px;margin:16px 0;">
                                    <tr><td style="padding:18px 24px;">
                                        <table width="100%" cellpadding="0" cellspacing="0">
                                            <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;font-weight:600;width:160px;">Portal URL:</td><td style="padding:5px 0;"><a href="{$loginUrl}" style="color:#2563eb;text-decoration:none;font-size:14px;font-weight:600;">{$loginUrl}</a></td></tr>
                                            <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;font-weight:600;">Email:</td><td style="padding:5px 0;color:#111827;font-size:14px;font-weight:600;">{$email}</td></tr>
                                            <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;font-weight:600;">Temporary Password:</td><td style="padding:5px 0;"><span style="font-family:monospace;background:#e5e7eb;padding:4px 10px;border-radius:6px;font-size:14px;color:#111827;">{$password}</span></td></tr>
                                            <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;font-weight:600;">Organization:</td><td style="padding:5px 0;color:#111827;font-size:14px;font-weight:600;">{$orgName}</td></tr>
                                            <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;font-weight:600;">{$planLine1}</td><td style="padding:5px 0;color:#111827;font-size:14px;font-weight:600;">{$planLine2}</td></tr>
                                            {$planRow3}
                                        </table>
                                    </td></tr>
                                </table>

                                <!-- Warning -->
                                <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef3c7;border:1px solid #f59e0b;border-radius:12px;margin:20px 0;">
                                    <tr><td style="padding:18px 24px;">
                                        <p style="color:#92400e;font-size:14px;font-weight:700;margin:0 0 8px;">Important: You will be asked to change your password the first time you sign in.</p>
                                        <p style="color:#92400e;font-size:13px;line-height:1.6;margin:0;">Please keep these credentials safe. Do not share them with anyone.</p>
                                    </td></tr>
                                </table>

                                <!-- What you can do -->
                                <p style="color:#111827;font-size:15px;line-height:1.7;margin:20px 0 8px;font-weight:700;">What you can do as Administrator</p>
                                <ul style="color:#374151;font-size:14px;line-height:2.0;margin:0;padding-left:22px;">
                                    <li>Create and manage projects for your organization</li>
                                    <li>Add team members and assign roles</li>
                                    <li>Track tasks, deliveries, and milestones</li>
                                    <li>Communicate with your team through the built-in chat</li>
                                    <li>Generate reports and monitor performance</li>
                                    <li>Manage your organization settings and billing</li>
                                </ul>

                                <!-- Next Steps -->
                                <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border:1px solid #22c55e;border-radius:12px;margin:20px 0;">
                                    <tr><td style="padding:18px 24px;">
                                        <p style="color:#166534;font-size:14px;font-weight:700;margin:0 0 8px;">Next Steps</p>
                                        <ol style="color:#166534;font-size:13px;line-height:2.0;margin:0;padding-left:20px;">
                                            <li>Login using the credentials above</li>
                                            <li>Change your password when prompted</li>
                                            <li>Set up your organization profile</li>
                                            <li>Invite your team members</li>
                                            <li>Create your first project</li>
                                        </ol>
                                    </td></tr>
                                </table>

                                <p style="color:#6b7280;font-size:14px;line-height:1.7;margin:0 0 20px;">If you have any questions or need assistance, please reply to this email or contact our support team.</p>

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
