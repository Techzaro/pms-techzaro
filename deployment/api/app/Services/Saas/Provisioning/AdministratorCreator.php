<?php

namespace App\Services\Saas\Provisioning;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;

/**
 * AdministratorCreator.
 *
 * Creates the initial administrator user inside the tenant database.
 * The admin is stored in the tenant's isolated database, not the master.
 */
class AdministratorCreator
{
    protected string $masterConnection;

    public function __construct()
    {
        $this->masterConnection = config('tenancy.master_connection', 'mysql_master');
    }

    /**
     * Create an administrator user in the tenant database.
     *
     * @param string $databaseName The tenant database name.
     * @param string $name Admin user's full name.
     * @param string $email Admin user's email.
     * @param string $password Admin user's password (plain text, will be hashed).
     *
     * @return User The created admin user.
     * @throws \RuntimeException If creation fails.
     */
    public function create(
        string $databaseName,
        string $name,
        string $email,
        string $password,
    ): User {
        Log::info("Creating administrator user in database: {$databaseName} (email: {$email})");

        $masterConfig = config("database.connections.{$this->masterConnection}");

        // Configure a temporary connection to the tenant database
        config()->set('database.connections.tenant_admin', [
            'driver'    => 'mysql',
            'host'      => $masterConfig['host'],
            'port'      => $masterConfig['port'],
            'database'  => $databaseName,
            'username'  => $masterConfig['username'],
            'password'  => $masterConfig['password'] ?? '',
            'charset'   => 'utf8mb4',
            'collation' => 'utf8mb4_unicode_ci',
            'prefix'    => '',
            'prefix_indexes' => true,
            'strict'    => true,
            'engine'    => null,
        ]);

        // Check if admin already exists
        $exists = DB::connection('tenant_admin')
            ->table('users')
            ->where('email', $email)
            ->exists();

        if ($exists) {
            Log::info("Administrator user already exists in database: {$databaseName}");
            return DB::connection('tenant_admin')
                ->table('users')
                ->where('email', $email)
                ->first();
        }

        // Create the admin user
        $userId = DB::connection('tenant_admin')->table('users')->insertGetId([
            'name'              => $name,
            'email'             => $email,
            'password'          => Hash::make($password),
            'role'              => 'admin',
            'active'            => true,
            'must_change_password' => true,
            'created_at'        => now(),
            'updated_at'        => now(),
        ]);

        Log::info("Administrator user created (ID: {$userId}) in database: {$databaseName}");

        return DB::connection('tenant_admin')
            ->table('users')
            ->where('id', $userId)
            ->first();
    }
}
