@echo off
title CoRoomies Frontend (Port 5173)
cd /d "%~dp0..\frontend"
echo ============================================
echo   [CoRoomies Frontend] Starting...
echo   URL: http://localhost:5173
echo ============================================
echo.

call npm run dev

echo.
echo [Frontend stopped]
pause
