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
     *
     * Accepts one or more role names as variadic arguments. Supports
     * comma-separated role lists and normalizes the 'teamlead' alias
     * to 'team_lead'. Returns 401 if unauthenticated, 403 if role
     * is not permitted.
     *
     * @param \Illuminate\Http\Request $request
     * @param \Closure                 $next
     * @param string                   ...$roles One or more allowed roles
     *
     * @return \Symfony\Component\HttpFoundation\Response
     */
    public function handle(Request $request, Closure $next, ...$roles)
    {
        if (!$request->user()) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        // Build list of allowed roles, normalizing comma-separated values
        $allowed = [];

        foreach ($roles as $role) {
            foreach (array_map('trim', explode(',', $role)) as $item) {
                if ($item !== '') {
                    // Normalize role aliases
                    $normalized = $item === 'teamlead' ? 'team_lead' : $item;
                    $allowed[] = $normalized;
                }
            }
        }

        // Deny access if user's role is not in the allowed list
        if (!in_array($request->user()->role, $allowed)) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        return $next($request);
    }
}