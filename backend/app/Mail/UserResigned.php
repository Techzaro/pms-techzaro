<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Mailable sent to users when their account is marked as resigned.
 *
 * Notifies the user that their PMS access has been revoked.
 */
class UserResigned extends Mailable
{
    use Queueable, SerializesModels;

    /** @var \App\Models\User The user who was resigned */
    public User $user;

    /** @var string Name of the person who processed the resignation */
    public string $resignedBy;

    /** @var string Formatted date/time of the resignation */
    public string $resignationDate;

    /**
     * Create a new mail instance.
     *
     * @param \App\Models\User $user       The resigned user
     * @param string           $resignedBy Name of the admin who processed resignation
     */
    public function __construct(User $user, string $resignedBy)
    {
        $this->user = $user;
        $this->resignedBy = $resignedBy;
        $this->resignationDate = now()->format('F j, Y \a\t g:i A');
    }

    /**
     * Build the message envelope.
     *
     * @return \Illuminate\Mail\Mailables\Envelope
     */
    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Your PMS Account Has Been Resigned',
        );
    }

    /**
     * Define the message content using inline HTML.
     *
     * @return \Illuminate\Mail\Mailables\Content
     */
    public function content(): Content
    {
        return new Content(
            htmlString: $this->buildHtml(),
        );
    }

    /**
     * Build the full HTML email body.
     *
     * @return string Complete HTML document
     */
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
                        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
                            <tr>
                                <td style="background:linear-gradient(135deg,#dc2626,#b91c1c);padding:40px 30px;text-align:center;">
                                    <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;">Techxaro PMS</h1>
                                    <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Project Management System</p>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding:40px 30px;">
                                    <h2 style="color:#111827;margin:0 0 8px;font-size:22px;">Hello {$name},</h2>
                                    <p style="color:#6b7280;font-size:15px;line-height:1.7;margin:0 0 24px;">We are writing to inform you that your account on the <strong>Techxaro PMS</strong> system has been resigned effective immediately.</p>

                                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:12px;margin-bottom:24px;">
                                        <tr>
                                            <td style="padding:20px;">
                                                <table width="100%" cellpadding="0" cellspacing="0">
                                                    <tr>
                                                        <td style="padding:8px 0;color:#6b7280;font-size:13px;font-weight:600;width:160px;">Resigned By</td>
                                                        <td style="padding:8px 0;color:#111827;font-size:14px;">{$resignedBy}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding:8px 0;color:#6b7280;font-size:13px;font-weight:600;">Resignation Date</td>
                                                        <td style="padding:8px 0;color:#111827;font-size:14px;">{$resignationDate}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding:8px 0;color:#6b7280;font-size:13px;font-weight:600;">Status</td>
                                                        <td style="padding:8px 0;color:#dc2626;font-size:14px;font-weight:600;">Resigned</td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                    </table>

                                    <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 24px;">You will no longer be able to access the PMS system. If you believe this was done in error or have questions, please contact your administrator.</p>

                                    <p style="color:#6b7280;font-size:14px;margin:0;">Regards,<br><strong>PMS Team</strong></p>
                                </td>
                            </tr>
                            <tr>
                                <td style="background-color:#f9fafb;padding:20px 30px;text-align:center;border-top:1px solid #e5e7eb;">
                                    <p style="color:#9ca3af;font-size:12px;margin:0;">© 2026 Techxaro. All rights reserved.</p>
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
