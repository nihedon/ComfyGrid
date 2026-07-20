@echo off
chcp 65001 > nul
setlocal EnableDelayedExpansion

echo ========================================
echo         ComfyGrid Launch
echo ========================================
echo.

:: Check virtual environment
if exist venv goto :launch

echo Virtual environment not found. Running setup...
echo ========================================
echo       ComfyGrid Setup
echo ========================================
echo.

:: Check Python installation
echo [1/2] Checking Python...
call :check_python
if !python_installed! equ 0 (
    echo [ERROR] Python is not installed.
    echo Please install Python 3.10.11 or later from https://www.python.org/
    pause
    exit /b 1
) else (
    echo Python is installed: !python_version!
)

:: Setup Python virtual environment
echo.
echo [2/2] Setting up Python virtual environment...
call :setup_python_venv

echo.
echo ========================================
echo      Setup Complete!
echo ========================================
echo.

:launch
:: Launch ComfyGrid
echo Starting ComfyGrid...
call venv\Scripts\activate
python main.py

pause
goto :eof

:: ========================================
:: Python check function
:: ========================================
:check_python
set python_installed=0
set python_version=

call python --version >nul 2>&1
if !errorlevel! equ 0 (
    for /f "tokens=2" %%i in ('python --version 2^>^&1') do set python_version=%%i
    set python_installed=1
) else (
    call py --version >nul 2>&1
    if !errorlevel! equ 0 (
        for /f "tokens=2" %%i in ('py --version 2^>^&1') do set python_version=%%i
        set python_installed=1
    )
)

:: Check if version is 3.10.11 or later
if !python_installed! equ 1 (
    call :check_version "!python_version!"
    if !version_ok! equ 0 (
        echo [ERROR] Python version !python_version! is not supported.
        echo Please install Python 3.10.11 or later from https://www.python.org/
        set python_installed=0
    )
)
goto :eof

:: ========================================
:: Version check function
:: ========================================
:check_version
set version_ok=0
set version=%~1

:: Version string splitting (e.g., 3.10.11 -> major=3, minor=10, patch=11)
for /f "tokens=1,2,3 delims=." %%a in ("!version!") do (
    set major=%%a
    set minor=%%b
    set patch=%%c
)

:: Version comparison (3.10.11 or later)
if !major! gtr 3 (
    set version_ok=1
) else if !major! equ 3 (
    if !minor! gtr 10 (
        set version_ok=1
    ) else if !minor! equ 10 (
        if !patch! geq 11 (
            set version_ok=1
        )
    )
)
goto :eof

:: ========================================
:: Python virtual environment setup function
:: ========================================
:setup_python_venv
if exist venv (
    echo Virtual environment already exists.
    echo Checking if packages are up to date...
    call venv\Scripts\activate
    call pip install . --quiet
) else (
    echo Creating virtual environment...
    call python -m venv venv
    if !errorlevel! neq 0 (
        call py -m venv venv
        if !errorlevel! neq 0 (
            echo [ERROR] Failed to create virtual environment.
            echo Please make sure Python is properly installed.
            pause
            exit /b 1
        )
    )
    
    echo Activating virtual environment...
    call venv\Scripts\activate
    
    echo Installing Python packages...
    call python -m pip install --upgrade pip
    call pip install .
)

if !errorlevel! neq 0 (
    echo [ERROR] Failed to install Python packages.
    echo Please check your internet connection and pyproject.toml file.
    pause
    exit /b 1
)

echo Python environment setup completed.
goto :eof
