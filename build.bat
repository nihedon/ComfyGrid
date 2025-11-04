@echo off
setlocal

echo ==========================================
echo       ComfyGrid Frontend Build
echo ==========================================
echo.

cd frontend
echo Installing frontend dependencies...
call pnpm install
if %errorLevel% neq 0 (
    echo [ERROR] Failed to install frontend dependencies.
    if not defined SKIP_PAUSE pause
    exit /b 1
)

echo Building frontend...
call pnpm run build
if %errorLevel% neq 0 (
    echo [ERROR] Failed to build frontend.
    if not defined SKIP_PAUSE pause
    exit /b 1
)
cd ..

echo.
echo ==========================================
echo Frontend Build Complete!
echo ==========================================
if not defined SKIP_PAUSE pause
