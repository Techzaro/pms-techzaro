<?php

namespace App\Http\Controllers;

use App\Models\TaskSavedView;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TaskSavedViewController extends Controller
{
    /**
     * Display a listing of saved views for the authenticated user.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $views = TaskSavedView::where('user_id', $user->id)
            ->orderBy('is_default', 'desc')
            ->orderBy('name', 'asc')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $views,
        ]);
    }

    /**
     * Store a newly created saved view in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'filters' => 'required|array',
            'is_default' => 'nullable|boolean',
        ]);

        $isDefault = !empty($validated['is_default']);

        if ($isDefault) {
            TaskSavedView::where('user_id', $user->id)->update(['is_default' => false]);
        }

        $view = TaskSavedView::create([
            'user_id' => $user->id,
            'name' => trim($validated['name']),
            'filters' => $validated['filters'],
            'is_default' => $isDefault,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Task view saved successfully.',
            'data' => $view,
        ], 201);
    }

    /**
     * Update the specified saved view in storage.
     */
    public function update(Request $request, TaskSavedView $taskSavedView): JsonResponse
    {
        $user = $request->user();

        if ((int) $taskSavedView->user_id !== (int) $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized access to saved view.',
            ], 403);
        }

        $validated = $request->validate([
            'name' => 'nullable|string|max:100',
            'filters' => 'nullable|array',
            'is_default' => 'nullable|boolean',
        ]);

        if (array_key_exists('is_default', $validated) && $validated['is_default']) {
            TaskSavedView::where('user_id', $user->id)
                ->where('id', '!=', $taskSavedView->id)
                ->update(['is_default' => false]);
        }

        $updateData = [];
        if (isset($validated['name'])) {
            $updateData['name'] = trim($validated['name']);
        }
        if (isset($validated['filters'])) {
            $updateData['filters'] = $validated['filters'];
        }
        if (array_key_exists('is_default', $validated)) {
            $updateData['is_default'] = (bool) $validated['is_default'];
        }

        $taskSavedView->update($updateData);

        return response()->json([
            'success' => true,
            'message' => 'Task view updated successfully.',
            'data' => $taskSavedView->fresh(),
        ]);
    }

    /**
     * Remove the specified saved view from storage.
     */
    public function destroy(Request $request, TaskSavedView $taskSavedView): JsonResponse
    {
        $user = $request->user();

        if ((int) $taskSavedView->user_id !== (int) $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized access to saved view.',
            ], 403);
        }

        $taskSavedView->delete();

        return response()->json([
            'success' => true,
            'message' => 'Task view deleted successfully.',
        ]);
    }
}
