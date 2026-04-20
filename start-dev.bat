@echo off
setlocal

set "ROOT=%~dp0"
set "APP_URL=https://127.0.0.1:5173/"

echo Starting backend dev server...
start "SCHWAB Backend" cmd /k "cd /d "%ROOT%backend" && npm run dev"

echo Starting frontend dev server...
start "SCHWAB Frontend" cmd /k "cd /d "%ROOT%frontend" && npm run dev"

echo Opening app in browser: %APP_URL%
start "" "%APP_URL%"

echo Both dev servers were launched.
echo If this is your first HTTPS run, accept the browser security warning once.
exit /b 0
