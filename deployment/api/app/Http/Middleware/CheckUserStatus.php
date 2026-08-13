<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckUserStatus
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user && $user->active === false && !$user->must_change_password) {
            $user->tokens()->delete();
            return response()->json([
                'success' => false,
                'message' => 'resigned',
            ], 401);
        }

        return $next($request);
    }
}
