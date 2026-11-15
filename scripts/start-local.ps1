# CoRoomies - Local Startup Script
$ErrorActionPreference = "Continue"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  CoRoomies - Starting Services (Local)..." -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$scriptDir = $PSScriptRoot
$root = (Resolve-Path "$scriptDir\..").Path

# Inline cleanup of prior ports
$ports = @(5173, 8000)
foreach ($p in $ports) {
    $conns = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue
    if ($conns) {
        $conns | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
            if ($_ -gt 0) { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
        }
    }
}

# Ensure frontend/.env is reset to local backend
$envFile = Join-Path $root "frontend\.env"
[System.IO.File]::WriteAllText($envFile, "VITE_API_URL=http://127.0.0.1:8000`r`n", (New-Object System.Text.UTF8Encoding $false))
Write-Host "[Env] Configured frontend/.env -> http://127.0.0.1:8000" -ForegroundColor DarkGray

# 1. Start Backend
Write-Host "[1/2] Starting FastAPI Backend on http://127.0.0.1:8000..." -ForegroundColor Green
Start-Process -FilePath "$scriptDir\run-backend.bat"

Start-Sleep -Seconds 2

# 2. Start Frontend
Write-Host "[2/2] Starting Vite Frontend on http://localhost:5173..." -ForegroundColor Green
Start-Process -FilePath "$scriptDir\run-frontend.bat"

Start-Sleep -Seconds 2

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  CoRoomies is now running!" -ForegroundColor Green
Write-Host "  * Frontend App: http://localhost:5173" -ForegroundColor White
Write-Host "  * Backend API:  http://127.0.0.1:8000" -ForegroundColor White
Write-Host "  * API Docs:     http://127.0.0.1:8000/docs" -ForegroundColor White
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

try {
    Start-Process "http://localhost:5173"
} catch {
    Write-Host "Navigate to http://localhost:5173 in your browser." -ForegroundColor White
}
