<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\User;
use App\Services\AuditService;
use App\Services\AuditExportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    public function __construct(
        private AuditService $auditService,
        private AuditExportService $exportService
    ) {}

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'module' => 'nullable|string|max:50',
            'action' => 'nullable|string|max:50',
            'status' => 'nullable|string|in:success,failed',
            'user_id' => 'nullable|integer|exists:users,id',
            'date_from' => 'nullable|date',
            'date_to' => 'nullable|date',
            'search' => 'nullable|string|max:200',
            'sort_field' => 'nullable|string|in:created_at,module,action,status',
            'sort_order' => 'nullable|string|in:asc,desc',
            'per_page' => 'nullable|integer|min:5|max:10000',
        ]);

        $perPage = $request->input('per_page', 50);
        $logs = $this->auditService->getLogs($filters, $perPage);

        return response()->json($logs);
    }

    public function show(AuditLog $auditLog): JsonResponse
    {
        $auditLog->load('user:id,name,email,role,professional_email');
        return response()->json(['data' => $auditLog]);
    }

    public function modules(): JsonResponse
    {
        return response()->json(['data' => $this->auditService->getModules()]);
    }

    public function actions(): JsonResponse
    {
        return response()->json(['data' => $this->auditService->getActions()]);
    }

    public function users(): JsonResponse
    {
        $users = User::select('id', 'name', 'email', 'role')
            ->whereHas('auditLogs')
            ->orderBy('name')
            ->get();
        return response()->json(['data' => $users]);
    }

    public function recent(): JsonResponse
    {
        return response()->json([
            'data' => $this->auditService->getRecentActivities(10),
        ]);
    }

    public function myActivity(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'module' => 'nullable|string|max:50',
            'action' => 'nullable|string|max:50',
            'date_from' => 'nullable|date',
            'date_to' => 'nullable|date',
            'search' => 'nullable|string|max:200',
            'sort_field' => 'nullable|string|in:created_at,module,action',
            'sort_order' => 'nullable|string|in:asc,desc',
            'per_page' => 'nullable|integer|min:5|max:200',
        ]);

        $filters['user_id'] = $request->user()->id;
        $perPage = $request->input('per_page', 25);
        $logs = $this->auditService->getLogs($filters, $perPage);

        return response()->json($logs);
    }

    public function export(Request $request)
    {
        $filters = $request->validate([
            'format' => 'required|string|in:xlsx',
            'module' => 'nullable|string|max:50',
            'action' => 'nullable|string|max:50',
            'status' => 'nullable|string|in:success,failed',
            'user_id' => 'nullable|integer|exists:users,id',
            'date_from' => 'nullable|date',
            'date_to' => 'nullable|date',
            'search' => 'nullable|string|max:200',
            'sort_field' => 'nullable|string|in:created_at,module,action,status',
            'sort_order' => 'nullable|string|in:asc,desc',
            'timezone' => 'nullable|string',
        ]);

        $timezone = $request->input('timezone');
        if (empty($timezone) || !in_array($timezone, \DateTimeZone::listIdentifiers(), true)) {
            $user = $request->user();
            $timezone = $user?->timezone;
            if (empty($timezone) && $user?->organization_id) {
                try {
                    $timezone = \App\Models\Master\Organization::where('id', $user->organization_id)->value('default_timezone');
                } catch (\Throwable $e) {
                    // Fallback
                }
            }
            if (empty($timezone)) {
                $timezone = config('app.timezone', 'UTC');
            }
        }

        $paginator = $this->auditService->getLogs($filters, 10000);
        $logs = $paginator instanceof \Illuminate\Pagination\AbstractPaginator ? $paginator->getCollection() : $paginator;

        return $this->exportService->exportExcel($logs, $timezone);
    }
}
