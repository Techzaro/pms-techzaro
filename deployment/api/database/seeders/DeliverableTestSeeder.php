<?php

/**
 * DeliverableTestSeeder - Test seeder for deliverable functionality.
 *
 * Seeds a sample task with multiple deliverables for testing the
 * deliverable tracking system. This seeder creates an LMS (Learning
 * Management System) task with 5 deliverables spread across 5 weeks.
 *
 * Prerequisites:
 * - At least one admin, manager, and member user must exist
 * - At least one project must exist
 *
 * Run via: php artisan db:seed --class=DeliverableTestSeeder
 */

namespace Database\Seeders;

use App\Models\Deliverable;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Database\Seeder;

class DeliverableTestSeeder extends Seeder
{
    /**
     * Seed deliverables for testing the deliverable tracking system.
     *
     * Creates a task with 5 deliverables assigned to a member user,
     * managed by a manager user. Each deliverable has a staggered due date
     * to simulate a realistic project timeline.
     *
     * @return void
     */
    public function run(): void
    {
        // Fetch users with required roles for task/deliverable assignment
        $admin = User::where('role', 'admin')->first();
        $manager = User::where('role', 'manager')->first();
        $member = User::where('role', 'member')->first();

        // Validate that all required user roles exist before proceeding
        if (!$admin || !$manager || !$member) {
            $this->command->info('Need at least one admin, manager, and member user. Skipping.');
            return;
        }

        // Use the first available project for task association
        $project = Project::first();
        if (!$project) {
            $this->command->info('No projects found. Skipping.');
            return;
        }

        // Create the parent task for the LMS project
        $task = Task::create([
            'project_id' => $project->id,
            'title' => 'Learning Management System',
            'description' => 'Build a complete LMS platform',
            'status' => 'pending',
            'priority' => 'High',
            'assigned_to' => $member->id,
            'assigned_by' => $manager->id,
        ]);

        // Sync the task assignees via pivot table
        $task->assignees()->sync([$member->id]);

        // Define deliverables with staggered due dates (7-day intervals)
        $deliverables = [
            ['title' => 'User Dashboard UI', 'due_date' => now()->addDays(7)],
            ['title' => 'Student Module', 'due_date' => now()->addDays(14)],
            ['title' => 'Teacher Module', 'due_date' => now()->addDays(21)],
            ['title' => 'Exam Module', 'due_date' => now()->addDays(28)],
            ['title' => 'Reports Module', 'due_date' => now()->addDays(35)],
        ];

        // Create each deliverable linked to the parent task and project
        foreach ($deliverables as $del) {
            Deliverable::create([
                'project_id' => $project->id,
                'task_id' => $task->id,
                'title' => $del['title'],
                'status' => 'pending',
                'priority' => 'Medium',
                'due_date' => $del['due_date'],
                'assigned_to' => $member->id,
                'created_by' => $manager->id,
            ]);
        }

        $this->command->info('Created task with 5 deliverables for member user.');
    }
}
