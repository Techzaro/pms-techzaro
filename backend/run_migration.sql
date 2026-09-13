CREATE TABLE IF NOT EXISTS `shared_project_members` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `shared_resource_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `organization_id` BIGINT UNSIGNED NOT NULL,
  `added_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NULL,
  `updated_at` TIMESTAMP NULL,
  UNIQUE KEY `unique_member` (`shared_resource_id`, `user_id`, `organization_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
