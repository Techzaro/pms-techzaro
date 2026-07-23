<?php

namespace App\Services;

use App\Models\User;
use App\Models\Task;
use App\Models\Deliverable;
use App\Models\Project;
use App\Models\Event;
use App\Models\Draft;
use App\Models\DraftVersion;
use App\Models\ResignationLog;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class ResignationWorkflowService
{
    private const UNFINISHED_STATUSES = [
        'pending', 'acknowledged', 'in_progress', 'submitted',
        'rejected', 'reopened', 'blocked',
    ];

    public function __construct(
        private NotificationService $notificationService,
        private AuditService $auditService,
        private ActivityService $activityService,
    ) {}

    public function analyzeImpact(User $user): array
    {
        $activeProjects = $this->getActiveProjects($user);
        $activeTasks = $this->getActiveTasks($user);
        $activeDeliverables = $this->getActiveDeliverables($user);
        $activeEvents = $this->getActiveEvents($user);

        return [
            'user' => $user->only('id', 'name', 'email', 'role', 'department', 'designation'),
            'active_projects' => $activeProjects,
            'active_tasks' => $activeTasks,
            'active_deliverables' => $activeDeliverables,
            'active_events' => $activeEvents,
            'summary' => [
                'total_projects' => count($activeProjects),
                'total_tasks' => count($activeTasks),
                'total_deliverables' => count($activeDeliverables),
                'total_events' => count($activeEvents),
                'total_items' => count($activeProjects) + count($activeTasks) + count($activeDeliverables) + count($activeEvents),
            ],
        ];
    }

    public function executeResignation(User $user, User $admin, ?string $notes = null): ResignationLog
    {
        return DB::transaction(function () use ($user, $admin, $notes) {
            $impact = $this->analyzeImpact($user);

            $draftsCreated = [];
            $draftOwners = [];

            foreach ($impact['active_projects'] as $project) {
                $ownerId = $project['assigner']['id'];
                $draft = $this->createDraftFromProject($project['id'], $ownerId, $admin, $user);
                $draftsCreated[] = $draft;
                $draftOwners[$ownerId] = ($draftOwners[$ownerId] ?? 0) + 1;
            }

            foreach ($impact['active_tasks'] as $task) {
                $ownerId = $task['assigner']['id'];
                $draft = $this->createDraftFromTask($task['id'], $ownerId, $admin, $user);
                $draftsCreated[] = $draft;
                $draftOwners[$ownerId] = ($draftOwners[$ownerId] ?? 0) + 1;
            }

            foreach ($impact['active_deliverables'] as $deliverable) {
                $ownerId = $deliverable['assigner']['id'];
                $draft = $this->createDraftFromDeliverable($deliverable['id'], $ownerId, $admin, $user);
                $draftsCreated[] = $draft;
                $draftOwners[$ownerId] = ($draftOwners[$ownerId] ?? 0) + 1;
            }

            foreach ($impact['active_events'] as $event) {
                $ownerId = $event['assigner']['id'];
                $draft = $this->createDraftFromEvent($event['id'], $ownerId, $admin, $user);
                $draftsCreated[] = $draft;
                $draftOwners[$ownerId] = ($draftOwners[$ownerId] ?? 0) + 1;
            }

            $notificationsSent = 0;
            foreach ($draftOwners as $ownerId => $count) {
                $this->sendResignationNotification($ownerId, $user, $count, $admin);
                $notificationsSent++;
            }

            $user->tokens()->delete();

            $user->update([
                'active' => false,
                'must_change_password' => false,
                'resigned_at' => now(),
                'resigned_by' => $admin->id,
                'resignation_notes' => $notes,
            ]);

            Cache::forget('all_users_list');
            Cache::forget('admin_manager_ids');
            Cache::forget("user_profile_{$user->id}");

            $resignationLog = ResignationLog::create([
                'user_id' => $user->id,
                'resigned_by' => $admin->id,
                'resigned_at' => now(),
                'ip_address' => request()->ip(),
                'user_agent' => request()->userAgent(),
                'total_projects_returned' => count($impact['active_projects']),
                'total_tasks_returned' => count($impact['active_tasks']),
                'total_deliverables_returned' => count($impact['active_deliverables']),
                'total_events_returned' => count($impact['active_events']),
                'total_drafts_created' => count($draftsCreated),
                'total_notifications_sent' => $notificationsSent,
                'draft_owners' => collect($draftOwners)->map(fn($count, $id) => [
                    'user_id' => $id,
                    'name' => User::find($id)?->name ?? 'Unknown',
                    'items_count' => $count,
                ])->values()->all(),
                'affected_items' => $this->buildAffectedItemsList($impact),
            ]);

            try {
                $this->auditService->log(
                    module: 'user_management',
                    action: 'resign',
                    description: "Resigned user {$user->name}. " . count($draftsCreated) . " drafts returned to original assigners.",
                    user: $admin,
                    entityType: 'User',
                    entityId: $user->id,
                    newValues: [
                        'total_drafts_created' => count($draftsCreated),
                        'total_notifications_sent' => $notificationsSent,
                        'draft_owners' => $resignationLog->draft_owners,
                    ],
                    status: 'success'
                );
            } catch (\Throwable $e) {
                Log::error('Failed to log audit for resignation', ['error' => $e->getMessage()]);
            }

            $this->activityService->log(
                $admin->id,
                'user_resigned',
                "You resigned user {$user->name}. " . count($draftsCreated) . " work items returned to assigners.",
                'user',
                $user->id,
                'resigned',
                $user->name,
                $user->id,
            );

            try {
                $sendTo = $user->professional_email ?: $user->personal_email ?: $user->email;
                $senderEmail = $admin->professional_email ?: $admin->personal_email ?: $admin->email;
                Mail::to($sendTo)->queue(
                    new \App\Mail\UserResigned($user, $admin->name, $senderEmail, $admin->name)
                );
            } catch (\Throwable $e) {
                Log::error("Failed to send resignation email: " . $e->getMessage());
            }

            $this->notificationService->confirmAction($admin, 'Resigned', 'user', $user->name, [
                'User Email' => $user->professional_email ?? $user->email,
                'Role' => ucfirst($user->role),
                'Drafts Created' => count($draftsCreated),
                'Notifications Sent' => $notificationsSent,
            ]);

            return $resignationLog;
        });
    }

    private function getActiveProjects(User $user): array
    {
        $projects = Project::whereRaw("JSON_CONTAINS(assigned_users, ?)", [json_encode($user->id)])
            ->whereNotIn('status', ['Completed', 'Cancelled', 'Archived'])
            ->with('creator:id,name')
            ->get();

        return $projects->map(fn($p) => [
            'id' => $p->id,
            'title' => $p->title,
            'business_id' => $p->business_id,
            'project_code' => $p->project_code,
            'assigner' => $p->creator ? ['id' => $p->creator->id, 'name' => $p->creator->name] : ['id' => $p->created_by, 'name' => 'Unknown'],
        ])->values()->all();
    }

    private function getActiveTasks(User $user): array
    {
        $tasks = Task::where(function ($q) use ($user) {
                $q->where('assigned_to', $user->id)
                  ->orWhereHas('assignees', fn($aq) => $aq->where('users.id', $user->id));
            })
            ->whereIn('status', self::UNFINISHED_STATUSES)
            ->with(['assigner:id,name', 'project:id,title,business_id'])
            ->get();

        return $tasks->map(fn($t) => [
            'id' => $t->id,
            'title' => $t->title,
            'business_id' => $t->business_id,
            'assigner' => $t->assigner ? ['id' => $t->assigner->id, 'name' => $t->assigner->name] : ['id' => $t->assigned_by, 'name' => 'Unknown'],
            'project' => $t->project ? ['id' => $t->project->id, 'title' => $t->project->title, 'business_id' => $t->project->business_id] : null,
        ])->values()->all();
    }

    private function getActiveDeliverables(User $user): array
    {
        $deliverables = Deliverable::where(function ($q) use ($user) {
                $q->where('assigned_to', $user->id)
                  ->orWhereHas('assignees', fn($aq) => $aq->where('users.id', $user->id));
            })
            ->whereIn('status', self::UNFINISHED_STATUSES)
            ->with(['creator:id,name', 'task:id,title,business_id'])
            ->get();

        return $deliverables->map(fn($d) => [
            'id' => $d->id,
            'title' => $d->title,
            'business_id' => $d->business_id,
            'assigner' => $d->creator ? ['id' => $d->creator->id, 'name' => $d->creator->name] : ['id' => $d->created_by, 'name' => 'Unknown'],
            'task' => $d->task ? ['id' => $d->task->id, 'title' => $d->task->title, 'business_id' => $d->task->business_id] : null,
        ])->values()->all();
    }

    private function getActiveEvents(User $user): array
    {
        $events = Event::where(function ($q) use ($user) {
                $q->where('user_id', $user->id)
                  ->orWhereHas('assignedUsers', fn($eq) => $eq->where('users.id', $user->id));
            })
            ->where('start_date', '>=', now())
            ->with('user:id,name')
            ->get();

        return $events->map(fn($e) => [
            'id' => $e->id,
            'title' => $e->title,
            'type' => $e->type,
            'assigner' => $e->user ? ['id' => $e->user->id, 'name' => $e->user->name] : ['id' => $e->user_id, 'name' => 'Unknown'],
        ])->values()->all();
    }

    private function createDraftFromProject(int $projectId, int $ownerId, User $admin, User $resignedUser): Draft
    {
        $project = Project::findOrFail($projectId);

        return Draft::create([
            'module_type' => 'project',
            'original_record_id' => $project->id,
            'draft_data' => $project->toArray(),
            'title' => $project->title,
            'created_by' => $ownerId,
            'last_edited_by' => $admin->id,
            'status' => 'draft',
            'project_id' => $project->id,
            'is_returned' => true,
            'returned_from_user_id' => $resignedUser->id,
            'returned_at' => now(),
            'return_reason' => "Employee {$resignedUser->name} resigned",
        ]);
    }

    private function createDraftFromTask(int $taskId, int $ownerId, User $admin, User $resignedUser): Draft
    {
        $task = Task::findOrFail($taskId);

        return Draft::create([
            'module_type' => 'task',
            'original_record_id' => $task->id,
            'draft_data' => $task->toArray(),
            'title' => $task->title,
            'created_by' => $ownerId,
            'last_edited_by' => $admin->id,
            'status' => 'draft',
            'project_id' => $task->project_id,
            'is_returned' => true,
            'returned_from_user_id' => $resignedUser->id,
            'returned_at' => now(),
            'return_reason' => "Employee {$resignedUser->name} resigned",
        ]);
    }

    private function createDraftFromDeliverable(int $deliverableId, int $ownerId, User $admin, User $resignedUser): Draft
    {
        $deliverable = Deliverable::findOrFail($deliverableId);

        return Draft::create([
            'module_type' => 'deliverable',
            'original_record_id' => $deliverable->id,
            'draft_data' => $deliverable->toArray(),
            'title' => $deliverable->title,
            'created_by' => $ownerId,
            'last_edited_by' => $admin->id,
            'status' => 'draft',
            'project_id' => $deliverable->project_id,
            'is_returned' => true,
            'returned_from_user_id' => $resignedUser->id,
            'returned_at' => now(),
            'return_reason' => "Employee {$resignedUser->name} resigned",
        ]);
    }

    private function createDraftFromEvent(int $eventId, int $ownerId, User $admin, User $resignedUser): Draft
    {
        $event = Event::findOrFail($eventId);

        return Draft::create([
            'module_type' => 'event',
            'original_record_id' => $event->id,
            'draft_data' => $event->toArray(),
            'title' => $event->title,
            'created_by' => $ownerId,
            'last_edited_by' => $admin->id,
            'status' => 'draft',
            'is_returned' => true,
            'returned_from_user_id' => $resignedUser->id,
            'returned_at' => now(),
            'return_reason' => "Employee {$resignedUser->name} resigned",
        ]);
    }

    private function sendResignationNotification(int $ownerId, User $resignedUser, int $itemCount, User $admin): void
    {
        $this->notificationService->notify(
            userId: $ownerId,
            senderId: $admin->id,
            type: 'work_items_returned',
            module: 'system',
            relatedId: $resignedUser->id,
            title: 'Work Items Returned to Draft',
            message: "{$admin->name} resigned {$resignedUser->name}. {$itemCount} assigned work item(s) have been moved to your Drafts for review and reassignment.",
            link: '/drafts?tab=returned',
            changes: [
                'resigned_user' => $resignedUser->name,
                'items_count' => $itemCount,
                'resigned_by' => $admin->name,
            ]
        );
    }

    private function buildAffectedItemsList(array $impact): array
    {
        $items = [];

        foreach ($impact['active_projects'] as $p) {
            $items[] = [
                'type' => 'project', 'id' => $p['id'], 'code' => $p['project_code'],
                'title' => $p['title'], 'assigner_id' => $p['assigner']['id'],
                'assigner_name' => $p['assigner']['name'],
            ];
        }

        foreach ($impact['active_tasks'] as $t) {
            $items[] = [
                'type' => 'task', 'id' => $t['id'], 'code' => $t['business_id'],
                'title' => $t['title'], 'assigner_id' => $t['assigner']['id'],
                'assigner_name' => $t['assigner']['name'],
            ];
        }

        foreach ($impact['active_deliverables'] as $d) {
            $items[] = [
                'type' => 'deliverable', 'id' => $d['id'], 'code' => $d['business_id'],
                'title' => $d['title'], 'assigner_id' => $d['assigner']['id'],
                'assigner_name' => $d['assigner']['name'],
            ];
        }

        foreach ($impact['active_events'] as $e) {
            $items[] = [
                'type' => 'event', 'id' => $e['id'], 'code' => null,
                'title' => $e['title'], 'assigner_id' => $e['assigner']['id'],
                'assigner_name' => $e['assigner']['name'],
            ];
        }

        return $items;
    }
}
