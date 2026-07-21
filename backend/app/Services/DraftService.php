<?php

namespace App\Services;

use App\Models\Draft;
use App\Models\DraftVersion;
use App\Models\User;
use App\Models\Project;
use App\Models\Task;
use App\Models\Deliverable;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;

class DraftService
{
    private const ALLOWED_SORT_FIELDS = [
        'created_at', 'updated_at', 'title', 'module_type', 'status',
    ];

    // ── CRUD ──

    public function create(array $data, User $user): Draft
    {
        return DB::transaction(function () use ($data, $user) {
            $draft = Draft::create([
                'module_type' => $data['module_type'],
                'original_record_id' => $data['original_record_id'] ?? null,
                'draft_data' => $data['draft_data'],
                'title' => $data['title'] ?? 'Untitled Draft',
                'created_by' => $user->id,
                'last_edited_by' => $user->id,
                'status' => $data['status'] ?? 'draft',
                'project_id' => $data['project_id'] ?? null,
                'parent_id' => $data['parent_id'] ?? null,
                'version' => 1,
                'last_auto_saved_at' => now(),
            ]);

            DraftVersion::create([
                'draft_id' => $draft->id,
                'version' => 1,
                'draft_data' => $data['draft_data'],
                'edited_by' => $user->id,
                'edited_at' => now(),
            ]);

            app(ActivityService::class)->log(
                $user->id, 'created',
                "Draft {$draft->draft_code} created for {$draft->module_label}",
                'Draft', $draft->id
            );

            app(AuditService::class)->log(
                'Draft', 'created',
                "Created draft {$draft->draft_code} ({$draft->module_type})",
                $user, 'Draft', $draft->id, null,
                ['draft_code' => $draft->draft_code, 'module_type' => $draft->module_type, 'title' => $draft->title]
            );

            return $draft->load(['creator', 'lastEditor']);
        });
    }

    public function update(Draft $draft, array $data, User $user): Draft
    {
        return DB::transaction(function () use ($draft, $data, $user) {
            $newVersion = $draft->version + 1;

            $draft->update([
                'draft_data' => $data['draft_data'] ?? $draft->draft_data,
                'title' => $data['title'] ?? $draft->title,
                'last_edited_by' => $user->id,
                'status' => $data['status'] ?? $draft->status,
                'version' => $newVersion,
                'last_auto_saved_at' => now(),
            ]);

            if (isset($data['draft_data'])) {
                DraftVersion::create([
                    'draft_id' => $draft->id,
                    'version' => $newVersion,
                    'draft_data' => $data['draft_data'],
                    'edited_by' => $user->id,
                    'edited_at' => now(),
                ]);
            }

            return $draft->fresh(['creator', 'lastEditor']);
        });
    }

    public function delete(Draft $draft, User $user): bool
    {
        $draftCode = $draft->draft_code;
        $moduleType = $draft->module_type;

        $draft->delete();

        app(ActivityService::class)->log($user->id, 'deleted', "Draft {$draftCode} deleted", 'Draft', $draft->id);
        app(AuditService::class)->log(
            'Draft', 'deleted', "Deleted draft {$draftCode} ({$moduleType})",
            $user, 'Draft', $draft->id
        );

        return true;
    }

    public function duplicate(Draft $draft, User $user): Draft
    {
        return $this->create([
            'module_type' => $draft->module_type,
            'original_record_id' => $draft->original_record_id,
            'draft_data' => $draft->draft_data,
            'title' => $draft->title . ' (Copy)',
            'project_id' => $draft->project_id,
            'parent_id' => $draft->parent_id,
        ], $user);
    }

    // ── Auto-save ──

    public function autoSave(Draft $draft, array $data, User $user): Draft
    {
        $newVersion = $draft->version + 1;

        // Only set auto_saved status if current status is draft or auto_saved
        // Don't overwrite ready_to_publish or other manual statuses
        $newStatus = in_array($draft->status, ['draft', 'auto_saved']) ? 'auto_saved' : $draft->status;

        $draft->update([
            'draft_data' => $data['draft_data'] ?? $draft->draft_data,
            'title' => $data['title'] ?? $draft->title,
            'last_edited_by' => $user->id,
            'status' => $newStatus,
            'version' => $newVersion,
            'last_auto_saved_at' => now(),
        ]);

        if (isset($data['draft_data'])) {
            DraftVersion::create([
                'draft_id' => $draft->id,
                'version' => $newVersion,
                'draft_data' => $data['draft_data'],
                'edited_by' => $user->id,
                'edited_at' => now(),
            ]);
        }

        return $draft->fresh(['creator', 'lastEditor']);
    }

    // ── Version management ──

    public function restoreVersion(Draft $draft, int $version, User $user): Draft
    {
        $draftVersion = DraftVersion::where('draft_id', $draft->id)
            ->where('version', $version)
            ->firstOrFail();

        $newVersion = $draft->version + 1;

        $draft->update([
            'draft_data' => $draftVersion->draft_data,
            'version' => $newVersion,
            'last_edited_by' => $user->id,
            'last_auto_saved_at' => now(),
        ]);

        DraftVersion::create([
            'draft_id' => $draft->id,
            'version' => $newVersion,
            'draft_data' => $draftVersion->draft_data,
            'edited_by' => $user->id,
            'edited_at' => now(),
        ]);

        app(AuditService::class)->log(
            'Draft', 'restored',
            "Restored draft {$draft->draft_code} to version {$version}",
            $user, 'Draft', $draft->id
        );

        return $draft->fresh(['creator', 'lastEditor', 'versions']);
    }

    // ── Authorization ──

    public function canUserAccess(Draft $draft, User $user): bool
    {
        if ($user->role === 'admin') {
            return true;
        }
        if ($user->role === 'manager') {
            if ($draft->created_by === $user->id) {
                return true;
            }
            if ($draft->project_id && $draft->project && $draft->project->created_by === $user->id) {
                return true;
            }
        }
        return $draft->created_by === $user->id;
    }

    public function canUserDelete(Draft $draft, User $user): bool
    {
        return $this->canUserAccess($draft, $user);
    }

    // ── Publishing ──

    public function publish(Draft $draft, User $user): ?object
    {
        $draftData = $draft->draft_data;

        $entity = match ($draft->module_type) {
            'project' => $this->publishProject($draft, $draftData, $user),
            'task' => $this->publishTask($draft, $draftData, $user),
            'deliverable' => $this->publishDeliverable($draft, $draftData, $user),
            'event' => $this->publishEvent($draft, $draftData, $user),
            default => null,
        };

        if (!$entity) {
            return null;
        }

        $draft->update([
            'status' => 'published',
            'original_record_id' => $entity->id,
        ]);

        app(ActivityService::class)->log(
            $user->id, 'published',
            "Draft {$draft->draft_code} published as {$draft->module_label}",
            'Draft', $draft->id
        );

        app(AuditService::class)->log(
            'Draft', 'published',
            "Published draft {$draft->draft_code} ({$draft->module_type})",
            $user, 'Draft', $draft->id, null,
            ['entity_type' => $draft->module_type, 'entity_id' => $entity->id]
        );

        return $entity;
    }

    private function publishProject(Draft $draft, array $data, User $user): Project
    {
        // Normalize field names: frontend uses categoriesList, backend uses categories
        $categories = $data['categories'] ?? $data['categoriesList'] ?? null;

        if ($draft->original_record_id) {
            $project = Project::findOrFail($draft->original_record_id);
            $project->update([
                'title' => $data['title'] ?? $project->title,
                'description' => $data['description'] ?? $project->description,
                'priority' => $data['priority'] ?? $project->priority,
                'status' => $data['status'] ?? $project->status,
                'client_name' => $data['client_name'] ?? $project->client_name,
                'budget' => $data['budget'] ?? $project->budget,
                'team_ids' => $data['team_ids'] ?? $project->team_ids,
                'assigned_users' => $data['assigned_users'] ?? $project->assigned_users,
                'updated_by' => $user->id,
            ]);

            if ($categories !== null) {
                $project->categories = $categories;
                $project->save();
            }

            if (isset($data['milestones'])) {
                foreach ($data['milestones'] as $m) {
                    $project->milestones()->updateOrCreate(
                        ['title' => $m['title']],
                        ['due_date' => $m['due_date'] ?? null, 'status' => $m['status'] ?? 'planned']
                    );
                }
            }

            return $project;
        }

        $project = Project::create([
            'title' => $data['title'] ?? 'Untitled Project',
            'description' => $data['description'] ?? '',
            'priority' => $data['priority'] ?? 'Medium',
            'status' => $data['status'] ?? 'Planning',
            'client_name' => $data['client_name'] ?? '',
            'budget' => $data['budget'] ?? null,
            'team_ids' => $data['team_ids'] ?? [],
            'assigned_users' => $data['assigned_users'] ?? [],
            'created_by' => $user->id,
            'updated_by' => $user->id,
        ]);

        if ($categories !== null) {
            $project->categories = $categories;
            $project->save();
        }

        if (isset($data['milestones'])) {
            foreach ($data['milestones'] as $m) {
                $project->milestones()->create([
                    'title' => $m['title'],
                    'due_date' => $m['due_date'] ?? null,
                    'status' => $m['status'] ?? 'planned',
                ]);
            }
        }

        return $project;
    }

    private function publishTask(Draft $draft, array $data, User $user): Task
    {
        // Normalize: frontend saves assigned_to as array for assignees
        $assigneeIds = $data['assigned_to'] ?? [];

        $taskData = [
            'title' => $data['title'] ?? 'Untitled Task',
            'description' => $data['description'] ?? '',
            'priority' => $data['priority'] ?? 'Medium',
            'status' => $data['status'] ?? 'pending',
            'project_id' => $data['project_id'] ?? null,
            'start_date' => $data['start_date'] ?? null,
            'end_date' => $data['end_date'] ?? null,
            'requirements' => $data['requirements'] ?? null,
            'created_by' => $user->id,
            'assigned_by' => $user->id,
        ];

        if ($draft->original_record_id) {
            $task = Task::findOrFail($draft->original_record_id);
            $task->update($taskData);

            // Sync assignees on update too
            if (!empty($assigneeIds)) {
                $ids = is_array($assigneeIds) ? $assigneeIds : [$assigneeIds];
                $task->assignees()->sync($ids);
            }

            return $task;
        }

        $task = Task::create($taskData);

        if (!empty($assigneeIds)) {
            $ids = is_array($assigneeIds) ? $assigneeIds : [$assigneeIds];
            $task->assignees()->sync($ids);
        }

        return $task;
    }

    private function publishDeliverable(Draft $draft, array $data, User $user): Deliverable
    {
        $assigneeIds = $data['assigned_to'] ?? [];

        $deliverableData = [
            'title' => $data['title'] ?? 'Untitled Subtask',
            'description' => $data['description'] ?? '',
            'priority' => $data['priority'] ?? 'Medium',
            'status' => $data['status'] ?? 'pending',
            'project_id' => $data['project_id'] ?? null,
            'task_id' => $data['task_id'] ?? null,
            'start_date' => $data['start_date'] ?? null,
            'due_date' => $data['due_date'] ?? null,
            'created_by' => $user->id,
        ];

        if ($draft->original_record_id) {
            $deliverable = Deliverable::findOrFail($draft->original_record_id);
            $deliverable->update($deliverableData);

            if (!empty($assigneeIds)) {
                $ids = is_array($assigneeIds) ? $assigneeIds : [$assigneeIds];
                $deliverable->assignees()->sync($ids);
            }

            return $deliverable;
        }

        $deliverable = Deliverable::create($deliverableData);

        if (!empty($assigneeIds)) {
            $ids = is_array($assigneeIds) ? $assigneeIds : [$assigneeIds];
            $deliverable->assignees()->sync($ids);
        }

        return $deliverable;
    }

    private function publishEvent(Draft $draft, array $data, User $user): \App\Models\Event
    {
        // Normalize field names between frontend camelCase and backend snake_case
        $eventType = $data['eventType'] ?? $data['event_type'] ?? $data['type'] ?? 'Other';
        $assignedUserIds = $data['assignedUserIds'] ?? $data['assigned_users'] ?? [];

        // Build start_date from separate date/time fields
        $startDate = null;
        if (!empty($data['startDate'])) {
            $startDate = $data['startDate'];
            if (!empty($data['startTime'])) {
                $startDate .= ' ' . $data['startTime'];
            }
        } elseif (!empty($data['start_date'])) {
            $startDate = $data['start_date'];
        }

        // Build end_date from separate date/time fields
        $endDate = null;
        if (!empty($data['endDate']) && !empty($data['hasEndDate'])) {
            $endDate = $data['endDate'];
            if (!empty($data['endTime'])) {
                $endDate .= ' ' . $data['endTime'];
            }
        } elseif (!empty($data['end_date'])) {
            $endDate = $data['end_date'];
        }

        // Compute color from event type
        $colorMap = [
            'Meeting' => '#6366f1', 'Training' => '#3b82f6', 'Workshop' => '#8b5cf6',
            'Client Meeting' => '#f59e0b', 'Company Event' => '#22c55e', 'Holiday' => '#ef4444',
            'Interview' => '#ec4899', 'Project Milestone' => '#14b8a6',
            'Internship Activity' => '#06b6d4', 'Other' => '#6b7280',
        ];
        $color = $data['color'] ?? $colorMap[$eventType] ?? '#4f46e5';

        $eventData = [
            'title' => $data['title'] ?? 'Untitled Event',
            'description' => $data['description'] ?? '',
            'type' => $eventType,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'all_day' => $data['allDay'] ?? $data['all_day'] ?? false,
            'color' => $color,
            'user_id' => $user->id,
        ];

        if ($draft->original_record_id) {
            $event = \App\Models\Event::findOrFail($draft->original_record_id);
            $event->update($eventData);

            if (!empty($assignedUserIds)) {
                $event->assignedUsers()->sync($assignedUserIds);
            }

            return $event;
        }

        $event = \App\Models\Event::create($eventData);

        if (!empty($assignedUserIds)) {
            $event->assignedUsers()->sync($assignedUserIds);
        }

        return $event;
    }

    // ── Listing ──

    public function getDrafts(array $filters, User $user): LengthAwarePaginator
    {
        $query = Draft::with([
            'creator:id,name,email,role,avatar',
            'lastEditor:id,name,email,role,avatar',
            'project:id,title,project_code',
            'parentTask:id,title,task_code',
        ]);

        // Permission filtering
        if ($user->role === 'admin') {
            // Admin sees all
        } elseif ($user->role === 'manager') {
            $query->where(function ($q) use ($user) {
                $q->where('created_by', $user->id)
                  ->orWhereHas('project', fn($pq) => $pq->where('created_by', $user->id));
            });
        } else {
            $query->where('created_by', $user->id);
        }

        // Filters
        if (!empty($filters['module_type'])) {
            $query->byModule($filters['module_type']);
        }
        if (!empty($filters['status'])) {
            $query->byStatus($filters['status']);
        }
        if (isset($filters['is_returned']) && $filters['is_returned'] === 'true') {
            $query->where('is_returned', true);
        }
        if (isset($filters['is_returned']) && $filters['is_returned'] === 'false') {
            $query->where('is_returned', false);
        }
        if (!empty($filters['project_id'])) {
            $query->byProject($filters['project_id']);
        }
        if (!empty($filters['created_by'])) {
            $query->byCreator($filters['created_by']);
        }
        if (!empty($filters['search'])) {
            $query->search($filters['search']);
        }
        if (!empty($filters['date_from'])) {
            $query->whereDate('created_at', '>=', $filters['date_from']);
        }
        if (!empty($filters['date_to'])) {
            $query->whereDate('created_at', '<=', $filters['date_to']);
        }
        if (!empty($filters['last_updated_from'])) {
            $query->whereDate('updated_at', '>=', $filters['last_updated_from']);
        }
        if (!empty($filters['last_updated_to'])) {
            $query->whereDate('updated_at', '<=', $filters['last_updated_to']);
        }

        // Sorting with whitelist
        $sortField = $filters['sort_field'] ?? 'updated_at';
        $sortOrder = $filters['sort_order'] ?? 'desc';

        if (!in_array($sortField, self::ALLOWED_SORT_FIELDS)) {
            $sortField = 'updated_at';
        }
        if (!in_array($sortOrder, ['asc', 'desc'])) {
            $sortOrder = 'desc';
        }

        $query->orderBy($sortField, $sortOrder);

        return $query->paginate($filters['per_page'] ?? 25);
    }

    // ── Cleanup ──

    public function cleanup(int $days = 30): int
    {
        $cutoff = now()->subDays($days);

        // Only delete non-published, non-important drafts older than cutoff
        // Published drafts are kept as audit trail
        $deleted = Draft::where('status', '!=', 'published')
            ->where('updated_at', '<', $cutoff)
            ->where('is_important', false)
            ->delete();

        return $deleted;
    }

    public function archive(int $days = 90): int
    {
        $cutoff = now()->subDays($days);

        return Draft::where('status', '!=', 'archived')
            ->where('status', '!=', 'published')
            ->where('updated_at', '<', $cutoff)
            ->where('is_important', false)
            ->update(['status' => 'archived']);
    }

    public function publishReturnedDraft(Draft $draft, array $newData, User $user): ?object
    {
        return DB::transaction(function () use ($draft, $newData, $user) {
            $mergedData = array_merge($draft->draft_data, $newData);

            $entity = match ($draft->module_type) {
                'project' => $this->publishReturnedProject($draft, $mergedData, $user),
                'task' => $this->publishReturnedTask($draft, $mergedData, $user),
                'deliverable' => $this->publishReturnedDeliverable($draft, $mergedData, $user),
                'event' => $this->publishReturnedEvent($draft, $mergedData, $user),
                default => null,
            };

            if (!$entity) {
                return null;
            }

            $draft->delete();

            app(ActivityService::class)->log(
                $user->id, 'published',
                "Returned draft {$draft->draft_code} published as {$draft->module_label}",
                'Draft', $draft->id
            );

            app(AuditService::class)->log(
                'Draft', 'published',
                "Published returned draft {$draft->draft_code} ({$draft->module_type})",
                $user, 'Draft', $draft->id, null,
                ['entity_type' => $draft->module_type, 'entity_id' => $entity->id, 'is_returned' => true]
            );

            return $entity;
        });
    }

    private function publishReturnedProject(Draft $draft, array $data, User $user): Project
    {
        if ($draft->original_record_id) {
            $project = Project::findOrFail($draft->original_record_id);
            $project->update([
                'title' => $data['title'] ?? $project->title,
                'description' => $data['description'] ?? $project->description,
                'priority' => $data['priority'] ?? $project->priority,
                'status' => $data['status'] ?? $project->status,
                'client_name' => $data['client_name'] ?? $project->client_name,
                'budget' => $data['budget'] ?? $project->budget,
                'team_ids' => $data['team_ids'] ?? $project->team_ids,
                'assigned_users' => $data['assigned_users'] ?? $project->assigned_users,
                'updated_by' => $user->id,
            ]);
            return $project;
        }

        $project = Project::create([
            'title' => $data['title'] ?? 'Untitled Project',
            'description' => $data['description'] ?? '',
            'priority' => $data['priority'] ?? 'Medium',
            'status' => $data['status'] ?? 'Planning',
            'client_name' => $data['client_name'] ?? '',
            'budget' => $data['budget'] ?? null,
            'team_ids' => $data['team_ids'] ?? [],
            'assigned_users' => $data['assigned_users'] ?? [],
            'created_by' => $user->id,
            'updated_by' => $user->id,
        ]);

        return $project;
    }

    private function publishReturnedTask(Draft $draft, array $data, User $user): Task
    {
        $assigneeIds = $data['assigned_to'] ?? [];

        $taskData = [
            'title' => $data['title'] ?? 'Untitled Task',
            'description' => $data['description'] ?? '',
            'priority' => $data['priority'] ?? 'Medium',
            'status' => $data['status'] ?? 'pending',
            'project_id' => $data['project_id'] ?? null,
            'start_date' => $data['start_date'] ?? null,
            'end_date' => $data['end_date'] ?? null,
            'requirements' => $data['requirements'] ?? null,
            'assigned_to' => $data['assigned_to'] ?? null,
            'assigned_by' => $user->id,
            'updated_by' => $user->id,
        ];

        if ($draft->original_record_id) {
            $task = Task::findOrFail($draft->original_record_id);
            $task->update($taskData);

            if (!empty($assigneeIds)) {
                $ids = is_array($assigneeIds) ? $assigneeIds : [$assigneeIds];
                $task->assignees()->sync($ids);
            }

            return $task;
        }

        $task = Task::create($taskData);

        if (!empty($assigneeIds)) {
            $ids = is_array($assigneeIds) ? $assigneeIds : [$assigneeIds];
            $task->assignees()->sync($ids);
        }

        return $task;
    }

    private function publishReturnedDeliverable(Draft $draft, array $data, User $user): Deliverable
    {
        $assigneeIds = $data['assigned_to'] ?? [];

        $deliverableData = [
            'title' => $data['title'] ?? 'Untitled Subtask',
            'description' => $data['description'] ?? '',
            'priority' => $data['priority'] ?? 'Medium',
            'status' => $data['status'] ?? 'pending',
            'project_id' => $data['project_id'] ?? null,
            'task_id' => $data['task_id'] ?? null,
            'start_date' => $data['start_date'] ?? null,
            'due_date' => $data['due_date'] ?? null,
            'assigned_to' => $data['assigned_to'] ?? null,
            'created_by' => $user->id,
            'updated_by' => $user->id,
        ];

        if ($draft->original_record_id) {
            $deliverable = Deliverable::findOrFail($draft->original_record_id);
            $deliverable->update($deliverableData);

            if (!empty($assigneeIds)) {
                $ids = is_array($assigneeIds) ? $assigneeIds : [$assigneeIds];
                $deliverable->assignees()->sync($ids);
            }

            return $deliverable;
        }

        $deliverable = Deliverable::create($deliverableData);

        if (!empty($assigneeIds)) {
            $ids = is_array($assigneeIds) ? $assigneeIds : [$assigneeIds];
            $deliverable->assignees()->sync($ids);
        }

        return $deliverable;
    }

    private function publishReturnedEvent(Draft $draft, array $data, User $user): \App\Models\Event
    {
        $eventType = $data['eventType'] ?? $data['event_type'] ?? $data['type'] ?? 'Other';
        $assignedUserIds = $data['assignedUserIds'] ?? $data['assigned_users'] ?? [];

        $startDate = null;
        if (!empty($data['startDate'])) {
            $startDate = $data['startDate'];
            if (!empty($data['startTime'])) {
                $startDate .= ' ' . $data['startTime'];
            }
        } elseif (!empty($data['start_date'])) {
            $startDate = $data['start_date'];
        }

        $endDate = null;
        if (!empty($data['endDate']) && !empty($data['hasEndDate'])) {
            $endDate = $data['endDate'];
            if (!empty($data['endTime'])) {
                $endDate .= ' ' . $data['endTime'];
            }
        } elseif (!empty($data['end_date'])) {
            $endDate = $data['end_date'];
        }

        $colorMap = [
            'Meeting' => '#6366f1', 'Training' => '#3b82f6', 'Workshop' => '#8b5cf6',
            'Client Meeting' => '#f59e0b', 'Company Event' => '#22c55e', 'Holiday' => '#ef4444',
            'Interview' => '#ec4899', 'Project Milestone' => '#14b8a6',
            'Internship Activity' => '#06b6d4', 'Other' => '#6b7280',
        ];
        $color = $data['color'] ?? $colorMap[$eventType] ?? '#4f46e5';

        $eventData = [
            'title' => $data['title'] ?? 'Untitled Event',
            'description' => $data['description'] ?? '',
            'type' => $eventType,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'all_day' => $data['allDay'] ?? $data['all_day'] ?? false,
            'color' => $color,
            'user_id' => $user->id,
        ];

        if ($draft->original_record_id) {
            $event = \App\Models\Event::findOrFail($draft->original_record_id);
            $event->update($eventData);

            if (!empty($assignedUserIds)) {
                $event->assignedUsers()->sync($assignedUserIds);
            }

            return $event;
        }

        $event = \App\Models\Event::create($eventData);

        if (!empty($assignedUserIds)) {
            $event->assignedUsers()->sync($assignedUserIds);
        }

        return $event;
    }
}
