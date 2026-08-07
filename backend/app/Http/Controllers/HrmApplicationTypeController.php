<?php
namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\HrmApplicationType;
use App\Models\HrmApplicationField;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\DB;

class HrmApplicationTypeController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $types = HrmApplicationType::with('fields')->where('organization_id', $user->organization_id)->get();
        return response()->json(['success' => true, 'data' => $types]);
    }

    public function store(Request $request)
    {
        $user = $request->user();
        $request->validate([
            'name' => 'required|string',
            'category' => 'nullable|string',
            'fields' => 'nullable|array'
        ]);

        try {
            DB::beginTransaction();

            $type = HrmApplicationType::create([
                'organization_id' => $user->organization_id,
                'name' => $request->name,
                'slug' => Str::slug($request->name),
                'category' => $request->category ?? 'General',
                'description' => $request->description,
                'created_by' => $user->id
            ]);

            if ($request->has('fields')) {
                foreach ($request->fields as $idx => $f) {
                    HrmApplicationField::create([
                        'organization_id' => $user->organization_id,
                        'application_type_id' => $type->id,
                        'field_label' => $f['label'],
                        'field_name' => $f['name'],
                        'field_type' => $f['type'],
                        'is_required' => $f['is_required'] ?? false,
                        'options' => $f['options'] ?? null,
                        'sort_order' => $idx
                    ]);
                }
            }

            DB::commit();
            return response()->json(['success' => true, 'data' => $type->load('fields')]);
        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['success' => false, 'message' => $e->getMessage()], 500);
        }
    }
}
