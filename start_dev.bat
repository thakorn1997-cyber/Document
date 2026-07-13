@echo off
setlocal
title Document ES - Dev Launcher

set "PROJECT_DIR=%~dp0"
set "TOOLS=C:\Program Files\Docker\Docker\resources\bin;C:\Program Files\Go\bin;C:\Program Files\nodejs"

echo ==========================================
echo   Document ES - Dev Mode Launcher
echo ==========================================
echo.

REM 1. Postgres (docker)
echo [1/3] Starting Postgres (docker)...
"C:\Program Files\Docker\Docker\resources\bin\docker.exe" start pd_postgres >nul 2>&1
if errorlevel 1 (
    echo   pd_postgres not found. Creating from compose...
    pushd "%PROJECT_DIR%"
    "C:\Program Files\Docker\Docker\resources\bin\docker.exe" compose up -d postgres
    popd
) else (
    echo   pd_postgres already running.
)

REM 2. Backend (Go) — HTTP on :8080
echo [2/3] Starting Backend...
start "Document ES - Backend" cmd /k "set PATH=%TOOLS%;%%PATH%% && cd /d %PROJECT_DIR%backend && go run ./cmd/server"

REM 3. Frontend (Next.js) — HTTPS on :3000 via --experimental-https
echo [3/3] Starting Frontend (HTTPS)...
start "Document ES - Frontend" cmd /k "set PATH=%TOOLS%;%%PATH%% && cd /d %PROJECT_DIR%frontend && npm run dev -- --experimental-https"

echo.
echo ==========================================
echo   All started. Wait 15-20 seconds then:
echo     https://localhost:3000
echo     https://YOUR_LAN_IP:3000  (e.g. https://10.51.192.198:3000)
echo.
echo   NOTE: browser will warn about self-signed cert
echo   Click Advanced → Continue to site (once per browser)
echo ==========================================
echo.
pause
