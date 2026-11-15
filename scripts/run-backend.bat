@echo off
title CoRoomies Backend (Port 8000)
cd /d "%~dp0..\backend"
echo ============================================
echo   [CoRoomies Backend] Starting...
echo   URL:  http://127.0.0.1:8000
echo   Docs: http://127.0.0.1:8000/docs
echo ============================================
echo.

if exist ".\venv\Scripts\python.exe" (
    echo Using backend virtualenv: .\venv\Scripts\python.exe
    ".\venv\Scripts\python.exe" -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --timeout-keep-alive 75
) else (
    echo Virtualenv not found at .\venv, attempting system python...
    python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --timeout-keep-alive 75
)

echo.
echo [Backend stopped]
pause
