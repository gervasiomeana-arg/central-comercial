@echo off
cd /d "%~dp0"
if not exist .env (
 copy .env.example .env >nul
 echo Complete el archivo .env con su correo y las conexiones. No comparta este archivo.
 notepad .env
 pause
 exit /b
)
if not exist node_modules call npm install --no-audit --no-fund
call npm start
pause
