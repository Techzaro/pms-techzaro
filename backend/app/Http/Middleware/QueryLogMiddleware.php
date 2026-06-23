<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class QueryLogMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        if (!app()->isLocal()) {
            return $next($request);
        }

        DB::enableQueryLog();

        $response = $next($request);

        $queries = DB::getQueryLog();
        $count = count($queries);
        $totalTime = 0;
        $slowQueries = [];

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

        $response->headers->set('X-Query-Count', $count);
        $response->headers->set('X-Query-Time', round($totalTime, 2) . 'ms');

        if (!empty($slowQueries)) {
            $response->headers->set('X-Slow-Queries', json_encode($slowQueries));
        }

        return $response;
    }
}
