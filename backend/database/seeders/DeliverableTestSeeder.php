<?php

namespace Database\Seeders;

use App\Models\Deliverable;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Database\Seeder;

class DeliverableTestSeeder extends Seeder
{
    public function run(): void
    {
        $admin = User::where('role', 'admin')->first();
        $manager = User::where('role', 'manager')->first();
        $member = User::where('role', 'member')->first();

        if (!$admin || !$manager || !$member) {
            $this->command->info('Need at least one admin, manager, and member user. Skipping.');
            return;
        }

        $project = Project::first();
        if (!$project) {
            $this->command->info('No projects found. Skipping.');
            return;
        }

        $task = Task::create([
            'project_id' => $project->id,
            'title' => 'Learning Management System',
            'description' => 'Build a complete LMS platform',
            'status' => 'pending',
            'priority' => 'High',
            'assigned_to' => $member->id,
            'assigned_by' => $manager->id,
        ]);
        $task->assignees()->sync([$member->id]);

        $deliverables = [
            ['title' => 'User Dashboard UI', 'due_date' => now()->addDays(7)],
            ['title' => 'Student Module', 'due_date' => now()->addDays(14)],
            ['title' => 'Teacher Module', 'due_date' => now()->addDays(21)],
            ['title' => 'Exam Module', 'due_date' => now()->addDays(28)],
            ['title' => 'Reports Module', 'due_date' => now()->addDays(35)],
        ];

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
