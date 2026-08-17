<?php

namespace App\Http\Controllers;

use App\Models\Deliverable;
use App\Models\Event;
use App\Models\Notification;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use App\Services\ActivityService;
use App\Services\AuditService;
use App\Services\NotificationService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/**
 * Controller for managing calendar events.
 * Provides CRUD operations for manual events, a unified calendar view
 * aggregating tasks, projects, deliverables, and manual events,
 * and a summary endpoint for today's and upcoming events.
 * Sends notifications to assigned users on event creation, update, and deletion.
 */
class EventController extends Controller
{
    public function __construct(
        private NotificationService $notificationService,
        private ActivityService $activityService,
        private AuditService $auditService
    ) {}

    /**
     * List all events visible to the authenticated user with pagination.
     *
     * Non-admin/manager users only see events they are assigned to.
     * Supports 'all' query param to return all events without pagination.
     *
     * @param  Request  $request  Query parameters: 'all', filter params.
     * @return JsonResponse JSON response with paginated or full event list.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $query = Event::with('user:id,name', 'assignedUsers:id,name')
            ->latest('start_date')
            ->filter($request->query());

        if (! in_array($user->role, ['admin', 'manager'])) {
            $query->whereHas('assignedUsers', function ($q) use ($user) {
                $q->where('user_id', $user->id);
            });
        }

        if ($request->boolean('all')) {
            $events = $query->limit(500)->get();

            return response()->json(['data' => $events->map(fn ($event) => $this->formatEventResponse($event))]);
        }

        $events = $query->paginate(50);
        $events->getCollection()->transform(fn ($event) => $this->formatEventResponse($event));

        return response()->json($events);
    }

    /**
     * Get a unified calendar view combining tasks, projects, deliverables, and manual events.
     *
     * Filters by date range (from/to) and optional search term. Returns all items
     * relevant to the authenticated user in a normalized calendar event format.
     *
     * @param  Request  $request  Query parameters: from, to, search.
     * @return JsonResponse JSON response with unified event list and metadata counts.
     */
    public function unifiedCalendar(Request $request)
    {
        $user = $request->user();
        $startDate = $request->input('from');
        $endDate = $request->input('to');
        $search = $request->input('search');

        $events = collect();

        // Tasks
        $taskQuery = Task::where(function ($q) use ($user) {
            if ($user->role === 'guest') {
                $q->whereHas('project', fn ($pq) => $pq->whereJsonContains('guest_ids', $user->id));
            } else {
                $q->where('assigned_to', $user->id)
                    ->orWhereHas('assignees', fn ($aq) => $aq->where('user_id', $user->id))
                    ->orWhereHas('project', fn ($pq) => $pq->whereJsonContains('assigned_users', $user->id));
            }
        })->select(['id', 'title', 'description', 'start_date', 'end_date', 'assigned_to', 'assigned_by', 'project_id', 'status', 'priority', 'created_at', 'updated_at'])
            ->with(['project:id,title', 'assignee:id,name', 'assigner:id,name']);

        if ($search) {
            $taskQuery->where('title', 'like', '%'.$search.'%');
        }
        if ($startDate && $endDate) {
            $taskQuery->where(function ($q) use ($startDate, $endDate) {
                $q->whereBetween('start_date', [$startDate, $endDate])
                    ->orWhereBetween('end_date', [$startDate, $endDate])
                    ->orWhere(fn ($q2) => $q2->whereDate('start_date', '<=', $startDate)->whereDate('end_date', '>=', $endDate));
            });
        }
        $tasks = $taskQuery->limit(500)->get();

        // Projects
        if ($user->role === 'guest') {
            $projectQuery = Project::whereJsonContains('guest_ids', $user->id)
                ->select(['id', 'title', 'description', 'start_date', 'end_date', 'assigned_users', 'status', 'priority', 'created_by'])
                ->with(['creator:id,name']);
        } else {
            $projectQuery = Project::whereJsonContains('assigned_users', $user->id)
                ->select(['id', 'title', 'description', 'start_date', 'end_date', 'assigned_users', 'status', 'priority', 'created_by'])
                ->with(['creator:id,name']);
        }

        if ($startDate && $endDate) {
            $projectQuery->where(function ($q) use ($startDate, $endDate) {
                $q->whereBetween('start_date', [$startDate, $endDate])
                    ->orWhereBetween('end_date', [$startDate, $endDate])
                    ->orWhere(fn ($q2) => $q2->whereDate('start_date', '<=', $startDate)->whereDate('end_date', '>=', $endDate));
            });
        }
        if ($search) {
            $projectQuery->where('title', 'like', '%'.$search.'%');
        }
        $projects = $projectQuery->limit(500)->get();

        // Deliverables
        if ($user->role === 'guest') {
            $deliverableQuery = Deliverable::whereHas('project', fn ($q) => $q->whereJsonContains('guest_ids', $user->id))
                ->select(['id', 'title', 'description', 'due_date', 'assigned_to', 'created_by', 'project_id', 'task_id', 'status', 'priority', 'submitted_at', 'approved_at', 'rejected_at'])
                ->with(['project:id,title', 'assignee:id,name', 'creator:id,name']);
        } else {
            $deliverableQuery = Deliverable::where('assigned_to', $user->id)
                ->select(['id', 'title', 'description', 'due_date', 'assigned_to', 'created_by', 'project_id', 'task_id', 'status', 'priority', 'submitted_at', 'approved_at', 'rejected_at'])
                ->with(['project:id,title', 'assignee:id,name', 'creator:id,name']);
        }

        if ($search) {
            $deliverableQuery->where('title', 'like', '%'.$search.'%');
        }
        if ($startDate && $endDate) {
            $deliverableQuery->whereBetween('due_date', [$startDate, $endDate]);
        }
        $deliverables = $deliverableQuery->limit(500)->get();

        // Manual Events
        $manualEventsQuery = Event::with(['user:id,name', 'assignedUsers:id']);
        if (! in_array($user->role, ['admin', 'manager'])) {
            $manualEventsQuery->where(fn ($q) => $q->where('is_global', true)->orWhereHas('assignedUsers', fn ($aq) => $aq->where('user_id', $user->id)));
        }
        if ($startDate && $endDate) {
            $manualEventsQuery->where(function ($q) use ($startDate, $endDate) {
                $q->whereBetween('start_date', [$startDate, $endDate])
                    ->orWhereBetween('end_date', [$startDate, $endDate])
                    ->orWhere(fn ($q2) => $q2->whereDate('start_date', '<=', $startDate)->whereDate('end_date', '>=', $endDate));
            });
        }
        $manualEvents = $manualEventsQuery->limit(500)->get();

        // Transform in bulk
        foreach ($tasks as $task) {
            $events->push($this->toCalendarEvent('task', $task->id, $task, ['assignee_name' => $task->assignee?->name, 'assigner_name' => $task->assigner?->name, 'project_title' => $task->project?->title]));
        }
        foreach ($projects as $project) {
            $events->push($this->toCalendarEvent('project', $project->id, $project, ['creator_name' => $project->creator?->name]));
        }
        foreach ($deliverables as $deliverable) {
            $events->push($this->toCalendarEvent('deliverable', $deliverable->id, $deliverable, ['assigned_by_name' => $deliverable->assignee?->name, 'created_by_name' => $deliverable->creator?->name, 'project_title' => $deliverable->project?->title]));
        }
        foreach ($manualEvents as $event) {
            $events->push($this->formatManualEvent($event));
        }

        return response()->json([
            'data' => $events->sortBy('date')->values()->toArray(),
            'meta' => [
                'total_tasks' => $tasks->count(), 'total_projects' => $projects->count(),
                'total_deliverables' => $deliverables->count(), 'total_manual_events' => $manualEvents->count(),
                'total_unified_events' => $events->count(),
            ],
        ]);
    }

    /**
     * Get a summary of today's and upcoming events from the unified calendar.
     *
     * Returns events split into 'today' and 'upcoming' categories, cached for 60 seconds.
     *
     * @param  Request  $request  Query parameter: local_date (YYYY-MM-DD, defaults to today).
     * @return JsonResponse JSON response with today and upcoming event arrays.
     */
    public function unifiedSummary(Request $request)
    {
        $user = $request->user();
        $today = $request->input('local_date', date('Y-m-d'));

        $cacheKey = "unified_summary_{$user->id}_{$today}";

        return Cache::remember($cacheKey, 30, function () use ($user, $today) {
            $events = collect();

            $tasks = Task::where(function ($q) use ($user) {
                $q->where('assigned_to', $user->id)
                    ->orWhereHas('assignees', fn ($aq) => $aq->where('user_id', $user->id))
                    ->orWhereHas('project', fn ($pq) => $pq->whereJsonContains('assigned_users', $user->id));
            })->where(function ($q) use ($today) {
                $q->whereDate('start_date', '>=', $today)->orWhereDate('end_date', '>=', $today);
            })->select(['id', 'title', 'description', 'start_date', 'end_date', 'assigned_to', 'assigned_by', 'project_id', 'status', 'priority', 'created_at', 'updated_at'])
                ->with(['project:id,title', 'assignee:id,name', 'assigner:id,name'])->get();

            $projects = Project::whereJsonContains('assigned_users', $user->id)
                ->where(function ($q) use ($today) {
                    $q->whereDate('start_date', '>=', $today)->orWhereDate('end_date', '>=', $today);
                })->select(['id', 'title', 'description', 'start_date', 'end_date', 'assigned_users', 'status', 'priority', 'created_by'])
                ->with(['creator:id,name'])->get();

            $deliverables = Deliverable::where('assigned_to', $user->id)
                ->whereDate('due_date', '>=', $today)
                ->select(['id', 'title', 'description', 'due_date', 'assigned_to', 'created_by', 'project_id', 'task_id', 'status', 'priority', 'submitted_at', 'approved_at', 'rejected_at'])
                ->with(['project:id,title', 'assignee:id,name', 'creator:id,name'])->get();

            $manualEventsQuery = Event::with(['user:id,name', 'assignedUsers:id']);
            if (! in_array($user->role, ['admin', 'manager'])) {
                $manualEventsQuery->where(fn ($q) => $q->where('is_global', true)->orWhereHas('assignedUsers', fn ($aq) => $aq->where('user_id', $user->id)));
            }
            $manualEvents = $manualEventsQuery->where(function ($q) use ($today) {
                $q->whereDate('start_date', '>=', $today)->orWhereDate('end_date', '>=', $today);
            })->get();

            foreach ($tasks as $task) {
                $events->push($this->toCalendarEvent('task', $task->id, $task, ['assignee_name' => $task->assignee?->name, 'assigner_name' => $task->assigner?->name, 'project_title' => $task->project?->title]));
            }
            foreach ($projects as $project) {
                $events->push($this->toCalendarEvent('project', $project->id, $project, ['creator_name' => $project->creator?->name]));
            }
            foreach ($deliverables as $deliverable) {
                $events->push($this->toCalendarEvent('deliverable', $deliverable->id, $deliverable, ['assigned_by_name' => $deliverable->assignee?->name, 'created_by_name' => $deliverable->creator?->name, 'project_title' => $deliverable->project?->title]));
            }
            foreach ($manualEvents as $event) {
                $events->push($this->formatManualEvent($event));
            }

            $todayEvents = $events->filter(fn ($ev) => substr($ev['start_date'] ?? $ev['date'] ?? '', 0, 10) === $today)->values();
            $upcomingEvents = $events->filter(function ($ev) use ($today) {
                $date = substr($ev['start_date'] ?? $ev['date'] ?? '', 0, 10);

                return $date !== '' && $date > $today;
            })->values();

            return [
                'today' => $todayEvents->sortBy(fn ($ev) => $ev['start_date'] ?? $ev['date'] ?? '')->values()->toArray(),
                'upcoming' => $upcomingEvents->sortBy(fn ($ev) => $ev['start_date'] ?? $ev['date'] ?? '')->values()->toArray(),
            ];
        });
    }

    private function toCalendarEvent(string $source, $id, $model, array $extra = []): array
    {
        $isProject = $source === 'project';
        $isDeliverable = $source === 'deliverable';

        return array_merge([
            'id' => $source.'-'.$id,
            'source' => $source,
            'type' => $source,
            'title' => $model->title,
            'description' => $model->description,
            'date' => $this->fmtDate($isDeliverable ? $model->due_date : ($model->start_date ?? $model->end_date)),
            'start_date' => $this->fmtDate($isProject || $isDeliverable ? ($model->start_date ?? $model->due_date) : $model->start_date),
            'end_date' => $this->fmtDate($isProject ? $model->end_date : ($isDeliverable ? $model->due_date : $model->end_date)),
            'status' => $model->status ?? ($model->type ?? $source),
            'priority' => $model->priority ?? null,
            'created_at' => $this->fmtDate($model->created_at),
            'updated_at' => $this->fmtDate($model->updated_at),
        ], $extra);
    }

    private function formatManualEvent(Event $event): array
    {
        return [
            'id' => $event->id, 'source' => 'manual', 'type' => $event->type,
            'title' => $event->title, 'user_id' => $event->user_id, 'created_by' => $event->user_id,
            'description' => $event->description,
            'date' => $this->fmtDate($event->start_date),
            'start_date' => $this->fmtDate($event->start_date),
            'end_date' => $this->fmtDate($event->end_date),
            'status' => $event->type, 'priority' => null,
            'user_name' => $event->user?->name,
            'type_name' => $this->getEventTypeLabel($event->type),
            'created_at' => $this->fmtDate($event->created_at),
            'updated_at' => $this->fmtDate($event->updated_at),
            'all_day' => $event->all_day, 'color' => $event->color,
            'is_global' => (bool) $event->is_global,
            'assigned_user_ids' => $event->assignedUsers->pluck('id')->toArray(),
        ];
    }

    /**
     * Retrieve a single event by ID.
     *
     * Non-admin/manager users can only view global events or events they are assigned to.
     *
     * @param  Event  $event  The event to retrieve.
     * @return JsonResponse JSON response with the formatted event or 403.
     */
    public function show(Event $event)
    {
        $user = request()->user();
        $event->load('assignedUsers');

        if (! in_array($user->role, ['admin', 'manager'])) {
            if (! $event->is_global && ! $event->assignedUsers->contains('id', $user->id)) {
                return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
            }
        }

        return response()->json(['success' => true, 'event' => $this->formatEventResponse($event)]);
    }

    /**
     * Create a new calendar event. Only admin/manager roles can create events.
     *
     * Sends notifications to all assigned users (or all active users for global events).
     *
     * @param  Request  $request  Validated input: title, description, type, color, start_date, end_date, all_day, is_global, assigned_user_ids.
     * @return JsonResponse JSON response with the created event.
     */
    public function store(Request $request)
    {
        $user = $request->user();
        if (! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'title' => 'required|string|max:255', 'description' => 'nullable|string',
            'type' => 'nullable|string|max:64',
            'color' => 'nullable|string|max:16', 'start_date' => 'required|date',
            'end_date' => 'nullable|date|after_or_equal:start_date', 'all_day' => 'nullable|boolean',
            'is_global' => 'nullable|boolean', 'assigned_user_ids' => 'nullable|array',
            'assigned_user_ids.*' => 'integer|exists:users,id',
        ]);

        $event = Event::create([
            'user_id' => $user->id, 'title' => $validated['title'],
            'description' => $validated['description'] ?? null, 'type' => $validated['type'] ?? 'Meeting',
            'color' => $validated['color'] ?? null, 'start_date' => $validated['start_date'],
            'end_date' => $validated['end_date'] ?? null, 'all_day' => $validated['all_day'] ?? false,
            'is_global' => $validated['is_global'] ?? false,
        ]);

        if (! ($validated['is_global'] ?? false) && ! empty($validated['assigned_user_ids'])) {
            $event->assignedUsers()->sync($validated['assigned_user_ids']);
        }

        $this->sendBulkEventNotification($event, $user, 'event_created', 'Event Assigned');

        // Send confirmation email to performer
        $assignedCount = count($validated['assigned_user_ids'] ?? []);
        $this->notificationService->confirmAction($user, 'Created', 'event', $event->title, [
            'Assigned To' => $assignedCount > 0 ? $assignedCount.' user(s)' : 'All users (global event)',
            'Date' => $event->start_date ? Carbon::parse($event->start_date)->format('d M Y, g:i A') : 'N/A',
        ]);

        // Log activity
        $activityDesc = $assignedCount > 0
            ? 'You created event "'.$event->title.'" and assigned it to '.$assignedCount.' user(s)'
            : 'You created event "'.$event->title.'"';
        $this->activityService->log($user->id, 'event_created', $activityDesc, 'event', $event->id);

        try {
            $this->auditService->log(
                module: 'event_management',
                action: 'create',
                description: "Created event {$event->title}",
                user: $user,
                entityType: 'Event',
                entityId: $event->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        return response()->json(['success' => true, 'message' => 'Event created successfully', 'event' => $this->formatEventResponse($event->fresh())], 201);
    }

    /**
     * Update an existing calendar event. Only admin/manager roles can update events.
     *
     * Syncs assigned user relationships and sends notifications to affected users.
     *
     * @param  Request  $request  Validated input for updatable fields.
     * @param  Event  $event  The event to update.
     * @return JsonResponse JSON response with the updated event.
     */
    public function update(Request $request, Event $event)
    {
        $user = $request->user();
        if (! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'title' => 'sometimes|required|string|max:255', 'description' => 'sometimes|nullable|string',
            'type' => 'sometimes|string|max:64',
            'color' => 'sometimes|nullable|string|max:16', 'start_date' => 'sometimes|required|date',
            'end_date' => 'sometimes|nullable|date|after_or_equal:start_date', 'all_day' => 'sometimes|nullable|boolean',
            'is_global' => 'sometimes|boolean', 'assigned_user_ids' => 'nullable|array',
            'assigned_user_ids.*' => 'integer|exists:users,id',
        ]);

        $event->update([
            'title' => $validated['title'] ?? $event->title, 'description' => $validated['description'] ?? $event->description,
            'type' => $validated['type'] ?? $event->type, 'color' => $validated['color'] ?? $event->color,
            'start_date' => $validated['start_date'] ?? $event->start_date, 'end_date' => $validated['end_date'] ?? $event->end_date,
            'all_day' => $validated['all_day'] ?? $event->all_day, 'is_global' => $validated['is_global'] ?? $event->is_global,
        ]);

        if (array_key_exists('assigned_user_ids', $validated)) {
            if ($event->is_global) {
                $event->assignedUsers()->detach();
            } else {
                $event->assignedUsers()->sync($validated['assigned_user_ids'] ?? []);
            }
        }

        $this->sendBulkEventNotification($event, $user, 'event_updated', 'Event Updated');

        // Send confirmation email to performer
        $this->notificationService->confirmAction($user, 'Updated', 'event', $event->title, [
            'Date' => $event->start_date ? Carbon::parse($event->start_date)->format('d M Y, g:i A') : 'N/A',
        ]);

        // Log activity
        $this->activityService->log($user->id, 'event_updated', 'You updated event "'.$event->title.'"', 'event', $event->id);

        try {
            $this->auditService->log(
                module: 'event_management',
                action: 'update',
                description: "Updated event {$event->title}",
                user: $user,
                entityType: 'Event',
                entityId: $event->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        return response()->json(['success' => true, 'message' => 'Event updated successfully', 'event' => $this->formatEventResponse($event->fresh())]);
    }

    /**
     * Delete a calendar event. Only admin/manager roles can delete events.
     *
     * Sends cancellation notifications to all assigned users before deletion.
     *
     * @param  Event  $event  The event to delete.
     * @return JsonResponse JSON response confirming deletion.
     */
    public function destroy(Event $event)
    {
        $user = request()->user();
        if (! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $this->sendBulkEventNotification($event, $user, 'event_cancelled', 'Event Cancelled');

        // Send confirmation email to performer
        $this->notificationService->confirmAction($user, 'Cancelled', 'event', $event->title, [
            'Original Date' => $event->start_date ? Carbon::parse($event->start_date)->format('d M Y, g:i A') : 'N/A',
        ]);

        // Log activity
        $this->activityService->log($user->id, 'event_cancelled', 'You cancelled event "'.$event->title.'"', 'event', $event->id);

        try {
            $this->auditService->log(
                module: 'event_management',
                action: 'delete',
                description: "Deleted event {$event->title}",
                user: $user,
                entityType: 'Event',
                entityId: $event->id,
                status: 'success'
            );
        } catch (\Throwable $e) {
            \Log::error('Failed to log audit', ['error' => $e->getMessage()]);
        }

        $event->delete();

        return response()->json(['success' => true, 'message' => 'Event deleted successfully']);
    }

    /**
     * Send bulk notifications to all event recipients, avoiding duplicates within 5 minutes.
     *
     * @param  Event  $event  The event triggering the notification.
     * @param  User  $sender  The user who performed the action.
     * @param  string  $type  The notification type (event_created, event_updated, event_cancelled).
     * @param  string  $title  The notification title.
     */
    private function sendBulkEventNotification(Event $event, User $sender, string $type, string $title): void
    {
        $recipientIds = $this->getEventRecipientIds($event);
        $notifications = [];

        // Single bulk EXISTS check instead of per-recipient
        $existingUserIds = Notification::whereIn('user_id', $recipientIds)->where('type', $type)
            ->where('related_module', 'event')->where('related_id', $event->id)
            ->where('created_at', '>=', now()->subMinutes(5))
            ->pluck('user_id')->toArray();

        foreach ($recipientIds as $recipientId) {
            if ((int) $recipientId === (int) $sender->id) {
                continue;
            }
            if (in_array((int) $recipientId, $existingUserIds, true)) {
                continue;
            }

            $notifications[] = [
                'user_id' => $recipientId, 'sender_user_id' => $sender->id,
                'type' => $type, 'related_module' => 'event', 'related_id' => $event->id,
                'title' => $title, 'message' => $this->buildEventMessage($event, $sender, $type),
                'link' => '/calender',
            ];
        }

        $this->notificationService->createBulk($notifications);
    }

    /**
     * Get all user IDs that should receive notifications for an event.
     *
     * Returns all active users for global events, or the assigned user IDs for non-global events.
     *
     * @param  Event  $event  The event to get recipients for.
     * @return array Array of user IDs.
     */
    private function getEventRecipientIds(Event $event): array
    {
        if ($event->is_global) {
            return User::where('active', true)->pluck('id')->toArray();
        }
        $assignedIds = $event->assignedUsers()->pluck('user_id')->toArray();

        return ! empty($assignedIds) ? $assignedIds : [$event->user_id];
    }

    /**
     * Format an event model into a standardized API response array.
     *
     * @param  Event  $event  The event to format.
     * @return array Formatted event data.
     */
    private function formatEventResponse(Event $event): array
    {
        $event->loadMissing('user:id,name', 'assignedUsers:id,name');

        return [
            'id' => $event->id, 'source' => 'manual', 'type' => $event->type,
            'title' => $event->title, 'description' => $event->description,
            'event_type' => $event->type, 'event_date' => $event->start_date?->format('Y-m-d'),
            'start_date' => $event->start_date?->format('Y-m-d\TH:i:s'),
            'end_date' => $event->end_date?->format('Y-m-d\TH:i:s'),
            'all_day' => (bool) $event->all_day, 'color' => $event->color,
            'is_global' => (bool) $event->is_global, 'user_id' => $event->user_id,
            'creator_name' => $event->user?->name,
            'assigned_users' => $event->assignedUsers->map(fn ($u) => ['id' => $u->id, 'name' => $u->name])->toArray(),
            'created_at' => $event->created_at?->toIso8601String(),
            'updated_at' => $event->updated_at?->toIso8601String(),
        ];
    }

    /**
     * Format a date value to ISO 8601 format, or return null if empty.
     *
     * @param  mixed  $date  A Carbon instance or date string.
     * @return string|null Formatted date string or null.
     */
    private function fmtDate($date): ?string
    {
        return $date ? (is_string($date) ? $date : $date->format('Y-m-d\TH:i:s')) : null;
    }

    /**
     * Get a human-readable label for an event type.
     *
     * @param  string  $type  The event type key.
     * @return string The display label for the event type.
     */
    private function getEventTypeLabel(string $type): string
    {
        return ['Meeting' => 'Meeting', 'Training' => 'Training', 'Workshop' => 'Workshop', 'Client Meeting' => 'Client Meeting',
            'Company Event' => 'Company Event', 'Holiday' => 'Holiday', 'Interview' => 'Interview',
            'Project Milestone' => 'Project Milestone', 'Internship Activity' => 'Internship Activity', 'Other' => 'Other'][$type] ?? $type;
    }

    /**
     * Build a notification message based on the event type and sender.
     *
     * @param  Event  $event  The event.
     * @param  User  $sender  The user who triggered the event.
     * @param  string  $type  The notification type.
     * @return string The formatted notification message.
     */
    private function buildEventMessage(Event $event, User $sender, string $type): string
    {
        return match ($type) {
            'event_created' => "A new event '{$event->title}' has been assigned to you by {$sender->name}.",
            'event_updated' => "The event '{$event->title}' has been updated. Please review the latest details.",
            'event_cancelled' => "The event '{$event->title}' has been cancelled.",
            default => "Event notification: '{$event->title}'.",
        };
    }
}
