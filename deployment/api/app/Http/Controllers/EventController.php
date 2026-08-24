<?php

namespace App\Http\Controllers;

use App\Models\Deliverable;
use App\Models\Event;
use App\Models\EventParticipant;
use App\Models\EventVisibility;
use App\Models\Notification;
use App\Models\Project;
use App\Models\Task;
use App\Models\Team;
use App\Models\User;
use App\Services\ActivityService;
use App\Services\AuditService;
use App\Services\NotificationService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class EventController extends Controller
{
    public function __construct(
        private NotificationService $notificationService,
        private ActivityService $activityService,
        private AuditService $auditService
    ) {}

    /**
     * List all events visible to the authenticated user.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $isAdmin = in_array($user->role, ['admin', 'manager']);

        // User's teams
        $userTeamIds = Team::whereHas('members', fn ($q) => $q->where('users.id', $user->id))
            ->orWhere('leader_id', $user->id)
            ->pluck('id')->toArray();

        $userDept = $user->department ?: 'General';

        $query = Event::with([
            'category:id,name,slug,color,icon',
            'user:id,name,email,role,avatar',
            'organizer:id,name,email,role,avatar',
            'assignedUsers:id,name,email,role,avatar',
            'participants.user:id,name,email,role,avatar',
            'visibilities.team:id,name',
            'visibilities.user:id,name',
        ])->latest('start_date');

        // Strictly apply tiered visibility rules
        if (!$isAdmin) {
            $query->where(function ($q) use ($user, $userTeamIds, $userDept) {
                // Creator or Organizer
                $q->where('user_id', $user->id)
                    ->orWhere('organizer_id', $user->id)
                    // Global / Organization
                    ->orWhere('is_global', true)
                    ->orWhere('visibility_level', 'organization')
                    // Department
                    ->orWhere(function ($dq) use ($userDept) {
                        $dq->where('visibility_level', 'department_team')
        ->whereHas('visibilities', fn ($vq) => $vq->where('department', $userDept)->where('is_visible', true));
                    })
                    // Assigned or Participant
                    ->orWhereHas('assignedUsers', fn ($aq) => $aq->where('user_id', $user->id))
                    ->orWhereHas('participants', fn ($pq) => $pq->where('user_id', $user->id))
                    // Team Visibility
                    ->orWhere(function ($tq) use ($userTeamIds) {
                        $tq->where('visibility_level', 'team')
                            ->whereHas('visibilities', fn ($vq) => $vq->whereIn('team_id', $userTeamIds)->where('is_visible', true));
                    })
                    // Custom Granular Visibility
                    ->orWhere(function ($cq) use ($user, $userTeamIds, $userDept) {
                        $cq->where('visibility_level', 'custom')
                            ->whereHas('visibilities', function ($vq) use ($user, $userTeamIds, $userDept) {
                                $vq->where(function ($ivq) use ($user, $userTeamIds, $userDept) {
                                    $ivq->where('user_id', $user->id)
                                        ->orWhereIn('team_id', $userTeamIds)
                                        ->orWhere('department', $userDept)
                                        ->orWhere('role', $user->role);
                                })->where('is_visible', true);
                            });
                    });
            });
        }

        // Filters
        if ($request->filled('type') && $request->input('type') !== 'all') {
            $type = $request->input('type');
            if ($type === 'announcement') {
                $query->where(fn ($q) => $q->where('type', 'announcement')->orWhere('type', 'Company Announcement')->orWhere('is_global', true));
            } elseif ($type === 'event') {
                $query->where('type', '!=', 'announcement')->where('type', '!=', 'Company Announcement');
            } else {
                $query->where('type', $type);
            }
        }

        if ($request->filled('category_id') && $request->input('category_id') !== 'all') {
            $query->where('category_id', $request->input('category_id'));
        }

        if ($request->filled('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%")
                    ->orWhere('location', 'like', "%{$search}%")
                    ->orWhereHas('category', fn ($cq) => $cq->where('name', 'like', "%{$search}%"));
            });
        }

        if ($request->filled('month')) {
            // e.g. YYYY-MM
            $month = $request->input('month');
            $query->where('start_date', 'like', "{$month}%");
        }

        if ($request->boolean('all')) {
            $events = $query->limit(500)->get();
            return response()->json([
                'success' => true,
                'data' => $events->map(fn ($event) => $this->formatEventResponse($event)),
            ]);
        }

        $events = $query->paginate((int) $request->input('per_page', 50));
        $events->getCollection()->transform(fn ($event) => $this->formatEventResponse($event));

        return response()->json($events);
    }

    /**
     * Retrieve a single event by ID.
     */
    public function show(Event $event): JsonResponse
    {
        $user = request()->user();
        $isAdmin = in_array($user->role, ['admin', 'manager']);

        $event->load([
            'category:id,name,slug,color,icon',
            'user:id,name,email,role,avatar',
            'organizer:id,name,email,role,avatar',
            'assignedUsers:id,name,email,role,avatar',
            'participants.user:id,name,email,role,avatar',
            'visibilities.team:id,name',
            'visibilities.user:id,name',
        ]);

        if (!$isAdmin) {
            $isAssigned = $event->assignedUsers->contains('id', $user->id);
            $isParticipant = $event->participants->contains('user_id', $user->id);
            $isCreator = ($event->user_id === $user->id) || ($event->organizer_id === $user->id);

            if (!$event->is_global && $event->visibility_level === 'private' && !$isCreator) {
                return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
            }
        }

        return response()->json([
            'success' => true,
            'event' => $this->formatEventResponse($event),
            'data' => $this->formatEventResponse($event),
        ]);
    }

    /**
     * Create a new event or company announcement with DB transaction.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        // Support JSON string parsing for arrays if passed as form-data
        foreach (['participant_user_ids', 'assigned_user_ids', 'attendee_ids', 'team_ids', 'user_ids'] as $f) {
            if (is_string($request->input($f))) {
                $decoded = json_decode($request->input($f), true);
                if (is_array($decoded)) {
                    $request->merge([$f => $decoded]);
                }
            }
        }

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'type' => 'nullable|string|max:64',
            'category_id' => 'nullable|integer|exists:event_categories,id',
            'color' => 'nullable|string|max:32',
            'start_date' => 'required|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            'all_day' => 'nullable|boolean',
            'is_global' => 'nullable|boolean',
            'visibility_level' => 'nullable|string|max:32',
            'location' => 'nullable|string|max:255',
            'meeting_link' => 'nullable|string|max:2048',
            'status' => 'nullable|string|max:32',
            'organizer_id' => 'nullable|integer|exists:users,id',
            'assigned_user_ids' => 'nullable|array',
            'assigned_user_ids.*' => 'integer|exists:users,id',
            'participant_user_ids' => 'nullable|array',
            'participant_user_ids.*' => 'integer|exists:users,id',
            'attendee_ids' => 'nullable|array',
            'attendee_ids.*' => 'integer|exists:users,id',
            'project_id' => 'nullable|exists:projects,id',
            'team_ids' => 'nullable|array',
            'team_ids.*' => 'integer|exists:teams,id',
            'user_ids' => 'nullable|array',
            'user_ids.*' => 'integer|exists:users,id',
        ]);

        $event = DB::transaction(function () use ($user, $validated) {
            $type = $validated['type'] ?? 'Meeting';
            $isAnnouncement = in_array(strtolower($type), ['announcement', 'company announcement']);
            $visibilityLevel = $validated['visibility_level'] ?? 'organization';
            $isGlobal = (bool) ($validated['is_global'] ?? false) || ($isAnnouncement && $visibilityLevel === 'organization');

            $createdEvent = Event::create([
                'user_id' => $user->id,
                'organizer_id' => $validated['organizer_id'] ?? $user->id,
                'title' => $validated['title'],
                'description' => $validated['description'] ?? null,
                'type' => $type,
                'category_id' => $validated['category_id'] ?? null,
                'color' => $validated['color'] ?? null,
                'start_date' => $validated['start_date'],
                'end_date' => $validated['end_date'] ?? $validated['start_date'],
                'all_day' => $validated['all_day'] ?? false,
                'is_global' => $isGlobal,
                'visibility_level' => $visibilityLevel,
                'location' => $validated['location'] ?? null,
                'meeting_link' => $validated['meeting_link'] ?? null,
                'project_id' => $validated['project_id'] ?? null,
                'status' => $validated['status'] ?? 'scheduled',
            ]);

            // Sync assigned users & participants
            $participantIds = $validated['attendee_ids'] ?? ($validated['participant_user_ids'] ?? ($validated['assigned_user_ids'] ?? ($validated['user_ids'] ?? [])));
            if (!$isGlobal && !empty($participantIds)) {
                $createdEvent->assignedUsers()->sync($participantIds);

                foreach ($participantIds as $pId) {
                    EventParticipant::create([
                        'event_id' => $createdEvent->id,
                        'user_id' => $pId,
                        'status' => 'invited',
                        'attended' => false,
                    ]);
                }
            }

            // Sync Audience Visibilities
            if (!empty($validated['team_ids'])) {
                foreach ($validated['team_ids'] as $tId) {
                    EventVisibility::create([
                        'event_id' => $createdEvent->id,
                        'team_id' => $tId,
                        'is_visible' => true,
                    ]);
                }
            }
            if ($visibilityLevel === 'custom' && !empty($validated['user_ids'])) {
                foreach ($validated['user_ids'] as $uId) {
                    EventVisibility::firstOrCreate([
                        'event_id' => $createdEvent->id,
                        'user_id' => $uId,
                        'is_visible' => true,
                    ]);
                }
            }

            return $createdEvent;
        });

        // Notifications & Audit Logging (Safe)
        try {
            $this->sendBulkEventNotification($event, $user, 'event_created', 'Event Assigned');
            $this->activityService->log($user->id, 'event_created', "Created event '{$event->title}'", 'event', $event->id);
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
            Log::error('Event post-create notification error: ' . $e->getMessage());
        }

        $formatted = $this->formatEventResponse($event->fresh([
            'category',
            'user',
            'organizer',
            'assignedUsers',
            'participants.user',
            'visibilities',
        ]));

        return response()->json([
            'success' => true,
            'message' => 'Event created successfully',
            'data' => $formatted,
            'event' => $formatted,
        ], 201);
    }

    /**
     * Update an existing calendar event with DB transaction.
     */
    public function update(Request $request, Event $event): JsonResponse
    {
        $user = $request->user();
        $isAdmin = in_array($user->role, ['admin', 'manager']);
        if (!$isAdmin && $event->user_id !== $user->id && $event->organizer_id !== $user->id) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        foreach (['participant_user_ids', 'assigned_user_ids', 'attendee_ids', 'team_ids', 'user_ids'] as $f) {
            if (is_string($request->input($f))) {
                $decoded = json_decode($request->input($f), true);
                if (is_array($decoded)) {
                    $request->merge([$f => $decoded]);
                }
            }
        }

        $validated = $request->validate([
            'title' => 'sometimes|required|string|max:255',
            'description' => 'sometimes|nullable|string',
            'type' => 'sometimes|string|max:64',
            'category_id' => 'nullable|integer|exists:event_categories,id',
            'color' => 'sometimes|nullable|string|max:32',
            'start_date' => 'sometimes|required|date',
            'end_date' => 'sometimes|nullable|date|after_or_equal:start_date',
            'all_day' => 'sometimes|nullable|boolean',
            'is_global' => 'sometimes|boolean',
            'visibility_level' => 'sometimes|nullable|string|max:32',
            'location' => 'sometimes|nullable|string|max:255',
            'meeting_link' => 'sometimes|nullable|string|max:2048',
            'status' => 'sometimes|nullable|string|max:32',
            'organizer_id' => 'nullable|integer|exists:users,id',
            'assigned_user_ids' => 'nullable|array',
            'assigned_user_ids.*' => 'integer|exists:users,id',
            'participant_user_ids' => 'nullable|array',
            'participant_user_ids.*' => 'integer|exists:users,id',
            'attendee_ids' => 'nullable|array',
            'attendee_ids.*' => 'integer|exists:users,id',
            'project_id' => 'nullable|exists:projects,id',
            'team_ids' => 'nullable|array',
            'team_ids.*' => 'integer|exists:teams,id',
            'user_ids' => 'nullable|array',
            'user_ids.*' => 'integer|exists:users,id',
        ]);

        DB::transaction(function () use ($event, $validated) {
            $event->update([
                'title' => $validated['title'] ?? $event->title,
                'description' => $validated['description'] ?? $event->description,
                'type' => $validated['type'] ?? $event->type,
                'category_id' => array_key_exists('category_id', $validated) ? $validated['category_id'] : $event->category_id,
                'color' => $validated['color'] ?? $event->color,
                'start_date' => $validated['start_date'] ?? $event->start_date,
                'end_date' => $validated['end_date'] ?? $event->end_date,
                'all_day' => $validated['all_day'] ?? $event->all_day,
                'is_global' => $validated['is_global'] ?? $event->is_global,
                'visibility_level' => $validated['visibility_level'] ?? $event->visibility_level,
                'location' => $validated['location'] ?? $event->location,
                'meeting_link' => $validated['meeting_link'] ?? $event->meeting_link,
                'status' => $validated['status'] ?? $event->status,
                'organizer_id' => $validated['organizer_id'] ?? $event->organizer_id,
            ]);

            // Sync participants if field provided
            if (array_key_exists('participant_user_ids', $validated) || array_key_exists('assigned_user_ids', $validated) || array_key_exists('user_ids', $validated)) {
                $participantIds = $validated['attendee_ids'] ?? ($validated['participant_user_ids'] ?? ($validated['assigned_user_ids'] ?? ($validated['user_ids'] ?? [])));
                if ($event->is_global) {
                    $event->assignedUsers()->detach();
                    EventParticipant::where('event_id', $event->id)->delete();
                } else {
                    $event->assignedUsers()->sync($participantIds);
                    EventParticipant::where('event_id', $event->id)->delete();
                    foreach ($participantIds as $pId) {
                        EventParticipant::create([
                            'event_id' => $event->id,
                            'user_id' => $pId,
                            'status' => 'invited',
                            'attended' => false,
                        ]);
                    }
                }
            }

            // Sync Visibilities
            if (array_key_exists('team_ids', $validated) || array_key_exists('visibility_level', $validated)) {
                EventVisibility::where('event_id', $event->id)->delete();
                if (!empty($validated['team_ids'])) {
                    foreach ($validated['team_ids'] as $tId) {
                        EventVisibility::create([
                            'event_id' => $event->id,
                            'team_id' => $tId,
                            'is_visible' => true,
                        ]);
                    }
                }
                if (($validated['visibility_level'] ?? $event->visibility_level) === 'custom' && !empty($validated['user_ids'])) {
                    foreach ($validated['user_ids'] as $uId) {
                        EventVisibility::firstOrCreate([
                            'event_id' => $event->id,
                            'user_id' => $uId,
                            'is_visible' => true,
                        ]);
                    }
                }
            }
        });

        try {
            $this->sendBulkEventNotification($event, $user, 'event_updated', 'Event Updated');
            $this->activityService->log($user->id, 'event_updated', "You updated event '{$event->title}'", 'event', $event->id);
        } catch (\Throwable $e) {
            Log::error('Event post-update notification error: ' . $e->getMessage());
        }

        $formatted = $this->formatEventResponse($event->fresh([
            'category',
            'user',
            'organizer',
            'assignedUsers',
            'participants.user',
            'visibilities',
        ]));

        return response()->json([
            'success' => true,
            'message' => 'Event updated successfully',
            'data' => $formatted,
            'event' => $formatted,
        ]);
    }

    /**
     * Delete a calendar event with DB transaction.
     */
    public function destroy(Event $event): JsonResponse
    {
        $user = request()->user();
        $isAdmin = in_array($user->role, ['admin', 'manager']);
        if (!$isAdmin && $event->user_id !== $user->id && $event->organizer_id !== $user->id) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        DB::transaction(function () use ($event) {
            EventParticipant::where('event_id', $event->id)->delete();
            EventVisibility::where('event_id', $event->id)->delete();
            $event->assignedUsers()->detach();
            $event->delete();
        });

        return response()->json([
            'success' => true,
            'message' => 'Event deleted successfully',
        ]);
    }

    /**
     * Format an event model into a standardized, crash-proof API response array.
     */
    private function formatEventResponse(Event $event): array
    {
        $event->loadMissing('category', 'user:id,name,email,avatar', 'organizer:id,name,email,avatar', 'assignedUsers:id,name,email,avatar', 'participants.user:id,name,email,avatar', 'visibilities.team:id,name');

        $assignedArray = $event->assignedUsers ? $event->assignedUsers->map(fn ($u) => [
            'id' => $u->id,
            'name' => $u->name,
            'email' => $u->email,
            'avatar' => $u->avatar,
        ])->toArray() : [];

        $participantsArray = $event->participants ? $event->participants->map(fn ($p) => [
            'id' => $p->id,
            'user_id' => $p->user_id,
            'name' => $p->user?->name ?? 'User',
            'email' => $p->user?->email,
            'status' => $p->status,
            'attended' => (bool) $p->attended,
        ])->toArray() : [];

        return [
            'id' => $event->id,
            'source' => 'manual',
            'type' => $event->type,
            'event_type' => $event->type,
            'title' => $event->title,
            'description' => $event->description,
            'event_date' => $event->start_date?->format('Y-m-d'),
            'start_date' => $event->start_date?->format('Y-m-d\\TH:i:s'),
            'end_date' => $event->end_date?->format('Y-m-d\\TH:i:s'),
            'all_day' => (bool) $event->all_day,
            'color' => $event->color,
            'is_global' => (bool) $event->is_global,
            'is_announcement' => ($event->type === 'announcement' || $event->type === 'Company Announcement' || $event->is_global),
            'visibility_level' => $event->visibility_level ?? ($event->is_global ? 'organization' : 'private'),
            'location' => $event->location,
            'meeting_link' => $event->meeting_link,
            'status' => $event->status ?? 'scheduled',
            'user_id' => $event->user_id,
            'organizer_id' => $event->organizer_id,
            'creator_name' => $event->user?->name ?? 'System',
            'organizer_name' => $event->organizer?->name ?? $event->user?->name,
            'category_id' => $event->category_id,
            'category' => $event->category ? [
                'id' => $event->category->id,
                'name' => $event->category->name,
                'slug' => $event->category->slug,
                'color' => $event->category->color,
                'icon' => $event->category->icon,
            ] : null,
            'assigned_users' => $assignedArray,
            'participants' => $participantsArray,
            'visibilities' => $event->visibilities ? $event->visibilities->map(fn ($v) => [
                'team_id' => $v->team_id,
                'team_name' => $v->team?->name,
                'user_id' => $v->user_id,
            ])->toArray() : [],
            'created_at' => $event->created_at?->toIso8601String(),
            'updated_at' => $event->updated_at?->toIso8601String(),
        ];
    }

    /**
     * Unified calendar view combining tasks, projects, deliverables, and manual events.
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
        $manualEventsQuery = Event::with(['category', 'user:id,name', 'assignedUsers:id']);
        if (! in_array($user->role, ['admin', 'manager'])) {
            $manualEventsQuery->where(fn ($q) => $q->where('is_global', true)->orWhere('visibility_level', 'organization')->orWhereHas('assignedUsers', fn ($aq) => $aq->where('user_id', $user->id)));
        }
        if ($startDate && $endDate) {
            $manualEventsQuery->where(function ($q) use ($startDate, $endDate) {
                $q->whereBetween('start_date', [$startDate, $endDate])
                    ->orWhereBetween('end_date', [$startDate, $endDate])
                    ->orWhere(fn ($q2) => $q2->whereDate('start_date', '<=', $startDate)->whereDate('end_date', '>=', $endDate));
            });
        }
        $manualEvents = $manualEventsQuery->limit(500)->get();

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
     * Get a summary of today's and upcoming events.
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

            $manualEventsQuery = Event::with(['category', 'user:id,name', 'assignedUsers:id']);
            if (! in_array($user->role, ['admin', 'manager'])) {
                $manualEventsQuery->where(fn ($q) => $q->where('is_global', true)->orWhere('visibility_level', 'organization')->orWhereHas('assignedUsers', fn ($aq) => $aq->where('user_id', $user->id)));
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
            'id' => $event->id,
            'source' => 'manual',
            'type' => $event->type,
            'title' => $event->title,
            'user_id' => $event->user_id,
            'created_by' => $event->user_id,
            'description' => $event->description,
            'date' => $this->fmtDate($event->start_date),
            'start_date' => $this->fmtDate($event->start_date),
            'end_date' => $this->fmtDate($event->end_date),
            'status' => $event->status ?? $event->type,
            'priority' => null,
            'user_name' => $event->user?->name,
            'type_name' => $event->type,
            'created_at' => $this->fmtDate($event->created_at),
            'updated_at' => $this->fmtDate($event->updated_at),
            'all_day' => (bool) $event->all_day,
            'color' => $event->color,
            'is_global' => (bool) $event->is_global,
            'assigned_user_ids' => $event->assignedUsers ? $event->assignedUsers->pluck('id')->toArray() : [],
        ];
    }

    private function sendBulkEventNotification(Event $event, User $sender, string $type, string $title): void
    {
        $recipientIds = $this->getEventRecipientIds($event);
        $notifications = [];

        $existingUserIds = Notification::whereIn('user_id', $recipientIds)->where('type', $type)
            ->where('related_module', 'event')->where('related_id', $event->id)
            ->where('created_at', '>=', now()->subMinutes(5))
            ->pluck('user_id')->toArray();

        foreach ($recipientIds as $recipientId) {
            if ((int) $recipientId === (int) $sender->id) continue;
            if (in_array((int) $recipientId, $existingUserIds, true)) continue;

            $notifications[] = [
                'user_id' => $recipientId,
                'sender_user_id' => $sender->id,
                'type' => $type,
                'related_module' => 'event',
                'related_id' => $event->id,
                'title' => $title,
                'message' => "Event '{$event->title}' scheduled for " . ($event->start_date ? Carbon::parse($event->start_date)->format('d M Y') : 'upcoming date'),
                'link' => '/events',
            ];
        }

        $this->notificationService->createBulk($notifications);
    }

    private function getEventRecipientIds(Event $event): array
    {
        if ($event->is_global || $event->visibility_level === 'organization') {
            return User::where('active', true)->pluck('id')->toArray();
        }
        $assignedIds = $event->assignedUsers ? $event->assignedUsers()->pluck('user_id')->toArray() : [];
        return !empty($assignedIds) ? $assignedIds : [$event->user_id];
    }

    private function fmtDate($date): ?string
    {
        return $date ? (is_string($date) ? $date : $date->format('Y-m-d\\TH:i:s')) : null;
    }
}
