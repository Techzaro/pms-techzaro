<?php

namespace App\Http\Controllers;

use App\Models\Deliverable;
use App\Models\Event;
use App\Models\EventAttachment;
use App\Models\EventParticipant;
use App\Models\EventReminder;
use App\Models\EventVisibility;
use App\Models\Notification;
use App\Models\Project;
use App\Models\Task;
use App\Models\Team;
use App\Models\User;
use App\Notifications\EventNotification;
use App\Services\ActivityService;
use App\Services\AuditService;
use App\Services\NotificationService;
use App\Services\StorageDiskResolver;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use App\Services\Saas\Infrastructure\TenantCacheManager;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

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
        $isAdmin = in_array($user->role, ['admin', 'manager', 'superadmin']);

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
            'reminders',
            'attachments',
        ])->latest('start_date');

        // Strictly apply tiered visibility rules
        if (!$isAdmin) {
            $query->where(function ($q) use ($user, $userTeamIds, $userDept) {
                $q->where('user_id', $user->id)
                    ->orWhere('organizer_id', $user->id)
                    ->orWhere('is_global', true)
                    ->orWhere('visibility_level', 'organization')
                    ->orWhere(function ($dq) use ($userDept) {
                        $dq->where('visibility_level', 'department_team')
                            ->whereHas('visibilities', fn ($vq) => $vq->where('department', $userDept)->where('is_visible', true));
                    })
                    ->orWhereHas('assignedUsers', fn ($aq) => $aq->where('user_id', $user->id))
                    ->orWhereHas('participants', fn ($pq) => $pq->where('user_id', $user->id))
                    ->orWhere(function ($tq) use ($userTeamIds) {
                        $tq->where('visibility_level', 'team')
                            ->whereHas('visibilities', fn ($vq) => $vq->whereIn('team_id', $userTeamIds)->where('is_visible', true));
                    })
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

        if ($request->filled('status') && $request->input('status') !== 'all') {
            $query->where('status', $request->input('status'));
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
        $isAdmin = in_array($user->role, ['admin', 'manager', 'superadmin']);

        $event->load([
            'category:id,name,slug,color,icon',
            'user:id,name,email,role,avatar',
            'organizer:id,name,email,role,avatar',
            'assignedUsers:id,name,email,role,avatar',
            'participants.user:id,name,email,role,avatar',
            'visibilities.team:id,name',
            'visibilities.user:id,name',
            'reminders',
            'attachments.user:id,name',
        ]);

        if (!$isAdmin) {
            $isAssigned = $event->assignedUsers->contains('id', $user->id);
            $isParticipant = $event->participants->contains('user_id', $user->id);
            $isCreator = ($event->user_id === $user->id) || ($event->organizer_id === $user->id);

            if (!$event->is_global && $event->visibility_level === 'private' && !$isCreator && !$isAssigned && !$isParticipant) {
                return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
            }
        }

        $formatted = $this->formatEventResponse($event);

        return response()->json([
            'success' => true,
            'event' => $formatted,
            'data' => $formatted,
        ]);
    }

    /**
     * Create a new event or company announcement with DB transaction.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        // Support JSON string parsing for array inputs if passed as multipart form-data
        foreach (['participant_user_ids', 'assigned_user_ids', 'attendee_ids', 'team_ids', 'user_ids', 'reminders'] as $f) {
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
            'start_time' => 'nullable|string',
            'end_time' => 'nullable|string',
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
            'reminders' => 'nullable|array',
            'reminders.*.value' => 'required_with:reminders|integer|min:1',
            'reminders.*.unit' => 'required_with:reminders|string|in:minutes,hours,days,minute,hour,day',
            'reminders.*.user_id' => 'nullable|integer|exists:users,id',
            'attachments' => 'nullable|array',
            'attachments.*' => 'file|max:51200', // 50MB per file
        ]);

        $event = DB::transaction(function () use ($user, $validated, $request) {
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
                'start_time' => $validated['start_time'] ?? null,
                'end_time' => $validated['end_time'] ?? null,
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

            // Sync dynamic reminders
            if (!empty($validated['reminders'])) {
                foreach ($validated['reminders'] as $rem) {
                    $unit = strtolower(rtrim($rem['unit'] ?? 'minutes', 's')) . 's';
                    if (!in_array($unit, ['minutes', 'hours', 'days'])) {
                        $unit = 'minutes';
                    }
                    EventReminder::create([
                        'event_id' => $createdEvent->id,
                        'user_id' => $rem['user_id'] ?? null,
                        'value' => (int) ($rem['value'] ?? 15),
                        'unit' => $unit,
                        'is_sent' => false,
                    ]);
                }
            }

            // Handle uploaded attachments if any
            if ($request->hasFile('attachments')) {
                $org = $request->attributes->get('currentOrganization');
                foreach ($request->file('attachments') as $file) {
                    if (!$file || !$file->isValid()) continue;

                    $origName = $file->getClientOriginalName();
                    $storedPath = $org
                        ? StorageDiskResolver::store($org, $file, 'events', $origName)
                        : $file->store('events/' . date('Y/m'), 'public');

                    EventAttachment::create([
                        'event_id' => $createdEvent->id,
                        'user_id' => $user->id,
                        'file_name' => $origName,
                        'file_path' => $storedPath,
                        'file_size' => $file->getSize() ?: 0,
                        'mime_type' => $file->getClientMimeType(),
                    ]);
                }
            }

            return $createdEvent;
        });

        // Granular Logging & Notifications
        try {
            $this->activityService->log(
                userId: $user->id,
                activityType: 'event_created',
                description: "Created event '{$event->title}'",
                module: 'event',
                relatedId: $event->id,
                action: 'event_created',
                entityName: $event->title,
                relatedUserId: null,
                metadata: ['type' => $event->type, 'start_date' => $event->start_date]
            );

            $this->auditService->log(
                module: 'event_management',
                action: 'event_created',
                description: "Created event {$event->title}",
                user: $user,
                entityType: 'Event',
                entityId: $event->id,
                status: 'success'
            );

            $this->sendBulkEventNotification($event, $user, 'event_created', 'New Event Scheduled');
        } catch (\Throwable $e) {
            Log::error('Event post-create logging error: ' . $e->getMessage());
        }

        $formatted = $this->formatEventResponse($event->fresh([
            'category',
            'user',
            'organizer',
            'assignedUsers',
            'participants.user',
            'visibilities',
            'reminders',
            'attachments.user',
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
        $isAdmin = in_array($user->role, ['admin', 'manager', 'superadmin']);
        if (!$isAdmin && $event->user_id !== $user->id && $event->organizer_id !== $user->id) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        foreach (['participant_user_ids', 'assigned_user_ids', 'attendee_ids', 'team_ids', 'user_ids', 'reminders'] as $f) {
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
            'start_time' => 'sometimes|nullable|string',
            'end_time' => 'sometimes|nullable|string',
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
            'reminders' => 'nullable|array',
            'reminders.*.value' => 'required_with:reminders|integer|min:1',
            'reminders.*.unit' => 'required_with:reminders|string|in:minutes,hours,days,minute,hour,day',
            'reminders.*.user_id' => 'nullable|integer|exists:users,id',
            'attachments' => 'nullable|array',
            'attachments.*' => 'file|max:51200',
        ]);

        DB::transaction(function () use ($event, $validated, $request, $user) {
            $event->update([
                'title' => $validated['title'] ?? $event->title,
                'description' => $validated['description'] ?? $event->description,
                'type' => $validated['type'] ?? $event->type,
                'category_id' => array_key_exists('category_id', $validated) ? $validated['category_id'] : $event->category_id,
                'color' => $validated['color'] ?? $event->color,
                'start_date' => $validated['start_date'] ?? $event->start_date,
                'end_date' => $validated['end_date'] ?? $event->end_date,
                'start_time' => $validated['start_time'] ?? $event->start_time,
                'end_time' => $validated['end_time'] ?? $event->end_time,
                'all_day' => $validated['all_day'] ?? $event->all_day,
                'is_global' => $validated['is_global'] ?? $event->is_global,
                'visibility_level' => $validated['visibility_level'] ?? $event->visibility_level,
                'location' => $validated['location'] ?? $event->location,
                'meeting_link' => $validated['meeting_link'] ?? $event->meeting_link,
                'status' => $validated['status'] ?? $event->status,
                'organizer_id' => $validated['organizer_id'] ?? $event->organizer_id,
            ]);

            // Sync participants if provided
            if (array_key_exists('participant_user_ids', $validated) || array_key_exists('assigned_user_ids', $validated) || array_key_exists('attendee_ids', $validated) || array_key_exists('user_ids', $validated)) {
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

            // Sync dynamic reminders if provided
            if (array_key_exists('reminders', $validated)) {
                EventReminder::where('event_id', $event->id)->delete();
                if (!empty($validated['reminders'])) {
                    foreach ($validated['reminders'] as $rem) {
                        $unit = strtolower(rtrim($rem['unit'] ?? 'minutes', 's')) . 's';
                        if (!in_array($unit, ['minutes', 'hours', 'days'])) {
                            $unit = 'minutes';
                        }
                        EventReminder::create([
                            'event_id' => $event->id,
                            'user_id' => $rem['user_id'] ?? null,
                            'value' => (int) ($rem['value'] ?? 15),
                            'unit' => $unit,
                            'is_sent' => false,
                        ]);
                    }
                }
            }

            // Upload new attachments if any
            if ($request->hasFile('attachments')) {
                $org = $request->attributes->get('currentOrganization');
                foreach ($request->file('attachments') as $file) {
                    if (!$file || !$file->isValid()) continue;

                    $origName = $file->getClientOriginalName();
                    $storedPath = $org
                        ? StorageDiskResolver::store($org, $file, 'events', $origName)
                        : $file->store('events/' . date('Y/m'), 'public');

                    EventAttachment::create([
                        'event_id' => $event->id,
                        'user_id' => $user->id,
                        'file_name' => $origName,
                        'file_path' => $storedPath,
                        'file_size' => $file->getSize() ?: 0,
                        'mime_type' => $file->getClientMimeType(),
                    ]);

                    $this->activityService->log(
                        userId: $user->id,
                        activityType: 'event_attachment_added',
                        description: "Uploaded attachment '{$origName}' to event '{$event->title}'",
                        module: 'event',
                        relatedId: $event->id,
                        action: 'event_attachment_added',
                        entityName: $origName
                    );
                }
            }
        });

        // Granular Logging & Notifications
        try {
            $this->activityService->log(
                userId: $user->id,
                activityType: 'event_updated',
                description: "Updated event '{$event->title}'",
                module: 'event',
                relatedId: $event->id,
                action: 'event_updated',
                entityName: $event->title
            );

            $this->auditService->log(
                module: 'event_management',
                action: 'event_updated',
                description: "Updated event {$event->title}",
                user: $user,
                entityType: 'Event',
                entityId: $event->id,
                status: 'success'
            );

            $this->sendBulkEventNotification($event, $user, 'event_updated', 'Event Updated');
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
            'reminders',
            'attachments.user',
        ]));

        return response()->json([
            'success' => true,
            'message' => 'Event updated successfully',
            'data' => $formatted,
            'event' => $formatted,
        ]);
    }

    /**
     * Cancel an event.
     */
    public function cancel(Request $request, Event $event): JsonResponse
    {
        $user = $request->user();
        $isAdmin = in_array($user->role, ['admin', 'manager', 'superadmin']);
        if (!$isAdmin && $event->user_id !== $user->id && $event->organizer_id !== $user->id) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $event->update(['status' => 'cancelled']);

        try {
            $this->activityService->log(
                userId: $user->id,
                activityType: 'event_cancelled',
                description: "Cancelled event '{$event->title}'",
                module: 'event',
                relatedId: $event->id,
                action: 'event_cancelled',
                entityName: $event->title
            );

            $this->auditService->log(
                module: 'event_management',
                action: 'event_cancelled',
                description: "Cancelled event {$event->title}",
                user: $user,
                entityType: 'Event',
                entityId: $event->id,
                status: 'success'
            );

            $this->sendBulkEventNotification($event, $user, 'event_cancelled', 'Event Cancelled');
        } catch (\Throwable $e) {
            Log::error('Event cancel logging error: ' . $e->getMessage());
        }

        return response()->json([
            'success' => true,
            'message' => 'Event cancelled successfully',
            'data' => $this->formatEventResponse($event->fresh()),
        ]);
    }

    public function destroy(Request $request, ?Event $event = null): JsonResponse
    {
        // Support both destroy(Event $event) and destroy(Request $request, Event $event)
        if ($request instanceof Event && $event === null) {
            $event = $request;
            $request = request();
        }

        $user = $request->user() ?? auth()->user();
        if (!$user && $event) {
            $user = User::find($event->user_id);
        }

        $isAdmin = $user && in_array($user->role, ['admin', 'manager', 'superadmin']);
        if (!$isAdmin && $user && $event->user_id !== $user->id && $event->organizer_id !== $user->id) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $eventTitle = $event->title;
        $eventId = $event->id;

        DB::transaction(function () use ($event) {
            EventReminder::where('event_id', $event->id)->delete();
            EventAttachment::where('event_id', $event->id)->delete();
            EventParticipant::where('event_id', $event->id)->delete();
            EventVisibility::where('event_id', $event->id)->delete();
            $event->assignedUsers()->detach();
            $event->delete();
        });

        try {
            $this->activityService->log(
                userId: $user->id,
                activityType: 'event_deleted',
                description: "Deleted event '{$eventTitle}'",
                module: 'event',
                relatedId: $eventId,
                action: 'event_deleted',
                entityName: $eventTitle
            );

            $this->auditService->log(
                module: 'event_management',
                action: 'event_deleted',
                description: "Deleted event {$eventTitle}",
                user: $user,
                entityType: 'Event',
                entityId: $eventId,
                status: 'success'
            );
        } catch (\Throwable $e) {
            Log::error('Event delete logging error: ' . $e->getMessage());
        }

        return response()->json([
            'success' => true,
            'message' => 'Event deleted successfully',
        ]);
    }

    /**
     * Add participants to an event.
     */
    public function addParticipants(Request $request, Event $event): JsonResponse
    {
        $currentUser = $request->user();
        $validated = $request->validate([
            'user_ids' => 'required|array',
            'user_ids.*' => 'integer|exists:users,id',
        ]);

        $addedUsers = [];
        foreach ($validated['user_ids'] as $uId) {
            $targetUser = User::find($uId);
            if (!$targetUser) continue;

            $event->assignedUsers()->syncWithoutDetaching([$uId]);
            EventParticipant::firstOrCreate(
                ['event_id' => $event->id, 'user_id' => $uId],
                ['status' => 'invited', 'attended' => false]
            );

            $addedUsers[] = $targetUser;

            // Granular log per participant added
            $this->activityService->log(
                userId: $currentUser->id,
                activityType: 'event_participant_added',
                description: "Added {$targetUser->name} to event '{$event->title}'",
                module: 'event',
                relatedId: $event->id,
                action: 'event_participant_added',
                entityName: $targetUser->name,
                relatedUserId: $targetUser->id
            );

            // Notify added user
            try {
                Notification::create([
                    'user_id' => $targetUser->id,
                    'sender_user_id' => $currentUser->id,
                    'type' => 'event_participant_added',
                    'related_module' => 'event',
                    'related_id' => $event->id,
                    'title' => "Added to Event: {$event->title}",
                    'message' => "You were added as a participant to '{$event->title}'.",
                    'link' => "/events/{$event->id}",
                ]);
            } catch (\Throwable $e) {}
        }

        return response()->json([
            'success' => true,
            'message' => 'Participants added successfully.',
            'data' => $this->formatEventResponse($event->fresh([
                'assignedUsers',
                'participants.user',
            ])),
        ]);
    }

    /**
     * Remove a participant from an event.
     */
    public function removeParticipant(Request $request, Event $event, User $user): JsonResponse
    {
        $currentUser = $request->user();

        $event->assignedUsers()->detach($user->id);
        EventParticipant::where('event_id', $event->id)->where('user_id', $user->id)->delete();

        $this->activityService->log(
            userId: $currentUser->id,
            activityType: 'event_participant_removed',
            description: "Removed {$user->name} from event '{$event->title}'",
            module: 'event',
            relatedId: $event->id,
            action: 'event_participant_removed',
            entityName: $user->name,
            relatedUserId: $user->id
        );

        return response()->json([
            'success' => true,
            'message' => "Participant {$user->name} removed successfully.",
            'data' => $this->formatEventResponse($event->fresh([
                'assignedUsers',
                'participants.user',
            ])),
        ]);
    }

    /**
     * Upload an attachment to an event.
     */
    public function uploadAttachment(Request $request, Event $event): JsonResponse
    {
        $user = $request->user();
        $request->validate([
            'file' => 'required|file|max:51200', // 50MB max
        ]);

        $file = $request->file('file');
        $origName = $file->getClientOriginalName();
        $org = $request->attributes->get('currentOrganization');

        $storedPath = $org
            ? StorageDiskResolver::store($org, $file, 'events', $origName)
            : $file->store('events/' . date('Y/m'), 'public');

        $attachment = EventAttachment::create([
            'event_id' => $event->id,
            'user_id' => $user->id,
            'file_name' => $origName,
            'file_path' => $storedPath,
            'file_size' => $file->getSize() ?: 0,
            'mime_type' => $file->getClientMimeType(),
        ]);

        $this->activityService->log(
            userId: $user->id,
            activityType: 'event_attachment_added',
            description: "Uploaded attachment '{$origName}' to event '{$event->title}'",
            module: 'event',
            relatedId: $event->id,
            action: 'event_attachment_added',
            entityName: $origName
        );

        return response()->json([
            'success' => true,
            'message' => 'Attachment uploaded successfully.',
            'data' => $attachment->load('user:id,name'),
        ], 201);
    }

    /**
     * Delete an attachment from an event.
     */
    public function deleteAttachment(Request $request, Event $event, EventAttachment $attachment): JsonResponse
    {
        $user = $request->user();

        if ($attachment->event_id !== $event->id) {
            return response()->json(['success' => false, 'message' => 'Attachment does not belong to this event.'], 400);
        }

        $fileName = $attachment->file_name;
        $org = $request->attributes->get('currentOrganization');

        if ($org) {
            StorageDiskResolver::delete($org, $attachment->file_path);
        } else {
            Storage::disk('public')->delete(ltrim($attachment->file_path, '/'));
        }

        $attachment->delete();

        $this->activityService->log(
            userId: $user->id,
            activityType: 'event_attachment_removed',
            description: "Removed attachment '{$fileName}' from event '{$event->title}'",
            module: 'event',
            relatedId: $event->id,
            action: 'event_attachment_removed',
            entityName: $fileName
        );

        return response()->json([
            'success' => true,
            'message' => 'Attachment deleted successfully.',
        ]);
    }

    /**
     * Download an attachment from an event.
     */
    public function downloadAttachment(Request $request, Event $event, EventAttachment $attachment)
    {
        if ($attachment->event_id !== $event->id) {
            return response()->json(['success' => false, 'message' => 'Attachment does not belong to this event.'], 400);
        }

        $user = $request->user();
        $org = $request->attributes->get('currentOrganization');

        if ($user) {
            $this->activityService->log(
                userId: $user->id,
                activityType: 'event_attachment_downloaded',
                description: "Downloaded attachment '{$attachment->file_name}' from event '{$event->title}'",
                module: 'event',
                relatedId: $event->id,
                action: 'event_attachment_downloaded',
                entityName: $attachment->file_name
            );
        }

        if ($org) {
            return StorageDiskResolver::download($org, $attachment->file_path, $attachment->file_name);
        }

        $cleanPath = ltrim($attachment->file_path, '/');
        if (str_starts_with($cleanPath, 'storage/')) {
            $cleanPath = substr($cleanPath, 8);
        }

        if (Storage::disk('public')->exists($cleanPath)) {
            return Storage::disk('public')->download($cleanPath, $attachment->file_name);
        }

        if (file_exists(storage_path('app/public/' . $cleanPath))) {
            return response()->download(storage_path('app/public/' . $cleanPath), $attachment->file_name);
        }

        return response()->json(['success' => false, 'message' => 'Attachment file not found on disk.'], 404);
    }

    /**
     * RSVP to an event or acknowledge an announcement.
     */
    public function rsvp(Request $request, Event $event): JsonResponse
    {
        $user = $request->user();
        $validated = $request->validate([
            'status' => 'required|string|in:accepted,declined,tentative,acknowledged,attended',
            'response_notes' => 'nullable|string|max:1000',
        ]);

        $participant = EventParticipant::updateOrCreate(
            ['event_id' => $event->id, 'user_id' => $user->id],
            [
                'status' => $validated['status'],
                'response_notes' => $validated['response_notes'] ?? null,
                'attended' => $validated['status'] === 'attended',
            ]
        );

        $event->assignedUsers()->syncWithoutDetaching([$user->id]);

        $this->activityService->log(
            userId: $user->id,
            activityType: 'rsvp',
            description: "RSVP {$validated['status']} for event '{$event->title}'",
            module: 'event',
            relatedId: $event->id,
            action: 'rsvp',
            entityName: $event->title,
            relatedUserId: null,
            metadata: ['status' => $validated['status']]
        );

        return response()->json([
            'success' => true,
            'message' => 'RSVP recorded successfully.',
            'data' => $participant->load('user:id,name,email,avatar'),
        ]);
    }

    /**
     * Get unified activity feed for a single Event.
     */
    public function activities(Request $request, Event $event): JsonResponse
    {
        $startDate = $request->input('start_date') ?: $request->input('date_from');
        $endDate = $request->input('end_date') ?: $request->input('date_to');
        $dateFilter = $request->input('date');
        $userFilter = $request->input('user_id');
        $typeFilter = $request->query('type') ?: $request->query('action');

        $query = \App\Models\Activity::with('user:id,name,email,avatar,role')
            ->where('related_id', $event->id)
            ->where(function ($q) {
                $q->whereIn('related_module', ['event', 'events'])
                  ->orWhereIn('activity_type', [
                      'event', 'events', 'event_created', 'event_updated', 'event_deleted',
                      'event_cancelled', 'rsvp', 'event_participant_added', 'event_participant_removed',
                      'event_attachment_added', 'event_attachment_deleted'
                  ]);
            });

        if (!empty($startDate)) {
            try {
                $parsedFrom = \Carbon\Carbon::parse($startDate)->toDateString();
                $query->whereDate('created_at', '>=', $parsedFrom);
            } catch (\Throwable $e) {
                $query->whereDate('created_at', '>=', $startDate);
            }
        }

        if (!empty($endDate)) {
            try {
                $parsedTo = \Carbon\Carbon::parse($endDate)->toDateString();
                $query->whereDate('created_at', '<=', $parsedTo);
            } catch (\Throwable $e) {
                $query->whereDate('created_at', '<=', $endDate);
            }
        }

        if (!empty($request->input('date')) && empty($startDate) && empty($endDate)) {
            try {
                $parsedDate = \Carbon\Carbon::parse($request->input('date'))->toDateString();
                $query->whereDate('created_at', $parsedDate);
            } catch (\Throwable $e) {
                $query->whereDate('created_at', $request->input('date'));
            }
        }
        if (!empty($userFilter)) {
            $query->where('user_id', $userFilter);
        }
        if ($typeFilter && $typeFilter !== 'all') {
            $query->where(function ($q) use ($typeFilter) {
                $q->where('activity_type', $typeFilter)
                  ->orWhere('action', $typeFilter);

                if (in_array($typeFilter, ['event_created', 'created'])) {
                    $q->orWhereIn('activity_type', ['event_created', 'created'])
                      ->orWhereIn('action', ['created', 'create', 'event_created']);
                } elseif (in_array($typeFilter, ['event_updated', 'updated', 'edited'])) {
                    $q->orWhereIn('activity_type', ['event_updated', 'updated'])
                      ->orWhereIn('action', ['updated', 'edited', 'update', 'event_updated']);
                } elseif (in_array($typeFilter, ['event_cancelled', 'cancelled'])) {
                    $q->orWhereIn('activity_type', ['event_cancelled', 'cancelled'])
                      ->orWhereIn('action', ['cancelled', 'cancel', 'event_cancelled']);
                } elseif (in_array($typeFilter, ['rsvp', 'acknowledged', 'accepted', 'declined', 'tentative'])) {
                    $q->orWhereIn('activity_type', ['rsvp'])
                      ->orWhereIn('action', ['rsvp', 'acknowledged', 'accepted', 'declined', 'tentative']);
                }
            });
        }

        \Illuminate\Support\Facades\Log::info('Activity Filter Trace - Event', [
            'request' => $request->all(),
            'sql' => $query->toSql(),
            'bindings' => $query->getBindings(),
        ]);

        $activities = $query->orderBy('created_at', 'desc')->get();

        // Distinct users who performed activities on this event
        $userIds = $activities->pluck('user_id')->filter()->unique()->values();
        $users = User::whereIn('id', $userIds)->select('id', 'name', 'email', 'avatar', 'role')->get();

        return response()->json([
            'success' => true,
            'data' => $activities,
            'users' => $users,
        ]);
    }

    /**
     * Format an event model into a standardized, crash-proof API response array.
     */
    private function formatEventResponse(Event $event): array
    {
        $event->loadMissing([
            'category',
            'user:id,name,email,avatar',
            'organizer:id,name,email,avatar',
            'assignedUsers:id,name,email,avatar',
            'participants.user:id,name,email,avatar',
            'visibilities.team:id,name',
            'reminders',
            'attachments.user:id,name',
        ]);

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
            'response_notes' => $p->response_notes,
        ])->toArray() : [];

        $remindersArray = $event->reminders ? $event->reminders->map(fn ($r) => [
            'id' => $r->id,
            'value' => (int) $r->value,
            'unit' => $r->unit,
            'is_sent' => (bool) $r->is_sent,
            'sent_at' => $r->sent_at?->toIso8601String(),
            'user_id' => $r->user_id,
        ])->toArray() : [];

        $attachmentsArray = $event->attachments ? $event->attachments->map(fn ($a) => [
            'id' => $a->id,
            'file_name' => $a->file_name,
            'file_path' => $a->file_path,
            'file_size' => (int) $a->file_size,
            'mime_type' => $a->mime_type,
            'uploaded_by' => $a->user?->name ?? 'User',
            'created_at' => $a->created_at?->toIso8601String(),
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
            'start_time' => $event->start_time,
            'end_time' => $event->end_time,
            'all_day' => (bool) $event->all_day,
            'color' => $event->color,
            'is_global' => (bool) $event->is_global,
            'is_announcement' => ($event->type === 'announcement' || $event->type === 'Company Announcement'),
            'visibility_level' => $event->visibility_level ?? ($event->is_global ? 'organization' : 'private'),
            'location' => $event->location,
            'meeting_link' => $event->meeting_link,
            'status' => $event->status ?? 'scheduled',
            'user_id' => $event->user_id,
            'created_by' => $event->user_id,
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
            'reminders' => $remindersArray,
            'attachments' => $attachmentsArray,
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
        if (! in_array($user->role, ['admin', 'manager', 'superadmin'])) {
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

        return app(TenantCacheManager::class)->remember($cacheKey, 30, function () use ($user, $today) {
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
            if (! in_array($user->role, ['admin', 'manager', 'superadmin'])) {
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
                'link' => "/events/{$event->id}",
            ];
        }

        $this->notificationService->createBulk($notifications);
    }

    private function getEventRecipientIds(Event $event): array
    {
        if ($event->is_global || $event->visibility_level === 'organization') {
            return User::where('status', 'active')->orWhereNull('status')->pluck('id')->toArray();
        }
        $assignedIds = $event->assignedUsers()->pluck('users.id')->toArray();
        $participantIds = $event->participants()->pluck('user_id')->toArray();
        $merged = array_unique(array_merge($assignedIds, $participantIds));
        return !empty($merged) ? $merged : [$event->user_id];
    }

    private function fmtDate($date): ?string
    {
        return $date ? (is_string($date) ? $date : $date->format('Y-m-d\\TH:i:s')) : null;
    }
}
