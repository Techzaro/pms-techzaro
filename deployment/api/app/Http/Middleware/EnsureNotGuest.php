<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class EnsureNotGuest
{
    public function handle(Request $request, Closure $next)
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        if ($user->role === 'guest') {
            return response()->json(['message' => 'Guest users do not have permission to perform this action.'], 403);
        }

        return $next($request);
    }
}
