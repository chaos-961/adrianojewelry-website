@echo off
rem Adriano Jewelry — local preview.
rem Double-click to serve the site and open it in the browser. The server
rem runs in THIS console's foreground, so closing the window kills it
rem completely — no orphaned node process. Optional first argument is the
rem port: serve.bat 8080
title Adriano Jewelry - local preview
cd /d "%~dp0"

set "PORT=4319"
if not "%~1"=="" set "PORT=%~1"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on PATH. Install it from https://nodejs.org and retry.
  pause
  exit /b 1
)

echo Serving http://localhost:%PORT%/  -  close this window to stop the server.
start "" "http://localhost:%PORT%/"
node scripts\serve.js %PORT%
