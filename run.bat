@echo off
chcp 65001 > nul
setlocal

echo ========================================
echo         ComfyGrid Launch
echo ========================================
echo.

:: Check virtual environment
if not exist venv (
    echo Virtual environment not found. Running setup...
    call install.bat
    if errorlevel 1 (
        echo [ERROR] Setup failed.
        pause
        exit /b 1
    )
)

:: Launch ComfyGrid
echo Starting ComfyGrid...
call venv\Scripts\activate
python main.py

pause