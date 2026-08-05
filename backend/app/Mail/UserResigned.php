<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class UserResigned extends Mailable
{
    use Queueable, SerializesModels;

    public User $user;
    public string $resignedBy;
    public string $resignationDate;
    public string $senderEmail;
    public string $senderName;

    public function __construct(User $user, string $resignedBy, string $senderEmail = '', string $senderName = 'PMS Techxaro')
    {
        $this->user = $user;
        $this->resignedBy = $resignedBy;
        $this->resignationDate = now()->format('F j, Y \a\t g:i A');
        $this->senderEmail = $senderEmail ?: config('mail.from.address');
        $this->senderName = $senderName ?: config('mail.from.name');
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            from: new \Illuminate\Mail\Mailables\Address($this->senderEmail, $this->senderName),
            subject: 'Your PMS Account Has Been Resigned',
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
        $resignedBy = e($this->resignedBy);
        $resignationDate = e($this->resignationDate);

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
                            <tr>
                                <td style="background:linear-gradient(135deg,#1e3a5f,#dc2626);padding:32px 30px;text-align:center;">
                                    <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;">TechXaro PMS</h1>
                                    <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px;">Account Resignation Notice</p>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding:28px 34px 0;">
                                    <table cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td style="background-color:#fef2f2;border:1px solid #dc262622;border-radius:20px;padding:5px 14px;">
                                                <span style="color:#dc2626;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Account Resigned</span>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding:20px 34px 0;">
                                    <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 6px;">Dear <strong style="color:#111827;">{$name}</strong>,</p>
                                    <p style="color:#374151;font-size:14px;line-height:1.7;margin:12px 0;">We are writing to inform you that your account on the <strong>TechXaro PMS</strong> system has been resigned effective immediately.</p>

                                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border-left:4px solid #dc2626;border-radius:0 8px 8px 0;margin:16px 0 20px;">
                                        <tr>
                                            <td style="padding:18px 20px;">
                                                <table width="100%" cellpadding="0" cellspacing="0">
                                                    <tr>
                                                        <td style="padding:6px 0;color:#6b7280;font-size:13px;font-weight:600;width:140px;">Resigned By</td>
                                                        <td style="padding:6px 0;color:#111827;font-size:14px;">{$resignedBy}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding:6px 0;color:#6b7280;font-size:13px;font-weight:600;">Date</td>
                                                        <td style="padding:6px 0;color:#111827;font-size:14px;">{$resignationDate}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding:6px 0;color:#6b7280;font-size:13px;font-weight:600;">Status</td>
                                                        <td style="padding:6px 0;"><span style="color:#dc2626;font-size:13px;font-weight:700;">Resigned</span></td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                    </table>

                                    <p style="color:#9ca3af;font-size:13px;line-height:1.6;margin:0 0 4px;">You will no longer be able to access the PMS system. If you believe this was done in error, please contact your administrator.</p>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding:24px 34px 0;">
                                    <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid #e5e7eb;"></td></tr></table>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding:20px 34px 0;">
                                    <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0;">With Regards,<br><strong style="color:#111827;">{{ config('app.name', 'PMS') }}</strong><br><a href="{{ config('app.url') }}" style="color:#2563eb;text-decoration:none;">{{ config('app.url') }}</a></p>
                                </td>
                            </tr>
                            <tr>
                                <td style="background-color:#f9fafb;padding:18px 34px;text-align:center;border-top:1px solid #e5e7eb;margin-top:20px;">
                                    <p style="color:#9ca3af;font-size:11px;margin:0;">&copy; 2026 TechXaro Pvt. Ltd. All rights reserved.</p>
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
