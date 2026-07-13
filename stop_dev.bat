@echo off
title Document ES - Stop Dev

echo Stopping backend (port 8080)...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"

echo Stopping frontend (port 3000)...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"

echo Stopping Postgres container...
docker stop pd_postgres >nul 2>&1

echo Done.
timeout /t 2 >nul
