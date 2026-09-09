@echo off
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8730 ^| findstr LISTENING') do taskkill /pid %%a /f >nul 2>&1
echo ???????????
timeout /t 2 >nul
