<?php

/**
 * CORS (Cross-Origin Resource Sharing) Configuration.
 *
 * Controls which origins, methods, and headers are allowed for API requests
 * from the frontend. Enables credentials support for cookie-based auth
 * (Sanctum CSRF). The allowed origin is read from FRONTEND_URL env var.
 */

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie', 'storage/*'],

    'allowed_methods' => ['*'],

    'allowed_origins' => [
        env('FRONTEND_URL', 'http://localhost:5173'),
        'http://127.0.0.1:5173',
    ],

    'allowed_origins_patterns' => [
        '/\.techxaro\.com$/',
    ],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 86400,

    'supports_credentials' => true,

];
