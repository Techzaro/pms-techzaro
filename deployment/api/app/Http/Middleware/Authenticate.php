<?php

namespace App\Http\Middleware;

use Illuminate\Auth\Middleware\Authenticate as Middleware;
use Illuminate\Http\Request;

/**
 * Custom authentication middleware that extends Laravel's built-in Authenticate.
 *
 * Overrides redirectTo() to return null, preventing automatic redirects
 * for unauthenticated API requests (returns JSON 401 instead).
 */
class Authenticate extends Middleware
{
    /**
     * Get the path the user should be redirected to when they are not authenticated.
     *
     * Returns null to prevent redirect behavior for API routes,
     * causing a 401 JSON response instead.
     *
     * @param \Illuminate\Http\Request $request
     *
     * @return string|null
     */
    protected function redirectTo(Request $request): ?string
    {
        return null;
    }
}
