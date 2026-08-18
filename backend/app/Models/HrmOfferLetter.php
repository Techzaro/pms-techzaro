<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class HrmOfferLetter extends Model
{
    protected $table = 'hrm_offer_letters';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'candidate_id',
        'candidate_name',
        'candidate_email',
        'job_title',
        'department',
        'employment_type',
        'base_salary',
        'bonus',
        'benefits',
        'start_date',
        'expiry_date',
        'reporting_manager',
        'template',
        'custom_clauses',
        'status',
        'issued_date',
        'sent_date',
        'responded_date',
        'signature_name',
        'signed_ip',
        'signed_at',
        'discussion_notes',
        'rejection_reason',
        'access_token',
    ];

    public function toFrontendArray()
    {
        $effectiveStatus = $this->status;
        $today = date('Y-m-d');
        if (in_array($this->status, ['Sent', 'Viewed', 'Draft', 'Negotiating']) && $this->expiry_date && $this->expiry_date < $today) {
            $effectiveStatus = 'Expired';
        }

        return [
            'id' => $this->id,
            'candidateId' => $this->candidate_id,
            'candidateName' => $this->candidate_name,
            'candidateEmail' => $this->candidate_email,
            'jobTitle' => $this->job_title,
            'department' => $this->department,
            'employmentType' => $this->employment_type,
            'baseSalary' => (float) $this->base_salary,
            'bonus' => (float) $this->bonus,
            'benefits' => $this->benefits ?? '',
            'startDate' => $this->start_date,
            'expiryDate' => $this->expiry_date,
            'reportingManager' => $this->reporting_manager ?? '',
            'template' => $this->template,
            'customClauses' => $this->custom_clauses ?? '',
            'status' => $effectiveStatus,
            'issuedDate' => $this->issued_date,
            'sentDate' => $this->sent_date,
            'respondedDate' => $this->responded_date,
            'signatureName' => $this->signature_name ?? '',
            'signedIp' => $this->signed_ip ?? '',
            'signedAt' => $this->signed_at ?? '',
            'discussionNotes' => $this->discussion_notes ?? '',
            'rejectionReason' => $this->rejection_reason ?? '',
            'accessToken' => $this->access_token ?? '',
        ];
    }
}
