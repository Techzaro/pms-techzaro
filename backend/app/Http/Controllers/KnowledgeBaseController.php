<?php

namespace App\Http\Controllers;

use App\Models\KnowledgeBase;
use App\Models\Project;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use App\Services\StorageDiskResolver;

class KnowledgeBaseController extends Controller
{
    /**
     * Display a listing of knowledge base articles visible to the authenticated user.
     *
     * Dynamic Tiered Visibility Rules:
     * - Private: Return only if created_by matches user id
     * - Project Team: Return only if user belongs to project_id
     * - Department Team: Return only if department matches user's department
     * - Organization: Return only if organization matches user's company_name
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        // User's accessible projects
        $userProjectIds = Project::where(function ($q) use ($user) {
            $q->whereHas('team', fn ($tq) => $tq->whereHas('members', fn ($mq) => $mq->where('users.id', $user->id)))
                ->orWhereJsonContains('guest_ids', $user->id)
                ->orWhereHas('tasks', fn ($tq) => $tq->where('assigned_to', $user->id)->orWhere('assigned_by', $user->id));
        })->pluck('id')->toArray();

        $userDept = $user->department ?: 'General';
        $userOrg = $user->company_name ?: 'Techzaro';

        $query = KnowledgeBase::with(['project:id,title', 'creator:id,name,email,role'])
            ->where(function ($q) use ($user, $userProjectIds, $userDept, $userOrg) {
                // Private
                $q->where(function ($sq) use ($user) {
                    $sq->where('visibility_level', 'private')
                        ->where('created_by', $user->id);
                })
                // Project Team
                ->orWhere(function ($sq) use ($userProjectIds) {
                    $sq->where('visibility_level', 'project_team')
                        ->whereIn('project_id', $userProjectIds);
                })
                // Department Team
                ->orWhere(function ($sq) use ($userDept, $user) {
                    $sq->where('visibility_level', 'department_team')
                        ->where(function ($dsq) use ($userDept, $user) {
                            $dsq->where('department', $userDept)
                                ->orWhere('created_by', $user->id);
                        });
                })
                // Organization
                ->orWhere(function ($sq) use ($userOrg, $user) {
                    $sq->where('visibility_level', 'organization')
                        ->where(function ($osq) use ($userOrg, $user) {
                            $osq->where('organization', $userOrg)
                                ->orWhereNull('organization')
                                ->orWhere('created_by', $user->id);
                        });
                });
            });

        if ($request->filled('search')) {
            $search = $request->input('search');
            $query->where(function ($sq) use ($search) {
                $sq->where('title', 'like', '%'.$search.'%')
                    ->orWhere('content', 'like', '%'.$search.'%')
                    ->orWhere('category', 'like', '%'.$search.'%');
            });
        }

        if ($request->filled('category') && $request->input('category') !== 'all') {
            $query->where('category', $request->input('category'));
        }

        if ($request->filled('visibility_level') && $request->input('visibility_level') !== 'all') {
            $query->where('visibility_level', $request->input('visibility_level'));
        }

        $items = $query->latest()->get();

        return response()->json(['data' => $items, 'success' => true]);
    }

    /**
     * Display the specified knowledge base article.
     */
    public function show(Request $request, KnowledgeBase $knowledgeBase): JsonResponse
    {
        $user = $request->user();

        // Enforce visibility check
        if ($knowledgeBase->visibility_level === 'private' && $knowledgeBase->created_by !== $user->id) {
            return response()->json(['message' => 'Access denied.'], 403);
        }

        return response()->json(['data' => $knowledgeBase->load(['project:id,title', 'creator:id,name,email,role']), 'success' => true]);
    }

    /**
     * Store a newly created knowledge base item in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'content' => 'nullable|string',
            'category' => 'nullable|string|max:100',
            'visibility_level' => 'required|in:private,project_team,department_team,organization',
            'project_id' => 'nullable|required_if:visibility_level,project_team|exists:projects,id',
            'file' => 'nullable|file|max:20480',
        ]);

        $filePath = null;
        $fileName = null;
        if ($request->hasFile('file')) {
            $file = $request->file('file');
            $fileName = $file->getClientOriginalName();
            $org = $request->attributes->get('currentOrganization');
            if ($org) {
                $filePath = StorageDiskResolver::store($org, $file, 'knowledge_base');
            } else {
                $filePath = $file->store('knowledge_base', 'public');
            }
        }

        $item = KnowledgeBase::create([
            'title' => $validated['title'],
            'content' => $validated['content'] ?? null,
            'category' => $validated['category'] ?? 'General',
            'visibility_level' => $validated['visibility_level'],
            'project_id' => $validated['project_id'] ?? null,
            'department' => $user->department ?: 'General',
            'organization' => $user->company_name ?: 'Techzaro',
            'file_path' => $filePath,
            'file_name' => $fileName,
            'created_by' => $user->id,
            'updated_by' => $user->id,
        ]);

        return response()->json(['data' => $item->load(['project:id,title', 'creator:id,name']), 'success' => true, 'message' => 'Knowledge base article created successfully.']);
    }

    /**
     * Update the specified knowledge base item in storage.
     */
    public function update(Request $request, KnowledgeBase $knowledgeBase): JsonResponse
    {
        $user = $request->user();

        // RBAC: Creator or Admin/Manager can edit
        if ($knowledgeBase->created_by !== $user->id && ! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized to edit this article.'], 403);
        }

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'content' => 'nullable|string',
            'category' => 'nullable|string|max:100',
            'visibility_level' => 'required|in:private,project_team,department_team,organization',
            'project_id' => 'nullable|required_if:visibility_level,project_team|exists:projects,id',
        ]);

        $filePath = $knowledgeBase->file_path;
        $fileName = $knowledgeBase->file_name;

        $org = $request->attributes->get('currentOrganization');

        if ($request->boolean('delete_file') && $filePath) {
            if ($org) {
                StorageDiskResolver::delete($org, $filePath);
            } else {
                Storage::disk('public')->delete($filePath);
            }
            $filePath = null;
            $fileName = null;
        }

        if ($request->hasFile('file')) {
            if ($knowledgeBase->file_path) {
                if ($org) {
                    StorageDiskResolver::delete($org, $knowledgeBase->file_path);
                } else {
                    Storage::disk('public')->delete($knowledgeBase->file_path);
                }
            }
            $file = $request->file('file');
            $fileName = $file->getClientOriginalName();
            if ($org) {
                $filePath = StorageDiskResolver::store($org, $file, 'knowledge_base');
            } else {
                $filePath = $file->store('knowledge_base', 'public');
            }
        }

        $knowledgeBase->update([
            'title' => $validated['title'],
            'content' => $validated['content'] ?? null,
            'category' => $validated['category'] ?? 'General',
            'visibility_level' => $validated['visibility_level'],
            'project_id' => $validated['project_id'] ?? null,
            'file_path' => $filePath,
            'file_name' => $fileName,
            'updated_by' => $user->id,
        ]);

        return response()->json(['data' => $knowledgeBase->fresh(['project:id,title', 'creator:id,name']), 'success' => true, 'message' => 'Knowledge base article updated successfully.']);
    }

    /**
     * Remove the specified knowledge base item from storage.
     */
    public function destroy(Request $request, KnowledgeBase $knowledgeBase): JsonResponse
    {
        $user = $request->user();

        // RBAC: Creator or Admin/Manager can delete
        if ($knowledgeBase->created_by !== $user->id && ! in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['message' => 'Unauthorized to delete this article.'], 403);
        }

        if ($knowledgeBase->file_path) {
            $org = $request->attributes->get('currentOrganization');
            if ($org) {
                StorageDiskResolver::delete($org, $knowledgeBase->file_path);
            } else {
                Storage::disk('public')->delete($knowledgeBase->file_path);
            }
        }

        $knowledgeBase->delete();

        return response()->json(['success' => true, 'message' => 'Knowledge base article deleted successfully.']);
    }
}
