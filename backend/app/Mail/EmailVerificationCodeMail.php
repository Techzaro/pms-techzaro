<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class EmailVerificationCodeMail extends Mailable
{
    use Queueable, SerializesModels;

    public User $user;
    public string $code;

    public function __construct(User $user, string $code)
    {
        $this->user = $user;
        $this->code = $code;
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Your Verification Code — ' . ($this->user->organization?->name ?? 'PMS'),
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
        $code = e($this->code);
        $orgName = e($this->user->organization?->name ?? 'PMS');

        return <<<HTML
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
        <body style="margin:0;padding:0;background-color:#f4f5f7;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 20px;">
                <tr>
                    <td align="center">
                        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
                            <tr>
                                <td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:36px 30px;text-align:center;">
                                    <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">Email Verification</h1>
                                    <p style="color:#c7d2fe;margin:8px 0 0;font-size:14px;">{$orgName}</p>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding:36px 34px;text-align:center;">
                                    <p style="color:#111827;font-size:15px;line-height:1.7;margin:0 0 16px;">Hi {$name},</p>
                                    <p style="color:#111827;font-size:15px;line-height:1.7;margin:0 0 24px;">Use the following code to verify your email address:</p>
                                    <div style="background-color:#f5f3ff;border:2px solid #7c3aed;border-radius:12px;padding:20px;margin:0 0 24px;">
                                        <span style="font-family:monospace;font-size:32px;font-weight:700;color:#4f46e5;letter-spacing:8px;">{$code}</span>
                                    </div>
                                    <p style="color:#6b7280;font-size:13px;margin:0 0 8px;">This code will expire in 15 minutes.</p>
                                    <p style="color:#6b7280;font-size:13px;margin:0;">If you did not request this, please ignore this email.</p>
                                </td>
                            </tr>
                            <tr>
                                <td style="background-color:#f9fafb;padding:18px 30px;text-align:center;border-top:1px solid #e5e7eb;">
                                    <p style="color:#9ca3af;font-size:12px;margin:0;">&copy; 2026 TechXaro Pvt. Ltd. All rights reserved.</p>
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
