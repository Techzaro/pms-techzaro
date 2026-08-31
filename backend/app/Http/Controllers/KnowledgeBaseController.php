<?php

namespace App\Http\Controllers;

use App\Models\KbCategory;
use App\Models\KbFavorite;
use App\Models\KbVersion;
use App\Models\KbVisibility;
use App\Models\KnowledgeBase;
use App\Models\Project;
use App\Models\Team;
use App\Models\User;
use App\Services\ActivityService;
use App\Services\StorageDiskResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class KnowledgeBaseController extends Controller
{
    public function __construct(
        private ActivityService $activityService
    ) {}
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
        ])->withExists([
            'favorites as is_favorited' => fn ($fq) => $fq->where('user_id', $user->id),
        ]);

        // Base visibility authorization filter - Enforce security strictly
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

            // Non-creators only see published articles (unless requesting archived articles they created)
            if ($request->input('status') !== 'archived') {
                $query->where(function ($q) use ($user) {
                    $q->where('status', 'published')
                        ->orWhereNull('status')
                        ->orWhere('created_by', $user->id);
                });
            } else {
                $query->where('created_by', $user->id);
            }
        }

        // Comprehensive multi-field text search (title, description, content, category, tags, author, date, status, access_level)
        $query->when($request->filled('search') || $request->filled('q'), function ($sq) use ($request) {
            $term = (string) ($request->input('search') ?: $request->input('q'));
            $sq->where(function ($inner) use ($term) {
                $inner->where('title', 'like', '%'.$term.'%')
                    ->orWhere('content', 'like', '%'.$term.'%')
                    ->orWhere('category', 'like', '%'.$term.'%')
                    ->orWhere('visibility_level', 'like', '%'.$term.'%')
                    ->orWhere('status', 'like', '%'.$term.'%')
                    ->orWhere('department', 'like', '%'.$term.'%')
                    ->orWhere('reference_link', 'like', '%'.$term.'%')
                    ->orWhereHas('categoryRelation', fn ($cq) => $cq->where('name', 'like', '%'.$term.'%'))
                    ->orWhereHas('creator', fn ($uq) => $uq->where('name', 'like', '%'.$term.'%')->orWhere('email', 'like', '%'.$term.'%'))
                    ->orWhere('tags', 'like', '%'.$term.'%');

                if (strtotime($term)) {
                    $dateStr = date('Y-m-d', strtotime($term));
                    $inner->orWhereDate('created_at', $dateStr)
                          ->orWhereDate('updated_at', $dateStr);
                }
            });
        });

        // Field-specific search queries
        $query->when($request->filled('title'), fn ($q, $v) => $q->where('title', 'like', '%'.$v.'%'))
            ->when($request->filled('description'), fn ($q, $v) => $q->where('content', 'like', '%'.$v.'%'))
            ->when($request->filled('content'), fn ($q, $v) => $q->where('content', 'like', '%'.$v.'%'))
            ->when($request->filled('tags') || $request->filled('tag'), function ($q) use ($request) {
                $tag = $request->input('tags') ?: $request->input('tag');
                $q->where(function ($tq) use ($tag) {
                    $tq->where('tags', 'like', '%'.$tag.'%')
                       ->orWhereJsonContains('tags', $tag);
                });
            });

        // Exact Filter: Category
        $query->when($request->filled('category_id') && $request->input('category_id') !== 'all', function ($q) use ($request) {
            $catId = $request->input('category_id');
            if (is_numeric($catId)) {
                $q->where('category_id', (int) $catId);
            } else {
                $q->whereHas('categoryRelation', fn ($cq) => $cq->where('slug', $catId)->orWhere('name', $catId))
                    ->orWhere('category', $catId);
            }
        })->when($request->filled('category') && $request->input('category') !== 'all', function ($q) use ($request) {
            $cat = $request->input('category');
            $q->where(function ($sq) use ($cat) {
                $sq->where('category', $cat)
                    ->orWhereHas('categoryRelation', fn ($cq) => $cq->where('name', $cat)->orWhere('slug', $cat));
            });
        });

        // Exact Filter: Team
        $query->when($request->filled('team_id') && $request->input('team_id') !== 'all', function ($q) use ($request) {
            $tid = (int) $request->input('team_id');
            $q->where(function ($sq) use ($tid) {
                $sq->whereHas('visibilities', fn ($vq) => $vq->where('team_id', $tid)->where('is_visible', true))
                   ->orWhereHas('project', fn ($pq) => $pq->where('team_id', $tid));
            });
        })->when($request->filled('team') && $request->input('team') !== 'all', function ($q) use ($request) {
            $team = $request->input('team');
            if (is_numeric($team)) {
                $q->where(function ($sq) use ($team) {
                    $sq->whereHas('visibilities', fn ($vq) => $vq->where('team_id', (int) $team)->where('is_visible', true))
                       ->orWhereHas('project', fn ($pq) => $pq->where('team_id', (int) $team));
                });
            } else {
                $q->where(function ($sq) use ($team) {
                    $sq->whereHas('visibilities.team', fn ($tq) => $tq->where('name', 'like', '%'.$team.'%'))
                       ->orWhereHas('project.team', fn ($tq) => $tq->where('name', 'like', '%'.$team.'%'));
                });
            }
        });

        // Exact Filter: Sub-team / Department
        $query->when($request->filled('department') && $request->input('department') !== 'all', function ($q) use ($request) {
            $dept = $request->input('department');
            $q->where(function ($sq) use ($dept) {
                $sq->where('department', $dept)
                   ->orWhereHas('visibilities', fn ($vq) => $vq->where('department', $dept)->where('is_visible', true));
            });
        })->when($request->filled('sub_team') && $request->input('sub_team') !== 'all', function ($q) use ($request) {
            $subTeam = $request->input('sub_team');
            $q->where(function ($sq) use ($subTeam) {
                $sq->where('department', $subTeam)
                   ->orWhereHas('visibilities', fn ($vq) => $vq->where('department', $subTeam)->where('is_visible', true));
            });
        });

        // Exact Filter: Project
        $query->when($request->filled('project_id') && $request->input('project_id') !== 'all', function ($q) use ($request) {
            $q->where('project_id', (int) $request->input('project_id'));
        })->when($request->filled('project') && $request->input('project') !== 'all', function ($q) use ($request) {
            $proj = $request->input('project');
            if (is_numeric($proj)) {
                $q->where('project_id', (int) $proj);
            } else {
                $q->whereHas('project', fn ($pq) => $pq->where('title', 'like', '%'.$proj.'%'));
            }
        });

        // Exact Filter: Author / Created By
        $query->when($request->filled('author_id') && $request->input('author_id') !== 'all', function ($q) use ($request) {
            $q->where('created_by', (int) $request->input('author_id'));
        })->when($request->filled('created_by') && $request->input('created_by') !== 'all', function ($q) use ($request) {
            $q->where('created_by', (int) $request->input('created_by'));
        })->when($request->filled('author') && $request->input('author') !== 'all', function ($q) use ($request) {
            $author = $request->input('author');
            if (is_numeric($author)) {
                $q->where('created_by', (int) $author);
            } else {
                $q->whereHas('creator', fn ($uq) => $uq->where('name', 'like', '%'.$author.'%')->orWhere('email', 'like', '%'.$author.'%'));
            }
        });

        // Exact Filter: Visibility / Access Level
        $query->when($request->filled('visibility_level') && $request->input('visibility_level') !== 'all', function ($q) use ($request) {
            $q->where('visibility_level', $request->input('visibility_level'));
        })->when($request->filled('visibility') && $request->input('visibility') !== 'all', function ($q) use ($request) {
            $q->where('visibility_level', $request->input('visibility'));
        })->when($request->filled('access_level') && $request->input('access_level') !== 'all', function ($q) use ($request) {
            $q->where('visibility_level', $request->input('access_level'));
        });

        // Exact Filter: Date / Date Range
        $query->when($request->filled('date'), function ($q) use ($request) {
            $formattedDate = ActivityService::parseQueryDate($request->input('date'));
            if ($formattedDate) {
                $q->whereDate('created_at', $formattedDate);
            }
        })->when($request->filled('date_from'), function ($q) use ($request) {
            $formattedFrom = ActivityService::parseQueryDate($request->input('date_from'));
            if ($formattedFrom) {
                $q->whereDate('created_at', '>=', $formattedFrom);
            }
        })->when($request->filled('date_to'), function ($q) use ($request) {
            $formattedTo = ActivityService::parseQueryDate($request->input('date_to'));
            if ($formattedTo) {
                $q->whereDate('created_at', '<=', $formattedTo);
            }
        });

        // Exact Filter: Status (published, draft, archived)
        $query->when($request->filled('status') && $request->input('status') !== 'all', function ($q) use ($request) {
            $q->where('status', $request->input('status'));
        });

        // Exact Filter: Favorites Only
        $query->when($request->boolean('favorites_only') || $request->boolean('is_favorited') || $request->input('favorites') === '1', function ($q) use ($user) {
            $q->whereHas('favorites', fn ($fq) => $fq->where('user_id', $user->id));
        });

        // Order by pinned first, then newest
        $query->orderByDesc('is_pinned')->orderByDesc('updated_at');

        $formatArticle = function ($item) use ($user) {
            $item->is_favorited = (bool) ($item->is_favorited ?? false);
            $item->user_permissions = [
                'can_view' => true,
                'can_edit' => $user->can('update', $item),
                'can_delete' => $user->can('delete', $item),
                'can_duplicate' => $user->can('duplicate', $item),
                'can_archive' => $user->can('archive', $item),
                'can_restore' => $user->can('restore', $item),
                'can_download' => $user->can('download_attachments', $item),
                'can_share' => $user->can('share_internally', $item),
                'can_favorite' => $user->can('add_to_favorites', $item),
            ];
            return $item;
        };

        if ($request->boolean('all')) {
            $items = $query->get()->map($formatArticle);
            return response()->json([
                'success' => true,
                'data' => $items,
            ]);
        }

        $perPage = (int) $request->input('per_page', 15);
        $paginated = $query->paginate($perPage);
        $paginated->getCollection()->transform($formatArticle);

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

        // Check view authorization using policy or private check
        if (!$user->can('view', $knowledgeBase)) {
            if ($knowledgeBase->visibility_level === 'private' && $knowledgeBase->created_by !== $user->id && !$isAdmin) {
                return response()->json(['success' => false, 'message' => 'Access denied.'], 403);
            }
            if (!$isAdmin && $knowledgeBase->created_by !== $user->id) {
                return response()->json(['success' => false, 'message' => 'Access denied.'], 403);
            }
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

        $knowledgeBase->is_favorited = KbFavorite::where('knowledge_base_id', $knowledgeBase->id)
            ->where('user_id', $user->id)
            ->exists();

        $knowledgeBase->user_permissions = [
            'can_view' => true,
            'can_edit' => $user->can('update', $knowledgeBase),
            'can_delete' => $user->can('delete', $knowledgeBase),
            'can_duplicate' => $user->can('duplicate', $knowledgeBase),
            'can_archive' => $user->can('archive', $knowledgeBase),
            'can_restore' => $user->can('restore', $knowledgeBase),
            'can_download' => $user->can('download_attachments', $knowledgeBase),
            'can_share' => $user->can('share_internally', $knowledgeBase),
            'can_favorite' => $user->can('add_to_favorites', $knowledgeBase),
        ];

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
            $org = $request->attributes->get('currentOrganization');
            if ($org) {
                $filePath = StorageDiskResolver::store($org, $file, 'knowledge_base');
            } else {
                $filePath = $file->store('knowledge_base', 'public');
            }
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

        // Log Activity
        $this->activityService->log(
            $user->id,
            'kb_created',
            "You created knowledge base article \"{$item->title}\"",
            'knowledge_base',
            $item->id,
            'created',
            $item->title,
            null,
            ['category' => $item->category, 'visibility' => $item->visibility_level]
        );

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

        // Log Activity
        $this->activityService->log(
            $user->id,
            'kb_updated',
            "You updated knowledge base article \"{$knowledgeBase->title}\"",
            'knowledge_base',
            $knowledgeBase->id,
            'updated',
            $knowledgeBase->title,
            null,
            ['change_summary' => $validated['change_summary'] ?? null]
        );

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

        // Log Activity
        $this->activityService->log(
            $user->id,
            'kb_version_restored',
            "You restored version {$version->version_number} of article \"{$knowledgeBase->title}\"",
            'knowledge_base',
            $knowledgeBase->id,
            'restored',
            $knowledgeBase->title,
            null,
            ['version_number' => $version->version_number]
        );

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
            $org = $request->attributes->get('currentOrganization');
            if ($org) {
                StorageDiskResolver::delete($org, $knowledgeBase->file_path);
            } else {
                Storage::disk('public')->delete($knowledgeBase->file_path);
            }
        }

        $title = $knowledgeBase->title;
        $id = $knowledgeBase->id;

        $knowledgeBase->visibilities()->delete();
        $knowledgeBase->versions()->delete();
        $knowledgeBase->delete();

        // Log Activity
        $this->activityService->log(
            $user->id,
            'kb_deleted',
            "You deleted knowledge base article \"{$title}\"",
            'knowledge_base',
            $id,
            'deleted',
            $title
        );

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

    /**
     * Duplicate a knowledge base article.
     */
    public function duplicate(Request $request, KnowledgeBase $knowledgeBase): JsonResponse
    {
        $this->authorize('duplicate', $knowledgeBase);
        $user = $request->user();

        $title = "{$knowledgeBase->title} (Copy)";
        $baseSlug = Str::slug($title);
        $slug = $baseSlug;
        $c = 1;
        while (KnowledgeBase::where('slug', $slug)->exists()) {
            $slug = "{$baseSlug}-{$c}";
            $c++;
        }

        // Duplicate file if present
        $newFilePath = null;
        $newFileName = $knowledgeBase->file_name;
        if ($knowledgeBase->file_path) {
            $ext = pathinfo($knowledgeBase->file_path, PATHINFO_EXTENSION);
            $newFilePath = 'knowledge_base/' . Str::random(40) . ($ext ? '.' . $ext : '');
            $org = $request->attributes->get('currentOrganization');
            if ($org) {
                try {
                    $content = StorageDiskResolver::get($org, $knowledgeBase->file_path);
                    if ($content !== null) {
                        StorageDiskResolver::put($org, $newFilePath, $content);
                    }
                } catch (\Throwable $e) {
                    $newFilePath = null;
                }
            } else {
                if (Storage::disk('public')->exists($knowledgeBase->file_path)) {
                    Storage::disk('public')->copy($knowledgeBase->file_path, $newFilePath);
                } else {
                    $newFilePath = null;
                }
            }
        }

        $duplicate = KnowledgeBase::create([
            'title' => $title,
            'slug' => $slug,
            'content' => $knowledgeBase->content,
            'category' => $knowledgeBase->category,
            'category_id' => $knowledgeBase->category_id,
            'visibility_level' => $knowledgeBase->visibility_level,
            'project_id' => $knowledgeBase->project_id,
            'department' => $knowledgeBase->department,
            'organization' => $knowledgeBase->organization,
            'status' => 'draft',
            'is_pinned' => false,
            'tags' => $knowledgeBase->tags,
            'file_path' => $newFilePath,
            'file_name' => $newFileName,
            'reference_link' => $knowledgeBase->reference_link,
            'created_by' => $user->id,
            'updated_by' => $user->id,
        ]);

        // Duplicate visibilities
        foreach ($knowledgeBase->visibilities as $vis) {
            KbVisibility::create([
                'knowledge_base_id' => $duplicate->id,
                'user_id' => $vis->user_id,
                'team_id' => $vis->team_id,
                'department' => $vis->department,
                'role' => $vis->role,
                'is_visible' => $vis->is_visible,
            ]);
        }

        // Create initial version
        KbVersion::create([
            'knowledge_base_id' => $duplicate->id,
            'version_number' => 1,
            'title' => $duplicate->title,
            'content' => $duplicate->content,
            'file_path' => $duplicate->file_path,
            'file_name' => $duplicate->file_name,
            'reference_link' => $duplicate->reference_link,
            'change_summary' => "Duplicated from #{$knowledgeBase->id} ({$knowledgeBase->title})",
            'created_by' => $user->id,
        ]);

        // Log Activity
        $this->activityService->log(
            $user->id,
            'kb_duplicated',
            "You duplicated knowledge base article \"{$knowledgeBase->title}\" as \"{$duplicate->title}\"",
            'knowledge_base',
            $duplicate->id,
            'duplicated',
            $duplicate->title,
            null,
            ['source_id' => $knowledgeBase->id]
        );

        return response()->json([
            'success' => true,
            'message' => 'Article duplicated successfully as draft.',
            'data' => $duplicate->load(['categoryRelation', 'project:id,title', 'creator:id,name', 'visibilities.team:id,name']),
        ], 201);
    }

    /**
     * Archive a knowledge base article.
     */
    public function archive(Request $request, KnowledgeBase $knowledgeBase): JsonResponse
    {
        $this->authorize('archive', $knowledgeBase);
        $user = $request->user();

        $knowledgeBase->update([
            'status' => 'archived',
            'updated_by' => $user->id,
        ]);

        // Log Activity
        $this->activityService->log(
            $user->id,
            'kb_archived',
            "You archived knowledge base article \"{$knowledgeBase->title}\"",
            'knowledge_base',
            $knowledgeBase->id,
            'archived',
            $knowledgeBase->title
        );

        return response()->json([
            'success' => true,
            'message' => 'Knowledge base article archived successfully.',
            'data' => $knowledgeBase->fresh(['categoryRelation', 'creator:id,name']),
        ]);
    }

    /**
     * Restore an archived knowledge base article.
     */
    public function restore(Request $request, KnowledgeBase $knowledgeBase): JsonResponse
    {
        $this->authorize('restore', $knowledgeBase);
        $user = $request->user();

        $knowledgeBase->update([
            'status' => 'published',
            'updated_by' => $user->id,
        ]);

        // Log Activity
        $this->activityService->log(
            $user->id,
            'kb_restored',
            "You restored knowledge base article \"{$knowledgeBase->title}\"",
            'knowledge_base',
            $knowledgeBase->id,
            'restored',
            $knowledgeBase->title
        );

        return response()->json([
            'success' => true,
            'message' => 'Knowledge base article restored successfully.',
            'data' => $knowledgeBase->fresh(['categoryRelation', 'creator:id,name']),
        ]);
    }

    /**
     * Toggle favorite status for a knowledge base article.
     */
    public function toggleFavorite(Request $request, KnowledgeBase $knowledgeBase): JsonResponse
    {
        $this->authorize('add_to_favorites', $knowledgeBase);
        $user = $request->user();

        $fav = KbFavorite::where('knowledge_base_id', $knowledgeBase->id)
            ->where('user_id', $user->id)
            ->first();

        if ($fav) {
            $fav->delete();
            $isFavorited = false;
            $msg = 'Article removed from favorites.';
        } else {
            KbFavorite::create([
                'knowledge_base_id' => $knowledgeBase->id,
                'user_id' => $user->id,
            ]);
            $isFavorited = true;
            $msg = 'Article added to favorites.';
        }

        // Log Activity
        $this->activityService->log(
            $user->id,
            $isFavorited ? 'kb_favorited' : 'kb_unfavorited',
            ($isFavorited ? 'You added' : 'You removed') . " article \"{$knowledgeBase->title}\" " . ($isFavorited ? 'to' : 'from') . " favorites",
            'knowledge_base',
            $knowledgeBase->id,
            $isFavorited ? 'favorite' : 'unfavorite',
            $knowledgeBase->title
        );

        return response()->json([
            'success' => true,
            'is_favorited' => $isFavorited,
            'message' => $msg,
        ]);
    }

    /**
     * Share a knowledge base article internally with users or teams.
     */
    public function shareInternally(Request $request, KnowledgeBase $knowledgeBase): JsonResponse
    {
        $this->authorize('share_internally', $knowledgeBase);
        $user = $request->user();

        $validated = $request->validate([
            'user_ids' => 'nullable|array',
            'user_ids.*' => 'integer|exists:users,id',
            'team_ids' => 'nullable|array',
            'team_ids.*' => 'integer|exists:teams,id',
            'message' => 'nullable|string|max:500',
        ]);

        $sharedUserIds = $validated['user_ids'] ?? [];
        $sharedTeamIds = $validated['team_ids'] ?? [];

        // If article is not organization-wide, ensure shared users/teams have visibility
        if (in_array($knowledgeBase->visibility_level, ['custom', 'team', 'private'])) {
            if ($knowledgeBase->visibility_level === 'private' && (!empty($sharedUserIds) || !empty($sharedTeamIds))) {
                $knowledgeBase->update(['visibility_level' => 'custom']);
            }
            foreach ($sharedUserIds as $uId) {
                KbVisibility::firstOrCreate([
                    'knowledge_base_id' => $knowledgeBase->id,
                    'user_id' => $uId,
                ], [
                    'is_visible' => true,
                ]);
            }
            foreach ($sharedTeamIds as $tId) {
                KbVisibility::firstOrCreate([
                    'knowledge_base_id' => $knowledgeBase->id,
                    'team_id' => $tId,
                ], [
                    'is_visible' => true,
                ]);
            }
        }

        // Log Activity
        $this->activityService->log(
            $user->id,
            'kb_shared',
            "You shared knowledge base article \"{$knowledgeBase->title}\" internally",
            'knowledge_base',
            $knowledgeBase->id,
            'shared',
            $knowledgeBase->title,
            null,
            ['user_ids' => $sharedUserIds, 'team_ids' => $sharedTeamIds, 'note' => $validated['message'] ?? null]
        );

        return response()->json([
            'success' => true,
            'message' => 'Article shared internally successfully.',
        ]);
    }

    /**
     * Download attachment file for a knowledge base article.
     */
    public function downloadAttachment(Request $request, KnowledgeBase $knowledgeBase)
    {
        // Support token query parameter fallback if accessed directly
        if (!$request->user() && $request->query('token')) {
            $accessToken = \Laravel\Sanctum\PersonalAccessToken::findToken($request->query('token'));
            if ($accessToken && $accessToken->tokenable) {
                \Illuminate\Support\Facades\Auth::login($accessToken->tokenable);
                $request->setUserResolver(fn () => $accessToken->tokenable);
            }
        }

        $this->authorize('download_attachments', $knowledgeBase);
        $user = $request->user();

        $filePath = $knowledgeBase->file_path;
        if (!$filePath) {
            return response()->json(['success' => false, 'message' => 'No attachment found for this article.'], 404);
        }

        $fileName = $knowledgeBase->file_name ?: basename($filePath);
        $org = $request->attributes->get('currentOrganization');

        // Log Activity
        $this->activityService->log(
            $user->id,
            'kb_downloaded',
            "You downloaded attachment for article \"{$knowledgeBase->title}\"",
            'knowledge_base',
            $knowledgeBase->id,
            'download',
            $knowledgeBase->title,
            null,
            ['file_name' => $fileName]
        );

        if ($org) {
            return StorageDiskResolver::download($org, $filePath, $fileName);
        }

        $cleanPath = ltrim($filePath, '/');
        if (str_starts_with($cleanPath, 'storage/')) {
            $cleanPath = substr($cleanPath, 8);
        }

        if (Storage::disk('public')->exists($cleanPath)) {
            return Storage::disk('public')->download($cleanPath, $fileName);
        }

        if (Storage::disk('public')->exists($filePath)) {
            return Storage::disk('public')->download($filePath, $fileName);
        }

        return response()->json(['success' => false, 'message' => 'Attachment file not found.'], 404);
    }

    /**
     * Get unified activity feed for a single Knowledge Base article.
     */
    public function activities(Request $request, KnowledgeBase $knowledgeBase): JsonResponse
    {
        $dateFilter = $request->query('date');
        $userFilter = $request->query('user_id');
        $typeFilter = $request->query('type') ?: $request->query('action');

        $query = \App\Models\Activity::with('user:id,name,email,avatar,role')
            ->where('related_id', $knowledgeBase->id)
            ->where(function ($q) {
                $q->whereIn('related_module', ['knowledge_base', 'kb', 'knowledge-base'])
                  ->orWhereIn('activity_type', [
                      'knowledge_base', 'kb', 'kb_created', 'kb_updated', 'kb_deleted',
                      'kb_duplicated', 'kb_archived', 'kb_restored', 'kb_favorited',
                      'kb_unfavorited', 'kb_shared', 'kb_downloaded', 'kb_version_restored'
                  ]);
            });

        if ($dateFilter) {
            $formattedDate = ActivityService::parseQueryDate($dateFilter);
            if ($formattedDate) {
                $query->whereDate('created_at', $formattedDate);
            }
        }
        if ($userFilter) {
            $query->where('user_id', $userFilter);
        }
        if ($typeFilter && $typeFilter !== 'all') {
            $query->where(function ($q) use ($typeFilter) {
                $q->where('activity_type', $typeFilter)
                  ->orWhere('action', $typeFilter);

                if (in_array($typeFilter, ['kb_created', 'created', 'published'])) {
                    $q->orWhereIn('activity_type', ['kb_created', 'created'])
                      ->orWhereIn('action', ['created', 'published', 'create']);
                } elseif (in_array($typeFilter, ['kb_updated', 'updated', 'edited'])) {
                    $q->orWhereIn('activity_type', ['kb_updated', 'updated'])
                      ->orWhereIn('action', ['updated', 'edited', 'update']);
                } elseif (in_array($typeFilter, ['kb_archived', 'archived'])) {
                    $q->orWhereIn('activity_type', ['kb_archived', 'archived'])
                      ->orWhereIn('action', ['archived', 'archive']);
                } elseif (in_array($typeFilter, ['kb_restored', 'restored'])) {
                    $q->orWhereIn('activity_type', ['kb_restored', 'restored', 'kb_version_restored'])
                      ->orWhereIn('action', ['restored', 'restore']);
                } elseif (in_array($typeFilter, ['kb_duplicated', 'duplicated'])) {
                    $q->orWhereIn('activity_type', ['kb_duplicated', 'duplicated'])
                      ->orWhereIn('action', ['duplicated', 'duplicate']);
                } elseif (in_array($typeFilter, ['kb_shared', 'shared'])) {
                    $q->orWhereIn('activity_type', ['kb_shared', 'shared'])
                      ->orWhereIn('action', ['shared', 'share']);
                } elseif (in_array($typeFilter, ['kb_favorited', 'favorite', 'favorited', 'kb_unfavorited'])) {
                    $q->orWhereIn('activity_type', ['kb_favorited', 'kb_unfavorited', 'favorite'])
                      ->orWhereIn('action', ['favorite', 'unfavorite', 'favorited']);
                } elseif (in_array($typeFilter, ['kb_downloaded', 'download', 'downloaded'])) {
                    $q->orWhereIn('activity_type', ['kb_downloaded', 'download'])
                      ->orWhereIn('action', ['download', 'downloaded']);
                }
            });
        }

        $activities = $query->latest()->get();

        $feed = $activities->map(function ($act) {
            return [
                'id' => 'kb-act-' . $act->id,
                'type' => $act->activity_type ?: $act->action ?: 'activity',
                'category' => 'timelines',
                'action' => $act->action ?: 'activity',
                'title' => ucfirst(str_replace('_', ' ', $act->action ?: $act->activity_type)),
                'description' => $act->description,
                'user_id' => $act->user_id,
                'user_name' => $act->user?->name ?? 'System',
                'created_at' => $act->created_at->toIso8601String(),
                'details' => $act->metadata ?? [],
            ];
        });

        $users = User::select('id', 'name', 'email', 'avatar', 'role')
            ->where('active', true)
            ->orderBy('name')
            ->get();

        return response()->json([
            'success' => true,
            'data' => $feed,
            'users' => $users,
        ]);
    }
}
