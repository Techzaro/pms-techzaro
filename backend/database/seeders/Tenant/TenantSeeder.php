<?php

namespace Database\Seeders\Tenant;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/**
 * TenantSeeder.
 *
 * Seeds the initial data required for a new tenant database.
 * This seeder runs on the TENANT database, not the master.
 *
 * Seed data:
 * - Default admin user (the organization administrator)
 * - Default settings (if any table exists)
 */
class TenantSeeder extends Seeder
{
    protected string $adminName;
    protected string $adminEmail;
    protected string $adminPassword;

    public function __construct(
        string $adminName = 'Administrator',
        string $adminEmail = 'admin@example.com',
        string $adminPassword = 'password',
    ) {
        $this->adminName = $adminName;
        $this->adminEmail = $adminEmail;
        $this->adminPassword = $adminPassword;
    }

    public function run(): void
    {
        $this->createAdminUser();
    }

    protected function createAdminUser(): void
    {
        // Check if admin already exists (idempotent)
        $exists = User::where('email', $this->adminEmail)->exists();

        if (!$exists) {
            User::create([
                'name'     => $this->adminName,
                'email'    => $this->adminEmail,
                'password' => Hash::make($this->adminPassword),
                'role'     => 'admin',
                'active'   => true,
            ]);
        }
    }
}
