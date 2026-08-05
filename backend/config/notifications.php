<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Notification Types to Category Mapping
    |--------------------------------------------------------------------------
    | Maps every granular notification type/event to its parent category.
    */
    'categories' => [
        'project'  => 'Project',
        'task'     => 'Task',
        'sub_task' => 'Sub-Tasks',
        'events'   => 'Events',
        'profile'  => 'Profile',
        'teams'    => 'Teams',
        'draft'    => 'Draft',
    ],

    'event_mapping' => [
        // Project
        'project_created'          => 'project',
        'project_updated'          => 'project',
        'project_completed'        => 'project',
        'project_member_added'     => 'project',

        // Task
        'task_assigned'            => 'task',
        'task_updated'             => 'task',
        'task_status_updated'      => 'task',
        'task_submitted'           => 'task',
        'task_approved'            => 'task',
        'task_rejected'            => 'task',
        'task_reopened'            => 'task',
        'task_paused'              => 'task',
        'task_continued'           => 'task',
        'task_assigner_paused'     => 'task',
        'task_assigner_resumed'    => 'task',

        // Sub-Tasks / Deliverables
        'deliverable_assigned'         => 'sub_task',
        'deliverable_added'            => 'sub_task',
        'sub-task_assigned'            => 'sub_task',
        'sub-task_updated'             => 'sub_task',
        'sub-task_status_updated'      => 'sub_task',
        'sub-task_submitted'           => 'sub_task',
        'sub-task_approved'            => 'sub_task',
        'sub-task_rejected'            => 'sub_task',
        'sub-task_reopened'            => 'sub_task',
        'sub-task_paused'              => 'sub_task',
        'sub-task_continued'           => 'sub_task',
        'sub-task_assigner_paused'     => 'sub_task',
        'sub-task_assigner_resumed'    => 'sub_task',

        // Events
        'event_created'            => 'events',
        'event_updated'            => 'events',
        'event_reminder'           => 'events',

        // Profile & Auth
        'password_changed'         => 'profile',
        'password_changed_by_admin'=> 'profile',
        'profile_updated'          => 'profile',
        'profile_created'          => 'profile',
        
        // Teams
        'team_created'             => 'teams',
        'team_member_added'        => 'teams',
        'team_leader_assigned'     => 'teams',
        'team_updated'             => 'teams',
        
        // Draft
        'draft_saved'              => 'draft',
        'draft_updated'            => 'draft',
    ],
];