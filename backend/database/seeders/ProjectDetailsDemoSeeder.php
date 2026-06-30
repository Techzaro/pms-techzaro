<?php

/**
 * ProjectDetailsDemoSeeder - Demo seeder for the project details UI.
 *
 * Seeds a rich "Ecommerce Platform Redesign" project with associated
 * milestones, files, tasks, and team members. This seeder is designed
 * to populate the project details page with realistic demo data.
 *
 * Features seeded:
 * - 4 team members with different roles (admin, manager, team_lead, member)
 * - 1 project with full metadata (description, goals, budget, dates, etc.)
 * - 4 milestones (Design, Development, Testing, Launch)
 * - 2 project files (Requirements.pdf, Figma UI Kit)
 * - 5 tasks with varied statuses and priorities
 *
 * Run via: php artisan db:seed --class=ProjectDetailsDemoSeeder
 */

namespace Database\Seeders;

use App\Models\Project;
use App\Models\ProjectFile;
use App\Models\ProjectMilestone;
use App\Models\Task;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class ProjectDetailsDemoSeeder extends Seeder
{
    /**
     * Seed the Ecommerce Platform Redesign project for demo purposes.
     *
     * Creates or retrieves an owner user, then seeds 4 team members using
     * firstOrCreate to avoid duplicates. Sets up the project with milestones,
     * files, and tasks distributed across team members.
     *
     * @return void
     */
    public function run(): void
    {
        // Get or create the project owner (first user in the system)
        $owner = User::first();
        if (!$owner) {
            $owner = User::create([
                'name' => 'Umar Naseer',
                'email' => 'umar@demo.test',
                'password' => Hash::make('password'),
                'role' => 'admin',
            ]);
        }

        // Define team members with different roles for the project
        $users = collect([
            ['name' => 'Umar Naseer', 'email' => 'umar.naseer@demo.test', 'role' => 'admin'],
            ['name' => 'Ali Khan', 'email' => 'ali.khan@demo.test', 'role' => 'manager'],
            ['name' => 'Sara Ahmed', 'email' => 'sara.ahmed@demo.test', 'role' => 'team_lead'],
            ['name' => 'Faiz Haider', 'email' => 'faiz.haider@demo.test', 'role' => 'member'],
        ])->map(function ($data) {
            // Use firstOrCreate to prevent duplicate user creation on re-run
            return User::firstOrCreate(
                ['email' => $data['email']],
                [
                    'name' => $data['name'],
                    'password' => Hash::make('password'),
                    'role' => $data['role'],
                ]
            );
        });

        // Extract unique user IDs for project assignment
        $memberIds = $users->pluck('id')->unique()->values()->all();

        // HTML description for the project details page
        $description = '<p>Complete redesign of the ecommerce storefront with a focus on performance, accessibility, and conversion. This phase covers UX research, UI design, and implementation of the new checkout flow.</p>';

        // Goals checklist with completion status for progress tracking
        $goalsChecklist = [
            ['text' => 'Improve user experience and navigation', 'done' => true],
            ['text' => 'Increase conversion rate with streamlined checkout', 'done' => true],
            ['text' => 'Launch mobile-first responsive layouts', 'done' => false],
            ['text' => 'Integrate analytics and A/B testing hooks', 'done' => false],
        ];

        // Create or update the main project record with all metadata
        $project = Project::updateOrCreate(
            ['title' => 'Ecommerce Platform Redesign'],
            [
                'description' => $description,
                'goals' => '<p>Deliver a modern shopping experience aligned with brand guidelines.</p>',
                'goals_checklist' => $goalsChecklist,
                'sheets_documents' => '<p>Links to Figma and requirements doc can go here.</p>',
                'website_name' => 'Ecommerce Demo',
                'website_link' => 'https://example.com',
                'client_name' => 'AquaGasPlastics',
                'category' => 'Web Development',
                'budget' => 15000,
                'priority' => 'Medium',
                'sidebar_notes' => 'Internal: client prefers blue accent palette. Next sync on Friday.',
                'team_id' => null,
                'assigned_users' => $memberIds,
                'status' => 'In Progress',
                'start_date' => now()->subMonths(2)->startOfDay(),
                'end_date' => now()->addMonth()->startOfDay(),
                'created_by' => $owner->id,
            ]
        );

        // Clear existing seed data to allow clean re-runs
        $project->milestones()->delete();
        $project->files()->delete();
        $project->tasks()->delete();

        // Seed project milestones with sequential sort order
        $milestones = [
            ['title' => 'Design', 'due_date' => now()->subMonth(), 'status' => 'completed', 'sort_order' => 1],
            ['title' => 'Development', 'due_date' => now()->addWeeks(2), 'status' => 'in_progress', 'sort_order' => 2],
            ['title' => 'Testing', 'due_date' => now()->addWeeks(5), 'status' => 'planned', 'sort_order' => 3],
            ['title' => 'Launch', 'due_date' => now()->addMonth(), 'status' => 'planned', 'sort_order' => 4],
        ];
        foreach ($milestones as $m) {
            ProjectMilestone::create(array_merge($m, ['project_id' => $project->id]));
        }

        // Seed project reference files
        ProjectFile::create([
            'project_id' => $project->id,
            'name' => 'Requirements.pdf',
            'url' => '#',
        ]);
        ProjectFile::create([
            'project_id' => $project->id,
            'name' => 'Figma – UI Kit',
            'url' => 'https://www.figma.com',
        ]);

        // Seed tasks with varied statuses and round-robin assignment
        $taskSeeds = [
            ['title' => 'Homepage hero redesign', 'status' => 'completed', 'priority' => 'High', 'days' => 5],
            ['title' => 'Checkout step validation', 'status' => 'completed', 'priority' => 'High', 'days' => 2],
            ['title' => 'Product listing filters', 'status' => 'completed', 'priority' => 'Medium', 'days' => 7],
            ['title' => 'Email receipt templates', 'status' => 'in_progress', 'priority' => 'Medium', 'days' => 10],
            ['title' => 'Performance audit (Lighthouse)', 'status' => 'in_progress', 'priority' => 'Low', 'days' => 14],
        ];

        foreach ($taskSeeds as $i => $t) {
            Task::create([
                'project_id' => $project->id,
                'title' => $t['title'],
                'description' => null,
                'status' => $t['status'],
                'priority' => $t['priority'],
                'start_date' => now()->subDays(20 - $i),
                'end_date' => now()->addDays((int) $t['days']),
                // Round-robin assignment: distribute tasks across team members
                'assigned_to' => $users->get($i % $users->count())->id,
            ]);
        }
    }
}
