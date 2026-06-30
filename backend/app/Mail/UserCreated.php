<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class UserCreated extends Mailable
{
    use Queueable, SerializesModels;

    public User $user;
    public string $password;
    public string $professionalEmail;
    public string $professionalPassword;
    public string $loginUrl;

    public function __construct(User $user, string $password, string $professionalEmail, string $professionalPassword, string $loginUrl)
    {
        $this->user = $user;
        $this->password = $password;
        $this->professionalEmail = $professionalEmail;
        $this->professionalPassword = $professionalPassword;
        $this->loginUrl = $loginUrl;
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Welcome to TechXaro Pvt. Ltd. - ' . $this->user->name,
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
        $email = e($this->user->email);
        $password = e($this->password);
        $loginUrl = e($this->loginUrl);
        $profEmail = e($this->professionalEmail);
        $profPassword = e($this->professionalPassword);
        $employeeCode = e($this->user->employee_code ?? 'N/A');
        $designation = e($this->user->designation ?? 'Team Member');
        $domain = e($this->loginUrl);

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
                                <td style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:36px 30px;text-align:center;">
                                    <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">Welcome to TechXaro Pvt. Ltd. - {$name}</h1>
                                </td>
                            </tr>

                            <!-- Body -->
                            <tr>
                                <td style="padding:36px 34px;">

                                    <p style="color:#111827;font-size:15px;line-height:1.7;margin:0 0 12px;">Dear {$name},</p>

                                    <p style="color:#111827;font-size:15px;line-height:1.7;margin:0 0 12px;">Welcome to <strong>TechXaro Pvt. Ltd.!</strong></p>

                                    <p style="color:#111827;font-size:15px;line-height:1.7;margin:0 0 6px;">We are excited to have you officially join our team as a <strong>{$designation}</strong>. We hope your first day will be informative and enjoyable.</p>

                                    <p style="color:#111827;font-size:15px;line-height:1.7;margin:20px 0 12px;font-weight:600;">Please note the following:</p>

                                    <!-- Steps Table -->
                                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                                        <tr>
                                            <td style="padding:10px 0;color:#111827;font-size:14px;line-height:1.7;vertical-align:top;">
                                                <strong>1.</strong> Your Employee Code is <strong>{$employeeCode}</strong>. Your professional email address in TechXaro Pvt Ltd is <a href="mailto:{$profEmail}" style="color:#2563eb;text-decoration:none;font-weight:600;">{$profEmail}</a>. Log in on <strong>outlook mail</strong> with the following password: <span style="font-family:monospace;background:#e5e7eb;padding:3px 8px;border-radius:4px;color:#dc2626;font-weight:600;">{$profPassword}</span> and change your password.
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="padding:10px 0;color:#111827;font-size:14px;line-height:1.7;vertical-align:top;">
                                                <strong>2.</strong> The invitation to join Slack has been shared on <a href="mailto:{$profEmail}" style="color:#2563eb;text-decoration:none;font-weight:600;">{$profEmail}</a>. Join the Slack workspace using the invitation <a href="mailto:{$profEmail}" style="color:#2563eb;text-decoration:none;font-weight:600;">{$profEmail}</a>. Address.
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="padding:10px 0;color:#111827;font-size:14px;line-height:1.7;vertical-align:top;">
                                                <strong>3.</strong> Create a Google Account and Chrome Profile on the same Email <a href="mailto:{$profEmail}" style="color:#2563eb;text-decoration:none;font-weight:600;">{$profEmail}</a>.
                                            </td>
                                        </tr>
                                    </table>

                                    <!-- Credentials Box -->
                                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f9ff;border:1px solid #bfdbfe;border-radius:12px;margin-bottom:24px;">
                                        <tr>
                                            <td style="padding:20px 24px;">
                                                <p style="color:#1e40af;font-size:15px;font-weight:700;margin:0 0 14px;">Please find below your login credentials for the PMS platform:</p>
                                                <table width="100%" cellpadding="0" cellspacing="0">
                                                    <tr>
                                                        <td style="padding:6px 0;color:#6b7280;font-size:13px;font-weight:600;width:120px;">Website Link:</td>
                                                        <td style="padding:6px 0;"><a href="{$loginUrl}" style="color:#2563eb;text-decoration:none;font-size:14px;font-weight:600;">{$loginUrl}</a></td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding:6px 0;color:#6b7280;font-size:13px;font-weight:600;">Username:</td>
                                                        <td style="padding:6px 0;color:#111827;font-size:14px;"><a href="mailto:{$email}" style="color:#2563eb;text-decoration:none;">{$email}</a></td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding:6px 0;color:#6b7280;font-size:13px;font-weight:600;">Password:</td>
                                                        <td style="padding:6px 0;"><span style="font-family:monospace;background:#e5e7eb;padding:4px 10px;border-radius:6px;font-size:14px;color:#111827;">{$password}</span></td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                    </table>

                                    <p style="color:#111827;font-size:15px;line-height:1.7;margin:0 0 20px;">Kindly log in and explore the platform.</p>

                                    <!-- Warning Box -->
                                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef3c7;border:1px solid #f59e0b;border-radius:12px;margin-bottom:24px;">
                                        <tr>
                                            <td style="padding:18px 24px;">
                                                <p style="color:#92400e;font-size:14px;font-weight:700;margin:0 0 8px;">&#9888; Note:</p>
                                                <ul style="color:#92400e;font-size:14px;line-height:1.8;margin:0;padding-left:20px;">
                                                    <li>Please do not share your credentials with anyone and change your password.</li>
                                                </ul>
                                            </td>
                                        </tr>
                                    </table>

                                    <p style="color:#6b7280;font-size:14px;line-height:1.7;margin:0 0 8px;">If you face any issues while logging in, feel free to reach out to me.</p>

                                    <p style="color:#6b7280;font-size:14px;line-height:1.7;margin:0 0 8px;">Attached to this email, you will find the following document:</p>

                                    <ul style="color:#6b7280;font-size:14px;line-height:1.8;margin:0 0 20px;padding-left:24px;">
                                        <li><strong>Signed Employment Contract</strong> &mdash; The copy of the contract you signed while joining TechXaro Pvt. Ltd.</li>
                                        <li><strong>Signed TechXaro Regulations</strong> &mdash; The copy of the TechXaro Regulations you signed while joining TechXaro Pvt. Ltd.</li>
                                    </ul>

                                    <p style="color:#6b7280;font-size:14px;line-height:1.7;margin:0 0 20px;">Should you have any questions or need assistance, please get in touch with us.</p>

                                    <p style="color:#111827;font-size:15px;line-height:1.7;margin:0 0 24px;">Once again, welcome to TechXaro Pvt. Ltd. We are thrilled to have you as part of our team and look forward to achieving great things together.</p>

                                    <!-- Signature -->
                                    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;padding-top:20px;">
                                        <tr>
                                            <td style="padding:20px 0 0;">
                                                <p style="color:#111827;font-size:14px;line-height:1.6;margin:0;">With Regards,<br><strong>Muhammad Arfan</strong><br>HR @ TechXaro Pvt. Ltd.<br>
                                                <a href="mailto:hr@techxaro.com" style="color:#2563eb;text-decoration:none;">hr@techxaro.com</a><br>
                                                0311-0121134<br>
                                                <a href="https://www.techxaro.com" style="color:#2563eb;text-decoration:none;">www.techxaro.com</a></p>
                                            </td>
                                        </tr>
                                    </table>

                                </td>
                            </tr>

                            <!-- Footer -->
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
