<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Middleware that logs database query performance in development.
 *
 * Only active in local environment. Attaches query count, total time,
 * and slow query details as response headers for debugging.
 */
class QueryLogMiddleware
{
    /**
     * Handle an incoming request by enabling query logging and
     * attaching performance metrics to the response headers.
     *
     * @param \Illuminate\Http\Request         $request
     * @param \Closure                          $next
     *
     * @return \Symfony\Component\HttpFoundation\Response
     */
    public function handle(Request $request, Closure $next): Response
    {
        // Skip logging in non-local environments
        if (!app()->isLocal()) {
            return $next($request);
        }

        DB::enableQueryLog();

        $response = $next($request);

        // Analyze query log for count, total time, and slow queries
        $queries = DB::getQueryLog();
        $count = count($queries);
        $totalTime = 0;
        $slowQueries = [];

        // Identify queries exceeding 100ms threshold
        foreach ($queries as $q) {
            $totalTime += $q['time'];
            if ($q['time'] > 100) {
                $slowQueries[] = [
                    'sql' => $q['query'],
                    'bindings' => $q['bindings'],
                    'time' => round($q['time'], 2) . 'ms',
                ];
            }
        }

        // Attach query metrics as response headers for debugging
        $response->headers->set('X-Query-Count', $count);
        $response->headers->set('X-Query-Time', round($totalTime, 2) . 'ms');

        if (!empty($slowQueries)) {
            $response->headers->set('X-Slow-Queries', json_encode($slowQueries));
        }

        return $response;
    }
}
