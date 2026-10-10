@echo off
title FinMate AI - Multi-Agent Desktop Application (Electron)
color 0A
cd /d "%~dp0"

echo ================================================================================
echo   FINMATE AI - ELECTRON DESKTOP APPLICATION LAUNCHER (launch.bat)
echo ================================================================================
echo.
echo [1/3] Running Pre-Flight Verification Gate across all Agent ^& Tool modules...
node "%~dp0web-testing\verify-web-readiness.js"
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo.
    echo [LAUNCH ABORTED] Pre-flight verification failed!
    echo Please test and fix your changes using `web-testing\launch.bat` first.
    pause
    exit /b 1
)

if not exist "%~dp0dist\index.html" (
    echo [2/3] Building production UI bundle for Electron Desktop...
    call npm run build
) else (
    echo [2/3] Production UI bundle verified at dist\index.html.
)

echo [3/3] Starting FinMate AI Electron Desktop Application...
echo.
call npx electron .
