<?php

namespace App\Http\Controllers;

use App\Models\HrmEsignDocument;
use App\Models\HrmEsignEnvelope;
use App\Models\HrmEsignTemplate;
use App\Models\HrmEsignToken;
use App\Services\HrmEsignAuditService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class HrmEsignController extends Controller
{
    public function __construct(private HrmEsignAuditService $audit) {}

    private function ensureTemplatesTableExists(): void
    {
        if (!Schema::hasTable('hrm_esign_templates')) {
            Schema::create('hrm_esign_templates', function (Blueprint $table) {
                $table->id();
                $table->string('title');
                $table->string('type')->default('custom');
                $table->string('required_action')->default('sign');
                $table->longText('content');
                $table->boolean('is_active')->default(true);
                $table->boolean('is_default')->default(false);
                $table->unsignedBigInteger('created_by')->nullable();
                $table->timestamps();
            });

            HrmEsignTemplate::create([
                'title' => 'Rules and Regulations',
                'type' => 'rules',
                'required_action' => 'acknowledge',
                'content' => "RULES AND REGULATIONS\n\nDear Team Member / Candidate ({candidateName}, CNIC: {candidateId}),\n\nWelcome to {orgName}. As a company committed to excellence and integrity, we have established the following policies, procedures, and code of conduct...",
                'is_active' => true,
                'is_default' => true,
            ]);
            HrmEsignTemplate::create([
                'title' => 'Formal Offer of Employment',
                'type' => 'offer',
                'required_action' => 'sign',
                'content' => "{jobTitle} CONTRACT & FORMAL OFFER LETTER\n\nThis Agreement is made between {orgName} and {candidateName} (CNIC: {candidateId})...",
                'is_active' => true,
                'is_default' => true,
            ]);
            HrmEsignTemplate::create([
                'title' => 'Master Employment Agreement',
                'type' => 'contract',
                'required_action' => 'sign',
                'content' => "MASTER EMPLOYMENT AGREEMENT\n\nThis Agreement is executed between {orgName} and {candidateName} (CNIC: {candidateId})...",
                'is_active' => true,
                'is_default' => true,
            ]);
        }
    }

    public function index(Request $request)
    {
        $query = HrmEsignEnvelope::with('documents:id,envelope_id,type,title,required_action,status,signed_at,acknowledged_at');

        if ($search = trim((string) $request->query('q'))) {
            $query->where(function ($q) use ($search) {
                $q->where('candidate_name', 'like', "%{$search}%")
                  ->orWhere('candidate_email', 'like', "%{$search}%")
                  ->orWhere('reference', 'like', "%{$search}%")
                  ->orWhere('job_title', 'like', "%{$search}%");
            });
        }

        $status = trim((string) $request->query('status'));

        if ($status && $status !== 'all') {
            $query->where('status', $status);
        }

        return $query->latest()->paginate(20);
    }

    public function getTemplates()
    {
        $this->ensureTemplatesTableExists();
        $templates = HrmEsignTemplate::orderBy('type')->orderBy('title')->get();
        return response()->json($templates);
    }

    public function storeTemplate(Request $request)
    {
        $this->ensureTemplatesTableExists();

        $data = $request->validate([
            'title' => 'required|string|max:180',
            'type' => 'required|string|max:80',
            'required_action' => 'required|string|in:sign,acknowledge',
            'content' => 'required|string|max:200000',
        ]);

        $template = HrmEsignTemplate::create([
            'title' => $data['title'],
            'type' => Str::slug($data['type'], '_'),
            'required_action' => $data['required_action'],
            'content' => $data['content'],
            'is_active' => true,
            'created_by' => $request->user()->id,
        ]);

        return response()->json($template, 201);
    }

    public function updateTemplate(Request $request, $id)
    {
        $this->ensureTemplatesTableExists();
        $template = HrmEsignTemplate::findOrFail($id);

        $data = $request->validate([
            'title' => 'sometimes|required|string|max:180',
            'type' => 'sometimes|required|string|max:80',
            'required_action' => 'sometimes|required|string|in:sign,acknowledge',
            'content' => 'sometimes|required|string|max:200000',
            'is_active' => 'sometimes|boolean',
        ]);

        if (isset($data['type'])) {
            $data['type'] = Str::slug($data['type'], '_');
        }

        $template->update($data);

        return response()->json($template);
    }

    public function destroyTemplate(Request $request, $id)
    {
        $this->ensureTemplatesTableExists();
        $template = HrmEsignTemplate::find($id);

        if ($template) {
            $template->delete();
        }

        return response()->json([
            'success' => true,
            'message' => 'Template deleted successfully.',
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'candidateName' => 'required|string|max:150',
            'candidateEmail' => 'required|email:rfc|max:190',
            'candidateId' => 'nullable|string|max:100',
            'jobTitle' => 'required|string|max:150',
            'department' => 'nullable|string|max:150',
            'employmentType' => 'required|string|max:80',
            'baseSalary' => 'nullable|numeric|min:0|max:999999999999',
            'currency' => 'required|string|max:8',
            'startDate' => 'nullable|date',
            'expiresAt' => 'required|date|after:today',
            'documents' => 'required|array|min:1',
            'documents.*.type' => 'required|string|max:80',
            'documents.*.title' => 'required|string|max:180',
            'documents.*.content' => 'required|string|max:200000',
            'documents.*.required_action' => 'nullable|string|in:sign,acknowledge',
        ]);

        $envelope = DB::transaction(function () use ($data, $request) {
            $envelope = HrmEsignEnvelope::create([
                'reference' => 'ES-' . now()->format('Ym') . '-' . strtoupper(Str::random(8)),
                'candidate_name' => $data['candidateName'],
                'candidate_email' => strtolower($data['candidateEmail']),
                'candidate_id' => $data['candidateId'] ?? null,
                'job_title' => $data['jobTitle'],
                'department' => $data['department'] ?? null,
                'employment_type' => $data['employmentType'],
                'base_salary' => $data['baseSalary'] ?? null,
                'currency' => strtoupper($data['currency']),
                'start_date' => $data['startDate'] ?? null,
                'expires_at' => $data['expiresAt'],
                'status' => 'draft',
                'created_by' => $request->user()->id,
            ]);

            foreach ($data['documents'] as $idx => $doc) {
                $action = $doc['required_action'] ?? ($doc['type'] === 'rules' ? 'acknowledge' : 'sign');
                $typeKey = Str::slug($doc['type'], '_') . '_' . ($idx + 1);

                HrmEsignDocument::create([
                    'envelope_id' => $envelope->id,
                    'type' => $typeKey,
                    'title' => $doc['title'],
                    'required_action' => $action,
                    'content' => $doc['content'],
                    'content_hash' => hash('sha256', $doc['content']),
                    'status' => 'pending',
                ]);
            }
            $this->audit->record($envelope, 'created', $request, ['reference' => $envelope->reference]);
            return $envelope;
        });

        return response()->json($envelope->load('documents'), 201);
    }

    public function show(HrmEsignEnvelope $envelope)
    {
        return $envelope->load(['documents', 'events' => fn ($q) => $q->latest('id')]);
    }

    public function update(Request $request, HrmEsignEnvelope $envelope)
    {
        abort_if(in_array($envelope->status, ['voided', 'completed'], true), 409, 'Completed or voided envelopes cannot be updated.');

        $data = $request->validate([
            'candidateName' => 'sometimes|required|string|max:150',
            'candidateEmail' => 'sometimes|required|email:rfc|max:190',
            'candidateId' => 'nullable|string|max:100',
            'jobTitle' => 'sometimes|required|string|max:150',
            'department' => 'nullable|string|max:150',
            'employmentType' => 'sometimes|required|string|max:80',
            'baseSalary' => 'nullable|numeric|min:0|max:999999999999',
            'currency' => 'sometimes|required|string|max:8',
            'startDate' => 'nullable|date',
            'expiresAt' => 'sometimes|required|date',
            'documents' => 'sometimes|array|min:1',
            'documents.*.type' => 'required|string|max:80',
            'documents.*.title' => 'required|string|max:180',
            'documents.*.content' => 'required|string|max:200000',
            'documents.*.required_action' => 'nullable|string|in:sign,acknowledge',
        ]);

        DB::transaction(function () use ($data, $envelope, $request) {
            $envelopeData = [];
            if (isset($data['candidateName'])) $envelopeData['candidate_name'] = $data['candidateName'];
            if (isset($data['candidateEmail'])) $envelopeData['candidate_email'] = strtolower($data['candidateEmail']);
            if (array_key_exists('candidateId', $data)) $envelopeData['candidate_id'] = $data['candidateId'];
            if (isset($data['jobTitle'])) $envelopeData['job_title'] = $data['jobTitle'];
            if (array_key_exists('department', $data)) $envelopeData['department'] = $data['department'];
            if (isset($data['employmentType'])) $envelopeData['employment_type'] = $data['employmentType'];
            if (array_key_exists('baseSalary', $data)) $envelopeData['base_salary'] = $data['baseSalary'];
            if (isset($data['currency'])) $envelopeData['currency'] = strtoupper($data['currency']);
            if (array_key_exists('startDate', $data)) $envelopeData['start_date'] = $data['startDate'];
            if (isset($data['expiresAt'])) $envelopeData['expires_at'] = $data['expiresAt'];

            if (!empty($envelopeData)) {
                $envelope->update($envelopeData);
            }

            if (isset($data['documents'])) {
                $envelope->documents()->delete();
                foreach ($data['documents'] as $idx => $doc) {
                    $action = $doc['required_action'] ?? ($doc['type'] === 'rules' ? 'acknowledge' : 'sign');
                    $typeKey = Str::slug($doc['type'], '_') . '_' . ($idx + 1);

                    HrmEsignDocument::create([
                        'envelope_id' => $envelope->id,
                        'type' => $typeKey,
                        'title' => $doc['title'],
                        'required_action' => $action,
                        'content' => $doc['content'],
                        'content_hash' => hash('sha256', $doc['content']),
                        'status' => 'pending',
                    ]);
                }
            }

            $this->audit->record($envelope, 'updated', $request, ['candidate_id' => $envelope->candidate_id]);
        });

        return response()->json($envelope->load('documents'));
    }

    public function send(Request $request, HrmEsignEnvelope $envelope)
    {
        abort_if(in_array($envelope->status, ['voided', 'completed'], true), 409, 'Completed or voided envelopes cannot be sent.');
        $plainToken = Str::random(64);
        $expiresCarbon = \Carbon\Carbon::parse($envelope->expires_at);

        DB::transaction(function () use ($request, $envelope, $plainToken, $expiresCarbon) {
            HrmEsignToken::where('envelope_id', $envelope->id)->update(['revoked_at' => now()]);
            HrmEsignToken::create([
                'envelope_id' => $envelope->id,
                'token_hash' => hash('sha256', $plainToken),
                'expires_at' => $expiresCarbon->copy()->endOfDay(),
            ]);
            if ($envelope->status === 'draft') {
                $envelope->update(['status' => 'sent', 'sent_at' => now()]);
            }
            $this->audit->record($envelope, 'sent', $request, ['recipient' => $envelope->candidate_email]);
        });

        $organization = $request->attributes->get('currentOrganization');
        $slug = $organization?->slug ?: $request->header('X-Tenant-ID') ?: 'main';
        
        $baseUrl = config('app.frontend_url')
            ?: (env('FRONTEND_URL') && env('FRONTEND_URL') !== 'http://localhost:5173' ? env('FRONTEND_URL') : null)
            ?: $request->header('Origin')
            ?: $request->schemeAndHttpHost();
        $baseUrl = rtrim($baseUrl, '/');

        $signingUrl = "{$baseUrl}/esign/{$slug}/{$plainToken}";
        $emailSent = true;

        try {
            $organizationName = ($organization?->settings['org_name'] ?? null) ?: ($organization?->name ?? config('app.name'));
            $fromAddress = $this->mailFromAddress();
            $expiresFormatted = $expiresCarbon->format('F j, Y');
            $htmlBody = $this->buildPackageDispatchHtml($envelope, $signingUrl, $organizationName, $expiresFormatted);

            Mail::html($htmlBody, function ($mail) use ($envelope, $organizationName, $fromAddress) {
                if (filter_var($fromAddress, FILTER_VALIDATE_EMAIL)) {
                    $mail->from($fromAddress, $organizationName);
                }
                $mail->to($envelope->candidate_email)
                    ->subject("Action Required: Employment Agreement Package - {$envelope->job_title}");
            });
        } catch (\Throwable $e) {
            report($e);
            \Illuminate\Support\Facades\Log::error("E-Sign Email Dispatch Failed for candidate {$envelope->candidate_email}: " . $e->getMessage(), [
                'exception' => $e,
            ]);
            $emailSent = false;
        }

        return response()->json([
            'message' => $emailSent ? 'Envelope securely sent.' : 'Envelope prepared, but email delivery failed. Copy the secure link manually.',
            'emailSent' => $emailSent,
            'signingUrl' => $signingUrl,
        ]);
    }

    public function void(Request $request, HrmEsignEnvelope $envelope)
    {
        abort_if(in_array($envelope->status, ['completed', 'voided'], true), 409, 'Envelope is already completed or voided.');

        DB::transaction(function () use ($request, $envelope) {
            $envelope->update(['status' => 'voided', 'voided_at' => now()]);
            HrmEsignToken::where('envelope_id', $envelope->id)->update(['revoked_at' => now()]);
            $this->audit->record($envelope, 'voided', $request, ['reason' => $request->input('reason', 'Voided by staff')]);
        });

        return response()->json(['message' => 'Envelope voided successfully. Access has been revoked.']);
    }

    public function publicShow(Request $request, string $slugOrToken, ?string $token = null)
    {
        $effectiveToken = $token ?: $slugOrToken;
        $record = $this->validToken($effectiveToken);
        $envelope = HrmEsignEnvelope::with('documents')->findOrFail($record->envelope_id);

        abort_if(in_array($envelope->status, ['draft', 'voided'], true), 409, 'Envelope is not available.');
        abort_if(\Carbon\Carbon::parse($envelope->expires_at)->endOfDay()->isPast(), 410, 'Envelope has expired.');

        $record->update(['last_used_at' => now()]);

        if (!$envelope->viewed_at && $envelope->status === 'sent') {
            $envelope->update(['status' => 'viewed', 'viewed_at' => now()]);
            $this->audit->record($envelope, 'viewed', $request, [], 'candidate');
        }

        $organization = $request->attributes->get('currentOrganization');
        $settings = $organization?->settings ?? [];
        $logoUrl = null;
        if ($organization?->logo_path && Storage::disk('public')->exists($organization->logo_path)) {
            $logoUrl = Storage::disk('public')->url($organization->logo_path);
        }

        $hasActiveOtp = !empty($record->otp_hash) && $record->otp_expires_at && $record->otp_expires_at->isFuture();

        return response()->json([
            'envelope' => $envelope,
            'consentVersion' => '2026-08-23',
            'hasActiveOtp' => $hasActiveOtp,
            'alreadyCompleted' => $envelope->status === 'completed',
            'maskedEmail' => $this->maskEmail($envelope->candidate_email),
            'branding' => [
                'organizationName' => $settings['org_name'] ?? $organization?->name ?? 'Organization',
                'subtitle' => $settings['subtitle'] ?? 'Human Resources',
                'logoUrl' => $logoUrl,
            ],
        ]);
    }

    public function sign(Request $request, string $slugOrToken, ?string $token = null)
    {
        $effectiveToken = $token ?: $slugOrToken;
        $record = $this->validToken($effectiveToken);
        $envelope = HrmEsignEnvelope::with('documents')->findOrFail($record->envelope_id);

        abort_if(\Carbon\Carbon::parse($envelope->expires_at)->endOfDay()->isPast(), 410, 'Envelope has expired.');
        abort_if(in_array($envelope->status, ['draft', 'voided', 'completed'], true), 409, 'Envelope cannot be signed.');

        $data = $request->validate([
            'consent' => 'accepted',
            'consentVersion' => 'required|in:2026-08-23',
            'signatureMethod' => ['required', Rule::in(['typed', 'drawn', 'uploaded', 'thumb'])],
            'signatureValue' => 'required|string|max:5000000',
            'legalName' => 'required|string|max:150',
            'rulesAcknowledged' => 'accepted',
            'otp' => 'required|digits:6',
        ]);

        abort_if($record->otp_attempts >= 5, 429, 'Too many verification attempts. Request a new signing link from HR.');
        if (!$record->otp_hash || !$record->otp_expires_at || $record->otp_expires_at->isPast()
            || !hash_equals($record->otp_hash, hash_hmac('sha256', $data['otp'], config('app.key')))) {
            $record->increment('otp_attempts');
            return response()->json(['message' => 'The verification code is invalid or expired.'], 422);
        }

        if (mb_strtolower(trim($data['legalName'])) !== mb_strtolower(trim($envelope->candidate_name))) {
            return response()->json(['message' => 'Legal name must match the named recipient.'], 422);
        }
        if ($data['signatureMethod'] === 'typed' && mb_strtolower(trim($data['legalName'])) !== mb_strtolower(trim($data['signatureValue']))) {
            return response()->json(['message' => 'Typed signature must match the confirmed legal name.'], 422);
        }
        if (in_array($data['signatureMethod'], ['drawn', 'uploaded', 'thumb'], true)) {
            if (!str_starts_with($data['signatureValue'], 'data:image/')) {
                return response()->json(['message' => 'Signature image data format is invalid.'], 422);
            }
        }

        DB::transaction(function () use ($request, $envelope, $record, $data) {
            $lockedEnvelope = HrmEsignEnvelope::where('id', $envelope->id)->lockForUpdate()->firstOrFail();
            abort_if(in_array($lockedEnvelope->status, ['draft', 'voided', 'completed'], true), 409, 'Envelope cannot be signed.');

            $now = now();
            foreach ($lockedEnvelope->documents as $doc) {
                $values = ['status' => 'completed'];
                if ($doc->required_action === 'acknowledge') {
                    $values['acknowledged_at'] = $now;
                } else {
                    $values += [
                        'signed_at' => $now,
                        'signature_method' => $data['signatureMethod'],
                        'signature_value' => $data['signatureValue'],
                    ];
                }
                $values['completed_hash'] = hash('sha256', $doc->content_hash . '|' . $data['legalName'] . '|' . $now->toISOString());
                $doc->update($values);
            }
            $evidence = hash_hmac('sha256', $lockedEnvelope->id . '|' . $data['legalName'] . '|' . $now->toISOString(), config('app.key'));
            $lockedEnvelope->update(['status' => 'completed', 'completed_at' => $now, 'evidence_hash' => $evidence]);
            $record->update(['revoked_at' => $now]);
            $this->audit->record($lockedEnvelope, 'completed', $request, [
                'legal_name' => $data['legalName'],
                'signature_method' => $data['signatureMethod'],
                'consent_version' => $data['consentVersion'],
                'document_hashes' => $lockedEnvelope->documents->pluck('content_hash', 'type')->all(),
            ], 'candidate');
        });

        try {
            $slug = $request->attributes->get('currentOrganization')?->slug;
            $signingUrl = rtrim(config('app.frontend_url', env('FRONTEND_URL', 'http://localhost:5173')), '/') . "/esign/{$slug}/{$token}";
            $organization = $request->attributes->get('currentOrganization');
            $organizationName = ($organization?->settings['org_name'] ?? null) ?: ($organization?->name ?? config('app.name', 'Organization'));
            $fromAddress = $this->mailFromAddress();
            $htmlBody = $this->buildExecutedPackageHtml($envelope, $signingUrl, $organizationName);

            Mail::html($htmlBody, function ($mail) use ($envelope, $organizationName, $fromAddress) {
                if (filter_var($fromAddress, FILTER_VALIDATE_EMAIL)) {
                    $mail->from($fromAddress, $organizationName);
                }
                $mail->to($envelope->candidate_email)
                    ->subject("Executed Employment Package: {$envelope->job_title} ({$envelope->reference})");
            });
        } catch (\Throwable $e) {
            report($e);
        }

        return response()->json(['message' => 'Employment package signed successfully.', 'reference' => $envelope->reference]);
    }

    public function requestOtp(Request $request, string $slugOrToken, ?string $token = null)
    {
        $effectiveToken = $token ?: $slugOrToken;
        $record = $this->validToken($effectiveToken);
        $envelope = HrmEsignEnvelope::findOrFail($record->envelope_id);
        abort_if(\Carbon\Carbon::parse($envelope->expires_at)->endOfDay()->isPast() || in_array($envelope->status, ['draft', 'voided', 'completed'], true), 410, 'Envelope is unavailable.');

        $otp = (string) random_int(100000, 999999);
        $organization = $request->attributes->get('currentOrganization');
        $organizationName = ($organization?->settings['org_name'] ?? null) ?: ($organization?->name ?? config('app.name'));
        $fromAddress = $this->mailFromAddress();
        try {
            $htmlBody = $this->buildOtpEmailHtml($otp, $organizationName);
            Mail::html($htmlBody, function ($mail) use ($envelope, $organizationName, $fromAddress) {
                if (filter_var($fromAddress, FILTER_VALIDATE_EMAIL)) {
                    $mail->from($fromAddress, $organizationName);
                }
                $mail->to($envelope->candidate_email)
                    ->subject("{$organizationName} Security Verification Code");
            });
        } catch (\Throwable $exception) {
            report($exception);
            return response()->json([
                'message' => 'We could not deliver the verification email. Please ask HR to verify the organization mail settings and try again.',
            ], 503);
        }

        $record->update([
            'otp_hash' => hash_hmac('sha256', $otp, config('app.key')),
            'otp_expires_at' => now()->addMinutes(10),
            'otp_attempts' => 0,
            'identity_verified_at' => null,
        ]);
        $this->audit->record($envelope, 'otp_sent', $request, [], 'candidate');

        return response()->json([
            'message' => "A 6-digit verification code was sent to candidate email ({$this->maskEmail($envelope->candidate_email)}).",
            'expiresAt' => now()->addMinutes(10)->toIso8601String(),
        ]);
    }

    private function maskEmail(string $email): string
    {
        [$name, $domain] = array_pad(explode('@', $email, 2), 2, '');
        return substr($name, 0, min(2, strlen($name))) . str_repeat('*', max(2, strlen($name) - 2)) . '@' . $domain;
    }

    private function mailFromAddress(): string
    {
        $fromAddress = config('mail.from.address');
        if (filter_var($fromAddress, FILTER_VALIDATE_EMAIL)) {
            return $fromAddress;
        }

        $mailer = config('mail.default', 'smtp');
        $authenticatedAddress = config("mail.mailers.{$mailer}.username");
        return filter_var($authenticatedAddress, FILTER_VALIDATE_EMAIL)
            ? $authenticatedAddress
            : 'noreply@techxaro.com';
    }

    private function resolveTenantFromTokenIfNeeded(string $plainToken): void
    {
        if (request()->attributes->get('currentOrganization')) {
            return;
        }

        if (strlen($plainToken) !== 64) {
            return;
        }

        $tokenHash = hash('sha256', $plainToken);
        $organizations = \App\Models\Master\Organization::where('status', 'active')->get();

        foreach ($organizations as $org) {
            try {
                app(\App\Services\Saas\TenantDatabaseManager::class)->switchConnection($org);
                if (HrmEsignToken::where('token_hash', $tokenHash)->exists()) {
                    request()->attributes->set('currentOrganization', $org);
                    return;
                }
            } catch (\Throwable $e) {
                continue;
            }
        }
    }

    private function validToken(string $plain): HrmEsignToken
    {
        abort_unless(strlen($plain) === 64, 404);
        $this->resolveTenantFromTokenIfNeeded($plain);
        $record = HrmEsignToken::where('token_hash', hash('sha256', $plain))->with('envelope')->firstOrFail();
        if ($record->envelope && $record->envelope->status === 'completed') {
            abort_if($record->expires_at->isPast(), 410, 'Signing link is expired.');
            return $record;
        }
        abort_if($record->revoked_at || $record->expires_at->isPast(), 410, 'Signing link is expired or revoked.');
        return $record;
    }

    private function buildPackageDispatchHtml(HrmEsignEnvelope $envelope, string $signingUrl, string $organizationName, string $expiresFormatted): string
    {
        $candidateName = htmlspecialchars($envelope->candidate_name ?? 'Candidate', ENT_QUOTES, 'UTF-8');
        $jobTitle = htmlspecialchars($envelope->job_title ?? 'Position', ENT_QUOTES, 'UTF-8');
        $department = htmlspecialchars($envelope->department ?? '', ENT_QUOTES, 'UTF-8');
        $reference = htmlspecialchars($envelope->reference ?? '', ENT_QUOTES, 'UTF-8');
        $orgName = htmlspecialchars($organizationName, ENT_QUOTES, 'UTF-8');
        $safeUrl = htmlspecialchars($signingUrl, ENT_QUOTES, 'UTF-8');

        $deptHtml = $department ? "<tr><td style=\"font-size: 13px; color: #64748b; padding-bottom: 10px;\">Department:</td><td align=\"right\" style=\"font-size: 13.5px; font-weight: 700; color: #0f172a; padding-bottom: 10px;\">{$department}</td></tr>" : "";

        return <<<HTML
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Action Required: Employment Agreement Package</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
          <tr>
            <td style="background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%); padding: 36px 32px; text-align: center;">
              <div style="font-size: 12px; font-weight: 700; color: #c7d2fe; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 8px;">
                {$orgName} · HUMAN RESOURCES
              </div>
              <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em; line-height: 1.3;">
                Action Required: Employment Agreement Package
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 32px;">
              <p style="font-size: 16px; font-weight: 700; color: #0f172a; margin: 0 0 14px 0;">
                Dear {$candidateName},
              </p>
              <p style="font-size: 14.5px; line-height: 1.65; color: #475569; margin: 0 0 24px 0;">
                We are pleased to issue your official employment agreement package for the position of <strong style="color: #0f172a;">{$jobTitle}</strong> at <strong>{$orgName}</strong>. Please review the attached legal documents and complete your secure electronic signature.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 28px;">
                <tr>
                  <td style="font-size: 13px; color: #64748b; padding-bottom: 10px;">Position / Job Title:</td>
                  <td align="right" style="font-size: 13.5px; font-weight: 700; color: #0f172a; padding-bottom: 10px;">{$jobTitle}</td>
                </tr>
                {$deptHtml}
                <tr>
                  <td style="font-size: 13px; color: #64748b; padding-bottom: 10px;">Package Reference:</td>
                  <td align="right" style="font-size: 13.5px; font-weight: 700; color: #4f46e5; padding-bottom: 10px;">{$reference}</td>
                </tr>
                <tr>
                  <td style="font-size: 13px; color: #64748b;">Signing Expiration Date:</td>
                  <td align="right" style="font-size: 13.5px; font-weight: 700; color: #ef4444;">{$expiresFormatted}</td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 28px;">
                <tr>
                  <td align="center">
                    <a href="{$safeUrl}" target="_blank" style="display: inline-block; background: #4f46e5; color: #ffffff; font-weight: 700; font-size: 15px; padding: 14px 36px; border-radius: 10px; text-decoration: none; box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35);">
                      ✍️ Review &amp; Sign Employment Documents
                    </a>
                  </td>
                </tr>
              </table>
              <div style="background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 10px; padding: 16px; text-align: center; margin-bottom: 24px;">
                <p style="font-size: 12.5px; color: #3730a3; margin: 0 0 8px 0; font-weight: 600;">
                  Or copy and paste this link into your web browser:
                </p>
                <a href="{$safeUrl}" style="font-size: 12px; color: #4f46e5; word-break: break-all; text-decoration: underline;">
                  {$safeUrl}
                </a>
              </div>
              <p style="font-size: 12px; color: #94a3b8; line-height: 1.5; margin: 0; text-align: center;">
                🔒 <strong>Security Warning:</strong> This private link is uniquely generated for your account. Do not forward or share this email with unauthorized third parties.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 32px; text-align: center;">
              <p style="font-size: 12px; color: #64748b; margin: 0 0 4px 0; font-weight: 600;">
                {$orgName} · Human Resources Division
              </p>
              <p style="font-size: 11px; color: #94a3b8; margin: 0;">
                Secured by PMS e-Signature Platform &amp; Cryptographic Audit Verification.
              </p>
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

    private function buildExecutedPackageHtml(HrmEsignEnvelope $envelope, string $signingUrl, string $organizationName): string
    {
        $candidateName = htmlspecialchars($envelope->candidate_name ?? 'Candidate', ENT_QUOTES, 'UTF-8');
        $jobTitle = htmlspecialchars($envelope->job_title ?? 'Position', ENT_QUOTES, 'UTF-8');
        $reference = htmlspecialchars($envelope->reference ?? '', ENT_QUOTES, 'UTF-8');
        $orgName = htmlspecialchars($organizationName, ENT_QUOTES, 'UTF-8');
        $safeUrl = htmlspecialchars($signingUrl, ENT_QUOTES, 'UTF-8');
        $signedDate = now()->format('F j, Y g:i A');

        return <<<HTML
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Executed Agreement Package - {$jobTitle}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
          <tr>
            <td style="background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 36px 32px; text-align: center;">
              <div style="font-size: 12px; font-weight: 700; color: #a7f3d0; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 8px;">
                {$orgName} · EXECUTED AGREEMENT
              </div>
              <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em; line-height: 1.3;">
                ✅ Employment Package Fully Executed
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 36px 32px;">
              <p style="font-size: 16px; font-weight: 700; color: #0f172a; margin: 0 0 14px 0;">
                Congratulations {$candidateName},
              </p>
              <p style="font-size: 14.5px; line-height: 1.65; color: #475569; margin: 0 0 24px 0;">
                Your employment package for the position of <strong style="color: #0f172a;">{$jobTitle}</strong> has been successfully signed and cryptographically executed. You can access, print, or download your official executed documents at any time.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 28px;">
                <tr>
                  <td style="font-size: 13px; color: #64748b; padding-bottom: 10px;">Position / Job Title:</td>
                  <td align="right" style="font-size: 13.5px; font-weight: 700; color: #0f172a; padding-bottom: 10px;">{$jobTitle}</td>
                </tr>
                <tr>
                  <td style="font-size: 13px; color: #64748b; padding-bottom: 10px;">Reference Code:</td>
                  <td align="right" style="font-size: 13.5px; font-weight: 700; color: #4f46e5; padding-bottom: 10px;">{$reference}</td>
                </tr>
                <tr>
                  <td style="font-size: 13px; color: #64748b;">Execution Timestamp:</td>
                  <td align="right" style="font-size: 13.5px; font-weight: 700; color: #059669;">{$signedDate}</td>
                </tr>
              </table>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 28px;">
                <tr>
                  <td align="center">
                    <a href="{$safeUrl}" target="_blank" style="display: inline-block; background: #059669; color: #ffffff; font-weight: 700; font-size: 15px; padding: 14px 36px; border-radius: 10px; text-decoration: none; box-shadow: 0 4px 14px rgba(5, 150, 105, 0.35);">
                      📄 View &amp; Print Executed Package
                    </a>
                  </td>
                </tr>
              </table>
              <p style="font-size: 12px; color: #94a3b8; line-height: 1.5; margin: 0; text-align: center;">
                🔒 <strong>Cryptographic Protection:</strong> This package contains a verified digital signature audit trail.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 24px 32px; text-align: center;">
              <p style="font-size: 12px; color: #64748b; margin: 0 0 4px 0; font-weight: 600;">
                {$orgName} · Human Resources Division
              </p>
              <p style="font-size: 11px; color: #94a3b8; margin: 0;">
                Secured by PMS e-Signature Platform.
              </p>
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

    private function buildOtpEmailHtml(string $otp, string $organizationName): string
    {
        $orgName = htmlspecialchars($organizationName, ENT_QUOTES, 'UTF-8');
        $safeOtp = htmlspecialchars($otp, ENT_QUOTES, 'UTF-8');

        return <<<HTML
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Security Verification Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
          <tr>
            <td style="background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%); padding: 32px 28px; text-align: center;">
              <div style="font-size: 12px; font-weight: 700; color: #c7d2fe; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 6px;">
                {$orgName} · SECURITY VERIFICATION
              </div>
              <h1 style="margin: 0; font-size: 20px; font-weight: 800; color: #ffffff;">
                Authentication Code
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 28px; text-align: center;">
              <p style="font-size: 14.5px; line-height: 1.6; color: #475569; margin: 0 0 24px 0;">
                Your security verification code to authorize your e-Signature submission for <strong>{$orgName}</strong> is:
              </p>
              <div style="background: #eef2ff; border: 2px dashed #4f46e5; border-radius: 12px; padding: 18px 24px; display: inline-block; margin-bottom: 24px;">
                <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 0.25em; color: #4f46e5;">
                  {$safeOtp}
                </span>
              </div>
              <p style="font-size: 13px; color: #64748b; margin: 0 0 8px 0;">
                ⏳ This code expires in <strong>10 minutes</strong>.
              </p>
              <p style="font-size: 12px; color: #94a3b8; margin: 0;">
                If you did not request this verification code, please ignore this message.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 28px; text-align: center;">
              <p style="font-size: 11.5px; color: #64748b; margin: 0;">
                {$orgName} · Human Resources Security Team
              </p>
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
