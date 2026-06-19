<?php

namespace App\Http\Controllers;

use App\Models\Event;
use App\Models\Notification;
use App\Models\Task;
use App\Models\Project;
use App\Models\Deliverable;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class EventController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $query = Event::with('user:id,name', 'assignedUsers:id,name')
            ->latest('start_date')
            ->filter($request->query());

        // Role-based visibility: Admin/Manager see all, TL/Member see only assigned
        if (!in_array($user->role, ['admin', 'manager'])) {
            $query->whereHas('assignedUsers', function ($q) use ($user) {
                $q->where('user_id', $user->id);
            });
        }

        if ($request->boolean('all')) {
            $events = $query->get();
            return response()->json([
                'data' => $events->map(function ($event) {
                    return $this->formatEventResponse($event);
                }),
            ]);
        }

        $events = $query->paginate(50);
        $events->getCollection()->transform(function ($event) {
            return $this->formatEventResponse($event);
        });
        return response()->json($events);
    }

    public function unifiedCalendar(Request $request)
    {
        $user = $request->user();
        $startDate = $request->input('from');
        $endDate = $request->input('to');
        $search = $request->input('search');
        
        $events = collect();

        $taskQuery = Task::query()
            ->where(function ($q) use ($user) {
                $q->where('assigned_to', $user->id)
                  ->orWhereHas('assignees', function ($aq) use ($user) {
                      $aq->where('user_id', $user->id);
                  })->orWhereHas('project', function ($pq) use ($user) {
                      $pq->whereJsonContains('assigned_users', $user->id);
                  });
            })
            ->select([
                'id','title','description','start_date','end_date','assigned_to','assigned_by','project_id','status','priority','created_at','updated_at'
            ])->with(['project:id,title','assignee:id,name','assigner:id,name']);

        if ($search) {
            $taskQuery->where('title', 'like', '%' . $search . '%');
        }

        if ($startDate && $endDate) {
            $taskQuery->where(function ($q) use ($startDate, $endDate) {
                $q->whereBetween('start_date', [$startDate, $endDate])
                  ->orWhereBetween('end_date', [$startDate, $endDate])
                  ->orWhere(function ($q2) use ($startDate, $endDate) {
                      $q2->whereDate('start_date', '<=', $startDate)
                         ->whereDate('end_date', '>=', $endDate);
                  });
            });
        }

        $tasks = $taskQuery->get();

        $projectQuery = Project::query()
            ->whereJsonContains('assigned_users', $user->id)
            ->select(['id','title','description','start_date','end_date','assigned_users','status','priority','created_by'])
            ->with(['creator:id,name']);

        if ($startDate && $endDate) {
            $projectQuery->where(function ($q) use ($startDate, $endDate) {
                $q->whereBetween('start_date', [$startDate, $endDate])
                  ->orWhereBetween('end_date', [$startDate, $endDate])
                  ->orWhere(function ($q2) use ($startDate, $endDate) {
                      $q2->whereDate('start_date', '<=', $startDate)
                         ->whereDate('end_date', '>=', $endDate);
                  });
            });
        }

        if ($search) {
            $projectQuery->where('title', 'like', '%' . $search . '%');
        }

        $projects = $projectQuery->get();

        $deliverableQuery = Deliverable::query()
            ->where('assigned_to', $user->id)
            ->select(['id','title','description','due_date','assigned_to','created_by','project_id','task_id','status','priority','submitted_at','approved_at','rejected_at'])
            ->with(['project:id,title','assignee:id,name','creator:id,name']);

        if ($search) {
            $deliverableQuery->where('title', 'like', '%' . $search . '%');
        }

        if ($startDate && $endDate) {
            $deliverableQuery->whereBetween('due_date', [$startDate, $endDate]);
        }

        $deliverables = $deliverableQuery->get();

        foreach ($tasks as $task) {
            $events->push([
                'id' => 'task-' . $task->id,
                'source' => 'task',
                'type' => 'task',
                'title' => $task->title,
                'description' => $task->description,
                'date' => $task->start_date ?? $task->end_date,
                'start_date' => $task->start_date,
                'end_date' => $task->end_date,
                'status' => $task->status,
                'priority' => $task->priority,
                'assigned_to' => $task->assigned_to,
                'assigned_by' => $task->assigned_by,
                'project_id' => $task->project_id,
                'assignee_name' => $task->assignee ? $task->assignee->name : null,
                'assigner_name' => $task->assigner ? $task->assigner->name : null,
                'project_title' => $task->project ? $task->project->title : null,
                'created_at' => $task->created_at,
                'updated_at' => $task->updated_at,
            ]);
        }

        foreach ($projects as $project) {
            $events->push([
                'id' => 'project-' . $project->id,
                'source' => 'project',
                'type' => 'project',
                'title' => $project->title,
                'description' => $project->description,
                'date' => $project->start_date ?? $project->end_date,
                'start_date' => $project->start_date,
                'end_date' => $project->end_date,
                'status' => $project->status,
                'priority' => $project->priority,
                'assigned_users' => $project->assigned_users,
                'created_by' => $project->created_by,
                'creator_name' => $project->creator ? $project->creator->name : null,
                'created_at' => $project->created_at,
                'updated_at' => $project->updated_at,
            ]);
        }

        foreach ($deliverables as $deliverable) {
            $events->push([
                'id' => 'deliverable-' . $deliverable->id,
                'source' => 'deliverable',
                'type' => 'deliverable',
                'title' => $deliverable->title,
                'description' => $deliverable->description,
                'date' => $deliverable->due_date,
                'start_date' => $deliverable->due_date,
                'end_date' => $deliverable->due_date,
                'status' => $deliverable->status,
                'priority' => $deliverable->priority,
                'assigned_to' => $deliverable->assigned_to,
                'created_by' => $deliverable->created_by,
                'assigned_by_name' => $deliverable->assignee ? $deliverable->assignee->name : null,
                'created_by_name' => $deliverable->creator ? $deliverable->creator->name : null,
                'project_id' => $deliverable->project_id,
                'task_id' => $deliverable->task_id,
                'project_title' => $deliverable->project ? $deliverable->project->title : null,
                'submitted_at' => $deliverable->submitted_at,
                'approved_at' => $deliverable->approved_at,
                'rejected_at' => $deliverable->rejected_at,
                'created_at' => $deliverable->created_at,
                'updated_at' => $deliverable->updated_at,
            ]);
        }

        $manualEventsQuery = Event::with(['user:id,name','assignedUsers:id']);
        // Role-based visibility
        if (in_array($user->role, ['admin', 'manager'])) {
            // Admin/Manager see all events
        } else {
            // Team Lead/Member see only assigned events
            $manualEventsQuery->where(function ($q) use ($user) {
                $q->where('is_global', true)
                  ->orWhereHas('assignedUsers', function ($aq) use ($user) {
                      $aq->where('user_id', $user->id);
                  });
            });
        }

        if ($startDate && $endDate) {
            $manualEventsQuery->where(function ($q) use ($startDate, $endDate) {
                $q->whereBetween('start_date', [$startDate, $endDate])
                  ->orWhereBetween('end_date', [$startDate, $endDate])
                  ->orWhere(function ($q2) use ($startDate, $endDate) {
                      $q2->whereDate('start_date', '<=', $startDate)
                         ->whereDate('end_date', '>=', $endDate);
                  });
            });
        }

        $manualEvents = $manualEventsQuery->get();

        foreach ($manualEvents as $event) {
            $events->push([
                'id' => $event->id,
                'source' => 'manual',
                'type' => $event->type,
                'title' => $event->title,
                'user_id' => $event->user_id,
                'created_by' => $event->user_id,
                'description' => $event->description,
                'date' => $event->start_date,
                'start_date' => $event->start_date,
                'end_date' => $event->end_date,
                'status' => $event->type,
                'priority' => null,
                'assigned_to' => $event->is_global ? null : $event->assignedUsers->pluck('id')->toArray(),
                'created_by' => $event->user_id,
                'user_name' => $event->user ? $event->user->name : null,
                'type_name' => $this->getEventTypeLabel($event->type),
                'created_at' => $event->created_at,
                'updated_at' => $event->updated_at,
                'all_day' => $event->all_day,
                'color' => $event->color,
                'is_global' => (bool) $event->is_global,
                'assigned_user_ids' => $event->assignedUsers->pluck('id')->toArray(),
            ]);
        }

        $allEvents = $events->sortBy('date')->values()->toArray();

        return response()->json([
            'data' => $allEvents,
            'meta' => [
                'total_tasks' => $tasks->count(),
                'total_projects' => $projects->count(),
                'total_deliverables' => $deliverables->count(),
                'total_manual_events' => $manualEvents->count(),
                'total_unified_events' => count($allEvents),
            ]
        ]);
    }

    /**
     * Unified summary that returns Today's Events and Upcoming Deadlines.
     */
    public function unifiedSummary(Request $request)
    {
        $user = $request->user();
        $today = $request->input('local_date', date('Y-m-d'));

        // TASKS
        $tasks = Task::query()
            ->where(function ($q) use ($user) {
                $q->where('assigned_to', $user->id)
                  ->orWhereHas('assignees', function ($aq) use ($user) {
                      $aq->where('user_id', $user->id);
                  })->orWhereHas('project', function ($pq) use ($user) {
                      $pq->whereJsonContains('assigned_users', $user->id);
                  });
            })
            ->where(function ($q) use ($today) {
                $q->whereDate('start_date', '>=', $today)
                  ->orWhereDate('end_date', '>=', $today);
            })
            ->select([
                'id','title','description','start_date','end_date','assigned_to','assigned_by','project_id','status','priority','created_at','updated_at'
            ])
            ->with(['project:id,title','assignee:id,name','assigner:id,name'])
            ->get();

        // PROJECTS
        $projects = Project::query()
            ->whereJsonContains('assigned_users', $user->id)
            ->where(function ($q) use ($today) {
                $q->whereDate('start_date', '>=', $today)
                  ->orWhereDate('end_date', '>=', $today);
            })
            ->select(['id','title','description','start_date','end_date','assigned_users','status','priority','created_by'])
            ->with(['creator:id,name'])
            ->get();

        // DELIVERABLES
        $deliverables = Deliverable::query()
            ->where('assigned_to', $user->id)
            ->whereDate('due_date', '>=', $today)
            ->select(['id','title','description','due_date','assigned_to','created_by','project_id','task_id','status','priority','submitted_at','approved_at','rejected_at'])
            ->with(['project:id,title','assignee:id,name','creator:id,name'])
            ->get();

        // MANUAL EVENTS
        $manualEventsQuery = Event::with(['user:id,name','assignedUsers:id']);
        // Role-based visibility
        if (in_array($user->role, ['admin', 'manager'])) {
            // Admin/Manager see all events
        } else {
            $manualEventsQuery->where(function ($q) use ($user) {
                $q->where('is_global', true)
                  ->orWhereHas('assignedUsers', function ($aq) use ($user) {
                      $aq->where('user_id', $user->id);
                  });
            });
        }
        $manualEvents = $manualEventsQuery
            ->where(function ($q) use ($today) {
                $q->whereDate('start_date', '>=', $today)
                  ->orWhereDate('end_date', '>=', $today);
            })
            ->get();

        $events = collect();

        // Transform tasks into calendar events
        foreach ($tasks as $task) {
            $events->push([
                'id' => 'task-' . $task->id,
                'source' => 'task',
                'type' => 'task',
                'title' => $task->title,
                'description' => $task->description,
                'date' => $task->start_date ?? $task->end_date,
                'start_date' => $task->start_date,
                'end_date' => $task->end_date,
                'status' => $task->status,
                'priority' => $task->priority,
                'assigned_to' => $task->assigned_to,
                'assigned_by' => $task->assigned_by,
                'project_id' => $task->project_id,
                'assignee_name' => $task->assignee ? $task->assignee->name : null,
                'assigner_name' => $task->assigner ? $task->assigner->name : null,
                'project_title' => $task->project ? $task->project->title : null,
                'created_at' => $task->created_at,
                'updated_at' => $task->updated_at,
            ]);
        }

        // Transform projects into calendar events
        foreach ($projects as $project) {
            $events->push([
                'id' => 'project-' . $project->id,
                'source' => 'project',
                'type' => 'project',
                'title' => $project->title,
                'description' => $project->description,
                'date' => $project->start_date ?? $project->end_date,
                'start_date' => $project->start_date,
                'end_date' => $project->end_date,
                'status' => $project->status,
                'priority' => $project->priority,
                'assigned_users' => $project->assigned_users,
                'created_by' => $project->created_by,
                'creator_name' => $project->creator ? $project->creator->name : null,
                'created_at' => $project->created_at,
                'updated_at' => $project->updated_at,
            ]);
        }

        // Transform deliverables into calendar events
        foreach ($deliverables as $deliverable) {
            $events->push([
                'id' => 'deliverable-' . $deliverable->id,
                'source' => 'deliverable',
                'type' => 'deliverable',
                'title' => $deliverable->title,
                'description' => $deliverable->description,
                'date' => $deliverable->due_date,
                'start_date' => $deliverable->due_date,
                'end_date' => $deliverable->due_date,
                'status' => $deliverable->status,
                'priority' => $deliverable->priority,
                'assigned_to' => $deliverable->assigned_to,
                'created_by' => $deliverable->created_by,
                'assigned_by_name' => $deliverable->assignee ? $deliverable->assignee->name : null,
                'created_by_name' => $deliverable->creator ? $deliverable->creator->name : null,
                'project_id' => $deliverable->project_id,
                'task_id' => $deliverable->task_id,
                'project_title' => $deliverable->project ? $deliverable->project->title : null,
                'submitted_at' => $deliverable->submitted_at,
                'approved_at' => $deliverable->approved_at,
                'rejected_at' => $deliverable->rejected_at,
                'created_at' => $deliverable->created_at,
                'updated_at' => $deliverable->updated_at,
            ]);
        }

        // Transform manual events into calendar events
        foreach ($manualEvents as $event) {
            $events->push([
                'id' => $event->id,
                'source' => 'manual',
                'type' => $event->type,
                'title' => $event->title,
                'user_id' => $event->user_id,
                'created_by' => $event->user_id,
                'description' => $event->description,
                'date' => $event->start_date,
                'start_date' => $event->start_date,
                'end_date' => $event->end_date,
                'status' => $event->type,
                'priority' => null,
                'assigned_to' => $event->is_global ? null : $event->assignedUsers->pluck('id')->toArray(),
                'user_name' => $event->user ? $event->user->name : null,
                'type_name' => $this->getEventTypeLabel($event->type),
                'created_at' => $event->created_at,
                'updated_at' => $event->updated_at,
                'all_day' => $event->all_day,
                'color' => $event->color,
                'is_global' => (bool) $event->is_global,
                'assigned_user_ids' => $event->assignedUsers->pluck('id')->toArray(),
            ]);
        }

        $todayEvents = collect();
        $upcomingEvents = collect();

        foreach ($events as $ev) {
            $startStr = null;
            if ($ev['start_date']) {
                $startStr = is_string($ev['start_date'])
                    ? explode('T', $ev['start_date'])[0]
                    : $ev['start_date']->format('Y-m-d');
            }
            if (!$startStr && $ev['date']) {
                $startStr = is_string($ev['date'])
                    ? explode('T', $ev['date'])[0]
                    : $ev['date']->format('Y-m-d');
            }

            if (!$startStr) continue;

            // Today: exact date match on start_date
            // Upcoming: start_date > today
            if ($startStr === $today) {
                $todayEvents->push($ev);
            } elseif ($startStr > $today) {
                $upcomingEvents->push($ev);
            }
        }

        // Sort both collections chronologically
        $todayEventsSorted = $todayEvents->sortBy(function ($ev) {
            return $ev['start_date'] ?? $ev['date'] ?? '';
        })->values()->all();

        $upcomingEventsSorted = $upcomingEvents->sortBy(function ($ev) {
            return $ev['start_date'] ?? $ev['date'] ?? '';
        })->values()->all();

        return response()->json([
            'today' => $todayEventsSorted,
            'upcoming' => $upcomingEventsSorted,
        ]);
    }

    private function getEventTypeLabel(string $type): string
    {
        $labels = [
            'Meeting' => 'Meeting',
            'Training' => 'Training',
            'Workshop' => 'Workshop',
            'Client Meeting' => 'Client Meeting',
            'Company Event' => 'Company Event',
            'Holiday' => 'Holiday',
            'Interview' => 'Interview',
            'Project Milestone' => 'Project Milestone',
            'Internship Activity' => 'Internship Activity',
            'Other' => 'Other',
        ];

        return $labels[$type] ?? $type;
    }

    public function show(Event $event)
    {
        $user = request()->user();

        $event->load('assignedUsers');
        // Admin/Manager can see all events; TL/Member only assigned or global
        if (!in_array($user->role, ['admin', 'manager'])) {
            if (! $event->is_global && ! $event->assignedUsers->contains('id', $user->id)) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }
        }

        return response()->json(['event' => $this->formatEventResponse($event)]);
    }

    public function store(Request $request)
    {
        $user = $request->user();
        if (! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'type' => 'nullable|string|max:32|in:Meeting,Training,Workshop,Client Meeting,Company Event,Holiday,Interview,Project Milestone,Internship Activity,Other',
            'color' => 'nullable|string|max:16',
            'start_date' => 'required|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            'all_day' => 'nullable|boolean',
            'is_global' => 'nullable|boolean',
            'assigned_user_ids' => 'nullable|array',
            'assigned_user_ids.*' => 'integer|exists:users,id',
        ]);

        $event = Event::create([
            'user_id' => $user->id,
            'title' => $validated['title'],
            'description' => $validated['description'] ?? null,
            'type' => $validated['type'] ?? 'Meeting',
            'color' => $validated['color'] ?? null,
            'start_date' => $validated['start_date'],
            'end_date' => $validated['end_date'] ?? null,
            'all_day' => $validated['all_day'] ?? false,
            'is_global' => $validated['is_global'] ?? false,
        ]);

        if (! ($validated['is_global'] ?? false) && !empty($validated['assigned_user_ids'])) {
            $event->assignedUsers()->sync($validated['assigned_user_ids']);
        }

        // Send assignment notification
        $this->sendEventNotification($event, $user, 'event_created', 'Event Assigned');

        return response()->json([
            'message' => 'Event created successfully',
            'event' => $this->formatEventResponse($event->fresh()),
        ], 201);
    }

    public function update(Request $request, Event $event)
    {
        $user = $request->user();
        if (! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'title' => 'sometimes|required|string|max:255',
            'description' => 'sometimes|nullable|string',
            'type' => 'sometimes|string|max:32|in:Meeting,Training,Workshop,Client Meeting,Company Event,Holiday,Interview,Project Milestone,Internship Activity,Other',
            'color' => 'sometimes|nullable|string|max:16',
            'start_date' => 'sometimes|required|date',
            'end_date' => 'sometimes|nullable|date|after_or_equal:start_date',
            'all_day' => 'sometimes|nullable|boolean',
            'is_global' => 'sometimes|boolean',
            'assigned_user_ids' => 'nullable|array',
            'assigned_user_ids.*' => 'integer|exists:users,id',
        ]);

        $event->update([
            'title' => $validated['title'] ?? $event->title,
            'description' => $validated['description'] ?? $event->description,
            'type' => $validated['type'] ?? $event->type,
            'color' => $validated['color'] ?? $event->color,
            'start_date' => $validated['start_date'] ?? $event->start_date,
            'end_date' => $validated['end_date'] ?? $event->end_date,
            'all_day' => $validated['all_day'] ?? $event->all_day,
            'is_global' => $validated['is_global'] ?? $event->is_global,
        ]);

        if (array_key_exists('assigned_user_ids', $validated)) {
            if ($event->is_global) {
                $event->assignedUsers()->detach();
            } else {
                $event->assignedUsers()->sync($validated['assigned_user_ids'] ?? []);
            }
        }

        // Send update notification
        $this->sendEventNotification($event, $user, 'event_updated', 'Event Updated');

        return response()->json([
            'message' => 'Event updated successfully',
            'event' => $this->formatEventResponse($event->fresh()),
        ]);
    }

    public function destroy(Event $event)
    {
        $user = request()->user();
        if (! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        // Send cancellation notification before deleting
        $this->sendEventNotification($event, $user, 'event_cancelled', 'Event Cancelled');

        $event->delete();

        return response()->json([
            'message' => 'Event deleted successfully',
        ]);
    }

    private function sendEventNotification(Event $event, User $sender, string $type, string $title): void
    {
        $recipientIds = $this->getEventRecipientIds($event);

        foreach ($recipientIds as $recipientId) {
            if ((int) $recipientId === (int) $sender->id) {
                continue;
            }

            $message = $this->buildEventMessage($event, $sender, $type);

            // Prevent duplicate notifications for same event and type
            $exists = Notification::where('user_id', $recipientId)
                ->where('type', $type)
                ->where('related_module', 'event')
                ->where('related_id', $event->id)
                ->where('created_at', '>=', now()->subMinutes(5))
                ->exists();

            if ($exists) {
                continue;
            }

            Notification::create([
                'user_id' => $recipientId,
                'sender_user_id' => $sender->id,
                'type' => $type,
                'related_module' => 'event',
                'related_id' => $event->id,
                'title' => $title,
                'message' => $message,
                'link' => '/calender',
            ]);
        }
    }

    private function getEventRecipientIds(Event $event): array
    {
        if ($event->is_global) {
            return User::where('active', true)->pluck('id')->toArray();
        }

        $assignedIds = $event->assignedUsers()->pluck('user_id')->toArray();

        if (!empty($assignedIds)) {
            return $assignedIds;
        }

        // Fall back to creator if no assigned users
        return [$event->user_id];
    }

    /**
     * Format a single event into a consistent API response shape.
     */
    private function formatEventResponse(Event $event): array
    {
        $event->loadMissing('user:id,name', 'assignedUsers:id,name');
        return [
            'id' => $event->id,
            'source' => 'manual',
            'type' => $event->type,
            'title' => $event->title,
            'description' => $event->description,
            'event_type' => $event->type,
            'event_date' => $event->start_date ? $event->start_date->format('Y-m-d') : null,
            'start_date' => $event->start_date ? $event->start_date->toIso8601String() : null,
            'end_date' => $event->end_date ? $event->end_date->toIso8601String() : null,
            'all_day' => (bool) $event->all_day,
            'color' => $event->color,
            'is_global' => (bool) $event->is_global,
            'user_id' => $event->user_id,
            'created_by' => $event->user_id,
            'creator_name' => $event->user ? $event->user->name : null,
            'assigned_users' => $event->assignedUsers->map(function ($u) {
                return ['id' => $u->id, 'name' => $u->name];
            })->toArray(),
            'assigned_user_ids' => $event->assignedUsers->pluck('id')->toArray(),
            'created_at' => $event->created_at ? $event->created_at->toIso8601String() : null,
            'updated_at' => $event->updated_at ? $event->updated_at->toIso8601String() : null,
        ];
    }

    private function buildEventMessage(Event $event, User $sender, string $type): string
    {
        $eventTitle = $event->title;

        return match ($type) {
            'event_created' => "A new event '{$eventTitle}' has been assigned to you by {$sender->name}.",
            'event_updated' => "The event '{$eventTitle}' has been updated. Please review the latest details.",
            'event_cancelled' => "The event '{$eventTitle}' has been cancelled.",
            'event_reminder' => "Reminder: '{$eventTitle}' starts soon.",
            default => "Event notification: '{$eventTitle}'.",
        };
    }
}
