<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Minimal API resource for User models.
 *
 * Provides only essential user fields (id, name, email, role)
 * for use as a nested reference in other resources.
 */
class UserMinResource extends JsonResource
{
    /**
     * Transform the user into a minimal array representation.
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
            'name' => $this->name,
            'email' => $this->when($this->email, $this->email),
            'role' => $this->role,
        ];
    }
}
