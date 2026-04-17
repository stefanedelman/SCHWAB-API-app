@echo off
setlocal

set "ROOT=%~dp0"

echo Starting backend dev server...
start "SCHWAB Backend" cmd /k "cd /d "%ROOT%backend" && npm run dev"

echo Starting frontend dev server...
start "SCHWAB Frontend" cmd /k "cd /d "%ROOT%frontend" && npm run dev"

echo Both dev servers were launched.
exit /b 0
