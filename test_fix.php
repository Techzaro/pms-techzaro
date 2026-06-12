<?php

require_once __DIR__ . '/vendor/autoload.php';

$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\Project;
use App\Models\Task;
use App\Models\User;

// Get test users
$adminUser = User::where('role', 'admin')->first();
$managerUser = User::where('role', 'manager')->first();
$memberUser = User::where('role', 'member')->first();

// Create test projects
$noAssignedProject = Project::create([
    'title' => 'Test Project - No Assigned Users',
    'description' => 'Project without assigned users',
    'created_by' => $adminUser->id,
    'assigned_users' => [],
    'status' => 'in_progress',
    'priority' => 'Medium',
    'start_date' => now()->toDateTimeString(),
]);

$withAssignedProject = Project::create([
    'title' => 'Test Project - With Assigned Users',
    'description' => 'Project with assigned users',
    'created_by' => $adminUser->id,
    'assigned_users' => [$memberUser->id],
    'status' => 'in_progress',
    'priority' => 'Medium',
    'start_date' => now()->toDateTimeString(),
]);

echo "=== PROJECT CREATION VISIBILITY TEST ===\n\n";

echo "Projects in Database:\n";
Project::with('creator:id,name,role', 'assignedUsers')->get()->each(function ($project) {
    echo ($project->id) . ". " . $project->title . "\n";
    echo "   Created by: {$project->creator?->name} (ID: {$project->created_by}, Role: {$project->creator?->role})\n";
    echo "   Assigned users: " . (empty($project->assigned_users) ? "None" : count($project->assigned_users) . " users\n");
    echo "\n";
});

echo "=== Testing TaskController::myTasks() ===\n";

// Simulate myTasks() logic for admin user
$adminTasks = [];
$adminProjects = [];

if (in_array($adminUser->role, ['admin', 'manager'])) {
    $adminProjects = Project::with(['creator:id,name,role', 'team:id,name'])
        ->where(function ($q) {
            $q->whereNotNull('assigned_users')
              ->whereRaw('JSON_LENGTH(assigned_users) > 0');
        })
        ->latest()
        ->get()
        ->map(function ($project) {
            $project->item_type = 'project';
            $project->total_tasks = $project->tasks()->count();
            $project->completed_tasks = $project->tasks()->whereIn('status', ['done', 'completed'])->count();
            return $project;
        });
} else {
    $adminProjects = Project::whereJsonContains('assigned_users', $adminUser->id)
    ->where(function ($q) {
        $q->whereNotNull('assigned_users')
          ->whereRaw('JSON_LENGTH(assigned_users) > 0');
    })
    ->with(['creator:id,name,role', 'team:id,name'])
    ->latest()
    ->get()
    ->map(function ($project) {
        $project->item_type = 'project';
        $project->total_tasks = $project->tasks()->count();
        $project->completed_tasks = $project->tasks()->whereIn('status', ['done', 'completed'])->count();
        return $project;
    });
}

echo "Projects visible to Admin in Tasks Assigned To You: " . $adminProjects->count() . "\n";
echo "Expected: 1 (only project with assigned users)\n";
echo "Status: " . ($adminProjects->count() === 1 ? "✓ PASS" : "✗ FAIL") . "\n\n";

// Simulate assignedByMe() logic for admin user
$adminAssignedByMeProjects = [];

if (in_array($adminUser->role, ['admin', 'manager'])) {
    $adminAssignedByMeProjects = Project::with(['creator:id,name,role', 'team:id,name'])
        ->where(function ($q) {
            $q->whereNotNull('assigned_users')
              ->whereRaw('JSON_LENGTH(assigned_users) > 0');
        })
        ->latest()
        ->get();
} else {
    $adminAssignedByMeProjects = Project::where('created_by', $adminUser->id)
    ->where(function ($q) {
        $q->whereNotNull('assigned_users')
          ->whereRaw('JSON_LENGTH(assigned_users) > 0');
    })
    ->with(['creator:id,name,role', 'team:id,name'])
    ->latest()
    ->get();
}

echo "Projects visible to Admin in Tasks Assigned By Me: " . $adminAssignedByMeProjects->count() . "\n";
echo "Expected: 1 (only project with assigned users)\n";
echo "Status: " . ($adminAssignedByMeProjects->count() === 1 ? "✓ PASS" : "✗ FAIL") . "\n\n";

// Simulate myselfTasks() logic for admin user
$adminSelfTasksProjects = [];

$adminSelfTasksProjects = Project::where('created_by', $adminUser->id)
    ->whereJsonContains('assigned_users', $adminUser->id)
    ->where(function ($q) {
        $q->whereNotNull('assigned_users')
          ->whereRaw('JSON_LENGTH(assigned_users) > 0');
    })
    ->with(['creator:id,name,role', 'team:id,name'])
    ->latest()
    ->get()
    ->map(function ($project) {
        $project->item_type = 'project';
        $project->total_tasks = $project->tasks()->count();
        $project->completed_tasks = $project->tasks()->whereIn('status', ['done', 'completed'])->count();
        return $project;
    });

echo "Projects visible to Admin in Self Tasks: " . $adminSelfTasksProjects->count() . "\n";
echo "Expected: 0 (no project created by admin AND assigned to admin)\n";
echo "Status: " . ($adminSelfTasksProjects->count() === 0 ? "✓ PASS" : "✗ FAIL") . "\n\n";

echo "=== Testing TaskController::myTasks() for member user ===\n";

// Simulate myTasks() logic for member user
$memberTasks = [];
$memberProjects = [];

if (in_array($memberUser->role, ['admin', 'manager'])) {
    $memberProjects = Project::with(['creator:id,name,role', 'team:id,name'])
        ->where(function ($q) {
            $q->whereNotNull('assigned_users')
              ->whereRaw('JSON_LENGTH(assigned_users) > 0');
        })
        ->latest()
        ->get()
        ->map(function ($project) {
            $project->item_type = 'project';
            $project->total_tasks = $project->tasks()->count();
            $project->completed_tasks = $project->tasks()->whereIn('status', ['done', 'completed'])->count();
            return $project;
        });
} else {
    $memberProjects = Project::whereJsonContains('assigned_users', $memberUser->id)
    ->where(function ($q) {
        $q->whereNotNull('assigned_users')
          ->whereRaw('JSON_LENGTH(assigned_users) > 0');
    })
    ->with(['creator:id,name,role', 'team:id,name'])
    ->latest()
    ->get()
    ->map(function ($project) {
        $project->item_type = 'project';
        $project->total_tasks = $project->tasks()->count();
        $project->completed_tasks = $project->tasks()->whereIn('status', ['done', 'completed'])->count();
        return $project;
    });
}

echo "Projects visible to Member in Tasks Assigned To You: " . $memberProjects->count() . "\n";
echo "Expected: 1 (member is assigned to test project)\n";
echo "Status: " . ($memberProjects->count() === 1 ? "✓ PASS" : "✗ FAIL") . "\n\n";

// Clean up - delete test projects
$noAssignedProject->delete();
$withAssignedProject->delete();

echo "✓ Test complete!\n";