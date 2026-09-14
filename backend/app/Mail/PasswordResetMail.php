<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Queue\SerializesModels;

class PasswordResetMail extends Mailable
{
    use Queueable, SerializesModels;

    public User $user;
    public string $resetUrl;
    public string $token;
    public string $senderEmail;
    public string $senderName;

    public function __construct(User $user, string $resetUrl, string $token, string $senderEmail = '', string $senderName = '')
    {
        $this->user = $user;
        $this->resetUrl = $resetUrl;
        $this->token = $token;
        $this->senderEmail = $senderEmail ?: config('mail.from.address');
        $this->senderName = $senderName ?: config('mail.from.name');
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            from: new Address($this->senderEmail, $this->senderName),
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

                            <!-- Body -->
                            <tr>
                                <td style="padding:30px 34px 0;">
                                    <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 6px;">Dear <strong>{$name}</strong>,</p>

                                    <p style="color:#374151;font-size:14px;line-height:1.7;margin:16px 0 20px;">A request was made to reset the password on your PMS account. To create a new password, please visit the link below:</p>

                                    <!-- Reset Link -->
                                    <p style="margin:0 0 24px;">
                                        <a href="{$resetUrl}" style="color:#2563eb;font-size:14px;text-decoration:underline;word-break:break-all;">{$resetUrl}</a>
                                    </p>

                                    <!-- Expiry Notice -->
                                    <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0 0 16px;">This link is valid for 60 minutes. If the link expires, you will need to request a new one.</p>

                                    <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0 0 4px;">If you did not request this, you can safely ignore this email.</p>
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
