<?php

namespace App\Http\Controllers;

use App\Models\Event;
use App\Models\Task;
use App\Models\Project;
use App\Models\Deliverable;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class EventController extends Controller
{
    public function index(Request $request)
    {
        $query = Event::with('user:id,name')
            ->latest('start_date')
            ->filter($request->query());

        // Support non-paginated response for calendar views
        if ($request->boolean('all')) {
            $events = $query->get();
            return response()->json(['data' => $events]);
        }

        $events = $query->paginate(50);
        return response()->json($events);
    }

    /**
     * Unified calendar that returns tasks, projects, deliverables and manual events
     * filtered strictly by assignment or global flag.
     */
    public function unifiedCalendar(Request $request)
    {
        $user = $request->user();
        $startDate = $request->input('from');
        $endDate = $request->input('to');
        $search = $request->input('search');
        
        $events = collect();

        // TASKS: only tasks assigned to the user or where user is in project assigned_users or task_user pivot
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

        // PROJECTS: only projects where assigned_users JSON contains user id
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

        // DELIVERABLES: only deliverables assigned to the user
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

        // MANUAL EVENTS: only events assigned to the user or global events
        $manualEventsQuery = Event::with(['user:id,name','assignedUsers:id']);
        $manualEventsQuery->where(function ($q) use ($user) {
            $q->where('is_global', true)
              ->orWhereHas('assignedUsers', function ($aq) use ($user) {
                  $aq->where('user_id', $user->id);
              });
        });

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

        // Sort all events by date
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

    private function getEventTypeLabel(string $type): string
    {
        $labels = [
            'meeting' => 'Meeting',
            'deadline' => 'Deadline',
            'task' => 'Task',
            'personal' => 'Personal',
            'other' => 'Review',
        ];

        return $labels[$type] ?? $type;
    }

    public function show(Event $event)
    {
        $user = request()->user();

        // Allow view only if global or assigned to the user
        $event->load('assignedUsers');
        if (! $event->is_global && ! $event->assignedUsers->contains('id', $user->id)) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $event->load('user:id,name,email');
        return response()->json(['event' => $event]);
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
            'type' => 'nullable|string|max:32|in:meeting,deadline,task,personal,other',
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
            'type' => $validated['type'] ?? 'meeting',
            'color' => $validated['color'] ?? null,
            'start_date' => $validated['start_date'],
            'end_date' => $validated['end_date'] ?? null,
            'all_day' => $validated['all_day'] ?? false,
            'is_global' => $validated['is_global'] ?? false,
        ]);

        if (! ($validated['is_global'] ?? false) && !empty($validated['assigned_user_ids'])) {
            $event->assignedUsers()->sync($validated['assigned_user_ids']);
        }

        return response()->json([
            'message' => 'Event created successfully',
            'event' => $event->load('user:id,name','assignedUsers:id,name'),
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
            'type' => 'sometimes|string|max:32|in:meeting,deadline,task,personal,other',
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

        return response()->json([
            'message' => 'Event updated successfully',
            'event' => $event->fresh()->load('user:id,name','assignedUsers:id,name'),
        ]);
    }

    public function destroy(Event $event)
    {
        $user = request()->user();
        if (! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $event->delete();

        return response()->json([
            'message' => 'Event deleted successfully',
        ]);
    }
}
