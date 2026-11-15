@echo off
setlocal
cd /d "%~dp0"
title Central Comercial - Operacion autonoma
echo Cierre el iniciador de verificacion anterior con Ctrl+C.
echo Se conservaran las dos copias y se incorporaran los registros faltantes.
node desktop\launch-now.mjs
if errorlevel 1 (
 pause
 exit /b 1
)
node desktop\autostart.mjs
if errorlevel 1 (
 echo No se configuro el inicio con Windows. Los registros se conservan.
 pause
 exit /b 1
)
set CENTRAL_DIAGNOSTIC_MODE=false
node "%LOCALAPPDATA%\CentralComercial\App\desktop\watchdog.mjs"
pause
