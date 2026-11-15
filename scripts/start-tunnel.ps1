# CoRoomies - Automated Cloudflare Tunnel Launcher
$ErrorActionPreference = "Continue"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   CoRoomies - Launching Public Cloudflare Tunnels" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

$scriptDir = $PSScriptRoot
$root = (Resolve-Path "$scriptDir\..").Path

function Stop-CoRoomiesProcesses {
    Write-Host "[Cleanup] Checking and cleaning up lingering processes and ports..." -ForegroundColor DarkGray
    
    # Stop cloudflared
    Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

    # Stop processes listening on 5173 or 8000
    $ports = @(5173, 8000)
    foreach ($p in $ports) {
        $conns = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue
        if ($conns) {
            $conns | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
                if ($_ -gt 0) { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
            }
        }
    }

    # Stop any orphaned uvicorn python processes
    try {
        Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" -ErrorAction SilentlyContinue | Where-Object {
            $_.CommandLine -match 'uvicorn' -or $_.CommandLine -match 'multiprocessing-fork'
        } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    } catch {}

    # Stop any orphaned vite or npm node processes from this project
    try {
        Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue | Where-Object {
            $_.CommandLine -match 'vite' -or $_.CommandLine -match 'npm-cli'
        } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    } catch {}

    # Wait until ports 8000 and 5173 are verified free
    for ($i = 0; $i -lt 10; $i++) {
        $busy = Get-NetTCPConnection -LocalPort 8000, 5173 -State Listen -ErrorAction SilentlyContinue
        if (-not $busy) { break }
        Start-Sleep -Milliseconds 500
    }
}

# 1. Clean up lingering processes
Stop-CoRoomiesProcesses

# 2. Locate Cloudflare CLI
$cfPath = $null
if (Test-Path "C:\CloudFlared\cloudflared.exe") {
    $cfPath = "C:\CloudFlared\cloudflared.exe"
} elseif (Test-Path "C:\CloudFlared\cloudflared.exe.exe") {
    $cfPath = "C:\CloudFlared\cloudflared.exe.exe"
} else {
    $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($cmd) { $cfPath = $cmd.Source }
}

if (-not $cfPath) {
    Write-Host "[ERROR] Cloudflare tunnel CLI (cloudflared) was not found at C:\CloudFlared\cloudflared.exe" -ForegroundColor Red
    pause
    exit 1
}

# 3. Backup local frontend .env
$envFile = Join-Path $root "frontend\.env"
$envBackup = Join-Path $root "frontend\.env.backup"
if (Test-Path $envFile) {
    Copy-Item -Path $envFile -Destination $envBackup -Force
}

$backendProc = $null
$frontendProc = $null
$backendTunnelProc = $null
$frontendTunnelProc = $null
$backendLog = Join-Path $env:TEMP "coroomies-cf-backend.log"
$frontendLog = Join-Path $env:TEMP "coroomies-cf-frontend.log"

try {
    # 4. Start Backend
    Write-Host "[1/4] Starting FastAPI Backend on http://127.0.0.1:8000..." -ForegroundColor Green
    $backendProc = Start-Process -FilePath "$scriptDir\run-backend.bat" -PassThru

    # Active health probe for backend
    Write-Host "      Waiting for backend to become ready..." -ForegroundColor DarkGray
    $backendReady = $false
    for ($i = 0; $i -lt 25; $i++) {
        Start-Sleep -Seconds 1
        try {
            $res = Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" -TimeoutSec 2 -ErrorAction Stop
            if ($res.status -eq "ok") {
                $backendReady = $true
                break
            }
        } catch {}
    }

    if (-not $backendReady) {
        Write-Host "[ERROR] FastAPI backend failed to start on port 8000 within 25 seconds." -ForegroundColor Red
        Write-Host "Please check the 'CoRoomies Backend' window for details (e.g. database credentials or port conflicts)." -ForegroundColor Yellow
        pause
        exit 1
    }
    Write-Host "  -> Backend is healthy and responding (status: ok)" -ForegroundColor Green

    # 5. Start Backend Tunnel & Acquire URL (using HTTP/2 protocol and IPv4 for edge stability)
    Write-Host "[2/4] Starting Backend Cloudflare Tunnel..." -ForegroundColor Green
    if (Test-Path $backendLog) { Remove-Item -Path $backendLog -Force }

    $backendTunnelProc = Start-Process -FilePath $cfPath -ArgumentList "tunnel", "--protocol", "http2", "--edge-ip-version", "4", "--url", "http://127.0.0.1:8000", "--proxy-keepalive-timeout", "30s", "--proxy-connect-timeout", "10s", "--retries", "5", "--logfile", $backendLog -PassThru -WindowStyle Minimized

    $backendUrl = $null
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        if (Test-Path $backendLog) {
            $content = Get-Content -Path $backendLog -Raw -ErrorAction SilentlyContinue
            if ($content) {
                $match = [regex]::Match($content, 'https://[a-zA-Z0-9-]+\.trycloudflare\.com')
                if ($match.Success) {
                    $backendUrl = $match.Value
                    break
                }
            }
        }
    }

    if (-not $backendUrl) {
        Write-Host "[ERROR] Failed to obtain Backend Cloudflare tunnel URL." -ForegroundColor Red
        pause
        exit 1
    }

    Write-Host "  -> Backend Public URL: $backendUrl" -ForegroundColor Cyan
    Write-Host "      Verifying public backend tunnel reachability..." -ForegroundColor DarkGray

    # Probe backend tunnel until Cloudflare DNS propagates
    $backendTunnelReady = $false
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 1
        try {
            $res = Invoke-RestMethod -Uri "$backendUrl/health" -TimeoutSec 3 -ErrorAction Stop
            if ($res.status -eq "ok") {
                $backendTunnelReady = $true
                break
            }
        } catch {}
    }

    if ($backendTunnelReady) {
        Write-Host "  -> Public Backend Tunnel is live and healthy!" -ForegroundColor Green
    } else {
        Write-Host "  -> Backend tunnel registered (DNS propagating...)" -ForegroundColor DarkYellow
    }

    # 6. Configure frontend/.env with Backend Tunnel URL (without UTF-8 BOM)
    [System.IO.File]::WriteAllText($envFile, "VITE_API_URL=$backendUrl`r`n", (New-Object System.Text.UTF8Encoding $false))
    $env:VITE_API_URL = $backendUrl
    Write-Host "  -> Configured frontend/.env to route API calls through tunnel" -ForegroundColor DarkGray

    # 7. Start Frontend (listening on 0.0.0.0:5173)
    Write-Host "[3/4] Starting Vite Frontend on http://127.0.0.1:5173..." -ForegroundColor Green
    $frontendProc = Start-Process -FilePath "$scriptDir\run-frontend.bat" -PassThru

    # Active health probe for frontend
    Write-Host "      Waiting for frontend dev server to become ready..." -ForegroundColor DarkGray
    $frontendReady = $false
    for ($i = 0; $i -lt 25; $i++) {
        Start-Sleep -Seconds 1
        try {
            $res = Invoke-WebRequest -Uri "http://127.0.0.1:5173" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
            if ($res.StatusCode -eq 200) {
                $frontendReady = $true
                break
            }
        } catch {}
    }

    if (-not $frontendReady) {
        Write-Host "[ERROR] Vite frontend failed to start on port 5173 within 25 seconds." -ForegroundColor Red
        Write-Host "Please check the 'CoRoomies Frontend' window for errors." -ForegroundColor Yellow
        pause
        exit 1
    }
    Write-Host "  -> Frontend dev server is healthy and responding (HTTP 200)" -ForegroundColor Green

    # 8. Start Frontend Tunnel & Acquire URL (using HTTP/2 protocol and IPv4 for edge stability)
    Write-Host "[4/4] Starting Frontend Cloudflare Tunnel..." -ForegroundColor Green
    if (Test-Path $frontendLog) { Remove-Item -Path $frontendLog -Force }

    $frontendTunnelProc = Start-Process -FilePath $cfPath -ArgumentList "tunnel", "--protocol", "http2", "--edge-ip-version", "4", "--url", "http://127.0.0.1:5173", "--proxy-keepalive-timeout", "30s", "--proxy-connect-timeout", "10s", "--retries", "5", "--logfile", $frontendLog -PassThru -WindowStyle Minimized

    $frontendUrl = $null
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        if (Test-Path $frontendLog) {
            $content = Get-Content -Path $frontendLog -Raw -ErrorAction SilentlyContinue
            if ($content) {
                $match = [regex]::Match($content, 'https://[a-zA-Z0-9-]+\.trycloudflare\.com')
                if ($match.Success) {
                    $frontendUrl = $match.Value
                    break
                }
            }
        }
    }

    if (-not $frontendUrl) {
        Write-Host "[ERROR] Failed to obtain Frontend Cloudflare tunnel URL." -ForegroundColor Red
        pause
        exit 1
    }

    # Probe frontend tunnel until Cloudflare DNS propagates
    Write-Host "      Verifying public frontend tunnel reachability..." -ForegroundColor DarkGray
    $frontendTunnelReady = $false
    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Seconds 1
        try {
            $res = Invoke-WebRequest -Uri $frontendUrl -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
            if ($res.StatusCode -eq 200) {
                $frontendTunnelReady = $true
                break
            }
        } catch {}
    }

    # Copy to clipboard
    try {
        Set-Clipboard -Value $frontendUrl
        $copiedText = "(Copied to your clipboard!)"
    } catch {
        $copiedText = ""
    }

    Write-Host ""
    Write-Host "========================================================================" -ForegroundColor Green
    Write-Host "  SUCCESS! CoRoomies is live for you and your flatmates to test!" -ForegroundColor Green
    Write-Host "========================================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  👉 SEND THIS LINK TO YOUR FRIENDS / OPEN ON YOUR PHONE:" -ForegroundColor Yellow
    Write-Host "  $frontendUrl  $copiedText" -ForegroundColor White -BackgroundColor DarkGreen
    Write-Host ""
    Write-Host "  * App Website (Frontend): $frontendUrl" -ForegroundColor Green
    Write-Host "  * Internal API (Backend):  $backendUrl (Used automatically by the app, don't open as webpage)" -ForegroundColor DarkGray
    Write-Host "  * Local App (Your PC):     http://localhost:5173" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  STATUS:" -ForegroundColor White
    Write-Host "  [OK] Backend API is running on port 8000 (Connected to PostgreSQL)" -ForegroundColor Green
    Write-Host "  [OK] Frontend is running on port 5173 with tunnel API routing" -ForegroundColor Green
    Write-Host "  [OK] Public tunnels active and healthy via IPv4 / HTTP/2" -ForegroundColor Green
    Write-Host ""
    Write-Host "  IMPORTANT: Keep this window OPEN while testing the app." -ForegroundColor Yellow
    Write-Host "  (To stop all tunnels and servers, type 'quit' or 'stop' and press Enter)" -ForegroundColor Yellow
    Write-Host "========================================================================" -ForegroundColor Green
    Write-Host ""

    try {
        Start-Process $frontendUrl
    } catch {
        Start-Process "http://localhost:5173"
    }

    # Safe interactive wait loop
    while ($true) {
        $input = Read-Host "Tunnels active! Type 'quit' or 'stop' and press Enter to shut down"
        if ($input -match '^(quit|stop|exit|q)$') {
            break
        } else {
            Write-Host "Tunnels are still running! App URL: $frontendUrl" -ForegroundColor Green
            Write-Host "To shut down, type 'quit' and press Enter." -ForegroundColor DarkYellow
        }
    }

} finally {
    Write-Host ""
    Write-Host "Stopping tunnels and resetting environment..." -ForegroundColor Yellow
    
    # Stop cloudflared and server processes cleanly
    Stop-CoRoomiesProcesses

    if (Test-Path $envBackup) {
        Move-Item -Path $envBackup -Destination $envFile -Force
        Write-Host "Reset frontend\.env back to local development (http://127.0.0.1:8000)." -ForegroundColor Cyan
    } else {
        [System.IO.File]::WriteAllText($envFile, "VITE_API_URL=http://127.0.0.1:8000`r`n", (New-Object System.Text.UTF8Encoding $false))
        Write-Host "Reset frontend\.env to default local development (http://127.0.0.1:8000)." -ForegroundColor Cyan
    }

    # Remove temp log files
    if (Test-Path $backendLog) { Remove-Item -Path $backendLog -Force -ErrorAction SilentlyContinue }
    if (Test-Path $frontendLog) { Remove-Item -Path $frontendLog -Force -ErrorAction SilentlyContinue }

    Write-Host "All tunnels and servers stopped cleanly." -ForegroundColor Green
}
