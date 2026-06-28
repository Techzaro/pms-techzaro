<?php

namespace App\Http\Controllers;

use App\Models\Task;
use App\Models\TaskUserNote;
use Illuminate\Http\Request;

class TaskUserNoteController extends Controller
{
    public function show(Task $task)
    {
        $notes = TaskUserNote::where('task_id', $task->id)
            ->where('user_id', auth()->id())
            ->orderBy('created_at', 'desc')
            ->get(['id', 'note', 'created_at']);

        return response()->json(['notes' => $notes]);
    }

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
