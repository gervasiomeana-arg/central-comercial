@echo off
title Central Comercial - Puente OpenJarvis
cd /d "%~dp0"
echo CENTRAL COMERCIAL - Puente OpenJarvis
echo No cierre las ventanas de correo ni WhatsApp.
where node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js. Use la computadora donde funciona el ejecutor de correo.
  pause
  exit /b 1
)
node worker.mjs %*
pause
