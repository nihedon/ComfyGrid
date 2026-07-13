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

:: Install PyInstaller
echo.
echo Installing PyInstaller...
set PYTHON_EXE=venv\Scripts\python.exe
"%PYTHON_EXE%" -m pip install pyinstaller --quiet

:: 3. Build Backend
echo.
echo [3/4] Building Backend Executable...

:: Prepare Release folder
if exist "release" rmdir /s /q release
mkdir release
mkdir release\config
mkdir release\frontend

:: Generate version info
echo Generating version.json...
"%PYTHON_EXE%" -c "import json; from pathlib import Path; from comfygrid.services.git import get_version_info; Path('release/version.json').write_text(json.dumps(get_version_info(), ensure_ascii=False), encoding='utf-8')"
:: Clean previous PyInstaller builds
if exist "build" rmdir /s /q build
if exist "dist" rmdir /s /q dist
if exist "comfygrid.spec" del /q comfygrid.spec

:: Run PyInstaller via the venv python executable
"%PYTHON_EXE%" -m PyInstaller --name comfygrid --icon=frontend/public/icon.ico --onefile --console --distpath release ^
    --hidden-import uvicorn.logging ^
    --hidden-import uvicorn.loops ^
    --hidden-import uvicorn.loops.auto ^
    --hidden-import uvicorn.protocols ^
    --hidden-import uvicorn.protocols.http ^
    --hidden-import uvicorn.protocols.http.auto ^
    --hidden-import uvicorn.protocols.websockets ^
    --hidden-import uvicorn.protocols.websockets.auto ^
    --hidden-import uvicorn.lifespan.on ^
    --hidden-import uvicorn.lifespan.off ^
    main.py

if not exist "release\comfygrid.exe" (
    echo [ERROR] PyInstaller build failed to produce the executable.
    pause
    exit /b 1
)

:: 4. Assemble Release Folder
echo.
echo [4/4] Assembling Release folder...

:: Copy configuration files and frontend build
copy Caddyfile release\ >nul
xcopy config release\config /E /I /Q >nul
xcopy frontend\dist release\frontend /E /I /Q >nul

:: Create a launch script for the release
echo @echo off > release\comfygrid.bat
echo echo Starting ComfyGrid... >> release\comfygrid.bat
echo comfygrid.exe --host 127.0.0.1 --port 6210 >> release\comfygrid.bat
echo pause >> release\comfygrid.bat

echo.
echo ==========================================
echo Build complete! 
echo The distributable package is located in the 'release' folder.
echo You can run it by executing 'release\comfygrid.bat'.
echo ==========================================
pause
