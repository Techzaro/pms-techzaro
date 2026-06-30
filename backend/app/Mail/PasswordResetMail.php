<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class PasswordResetMail extends Mailable
{
    use Queueable, SerializesModels;

    public User $user;
    public string $resetUrl;
    public string $token;

    public function __construct(User $user, string $resetUrl, string $token)
    {
        $this->user = $user;
        $this->resetUrl = $resetUrl;
        $this->token = $token;
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Password Reset Request - TechXaro PMS',
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
        $resetUrl = e($this->resetUrl);
        $year = date('Y');

        return <<<HTML
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 20px;">
                <tr>
                    <td align="center">
                        <table width="640" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

                            <!-- Header -->
                            <tr>
                                <td style="background-color:#2563eb;padding:36px 30px;text-align:center;">
                                    <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">TechXaro PMS</h1>
                                    <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px;">Project Management System</p>
                                </td>
                            </tr>

                            <!-- Security Badge -->
                            <tr>
                                <td style="padding:28px 34px 0;">
                                    <table cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td style="background-color:#f5f3ff;border:1px solid #7c3aed22;border-radius:20px;padding:5px 14px;">
                                                <span style="color:#7c3aed;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">&#128274; Password Reset</span>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>

                            <!-- Body -->
                            <tr>
                                <td style="padding:20px 34px 0;">
                                    <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 6px;">Dear <strong style="color:#111827;">{$name}</strong>,</p>

                                    <p style="color:#374151;font-size:14px;line-height:1.7;margin:16px 0 20px;">We received a request to reset the password for your PMS account. Click the button below to create a new password:</p>

                                    <!-- Reset Button -->
                                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                                        <tr>
                                            <td align="center">
                                                <table cellpadding="0" cellspacing="0">
                                                    <tr>
                                                        <td style="background-color:#2563eb;border-radius:8px;">
                                                            <a href="{$resetUrl}" target="_blank"
                                                               style="display:inline-block;color:#ffffff;text-decoration:none;padding:16px 44px;font-size:16px;font-weight:600;letter-spacing:0.3px;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
                                                                Reset Password
                                                            </a>
                                                        </td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                    </table>

                                    <!-- Expiry Notice -->
                                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef3c7;border:1px solid #f59e0b;border-radius:12px;margin-bottom:20px;">
                                        <tr>
                                            <td style="padding:16px 20px;">
                                                <p style="color:#92400e;font-size:14px;font-weight:700;margin:0 0 6px;">&#9888; Important:</p>
                                                <p style="color:#92400e;font-size:13px;line-height:1.6;margin:0;">This password reset link is valid for <strong>60 minutes</strong>. If the link expires, you will need to request a new one.</p>
                                            </td>
                                        </tr>
                                    </table>

                                    <!-- Security Note -->
                                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;margin-bottom:24px;">
                                        <tr>
                                            <td style="padding:16px 20px;">
                                                <p style="color:#166534;font-size:14px;font-weight:700;margin:0 0 6px;">&#128274; Security Notice</p>
                                                <p style="color:#166534;font-size:13px;line-height:1.6;margin:0;">If you did not request a password reset, please ignore this email. Your password will remain unchanged. For any security concerns, contact our support team.</p>
                                            </td>
                                        </tr>
                                    </table>

                                    <p style="color:#9ca3af;font-size:13px;line-height:1.6;margin:0 0 4px;">This is an automated email from TechXaro PMS. Please do not reply to this email.</p>
                                </td>
                            </tr>

                            <!-- Divider -->
                            <tr>
                                <td style="padding:24px 34px 0;">
                                    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid #e5e7eb;"></td></tr></table>
                                </td>
                            </tr>

                            <!-- Signature -->
                            <tr>
                                <td style="padding:20px 34px 0;">
                                    <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">With Regards,<br><strong style="color:#111827;">TechXaro Pvt. Ltd.</strong><br>
                                    <a href="https://www.techxaro.com" style="color:#2563eb;text-decoration:none;">www.techxaro.com</a></p>
                                </td>
                            </tr>

                            <!-- Footer -->
                            <tr>
                                <td style="background-color:#f9fafb;padding:18px 34px;text-align:center;border-top:1px solid #e5e7eb;margin-top:20px;">
                                    <p style="color:#9ca3af;font-size:11px;margin:0;">&copy; {$year} TechXaro Pvt. Ltd. All rights reserved.</p>
                                </td>
                            </tr>

                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        HTML;
    }
}
