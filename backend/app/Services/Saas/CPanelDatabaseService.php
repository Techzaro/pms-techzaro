<?php

namespace App\Services\Saas;

use Illuminate\Support\Facades\Log;

class CPanelDatabaseService
{
    protected string $host;
    protected string $username;
    protected string $token;
    protected string $cpanelPrefix;

    public function __construct()
    {
        $this->host = config('tenancy.cpanel.host', '');
        $this->username = config('tenancy.cpanel.username', '');
        $this->token = config('tenancy.cpanel.token', '');
        $this->cpanelPrefix = $this->username ? $this->username . '_' : '';
    }

    public function isConfigured(): bool
    {
        $enabled = config('tenancy.cpanel.enabled', false);

        return $enabled && !empty($this->host) && !empty($this->username) && !empty($this->token);
    }

    public function createDatabase(string $databaseName): void
    {
        // Ensure cPanel gets the full DB name with prefix (techxaro_...)
        $dbName = $this->ensureCpanelPrefix($databaseName);

        $result = $this->apiCall('Mysql/create_database', ['name' => $dbName]);

        if (!$result) {
            throw new \RuntimeException("cPanel: Failed to create database {$dbName}");
        }

        Log::info("cPanel: Created database {$dbName}");
    }

    public function dropDatabase(string $databaseName): void
    {
        $dbName = $this->ensureCpanelPrefix($databaseName);

        $result = $this->apiCall('Mysql/delete_database', ['name' => $dbName]);

        if (!$result) {
            Log::warning("cPanel: Failed to drop database {$dbName} (may not exist)");
        } else {
            Log::info("cPanel: Dropped database {$dbName}");
        }
    }

    public function grantAllPrivileges(string $databaseName, string $user): void
    {
        $dbName = $this->ensureCpanelPrefix($databaseName);
        $userName = $this->ensureCpanelPrefix($user);

        $result = $this->apiCall('Mysql/set_privileges_on_database', [
            'database'   => $dbName,
            'user'       => $userName,
            'privileges' => 'ALL PRIVILEGES',
        ]);

        if (!$result) {
            Log::warning("cPanel: Failed to grant privileges on {$dbName} to {$user}");
        } else {
            Log::info("cPanel: Granted ALL PRIVILEGES on {$dbName} to {$user}");
        }
    }

    public function databaseExists(string $databaseName): bool
    {
        $dbName = $this->ensureCpanelPrefix($databaseName);

        $result = $this->apiCall('Mysql/list_databases', []);

        if (!is_array($result)) {
            return false;
        }

        foreach ($result as $db) {
            $dbNameField = $db['database'] ?? $db['db'] ?? '';
            if ($dbNameField === $dbName || $dbNameField === $databaseName) {
                return true;
            }
        }

        return false;
    }

    /**
     * Ensures the full cPanel database name includes the username prefix.
     */
    protected function ensureCpanelPrefix(string $name): string
    {
        if ($this->cpanelPrefix && !str_starts_with($name, $this->cpanelPrefix)) {
            return $this->cpanelPrefix . $name;
        }

        return $name;
    }

    protected function apiCall(string $function, array $params): mixed
    {
        $url = rtrim($this->host, '/') . '/execute/' . $function;

        if (!empty($params)) {
            $url .= '?' . http_build_query($params);
        }

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL            => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_HTTPHEADER     => [
                'Authorization: cpanel ' . $this->username . ':' . $this->token,
            ],
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        if ($error) {
            Log::error("cPanel API error ({$function}): {$error}");
            throw new \RuntimeException("cPanel API connection error: {$error}");
        }

        if ($httpCode !== 200) {
            Log::error("cPanel API HTTP {$httpCode} for {$function}: {$response}");
            return null;
        }

        $data = json_decode($response, true);

        if (isset($data['errors']) && !empty($data['errors'])) {
            Log::error("cPanel API errors for {$function}: " . implode(', ', $data['errors']));
            return null;
        }

        return $data['data'] ?? $data;
    }
}