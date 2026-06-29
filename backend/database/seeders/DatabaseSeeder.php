<?php

/**
 * DatabaseSeeder - Main database seeder for the PMS application.
 *
 * This file is responsible for seeding the initial user accounts required
 * for development and testing. It uses Laravel's model factory to create
 * a default admin and member user with pre-defined credentials.
 *
 * Run via: php artisan db:seed
 */

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database with default users.
     *
     * Creates two users:
     * - Admin user (admin@example.com) with admin role
     * - Member user (member@example.com) with member role
     *
     * @return void
     */
    public function run(): void
    {
        // Create the default admin user for system administration
        User::factory()->create([
            'name' => 'Admin',
            'email' => 'admin@example.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);

        // Create a test member user for regular project operations
        User::factory()->create([
            'name' => 'Test Member',
            'email' => 'member@example.com',
            'password' => bcrypt('password'),
            'role' => 'member',
        ]);
    }
}
