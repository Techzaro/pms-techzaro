<?php

namespace App\Services\Saas;

use App\Models\Master\Organization;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * SchemaReferenceService.
 *
 * Generates the "golden schema" by reading from an existing healthy tenant
 * database (fast) or parsing tenant-schema.sql + migration files (fallback).
 *
 * This is the single source of truth for what every tenant database SHOULD look like.
 */
class SchemaReferenceService
{
    protected string $cacheKey = 'tenant_schema_reference';
    protected int $cacheTtl = 300; // 5 minutes

    /**
     * Get the golden schema (all tables + columns).
     *
     * Returns array: [tableName => [colName => {type, nullable, default, key, extra}]]
     */
    public function getGoldenSchema(): array
    {
        return Cache::remember($this->cacheKey, $this->cacheTtl, function () {
            return $this->buildSchema();
        });
    }

    /**
     * Force rebuild the cached schema.
     */
    public function rebuildReference(): array
    {
        Cache::forget($this->cacheKey);
        return $this->getGoldenSchema();
    }

    /**
     * Build the golden schema.
     *
     * Strategy: Read from an existing healthy tenant database (fastest).
     * If none available, parse tenant-schema.sql + migration files.
     */
    protected function buildSchema(): array
    {
        // Strategy 1: Read from an existing healthy tenant DB (fast)
        $schema = $this->readFromHealthyTenant();

        if (!empty($schema)) {
            Log::info("SchemaReference: Built golden schema from existing tenant (" . count($schema) . " tables)");
            return $schema;
        }

        // Strategy 2: Parse tenant-schema.sql (fallback)
        $schema = $this->parseSchemaSql();

        if (!empty($schema)) {
            Log::info("SchemaReference: Built golden schema from tenant-schema.sql (" . count($schema) . " tables)");
            return $schema;
        }

        Log::warning("SchemaReference: Could not build golden schema — no tenant DBs or schema file found");
        return [];
    }

    /**
     * Read schema from an existing healthy tenant database.
     */
    protected function readFromHealthyTenant(): array
    {
        // Find a registered org with a working database
        $orgs = Organization::where('status', '!=', 'deleted')
            ->whereNotNull('database_name')
            ->orderBy('id', 'desc')
            ->get();

        $masterConfig = config('database.connections.' . config('tenancy.master_connection', 'mysql_master'));

        foreach ($orgs as $org) {
            $host = $org->database_host ?? $masterConfig['host'];
            $port = (int) ($org->database_port ?? $masterConfig['port']);
            $username = $org->database_username ?? $masterConfig['username'];
            $password = $org->database_password ?? $masterConfig['password'] ?? '';
            $dbName = $org->database_name;

            try {
                $dsn = sprintf('mysql:host=%s;port=%d;charset=utf8mb4', $host, $port);
                $pdo = new \PDO($dsn, $username, $password, [
                    \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
                    \PDO::ATTR_TIMEOUT => 5,
                ]);

                $schema = $this->captureSchema($pdo, $dbName);

                // Validate: must have at least 20 tables to be considered "healthy"
                if (count($schema) >= 20) {
                    return $schema;
                }
            } catch (\Throwable $e) {
                continue;
            }
        }

        // Also try unregistered local tenant databases (pms_tenant_* and techxaro_*)
        $prefix = config('tenancy.database_prefix', 'pms_tenant_');
        try {
            $dsn = sprintf('mysql:host=%s;port=%d;charset=utf8mb4', $masterConfig['host'], $masterConfig['port']);
            $pdo = new \PDO($dsn, $masterConfig['username'], $masterConfig['password'] ?? '', [
                \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
                \PDO::ATTR_TIMEOUT => 5,
            ]);

            // Scan pms_tenant_* databases
            $stmt = $pdo->query("SHOW DATABASES LIKE '{$prefix}%'");
            $localDbs = $stmt->fetchAll(\PDO::FETCH_COLUMN);

            // Also scan techxaro_* databases
            $stmt2 = $pdo->query("SHOW DATABASES LIKE 'techxaro_%'");
            $techxaroDbs = $stmt2->fetchAll(\PDO::FETCH_COLUMN);

            $localDbs = array_merge($localDbs, $techxaroDbs);

            foreach ($localDbs as $dbName) {
                try {
                    $schema = $this->captureSchema($pdo, $dbName);
                    if (count($schema) >= 20) {
                        return $schema;
                    }
                } catch (\Throwable $e) {
                    continue;
                }
            }
        } catch (\Throwable $e) {
            // skip
        }

        return [];
    }

    /**
     * Parse tenant-schema.sql to build schema structure.
     */
    protected function parseSchemaSql(): array
    {
        $schemaPath = database_path('tenant-schema.sql');
        if (!file_exists($schemaPath)) {
            return [];
        }

        $sql = file_get_contents($schemaPath);
        if ($sql === false) {
            return [];
        }

        // Strip BOM
        if (str_starts_with($sql, "\xEF\xBB\xBF")) {
            $sql = substr($sql, 3);
        }

        $schema = [];

        // Parse CREATE TABLE statements
        preg_match_all('/CREATE TABLE IF NOT EXISTS `(\w+)`\s*\((.*?)\)\s*ENGINE=/is', $sql, $matches, PREG_SET_ORDER);

        foreach ($matches as $match) {
            $tableName = $match[1];
            $body = $match[2];

            $columns = [];
            $lines = explode("\n", $body);

            foreach ($lines as $line) {
                $line = trim($line, " \t\r\n,");
                if (empty($line) || strtoupper(substr($line, 0, 7)) === 'PRIMARY' ||
                    strtoupper(substr($line, 0, 4)) === 'KEY ' ||
                    strtoupper(substr($line, 0, 6)) === 'UNIQUE' ||
                    strtoupper(substr($line, 0, 9)) === 'CONSTRAINT' ||
                    strtoupper(substr($line, 0, 7)) === 'INDEX ') {
                    continue;
                }

                // Match column definition: `col_name` type ...
                if (preg_match('/^`(\w+)`\s+(.+)/', $line, $colMatch)) {
                    $colName = $colMatch[1];
                    $colDef = trim($colMatch[2], " ,");

                    // Extract type (everything before NULL/NOT NULL/DEFAULT/PRIMARY/AUTO_INCREMENT)
                    preg_match('/^(\w[\w\s\(\),]*)/', $colDef, $typeMatch);
                    $type = $typeMatch[1] ?? $colDef;
                    $type = rtrim($type, ' ');

                    $nullable = stripos($colDef, 'NOT NULL') === false;
                    $isAuto = stripos($colDef, 'AUTO_INCREMENT') !== false;
                    $default = null;

                    if (preg_match('/DEFAULT\s+(\S+)/i', $colDef, $defMatch)) {
                        $default = trim($defMatch[1], "'");
                    }

                    $columns[$colName] = [
                        'type'     => $type,
                        'nullable' => $nullable,
                        'default'  => $default,
                        'key'      => '',
                        'extra'    => $isAuto ? 'auto_increment' : '',
                    ];
                }
            }

            if (!empty($columns)) {
                $schema[$tableName] = $columns;
            }
        }

        return $schema;
    }

    /**
     * Capture full schema from a database via INFORMATION_SCHEMA.
     */
    protected function captureSchema(\PDO $pdo, string $dbName): array
    {
        $stmt = $pdo->query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '{$dbName}' AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME");
        $tables = $stmt->fetchAll(\PDO::FETCH_COLUMN);

        $schema = [];

        foreach ($tables as $tableName) {
            $colStmt = $pdo->prepare("
                SELECT
                    COLUMN_NAME,
                    COLUMN_TYPE,
                    IS_NULLABLE,
                    COLUMN_DEFAULT,
                    COLUMN_KEY,
                    EXTRA
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
                ORDER BY ORDINAL_POSITION
            ");
            $colStmt->execute([$dbName, $tableName]);
            $columns = $colStmt->fetchAll(\PDO::FETCH_ASSOC);

            $schema[$tableName] = [];
            foreach ($columns as $col) {
                // Clean MySQL 8+ EXTRA: strip "DEFAULT_GENERATED" prefix
                $extra = $col['EXTRA'] ?? '';
                $extra = str_ireplace('DEFAULT_GENERATED', '', $extra);
                $extra = trim($extra);

                $schema[$tableName][$col['COLUMN_NAME']] = [
                    'type'     => $col['COLUMN_TYPE'],
                    'nullable' => $col['IS_NULLABLE'] === 'YES',
                    'default'  => $col['COLUMN_DEFAULT'],
                    'key'      => $col['COLUMN_KEY'],
                    'extra'    => $extra,
                ];
            }
        }

        return $schema;
    }

    /**
     * Build a CREATE TABLE SQL from the golden schema for a specific table.
     */
    public function buildCreateTableSql(string $tableName): ?string
    {
        $schema = $this->getGoldenSchema();

        if (!isset($schema[$tableName])) {
            return null;
        }

        $columns = $schema[$tableName];
        $colLines = [];
        $primaryKeys = [];
        $uniqueKeys = [];

        foreach ($columns as $colName => $colInfo) {
            $line = "`{$colName}` " . $this->buildColumnDefinition($colInfo);
            $colLines[] = $line;

            if ($colInfo['key'] === 'PRI') {
                $primaryKeys[] = "`{$colName}`";
            }
            if ($colInfo['key'] === 'UNI') {
                $uniqueKeys[] = "`{$colName}`";
            }
        }

        // Add PRIMARY KEY after all columns
        if (!empty($primaryKeys)) {
            $colLines[] = "PRIMARY KEY (" . implode(', ', $primaryKeys) . ")";
        }

        // Add UNIQUE KEYs after all columns (not inline)
        foreach ($uniqueKeys as $i => $uk) {
            $colLines[] = "UNIQUE KEY `{$tableName}_uk{$i}` ({$uk})";
        }

        $body = implode(",\n    ", $colLines);

        return "CREATE TABLE IF NOT EXISTS `{$tableName}` (\n    {$body}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
    }

    /**
     * Build a column definition string for CREATE/ALTER TABLE.
     */
    public function buildColumnDefinition(array $colInfo): string
    {
        $type = $colInfo['type'];
        $parts = [$type];

        if ($colInfo['nullable']) {
            $parts[] = 'NULL';
        } else {
            $parts[] = 'NOT NULL';
        }

        if ($colInfo['default'] !== null && $colInfo['default'] !== '') {
            $default = $colInfo['default'];
            $typeLower = strtolower($colInfo['type']);
            $isTimestampType = str_contains($typeLower, 'timestamp') || str_contains($typeLower, 'datetime');

            // Function defaults — use CURRENT_TIMESTAMP for timestamp/datetime only
            $functionDefaults = ['current_timestamp', 'current_date', 'now()'];
            $isFunction = false;
            foreach ($functionDefaults as $fn) {
                if (stripos($default, $fn) !== false) {
                    $isFunction = true;
                    break;
                }
            }

            if ($isFunction && $isTimestampType) {
                $parts[] = "DEFAULT CURRENT_TIMESTAMP";
            } elseif ($isFunction && !$isTimestampType) {
                // Non-timestamp column with CURRENT_TIMESTAMP default — skip (invalid)
            } elseif (strtolower($default) === 'null') {
                $parts[] = "DEFAULT NULL";
            } elseif (is_numeric($default)) {
                $parts[] = "DEFAULT {$default}";
            } else {
                // String default — strip existing quotes, then add single quotes
                $default = trim($default, "'");
                $default = str_replace("'", "''", $default);
                $parts[] = "DEFAULT '{$default}'";
            }
        }

        // Clean up MySQL 8+ specific EXTRA syntax that older MySQL versions don't support
        $extra = $colInfo['extra'] ?? '';
        if ($extra !== null && $extra !== '') {
            // MySQL 8+ returns "DEFAULT_GENERATED on update CURRENT_TIMESTAMP"
            // Strip "DEFAULT_GENERATED" — keep only "on update CURRENT_TIMESTAMP" for timestamp/datetime
            $extra = str_ireplace('DEFAULT_GENERATED', '', $extra);
            $extra = trim($extra);

            // Only append "on update CURRENT_TIMESTAMP" for timestamp/datetime columns
            if ($extra !== '' && stripos($extra, 'on update') !== false) {
                $typeLower = strtolower($colInfo['type']);
                if (str_contains($typeLower, 'timestamp') || str_contains($typeLower, 'datetime')) {
                    $parts[] = $extra;
                }
            } elseif ($extra !== '' && strtolower($extra) === 'auto_increment') {
                $parts[] = 'auto_increment';
            }
        }

        return implode(' ', $parts);
    }

    /**
     * Build ALTER TABLE ADD COLUMN SQL for a missing column.
     */
    public function buildAddColumnSql(string $tableName, string $columnName): ?string
    {
        $schema = $this->getGoldenSchema();

        if (!isset($schema[$tableName][$columnName])) {
            return null;
        }

        $colInfo = $schema[$tableName][$columnName];
        $definition = $this->buildColumnDefinition($colInfo);

        return "ALTER TABLE `{$tableName}` ADD COLUMN `{$columnName}` {$definition}";
    }
}
