@echo off
echo ========================================
echo   PMS Deployment Script
echo ========================================
echo.
echo Select environment:
echo   1. Production
echo   2. Staging
echo.
set /p ENV_CHOICE="Enter choice (1 or 2): "

if "%ENV_CHOICE%"=="1" (
    set ENV_NAME=production
    set ENV_FILE=.env.production
    set DOMAIN=app.one.techxaro.com
) else if "%ENV_CHOICE%"=="2" (
    set ENV_NAME=staging
    set ENV_FILE=.env.staging
    set DOMAIN=app.one.staging.techxaro.com
) else (
    echo Invalid choice!
    pause
    exit /b 1
)

echo.
echo Deploying to: %ENV_NAME% (%DOMAIN%)
echo.

set DEPLOY_DIR=deployment-%ENV_NAME%
set FRONTEND_DIR=frontend\dist
set BACKEND_DIR=backend

echo [1/4] Cleaning deployment folder...
if exist "%DEPLOY_DIR%" rmdir /s /q "%DEPLOY_DIR%"
mkdir "%DEPLOY_DIR%"

echo [2/4] Copying React build files...
xcopy "%FRONTEND_DIR%\*" "%DEPLOY_DIR%\" /E /Y /Q
copy "frontend\.htaccess" "%DEPLOY_DIR%\.htaccess" /Y

echo [3/4] Copying Laravel project...
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

echo [4/4] Copying .env file (%ENV_FILE%)...
copy "%BACKEND_DIR%\%ENV_FILE%" "%DEPLOY_DIR%\api\.env" /Y

echo.
echo ========================================
echo   %ENV_NAME% deployment ready!
echo ========================================
echo.
echo Upload contents of "%DEPLOY_DIR%\" to server root.
echo.
echo After upload, run on server:
echo   php artisan config:clear
echo   php artisan migrate
echo.
pause
