<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\Template;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use App\Services\StorageDiskResolver;

class TemplateController extends Controller
{
    /**
     * Display a listing of templates visible to the authenticated user.
     *
     * Dynamic filtering rules:
     * - Private: Only if created_by matches user id
     * - Project Team: Only if user is assigned/belongs to project_id
     * - Department Team: Only if department matches user's department
     * - Organization: Only if organization matches user's company_name
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user() ?: auth()->user();
        if (!$user) {
            return response()->json([]);
        }

        // Accessible project IDs for project_team filtering
        $userProjectIds = Project::where(function ($q) use ($user) {
            $q->whereHas('team', fn ($tq) => $tq->whereHas('members', fn ($mq) => $mq->where('users.id', $user->id)))
                ->orWhereJsonContains('guest_ids', $user->id)
                ->orWhereHas('tasks', fn ($tq) => $tq->where('assigned_to', $user->id)->orWhere('assigned_by', $user->id));
        })->pluck('id')->toArray();

        $userDept = $user->department ?: 'General';
        $userOrg = $user->company_name ?: 'Techzaro';

        $templates = Template::with(['project:id,title', 'creator:id,name,email,role'])
            ->where(function ($q) use ($user, $userProjectIds, $userDept, $userOrg) {
                // Private templates created by current user
                $q->where(function ($sq) use ($user) {
                    $sq->where('visibility_level', 'private')
                        ->where('created_by', $user->id);
                })
                // Project Team templates for projects user belongs to
                ->orWhere(function ($sq) use ($userProjectIds) {
                    $sq->where('visibility_level', 'project_team')
                        ->whereIn('project_id', $userProjectIds);
                })
                // Department Team templates for user's department
                ->orWhere(function ($sq) use ($userDept, $user) {
                    $sq->where('visibility_level', 'department_team')
                        ->where(function ($dsq) use ($userDept, $user) {
                            $dsq->where('department', $userDept)
                                ->orWhere('created_by', $user->id);
                        });
                })
                // Organization templates for user's company
                ->orWhere(function ($sq) use ($userOrg, $user) {
                    $sq->where('visibility_level', 'organization')
                        ->where(function ($osq) use ($userOrg, $user) {
                            $osq->where('organization', $userOrg)
                                ->orWhereNull('organization')
                                ->orWhere('created_by', $user->id);
                        });
                });
            })
            ->latest()
            ->get();

        return response()->json(['data' => $templates, 'success' => true]);
    }

    /**
     * Store a newly created template in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'category' => 'nullable|string|max:100',
            'visibility_level' => 'required|in:private,project_team,department_team,organization',
            'project_id' => 'nullable|required_if:visibility_level,project_team|exists:projects,id',
            'subtasks' => 'nullable|array',
            'requirements' => 'nullable|array',
            'file' => 'nullable|file|mimes:json,txt,pdf,doc,docx,xlsx|max:10240',
        ]);

        $filePath = null;
        if ($request->hasFile('file')) {
            $org = $request->attributes->get('currentOrganization');
            if ($org) {
                $filePath = StorageDiskResolver::store($org, $request->file('file'), 'templates');
            } else {
                $filePath = $request->file('file')->store('templates', 'public');
            }
        }

        $templateData = [
            'subtasks' => $request->input('subtasks', []),
            'requirements' => $request->input('requirements', []),
            'task_type' => $request->input('task_type', 'one_off'),
            'priority' => $request->input('priority', 'Medium'),
        ];

        $template = Template::create([
            'title' => $validated['title'],
            'description' => $validated['description'] ?? null,
            'category' => $validated['category'] ?? 'General',
            'visibility_level' => $validated['visibility_level'],
            'project_id' => $validated['project_id'] ?? null,
            'department' => $user->department ?: 'General',
            'organization' => $user->company_name ?: 'Techzaro',
            'data' => $templateData,
            'file_path' => $filePath,
            'created_by' => $user->id,
            'updated_by' => $user->id,
        ]);

        return response()->json(['data' => $template->load(['project:id,title', 'creator:id,name']), 'success' => true, 'message' => 'Template created successfully.']);
    }

    /**
     * Update the specified template in storage.
     */
    public function update(Request $request, Template $template): JsonResponse
    {
        $user = $request->user();

        // Permission check: Creator or Admin/Manager
        if ($template->created_by !== $user->id && ! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized to edit this template.'], 403);
        }

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'nullable|string',
            'category' => 'nullable|string|max:100',
            'visibility_level' => 'required|in:private,project_team,department_team,organization',
            'project_id' => 'nullable|required_if:visibility_level,project_team|exists:projects,id',
            'subtasks' => 'nullable|array',
            'requirements' => 'nullable|array',
        ]);

        $filePath = $template->file_path;

        $org = $request->attributes->get('currentOrganization');

        if ($request->boolean('delete_file') && $filePath) {
            if ($org) {
                StorageDiskResolver::delete($org, $filePath);
            } else {
                Storage::disk('public')->delete($filePath);
            }
            $filePath = null;
        }

        if ($request->hasFile('file')) {
            if ($template->file_path) {
                if ($org) {
                    StorageDiskResolver::delete($org, $template->file_path);
                } else {
                    Storage::disk('public')->delete($template->file_path);
                }
            }
            if ($org) {
                $filePath = StorageDiskResolver::store($org, $request->file('file'), 'templates');
            } else {
                $filePath = $request->file('file')->store('templates', 'public');
            }
        }

        $currentData = $template->data ?? [];
        $currentData['subtasks'] = $request->input('subtasks', $currentData['subtasks'] ?? []);
        $currentData['requirements'] = $request->input('requirements', $currentData['requirements'] ?? []);

        $template->update([
            'title' => $validated['title'],
            'description' => $validated['description'] ?? null,
            'category' => $validated['category'] ?? 'General',
            'visibility_level' => $validated['visibility_level'],
            'project_id' => $validated['project_id'] ?? null,
            'data' => $currentData,
            'file_path' => $filePath,
            'updated_by' => $user->id,
        ]);

        return response()->json(['data' => $template->fresh(['project:id,title', 'creator:id,name']), 'success' => true, 'message' => 'Template updated successfully.']);
    }

    /**
     * Remove the specified template from storage.
     */
    public function destroy(Request $request, Template $template): JsonResponse
    {
        $user = $request->user();

        // Permission check: Creator or Admin/Manager
        if ($template->created_by !== $user->id && ! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized to delete this template.'], 403);
        }

        if ($template->file_path) {
            $org = $request->attributes->get('currentOrganization');
            if ($org) {
                StorageDiskResolver::delete($org, $template->file_path);
            } else {
                Storage::disk('public')->delete($template->file_path);
            }
        }

        $template->delete();

        return response()->json(['success' => true, 'message' => 'Template deleted successfully.']);
    }
}
