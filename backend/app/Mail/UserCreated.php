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
    public array $attachments;

    public function __construct(User $user, string $password, string $professionalEmail, string $professionalPassword, string $loginUrl, array $attachments = [])
    {
        $this->user = $user;
        $this->password = $password;
        $this->professionalEmail = $professionalEmail;
        $this->professionalPassword = $professionalPassword;
        $this->loginUrl = $loginUrl;
        $this->attachments = $attachments;
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

    public function build(): self
    {
        foreach ($this->attachments as $filePath) {
            if (file_exists($filePath)) {
                $this->attach($filePath);
            }
        }
        return $this;
    }

    private function buildAttachmentsSection(): string
    {
        if (empty($this->attachments)) {
            return '';
        }

        $labels = [
            'employment_contract' => 'Employment Contract',
            'offer_letter' => 'Offer Letter',
            'techxaro_regulations' => 'TechXaro Regulations',
            'latest_education_cert' => 'Latest Educational Certificate',
            'cv' => 'CV',
            'previous_exp_letter' => 'Previous Job Experience Letter',
            'previous_salary_slip' => 'Previous Salary Slip',
            'other_document' => 'Other Document',
        ];

        $items = '';
        foreach ($this->attachments as $filePath => $fieldName) {
            $label = $labels[$fieldName] ?? ucfirst(str_replace('_', ' ', $fieldName));
            $filename = basename($filePath);
            $items .= "<li><strong>" . e($label) . "</strong> &mdash; " . e($filename) . "</li>";
        }

        return <<<HTML
        <p style="color:#6b7280;font-size:14px;line-height:1.7;margin:0 0 8px;">Attached to this email, you will find the following documents:</p>
        <ul style="color:#6b7280;font-size:14px;line-height:1.8;margin:0 0 20px;padding-left:24px;">
            {$items}
        </ul>
        HTML;
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
                                                <strong>1.</strong> Your Employee Code is <strong>{$employeeCode}</strong>.
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="padding:10px 0;color:#111827;font-size:14px;line-height:1.7;vertical-align:top;">
                                                <strong>2.</strong> The invitation to join Slack has been shared on <a href="mailto:{$profEmail}" style="color:#2563eb;text-decoration:none;font-weight:600;">{$profEmail}</a>. Join the Slack workspace using the invitation address.
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="padding:10px 0;color:#111827;font-size:14px;line-height:1.7;vertical-align:top;">
                                                <strong>3.</strong> Create a Google Account and Chrome Profile on the same email <a href="mailto:{$profEmail}" style="color:#2563eb;text-decoration:none;font-weight:600;">{$profEmail}</a>.
                                            </td>
                                        </tr>
                                    </table>

                                    <!-- PMS Login Credentials Box -->
                                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#eff6ff;border:2px solid #3b82f6;border-radius:12px;margin-bottom:20px;">
                                        <tr>
                                            <td style="padding:6px 24px;background-color:#3b82f6;">
                                                <p style="color:#ffffff;font-size:14px;font-weight:700;margin:8px 0;">PMS LOGIN CREDENTIALS</p>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="padding:18px 24px;">
                                                <table width="100%" cellpadding="0" cellspacing="0">
                                                    <tr>
                                                        <td style="padding:5px 0;color:#6b7280;font-size:13px;font-weight:600;width:130px;">Website Link:</td>
                                                        <td style="padding:5px 0;"><a href="{$loginUrl}" style="color:#2563eb;text-decoration:none;font-size:14px;font-weight:600;">{$loginUrl}</a></td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding:5px 0;color:#6b7280;font-size:13px;font-weight:600;">Email:</td>
                                                        <td style="padding:5px 0;color:#111827;font-size:14px;font-weight:600;">{$profEmail}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding:5px 0;color:#6b7280;font-size:13px;font-weight:600;">Password:</td>
                                                        <td style="padding:5px 0;"><span style="font-family:monospace;background:#e5e7eb;padding:4px 10px;border-radius:6px;font-size:14px;color:#111827;">{$password}</span></td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                    </table>

                                    <!-- Outlook Login Credentials Box -->
                                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border:2px solid #22c55e;border-radius:12px;margin-bottom:24px;">
                                        <tr>
                                            <td style="padding:6px 24px;background-color:#22c55e;">
                                                <p style="color:#ffffff;font-size:14px;font-weight:700;margin:8px 0;">OUTLOOK / OFFICE 365 LOGIN CREDENTIALS</p>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td style="padding:18px 24px;">
                                                <table width="100%" cellpadding="0" cellspacing="0">
                                                    <tr>
                                                        <td style="padding:5px 0;color:#6b7280;font-size:13px;font-weight:600;width:130px;">Email:</td>
                                                        <td style="padding:5px 0;color:#111827;font-size:14px;font-weight:600;">{$profEmail}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding:5px 0;color:#6b7280;font-size:13px;font-weight:600;">Password:</td>
                                                        <td style="padding:5px 0;"><span style="font-family:monospace;background:#e5e7eb;padding:4px 10px;border-radius:6px;font-size:14px;color:#111827;">{$profPassword}</span></td>
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
                                                    <li><strong>PMS Password</strong> is for logging into the PMS platform only.</li>
                                                    <li><strong>Outlook Password</strong> is for accessing your official email on Outlook/Office 365.</li>
                                                </ul>
                                            </td>
                                        </tr>
                                    </table>

                                    <p style="color:#6b7280;font-size:14px;line-height:1.7;margin:0 0 8px;">If you face any issues while logging in, feel free to reach out to me.</p>

                                    {$this->buildAttachmentsSection()}

                                    <p style="color:#6b7280;font-size:14px;line-height:1.7;margin:0 0 20px;">Should you have any questions or need assistance, please get in touch with us.</p>

                                    <p style="color:#111827;font-size:15px;line-height:1.7;margin:0 0 24px;">Once again, welcome to TechXaro Pvt. Ltd. We are thrilled to have you as part of our team and look forward to achieving great things together.</p>

                                    <!-- Signature -->
                                    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;padding-top:20px;">
                                        <tr>
                                            <td style="padding:20px 0 0;">
                                                <p style="color:#111827;font-size:14px;line-height:1.6;margin:0 0 12px;">With Regards,<br><strong>Muhammad Ahsan</strong><br>HR | TechXaro Pvt Ltd</p>
                                                <table cellpadding="0" cellspacing="0" style="margin:0;">
                                                    <tr>
                                                        <td style="padding:3px 8px 3px 0;vertical-align:middle;">
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                                                        </td>
                                                        <td style="padding:3px 0;vertical-align:middle;"><a href="mailto:hr@techxaro.com" style="color:#2563eb;text-decoration:none;font-size:13px;">hr@techxaro.com</a></td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding:3px 8px 3px 0;vertical-align:middle;">
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                                                        </td>
                                                        <td style="padding:3px 0;vertical-align:middle;"><span style="color:#111827;font-size:13px;">0311-9121134</span></td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding:3px 8px 3px 0;vertical-align:middle;">
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                                                        </td>
                                                        <td style="padding:3px 0;vertical-align:middle;"><a href="https://www.techxaro.com" style="color:#2563eb;text-decoration:none;font-size:13px;">www.techxaro.com</a></td>
                                                    </tr>
                                                </table>
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
