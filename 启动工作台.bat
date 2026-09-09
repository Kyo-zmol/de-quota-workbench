@echo off
chcp 65001 >nul
title ????????
cd /d "%~dp0app"
netstat -ano | findstr :8730 | findstr LISTENING >nul && (
  echo ???????????????
) || (
  start "???????" /min "C:\Users\Yzd18\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server.js
  timeout /t 1 /nobreak >nul
)
start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=http://127.0.0.1:8730 --user-data-dir="%~dp0app\.edge-profile"
