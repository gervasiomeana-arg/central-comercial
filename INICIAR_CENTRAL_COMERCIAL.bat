@echo off
title Central Comercial
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Se requiere Node.js 22 o posterior, como en la computadora que ya usa el correo.
 pause
 exit /b 1
)
echo Cierre primero los iniciadores anteriores de correo, WhatsApp y OpenJarvis.
echo Este iniciador reutiliza las conexiones guardadas. No solicita contrasenas.
pause
node desktop\start.mjs
pause
