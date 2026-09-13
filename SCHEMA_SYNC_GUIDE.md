# Tenant Database Schema Sync - Developer Guide

## Tumhara Kaam Kya Hai?

Tum ne naye database files (migrations, columns, tables) add kiye hain. Ab tumhe ensure karna hai ke:
1. **Existing orgs** ko wo naye tables/columns mil jayein
2. **New orgs** ko automatically sab kuch mile provisioning ke waqt
3. **Tumhara code** baaki developers ke code se match kare

## System Kaise Kaam Karta Hai

### 3-Layer Defense (Sab kuch cover karta hai)

```
Layer 1: Laravel Migrations (php artisan migrate)
    ↓ Agar fail ho jaye toh
Layer 2: FixTenantColumns (php artisan tenants:fix-columns --all)
    ↓ Agar kuch chhoot jaye toh
Layer 3: Schema Sync (php artisan tenants:sync-schema --all)
    ↓ Golden schema se compare karta hai aur missing sab add karta hai
```

### Golden Schema Kahan Se Aata Hai?

- `SchemaReferenceService.php` ek **healthy tenant DB** se schema padhta hai
- `INFORMATION_SCHEMA` se tables aur columns ka pata lagata hai
- Phir har tenant DB ke saath **compare** karta hai
- Missing tables → CREATE TABLE
- Missing columns → ALTER TABLE ADD COLUMN

## Tumhein Kya Karna Hai?

### Step 1: Apni Migration File Check Karo

Agar tum naya column add kar rahe ho, toh **FixTenantColumns.php** mein bhi add karo:

```php
// app/Console/Commands/FixTenantColumns.php
// $columnFixes array mein:

'tasks' => [
    // ... existing columns ...
    ['name' => 'tumhara_naya_column', 'definition' => "VARCHAR(255) NULL AFTER `existing_column`"],
],
```

**Ye safety net hai.** Agar migration fail bhi ho jaye, FixTenantColumns add kar dega.

### Step 2: Migration File mein Schema::hasColumn() Lagao

```php
public function up(): void
{
    if (Schema::hasColumn('tasks', 'tumhara_naya_column')) {
        return; // Already exists, skip
    }

    Schema::table('tasks', function (Blueprint $table) {
        $table->string('tumhara_naya_column')->nullable()->after('existing_column');
    });
}
```

### Step 3: CPanel Pe Commands Chalao

```bash
cd app.one.techxaro.com/api

# Step A: Migrations run karo
php artisan migrate --force

# Step B: FixTenantColumns (safety net)
php artisan tenants:fix-columns --all

# Step C: Schema Sync (final check)
php artisan tenants:sync-schema --all --force
```

**Ye 3 commands har deployment ke baad chalao.**

## Important Files

| File | Kya Karta Hai |
|------|---------------|
| `app/Services/Saas/SchemaReferenceService.php` | Golden schema padhta hai healthy DB se |
| `app/Console/Commands/SyncTenantSchema.php` | `tenants:sync-schema` command |
| `app/Console/Commands/FixTenantColumns.php` | Missing columns add karta hai |
| `app/Services/Saas/DatabaseProvisionService.php` | New org provisioning + schema sync |
| `app/Listeners/AfterMigrationListener.php` | `php artisan migrate` ke baad auto sync |

## Common Issues

### "Column not found" error aaye toh:
1. `php artisan tenants:fix-columns --all` chalao
2. Phir `php artisan tenants:sync-schema --all --force` chalao
3. Agar phir bhi aaye toh column name check karo FixTenantColumns.php mein

### "Table doesn't exist" error aaye toh:
1. Schema sync automatically CREATE TABLE karega
2. Agar broken table hai toh drop + recreate karega

### New migration add ki hai toh:
1. Migration file deploy karo
2. FixTenantColumns.php mein column add karo
3. CPanel pe commands chalao

## Rule: Kabhi Bhi Manual SQL Mat Chalao

**Hamesha commands use karo:**
- `php artisan tenants:fix-columns --all`
- `php artisan tenants:sync-schema --all --force`

Ye commands automatically sab kuch handle karte hain.

## Deployment Checklist

```
□ Migration file deploy ki
□ FixTenantColumns.php mein column add kiya
□ CPanel pe php artisan migrate --force chalaya
□ CPanel pe php artisan tenants:fix-columns --all chalaya
□ CPanel pe php artisan tenants:sync-schema --all --force chalaya
□ Verify: koi error nahi aana chahiye
```
