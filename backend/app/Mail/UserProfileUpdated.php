<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Mailable sent to users when their profile is updated by an admin.
 *
 * Displays a table of changed fields with old and new values.
 */
class UserProfileUpdated extends Mailable
{
    use Queueable, SerializesModels;

    /** @var \App\Models\User The user whose profile was updated */
    public User $user;

    /** @var string Name of the person who made the update */
    public string $updatedBy;

    /** @var array<string, array{old: mixed, new: mixed}> Changed fields with old/new values */
    public array $changes;

    /**
     * Create a new mail instance.
     *
     * @param \App\Models\User $user      The affected user
     * @param string           $updatedBy Name of the admin who made changes
     * @param array            $changes   Array of changed fields with old/new values
     */
    public function __construct(User $user, string $updatedBy, array $changes)
    {
        $this->user = $user;
        $this->updatedBy = $updatedBy;
        $this->changes = $changes;
    }

    /**
     * Build the message envelope.
     *
     * @return \Illuminate\Mail\Mailables\Envelope
     */
    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Your PMS Profile Has Been Updated',
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
     * Map a database field name to a human-readable label.
     *
     * @param string $field Database column name
     *
     * @return string Display label
     */
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

    /**
     * Build the full HTML email body with change details table.
     *
     * @return string Complete HTML document
     */
    private function buildHtml(): string
    {
        $name = e($this->user->name);
        $updatedBy = e($this->updatedBy);
        $date = now()->format('F j, Y \a\t g:i A');

        // Build table rows for each changed field
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
                        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
                            <tr>
                                <td style="background:linear-gradient(135deg,#4f46e5,#6366f1);padding:40px 30px;text-align:center;">
                                    <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;">Techxaro PMS</h1>
                                    <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:14px;">Project Management System</p>
                                </td>
                            </tr>
                            <tr>
                                <td style="padding:40px 30px;">
                                    <h2 style="color:#111827;margin:0 0 8px;font-size:22px;">Hello {$name},</h2>
                                    <p style="color:#6b7280;font-size:15px;line-height:1.7;margin:0 0 24px;">Your profile on <strong>Techxaro PMS</strong> has been updated by <strong>{$updatedBy}</strong>. Below is a summary of the changes made.</p>

                                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;margin-bottom:24px;">
                                        <tr>
                                            <td style="padding:16px 20px;">
                                                <p style="color:#166534;font-size:14px;font-weight:600;margin:0;">{$count} field(s) updated on {$date}</p>
                                            </td>
                                        </tr>
                                    </table>

                                    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:24px;">
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

                                    <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 24px;">If you did not expect these changes or have any concerns, please contact your administrator immediately.</p>

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
