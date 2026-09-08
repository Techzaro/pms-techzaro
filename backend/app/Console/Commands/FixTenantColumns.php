<?php

namespace App\Console\Commands;

use App\Models\Master\Organization;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class FixTenantColumns extends Command
{
    protected $signature = 'tenants:fix-columns
        {--database= : Fix a specific tenant database}
        {--all : Fix all tenant databases including unregistered ones}';

    protected $description = 'Detect and add missing columns to tenant databases';

    protected array $columnFixes = [
        'users' => [
            ['name' => 'status',                        'definition' => "VARCHAR(32) DEFAULT 'Active' AFTER `active`"],
            ['name' => 'timezone',                      'definition' => "VARCHAR(64) NULL AFTER `status`"],
            ['name' => 'language',                      'definition' => "VARCHAR(32) DEFAULT 'English' AFTER `timezone`"],
            ['name' => 'date_format',                   'definition' => "VARCHAR(32) DEFAULT 'DD/MM/YYYY' AFTER `language`"],
            ['name' => 'time_format',                   'definition' => "VARCHAR(32) DEFAULT '12-hour' AFTER `date_format`"],
            ['name' => 'working_hours',                 'definition' => "JSON NULL AFTER `time_format`"],
            ['name' => 'notification_preferences',      'definition' => "JSON NULL"],
            ['name' => 'deletion_requested',            'definition' => "TINYINT(1) DEFAULT 0 AFTER `active`"],
            ['name' => 'deletion_requested_by',         'definition' => "BIGINT UNSIGNED NULL AFTER `deletion_requested`"],
            ['name' => 'slack_webhook_url',             'definition' => "TEXT NULL AFTER `notification_preferences`"],
            ['name' => 'google_chat_webhook_url',       'definition' => "TEXT NULL AFTER `slack_webhook_url`"],
            ['name' => 'ms_teams_webhook_url',          'definition' => "TEXT NULL AFTER `google_chat_webhook_url`"],
            ['name' => 'email_mode',                    'definition' => "VARCHAR(20) NULL AFTER `email`"],
            ['name' => 'email_verification_code',       'definition' => "VARCHAR(6) NULL AFTER `email_mode`"],
            ['name' => 'email_verification_expires_at', 'definition' => "TIMESTAMP NULL AFTER `email_verification_code`"],
            ['name' => 'email_skip_until',              'definition' => "TIMESTAMP NULL AFTER `email_verification_expires_at`"],
            ['name' => 'email_verified_at',             'definition' => "TIMESTAMP NULL AFTER `email_skip_until`"],
            ['name' => 'personal_email_verified_at',    'definition' => "TIMESTAMP NULL AFTER `personal_email`"],
            ['name' => 'professional_email_verified_at', 'definition' => "TIMESTAMP NULL AFTER `professional_email`"],
            ['name' => 'email_verification_exempt',      'definition' => "TINYINT(1) DEFAULT 0 AFTER `email_verified_at`"],
        ],
        'tasks' => [
            ['name' => 'deleted_at',                      'definition' => "TIMESTAMP NULL AFTER `updated_at`"],
            ['name' => 'recurrence_start_date',         'definition' => "TIMESTAMP NULL AFTER `recurrence_settings`"],
            ['name' => 'recurrence_end_date',           'definition' => "TIMESTAMP NULL AFTER `recurrence_start_date`"],
            ['name' => 'has_edited_submission',         'definition' => "TINYINT(1) DEFAULT 0 AFTER `status`"],
            ['name' => 'status',                        'definition' => "VARCHAR(64) DEFAULT 'Pending' AFTER `requirements`", 'skip_if_exists' => true],
            ['name' => 'states',                        'definition' => "JSON NULL AFTER `status`", 'skip_if_exists' => true],
            ['name' => 'creator_id',                    'definition' => "BIGINT UNSIGNED NULL AFTER `assigned_by`"],
            ['name' => 'current_submitter_id',          'definition' => "BIGINT UNSIGNED NULL AFTER `current_owner`"],
            ['name' => 'current_reviewer_id',           'definition' => "BIGINT UNSIGNED NULL AFTER `current_submitter_id`"],
            ['name' => 'submission_stage',              'definition' => "VARCHAR(64) NULL AFTER `current_reviewer_id`"],
            ['name' => 'submission_forwarded_by',       'definition' => "JSON NULL AFTER `submission_stage`"],
            ['name' => 'is_reopened',                   'definition' => "TINYINT(1) DEFAULT 0 AFTER `allow_transfer`"],
            ['name' => 'is_transferred',                'definition' => "TINYINT(1) DEFAULT 0 AFTER `is_reopened`"],
            ['name' => 'completion_reason',             'definition' => "VARCHAR(255) NULL AFTER `description`"],
            ['name' => 'completion_notes',              'definition' => "TEXT NULL AFTER `completion_reason`"],
            ['name' => 'kb_ids',                        'definition' => "JSON NULL AFTER `description`"],
            ['name' => 'event_ids',                     'definition' => "JSON NULL AFTER `kb_ids`"],
        ],
        'deliverables' => [
            ['name' => 'deleted_at',                    'definition' => "TIMESTAMP NULL AFTER `updated_at`"],
            ['name' => 'has_edited_submission',         'definition' => "TINYINT(1) DEFAULT 0 AFTER `status`"],
            ['name' => 'parent_deliverable_id',         'definition' => "BIGINT UNSIGNED NULL AFTER `task_id`"],
            ['name' => 'is_reopened',                   'definition' => "TINYINT(1) DEFAULT 0 AFTER `allow_transfer`"],
            ['name' => 'is_transferred',                'definition' => "TINYINT(1) DEFAULT 0 AFTER `is_reopened`"],
            ['name' => 'completion_reason',             'definition' => "VARCHAR(255) NULL AFTER `description`"],
            ['name' => 'completion_notes',              'definition' => "TEXT NULL AFTER `completion_reason`"],
            ['name' => 'kb_ids',                        'definition' => "JSON NULL AFTER `description`"],
            ['name' => 'event_ids',                     'definition' => "JSON NULL AFTER `kb_ids`"],
        ],
        'projects' => [
            ['name' => 'kb_ids',                        'definition' => "JSON NULL AFTER `sidebar_notes`"],
            ['name' => 'event_ids',                     'definition' => "JSON NULL AFTER `kb_ids`"],
            ['name' => 'guest_ids',                     'definition' => "JSON NULL AFTER `assigned_users`"],
            ['name' => 'team_ids',                      'definition' => "JSON NULL AFTER `team_id`"],
        ],
        'teams' => [
            ['name' => 'status',                        'definition' => "VARCHAR(255) DEFAULT 'active' AFTER `description`"],
            ['name' => 'is_draft',                      'definition' => "TINYINT(1) DEFAULT 0 AFTER `status`"],
            ['name' => 'working_hours',                 'definition' => "JSON NULL AFTER `is_draft`"],
        ],
        'conversations' => [
            ['name' => 'org_id',                        'definition' => "BIGINT UNSIGNED NULL AFTER `created_by`"],
        ],
        'knowledge_bases' => [
            ['name' => 'slug',                          'definition' => "VARCHAR(255) NULL AFTER `title`"],
            ['name' => 'category_id',                   'definition' => "BIGINT UNSIGNED NULL AFTER `category`"],
            ['name' => 'status',                        'definition' => "VARCHAR(32) DEFAULT 'published' AFTER `visibility_level`"],
            ['name' => 'is_pinned',                     'definition' => "TINYINT(1) DEFAULT 0"],
            ['name' => 'views_count',                   'definition' => "BIGINT UNSIGNED DEFAULT 0"],
            ['name' => 'tags',                          'definition' => "JSON NULL"],
            ['name' => 'reference_link',                'definition' => "VARCHAR(2048) NULL AFTER `file_name`"],
        ],
        'events' => [
            ['name' => 'organizer_id',                  'definition' => "BIGINT UNSIGNED NULL AFTER `user_id`"],
            ['name' => 'category_id',                   'definition' => "BIGINT UNSIGNED NULL AFTER `type`"],
            ['name' => 'location',                      'definition' => "VARCHAR(255) NULL AFTER `description`"],
            ['name' => 'meeting_link',                  'definition' => "VARCHAR(2048) NULL AFTER `description`"],
            ['name' => 'project_id',                    'definition' => "BIGINT UNSIGNED NULL AFTER `meeting_link`"],
            ['name' => 'visibility_level',              'definition' => "VARCHAR(32) DEFAULT 'public' AFTER `is_global`"],
            ['name' => 'status',                        'definition' => "VARCHAR(32) DEFAULT 'scheduled' AFTER `visibility_level`"],
            ['name' => 'start_time',                    'definition' => "TIME NULL AFTER `start_date`"],
            ['name' => 'end_time',                      'definition' => "TIME NULL AFTER `end_date`"],
            ['name' => 'event_timezone',                'definition' => "VARCHAR(64) NULL AFTER `all_day`"],
            ['name' => 'event_date',                    'definition' => "DATE NULL AFTER `event_timezone`"],
            ['name' => 'event_start_time',              'definition' => "TIME NULL AFTER `event_date`"],
            ['name' => 'event_end_time',                'definition' => "TIME NULL AFTER `event_start_time`"],
        ],
        'task_saved_views' => [
            ['name' => 'view_name',                      'definition' => "VARCHAR(255) NULL AFTER `name`"],
            ['name' => 'filter_payload',                 'definition' => "JSON NULL AFTER `filters`"],
            ['name' => 'sort_parameters',                'definition' => "JSON NULL AFTER `filter_payload`"],
        ],
        'saved_views' => [
            ['name' => 'view_name',                      'definition' => "VARCHAR(255) NOT NULL AFTER `user_id`"],
            ['name' => 'name',                           'definition' => "VARCHAR(255) NULL AFTER `view_name`"],
            ['name' => 'filter_payload',                 'definition' => "JSON NULL AFTER `name`"],
            ['name' => 'filters',                        'definition' => "JSON NULL AFTER `filter_payload`"],
            ['name' => 'sort_parameters',                'definition' => "JSON NULL AFTER `filters`"],
            ['name' => 'is_default',                     'definition' => "TINYINT(1) DEFAULT 0 AFTER `sort_parameters`"],
        ],
        'task_comments' => [
            ['name' => 'parent_id',                      'definition' => "BIGINT UNSIGNED NULL AFTER `deliverable_id`"],
            ['name' => 'quoted_message_id',             'definition' => "BIGINT UNSIGNED NULL AFTER `parent_id`"],
            ['name' => 'quoted_text',                   'definition' => "TEXT NULL AFTER `quoted_message_id`"],
            ['name' => 'delegation_id',                 'definition' => "BIGINT UNSIGNED NULL AFTER `body`"],
            ['name' => 'file_path',                     'definition' => "VARCHAR(1024) NULL AFTER `delegation_id`"],
            ['name' => 'file_name',                     'definition' => "VARCHAR(255) NULL AFTER `file_path`"],
            ['name' => 'file_size',                     'definition' => "BIGINT UNSIGNED NULL AFTER `file_name`"],
            ['name' => 'is_edited',                     'definition' => "TINYINT(1) DEFAULT 0 AFTER `file_size`"],
            ['name' => 'edited_at',                     'definition' => "TIMESTAMP NULL AFTER `is_edited`"],
            ['name' => 'comment_type',                  'definition' => "VARCHAR(50) DEFAULT 'internal' AFTER `body`"],
            ['name' => 'visible_to_organizations',      'definition' => "JSON NULL AFTER `comment_type`"],
        ],
        'audit_logs' => [
            ['name' => 'user_name',                      'definition' => "VARCHAR(255) NULL AFTER `user_id`"],
        ],
    ];

    protected array $tableCreates = [
        'project_user' => "CREATE TABLE IF NOT EXISTS `project_user` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `project_id` BIGINT UNSIGNED NOT NULL,
            `user_id` BIGINT UNSIGNED NOT NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY `project_user_project_id_user_id_unique` (`project_id`, `user_id`),
            FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        'event_task' => "CREATE TABLE IF NOT EXISTS `event_task` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `event_id` BIGINT UNSIGNED NOT NULL,
            `task_id` BIGINT UNSIGNED NOT NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY `event_task_event_id_task_id_unique` (`event_id`, `task_id`),
            FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'knowledge_base_task' => "CREATE TABLE IF NOT EXISTS `knowledge_base_task` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `knowledge_base_id` BIGINT UNSIGNED NOT NULL,
            `task_id` BIGINT UNSIGNED NOT NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY `knowledge_base_task_kb_id_task_id_unique` (`knowledge_base_id`, `task_id`),
            FOREIGN KEY (`knowledge_base_id`) REFERENCES `knowledge_bases`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'task_personal_notes' => "CREATE TABLE IF NOT EXISTS `task_personal_notes` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `task_id` BIGINT UNSIGNED NOT NULL,
            `user_id` BIGINT UNSIGNED NOT NULL,
            `note` TEXT NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            INDEX `task_personal_notes_task_id_user_id_index` (`task_id`, `user_id`),
            FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'task_user_notes' => "CREATE TABLE IF NOT EXISTS `task_user_notes` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `task_id` BIGINT UNSIGNED NOT NULL,
            `user_id` BIGINT UNSIGNED NOT NULL,
            `note` TEXT NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            INDEX `task_user_notes_task_id_user_id_index` (`task_id`, `user_id`),
            FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'task_user' => "CREATE TABLE IF NOT EXISTS `task_user` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `task_id` BIGINT UNSIGNED NOT NULL,
            `user_id` BIGINT UNSIGNED NOT NULL,
            `due_date` TIMESTAMP NULL,
            `status` VARCHAR(64) DEFAULT 'pending',
            `submitted_at` TIMESTAMP NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY `task_user_task_id_user_id_unique` (`task_id`, `user_id`),
            FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'team_user' => "CREATE TABLE IF NOT EXISTS `team_user` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `team_id` BIGINT UNSIGNED NOT NULL,
            `user_id` BIGINT UNSIGNED NOT NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY `team_user_team_id_user_id_unique` (`team_id`, `user_id`),
            FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'deliverable_user' => "CREATE TABLE IF NOT EXISTS `deliverable_user` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `deliverable_id` BIGINT UNSIGNED NOT NULL,
            `user_id` BIGINT UNSIGNED NOT NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY `deliverable_user_deliverable_id_user_id_unique` (`deliverable_id`, `user_id`),
            FOREIGN KEY (`deliverable_id`) REFERENCES `deliverables`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'deliverable_submissions' => "CREATE TABLE IF NOT EXISTS `deliverable_submissions` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `deliverable_id` BIGINT UNSIGNED NOT NULL,
            `submitted_by` BIGINT UNSIGNED NOT NULL,
            `status` VARCHAR(32) DEFAULT 'submitted',
            `notes` TEXT NULL,
            `file_path` VARCHAR(1024) NULL,
            `reviewed_by` BIGINT UNSIGNED NULL,
            `reviewed_at` TIMESTAMP NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            INDEX `deliverable_submissions_deliverable_id_index` (`deliverable_id`),
            FOREIGN KEY (`deliverable_id`) REFERENCES `deliverables`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'task_workflow_events' => "CREATE TABLE IF NOT EXISTS `task_workflow_events` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `task_id` BIGINT UNSIGNED NOT NULL,
            `user_id` BIGINT UNSIGNED NOT NULL,
            `action` VARCHAR(64) NOT NULL,
            `notes` TEXT NULL,
            `from_status` VARCHAR(64) NULL,
            `to_status` VARCHAR(64) NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            INDEX `task_workflow_events_task_id_index` (`task_id`),
            FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'project_workflow_events' => "CREATE TABLE IF NOT EXISTS `project_workflow_events` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `project_id` BIGINT UNSIGNED NOT NULL,
            `user_id` BIGINT UNSIGNED NOT NULL,
            `action` VARCHAR(64) NOT NULL,
            `notes` TEXT NULL,
            `from_status` VARCHAR(64) NULL,
            `to_status` VARCHAR(64) NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            INDEX `project_workflow_events_project_id_index` (`project_id`),
            FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'deliverable_workflow_events' => "CREATE TABLE IF NOT EXISTS `deliverable_workflow_events` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `deliverable_id` BIGINT UNSIGNED NOT NULL,
            `user_id` BIGINT UNSIGNED NOT NULL,
            `action` VARCHAR(64) NOT NULL,
            `notes` TEXT NULL,
            `from_status` VARCHAR(64) NULL,
            `to_status` VARCHAR(64) NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            INDEX `deliverable_workflow_events_deliverable_id_index` (`deliverable_id`),
            FOREIGN KEY (`deliverable_id`) REFERENCES `deliverables`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'task_pause_sessions' => "CREATE TABLE IF NOT EXISTS `task_pause_sessions` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `task_id` BIGINT UNSIGNED NOT NULL,
            `user_id` BIGINT UNSIGNED NULL,
            `paused_at` TIMESTAMP NULL,
            `resumed_at` TIMESTAMP NULL,
            `duration_seconds` INT DEFAULT 0,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            INDEX `task_pause_sessions_task_id_index` (`task_id`),
            FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'deliverable_pause_sessions' => "CREATE TABLE IF NOT EXISTS `deliverable_pause_sessions` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `deliverable_id` BIGINT UNSIGNED NOT NULL,
            `user_id` BIGINT UNSIGNED NULL,
            `paused_at` TIMESTAMP NULL,
            `resumed_at` TIMESTAMP NULL,
            `duration_seconds` INT DEFAULT 0,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            INDEX `deliverable_pause_sessions_deliverable_id_index` (`deliverable_id`),
            FOREIGN KEY (`deliverable_id`) REFERENCES `deliverables`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'activities' => "CREATE TABLE IF NOT EXISTS `activities` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `user_id` BIGINT UNSIGNED NULL,
            `type` VARCHAR(64) NULL,
            `description` TEXT NULL,
            `subject_type` VARCHAR(255) NULL,
            `subject_id` BIGINT UNSIGNED NULL,
            `properties` JSON NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            INDEX `activities_subject_type_subject_id_index` (`subject_type`, `subject_id`),
            INDEX `activities_user_id_index` (`user_id`),
            INDEX `activities_created_at_index` (`created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'project_visibility' => "CREATE TABLE IF NOT EXISTS `project_visibility` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `project_id` BIGINT UNSIGNED NOT NULL,
            `user_id` BIGINT UNSIGNED NOT NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY `project_visibility_project_id_user_id_unique` (`project_id`, `user_id`),
            FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'shared_resources' => "CREATE TABLE IF NOT EXISTS `shared_resources` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `shareable_type` VARCHAR(255) NOT NULL,
            `shareable_id` BIGINT UNSIGNED NOT NULL,
            `shared_by` BIGINT UNSIGNED NOT NULL,
            `permission` VARCHAR(32) DEFAULT 'view',
            `notes` TEXT NULL,
            `expires_at` TIMESTAMP NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            INDEX `shared_resources_shareable_type_shareable_id_index` (`shareable_type`, `shareable_id`),
            FOREIGN KEY (`shared_by`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'shared_resource_users' => "CREATE TABLE IF NOT EXISTS `shared_resource_users` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `shared_resource_id` BIGINT UNSIGNED NOT NULL,
            `user_id` BIGINT UNSIGNED NOT NULL,
            `permission` VARCHAR(32) DEFAULT 'view',
            `viewed_at` TIMESTAMP NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY `shared_resource_users_resource_user_unique` (`shared_resource_id`, `user_id`),
            FOREIGN KEY (`shared_resource_id`) REFERENCES `shared_resources`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'event_users' => "CREATE TABLE IF NOT EXISTS `event_users` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `event_id` BIGINT UNSIGNED NOT NULL,
            `user_id` BIGINT UNSIGNED NOT NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY `event_users_event_id_user_id_unique` (`event_id`, `user_id`),
            FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'conversation_participants' => "CREATE TABLE IF NOT EXISTS `conversation_participants` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `conversation_id` BIGINT UNSIGNED NOT NULL,
            `user_id` BIGINT UNSIGNED NOT NULL,
            `last_read_at` TIMESTAMP NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY `conversation_participants_conv_user_unique` (`conversation_id`, `user_id`),
            FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'messages' => "CREATE TABLE IF NOT EXISTS `messages` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `conversation_id` BIGINT UNSIGNED NOT NULL,
            `user_id` BIGINT UNSIGNED NOT NULL,
            `body` TEXT NOT NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            INDEX `messages_conversation_id_index` (`conversation_id`),
            FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'notification_comments' => "CREATE TABLE IF NOT EXISTS `notification_comments` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `notification_id` BIGINT UNSIGNED NOT NULL,
            `user_id` BIGINT UNSIGNED NOT NULL,
            `comment` TEXT NOT NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'templates' => "CREATE TABLE IF NOT EXISTS `templates` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `title` VARCHAR(255) NOT NULL,
            `description` TEXT NULL,
            `category` VARCHAR(255) DEFAULT 'General',
            `visibility_level` ENUM('private','project_team','department_team','organization') DEFAULT 'private',
            `project_id` BIGINT UNSIGNED NULL,
            `department` VARCHAR(255) NULL,
            `organization` VARCHAR(255) NULL,
            `data` JSON NULL,
            `file_path` VARCHAR(255) NULL,
            `created_by` BIGINT UNSIGNED NOT NULL,
            `updated_by` BIGINT UNSIGNED NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'knowledge_bases' => "CREATE TABLE IF NOT EXISTS `knowledge_bases` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `title` VARCHAR(255) NOT NULL,
            `content` LONGTEXT NULL,
            `category` VARCHAR(255) DEFAULT 'General',
            `visibility_level` ENUM('private','project_team','department_team','organization') DEFAULT 'organization',
            `project_id` BIGINT UNSIGNED NULL,
            `department` VARCHAR(255) NULL,
            `organization` VARCHAR(255) NULL,
            `file_path` VARCHAR(255) NULL,
            `file_name` VARCHAR(255) NULL,
            `created_by` BIGINT UNSIGNED NOT NULL,
            `updated_by` BIGINT UNSIGNED NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'feedback' => "CREATE TABLE IF NOT EXISTS `feedback` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `reference_number` VARCHAR(255) NOT NULL,
            `feedback_type` ENUM('Bug Report','Feature Request','General Suggestion','Feature Rating','General Feedback') NOT NULL,
            `subject` VARCHAR(255) NOT NULL,
            `description` TEXT NOT NULL,
            `priority` ENUM('Low','Medium','High','Urgent') DEFAULT 'Medium',
            `rating` TINYINT UNSIGNED NULL,
            `status` ENUM('New','Under Review','Accepted','Planned','In Development','Testing','Resolved','Closed','Rejected') DEFAULT 'New',
            `assigned_to` BIGINT UNSIGNED NULL,
            `screenshot_path` VARCHAR(255) NULL,
            `recording_path` VARCHAR(255) NULL,
            `attachment_path` VARCHAR(255) NULL,
            `organization_id` BIGINT UNSIGNED NULL,
            `organization_name` VARCHAR(255) NULL,
            `user_id` BIGINT UNSIGNED NOT NULL,
            `user_name` VARCHAR(255) NOT NULL,
            `user_role` VARCHAR(255) NOT NULL,
            `module` VARCHAR(255) NULL,
            `current_page` VARCHAR(255) NULL,
            `submitted_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            `browser` VARCHAR(255) NULL,
            `operating_system` VARCHAR(255) NULL,
            `device_type` VARCHAR(255) NULL,
            `ip_address` VARCHAR(255) NULL,
            `app_version` VARCHAR(255) NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY (`reference_number`),
            FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON DELETE SET NULL,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
            INDEX `feedback_type` (`feedback_type`),
            INDEX `status` (`status`),
            INDEX `priority` (`priority`),
            INDEX `user_id` (`user_id`),
            INDEX `organization_id` (`organization_id`),
            INDEX `created_at` (`created_at`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'feedback_activity_logs' => "CREATE TABLE IF NOT EXISTS `feedback_activity_logs` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `feedback_id` BIGINT UNSIGNED NOT NULL,
            `user_id` BIGINT UNSIGNED NULL,
            `action` VARCHAR(255) NOT NULL,
            `details` TEXT NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            FOREIGN KEY (`feedback_id`) REFERENCES `feedback`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'feedback_notes' => "CREATE TABLE IF NOT EXISTS `feedback_notes` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `feedback_id` BIGINT UNSIGNED NOT NULL,
            `user_id` BIGINT UNSIGNED NOT NULL,
            `note` TEXT NOT NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            FOREIGN KEY (`feedback_id`) REFERENCES `feedback`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'kb_categories' => "CREATE TABLE IF NOT EXISTS `kb_categories` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `name` VARCHAR(255) NOT NULL,
            `slug` VARCHAR(255) NULL,
            `description` TEXT NULL,
            `icon` VARCHAR(255) NULL,
            `color` VARCHAR(32) NULL,
            `sort_order` INT DEFAULT 0,
            `is_active` TINYINT(1) DEFAULT 1,
            `created_by` BIGINT UNSIGNED NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'kb_favorites' => "CREATE TABLE IF NOT EXISTS `kb_favorites` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `knowledge_base_id` BIGINT UNSIGNED NOT NULL,
            `user_id` BIGINT UNSIGNED NOT NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY `kb_favorites_kb_id_user_id_unique` (`knowledge_base_id`, `user_id`),
            FOREIGN KEY (`knowledge_base_id`) REFERENCES `knowledge_bases`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'event_categories' => "CREATE TABLE IF NOT EXISTS `event_categories` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `name` VARCHAR(255) NOT NULL,
            `slug` VARCHAR(255) NULL,
            `description` TEXT NULL,
            `icon` VARCHAR(255) NULL,
            `color` VARCHAR(32) NULL,
            `sort_order` INT DEFAULT 0,
            `is_active` TINYINT(1) DEFAULT 1,
            `created_by` BIGINT UNSIGNED NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'kb_visibilities' => "CREATE TABLE IF NOT EXISTS `kb_visibilities` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `knowledge_base_id` BIGINT UNSIGNED NOT NULL,
            `user_id` BIGINT UNSIGNED NULL,
            `team_id` BIGINT UNSIGNED NULL,
            `department` VARCHAR(100) NULL,
            `role` VARCHAR(50) NULL,
            `is_visible` TINYINT(1) DEFAULT 1,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            FOREIGN KEY (`knowledge_base_id`) REFERENCES `knowledge_bases`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'event_visibilities' => "CREATE TABLE IF NOT EXISTS `event_visibilities` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `event_id` BIGINT UNSIGNED NOT NULL,
            `user_id` BIGINT UNSIGNED NULL,
            `team_id` BIGINT UNSIGNED NULL,
            `department` VARCHAR(100) NULL,
            `role` VARCHAR(50) NULL,
            `is_visible` TINYINT(1) DEFAULT 1,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'event_participants' => "CREATE TABLE IF NOT EXISTS `event_participants` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `event_id` BIGINT UNSIGNED NOT NULL,
            `user_id` BIGINT UNSIGNED NOT NULL,
            `status` VARCHAR(32) DEFAULT 'invited',
            `response_notes` TEXT NULL,
            `attended` TINYINT(1) DEFAULT 0,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY `event_participants_event_id_user_id_unique` (`event_id`, `user_id`),
            FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'kb_versions' => "CREATE TABLE IF NOT EXISTS `kb_versions` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `knowledge_base_id` BIGINT UNSIGNED NOT NULL,
            `version_number` INT DEFAULT 1,
            `title` VARCHAR(255) NOT NULL,
            `content` LONGTEXT NULL,
            `file_path` VARCHAR(255) NULL,
            `file_name` VARCHAR(255) NULL,
            `change_summary` VARCHAR(255) NULL,
            `created_by` BIGINT UNSIGNED NOT NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            FOREIGN KEY (`knowledge_base_id`) REFERENCES `knowledge_bases`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'task_followers' => "CREATE TABLE IF NOT EXISTS `task_followers` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `task_id` BIGINT UNSIGNED NOT NULL,
            `user_id` BIGINT UNSIGNED NOT NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY `task_followers_task_id_user_id_unique` (`task_id`, `user_id`),
            FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'project_followers' => "CREATE TABLE IF NOT EXISTS `project_followers` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `project_id` BIGINT UNSIGNED NOT NULL,
            `user_id` BIGINT UNSIGNED NOT NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY `project_followers_project_id_user_id_unique` (`project_id`, `user_id`),
            FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'project_user' => "CREATE TABLE IF NOT EXISTS `project_user` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `project_id` BIGINT UNSIGNED NOT NULL,
            `user_id` BIGINT UNSIGNED NOT NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY `project_user_project_id_user_id_unique` (`project_id`, `user_id`),
            FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'task_saved_views' => "CREATE TABLE IF NOT EXISTS `task_saved_views` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `user_id` BIGINT UNSIGNED NOT NULL,
            `name` VARCHAR(255) NOT NULL,
            `view_name` VARCHAR(255) NULL AFTER `name`,
            `filters` JSON NULL,
            `filter_payload` JSON NULL AFTER `filters`,
            `sort_parameters` JSON NULL AFTER `filter_payload`,
            `is_default` TINYINT(1) DEFAULT 0,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            INDEX `task_saved_views_user_id_is_default_index` (`user_id`, `is_default`),
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'saved_views' => "CREATE TABLE IF NOT EXISTS `saved_views` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `user_id` BIGINT UNSIGNED NOT NULL,
            `view_name` VARCHAR(255) NOT NULL,
            `name` VARCHAR(255) NULL,
            `filter_payload` JSON NULL,
            `filters` JSON NULL,
            `sort_parameters` JSON NULL,
            `is_default` TINYINT(1) DEFAULT 0,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            INDEX `saved_views_user_id_is_default_index` (`user_id`, `is_default`),
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'event_reminders' => "CREATE TABLE IF NOT EXISTS `event_reminders` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `event_id` BIGINT UNSIGNED NOT NULL,
            `user_id` BIGINT UNSIGNED NULL,
            `value` INT DEFAULT 15,
            `unit` VARCHAR(16) DEFAULT 'minutes',
            `is_sent` TINYINT(1) DEFAULT 0,
            `sent_at` TIMESTAMP NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            INDEX `event_reminders_event_id_is_sent_index` (`event_id`, `is_sent`),
            FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'event_attachments' => "CREATE TABLE IF NOT EXISTS `event_attachments` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `event_id` BIGINT UNSIGNED NOT NULL,
            `user_id` BIGINT UNSIGNED NULL,
            `file_name` VARCHAR(255) NOT NULL,
            `file_path` VARCHAR(1024) NOT NULL,
            `file_size` BIGINT UNSIGNED DEFAULT 0,
            `mime_type` VARCHAR(128) NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            INDEX `event_attachments_event_id_index` (`event_id`),
            FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE,
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'email_identities' => "CREATE TABLE IF NOT EXISTS `email_identities` (
            `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `normalized_email` VARCHAR(255) NOT NULL,
            `original_email` VARCHAR(255) NOT NULL,
            `user_id` BIGINT UNSIGNED NOT NULL,
            `type` VARCHAR(20) DEFAULT 'primary',
            `verified` TINYINT(1) DEFAULT 0,
            `verified_at` TIMESTAMP NULL,
            `verification_token` VARCHAR(255) NULL,
            `created_at` TIMESTAMP NULL,
            `updated_at` TIMESTAMP NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY `email_identities_normalized_email_unique` (`normalized_email`),
            INDEX `email_identities_user_id_index` (`user_id`),
            INDEX `email_identities_type_index` (`type`),
            FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'shared_resources' => [
            ['name' => 'resource_name', 'definition' => "VARCHAR(255) NULL AFTER `resource_id`"],
            ['name' => 'parent_resource_id', 'definition' => "BIGINT UNSIGNED NULL AFTER `resource_name`"],
        ],
    ];

    protected array $tableSizeFixes = [
        'project_files'       => ['column' => 'url', 'definition' => "VARCHAR(4096) NULL"],
        'deliverable_files'   => ['column' => 'url', 'definition' => "VARCHAR(4096) NULL"],
        'submission_attachments' => ['column' => 'url', 'definition' => "VARCHAR(4096) NULL"],
        'task_files'          => ['column' => 'url', 'definition' => "VARCHAR(4096) NULL"],
    ];

    public function handle(): int
    {
        $database = $this->option('database');
        $runAll = $this->option('all');

        if (!$database && !$runAll) {
            $this->error('Please specify --database=<name> or --all');
            $this->newLine();
            $this->line('Usage:');
            $this->line('  php artisan tenants:fix-columns --database=techxaro_app_one_techxaro-6');
            $this->line('  php artisan tenants:fix-columns --all');
            return Command::INVALID;
        }

        $databases = [];

        if ($database) {
            $databases[] = $database;
        } elseif ($runAll) {
            $organizations = Organization::whereIn('status', ['active', 'trial'])->get();
            foreach ($organizations as $org) {
                $databases[] = $org->database_name;
            }

            $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));
            $pdo = DB::connection(config('tenancy.master_connection', 'mysql_master'))->getPdo();

            $prefix = config('tenancy.database_prefix', 'pms_tenant_');
            $results = $pdo->query("SHOW DATABASES LIKE '{$prefix}%'")->fetchAll(\PDO::FETCH_COLUMN);
            foreach ($results as $dbName) {
                if (!in_array($dbName, $databases)) {
                    $databases[] = $dbName;
                }
            }

            $results2 = $pdo->query("SHOW DATABASES LIKE 'techxaro_%'")->fetchAll(\PDO::FETCH_COLUMN);
            foreach ($results2 as $dbName) {
                if (!in_array($dbName, $databases)) {
                    $databases[] = $dbName;
                }
            }
        }

        $this->info("Processing " . count($databases) . " tenant database(s)...");
        $this->newLine();

        $totalFixed = 0;

        foreach ($databases as $db) {
            $result = self::fixDatabaseQuiet($db);
            $totalFixed += $result['fixed'];

            $this->line("Database: <comment>{$db}</comment>");
            foreach ($result['logs'] as $log) {
                if ($log['type'] === 'info') {
                    $this->line("  <info>{$log['message']}</info>");
                } else {
                    $this->error("  {$log['message']}");
                }
            }
            $this->newLine();
        }

        $this->info("Done. Total fixes applied: {$totalFixed}");

        return Command::SUCCESS;
    }

    /**
     * Fix a tenant database quietly (no output). Returns logs + count.
     */
    public static function fixDatabaseQuiet(string $databaseName): array
    {
        $logs = [];
        $fixed = 0;

        $masterConfig = config("database.connections." . config('tenancy.master_connection', 'mysql_master'));

        $org = Organization::where('database_name', $databaseName)->first();

        config()->set('database.connections.tenant_fix', [
            'driver'    => 'mysql',
            'host'      => $org->database_host ?? $masterConfig['host'],
            'port'      => $org->database_port ?? $masterConfig['port'],
            'database'  => $databaseName,
            'username'  => $org->database_username ?? $masterConfig['username'],
            'password'  => $org->database_password ?? $masterConfig['password'] ?? '',
            'charset'   => 'utf8mb4',
            'collation' => 'utf8mb4_unicode_ci',
            'prefix'    => '',
            'prefix_indexes' => true,
            'strict'    => true,
            'engine'    => null,
        ]);

        DB::purge('tenant_fix');
        DB::reconnect('tenant_fix');

        $pdo = DB::connection('tenant_fix')->getPdo();

        $instance = new self();

        foreach ($instance->columnFixes as $table => $columns) {
            foreach ($columns as $col) {
                if (!self::tableExists($databaseName, $table)) {
                    continue;
                }
                if (isset($col['skip_if_exists']) && $col['skip_if_exists'] && self::columnExists($databaseName, $table, $col['name'])) {
                    continue;
                }
                if (!self::columnExists($databaseName, $table, $col['name'])) {
                    try {
                        $escapedTable = str_replace('`', '``', $table);
                        $escapedCol = str_replace('`', '``', $col['name']);
                        $pdo->exec("ALTER TABLE `{$escapedTable}` ADD COLUMN `{$escapedCol}` {$col['definition']}");
                        $logs[] = ['type' => 'info', 'message' => "+ Added column `{$table}`.`{$col['name']}`"];
                        $fixed++;
                    } catch (\Throwable $e) {
                        $logs[] = ['type' => 'error', 'message' => "Failed to add `{$table}`.`{$col['name']}`: {$e->getMessage()}"];
                    }
                }
            }
        }

        foreach ($instance->tableSizeFixes as $table => $colInfo) {
            if (!self::tableExists($databaseName, $table)) {
                continue;
            }
            if (!self::columnExists($databaseName, $table, $colInfo['column'])) {
                continue;
            }
            try {
                $currentLength = self::getColumnLength($databaseName, $table, $colInfo['column']);
                if ($currentLength !== false && $currentLength < 4096) {
                    $escapedTable = str_replace('`', '``', $table);
                    $escapedCol = str_replace('`', '``', $colInfo['column']);
                    $pdo->exec("ALTER TABLE `{$escapedTable}` MODIFY COLUMN `{$escapedCol}` {$colInfo['definition']}");
                    $logs[] = ['type' => 'info', 'message' => "~ Increased `{$table}`.`{$colInfo['column']}` from VARCHAR({$currentLength}) to VARCHAR(4096)"];
                    $fixed++;
                }
            } catch (\Throwable $e) {
                $logs[] = ['type' => 'error', 'message' => "Failed to resize `{$table}`.`{$colInfo['column']}`: {$e->getMessage()}"];
            }
        }

        foreach ($instance->tableCreates as $table => $sql) {
            if (!self::tableExists($databaseName, $table)) {
                try {
                    $pdo->exec($sql);
                    $logs[] = ['type' => 'info', 'message' => "+ Created table `{$table}`"];
                    $fixed++;
                } catch (\Throwable $e) {
                    $logs[] = ['type' => 'error', 'message' => "Failed to create `{$table}`: {$e->getMessage()}"];
                }
            }
        }

        if ($fixed === 0) {
            $logs[] = ['type' => 'info', 'message' => "No fixes needed"];
        }

        DB::purge('tenant_fix');

        return ['fixed' => $fixed, 'logs' => $logs];
    }

    /**
     * Programmatic call (for ProvisioningOrchestrator). Returns fixed count.
     */
    public static function fixDatabaseProgrammatic(string $databaseName): int
    {
        $result = self::fixDatabaseQuiet($databaseName);
        return $result['fixed'];
    }

    private static function columnExists(string $database, string $table, string $column): bool
    {
        $result = DB::connection('tenant_fix')
            ->select("SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?", [$database, $table, $column]);

        return $result[0]->cnt > 0;
    }

    private static function tableExists(string $database, string $table): bool
    {
        $result = DB::connection('tenant_fix')
            ->select("SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?", [$database, $table]);

        return $result[0]->cnt > 0;
    }

    private static function getColumnLength(string $database, string $table, string $column): int|false
    {
        $result = DB::connection('tenant_fix')
            ->select("SELECT CHARACTER_MAXIMUM_LENGTH as len FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?", [$database, $table, $column]);

        return isset($result[0]) ? (int) $result[0]->len : false;
    }
}
