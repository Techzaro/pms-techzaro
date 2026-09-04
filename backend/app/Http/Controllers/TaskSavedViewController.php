<?php

namespace App\Http\Controllers;

use App\Models\TaskSavedView;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

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
            'name' => 'nullable|string|max:100',
            'view_name' => 'nullable|string|max:100',
            'filters' => 'nullable|array',
            'filter_payload' => 'nullable|array',
            'sort_parameters' => 'nullable',
            'is_default' => 'nullable|boolean',
        ]);

        $name = trim($validated['name'] ?? $validated['view_name'] ?? '');
        if (empty($name)) {
            return response()->json([
                'success' => false,
                'message' => 'View name is required.',
            ], 422);
        }

        $filters = $validated['filters'] ?? $validated['filter_payload'] ?? [];
        $sortParams = $validated['sort_parameters'] ?? null;
        if (is_string($sortParams)) {
            $decoded = json_decode($sortParams, true);
            if (json_last_error() === JSON_ERROR_NONE) {
                $sortParams = $decoded;
            }
        }

        $isDefault = !empty($validated['is_default']);

        if ($isDefault) {
            TaskSavedView::where('user_id', $user->id)->update(['is_default' => false]);
            if (Schema::hasTable('saved_views')) {
                DB::table('saved_views')->where('user_id', $user->id)->update(['is_default' => false]);
            }
        }

        $view = TaskSavedView::create([
            'user_id' => $user->id,
            'name' => $name,
            'view_name' => $name,
            'filters' => $filters,
            'filter_payload' => $filters,
            'sort_parameters' => $sortParams,
            'is_default' => $isDefault,
        ]);

        // Mirror in saved_views table if present
        if (Schema::hasTable('saved_views')) {
            DB::table('saved_views')->insert([
                'user_id' => $user->id,
                'view_name' => $name,
                'name' => $name,
                'filter_payload' => is_array($filters) ? json_encode($filters) : $filters,
                'filters' => is_array($filters) ? json_encode($filters) : $filters,
                'sort_parameters' => is_array($sortParams) ? json_encode($sortParams) : $sortParams,
                'is_default' => $isDefault,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Task view saved successfully.',
            'data' => $view,
        ], 201);
    }

    /**
     * Display the specified saved view.
     */
    public function show(Request $request, TaskSavedView $taskSavedView): JsonResponse
    {
        $user = $request->user();

        if ((int) $taskSavedView->user_id !== (int) $user->id) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized access to saved view.',
            ], 403);
        }

        return response()->json([
            'success' => true,
            'data' => $taskSavedView,
        ]);
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
            'view_name' => 'nullable|string|max:100',
            'filters' => 'nullable|array',
            'filter_payload' => 'nullable|array',
            'sort_parameters' => 'nullable',
            'is_default' => 'nullable|boolean',
        ]);

        if (array_key_exists('is_default', $validated) && $validated['is_default']) {
            TaskSavedView::where('user_id', $user->id)
                ->where('id', '!=', $taskSavedView->id)
                ->update(['is_default' => false]);
            if (Schema::hasTable('saved_views')) {
                DB::table('saved_views')->where('user_id', $user->id)->update(['is_default' => false]);
            }
        }

        $updateData = [];
        $name = isset($validated['name']) ? trim($validated['name']) : (isset($validated['view_name']) ? trim($validated['view_name']) : null);
        if ($name !== null && $name !== '') {
            $updateData['name'] = $name;
            $updateData['view_name'] = $name;
        }

        $filters = $validated['filters'] ?? $validated['filter_payload'] ?? null;
        if ($filters !== null) {
            $updateData['filters'] = $filters;
            $updateData['filter_payload'] = $filters;
        }

        if (array_key_exists('sort_parameters', $validated)) {
            $sortParams = $validated['sort_parameters'];
            if (is_string($sortParams)) {
                $decoded = json_decode($sortParams, true);
                if (json_last_error() === JSON_ERROR_NONE) {
                    $sortParams = $decoded;
                }
            }
            $updateData['sort_parameters'] = $sortParams;
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
