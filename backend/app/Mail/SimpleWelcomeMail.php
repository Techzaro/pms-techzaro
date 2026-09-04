<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class SimpleWelcomeMail extends Mailable
{
    use Queueable, SerializesModels;

    public User $user;
    public string $loginUrl;
    public string $orgName;

    public function __construct(User $user, string $loginUrl, string $orgName = '')
    {
        $this->user = $user;
        $this->loginUrl = $loginUrl;
        $this->orgName = $orgName ?: ($user->company_name ?? 'Our Organization');
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Welcome to ' . $this->orgName,
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
        $orgName = e($this->orgName);
        $loginUrl = e($this->loginUrl);

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
                                    <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">Welcome to {$orgName}</h1>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding:36px 34px;">
                                    <p style="color:#111827;font-size:15px;line-height:1.7;margin:0 0 12px;">Dear {$name},</p>
                                    <p style="color:#111827;font-size:15px;line-height:1.7;margin:0 0 12px;">You have been registered as a member of <strong>{$orgName}</strong>.</p>
                                    <p style="color:#111827;font-size:15px;line-height:1.7;margin:0 0 24px;">Please log in using the credentials provided by your administrator to get started.</p>
                                    <a href="{$loginUrl}" style="display:inline-block;background-color:#4f46e5;color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Login to Portal</a>
                                    <p style="color:#6b7280;font-size:14px;line-height:1.7;margin:24px 0 0;">If you have any questions, please contact your administrator.</p>
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
