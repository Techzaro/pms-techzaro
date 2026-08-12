@echo off
echo ========================================
echo   PMS Deployment Script
echo ========================================
echo.

set DEPLOY_DIR=deployment
set FRONTEND_DIR=frontend\dist
set BACKEND_DIR=backend

echo [1/5] Cleaning deployment folder...
if exist "%DEPLOY_DIR%\api" rmdir /s /q "%DEPLOY_DIR%\api"
if exist "%DEPLOY_DIR%\assets" rmdir /s /q "%DEPLOY_DIR%\assets"
if exist "%DEPLOY_DIR%\index.html" del "%DEPLOY_DIR%\index.html"
if exist "%DEPLOY_DIR%\favicon.ico" del "%DEPLOY_DIR%\favicon.ico"

echo [2/5] Copying React build files...
if not exist "%DEPLOY_DIR%" mkdir "%DEPLOY_DIR%"
xcopy "%FRONTEND_DIR%\*" "%DEPLOY_DIR%\" /E /Y /Q

echo [3/5] Copying Laravel project...
mkdir "%DEPLOY_DIR%\api"
xcopy "%BACKEND_DIR%\app" "%DEPLOY_DIR%\api\app\" /E /Y /Q
xcopy "%BACKEND_DIR%\bootstrap" "%DEPLOY_DIR%\api\bootstrap\" /E /Y /Q
xcopy "%BACKEND_DIR%\config" "%DEPLOY_DIR%\api\config\" /E /Y /Q
xcopy "%BACKEND_DIR%\database" "%DEPLOY_DIR%\api\database\" /E /Y /Q
xcopy "%BACKEND_DIR%\public" "%DEPLOY_DIR%\api\public\" /E /Y /Q
xcopy "%BACKEND_DIR%\resources" "%DEPLOY_DIR%\api\resources\" /E /Y /Q
xcopy "%BACKEND_DIR%\routes" "%DEPLOY_DIR%\api\routes\" /E /Y /Q
xcopy "%BACKEND_DIR%\storage" "%DEPLOY_DIR%\api\storage\" /E /Y /Q
xcopy "%BACKEND_DIR%\vendor" "%DEPLOY_DIR%\api\vendor\" /E /Y /Q
copy "%BACKEND_DIR%\artisan" "%DEPLOY_DIR%\api\" /Y
copy "%BACKEND_DIR%\composer.json" "%DEPLOY_DIR%\api\" /Y
copy "%BACKEND_DIR%\composer.lock" "%DEPLOY_DIR%\api\" /Y

echo [4/5] Copying .env file...
copy "%BACKEND_DIR%\.env.production" "%DEPLOY_DIR%\api\.env" /Y

echo [5/5] Fixing index.php paths...
echo Fixing api/public/index.php...
(
echo ^<?php
echo.
echo use Illuminate\Http\Request;
echo.
echo define('LARAVEL_START', microtime^(true^)^);
echo.
echo // Handle CORS at PHP level
echo $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
echo if ($origin ^&^& preg_match('/\.techxaro\.com$/', $origin^)^) {
echo     header('Access-Control-Allow-Origin: ' . $origin^);
echo     header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS'^);
echo     header('Access-Control-Allow-Headers: Authorization, Content-Type, Accept, X-Tenant-ID, X-Requested-With, X-XSRF-TOKEN'^);
echo     header('Access-Control-Allow-Credentials: true'^);
echo     header('Access-Control-Max-Age: 86400'^);
echo.
echo     if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS'^) {
echo         http_response_code(204^);
echo         exit;
echo     }
echo }
echo.
echo // Determine if the application is in maintenance mode...
echo if ^(file_exists^($maintenance = __DIR__ . '/../../storage/framework/maintenance.php'^)^) {
echo     require $maintenance;
echo }
echo.
echo // Register the Composer autoloader...
echo require __DIR__ . '/../../vendor/autoload.php';
echo.
echo // Bootstrap Laravel and handle the request...
echo $app = require_once __DIR__ . '/../../bootstrap/app.php';
echo.
echo $app-^>handleRequest^(Request::capture^(^)^);
echo.
echo ?^>
) > "%DEPLOY_DIR%\api\public\index.php"

echo.
echo ========================================
echo   Deployment folder ready!
echo ========================================
echo.
echo Upload the contents of "%DEPLOY_DIR%\" to your hosting:
echo   - admin.one.techxaro.com
echo   - app.one.techxaro.com
echo.
echo Upload to: /home/techxaro/app.one.techxaro.com/
echo.
echo Steps after upload:
echo   1. Extract the zip file in File Manager
echo   2. Create MySQL database (techxaro_admin_one)
echo   3. Run: php artisan migrate
echo   4. Install SSL certificates
echo   5. Enable Force HTTPS
echo.
pause
