<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class UserMinResource extends JsonResource
{
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
