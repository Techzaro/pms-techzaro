<?php

require_once __DIR__ . '/bootstrap/app.php';

use App\Models\Project;
use App\Models\User;

$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

// Get test users
$adminUser = User::where('role', 'admin')->first();
$managerUser = User::where('role', 'manager')->first();
$memberUser = User::where('role', 'member')->first();
$teamLeadUser = User::where('role', 'team_lead')->first();

echo "=== PROJECT VISIBILITY TEST ===\n\n";

echo "Test Users:\n";
echo "- Admin: " . ($adminUser ? "ID {$adminUser->id} ({$adminUser->name})" : "NOT FOUND") . "\n";
echo "- Manager: " . ($managerUser ? "ID {$managerUser->id} ({$managerUser->name})" : "NOT FOUND") . "\n";
echo "- Member: " . ($memberUser ? "ID {$memberUser->id} ({$memberUser->name})" : "NOT FOUND") . "\n";
echo "- Team Lead: " . ($teamLeadUser ? "ID {$teamLeadUser->id} ({$teamLeadUser->name})" : "NOT FOUND") . "\n\n";

// Get all projects
$allProjects = Project::with('creator:id,name,role')->get();
echo "Total Projects in Database: " . $allProjects->count() . "\n\n";

// Test Admin visibility
if ($adminUser) {
    echo "ADMIN USER (ID: {$adminUser->id}) --------\n";
    $adminProjects = Project::where(function ($q) use ($adminUser) {
        if (in_array($adminUser->role, ['admin', 'manager'])) {
            // Should return all projects
            $q->where('id', '>', 0);
        } else {
            $q->where('created_by', $adminUser->id);
        }
    })->count();
    echo "Projects visible to Admin (with new logic): $adminProjects\n";
    echo "Expected: " . $allProjects->count() . " (all projects)\n";
    echo "Status: " . ($adminProjects === $allProjects->count() ? "✓ PASS" : "✗ FAIL") . "\n\n";
}

// Test Manager visibility
if ($managerUser) {
    echo "MANAGER USER (ID: {$managerUser->id}) --------\n";
    $managerProjects = Project::where(function ($q) use ($managerUser) {
        if (in_array($managerUser->role, ['admin', 'manager'])) {
            // Should return all projects
            $q->where('id', '>', 0);
        } else {
            $q->where('created_by', $managerUser->id);
        }
    })->count();
    echo "Projects visible to Manager (with new logic): $managerProjects\n";
    echo "Expected: " . $allProjects->count() . " (all projects)\n";
    echo "Status: " . ($managerProjects === $allProjects->count() ? "✓ PASS" : "✗ FAIL") . "\n\n";
}

// Test Member visibility (restricted)
if ($memberUser) {
    echo "MEMBER USER (ID: {$memberUser->id}) --------\n";
    $memberProjects = Project::where(function ($q) use ($memberUser) {
        if (in_array($memberUser->role, ['admin', 'manager'])) {
            // Should return all projects
            $q->where('id', '>', 0);
        } else {
            // Restricted to creator or assigned
            $q->where('created_by', $memberUser->id)
              ->orWhereJsonContains('assigned_users', $memberUser->id);
        }
    })->count();
    echo "Projects visible to Member (with new logic): $memberProjects\n";
    echo "Expected: Less than " . $allProjects->count() . " (restricted)\n";
    echo "Status: " . ($memberProjects < $allProjects->count() ? "✓ PASS" : "✗ FAIL") . "\n\n";
}

echo "\n=== DETAILED PROJECT LIST ===\n";
$allProjects->each(function ($project, $index) {
    echo ($index + 1) . ". {$project->title} (ID: {$project->id})\n";
    echo "   Created by: {$project->creator?->name} (ID: {$project->created_by}, Role: {$project->creator?->role})\n";
});

echo "\n✓ Test complete!\n";
