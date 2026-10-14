@echo off
rem =====================================================
rem  IntraChat - production launcher (v2, self-locating)
rem  IMPORTANT: extract the whole zip to a normal folder
rem  first, then double-click this start.bat.
rem  Do NOT run it inside the zip preview window.
rem =====================================================
title IntraChat Server (keep this window open)

set "APP_DIR=%~dp0"
cd /d "%APP_DIR%" 2>nul
if errorlevel 1 (
  echo [ERROR] Cannot enter directory: "%APP_DIR%"
  echo Please extract the zip fully to e.g. D:\intranet-im, then run start.bat there.
  pause
  exit /b 1
)

echo ============================================================
echo   IntraChat launcher (v2, self-locating)
echo   APP_DIR = %APP_DIR%
echo   CWD     = %CD%
echo ============================================================
echo.

if not exist "%APP_DIR%.env" (
  copy /y "%APP_DIR%.env.example" "%APP_DIR%.env" >nul
  echo [WARN] Created .env for you. Open it with Notepad and fill in:
  echo    DB_USER / DB_PASSWORD = your MySQL account
  echo    JWT_SECRET            = any long random string
  echo Then save and double-click start.bat again.
  echo.
  pause
  exit /b
)

if not exist "%APP_DIR%dist-server\server.js" (
  echo [ERROR] File not found: "%APP_DIR%dist-server\server.js"
  echo Usually this means you ran it inside the zip preview, or the extract was incomplete.
  echo Right-click the zip - "Extract All" - to e.g. D:\intranet-im, then run start.bat there.
  echo.
  pause
  exit /b 1
)

set NODE_ENV=production
if "%PORT%"=="" set PORT=5000

echo Starting IntraChat (production) ...
echo Visit:  http://localhost:%PORT%     Admin: http://localhost:%PORT%/admin
echo Keep this window open. Press Ctrl+C to stop.
echo.

node "%APP_DIR%dist-server\server.js"

echo.
echo [Server exited] exit code = %ERRORLEVEL%
echo If the message above is a Node error, send the "APP_DIR =" line together with the error to tech support.
echo.
pause