# Tenant Database Migration & Column Management Guide

## Problem Statement

When creating a new tenant organization, the system runs 100+ database migrations. Previously, if ONE migration failed (e.g., deprecated `getDoctrineSchemaManager()`), Laravel would stop and ALL subsequent migrations would be skipped. This caused missing columns (like `email_verification_exempt`, `kb_ids`, `event_ids`) leading to SQL errors when creating tasks, projects, or users.

## Architecture Overview

```
New Org Created
    │
    ▼
ProvisioningOrchestrator::provision()
    │
    ├── Step 1: Create Organization Record (master DB)
    ├── Step 2: Create Database (cPanel API or raw SQL)
    ├── Step 3: Run Migrations (RobustTenantMigrationRunner) ← INDIVIDUAL per-migration
    ├── Step 3b: FixTenantColumns (safety net for missing columns)
    ├── Step 4: Run Seeders
    ├── Step 5: Create Admin User
    ├── Step 6: Register Domain
    └── Step 7: Assign Plan
```

## Key Files Changed

| File | Purpose |
|------|---------|
| `app/Services/Saas/RobustTenantMigrationRunner.php` | **NEW** - Runs each migration individually with try/catch so one failure doesn't block others |
| `app/Services/Saas/DatabaseProvisionService.php` | Uses RobustTenantMigrationRunner instead of `artisan migrate` |
| `app/Services/Saas/Provisioning/ProvisioningOrchestrator.php` | Wraps migration step in try/catch, always runs FixTenantColumns as safety net |
| `app/Console/Commands/FixTenantColumns.php` | Has all missing columns listed (users, tasks, deliverables, projects, etc.) |
| `app/Models/User.php` | Boot method gracefully handles missing `email_verification_exempt` column |
| `database/migrations/2026_09_03_000001_...php` | Fixed deprecated `getDoctrineSchemaManager()` call |
| `database/migrations/2026_09_04_051726_...php` | Adds `email_verification_exempt` column to users table |

## How It Works Now

### For New Organizations (Automatic - No Manual Commands)

When a new org is created through the provisioning flow:

1. **RobustTenantMigrationRunner** scans all migration files
2. Runs each migration **individually** in a try/catch block
3. If migration #50 fails, migrations #51-#100 **still run**
4. After all migrations, **FixTenantColumns** runs as safety net
5. FixTenantColumns checks every column in `$columnFixes` array
6. Any missing column gets added automatically

**Result: Zero manual intervention needed for new orgs.**

### For Existing Organizations (One-Time Manual Fix)

Run these two commands on cPanel SSH terminal:

```bash
cd app.one.techxaro.com/api
php artisan tenants:fix-columns --all
```

This scans ALL tenant databases (`pms_tenant_*` + `techxaro_*`) and adds any missing columns.

## Rules for Developers Creating New Migrations

### Rule 1: Always Use `Schema::hasColumn()` Guard

Every migration that adds a column MUST check if it already exists:

```php
public function up(): void
{
    if (Schema::hasColumn('users', 'my_new_column')) {
        return; // Already exists, skip
    }

    Schema::table('users', function (Blueprint $table) {
        $table->string('my_new_column')->nullable()->after('existing_column');
    });
}
```

### Rule 2: Never Use Deprecated Methods

Do NOT use these in migrations:
- `Schema::getDoctrineSchemaManager()` (removed in Laravel 12)
- `Schema::getColumnType()` (unreliable across MySQL/MariaDB versions)
- `DB::getDoctrineSchemaManager()` (same as above)

Instead, use `INFORMATION_SCHEMA` queries or `Schema::hasColumn()`.

### Rule 3: Every Column Must Be in FixTenantColumns

After creating a migration, add the column to `app/Console/Commands/FixTenantColumns.php` in the `$columnFixes` array:

```php
'tasks' => [
    // ... existing columns ...
    ['name' => 'my_new_column', 'definition' => "VARCHAR(255) NULL AFTER `existing_column`"],
],
```

This is the **safety net**. Even if the migration fails, FixTenantColumns will add the column.

### Rule 4: Test Migration on Fresh Database

Before deploying, test on a fresh database:

```bash
php artisan tenants:fix-columns --database=your_test_database
php artisan migrate --path=database/migrations/your_new_migration.php --force
```

### Rule 5: Never Block Other Migrations

If your migration has complex logic that might fail, wrap it in try/catch:

```php
public function up(): void
{
    try {
        // Complex operation
        Schema::table('users', function (Blueprint $table) {
            $table->foreign('my_column')->references('id')->on('other_table');
        });
    } catch (\Throwable $e) {
        // Log and continue - don't block other migrations
        \Log::warning("Migration partial failure: " . $e->getMessage());
    }
}
```

## Commands Reference

### For New Orgs (Automatic)
No commands needed. Provisioning handles everything.

### For Existing Orgs (One-Time Fix)
```bash
# Fix all tenant databases
php artisan tenants:fix-columns --all

# Fix specific database
php artisan tenants:fix-columns --database=techxaro_app_one_pra
```

### For Manual Migration (if needed)
```bash
# Run all pending migrations
php artisan migrate --force

# Run specific migration
php artisan migrate --path=database/migrations/2026_09_04_051726_add_email_verification_exempt_to_users_table.php --force
```

### Check Migration Status
```bash
php artisan migrate:status
```

## Troubleshooting

### "Column not found" Error
1. Run: `php artisan tenants:fix-columns --all`
2. If still failing, check if column is in `FixTenantColumns.php` `$columnFixes`
3. Add it if missing, re-deploy, re-run fix command

### Migration Fails with "Method does not exist"
1. Check for deprecated Laravel methods (getDoctrineSchemaManager, etc.)
2. Replace with INFORMATION_SCHEMA queries
3. Deploy fix, re-run migration

### cPanel Database Connection Fails
1. Verify Organization record exists in `saas_master` database
2. Check `database_host`, `database_username`, `database_password` in organizations table
3. Ensure cPanel MySQL user has access to the tenant database

## File Upload Checklist for cPanel

When deploying changes, upload these files:

```
app/Console/Commands/FixTenantColumns.php
app/Models/User.php
app/Services/Saas/DatabaseProvisionService.php
app/Services/Saas/RobustTenantMigrationRunner.php (NEW)
app/Services/Saas/Provisioning/ProvisioningOrchestrator.php
database/migrations/2026_09_03_000001_change_projects_created_by_to_set_null.php
database/migrations/2026_09_04_051726_add_email_verification_exempt_to_users_table.php (NEW)
```

After upload, run on cPanel:
```bash
php artisan tenants:fix-columns --all
```
