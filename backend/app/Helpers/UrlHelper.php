<?php

namespace App\Helpers;

/**
 * Centralized URL generation for the SaaS platform.
 *
 * All environment-specific URLs are generated here.
 * No hardcoded domains scattered throughout the codebase.
 */
class UrlHelper
{
    /**
     * Get the organization application URL (no trailing slash).
     *
     * Production:  https://app.one.techxaro.com
     * Staging:     https://app.one.staging.techxaro.com
     * Local:       http://localhost:5173
     */
    public static function getOrgAppUrl(): string
    {
        return rtrim(env('ORG_APP_URL', env('FRONTEND_URL', 'http://localhost:5173')), '/');
    }

    /**
     * Get the super admin application URL (no trailing slash).
     *
     * Production:  https://admin.one.techxaro.com
     * Staging:     https://admin.one.staging.techxaro.com
     * Local:       http://localhost:5173/super-admin
     */
    public static function getAdminAppUrl(): string
    {
        return rtrim(env('ADMIN_APP_URL', env('FRONTEND_URL', 'http://localhost:5173')), '/');
    }

    /**
     * Get the full organization URL for a given slug.
     *
     * Production:  https://app.one.techxaro.com/org/techxaro
     * Staging:     https://app.one.staging.techxaro.com/org/techxaro
     * Local:       http://localhost:5173/org/techxaro
     */
    public static function getOrganizationUrl(string $slug): string
    {
        return static::getOrgAppUrl() . '/org/' . $slug;
    }

    /**
     * Get the organization login URL.
     *
     * Production:  https://app.one.techxaro.com/login
     * Staging:     https://app.one.staging.techxaro.com/login
     * Local:       http://localhost:5173/login
     */
    public static function getLoginUrl(): string
    {
        return static::getOrgAppUrl() . '/login';
    }

    /**
     * Get the super admin login URL.
     *
     * Production:  https://admin.one.techxaro.com/super-admin/login
     * Staging:     https://admin.one.staging.techxaro.com/super-admin/login
     * Local:       http://localhost:5173/super-admin/login
     */
    public static function getAdminLoginUrl(): string
    {
        $adminUrl = static::getAdminAppUrl();
        // In production, admin app is at its own domain, so login is just /login
        // In local dev, it's at /super-admin/login
        if (str_contains($adminUrl, 'localhost')) {
            return $adminUrl . '/super-admin/login';
        }
        return $adminUrl . '/login';
    }

    /**
     * Get the API base URL.
     *
     * In production, the API is served from the same domain as the backend.
     * The frontend uses a relative /api path.
     */
    public static function getApiUrl(): string
    {
        return rtrim(env('API_URL', env('APP_URL', 'http://localhost:8000')) . '/api', '/');
    }

    /**
     * Check if the current environment is production.
     */
    public static function isProduction(): bool
    {
        return env('APP_ENV') === 'production';
    }

    /**
     * Check if the current environment is staging.
     */
    public static function isStaging(): bool
    {
        return env('APP_ENV') === 'staging';
    }

    /**
     * Check if the current environment is local development.
     */
    public static function isLocal(): bool
    {
        return in_array(env('APP_ENV'), ['local', 'development', null]);
    }
}
