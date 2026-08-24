<?php

namespace App\Http\Controllers;

use App\Models\KbCategory;
use App\Models\KbVersion;
use App\Models\KbVisibility;
use App\Models\KnowledgeBase;
use App\Models\Project;
use App\Models\Team;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class KnowledgeBaseController extends Controller
{
    /**
     * Display a listing of knowledge base articles visible to the authenticated user.
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $isAdmin = in_array($user->role, ['admin', 'manager']);

        // User's accessible projects
        $userProjectIds = Project::where(function ($q) use ($user) {
            $q->whereHas('team', fn ($tq) => $tq->whereHas('members', fn ($mq) => $mq->where('users.id', $user->id)))
                ->orWhereJsonContains('guest_ids', $user->id)
                ->orWhereHas('tasks', fn ($tq) => $tq->where('assigned_to', $user->id)->orWhere('assigned_by', $user->id));
        })->pluck('id')->toArray();

        // User's teams
        $userTeamIds = Team::whereHas('members', fn ($q) => $q->where('users.id', $user->id))
            ->orWhere('leader_id', $user->id)
            ->pluck('id')->toArray();

        $userDept = $user->department ?: 'General';
        $userOrg = $user->company_name ?: 'Techzaro';

        $query = KnowledgeBase::with([
            'categoryRelation:id,name,slug,color,icon',
            'project:id,title',
            'creator:id,name,email,role',
            'updater:id,name',
            'visibilities.team:id,name',
            'visibilities.user:id,name',
        ]);

        // Visibility authorization filter
        if (!$isAdmin) {
            $query->where(function ($q) use ($user, $userProjectIds, $userTeamIds, $userDept, $userOrg) {
                // Creator always has access
                $q->where('created_by', $user->id)
                // Organization-wide
                ->orWhere(function ($sq) use ($userOrg) {
                    $sq->where('visibility_level', 'organization')
                        ->where(function ($osq) use ($userOrg) {
                            $osq->where('organization', $userOrg)
                                ->orWhereNull('organization');
                        });
                })
                // Department
                ->orWhere(function ($sq) use ($userDept) {
                    $sq->where('visibility_level', 'department_team')
                        ->where('department', $userDept);
                })
                // Project Team
                ->orWhere(function ($sq) use ($userProjectIds) {
                    $sq->where('visibility_level', 'project_team')
                        ->whereIn('project_id', $userProjectIds);
                })
                // Team Level
                ->orWhere(function ($sq) use ($userTeamIds) {
                    $sq->where('visibility_level', 'team')
                        ->whereHas('visibilities', fn ($vq) => $vq->whereIn('team_id', $userTeamIds)->where('is_visible', true));
                })
                // Granular / Custom Visibility
                ->orWhere(function ($sq) use ($user, $userTeamIds, $userDept) {
                    $sq->where('visibility_level', 'custom')
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

            // Non-creators only see published articles
            $query->where(function ($q) use ($user) {
                $q->where('status', 'published')
                    ->orWhereNull('status')
                    ->orWhere('created_by', $user->id);
            });
        }

        // Search filter
        if ($request->filled('search')) {
            $search = $request->input('search');
            $query->where(function ($sq) use ($search) {
                $sq->where('title', 'like', '%'.$search.'%')
                    ->orWhere('content', 'like', '%'.$search.'%')
                    ->orWhere('category', 'like', '%'.$search.'%')
                    ->orWhereHas('categoryRelation', fn ($cq) => $cq->where('name', 'like', '%'.$search.'%'));
            });
        }

        // Category filter (support category_id or slug/name)
        if ($request->filled('category_id') && $request->input('category_id') !== 'all') {
            $catId = $request->input('category_id');
            if (is_numeric($catId)) {
                $query->where('category_id', (int) $catId);
            } else {
                $query->whereHas('categoryRelation', fn ($cq) => $cq->where('slug', $catId)->orWhere('name', $catId))
                    ->orWhere('category', $catId);
            }
        } elseif ($request->filled('category') && $request->input('category') !== 'all') {
            $cat = $request->input('category');
            $query->where(function ($sq) use ($cat) {
                $sq->where('category', $cat)
                    ->orWhereHas('categoryRelation', fn ($cq) => $cq->where('name', $cat)->orWhere('slug', $cat));
            });
        }

        // Visibility level filter
        if ($request->filled('visibility_level') && $request->input('visibility_level') !== 'all') {
            $query->where('visibility_level', $request->input('visibility_level'));
        }

        // Status filter
        if ($request->filled('status') && $request->input('status') !== 'all') {
            $query->where('status', $request->input('status'));
        }

        // Order by pinned first, then newest
        $query->orderByDesc('is_pinned')->orderByDesc('updated_at');

        if ($request->boolean('all')) {
            $items = $query->get();
            return response()->json([
                'success' => true,
                'data' => $items,
            ]);
        }

        $perPage = (int) $request->input('per_page', 15);
        $paginated = $query->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $paginated->items(),
            'current_page' => $paginated->currentPage(),
            'last_page' => $paginated->lastPage(),
            'per_page' => $paginated->perPage(),
            'total' => $paginated->total(),
        ]);
    }

    /**
     * Display the specified knowledge base article.
     */
    public function show(Request $request, KnowledgeBase $knowledgeBase): JsonResponse
    {
        $user = $request->user();
        $isAdmin = in_array($user->role, ['admin', 'manager']);

        // Check private access
        if ($knowledgeBase->visibility_level === 'private' && $knowledgeBase->created_by !== $user->id && !$isAdmin) {
            return response()->json(['success' => false, 'message' => 'Access denied.'], 403);
        }

        // Increment views count safely
        $knowledgeBase->increment('views_count');

        $knowledgeBase->load([
            'categoryRelation:id,name,slug,color,icon',
            'project:id,title',
            'creator:id,name,email,role',
            'updater:id,name',
            'visibilities.team:id,name',
            'visibilities.user:id,name',
            'versions' => fn ($q) => $q->with('creator:id,name')->orderByDesc('version_number'),
        ]);

        return response()->json([
            'success' => true,
            'data' => $knowledgeBase,
        ]);
    }

    /**
     * Store a newly created knowledge base item in storage.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'slug' => 'nullable|string|max:255',
            'content' => 'nullable|string',
            'category_id' => 'nullable|integer|exists:kb_categories,id',
            'category' => 'nullable|string|max:100',
            'visibility_level' => 'required|in:private,project_team,department_team,team,organization,custom',
            'project_id' => 'nullable|required_if:visibility_level,project_team|exists:projects,id',
            'department' => 'nullable|string|max:100',
            'status' => 'nullable|in:draft,published,archived',
            'is_pinned' => 'nullable|boolean',
            'tags' => 'nullable|array',
            'tags.*' => 'string|max:50',
            'file' => 'nullable|file|max:20480',
            'reference_link' => 'nullable|string|max:2048',
            'team_ids' => 'nullable|array',
            'team_ids.*' => 'integer|exists:teams,id',
            'user_ids' => 'nullable|array',
            'user_ids.*' => 'integer|exists:users,id',
        ]);

        $filePath = null;
        $fileName = null;
        if ($request->hasFile('file')) {
            $file = $request->file('file');
            $fileName = $file->getClientOriginalName();
            $filePath = $file->store('knowledge_base', 'public');
        }

        // Auto-match category name if category_id given
        $categoryName = $validated['category'] ?? 'General';
        if (!empty($validated['category_id'])) {
            $catObj = KbCategory::find($validated['category_id']);
            if ($catObj) {
                $categoryName = $catObj->name;
            }
        } elseif (!empty($validated['category'])) {
            $catObj = KbCategory::firstOrCreate(
                ['name' => $validated['category']],
                [
                    'slug' => Str::slug($validated['category']),
                    'color' => '#3b82f6',
                    'icon' => 'BookOpen',
                    'created_by' => $user->id,
                ]
            );
            $validated['category_id'] = $catObj->id;
        }

        $slug = !empty($validated['slug']) ? Str::slug($validated['slug']) : Str::slug($validated['title']);
        $baseSlug = $slug;
        $c = 1;
        while (KnowledgeBase::where('slug', $slug)->exists()) {
            $slug = "{$baseSlug}-{$c}";
            $c++;
        }

        $item = KnowledgeBase::create([
            'title' => $validated['title'],
            'slug' => $slug,
            'content' => $validated['content'] ?? null,
            'category' => $categoryName ?? 'General',
            'category_id' => $validated['category_id'] ?? null,
            'visibility_level' => $validated['visibility_level'],
            'project_id' => $validated['project_id'] ?? null,
            'department' => $validated['department'] ?? ($user->department ?: 'General'),
            'organization' => $user->company_name ?: 'Techzaro',
            'status' => $validated['status'] ?? 'published',
            'is_pinned' => $validated['is_pinned'] ?? false,
            'tags' => $validated['tags'] ?? [],
            'file_path' => $filePath,
            'file_name' => $fileName,
            'reference_link' => $validated['reference_link'] ?? null,
            'created_by' => $user->id,
            'updated_by' => $user->id,
        ]);

        // Save visibilities
        $this->syncVisibilities($item, $validated);

        // Save initial version
        KbVersion::create([
            'knowledge_base_id' => $item->id,
            'version_number' => 1,
            'title' => $item->title,
            'content' => $item->content,
            'file_path' => $item->file_path,
            'file_name' => $item->file_name,
            'change_summary' => 'Initial publication',
            'created_by' => $user->id,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Knowledge base article created successfully.',
            'data' => $item->load(['categoryRelation', 'project:id,title', 'creator:id,name', 'visibilities.team:id,name']),
        ], 201);
    }

    /**
     * Update the specified knowledge base item in storage.
     */
    public function update(Request $request, KnowledgeBase $knowledgeBase): JsonResponse
    {
        $user = $request->user();

        // RBAC: Creator or Admin/Manager can edit
        if ($knowledgeBase->created_by !== $user->id && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized to edit this article.'], 403);
        }

        // Decode tags if passed as JSON string
        if (is_string($request->input('tags'))) {
            $decoded = json_decode($request->input('tags'), true);
            if (is_array($decoded)) {
                $request->merge(['tags' => $decoded]);
            }
        }
        if (is_string($request->input('team_ids'))) {
            $decoded = json_decode($request->input('team_ids'), true);
            if (is_array($decoded)) {
                $request->merge(['team_ids' => $decoded]);
            }
        }
        if (is_string($request->input('user_ids'))) {
            $decoded = json_decode($request->input('user_ids'), true);
            if (is_array($decoded)) {
                $request->merge(['user_ids' => $decoded]);
            }
        }

        $validated = $request->validate([
            'title' => 'sometimes|required|string|max:255',
            'slug' => 'nullable|string|max:255',
            'content' => 'nullable|string',
            'category_id' => 'nullable|integer|exists:kb_categories,id',
            'category' => 'nullable|string|max:100',
            'visibility_level' => 'sometimes|required|in:private,project_team,department_team,team,organization,custom',
            'project_id' => 'nullable|exists:projects,id',
            'department' => 'nullable|string|max:100',
            'status' => 'nullable|in:draft,published,archived',
            'is_pinned' => 'nullable|boolean',
            'tags' => 'nullable|array',
            'tags.*' => 'string|max:50',
            'team_ids' => 'nullable|array',
            'team_ids.*' => 'integer|exists:teams,id',
            'user_ids' => 'nullable|array',
            'user_ids.*' => 'integer|exists:users,id',
            'reference_link' => 'nullable|string|max:2048',
            'change_summary' => 'nullable|string|max:255',
        ]);

        $filePath = $knowledgeBase->file_path;
        $fileName = $knowledgeBase->file_name;

        if ($request->boolean('delete_file') && $filePath) {
            Storage::disk('public')->delete($filePath);
            $filePath = null;
            $fileName = null;
        }

        if ($request->hasFile('file')) {
            if ($knowledgeBase->file_path) {
                Storage::disk('public')->delete($knowledgeBase->file_path);
            }
            $file = $request->file('file');
            $fileName = $file->getClientOriginalName();
            $filePath = $file->store('knowledge_base', 'public');
        }

        // Match category name
        $categoryName = $knowledgeBase->category;
        if (isset($validated['category_id'])) {
            $catObj = KbCategory::find($validated['category_id']);
            if ($catObj) {
                $categoryName = $catObj->name;
            }
        } elseif (!empty($validated['category'])) {
            $categoryName = $validated['category'];
        }

        $newTitle = $validated['title'] ?? $knowledgeBase->title;
        $newContent = array_key_exists('content', $validated) ? $validated['content'] : $knowledgeBase->content;

        // Check if content or title changed to save a new version
        $hasContentChanged = ($newTitle !== $knowledgeBase->title) || ($newContent !== $knowledgeBase->content);
        if ($hasContentChanged) {
            $latestVersionNumber = (int) $knowledgeBase->versions()->max('version_number') ?: 1;
            KbVersion::create([
                'knowledge_base_id' => $knowledgeBase->id,
                'version_number' => $latestVersionNumber + 1,
                'title' => $newTitle,
                'content' => $newContent,
                'file_path' => $filePath,
                'file_name' => $fileName,
            'reference_link' => $validated['reference_link'] ?? null,
                'change_summary' => $validated['change_summary'] ?? 'Updated article content',
                'created_by' => $user->id,
            ]);
        }

        $updateData = [
            'title' => $newTitle,
            'content' => $newContent,
            'category' => $categoryName ?? 'General',
            'category_id' => $validated['category_id'] ?? $knowledgeBase->category_id,
            'visibility_level' => $validated['visibility_level'] ?? $knowledgeBase->visibility_level ?? 'organization',
            'project_id' => array_key_exists('project_id', $validated) ? $validated['project_id'] : $knowledgeBase->project_id,
            'department' => $validated['department'] ?? $knowledgeBase->department,
            'status' => $validated['status'] ?? $knowledgeBase->status ?? 'published',
            'is_pinned' => array_key_exists('is_pinned', $validated) ? (bool) $validated['is_pinned'] : (bool) ($knowledgeBase->is_pinned ?? false),
            'tags' => array_key_exists('tags', $validated) ? $validated['tags'] : $knowledgeBase->tags,
            'file_path' => $filePath,
            'file_name' => $fileName,
            'reference_link' => $validated['reference_link'] ?? null,
            'updated_by' => $user->id,
        ];

        $knowledgeBase->update($updateData);

        // Sync visibilities if provided
        if (array_key_exists('team_ids', $validated) || array_key_exists('user_ids', $validated) || array_key_exists('visibility_level', $validated)) {
            $this->syncVisibilities($knowledgeBase, $validated);
        }

        return response()->json([
            'success' => true,
            'message' => 'Knowledge base article updated successfully.',
            'data' => $knowledgeBase->fresh([
                'categoryRelation',
                'project:id,title',
                'creator:id,name',
                'updater:id,name',
                'visibilities.team:id,name',
                'visibilities.user:id,name',
                'versions' => fn ($q) => $q->with('creator:id,name')->orderByDesc('version_number'),
            ]),
        ]);
    }

    /**
     * Retrieve all versions of an article.
     */
    public function getVersions(KnowledgeBase $knowledgeBase): JsonResponse
    {
        $versions = $knowledgeBase->versions()
            ->with('creator:id,name,email,role')
            ->orderByDesc('version_number')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $versions,
        ]);
    }

    /**
     * Restore a previous version of an article.
     */
    public function restoreVersion(Request $request, KnowledgeBase $knowledgeBase, $versionId): JsonResponse
    {
        $user = $request->user();
        if ($knowledgeBase->created_by !== $user->id && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized'], 403);
        }

        $version = $knowledgeBase->versions()->findOrFail($versionId);

        $knowledgeBase->update([
            'title' => $version->title,
            'content' => $version->content,
            'file_path' => $version->file_path,
            'file_name' => $version->file_name,
            'updated_by' => $user->id,
        ]);

        $latestVersionNumber = (int) $knowledgeBase->versions()->max('version_number') ?: 1;
        KbVersion::create([
            'knowledge_base_id' => $knowledgeBase->id,
            'version_number' => $latestVersionNumber + 1,
            'title' => $version->title,
            'content' => $version->content,
            'file_path' => $version->file_path,
            'file_name' => $version->file_name,
            'change_summary' => "Restored from version {$version->version_number}",
            'created_by' => $user->id,
        ]);

        return response()->json([
            'success' => true,
            'message' => "Successfully restored version {$version->version_number}.",
            'data' => $knowledgeBase->fresh(['categoryRelation', 'creator:id,name', 'versions']),
        ]);
    }

    /**
     * Remove the specified knowledge base item from storage.
     */
    public function destroy(Request $request, KnowledgeBase $knowledgeBase): JsonResponse
    {
        $user = $request->user();

        // RBAC: Creator or Admin/Manager can delete
        if ($knowledgeBase->created_by !== $user->id && !in_array($user->role, ['admin', 'manager'])) {
            return response()->json(['success' => false, 'message' => 'Unauthorized to delete this article.'], 403);
        }

        if ($knowledgeBase->file_path) {
            Storage::disk('public')->delete($knowledgeBase->file_path);
        }

        $knowledgeBase->visibilities()->delete();
        $knowledgeBase->versions()->delete();
        $knowledgeBase->delete();

        return response()->json([
            'success' => true,
            'message' => 'Knowledge base article deleted successfully.',
        ]);
    }

    /**
     * Helper to sync granular visibilities for an article.
     */
    private function syncVisibilities(KnowledgeBase $item, array $validated): void
    {
        $item->visibilities()->delete();

        if ($item->visibility_level === 'team' && !empty($validated['team_ids'])) {
            foreach ($validated['team_ids'] as $teamId) {
                KbVisibility::create([
                    'knowledge_base_id' => $item->id,
                    'team_id' => $teamId,
                    'is_visible' => true,
                ]);
            }
        }

        if ($item->visibility_level === 'custom') {
            if (!empty($validated['team_ids'])) {
                foreach ($validated['team_ids'] as $teamId) {
                    KbVisibility::create([
                        'knowledge_base_id' => $item->id,
                        'team_id' => $teamId,
                        'is_visible' => true,
                    ]);
                }
            }
            if (!empty($validated['user_ids'])) {
                foreach ($validated['user_ids'] as $userId) {
                    KbVisibility::create([
                        'knowledge_base_id' => $item->id,
                        'user_id' => $userId,
                        'is_visible' => true,
                    ]);
                }
            }
        }
    }
}
