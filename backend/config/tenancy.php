<?php

/**
 * Tenancy Configuration.
 *
 * Defines the multi-tenancy settings for the SaaS platform.
 * The master database stores organization metadata while each
 * tenant's data lives in its own isolated database.
 */

return [

    /*
    |--------------------------------------------------------------------------
    | Central (Master) Database Connection
    |--------------------------------------------------------------------------
    */

    'master_connection' => env('TENANT_MASTER_CONNECTION', 'mysql_master'),

    /*
    |--------------------------------------------------------------------------
    | Default Tenant Connection Template
    |--------------------------------------------------------------------------
    */

    'default_database' => [
        'host'     => env('TENANT_DB_HOST', '127.0.0.1'),
        'port'     => env('TENANT_DB_PORT', '3306'),
        'username' => env('TENANT_DB_USERNAME', 'root'),
        'password' => env('TENANT_DB_PASSWORD', ''),
        'charset'  => 'utf8mb4',
        'collation' => 'utf8mb4_unicode_ci',
    ],

    /*
    |--------------------------------------------------------------------------
    | Tenant Database Naming
    |--------------------------------------------------------------------------
    */

    'database_prefix' => env('TENANT_DB_PREFIX', 'pms_tenant_'),
    'database_suffix' => env('TENANT_DB_SUFFIX', ''),

    /*
    |--------------------------------------------------------------------------
    | Tenant Identification Strategy
    |--------------------------------------------------------------------------
    | Supported: "subdomain", "header"
    */

    'identification' => env('TENANT_IDENTIFICATION', 'subdomain'),

    /*
    |--------------------------------------------------------------------------
    | Base Domain
    |--------------------------------------------------------------------------
    | The parent domain that tenant subdomains live under.
    |
    | Development:  pms.test        (works with /etc/hosts or dnsmasq)
    | Staging:      pms.staging.techxaro.com
    | Production:   pms.techxaro.com
    |
    | Override via TENANT_DOMAIN env variable.
    */

    'domain' => env('TENANT_DOMAIN', 'pms.test'),

    /*
    |--------------------------------------------------------------------------
    | Header Name
    |--------------------------------------------------------------------------
    | Used when identification strategy is "header".
    */

    'header' => 'X-Tenant-ID',

    /*
    |--------------------------------------------------------------------------
    | Central Routes (No Tenant Resolution)
    |--------------------------------------------------------------------------
    */

    'central_routes' => [
        'api/super-admin/*',
        'api/auth/*',
        'api/organizations/*',
        'api/plans/*',
        'health',
        'up',
    ],

    /*
    |--------------------------------------------------------------------------
    | Tenant Model
    |--------------------------------------------------------------------------
    */

    'tenant_model' => App\Models\Master\Organization::class,

    /*
    |--------------------------------------------------------------------------
    | Organization Types
    |--------------------------------------------------------------------------
    | "owner"    — Platform owner. Bypasses all plan limits and module checks.
    | "standard" — Regular tenant. Subject to plan limits.
    */

    'organization_types' => [
        'owner',
        'standard',
    ],

    /*
    |--------------------------------------------------------------------------
    | Storage Configuration
    |--------------------------------------------------------------------------
    */

    'storage' => [
        'disk' => 'public',
        'prefix' => 'tenants/:tenant_id/',
    ],

    /*
    |--------------------------------------------------------------------------
    | Cache & Session Prefix
    |--------------------------------------------------------------------------
    */

    'cache_prefix' => 'tenant_:tenant_id:',
    'session_prefix' => 'tenant_:tenant_id:',

];
