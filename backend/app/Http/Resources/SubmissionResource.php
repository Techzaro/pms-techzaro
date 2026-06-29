<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

/**
 * API resource for Deliverable Submission models.
 *
 * Formats submission data including file info, submitter details,
 * and associated attachments.
 */
class SubmissionResource extends JsonResource
{
    /**
     * Transform the submission into an array.
     *
     * @param \Illuminate\Http\Request $request
     *
     * @return array|null Null if the underlying resource is null
     */
    public function toArray($request)
    {
        if (!$this->resource) return null;
        return [
            'id' => $this->id,
            'comment' => $this->comment,
            'submitted_by' => $this->submitted_by,
            'file_path' => $this->file_path,
            'file_name' => $this->file_name,
            'submitted_by_user' => UserMinResource::make($this->whenLoaded('submittedBy')),
            'attachments' => $this->whenLoaded('attachments'),
            'created_at' => $this->created_at?->format('Y-m-d\TH:i:s'),
        ];
    }
}
