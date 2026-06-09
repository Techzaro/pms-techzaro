<?php

/**
 * Controller for calendar event CRUD operations.
 */

namespace App\Http\Controllers;

use App\Models\Event;
use Illuminate\Http\Request;

/**
 * Event controller for calendar CRUD.
 */
class EventController extends Controller
{
    /**
     * List events with optional filtering.
     */
    public function index(Request $request)
    {
        $events = Event::with('user:id,name')
            ->latest('start_date')
            ->filter($request->query())
            ->paginate(50);

        return response()->json($events);
    }

    /**
     * Show a single event.
     */
    public function show(Event $event)
    {
        $user = request()->user();

        if ($event->user_id !== $user->id && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $event->load('user:id,name,email');

        return response()->json([
            'event' => $event,
        ]);
    }

    /**
     * Create a new event.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'type' => 'nullable|string|max:32|in:meeting,deadline,task,personal,other',
            'color' => 'nullable|string|max:16',
            'start_date' => 'required|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            'all_day' => 'nullable|boolean',
        ]);

        $event = Event::create([
            'user_id' => $request->user()->id,
            'title' => $validated['title'],
            'description' => $validated['description'] ?? null,
            'type' => $validated['type'] ?? 'meeting',
            'color' => $validated['color'] ?? null,
            'start_date' => $validated['start_date'],
            'end_date' => $validated['end_date'] ?? null,
            'all_day' => $validated['all_day'] ?? false,
        ]);

        return response()->json([
            'message' => 'Event created successfully',
            'event' => $event->load('user:id,name'),
        ], 201);
    }

    /**
     * Update an event.
     */
    public function update(Request $request, Event $event)
    {
        $user = $request->user();

        if ($event->user_id !== $user->id && !in_array($user->role, ['admin', 'manager'])) {
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
        ]);

        $event->update($validated);

        return response()->json([
            'message' => 'Event updated successfully',
            'event' => $event->fresh()->load('user:id,name'),
        ]);
    }

    /**
     * Delete an event.
     */
    public function destroy(Event $event)
    {
        $user = request()->user();

        if ($event->user_id !== $user->id && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $event->delete();

        return response()->json([
            'message' => 'Event deleted successfully',
        ]);
    }
}
