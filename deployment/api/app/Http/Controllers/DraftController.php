<?php

namespace App\Http\Controllers;

use App\Models\Draft;
use App\Services\DraftService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class DraftController extends Controller
{
    public function __construct(
        protected DraftService $draftService
    ) {}

    public function index(Request $request): JsonResponse
    {
        $filters = $request->only([
            'module_type', 'status', 'project_id', 'created_by',
            'search', 'date_from', 'date_to', 'last_updated_from',
            'last_updated_to', 'sort_field', 'sort_order', 'per_page',
            'is_returned',
        ]);

        $drafts = $this->draftService->getDrafts($filters, $request->user());

        return response()->json($drafts);
    }

    public function store(Request $request): JsonResponse
    {
        try {
            $validated = $request->validate([
                'module_type' => 'required|string|max:50',
                'original_record_id' => 'nullable|integer',
                'draft_data' => 'required|array',
                'title' => 'nullable|string|max:255',
                'project_id' => 'nullable|integer|exists:projects,id',
                'parent_id' => 'nullable|integer|exists:tasks,id',
            ]);

            $draft = $this->draftService->create($validated, $request->user());

            return response()->json([
                'success' => true,
                'message' => 'Draft saved successfully',
                'data' => $draft,
            ], 201);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Throwable $e) {
            \Log::error('Draft store error: ' . $e->getMessage(), [
                'file' => $e->getFile(),
                'line' => $e->getLine(),
                'trace' => $e->getTraceAsString(),
                'request' => $request->only(['module_type', 'title', 'project_id', 'parent_id']),
            ]);
            return response()->json([
                'success' => false,
                'message' => 'Failed to save draft: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function show(Draft $draft): JsonResponse
    {
        if (!$this->draftService->canUserAccess($draft, request()->user())) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $draft->load([
            'creator:id,name,email,role,avatar',
            'lastEditor:id,name,email,role,avatar',
            'project:id,title,project_code',
            'parentTask:id,title,business_id',
            'versions.editor:id,name,email,role,avatar',
        ]);

        return response()->json(['data' => $draft]);
    }

    public function update(Request $request, Draft $draft): JsonResponse
    {
        if (!$this->draftService->canUserAccess($draft, $request->user())) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'draft_data' => 'sometimes|array',
            'title' => 'sometimes|string|max:255',
            'status' => 'sometimes|string|in:draft,auto_saved,ready_to_publish',
        ]);

        $draft = $this->draftService->update($draft, $validated, $request->user());

        return response()->json([
            'success' => true,
            'message' => 'Draft updated successfully',
            'data' => $draft,
        ]);
    }

    public function destroy(Request $request, Draft $draft): JsonResponse
    {
        if (!$this->draftService->canUserDelete($draft, $request->user())) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $this->draftService->delete($draft, $request->user());

        return response()->json([
            'success' => true,
            'message' => 'Draft deleted successfully',
        ]);
    }

    public function publish(Request $request, Draft $draft): JsonResponse
    {
        if (!$this->draftService->canUserAccess($draft, $request->user())) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $entity = $this->draftService->publish($draft, $request->user());

        if (!$entity) {
            return response()->json([
                'success' => false,
                'message' => ucfirst($draft->module_type) . ' publishing is not yet supported',
            ], 422);
        }

        return response()->json([
            'success' => true,
            'message' => ucfirst($draft->module_type) . ' published successfully',
            'data' => $entity,
        ]);
    }

    public function duplicate(Request $request, Draft $draft): JsonResponse
    {
        if (!$this->draftService->canUserAccess($draft, $request->user())) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $newDraft = $this->draftService->duplicate($draft, $request->user());

        return response()->json([
            'success' => true,
            'message' => 'Draft duplicated successfully',
            'data' => $newDraft,
        ], 201);
    }

    public function restoreVersion(Request $request, Draft $draft, int $version): JsonResponse
    {
        if (!$this->draftService->canUserAccess($draft, $request->user())) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $draft = $this->draftService->restoreVersion($draft, $version, $request->user());

        return response()->json([
            'success' => true,
            'message' => "Draft restored to version {$version}",
            'data' => $draft,
        ]);
    }

    public function autoSave(Request $request, Draft $draft): JsonResponse
    {
        if (!$this->draftService->canUserAccess($draft, $request->user())) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'draft_data' => 'required|array',
            'title' => 'sometimes|string|max:255',
        ]);

        $draft = $this->draftService->autoSave($draft, $validated, $request->user());

        return response()->json([
            'success' => true,
            'message' => 'Draft auto-saved',
            'data' => $draft,
        ]);
    }

    public function cleanup(Request $request): JsonResponse
    {
        $days = $request->input('days', config('drafts.cleanup_days', 30));
        $deleted = $this->draftService->cleanup($days);

        return response()->json([
            'success' => true,
            'message' => "{$deleted} draft(s) cleaned up",
            'deleted_count' => $deleted,
        ]);
    }

    public function archive(Request $request): JsonResponse
    {
        $days = $request->input('days', config('drafts.archive_days', 90));
        $archived = $this->draftService->archive($days);

        return response()->json([
            'success' => true,
            'message' => "{$archived} draft(s) archived",
            'archived_count' => $archived,
        ]);
    }

    public function publishReturned(Request $request, Draft $draft): JsonResponse
    {
        if (!$draft->is_returned) {
            return response()->json(['success' => false, 'message' => 'This is not a returned draft.'], 422);
        }

        if (!$this->draftService->canUserAccess($draft, $request->user())) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'draft_data' => 'required|array',
        ]);

        $entity = $this->draftService->publishReturnedDraft($draft, $validated['draft_data'], $request->user());

        if (!$entity) {
            return response()->json(['success' => false, 'message' => 'Failed to publish draft.'], 500);
        }

        return response()->json([
            'success' => true,
            'message' => 'Draft published and reassigned successfully.',
            'data' => $entity,
        ]);
    }
}
