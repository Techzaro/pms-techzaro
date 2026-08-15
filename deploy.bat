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

echo [5/6] Copying .htaccess to root...
copy "frontend\.htaccess" "%DEPLOY_DIR%\.htaccess" /Y

echo [6/6] Done...

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
