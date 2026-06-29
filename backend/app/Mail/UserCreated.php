<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Mailable sent to newly created users with their account credentials.
 *
 * Contains the user's login details, platform URL, and security notices.
 */
class UserCreated extends Mailable
{
    use Queueable, SerializesModels;

    /** @var \App\Models\User The newly created user */
    public User $user;

    /** @var string The user's initial password */
    public string $password;

    /** @var string The platform login URL */
    public string $loginUrl;

    /**
     * Create a new mail instance.
     *
     * @param \App\Models\User $user      The new user
     * @param string           $password  Initial account password
     * @param string           $loginUrl  Platform login URL
     */
    public function __construct(User $user, string $password, string $loginUrl)
    {
        $this->user = $user;
        $this->password = $password;
        $this->loginUrl = $loginUrl;
    }

    /**
     * Build the message envelope.
     *
     * @return \Illuminate\Mail\Mailables\Envelope
     */
    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Your PMS TechXaro Account Has Been Created',
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
        $email = e($this->user->email);
        $password = e($this->password);
        $loginUrl = e($this->loginUrl);

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
                                <td style="background:linear-gradient(135deg,#4f46e5,#2563eb);padding:40px 30px;text-align:center;">
                                    <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;">Techxaro PMS</h1>
                                    <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Project Management System</p>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding:40px 30px;">
                                    <p style="color:#111827;font-size:15px;line-height:1.7;margin:0 0 16px;">Dear {$name},</p>

                                    <p style="color:#111827;font-size:15px;line-height:1.7;margin:0 0 16px;">Welcome to <strong>PMS TechXaro</strong>.</p>

                                    <p style="color:#111827;font-size:15px;line-height:1.7;margin:0 0 24px;">Your account has been successfully created. Please find your login details below:</p>

                                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:24px;">
                                        <tr>
                                            <td style="padding:20px;">
                                                <table width="100%" cellpadding="0" cellspacing="0">
                                                    <tr>
                                                        <td style="padding:8px 0;color:#6b7280;font-size:13px;font-weight:600;width:140px;">Platform Name</td>
                                                        <td style="padding:8px 0;color:#111827;font-size:14px;">PMS TechXaro</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding:8px 0;color:#6b7280;font-size:13px;font-weight:600;">Platform Link</td>
                                                        <td style="padding:8px 0;color:#111827;font-size:14px;"><a href="{$loginUrl}" style="color:#2563eb;text-decoration:none;">{$loginUrl}</a></td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding:8px 0;color:#6b7280;font-size:13px;font-weight:600;">Username</td>
                                                        <td style="padding:8px 0;color:#111827;font-size:14px;">{$email}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding:8px 0;color:#6b7280;font-size:13px;font-weight:600;">Password</td>
                                                        <td style="padding:8px 0;color:#111827;font-size:14px;font-family:monospace;background:#e5e7eb;padding:6px 12px;border-radius:6px;display:inline-block;">{$password}</td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                    </table>

                                    <p style="color:#111827;font-size:15px;line-height:1.7;margin:0 0 16px;">Kindly log in to the platform and familiarize yourself with its features and functionalities.</p>

                                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef3c7;border:1px solid #f59e0b;border-radius:12px;margin-bottom:24px;">
                                        <tr>
                                            <td style="padding:20px;">
                                                <p style="color:#92400e;font-size:14px;font-weight:700;margin:0 0 8px;">&#9888; Important Security Notice:</p>
                                                <ul style="color:#92400e;font-size:14px;line-height:1.8;margin:0;padding-left:20px;">
                                                    <li>Do not share your login credentials with anyone.</li>
                                                    <li>We strongly recommend changing your password after your first login.</li>
                                                    <li>You are responsible for maintaining the confidentiality of your account.</li>
                                                </ul>
                                            </td>
                                        </tr>
                                    </table>

                                    <p style="color:#6b7280;font-size:14px;line-height:1.7;margin:0 0 24px;">If you experience any issues accessing the platform or have any questions, please contact the HR Department or your reporting manager for assistance.</p>

                                    <p style="color:#111827;font-size:15px;line-height:1.7;margin:0 0 24px;">We wish you a productive experience with PMS TechXaro.</p>

                                    <p style="color:#6b7280;font-size:14px;margin:0;">Best Regards,<br><strong>TechXaro Pvt. Ltd.</strong></p>
                                </td>
                            </tr>
                            <tr>
                                <td style="background-color:#f9fafb;padding:20px 30px;text-align:center;border-top:1px solid #e5e7eb;">
                                    <p style="color:#9ca3af;font-size:12px;margin:0;">&copy; 2026 Techxaro. All rights reserved.</p>
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
