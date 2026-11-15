@echo off
title CoRoomies - Cloudflare Tunnel Launcher
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-tunnel.ps1"

pause
