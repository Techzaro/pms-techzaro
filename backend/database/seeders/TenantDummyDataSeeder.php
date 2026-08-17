<?php

namespace Database\Seeders;

use App\Models\Deliverable;
use App\Models\Feedback;
use App\Models\Project;
use App\Models\Task;
use App\Models\Team;
use App\Models\Template;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;

class TenantDummyDataSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Seed Core Known Users with default password 'password'
        $admin = User::firstOrCreate(
            ['email' => 'admin@techzaro.com'],
            [
                'name' => 'System Admin',
                'password' => Hash::make('password'),
                'role' => 'admin',
                'department' => 'Engineering',
                'designation' => 'Lead Systems Administrator',
                'company_name' => 'Techzaro',
                'active' => true,
            ]
        );

        $manager = User::firstOrCreate(
            ['email' => 'manager@techzaro.com'],
            [
                'name' => 'Project Manager',
                'password' => Hash::make('password'),
                'role' => 'manager',
                'department' => 'Product',
                'designation' => 'Senior Project Manager',
                'company_name' => 'Techzaro',
                'active' => true,
            ]
        );

        $user1 = User::firstOrCreate(
            ['email' => 'user1@techzaro.com'],
            [
                'name' => 'Alex Developer',
                'password' => Hash::make('password'),
                'role' => 'member',
                'department' => 'Engineering',
                'designation' => 'Fullstack Developer',
                'company_name' => 'Techzaro',
                'active' => true,
            ]
        );

        $user2 = User::firstOrCreate(
            ['email' => 'user2@techzaro.com'],
            [
                'name' => 'Sarah Designer',
                'password' => Hash::make('password'),
                'role' => 'member',
                'department' => 'Design',
                'designation' => 'UI/UX Designer',
                'company_name' => 'Techzaro',
                'active' => true,
            ]
        );

        $guest = User::firstOrCreate(
            ['email' => 'guest@techzaro.com'],
            [
                'name' => 'Client Representative',
                'password' => Hash::make('password'),
                'role' => 'guest',
                'department' => 'Marketing',
                'designation' => 'External Consultant',
                'company_name' => 'Techzaro',
                'active' => true,
            ]
        );

        // Create extra dummy users if user count is low
        if (User::count() < 8) {
            User::factory()->count(5)->create([
                'password' => Hash::make('password'),
                'role' => 'member',
                'company_name' => 'Techzaro',
                'active' => true,
            ]);
        }

        $allUsers = User::all();
        $members = User::whereIn('role', ['member', 'user'])->get();

        // 2. Seed Teams
        $engineeringTeam = Team::firstOrCreate(
            ['name' => 'Engineering Core'],
            ['description' => 'Frontend and Backend Core Developers', 'leader_id' => $manager->id, 'created_by' => $admin->id]
        );

        $designTeam = Team::firstOrCreate(
            ['name' => 'Product & Design'],
            ['description' => 'UI/UX & Creative Team', 'leader_id' => $manager->id, 'created_by' => $admin->id]
        );

        if (method_exists($engineeringTeam, 'members')) {
            $engineeringTeam->members()->syncWithoutDetaching([$user1->id, $admin->id]);
            $designTeam->members()->syncWithoutDetaching([$user2->id, $manager->id]);
        }

        // 3. Seed Projects
        $prj1 = Project::firstOrCreate(
            ['title' => 'Enterprise PMS Redesign'],
            [
                'description' => 'Comprehensive redesign and performance enhancement of the project management platform.',
                'status' => 'in_progress',
                'priority' => 'High',
                'start_date' => now()->subMonth(),
                'team_id' => $engineeringTeam->id,
                'created_by' => $manager->id,
                'business_id' => 'PRJ-1',
                'project_code' => 'PMS',
                'project_number' => 1,
            ]
        );

        $prj2 = Project::firstOrCreate(
            ['title' => 'Mobile App v2.0'],
            [
                'description' => 'Next generation mobile application for iOS and Android built using React Native.',
                'status' => 'pending',
                'priority' => 'Medium',
                'start_date' => now(),
                'team_id' => $designTeam->id,
                'created_by' => $admin->id,
                'business_id' => 'PRJ-2',
                'project_code' => 'MOB',
                'project_number' => 2,
            ]
        );

        $prj3 = Project::firstOrCreate(
            ['title' => 'Customer Portal Integration'],
            [
                'description' => 'Integration API gateway for external client billing and self-service analytics.',
                'status' => 'completed',
                'priority' => 'Urgent',
                'start_date' => now()->subMonths(2),
                'team_id' => $engineeringTeam->id,
                'created_by' => $manager->id,
                'business_id' => 'PRJ-3',
                'project_code' => 'CP',
                'project_number' => 3,
            ]
        );

        $projects = [$prj1, $prj2, $prj3];

        // 4. Seed Tasks
        $taskTemplates = [
            ['title' => 'Implement Subtask Delegation Workflow', 'priority' => 'High', 'status' => 'in_progress'],
            ['title' => 'Fix Internal Server Errors on API Endpoints', 'priority' => 'Urgent', 'status' => 'completed'],
            ['title' => 'Personalization & Settings Theme Support', 'priority' => 'Medium', 'status' => 'pending'],
            ['title' => 'User Feedback Submission Portal', 'priority' => 'High', 'status' => 'in_progress'],
            ['title' => 'Database Multi-Tenant Seeding Automation', 'priority' => 'Urgent', 'status' => 'completed'],
            ['title' => 'Mobile App Push Notification Gateway', 'priority' => 'Medium', 'status' => 'pending'],
            ['title' => 'Audit Log Export to CSV/PDF', 'priority' => 'Low', 'status' => 'pending'],
            ['title' => 'S3 File Storage Management Integration', 'priority' => 'High', 'status' => 'review'],
        ];

        $createdTasks = [];
        foreach ($taskTemplates as $idx => $tData) {
            $prj = $projects[$idx % count($projects)];
            $assignee = $members->count() > 0 ? $members[$idx % $members->count()] : $user1;
            
            $task = Task::firstOrCreate(
                ['title' => $tData['title'], 'project_id' => $prj->id],
                [
                    'description' => 'Detailed implementation tasks for ' . $tData['title'],
                    'requirements' => '1. Maintain strict backward compatibility.\n2. Ensure full test coverage.',
                    'status' => $tData['status'],
                    'priority' => $tData['priority'],
                    'start_date' => now()->subDays(10 - $idx),
                    'end_date' => now()->addDays(5 + $idx),
                    'assigned_to' => $assignee->id,
                    'assigned_by' => $manager->id,
                    'current_owner' => $assignee->id,
                    'original_assigner' => $manager->id,
                    'business_id' => 'TSK-' . $prj->id . '.' . ($idx + 1),
                ]
            );

            // Sync assignees pivot
            if (method_exists($task, 'assignees')) {
                $task->assignees()->syncWithoutDetaching([$assignee->id]);
            }
            $createdTasks[] = $task;
        }

        // 5. Seed Deliverables (Subtasks)
        $subtaskTitles = [
            'API Route Authentication Guard',
            'Database Migration Table Checks',
            'Frontend State Handler Update',
            'Unit Tests & Integration Checks',
            'UI Layout Flexbox Alignment',
            'Modal Dirty State Handler Fix',
            'Error Boundary Fallback Screen',
            'Role Permission Middleware Test',
            'S3 Upload Presigned URL Generator',
            'Audit Trail Activity Logger',
        ];

        foreach ($subtaskTitles as $sIdx => $stTitle) {
            $parentTask = $createdTasks[$sIdx % count($createdTasks)];
            $stAssignee = $members->count() > 0 ? $members[$sIdx % $members->count()] : $user2;
            
            Deliverable::firstOrCreate(
                ['title' => $stTitle, 'task_id' => $parentTask->id],
                [
                    'project_id' => $parentTask->project_id,
                    'description' => 'Deliverable work item for ' . $stTitle,
                    'status' => ($sIdx % 2 === 0) ? 'pending' : (($sIdx % 3 === 0) ? 'in_progress' : 'completed'),
                    'priority' => ($sIdx % 4 === 0) ? 'Urgent' : 'Medium',
                    'start_date' => now()->subDays(5 - $sIdx),
                    'due_date' => now()->addDays(3 + $sIdx),
                    'assigned_to' => $stAssignee->id,
                    'created_by' => $manager->id,
                    'current_owner' => $stAssignee->id,
                    'original_assigner' => $manager->id,
                    'estimated_hours' => 8,
                    'estimated_minutes' => 30,
                    'business_id' => 'SUB-' . $parentTask->id . '.' . ($sIdx + 1),
                ]
            );
        }

        // 6. Seed Templates
        if (Schema::hasTable('templates')) {
            $templatesData = [
                [
                    'title' => 'Software Feature Development Workflow',
                    'description' => 'Standard template for fullstack feature planning and code review.',
                    'category' => 'Software Development',
                    'visibility_level' => 'organization',
                    'department' => 'Engineering',
                ],
                [
                    'title' => 'UI Component Design Brief',
                    'description' => 'Template for designing modern React UI components.',
                    'category' => 'Design System',
                    'visibility_level' => 'department_team',
                    'department' => 'Design',
                ],
                [
                    'title' => 'QA Integration Test Plan',
                    'description' => 'Automated test suite execution and manual QA checklist.',
                    'category' => 'QA Testing',
                    'visibility_level' => 'project_team',
                    'department' => 'Engineering',
                    'project_id' => $prj1->id,
                ],
                [
                    'title' => 'Private Developer Notes Template',
                    'description' => 'Personal scratchpad template for code snippets.',
                    'category' => 'Operations',
                    'visibility_level' => 'private',
                    'department' => 'Engineering',
                ],
            ];

            foreach ($templatesData as $tmpl) {
                Template::firstOrCreate(
                    ['title' => $tmpl['title']],
                    array_merge($tmpl, [
                        'organization' => 'Techzaro',
                        'data' => [
                            'steps' => ['Requirement Gathering', 'Technical Design', 'Implementation', 'QA', 'Deployment'],
                        ],
                        'created_by' => $admin->id,
                        'updated_by' => $manager->id,
                    ])
                );
            }
        }

        // 7. Seed Feedback Items
        if (Schema::hasTable('feedback')) {
            $feedbackItems = [
                [
                    'reference_number' => 'FB-1001',
                    'feedback_type' => 'Bug Report',
                    'subject' => 'Subtasks page Error Boundary crash on null actingType',
                    'description' => 'Clicking on subtask row triggered reload again error boundary.',
                    'priority' => 'High',
                    'rating' => 4,
                    'status' => 'Resolved',
                    'module' => 'Deliverables',
                ],
                [
                    'reference_number' => 'FB-1002',
                    'feedback_type' => 'Feature Request',
                    'subject' => 'Add Dark Mode support to Personalization settings',
                    'description' => 'Allow users to switch between light and dark themes in user settings.',
                    'priority' => 'Medium',
                    'rating' => 5,
                    'status' => 'In Development',
                    'module' => 'Settings',
                ],
                [
                    'reference_number' => 'FB-1003',
                    'feedback_type' => 'General Suggestion',
                    'subject' => 'Fast multi-tenant database migration auto-healing',
                    'description' => 'Ensure database migrations run without SQL duplicate table crashes.',
                    'priority' => 'Urgent',
                    'rating' => 5,
                    'status' => 'Resolved',
                    'module' => 'Database',
                ],
                [
                    'reference_number' => 'FB-1004',
                    'feedback_type' => 'General Feedback',
                    'subject' => 'Great performance improvements across task filters',
                    'description' => 'The task filtering by role and status is now super responsive!',
                    'priority' => 'Low',
                    'rating' => 5,
                    'status' => 'Closed',
                    'module' => 'Tasks',
                ],
            ];

            foreach ($feedbackItems as $fb) {
                Feedback::firstOrCreate(
                    ['reference_number' => $fb['reference_number']],
                    array_merge($fb, [
                        'organization_id' => 1,
                        'organization_name' => 'Techzaro',
                        'user_id' => $user1->id,
                        'user_name' => $user1->name,
                        'user_role' => $user1->role,
                        'assigned_to' => $admin->id,
                        'current_page' => '/user-feedback',
                        'submitted_at' => now()->subDays(2),
                        'browser' => 'Chrome 125.0',
                        'operating_system' => 'Windows 11',
                        'device_type' => 'Desktop',
                        'ip_address' => '127.0.0.1',
                        'app_version' => '1.0.0',
                    ])
                );
            }
        }
    }
}
