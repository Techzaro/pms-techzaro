<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AuditLog extends Model
{
    protected $fillable = [
        'user_id',
        'module',
        'action',
        'entity_type',
        'entity_id',
        'description',
        'old_values',
        'new_values',
        'status',
        'ip_address',
        'user_agent',
        'browser',
        'os',
        'device',
        'request_method',
        'request_url',
    ];

    protected $casts = [
        'old_values' => 'array',
        'new_values' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function scopeModule($query, $module)
    {
        if (empty($module)) {
            return $query;
        }
        $cleanModule = strtolower(trim($module));

        $moduleVariants = [
            'user' => ['user', 'User', 'users', 'Users', 'user_management', 'User Management'],
            'users' => ['user', 'User', 'users', 'Users', 'user_management', 'User Management'],
            'user_management' => ['user', 'User', 'users', 'Users', 'user_management', 'User Management'],
            'auth' => ['auth', 'Auth', 'authentication', 'Authentication'],
            'task' => ['task', 'Task', 'tasks', 'Tasks', 'task_management', 'Task Management'],
            'tasks' => ['task', 'Task', 'tasks', 'Tasks', 'task_management', 'Task Management'],
            'task_management' => ['task', 'Task', 'tasks', 'Tasks', 'task_management', 'Task Management'],
            'project' => ['project', 'Project', 'projects', 'Projects', 'project_management', 'Project Management'],
            'projects' => ['project', 'Project', 'projects', 'Projects', 'project_management', 'Project Management'],
            'project_management' => ['project', 'Project', 'projects', 'Projects', 'project_management', 'Project Management'],
            'deliverable' => ['deliverable', 'Deliverable', 'deliverables', 'Deliverables', 'subtask', 'Subtask', 'deliverable_management', 'Subtask Management'],
            'deliverables' => ['deliverable', 'Deliverable', 'deliverables', 'Deliverables', 'subtask', 'Subtask', 'deliverable_management', 'Subtask Management'],
            'subtask' => ['deliverable', 'Deliverable', 'deliverables', 'Deliverables', 'subtask', 'Subtask', 'deliverable_management', 'Subtask Management'],
            'deliverable_management' => ['deliverable', 'Deliverable', 'deliverables', 'Deliverables', 'subtask', 'Subtask', 'deliverable_management', 'Subtask Management'],
            'team' => ['team', 'Team', 'teams', 'Teams', 'team_management', 'Team Management'],
            'teams' => ['team', 'Team', 'teams', 'Teams', 'team_management', 'Team Management'],
            'event' => ['event', 'Event', 'events', 'Events'],
            'events' => ['event', 'Event', 'events', 'Events'],
        ];

        $allowedModules = $moduleVariants[$cleanModule] ?? [$module, strtolower($module), ucfirst($module)];

        return $query->whereIn('module', $allowedModules);
    }

    public function scopeAction($query, $action)
    {
        if (empty($action)) {
            return $query;
        }
        $cleanAction = strtolower(trim($action));

        $actionVariants = [
            'create' => ['create', 'Create', 'created', 'Created'],
            'created' => ['create', 'Create', 'created', 'Created'],
            'update' => ['update', 'Update', 'updated', 'Updated', 'status_change', 'Status Change', 'status'],
            'updated' => ['update', 'Update', 'updated', 'Updated', 'status_change', 'Status Change', 'status'],
            'delete' => ['delete', 'Delete', 'deleted', 'Deleted'],
            'deleted' => ['delete', 'Delete', 'deleted', 'Deleted'],
            'approve' => ['approve', 'Approve', 'approved', 'Approved'],
            'approved' => ['approve', 'Approve', 'approved', 'Approved'],
            'reject' => ['reject', 'Reject', 'rejected', 'Rejected', 'declined', 'Declined'],
            'rejected' => ['reject', 'Reject', 'rejected', 'Rejected', 'declined', 'Declined'],
            'submit' => ['submit', 'Submit', 'submitted', 'Submitted'],
            'submitted' => ['submit', 'Submit', 'submitted', 'Submitted'],
            'login' => ['login', 'Login', 'auth_login', 'Auth Login'],
            'auth_login' => ['login', 'Login', 'auth_login', 'Auth Login'],
            'logout' => ['logout', 'Logout'],
        ];

        $allowedActions = $actionVariants[$cleanAction] ?? [$action, strtolower($action), ucfirst($action)];

        return $query->whereIn('action', $allowedActions);
    }

    public function scopeStatus($query, $status)
    {
        return $query->where('status', $status);
    }

    public function scopeDateRange($query, $from, $to)
    {
        if ($from) {
            $query->whereDate('created_at', '>=', $from);
        }
        if ($to) {
            $query->whereDate('created_at', '<=', $to);
        }
        return $query;
    }

    public function scopeSearch($query, $search)
    {
        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('description', 'like', "%{$search}%")
                  ->orWhere('module', 'like', "%{$search}%")
                  ->orWhere('action', 'like', "%{$search}%")
                  ->orWhere('ip_address', 'like', "%{$search}%");
            });
        }
        return $query;
    }
}
