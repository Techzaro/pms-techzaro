<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Queue\SerializesModels;

class GuestInvitation extends Mailable
{
    use Queueable, SerializesModels;

    public User $user;
    public string $plainPassword;
    public string $loginUrl;
    public bool $isReset;

    public function __construct(User $user, string $plainPassword, string $loginUrl, bool $isReset = false)
    {
        $this->user = $user;
        $this->plainPassword = $plainPassword;
        $this->loginUrl = $loginUrl;
        $this->isReset = $isReset;
    }

    public function envelope(): Envelope
    {
        $subject = $this->isReset
            ? 'PMS Password Reset — ' . $this->user->name
            : 'Welcome to TechXaro Project Management Portal — ' . $this->user->name;

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
        $name = e($this->user->name);
        $email = e($this->user->personal_email);
        $password = e($this->plainPassword);
        $loginUrl = e($this->loginUrl);
        $company = e($this->user->company_name ?? '');
        $companyRow = $company
            ? '<tr><td style="padding:5px 0;color:#6b7280;font-size:13px;font-weight:600;width:140px;">Company:</td><td style="padding:5px 0;color:#111827;font-size:14px;font-weight:600;">' . $company . '</td></tr>'
            : '';

        if ($this->isReset) {
            return $this->buildResetHtml($name, $email, $password, $loginUrl);
        }

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
                                <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">Welcome to TechXaro Project Management Portal</h1>
                            </td>
                        </tr>

                        <!-- Body -->
                        <tr>
                            <td style="padding:36px 34px;">

                                <p style="color:#111827;font-size:15px;line-height:1.7;margin:0 0 12px;">Hello {$name},</p>

                                <p style="color:#111827;font-size:15px;line-height:1.7;margin:0 0 12px;">Welcome to the TechXaro Project Management Portal.</p>

                                <p style="color:#111827;font-size:15px;line-height:1.7;margin:0 0 16px;">A secure guest account has been created for you so you can monitor the progress of your project and communicate directly with our team.</p>

                                <p style="color:#111827;font-size:15px;line-height:1.7;margin:0 0 8px;">Your temporary login credentials are:</p>

                                <!-- Login Credentials -->
                                <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border:2px solid #3b82f6;border-radius:12px;margin:16px 0;">
                                    <tr><td style="padding:18px 24px;">
                                        <table width="100%" cellpadding="0" cellspacing="0">
                                            <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;font-weight:600;width:140px;">Portal URL:</td><td style="padding:5px 0;"><a href="{$loginUrl}" style="color:#2563eb;text-decoration:none;font-size:14px;font-weight:600;">{$loginUrl}</a></td></tr>
                                            <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;font-weight:600;">Email:</td><td style="padding:5px 0;color:#111827;font-size:14px;font-weight:600;">{$email}</td></tr>
                                            <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;font-weight:600;">Temporary Password:</td><td style="padding:5px 0;"><span style="font-family:monospace;background:#e5e7eb;padding:4px 10px;border-radius:6px;font-size:14px;color:#111827;">{$password}</span></td></tr>
                                            {$companyRow}
                                        </table>
                                    </td></tr>
                                </table>

                                <!-- Warning -->
                                <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef3c7;border:1px solid #f59e0b;border-radius:12px;margin:20px 0;">
                                    <tr><td style="padding:18px 24px;">
                                        <p style="color:#92400e;font-size:14px;font-weight:700;margin:0 0 8px;">For security reasons, you will be asked to change your password the first time you sign in.</p>
                                    </td></tr>
                                </table>

                                <!-- What you can do -->
                                <p style="color:#111827;font-size:15px;line-height:1.7;margin:20px 0 8px;font-weight:700;">What you can do in the portal</p>
                                <ul style="color:#374151;font-size:14px;line-height:2.0;margin:0;padding-left:22px;">
                                    <li>View your assigned project(s)</li>
                                    <li>Track project progress and milestones</li>
                                    <li>View tasks and deliverables related to your project</li>
                                    <li>Check project activities and updates</li>
                                    <li>Receive notifications about important changes</li>
                                    <li>Chat with our team and respond to requests</li>
                                    <li>Share requested information or files when needed</li>
                                </ul>

                                <!-- Access Note -->
                                <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border:1px solid #22c55e;border-radius:12px;margin:20px 0;">
                                    <tr><td style="padding:18px 24px;">
                                        <p style="color:#166534;font-size:14px;line-height:1.7;margin:0;">Please note that your account has access only to your own project(s). You will not be able to view or modify information related to other clients or internal company data.</p>
                                    </td></tr>
                                </table>

                                <p style="color:#6b7280;font-size:14px;line-height:1.7;margin:0 0 20px;">If you have any questions or experience any issues accessing the portal, please reply to this email or contact our support team.</p>

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
                                <p style="color:#9ca3af;font-size:12px;margin:0;">&copy; ' . date('Y') . ' TechXaro. All rights reserved.</p>
                            </td>
                        </tr>

                    </table>
                </td></tr>
            </table>
        </body>
        </html>
        HTML;
    }

    private function buildResetHtml(string $name, string $email, string $password, string $loginUrl): string
    {
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
                            <td style="background:linear-gradient(135deg,#dc2626,#ef4444);padding:36px 30px;text-align:center;">
                                <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">TechXaro Password Reset</h1>
                                <p style="color:#fecaca;margin:8px 0 0;font-size:14px;">{$name}</p>
                            </td>
                        </tr>

                        <!-- Body -->
                        <tr>
                            <td style="padding:36px 34px;">

                                <p style="color:#111827;font-size:15px;line-height:1.7;margin:0 0 12px;">Hello {$name},</p>

                                <p style="color:#111827;font-size:15px;line-height:1.7;margin:0 0 12px;">Your password has been reset by the administrator. Please use the new credentials below to log in.</p>

                                <!-- New Credentials -->
                                <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border:2px solid #3b82f6;border-radius:12px;margin:20px 0;">
                                    <tr><td style="padding:6px 24px;background-color:#3b82f6;"><p style="color:#ffffff;font-size:14px;font-weight:700;margin:8px 0;">NEW LOGIN CREDENTIALS</p></td></tr>
                                    <tr><td style="padding:18px 24px;">
                                        <table width="100%" cellpadding="0" cellspacing="0">
                                            <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;font-weight:600;width:140px;">Portal URL:</td><td style="padding:5px 0;"><a href="{$loginUrl}" style="color:#2563eb;text-decoration:none;font-size:14px;font-weight:600;">{$loginUrl}</a></td></tr>
                                            <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;font-weight:600;">Email:</td><td style="padding:5px 0;color:#111827;font-size:14px;font-weight:600;">{$email}</td></tr>
                                            <tr><td style="padding:5px 0;color:#6b7280;font-size:13px;font-weight:600;">New Password:</td><td style="padding:5px 0;"><span style="font-family:monospace;background:#e5e7eb;padding:4px 10px;border-radius:6px;font-size:14px;color:#111827;">{$password}</span></td></tr>
                                        </table>
                                    </td></tr>
                                </table>

                                <!-- Warning -->
                                <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef3c7;border:1px solid #f59e0b;border-radius:12px;margin:20px 0;">
                                    <tr><td style="padding:18px 24px;">
                                        <p style="color:#92400e;font-size:14px;font-weight:700;margin:0 0 8px;">For security reasons, you will be asked to change your password the next time you sign in.</p>
                                    </td></tr>
                                </table>

                                <p style="color:#6b7280;font-size:14px;line-height:1.7;margin:0 0 20px;">If you did not request this change, please contact our support team immediately.</p>

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
                                <p style="color:#9ca3af;font-size:12px;margin:0;">&copy; ' . date('Y') . ' TechXaro. All rights reserved.</p>
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
