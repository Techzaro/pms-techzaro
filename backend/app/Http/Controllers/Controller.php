<?php

namespace App\Http\Controllers;

use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Foundation\Validation\ValidatesRequests;
use Illuminate\Routing\Controller as BaseController;

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
        \Illuminate\Support\Facades\Cache::forget("dashboard_{$userId}");
    }
}
