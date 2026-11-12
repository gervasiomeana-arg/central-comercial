@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale Node.js LTS desde https://nodejs.org y vuelva a abrir este archivo.
  pause
  exit /b 1
)
if not exist .env (
  copy .env.example .env >nul
  echo Complete la conexion privada y la autorizacion de Gmail. Guarde el archivo y cierre el editor.
  start /wait notepad .env
)
if not exist node_modules (
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo No se pudieron instalar las dependencias.
    pause
    exit /b 1
  )
)
node worker.mjs
pause
