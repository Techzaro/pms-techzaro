<?php

namespace App\Services\Saas\Provisioning;

use App\Models\Master\Organization;
use App\Services\Saas\DatabaseProvisionService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * DatabaseCreator.
 *
 * Dedicated service responsible ONLY for tenant database creation:
 * - Validate database name
 * - Create tenant database
 * - Verify database creation
 * - Handle duplicate database names
 * - Handle rollback on failure (drop database)
 */
class DatabaseCreator
{
    protected string $masterConnection;

    public function __construct(
        protected DatabaseProvisionService $db,
    ) {
        $this->masterConnection = config('tenancy.master_connection', 'mysql_master');
    }

    /**
     * Create a new tenant database.
     *
     * @throws \RuntimeException If the database name is invalid or already exists.
     */
    public function create(string $databaseName): void
    {
        $this->validateDatabaseName($databaseName);
        $this->checkNotExists($databaseName);

        Log::info("Creating tenant database: {$databaseName}");

        $this->db->createDatabase($databaseName);

        $this->verifyExists($databaseName);

        Log::info("Tenant database created successfully: {$databaseName}");
    }

    /**
     * Drop a tenant database (used for rollback).
     */
    public function drop(string $databaseName): void
    {
        Log::info("Rolling back tenant database: {$databaseName}");

        $this->db->dropDatabase($databaseName);

        Log::info("Tenant database dropped: {$databaseName}");
    }

    /**
     * Validate the database name format.
     *
     * @throws \RuntimeException If the name is invalid.
     */
    protected function validateDatabaseName(string $name): void
    {
        if (empty($name)) {
            throw new \RuntimeException('Database name cannot be empty.');
        }

        if (strlen($name) > 64) {
            throw new \RuntimeException('Database name cannot exceed 64 characters.');
        }

        if (!preg_match('/^[a-zA-Z0-9_]+$/', $name)) {
            throw new \RuntimeException("Database name '{$name}' contains invalid characters. Only alphanumeric and underscores are allowed.");
        }
    }

    /**
     * Check that the database doesn't already exist.
     *
     * @throws \RuntimeException If the database already exists.
     */
    protected function checkNotExists(string $name): void
    {
        $pdo = DB::connection($this->masterConnection)->getPdo();
        $stmt = $pdo->prepare("SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?");
        $stmt->execute([$name]);

        if ($stmt->fetch()) {
            throw new \RuntimeException("Database '{$name}' already exists.");
        }
    }

    /**
     * Verify the database was actually created.
     *
     * @throws \RuntimeException If verification fails.
     */
    protected function verifyExists(string $name): void
    {
        $pdo = DB::connection($this->masterConnection)->getPdo();
        $stmt = $pdo->prepare("SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?");
        $stmt->execute([$name]);

        if (!$stmt->fetch()) {
            throw new \RuntimeException("Database '{$name}' was created but verification failed. The database does not exist.");
        }
    }
}
