<?php

require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$master = DB::connection('mysql_master');

$master->statement('SET FOREIGN_KEY_CHECKS=0');

$tables = ['plan_modules','organization_subscription_history','organization_trial_settings','organization_subscriptions','organization_domains','organization_plans','saas_modules','activity_logs','tenant_lifecycle_logs','tenant_backups','organizations'];
foreach ($tables as $t) {
    $master->statement("DROP TABLE IF EXISTS `$t`");
}

$master->statement("CREATE TABLE `organizations` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(255) NOT NULL UNIQUE,
  `type` VARCHAR(50) DEFAULT 'owner',
  `database_name` VARCHAR(100),
  `database_host` VARCHAR(255) DEFAULT '127.0.0.1',
  `database_port` INT DEFAULT 3306,
  `database_username` VARCHAR(255),
  `database_password` VARCHAR(255) NULL,
  `status` VARCHAR(50) DEFAULT 'active',
  `timezone` VARCHAR(50) DEFAULT 'UTC',
  `email_policy` VARCHAR(50) DEFAULT 'standard',
  `logo_path` VARCHAR(500) NULL,
  `settings` JSON NULL,
  `trial_ends_at` TIMESTAMP NULL,
  `suspended_at` TIMESTAMP NULL,
  `deleted_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

$master->statement("CREATE TABLE `organization_plans` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `slug` VARCHAR(100) NOT NULL UNIQUE,
  `description` VARCHAR(500) NULL,
  `price_monthly` FLOAT DEFAULT 0,
  `price_yearly` FLOAT DEFAULT 0,
  `max_users` INT DEFAULT -1,
  `max_projects` INT DEFAULT -1,
  `max_storage_gb` INT DEFAULT 10,
  `trial_duration` INT DEFAULT 14,
  `trial_duration_unit` VARCHAR(20) DEFAULT 'days',
  `is_active` TINYINT(1) DEFAULT 1,
  `is_default` TINYINT(1) DEFAULT 0,
  `sort_order` INT DEFAULT 0,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

$master->statement("CREATE TABLE `saas_modules` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(255) NOT NULL UNIQUE,
  `description` TEXT NULL,
  `category` VARCHAR(100) DEFAULT 'general',
  `is_active` TINYINT(1) DEFAULT 1,
  `is_default` TINYINT(1) DEFAULT 0,
  `sort_order` INT DEFAULT 0,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

$master->statement("CREATE TABLE `plan_modules` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `plan_id` BIGINT UNSIGNED NOT NULL,
  `module_id` BIGINT UNSIGNED NOT NULL,
  `is_enabled` TINYINT(1) DEFAULT 1,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

$master->statement("CREATE TABLE `organization_domains` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `organization_id` BIGINT UNSIGNED NOT NULL,
  `domain` VARCHAR(255) NOT NULL,
  `is_primary` TINYINT(1) DEFAULT 1,
  `is_verified` TINYINT(1) DEFAULT 0,
  `verified_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

$master->statement("CREATE TABLE `organization_subscriptions` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `organization_id` BIGINT UNSIGNED NOT NULL,
  `plan_id` BIGINT UNSIGNED NOT NULL,
  `billing_period` VARCHAR(20) DEFAULT 'monthly',
  `status` VARCHAR(50) DEFAULT 'active',
  `amount` FLOAT DEFAULT 0,
  `currency` VARCHAR(10) DEFAULT 'USD',
  `is_custom` TINYINT(1) DEFAULT 0,
  `custom_price_monthly` FLOAT NULL,
  `custom_price_yearly` FLOAT NULL,
  `custom_max_users` INT NULL,
  `custom_max_projects` INT NULL,
  `custom_max_storage_gb` INT NULL,
  `starts_at` TIMESTAMP NULL,
  `ends_at` TIMESTAMP NULL,
  `cancelled_at` TIMESTAMP NULL,
  `trial_ends_at` TIMESTAMP NULL,
  `metadata` JSON NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

$master->statement("CREATE TABLE `organization_subscription_history` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `organization_id` BIGINT UNSIGNED NOT NULL,
  `plan_id` BIGINT UNSIGNED NOT NULL,
  `previous_plan_id` BIGINT UNSIGNED NULL,
  `event_type` VARCHAR(50) NOT NULL,
  `status` VARCHAR(50),
  `billing_period` VARCHAR(20),
  `amount` FLOAT DEFAULT 0,
  `started_at` TIMESTAMP NULL,
  `ended_at` TIMESTAMP NULL,
  `changed_by` VARCHAR(255) DEFAULT 'System',
  `metadata` JSON NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

$master->statement("CREATE TABLE `organization_trial_settings` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `organization_id` BIGINT UNSIGNED NOT NULL,
  `trial_duration` INT DEFAULT 14,
  `trial_duration_unit` VARCHAR(20) DEFAULT 'days',
  `max_users` INT DEFAULT 5,
  `max_projects` INT DEFAULT 3,
  `max_storage_gb` INT DEFAULT 1,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

$master->statement("CREATE TABLE `activity_logs` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user` VARCHAR(255),
  `action` VARCHAR(255),
  `target` VARCHAR(255),
  `ip` VARCHAR(45) NULL,
  `status` VARCHAR(50),
  `details` TEXT NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

$master->statement("INSERT INTO `organizations` (`name`, `slug`, `status`, `type`, `database_name`, `database_host`, `database_port`, `database_username`, `database_password`, `timezone`, `email_policy`, `settings`, `created_at`, `updated_at`) VALUES ('TechXaro', 'techxaro', 'active', 'owner', 'techxaro_pmsv2_staging', '127.0.0.1', 3306, 'techxaro_pmsv2_staging', 'techxaro_pmsv2_staging', 'Asia/Karachi', 'standard', '{\"subtitle\":\"PMS Portal\",\"org_name\":\"TechXaro\"}', NOW(), NOW())");

$master->statement("INSERT INTO `organization_plans` (`name`, `slug`, `description`, `price_monthly`, `price_yearly`, `max_users`, `max_projects`, `max_storage_gb`, `trial_duration`, `trial_duration_unit`, `is_active`, `is_default`, `sort_order`, `created_at`, `updated_at`) VALUES ('Trial', 'trial', 'Free trial plan', 0, 0, 5, 3, 1, 14, 'days', 1, 1, 1, NOW(), NOW()), ('Basic', 'basic', 'Basic plan', 9.99, 99.9, 10, 10, 5, 0, 'days', 1, 0, 2, NOW(), NOW()), ('Enterprise', 'enterprise', 'Enterprise plan', 49.99, 499.9, -1, -1, 50, 0, 'days', 1, 0, 3, NOW(), NOW())");

$master->statement("INSERT INTO `saas_modules` (`name`, `slug`, `description`, `category`, `is_active`, `is_default`, `sort_order`, `created_at`, `updated_at`) VALUES ('Projects', 'projects', 'Project management', 'core', 1, 1, 1, NOW(), NOW()), ('Tasks', 'tasks', 'Task management', 'core', 1, 1, 2, NOW(), NOW()), ('Teams', 'teams', 'Team management', 'core', 1, 1, 3, NOW(), NOW()), ('Reports', 'reports', 'Reporting and analytics', 'analytics', 1, 0, 4, NOW(), NOW()), ('Time Tracking', 'time-tracking', 'Time tracking', 'productivity', 1, 0, 5, NOW(), NOW())");

$master->statement('SET FOREIGN_KEY_CHECKS=1');

echo "All master tables created successfully!\n";
