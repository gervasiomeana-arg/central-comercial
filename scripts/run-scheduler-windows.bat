@echo off
TITLE Central Comercial - Servidor y Motor de Automatizaciones en Segundo Plano
COLOR 0A

echo ============================================================
echo   CENTRAL COMERCIAL - SERVIDOR AUTONOMO PARA WINDOWS
echo ============================================================
echo.
echo Verificando instalacion de Node.js...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js no esta instalado o no se encuentra en el PATH.
    echo Por favor descargue e instale Node.js LTS desde https://nodejs.org
    pause
    exit /b 1
)

echo Node.js detectado correctamente.
node -v

echo.
echo Verificando dependencias del proyecto...
if not exist node_modules (
    echo Instalando dependencias necesarias...
    call npm install
)

echo.
echo Iniciando Central Comercial (Servidor Express + Motor Scheduler)...
echo Puede minimizar esta ventana. El motor continuara trabajando de forma autonoma
echo aunque cierre el navegador web.
echo.
echo Para acceder a la interfaz: http://localhost:3000
echo.

call npm run start

pause
