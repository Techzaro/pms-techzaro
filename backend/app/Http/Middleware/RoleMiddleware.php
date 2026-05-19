<?php

/**
 * Middleware that checks authenticated user roles before allowing access to protected routes.
 */

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/**
 * Middleware that checks authenticated user roles.
 * Ensures only users with the required role can access the route.
 */
class RoleMiddleware
{
    /**
     * Validate authenticated user role before route execution.
     */
    public function handle(Request $request, Closure $next, ...$roles)
    {
        if (!$request->user()) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $allowed = [];

        foreach ($roles as $role) {
            foreach (array_map('trim', explode(',', $role)) as $item) {
                if ($item !== '') {
                    $allowed[] = $item;
                }
            }
        }

        if (!in_array($request->user()->role, $allowed)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        return $next($request);
    }
}