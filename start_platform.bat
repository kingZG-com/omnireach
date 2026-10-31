@echo off
cd /d "%~dp0"
title OmniReach - Omnichannel Outreach & Marketing Engine (v2.0)
echo ========================================================
echo        OMNIREACH - OMNICHANNEL OUTREACH AUTOMATION
echo ========================================================

if not exist "node_modules" (
    echo Menginstall dependencies Node.js...
    call npm install
    call npx playwright install chromium
)

echo Menjalankan platform di http://localhost:8000 (Mode Realtime Watcher Aktif) ...
start http://localhost:8000
node --watch server.js
pause
