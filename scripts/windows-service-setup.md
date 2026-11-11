# Guía de Ejecución Autónoma en Windows — Central Comercial

Esta plataforma está diseñada arquitectónicamente con una separación estricta entre:
1. **La Interfaz Web (React SPA)**: el panel de control administrativo que se visualiza en el navegador.
2. **El Servidor y Motor de Automatizaciones (Node.js + Scheduler)**: el proceso continuo que ejecuta la persistencia local de datos, tareas cron, validación de reglas comerciales y comunicación con conectores.

> **IMPORTANTE**: Mantener abierta una pestaña en el navegador **NO** es lo que garantiza el trabajo autónomo. El proceso que trabaja en segundo plano es el servidor Node.js (`server.ts`).

---

## Opción 1: Ejecución Directa con el lanzador `.bat`

1. Descargá o copiá la carpeta del proyecto en tu computadora con Windows.
2. Asegurate de tener instalado [Node.js v20+ LTS](https://nodejs.org).
3. Hacé doble clic en `scripts\run-scheduler-windows.bat`.
4. El script comprobará Node.js, instalará dependencias si hiciera falta e iniciará el servidor en `http://localhost:3000`.
5. Podés minimizar la ventana. El motor seguirá activo y trabajando.

---

## Opción 2: Ejecución como Demonio Permanente con PM2 (Recomendada)

PM2 permite que el servidor se ejecute silenciosamente en segundo plano y se reinicie automáticamente ante cualquier imprevisto o reinicio de Windows:

```powershell
# 1. Instalar PM2 de manera global
npm install -g pm2

# 2. Instalar el módulo de inicio automático en Windows
npm install -g pm2-windows-startup
pm2-startup install

# 3. Iniciar la aplicación
pm2 start server.ts --name "central-comercial" --interpreter "node" --node-args="--loader tsx"

# 4. Guardar la lista de procesos activos
pm2 save
```

---

## Opción 3: Programador de Tareas de Windows (Task Scheduler)

1. Presioná `Win + R`, escribí `taskschd.msc` y presioná Enter.
2. Hacé clic en **"Crear tarea..."**.
3. En la solapa **General**:
   - Nombre: `Central Comercial Background Runner`
   - Seleccionar: *"Ejecutar tanto si el usuario inició sesión como si no"* (o *"Ejecutar solo cuando el usuario haya iniciado sesión"*).
4. En la solapa **Desencadenadores**:
   - Nuevo -> Iniciar la tarea: *"Al iniciar el sistema"* o *"Al iniciar la sesión"*.
5. En la solapa **Acciones**:
   - Nueva -> Acción: *"Iniciar un programa"*.
   - Programa o script: `cmd.exe`
   - Agregar argumentos: `/c "cd /d C:\Ruta\A\Tu\Proyecto && npm run start"`
6. Guardar. El sistema arrancará solo con Windows.

---

## Configuración de Credenciales en Windows

Para conectar Gemini AI y los futuros servicios externos sin tocar el código:
1. Copiá el archivo `.env.example` como `.env` en la raíz del proyecto.
2. Editá `.env` con un editor de texto (Notepad, VS Code):
   ```env
   GEMINI_API_KEY="AIzaSy..."
   PORT=3000
   ```
3. El archivo `.env` nunca debe subirse a repositorios públicos ni compartirse.
