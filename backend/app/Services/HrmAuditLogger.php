<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Http\Request;

class HrmAuditLogger
{
    /**
     * Log an immutable audit event for an HRM Application Request.
     *
     * @param string $requestType (WFH Request, Leave Application, Attendance Correction, Member Request, Screen Request, Warning Removal)
     * @param int $requestId
     * @param mixed $user User object or null
     * @param string $action (Application Submitted, Status Changed, Comment Added, etc.)
     * @param string|null $previousStatus
     * @param string|null $newStatus
     * @param string|null $remarks
     * @param array $metadata
     * @param Request|null $httpRequest
     * @return int Inserted audit ID
     */
    public static function log(
        string $requestType,
        int $requestId,
        $user,
        string $action,
        ?string $previousStatus = null,
        ?string $newStatus = null,
        ?string $remarks = null,
        array $metadata = [],
        ?Request $httpRequest = null
    ): int {
        $ipAddress = null;
        $userAgent = null;

        if ($httpRequest) {
            $ipAddress = $httpRequest->ip();
            $userAgent = substr($httpRequest->header('User-Agent') ?: '', 0, 500);
        } else {
            try {
                $req = request();
                if ($req) {
                    $ipAddress = $req->ip();
                    $userAgent = substr($req->header('User-Agent') ?: '', 0, 500);
                }
            } catch (\Throwable $e) {
                // fallback
            }
        }

        $userId = $user ? $user->id : null;
        $userName = $user ? ($user->name ?? 'System User') : 'System';
        
        $userRole = 'Member';
        if ($user) {
            $roleStr = strtolower($user->role ?? '');
            if (in_array($roleStr, ['admin', 'superadmin', 'super_admin'])) {
                $userRole = 'Admin';
            } elseif (in_array($roleStr, ['manager', 'hr_manager', 'hr'])) {
                $userRole = 'HR Manager';
            } else {
                $userRole = 'Member';
            }
        }

        return DB::table('hrm_request_audits')->insertGetId([
            'request_type' => $requestType,
            'request_id' => $requestId,
            'user_id' => $userId,
            'user_name' => $userName,
            'user_role' => $userRole,
            'action' => $action,
            'previous_status' => $previousStatus,
            'new_status' => $newStatus,
            'remarks' => $remarks,
            'metadata' => !empty($metadata) ? json_encode($metadata) : null,
            'ip_address' => $ipAddress,
            'user_agent' => $userAgent,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
