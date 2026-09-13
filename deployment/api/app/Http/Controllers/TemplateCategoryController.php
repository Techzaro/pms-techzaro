<?php

namespace App\Http\Controllers;

use App\Models\Template;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TemplateCategoryController extends Controller
{
    /**
     * Get predefined and existing template categories.
     *
     * @param Request $request
     * @return JsonResponse
     */
    public function index(Request $request): JsonResponse
    {
        $defaultCategories = [
            ['id' => 'General', 'name' => 'General'],
            ['id' => 'Development', 'name' => 'Development'],
            ['id' => 'Design', 'name' => 'Design'],
            ['id' => 'Marketing', 'name' => 'Marketing'],
            ['id' => 'Operations', 'name' => 'Operations'],
            ['id' => 'QA & Testing', 'name' => 'QA & Testing'],
            ['id' => 'Research', 'name' => 'Research'],
            ['id' => 'Content', 'name' => 'Content'],
            ['id' => 'Bug Report', 'name' => 'Bug Report'],
            ['id' => 'Feature Request', 'name' => 'Feature Request'],
        ];

        try {
            $existing = Template::whereNotNull('category')
                ->where('category', '!=', '')
                ->distinct()
                ->pluck('category')
                ->toArray();

            $knownNames = array_column($defaultCategories, 'name');
            foreach ($existing as $cat) {
                if (!in_array($cat, $knownNames, true)) {
                    $defaultCategories[] = [
                        'id' => $cat,
                        'name' => $cat,
                    ];
                }
            }
        } catch (\Throwable $e) {
            // fallback to defaults if database query fails
        }

        return response()->json([
            'success' => true,
            'data' => $defaultCategories,
        ]);
    }
}
