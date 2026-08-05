<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class UserProfileUpdated extends Mailable
{
    use Queueable, SerializesModels;

    public User $user;
    public string $updatedBy;
    public array $changes;
    public string $senderEmail;
    public string $senderName;

    public function __construct(User $user, string $updatedBy, array $changes, string $senderEmail = '', string $senderName = 'PMS Techxaro')
    {
        $this->user = $user;
        $this->updatedBy = $updatedBy;
        $this->changes = $changes;
        $this->senderEmail = $senderEmail ?: config('mail.from.address');
        $this->senderName = $senderName ?: config('mail.from.name');
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            from: new \Illuminate\Mail\Mailables\Address($this->senderEmail, $this->senderName),
            subject: 'Your PMS Profile Has Been Updated',
        );
    }

    public function content(): Content
    {
        return new Content(
            htmlString: $this->buildHtml(),
        );
    }

    private function fieldLabel(string $field): string
    {
        $labels = [
            'name' => 'Full Name',
            'email' => 'Email Address',
            'role' => 'Role',
            'father_name' => 'Father Name',
            'id_card_number' => 'ID Card Number',
            'phone_number' => 'Phone Number',
            'present_address' => 'Present Address',
            'permanent_address' => 'Permanent Address',
            'emergency_contact_name' => 'Emergency Contact Name',
            'emergency_contact_relation' => 'Emergency Contact Relation',
            'emergency_contact_phone' => 'Emergency Contact Phone',
            'personal_email' => 'Personal Email',
            'professional_email' => 'Professional Email',
            'recovery_email' => 'Recovery Email',
            'department' => 'Department',
            'designation' => 'Designation',
            'hired_for' => 'Hired For',
            'employee_code' => 'Employee Code',
            'job_started_date' => 'Job Started Date',
            'job_ended_date' => 'Job Ended Date',
            'gross_salary' => 'Gross Salary',
            'applied_via' => 'Applied Via',
            'bank_name' => 'Bank Name',
            'bank_account_number' => 'Bank Account Number',
            'bank_account_title' => 'Bank Account Title',
        ];
        return $labels[$field] ?? ucwords(str_replace('_', ' ', $field));
    }

    private function buildHtml(): string
    {
        $name = e($this->user->name);
        $updatedBy = e($this->updatedBy);
        $date = now()->format('F j, Y \a\t g:i A');

        $rows = '';
        foreach ($this->changes as $field => $change) {
            $label = e($this->fieldLabel($field));
            $oldVal = e($change['old'] ?: '(empty)');
            $newVal = e($change['new'] ?: '(empty)');
            $rows .= <<<ROW
                            <tr>
                                <td style="padding:12px 16px;color:#6b7280;font-size:13px;font-weight:600;border-bottom:1px solid #f3f4f6;width:180px;">{$label}</td>
                                <td style="padding:12px 16px;color:#dc2626;font-size:13px;text-decoration:line-through;border-bottom:1px solid #f3f4f6;">{$oldVal}</td>
                                <td style="padding:12px 16px;color:#059669;font-size:13px;font-weight:600;border-bottom:1px solid #f3f4f6;">{$newVal}</td>
                            </tr>
ROW;
        }

        $count = count($this->changes);

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
                                <td style="background:linear-gradient(135deg,#1e3a5f,#2563eb);padding:32px 30px;text-align:center;">
                                    <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;">TechXaro PMS</h1>
                                    <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:13px;">Profile Update Notification</p>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding:28px 34px 0;">
                                    <table cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td style="background-color:#f0fdf4;border:1px solid #16a34a22;border-radius:20px;padding:5px 14px;">
                                                <span style="color:#16a34a;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Profile Updated</span>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding:20px 34px 0;">
                                    <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 6px;">Dear <strong style="color:#111827;">{$name}</strong>,</p>
                                    <p style="color:#374151;font-size:14px;line-height:1.7;margin:12px 0;">Your profile on <strong>TechXaro PMS</strong> has been updated by <strong>{$updatedBy}</strong>. Below is a summary of the changes made.</p>

                                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border-left:4px solid #16a34a;border-radius:0 8px 8px 0;margin:16px 0 20px;">
                                        <tr>
                                            <td style="padding:14px 18px;">
                                                <p style="color:#166534;font-size:13px;font-weight:600;margin:0;">{$count} field(s) updated on {$date}</p>
                                            </td>
                                        </tr>
                                    </table>

                                    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:20px;">
                                        <tr>
                                            <td style="background-color:#f9fafb;padding:12px 16px;border-bottom:2px solid #e5e7eb;">
                                                <table width="100%" cellpadding="0" cellspacing="0">
                                                    <tr>
                                                        <td style="color:#374151;font-size:13px;font-weight:700;width:180px;">Field</td>
                                                        <td style="color:#374151;font-size:13px;font-weight:700;">Old Value</td>
                                                        <td style="color:#374151;font-size:13px;font-weight:700;">New Value</td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>
                                                <table width="100%" cellpadding="0" cellspacing="0">
                                                    {$rows}
                                                </table>
                                            </td>
                                        </tr>
                                    </table>

                                    <p style="color:#9ca3af;font-size:13px;line-height:1.6;margin:0 0 4px;">If you did not expect these changes, please contact your administrator immediately.</p>
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
