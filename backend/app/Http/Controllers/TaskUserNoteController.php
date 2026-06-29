<?php

namespace App\Http\Controllers;

use App\Models\Task;
use App\Models\TaskUserNote;
use Illuminate\Http\Request;

/**
 * Controller for managing personal notes on tasks.
 * Each user can create, view, and delete their own notes on any task.
 * Notes are private to the user who created them.
 */
class TaskUserNoteController extends Controller
{
    /**
     * Get all personal notes for a task belonging to the authenticated user.
     *
     * @param  \App\Models\Task  $task  The task to retrieve notes for.
     * @return \Illuminate\Http\JsonResponse  JSON response with the user's notes.
     */
    public function show(Task $task)
    {
        $notes = TaskUserNote::where('task_id', $task->id)
            ->where('user_id', auth()->id())
            ->orderBy('created_at', 'desc')
            ->get(['id', 'note', 'created_at']);

        return response()->json(['notes' => $notes]);
    }

    /**
     * Create a new personal note on a task for the authenticated user.
     *
     * @param  \Illuminate\Http\Request  $request  Input: note (required, max 5000 chars).
     * @param  \App\Models\Task  $task  The task to add the note to.
     * @return \Illuminate\Http\JsonResponse  JSON response with the updated notes list.
     */
    public function store(Request $request, Task $task)
    {
        $validated = $request->validate([
            'note' => 'required|string|max:5000',
        ]);

        $note = TaskUserNote::create([
            'task_id' => $task->id,
            'user_id' => auth()->id(),
            'note' => $validated['note'],
        ]);

        $notes = TaskUserNote::where('task_id', $task->id)
            ->where('user_id', auth()->id())
            ->orderBy('created_at', 'desc')
            ->get(['id', 'note', 'created_at']);

        return response()->json(['notes' => $notes]);
    }

    /**
     * Delete a personal note. Users can only delete their own notes.
     *
     * @param  \App\Models\Task  $task  The task the note belongs to.
     * @param  \App\Models\TaskUserNote  $note  The note to delete.
     * @return \Illuminate\Http\JsonResponse  JSON response with the updated notes list.
     */
    public function destroy(Task $task, TaskUserNote $note)
    {
        if ((int) $note->user_id !== (int) auth()->id()) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $note->delete();

        $notes = TaskUserNote::where('task_id', $task->id)
            ->where('user_id', auth()->id())
            ->orderBy('created_at', 'desc')
            ->get(['id', 'note', 'created_at']);

        return response()->json(['notes' => $notes]);
    }
}
