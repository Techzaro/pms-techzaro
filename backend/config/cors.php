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

    'allowed_origins' => array_filter([
        env('FRONTEND_URL'),
        env('APP_URL'),
    ]),

    'allowed_origins_patterns' => array_filter([
        env('CORS_ORIGIN_PATTERN'),
    ]),

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 86400,

    'supports_credentials' => true,

];
