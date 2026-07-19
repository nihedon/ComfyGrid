@echo off
(
echo ComfyGrid Updater
echo =================
powershell -ExecutionPolicy Bypass -File "%~dp0update.ps1"
pause
)
