@echo off
title Preparar Central Comercial
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Se requiere Node.js 22 o posterior desde https://nodejs.org.
 pause
 exit /b 1
)
node desktop\prepare.mjs
pause
