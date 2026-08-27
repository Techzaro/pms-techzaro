<?php

namespace App\Services;

use App\Models\HrmEsignEnvelope;
use App\Models\HrmEsignEvent;
use Illuminate\Http\Request;

class HrmEsignAuditService
{
    public function record(HrmEsignEnvelope $envelope, string $type, Request $request, array $metadata = [], string $actorType = 'staff'): HrmEsignEvent
    {
        $now = now();
        $isoTimestamp = $now->toISOString();
        $metadata['_iso_timestamp'] = $isoTimestamp;

        $previous = HrmEsignEvent::where('envelope_id', $envelope->id)->latest('id')->value('event_hash') ?? str_repeat('0', 64);
        $payload = json_encode([$envelope->id, $type, $actorType, $metadata, $isoTimestamp, $previous], JSON_UNESCAPED_SLASHES);

        return HrmEsignEvent::create([
            'envelope_id' => $envelope->id,
            'actor_user_id' => $request->user()?->id,
            'actor_type' => $actorType,
            'event_type' => $type,
            'ip_address' => $request->ip(),
            'user_agent' => substr((string) $request->userAgent(), 0, 1000),
            'metadata' => $metadata,
            'event_hash' => hash_hmac('sha256', $payload, config('app.key')),
            'created_at' => $now,
        ]);
    }
}
