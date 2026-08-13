<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class SuperAdminAuth
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();

        if (!$token) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);
        }

        // Look up token in master DB
        $accessToken = DB::connection('mysql_master')
            ->table('personal_access_tokens')
            ->where('token', hash('sha256', $token))
            ->first();

        if (!$accessToken) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);
        }

        // Check expiry
        if ($accessToken->expires_at && strtotime($accessToken->expires_at) < time()) {
            return response()->json(['success' => false, 'message' => 'Token has expired.'], 401);
        }

        // Resolve user from super_admin_users table in master DB
        $user = DB::connection('mysql_master')
            ->table('super_admin_users')
            ->where('id', $accessToken->tokenable_id)
            ->where('active', 1)
            ->first();

        if (!$user) {
            return response()->json(['success' => false, 'message' => 'Super admin account not found.'], 401);
        }

        // Update last_used_at
        DB::connection('mysql_master')
            ->table('personal_access_tokens')
            ->where('id', $accessToken->id)
            ->update(['last_used_at' => now()]);

        // Set authenticated user on request
        $request->setUserResolver(fn () => $user);

        return $next($request);
    }
}
