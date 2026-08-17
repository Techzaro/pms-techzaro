<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Tenancy Configuration
    |--------------------------------------------------------------------------
    */

    // Database name prefix for tenant databases.
    'database_prefix' => env('TENANT_DB_PREFIX', 'pms_tenant_'),

    // Connection used for master (super admin) database.
    'master_connection' => env('TENANT_MASTER_CONNECTION', 'mysql_master'),

    // Default tenant database connection values.
    'default_database' => [
        'host'     => env('TENANT_DB_HOST', env('DB_HOST', '127.0.0.1')),
        'port'     => env('TENANT_DB_PORT', env('DB_PORT', '3306')),
        'username' => env('TENANT_DB_USERNAME', env('DB_USERNAME', 'root')),
        'password' => env('TENANT_DB_PASSWORD', env('DB_PASSWORD', '')),
    ],

    // cPanel API settings (shared hosting database provisioning).
    'cpanel' => [
        'enabled'  => env('CPANEL_ENABLED', false),
        'host'     => env('CPANEL_HOST', ''),
        'username' => env('CPANEL_USERNAME', ''),
        'token'    => env('CPANEL_TOKEN', ''),
    ],
];