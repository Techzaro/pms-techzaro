<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Storage;

class UserCreated extends Mailable
{
    use Queueable, SerializesModels;

    public User $user;
    public string $password;
    public string $professionalEmail;
    public string $professionalPassword;
    public string $loginUrl;
    public array $docAttachments;
    public bool $isAdminConfirmation;
    public string $createdBy;
    public string $senderEmail;
    public string $senderName;

    /** @var array Standard company documents (logo, QR, contract, offer, regulations) */
    private array $standardAttachments = [];

    /** @var array All attachments for admin (standard + uploaded) */
    private array $adminAttachments = [];

    /** @var array User-uploaded docs (Employment Contract, Offer Letter, Regulations) for personal email */
    private array $userDocAttachments = [];

    public function __construct(User $user, string $password, string $professionalEmail, string $professionalPassword, string $loginUrl, array $attachments = [], bool $isAdminConfirmation = false, string $createdBy = '', string $senderEmail = '', string $senderName = 'PMS Techxaro')
    {
        $this->user = $user;
        $this->password = $password;
        $this->professionalEmail = $professionalEmail;
        $this->professionalPassword = $professionalPassword;
        $this->loginUrl = $loginUrl;
        $this->docAttachments = $attachments;
        $this->isAdminConfirmation = $isAdminConfirmation;
        $this->createdBy = $createdBy;
        $this->senderEmail = $senderEmail ?: config('mail.from.address');
        $this->senderName = $senderName ?: config('mail.from.name');
    }

    /**
     * Resolve standard company documents and separate them from uploaded user documents.
     *
     * All arrays are normalized to [fieldName => fullDiskPath] format.
     * Standard docs: company logo, QR code, employment contract, offer letter, regulations.
     * User emails: ONLY standard docs attached.
     * Admin emails: standard docs + all uploaded user documents.
     */
    private function resolveAttachments(): void
    {
        $disk = config('company.disk', 'public');
        $uploadDir = config('company.upload_dir', 'company_docs');
        $validExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
        $singleTypes = ['company_logo', 'qr_code'];

        $allFiles = Storage::disk($disk)->files($uploadDir);
        $found = [];
        $otherDocFiles = [];
        foreach ($allFiles as $file) {
            $basename = basename($file);
            foreach ($singleTypes as $type) {
                foreach ($validExtensions as $ext) {
                    if ($basename === $type . '.' . $ext) {
                        $found[$type] = $file;
                    }
                }
            }
            if (str_starts_with($basename, 'other_document_')) {
                foreach ($validExtensions as $ext) {
                    if (str_ends_with($basename, '.' . $ext)) {
                        $otherDocFiles[] = $file;
                        break;
                    }
                }
            }
        }

        foreach ($found as $key => $path) {
            $this->standardAttachments[$key] = Storage::disk($disk)->path($path);
        }

        foreach ($otherDocFiles as $path) {
            $this->standardAttachments['other_document_' . basename($path)] = Storage::disk($disk)->path($path);
        }

        $normalizedUploaded = [];
        foreach ($this->docAttachments as $filePath => $fieldName) {
            if (is_string($filePath) && is_string($fieldName)) {
                $normalizedUploaded[$fieldName] = $filePath;
            } elseif (is_string($fieldName) && is_int($filePath)) {
                $normalizedUploaded[$fieldName] = $fieldName;
            }
        }

        $this->adminAttachments = array_merge($this->standardAttachments, $normalizedUploaded);

        $this->userDocAttachments = array_filter($normalizedUploaded, fn ($k) => in_array($k, ['employment_contract', 'offer_letter', 'techxaro_regulations']), ARRAY_FILTER_USE_KEY);
    }

    public function envelope(): Envelope
    {
        $subject = $this->isAdminConfirmation
            ? 'New PMS User Created — ' . $this->user->name
            : 'Welcome to TechXaro Pvt. Ltd. - ' . $this->user->name;

        return new Envelope(
            from: new \Illuminate\Mail\Mailables\Address($this->senderEmail, $this->senderName),
            subject: $subject,
        );
    }

    public function content(): Content
    {
        return new Content(
            htmlString: $this->buildHtml(),
        );
    }

    /**
     * Attach files to the email.
     *
     * User personal email: only the 5 standard company documents.
     * Admin/Manager email: standard documents + all uploaded user documents.
     */
    public function build(): self
    {
        $this->resolveAttachments();

        $attachmentsToUse = $this->isAdminConfirmation
            ? $this->adminAttachments
            : array_merge($this->standardAttachments, $this->userDocAttachments);

        foreach ($attachmentsToUse as $key => $filePath) {
            if (file_exists($filePath)) {
                $this->attach($filePath, [
                    'as' => basename($filePath),
                    'disposition' => 'attachment',
                ]);
            }
        }

        return $this;
    }

    /**
     * Get the attachment list for the email HTML section.
     * User sees only standard docs; admin sees everything.
     */
    private function getAttachmentsForHtml(): array
    {
        $labels = config('company.document_labels', []) + [
            'other_document' => 'Other Document',
        ];

        $source = $this->isAdminConfirmation
            ? $this->adminAttachments
            : array_merge($this->standardAttachments, $this->userDocAttachments);

        $result = [];
        foreach ($source as $key => $filePath) {
            $result[] = [
                'label' => $labels[$key] ?? ucfirst(str_replace('_', ' ', $key)),
                'filename' => basename($filePath),
            ];
        }

        return $result;
    }

    private function buildAttachmentsSection(): string
    {
        $items = $this->getAttachmentsForHtml();

        if (empty($items)) {
            return '';
        }

        $listHtml = '';
        foreach ($items as $item) {
            $listHtml .= "<li><strong>" . e($item['label']) . "</strong> &mdash; " . e($item['filename']) . "</li>";
        }

        return <<<HTML
        <p style="color:#6b7280;font-size:14px;line-height:1.7;margin:0 0 8px;">Attached to this email, you will find the following documents:</p>
        <ul style="color:#6b7280;font-size:14px;line-height:1.8;margin:0 0 20px;padding-left:24px;">
            {$listHtml}
        </ul>
        HTML;
    }

    private function buildHtml(): string
    {
        $name = e($this->user->name);
        $password = e($this->password);
        $loginUrl = e($this->loginUrl);
        $profEmail = e($this->professionalEmail);
        $profPassword = e($this->professionalPassword);
        $employeeCode = e($this->user->employee_code ?? 'N/A');
        $designation = e($this->user->designation ?? 'Team Member');

        $sharedCredentials = $this->buildCredentialsHtml($loginUrl, $profEmail, $password, $profPassword);
        $sharedSteps = $this->buildStepsHtml($profEmail, $employeeCode, $this->isAdminConfirmation);
        $sharedAttachments = $this->buildAttachmentsSection();

        if ($this->isAdminConfirmation) {
            return $this->buildAdminConfirmationHtml($name, $profEmail, $password, $loginUrl, $designation, $sharedCredentials, $sharedSteps, $sharedAttachments);
        }

        return $this->buildUserWelcomeHtml($name, $profEmail, $password, $loginUrl, $designation, $employeeCode, $sharedCredentials, $sharedSteps, $sharedAttachments);
    }

    private function buildCredentialsHtml(string $loginUrl, string $profEmail, string $password, string $profPassword): string
    {
        return <<<HTML
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
        HTML;
    }

    private function buildStepsHtml(string $profEmail, string $employeeCode, bool $isWelcome = false): string
    {
        $codeLabel = $isWelcome ? 'The Employee Code is' : 'Your Employee Code is';
        return <<<HTML
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                    <td style="padding:10px 0;color:#111827;font-size:14px;line-height:1.7;vertical-align:top;">
                        <strong>1.</strong> {$codeLabel} <strong>{$employeeCode}</strong>.
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
        HTML;
    }

    private function buildAdminConfirmationHtml(string $name, string $profEmail, string $password, string $loginUrl, string $designation, string $sharedCredentials, string $sharedSteps, string $sharedAttachments): string
    {
        $personalEmail = e($this->user->personal_email ?? 'N/A');
        $role = e(ucfirst($this->user->role ?? 'N/A'));
        $department = e($this->user->department ?? 'N/A');
        $createdBy = e($this->createdBy ?: 'N/A');
        $dateTime = e(now()->format('d M Y, h:i A'));

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
                                <td style="background:linear-gradient(135deg,#059669,#10b981);padding:36px 30px;text-align:center;">
                                    <table cellpadding="0" cellspacing="0" style="margin:0 auto 12px;">
                                        <tr>
                                            <td style="background-color:#ffffff;width:48px;height:48px;border-radius:50%;text-align:center;vertical-align:middle;">
                                                <span style="color:#059669;font-size:24px;font-weight:700;line-height:48px;">&#10003;</span>
                                            </td>
                                        </tr>
                                    </table>
                                    <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;">New PMS User Created Successfully</h1>
                                    <p style="color:#d1fae5;margin:8px 0 0;font-size:14px;">Confirmation for {$name}</p>
                                </td>
                            </tr>

                            <!-- Body -->
                            <tr>
                                <td style="padding:36px 34px;">

                                    <!-- Success Message -->
                                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;margin-bottom:28px;">
                                        <tr>
                                            <td style="padding:18px 24px;">
                                                <p style="color:#166534;font-size:15px;line-height:1.7;margin:0;font-weight:600;">You have successfully created a new PMS user.</p>
                                            </td>
                                        </tr>
                                    </table>

                                    <!-- User Summary -->
                                    <p style="color:#111827;font-size:15px;font-weight:600;margin:0 0 14px;">User Summary</p>
                                    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:28px;">
                                        <tr>
                                            <td style="background-color:#f9fafb;padding:10px 20px;border-bottom:1px solid #e5e7eb;width:170px;color:#6b7280;font-size:13px;font-weight:600;">User Name</td>
                                            <td style="background-color:#ffffff;padding:10px 20px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;font-weight:600;">{$name}</td>
                                        </tr>
                                        <tr>
                                            <td style="background-color:#f9fafb;padding:10px 20px;border-bottom:1px solid #e5e7eb;width:170px;color:#6b7280;font-size:13px;font-weight:600;">Professional Email</td>
                                            <td style="background-color:#ffffff;padding:10px 20px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;">{$profEmail}</td>
                                        </tr>
                                        <tr>
                                            <td style="background-color:#f9fafb;padding:10px 20px;border-bottom:1px solid #e5e7eb;width:170px;color:#6b7280;font-size:13px;font-weight:600;">Personal Email</td>
                                            <td style="background-color:#ffffff;padding:10px 20px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;">{$personalEmail}</td>
                                        </tr>
                                        <tr>
                                            <td style="background-color:#f9fafb;padding:10px 20px;border-bottom:1px solid #e5e7eb;width:170px;color:#6b7280;font-size:13px;font-weight:600;">Assigned Role</td>
                                            <td style="background-color:#ffffff;padding:10px 20px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;">{$role}</td>
                                        </tr>
                                        <tr>
                                            <td style="background-color:#f9fafb;padding:10px 20px;border-bottom:1px solid #e5e7eb;width:170px;color:#6b7280;font-size:13px;font-weight:600;">Department</td>
                                            <td style="background-color:#ffffff;padding:10px 20px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;">{$department}</td>
                                        </tr>
                                        <tr>
                                            <td style="background-color:#f9fafb;padding:10px 20px;border-bottom:1px solid #e5e7eb;width:170px;color:#6b7280;font-size:13px;font-weight:600;">Designation</td>
                                            <td style="background-color:#ffffff;padding:10px 20px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;">{$designation}</td>
                                        </tr>
                                        <tr>
                                            <td style="background-color:#f9fafb;padding:10px 20px;border-bottom:1px solid #e5e7eb;width:170px;color:#6b7280;font-size:13px;font-weight:600;">Temp. Login Password</td>
                                            <td style="background-color:#ffffff;padding:10px 20px;border-bottom:1px solid #e5e7eb;"><span style="font-family:monospace;background:#e5e7eb;padding:4px 10px;border-radius:6px;font-size:14px;color:#111827;">{$password}</span></td>
                                        </tr>
                                        <tr>
                                            <td style="background-color:#f9fafb;padding:10px 20px;border-bottom:1px solid #e5e7eb;width:170px;color:#6b7280;font-size:13px;font-weight:600;">Date &amp; Time</td>
                                            <td style="background-color:#ffffff;padding:10px 20px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;">{$dateTime}</td>
                                        </tr>
                                        <tr>
                                            <td style="background-color:#f9fafb;padding:10px 20px;width:170px;color:#6b7280;font-size:13px;font-weight:600;">Created By</td>
                                            <td style="background-color:#ffffff;padding:10px 20px;color:#111827;font-size:14px;font-weight:600;">{$createdBy}</td>
                                        </tr>
                                    </table>

                                    <!-- Steps -->
                                    <p style="color:#111827;font-size:15px;font-weight:600;margin:0 0 10px;">Next Steps</p>
                                    {$sharedSteps}

                                    <!-- Credentials -->
                                    {$sharedCredentials}

                                    <p style="color:#111827;font-size:15px;line-height:1.7;margin:0 0 20px;">The above credentials will be shared with the new user. Kindly ensure the account is activated after the user logs in.</p>

                                    <!-- Warning Box -->
                                    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fef3c7;border:1px solid #f59e0b;border-radius:12px;margin-bottom:24px;">
                                        <tr>
                                            <td style="padding:18px 24px;">
                                                <p style="color:#92400e;font-size:14px;font-weight:700;margin:0 0 8px;">&#9888; Important Notes:</p>
                                                <ul style="color:#92400e;font-size:14px;line-height:1.8;margin:0;padding-left:20px;">
                                                    <li><strong>PMS Password</strong> is for logging into the PMS platform only.</li>
                                                    <li><strong>Outlook Password</strong> is for accessing the official email on Outlook/Office 365.</li>
                                                    <li>The user will be required to change their password on first login.</li>
                                                </ul>
                                            </td>
                                        </tr>
                                    </table>

                                    {$sharedAttachments}

                                    <p style="color:#6b7280;font-size:14px;line-height:1.7;margin:0 0 20px;">If you have any questions or need to make changes to this user, please get in touch with us.</p>

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

    private function buildUserWelcomeHtml(string $name, string $profEmail, string $password, string $loginUrl, string $designation, string $employeeCode, string $sharedCredentials, string $sharedSteps, string $sharedAttachments): string
    {
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

                                    {$sharedSteps}

                                    {$sharedCredentials}

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

                                    {$sharedAttachments}

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
