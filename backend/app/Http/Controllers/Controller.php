<?php

namespace App\Http\Controllers;

use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Foundation\Validation\ValidatesRequests;
use Illuminate\Routing\Controller as BaseController;
use App\Services\Saas\Infrastructure\TenantCacheManager;

/**
 * Base controller class for all controllers in the application.
 *
 * Provides common functionality such as authorization and validation
 * through Laravel's built-in traits. All application controllers
 * should extend this class.
 */
abstract class Controller extends BaseController
{
    use AuthorizesRequests, ValidatesRequests;

    /**
     * Clear the dashboard cache for a given user so fresh activity data is shown.
     */
    protected function clearDashboardCache(int $userId): void
    {
        $cache = app(TenantCacheManager::class);
        $cache->forget("dashboard_{$userId}_my");
        $cache->forget("dashboard_{$userId}_user");
        $cache->forget("user_project_ids_{$userId}");
        $cache->forget("dashboard_recent_activity_{$userId}");
    }
}
