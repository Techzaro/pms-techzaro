<?php

namespace App\Http\Controllers;

use App\Models\KbCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class KbCategoryController extends Controller
{
    /**
     * Display a listing of knowledge base categories.
     */
    public function index(Request $request): JsonResponse
    {
        $query = KbCategory::withCount('articles')
            ->orderBy('sort_order', 'asc')
            ->orderBy('name', 'asc');

        if (!$request->boolean('all')) {
            $query->where('is_active', true);
        }

        $categories = $query->get();

        return response()->json([
            'success' => true,
            'data' => $categories,
        ]);
    }

    /**
     * Store a newly created category.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();

        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'slug' => 'nullable|string|max:120',
            'description' => 'nullable|string|max:500',
            'icon' => 'nullable|string|max:50',
            'color' => 'nullable|string|max:32',
            'sort_order' => 'nullable|integer',
            'is_active' => 'nullable|boolean',
        ]);

        $slug = !empty($validated['slug']) ? Str::slug($validated['slug']) : Str::slug($validated['name']);

        // Ensure unique slug
        $baseSlug = $slug;
        $counter = 1;
        while (KbCategory::where('slug', $slug)->exists()) {
            $slug = "{$baseSlug}-{$counter}";
            $counter++;
        }

        $category = KbCategory::create([
            'name' => $validated['name'],
            'slug' => $slug,
            'description' => $validated['description'] ?? null,
            'icon' => $validated['icon'] ?? 'BookOpen',
            'color' => $validated['color'] ?? '#3b82f6',
            'sort_order' => $validated['sort_order'] ?? (KbCategory::max('sort_order') + 1),
            'is_active' => $validated['is_active'] ?? true,
            'created_by' => $user->id,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Category created successfully.',
            'data' => $category,
        ], 201);
    }

    /**
     * Display the specified category.
     */
    public function show(KbCategory $kbCategory): JsonResponse
    {
        $kbCategory->loadCount('articles');

        return response()->json([
            'success' => true,
            'data' => $kbCategory,
        ]);
    }

    /**
     * Update the specified category.
     */
    public function update(Request $request, KbCategory $kbCategory): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:100',
            'slug' => 'nullable|string|max:120',
            'description' => 'nullable|string|max:500',
            'icon' => 'nullable|string|max:50',
            'color' => 'nullable|string|max:32',
            'sort_order' => 'nullable|integer',
            'is_active' => 'nullable|boolean',
        ]);

        if (!empty($validated['slug']) && $validated['slug'] !== $kbCategory->slug) {
            $validated['slug'] = Str::slug($validated['slug']);
        }

        $kbCategory->update($validated);

        return response()->json([
            'success' => true,
            'message' => 'Category updated successfully.',
            'data' => $kbCategory->fresh()->loadCount('articles'),
        ]);
    }

    /**
     * Remove the specified category.
     */
    public function destroy(KbCategory $kbCategory): JsonResponse
    {
        // Unlink articles before deletion so they don't get deleted
        \App\Models\KnowledgeBase::where('category_id', $kbCategory->id)->update(['category_id' => null]);

        $kbCategory->delete();

        return response()->json([
            'success' => true,
            'message' => 'Category deleted successfully.',
        ]);
    }
}
