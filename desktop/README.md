# Inicio único de Central Comercial

Abrir `INICIAR_CENTRAL_COMERCIAL.bat` en la raíz del proyecto actualizado. Requiere Node.js 22 o posterior. No requiere instalar dependencias nuevas para el supervisor.

## Uso diario

1. La primera vez, cerrar las ventanas anteriores de correo, WhatsApp y puente OpenJarvis. No cerrar ni desvincular el WhatsApp del teléfono.
2. Abrir el iniciador único. Reutiliza `.env` del correo y la sesión privada de WhatsApp en sus carpetas existentes; no los copia, borra ni pide otras claves.
3. Mantener abierta esa única ventana. La página de Central Comercial se abre en Windows y muestra el estado de cada componente en **Conexiones → Tu computadora**.
4. Para detener el conjunto, usar Ctrl+C en la ventana. El supervisor solo termina los procesos que él inició. No mata procesos de usuario ajenos. En Windows incluye sus descendientes para cerrar el navegador automatizado sin dejarlo bloqueando el perfil.

El inicio por sí mismo no crea campañas, cambia objetivos ni confirma pagos. Los ejecutores conservan su comportamiento: pueden procesar trabajos de campañas ya autorizadas y sus colas pendientes, respetando sus reglas. WhatsApp conserva únicamente su alcance de pruebas al propietario.

## Qué localiza

- Conexión: variable `CENTRAL_CONFIG_FILE`, `.env` en la raíz o ruta guardada por el iniciador de WhatsApp en `%LOCALAPPDATA%\CentralComercial\WhatsApp\correo-path.txt`.
- Correo: `worker.mjs` y dependencias en la carpeta del `.env` ya configurado.
- WhatsApp: instalación y sesión existentes en `%LOCALAPPDATA%\CentralComercial\WhatsApp`, con su `browser-path.txt` guardado. No crea otra sesión.
- OpenJarvis: ejecutable `jarvis.exe` del PATH o `%LOCALAPPDATA%\OpenJarvis\.venv\Scripts\jarvis.exe`, ubicación usada por el instalador oficial de Windows. Se puede indicar `CENTRAL_JARVIS_EXE` para otra instalación de confianza.
- Ollama: API local `127.0.0.1:11434`; si no está ejecutándose, se intenta iniciar el ejecutable ya instalado, limitado a esa dirección. No se accede a motores remotos ni se instala Ollama automáticamente.

## Instalación inicial del motor

OpenJarvis y Ollama deben estar instalados previamente con un modelo apropiado. Documentación oficial: https://open-jarvis.github.io/OpenJarvis/getting-started/installation/

No se instalan programas ni modelos en silencio. La app web no puede instalar software en tu computadora por el solo hecho de abrir un botón o un QR.

Se recomienda `qwen3.5:2b` para equipos con menos de 16 GB y `qwen3.5:4b` a partir de 16 GB; se reutiliza el modelo 2b si el 4b no está instalado. Esta selección es orientativa, no garantía de velocidad. Con menos de 6 GB no se arranca automáticamente la IA local. `OPENJARVIS_MODEL` permite elegir explícitamente otro modelo ya instalado; no se cambia por otro si se indicó esa variable.

El supervisor inicia OpenJarvis con motor Ollama y agente `simple`, en `127.0.0.1:8765`, con un perfil propio de Central Comercial. No conecta canales ni herramientas de shell al modelo. No hereda claves de proveedores cloud o contraseñas de correo. La configuración gestionada se guarda en `%LOCALAPPDATA%\CentralComercial\runtime\intelligence`; el perfil personal de OpenJarvis se conserva. El puente se conecta al modelo desde esta misma computadora; el usuario no necesita abrir una segunda interfaz de OpenJarvis.

## Límites claros

- El panel distingue un proceso iniciado de una conexión realmente confirmada. Los estados de correo, WhatsApp y OpenJarvis se toman de sus respectivos heartbeats.
- Falta de modelo, memoria o instalación se informa como pendiente; no se usa Gemini ni un servicio de pago como sustituto.
- El agente reporta solamente códigos de estado, modelo elegido y cantidad total de RAM. No transmite carpetas, QR, contraseñas ni salidas de procesos al servidor.
- No se habilitan túneles, puertos públicos, tareas programadas, reinicios automáticos o acceso remoto al sistema.
- Si un componente se detiene, se muestra el problema y no se reinicia automáticamente. No se intenta reenviar un mensaje cuyo resultado sea incierto.
- Si Windows bloquea un archivo, detener la instalación y revisar el motivo; no desactivar Control Inteligente de Aplicaciones, antivirus ni otras protecciones.

Las consultas y estrategias requieren la versión actualizada de Central Comercial publicada y el puente actualizado que incluye este proyecto. La instalación y el funcionamiento en el equipo Windows del propietario siguen pendientes de verificación presencial.
