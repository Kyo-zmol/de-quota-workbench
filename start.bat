@echo off
chcp 65001 >nul
cd /d "%~dp0app"
set NODE_EXE=node
if defined NODE_HOME set NODE_EXE=%NODE_HOME%\node.exe
where %NODE_EXE% >nul 2>&1 || echo [??] ??? node???? Node.js ??? NODE_HOME ????
start "????????" /min %NODE_EXE% server.js
timeout /t 1 /nobreak >nul
start "" http://127.0.0.1:8730
