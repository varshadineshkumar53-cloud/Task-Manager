@echo off
title Task Manager - Fresh
cd /d "%~dp0"
echo.
echo ==========================================
echo       TASK MANAGER - FRESH VERSION
echo ==========================================
echo.
echo Starting...
start "" "http://localhost:5050"
node server.js
pause
