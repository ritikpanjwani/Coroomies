@echo off
title CoRoomies - Local Development
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-local.ps1"

pause
