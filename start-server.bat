@echo off
title LibNexa Virtual Library Server
echo ===================================================
echo 🚀 Starting LibNexa Virtual Library Local Server...
echo ===================================================
cd /d "%~dp0"
node server.js
pause
