<?php

namespace App\Http\Controllers;

use App\Models\EventCategory;
use App\Models\Event;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class EventCategoryController extends Controller
{
    /**
     * Display a listing of event categories.
     */
    public function index(Request $request): JsonResponse
    {
        $query = EventCategory::withCount('events')
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

        $baseSlug = $slug;
        $counter = 1;
        while (EventCategory::where('slug', $slug)->exists()) {
            $slug = "{$baseSlug}-{$counter}";
            $counter++;
        }

        $category = EventCategory::create([
            'name' => $validated['name'],
            'slug' => $slug,
            'description' => $validated['description'] ?? null,
            'icon' => $validated['icon'] ?? 'Calendar',
            'color' => $validated['color'] ?? '#3b82f6',
            'sort_order' => $validated['sort_order'] ?? (EventCategory::max('sort_order') + 1),
            'is_active' => $validated['is_active'] ?? true,
            'created_by' => $user->id,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Event category created successfully.',
            'data' => $category,
        ], 201);
    }

    /**
     * Display the specified category.
     */
    public function show(EventCategory $eventCategory): JsonResponse
    {
        $eventCategory->loadCount('events');

        return response()->json([
            'success' => true,
            'data' => $eventCategory,
        ]);
    }

    /**
     * Update the specified category.
     */
    public function update(Request $request, EventCategory $eventCategory): JsonResponse
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

        if (!empty($validated['slug']) && $validated['slug'] !== $eventCategory->slug) {
            $validated['slug'] = Str::slug($validated['slug']);
        }

        $eventCategory->update($validated);

        return response()->json([
            'success' => true,
            'message' => 'Event category updated successfully.',
            'data' => $eventCategory->fresh()->loadCount('events'),
        ]);
    }

    /**
     * Remove the specified category.
     */
    public function destroy(EventCategory $eventCategory): JsonResponse
    {
        Event::where('category_id', $eventCategory->id)->update(['category_id' => null]);
        $eventCategory->delete();

        return response()->json([
            'success' => true,
            'message' => 'Event category deleted successfully.',
        ]);
    }
}
