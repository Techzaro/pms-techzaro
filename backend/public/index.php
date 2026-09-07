<?php

use Illuminate\Foundation\Application;
use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

// Handle CORS preflight OPTIONS requests before Laravel boots
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowedOrigins = [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:5174',
        'https://app.one.techxaro.com',
        'https://admin.one.techxaro.com',
    ];
    $allowedPatterns = [
        '/^https?:\/\/[a-zA-Z0-9.-]+\.techxaro\.com$/',
        '/^https?:\/\/[a-zA-Z0-9.-]+\.ngrok-free\.dev$/',
    ];

    $isAllowed = in_array($origin, $allowedOrigins);
    if (!$isAllowed) {
        foreach ($allowedPatterns as $pattern) {
            if (preg_match($pattern, $origin)) {
                $isAllowed = true;
                break;
            }
        }
    }

    if ($isAllowed) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, Accept, X-Tenant-ID, X-Requested-With, X-XSRF-TOKEN, X-Admin-Name');
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Max-Age: 86400');
        http_response_code(200);
        exit;
    }
}

// Determine if the application is in maintenance mode...
if (file_exists($maintenance = __DIR__.'/../storage/framework/maintenance.php')) {
    require $maintenance;
}

// Register the Composer autoloader...
require __DIR__.'/../vendor/autoload.php';

// Bootstrap Laravel and handle the request...
/** @var Application $app */
$app = require_once __DIR__.'/../bootstrap/app.php';

$app->handleRequest(Request::capture());
