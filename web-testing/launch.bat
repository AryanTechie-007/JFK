@echo off
title FinMate AI - Web Testing Sandbox (Pre-Application Gate)
color 0B
cd /d "%~dp0\.."

echo ================================================================================
echo   FINMATE AI - WEB TESTING SANDBOX ^& PRE-PROMOTION GATE
echo ================================================================================
echo.
echo [STEP 1/2] Running Automated Branch ^& V4 Compliance Verification Suite...
echo.

node "%~dp0verify-web-readiness.js"
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo.
    echo [GATE BLOCKED] Automated tests failed!
    echo DO NOT merge your branch or add these changes to the Electron Desktop App.
    echo Please fix the errors above and run this batch file again.
    pause
    exit /b 1
)

echo.
echo [STEP 2/2] All automated checks passed! Launching Website Testing Server...
echo   - Nova V4 Engine API : http://localhost:4001
echo   - Website UI Sandbox : http://localhost:5173
echo.
echo Verify your agent/tool in the browser window. If everything works as expected,
echo you may merge your branch into `main` and launch `launch.bat`.
echo ================================================================================
echo.

node "%~dp0web-server.js"
pause
