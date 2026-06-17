<?php

namespace App\Http\Controllers;

use App\Models\Task;
use App\Models\TaskUserNote;
use Illuminate\Http\Request;

class TaskUserNoteController extends Controller
{
    public function show(Task $task)
    {
        $note = TaskUserNote::where('task_id', $task->id)
            ->where('user_id', auth()->id())
            ->first();

        return response()->json([
            'note' => $note?->note ?? '',
        ]);
    }

    public function store(Request $request, Task $task)
    {
        $validated = $request->validate([
            'note' => 'nullable|string|max:5000',
        ]);

        $note = TaskUserNote::updateOrCreate(
            ['task_id' => $task->id, 'user_id' => auth()->id()],
            ['note' => $validated['note'] ?? ''],
        );

        return response()->json([
            'message' => 'Note saved.',
            'note' => $note->note,
        ]);
    }
}
