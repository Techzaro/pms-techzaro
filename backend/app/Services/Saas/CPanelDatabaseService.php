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
        $dbName = $this->stripCpanelPrefix($databaseName);

        $result = $this->apiCall('Mysql/create_database', ['name' => $dbName]);

        if (!$result) {
            throw new \RuntimeException("cPanel: Failed to create database {$databaseName}");
        }

        Log::info("cPanel: Created database {$databaseName} (api name: {$dbName})");
    }

    public function dropDatabase(string $databaseName): void
    {
        $dbName = $this->stripCpanelPrefix($databaseName);

        $result = $this->apiCall('Mysql/delete_database', ['name' => $dbName]);

        if (!$result) {
            Log::warning("cPanel: Failed to drop database {$databaseName} (may not exist)");
        } else {
            Log::info("cPanel: Dropped database {$databaseName}");
        }
    }

    public function grantAllPrivileges(string $databaseName, string $user): void
    {
        $dbName = $this->stripCpanelPrefix($databaseName);
        $userName = $this->stripCpanelPrefix($user);

        $result = $this->apiCall('Mysql/set_privileges_on_database', [
            'database'   => $dbName,
            'user'       => $userName,
            'privileges' => 'ALL PRIVILEGES',
        ]);

        if (!$result) {
            Log::warning("cPanel: Failed to grant privileges on {$databaseName} to {$user}");
        } else {
            Log::info("cPanel: Granted ALL PRIVILEGES on {$databaseName} to {$user}");
        }
    }

    public function databaseExists(string $databaseName): bool
    {
        $dbName = $this->stripCpanelPrefix($databaseName);

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

    protected function stripCpanelPrefix(string $name): string
    {
        if ($this->cpanelPrefix && str_starts_with($name, $this->cpanelPrefix)) {
            return substr($name, strlen($this->cpanelPrefix));
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
