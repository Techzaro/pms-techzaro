-- Add custom plan override columns to organization_subscriptions
-- Run this on existing master databases to add per-org plan customization support

ALTER TABLE `organization_subscriptions`
  ADD COLUMN `is_custom` TINYINT(1) DEFAULT 0 AFTER `currency`,
  ADD COLUMN `custom_price_monthly` FLOAT NULL AFTER `is_custom`,
  ADD COLUMN `custom_price_yearly` FLOAT NULL AFTER `custom_price_monthly`,
  ADD COLUMN `custom_max_users` INT NULL AFTER `custom_price_yearly`,
  ADD COLUMN `custom_max_projects` INT NULL AFTER `custom_max_users`,
  ADD COLUMN `custom_max_storage_gb` INT NULL AFTER `custom_max_projects`;
