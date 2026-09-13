<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AuditService
{
    public function log(
        string $module,
        string $action,
        ?string $description = null,
        ?User $user = null,
        ?string $entityType = null,
        ?int $entityId = null,
        ?array $oldValues = null,
        ?array $newValues = null,
        string $status = 'success'
    ): AuditLog {
        $user = $user ?? Auth::user();
        $request = request();

        $ua = $this->parseUserAgent($request->userAgent());

        return AuditLog::create([
            'user_id' => $user?->id,
            'user_name' => $user?->name,
            'module' => $module,
            'action' => $action,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'description' => $description ?? "{$module}.{$action}",
            'old_values' => $oldValues,
            'new_values' => $newValues,
            'status' => $status,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'browser' => $ua['browser'],
            'os' => $ua['os'],
            'device' => $ua['device'],
            'request_method' => $request->method(),
            'request_url' => $request->fullUrl(),
        ]);
    }

    public function logFailed(
        string $module,
        string $action,
        ?string $description = null,
        ?User $user = null,
        ?string $entityType = null,
        ?int $entityId = null,
        ?array $oldValues = null,
        ?array $newValues = null
    ): AuditLog {
        return $this->log($module, $action, $description, $user, $entityType, $entityId, $oldValues, $newValues, 'failed');
    }

    public function getLogs(array $filters = [], int $perPage = 50)
    {
        $query = AuditLog::with('user:id,name,email,role,professional_email');

        if (!empty($filters['module'])) {
            $query->module($filters['module']);
        }
        if (!empty($filters['action'])) {
            $query->action($filters['action']);
        }
        if (!empty($filters['entity_id'])) {
            $query->where('entity_id', $filters['entity_id']);
        }
        if (!empty($filters['entity_type'])) {
            $query->where('entity_type', $filters['entity_type']);
        }
        if (!empty($filters['status'])) {
            $query->status($filters['status']);
        }
        if (!empty($filters['user_id'])) {
            $query->where('user_id', $filters['user_id']);
        }
        if (!empty($filters['date'])) {
            $query->date($filters['date']);
        }
        if (!empty($filters['date_from']) || !empty($filters['date_to'])) {
            $query->dateRange($filters['date_from'] ?? null, $filters['date_to'] ?? null);
        }
        if (!empty($filters['search'])) {
            $query->search($filters['search']);
        }
        $sortField = $filters['sort_field'] ?? 'created_at';
        $sortOrder = $filters['sort_order'] ?? 'desc';
        $query->orderBy($sortField, $sortOrder);

        \Illuminate\Support\Facades\Log::info('Activity Filter Trace - AuditLogs', [
            'filters' => $filters,
            'sql' => $query->toSql(),
            'bindings' => $query->getBindings(),
        ]);

        return $query->paginate($perPage);
    }

    public function getRecentActivities(int $limit = 10)
    {
        return AuditLog::with('user:id,name,email,role,professional_email')
            ->where('status', 'success')
            ->latest()
            ->limit($limit)
            ->get();
    }

    public function getModules(): array
    {
        return AuditLog::select('module')
            ->distinct()
            ->orderBy('module')
            ->pluck('module')
            ->toArray();
    }

    public function getActions(): array
    {
        return AuditLog::select('action')
            ->distinct()
            ->orderBy('action')
            ->pluck('action')
            ->toArray();
    }

    private function parseUserAgent(?string $ua): array
    {
        $result = ['browser' => 'Unknown', 'os' => 'Unknown', 'device' => 'Desktop'];

        if (!$ua) {
            return $result;
        }

        $ua = mb_strtolower($ua);

        // Browser detection
        if (str_contains($ua, 'edg')) {
            $result['browser'] = 'Edge';
        } elseif (str_contains($ua, 'chrome')) {
            $result['browser'] = 'Chrome';
        } elseif (str_contains($ua, 'safari') && !str_contains($ua, 'chrome')) {
            $result['browser'] = 'Safari';
        } elseif (str_contains($ua, 'firefox')) {
            $result['browser'] = 'Firefox';
        } elseif (str_contains($ua, 'opera') || str_contains($ua, 'opr')) {
            $result['browser'] = 'Opera';
        } elseif (str_contains($ua, 'msie') || str_contains($ua, 'trident')) {
            $result['browser'] = 'Internet Explorer';
        }

        // OS detection
        if (str_contains($ua, 'windows')) {
            $result['os'] = 'Windows';
        } elseif (str_contains($ua, 'mac os') || str_contains($ua, 'macintosh')) {
            $result['os'] = 'macOS';
        } elseif (str_contains($ua, 'linux') && !str_contains($ua, 'android')) {
            $result['os'] = 'Linux';
        } elseif (str_contains($ua, 'android')) {
            $result['os'] = 'Android';
        } elseif (str_contains($ua, 'ios') || str_contains($ua, 'iphone') || str_contains($ua, 'ipad')) {
            $result['os'] = 'iOS';
        }

        // Device detection
        if (str_contains($ua, 'mobile') || str_contains($ua, 'iphone') || str_contains($ua, 'android')) {
            $result['device'] = 'Mobile';
        } elseif (str_contains($ua, 'tablet') || str_contains($ua, 'ipad')) {
            $result['device'] = 'Tablet';
        } elseif (str_contains($ua, 'bot') || str_contains($ua, 'crawl')) {
            $result['device'] = 'Bot';
        }

        return $result;
    }
}
