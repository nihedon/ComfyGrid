@echo off
chcp 65001 > nul
setlocal

echo ========================================
echo         ComfyGrid Launch
echo ========================================
echo.

:: Check virtual environment
if not exist venv (
    echo [ERROR] Virtual environment not found.
    echo Please run install_and_run.bat first to complete the setup.
    pause
    exit /b 1
)

:: Launch ComfyGrid
echo Starting ComfyGrid...
call venv\Scripts\activate
python main.py

pause