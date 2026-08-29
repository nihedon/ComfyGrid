@echo off
setlocal enabledelayedexpansion

echo ==========================================
echo  ComfyGrid Release Builder
echo ==========================================
echo.

:: 1. Setup Environment
echo [1/4] Running install.bat to setup environment...
set SKIP_PAUSE=1
call install.bat

:: 2. Build Frontend
echo.
echo [2/4] Running build.bat to build frontend...
call build.bat
set SKIP_PAUSE=

:: 3. Generate version info and Prepare Release folder
echo.
echo [3/4] Preparing Release files...

if exist "release" rmdir /s /q release
mkdir release
mkdir release\config
mkdir release\frontend
mkdir release\hook

echo Generating version.json...
set PYTHON_EXE=venv\Scripts\python.exe
"%PYTHON_EXE%" -c "import json; from pathlib import Path; from comfygrid.services.git import get_version_info; Path('release/version.json').write_text(json.dumps(get_version_info(), ensure_ascii=False), encoding='utf-8')"

:: 4. Assemble Release Folder
echo.
echo [4/4] Assembling Release folder...

:: Copy configuration files and frontend build
copy Caddyfile release\ >nul
xcopy config release\config /E /I /Q >nul
xcopy frontend\dist release\frontend /E /I /Q >nul
xcopy hook release\hook /E /I /Q >nul
if exist "extensions\" xcopy extensions release\extensions /E /I /Q >nul

:: Copy launch and updater scripts
copy update.bat release\ >nul
copy update.ps1 release\ >nul

echo.
echo ==========================================
echo Build complete! 
echo The distributable package is located in the 'release' folder.
echo You can run it by executing 'release\comfygrid.bat'.
echo ==========================================
pause
