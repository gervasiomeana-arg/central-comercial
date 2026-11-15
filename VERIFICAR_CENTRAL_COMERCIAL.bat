@echo off
setlocal
title Central Comercial - Verificacion sin envios
cd /d "%~dp0"
set CENTRAL_DIAGNOSTIC_MODE=true
echo Cierre primero los iniciadores anteriores. No cierre la sesion de WhatsApp.
echo Este modo conecta los componentes pero bloquea todo envio de las colas.
echo Para detener, use Ctrl+C. Las campanas y sus limites se conservan.
node desktop\watchdog.mjs
pause
