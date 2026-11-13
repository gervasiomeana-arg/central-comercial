# Inicio único de Central Comercial

Abrir `INICIAR_CENTRAL_COMERCIAL.bat` en la raíz del proyecto actualizado. Requiere Node.js 22 o posterior. No requiere instalar dependencias nuevas para el supervisor.

## Uso diario

1. La primera vez, cerrar las ventanas anteriores de correo, WhatsApp y puente OpenJarvis. No cerrar ni desvincular el WhatsApp del teléfono.
2. Abrir el iniciador único. Reutiliza `.env` del correo y la sesión privada de WhatsApp en sus carpetas existentes; no los copia, borra ni pide otras claves.
3. Mantener abierta esa única ventana. La página de Central Comercial se abre en Windows y muestra el estado de cada componente en **Conexiones → Tu computadora**.
4. Para detener el conjunto, usar Ctrl+C en la ventana. El supervisor solo termina los procesos que él inició. La detención manual no se revierte automáticamente durante esa sesión.
5. Para el inicio tras reiniciar Windows, abrir una vez `ACTIVAR_INICIO_AUTOMATICO.bat` en la PC dedicada. Copia únicamente el código del paquete a una ubicación estable del usuario y agrega un iniciador en su carpeta Inicio. No requiere guardar la contraseña de Windows. Requiere que el usuario inicie sesión; no funciona antes de ese momento ni en una PC apagada. `DESACTIVAR_INICIO_AUTOMATICO.bat` retira ese iniciador sin borrar datos.

El inicio por sí mismo no crea campañas, cambia objetivos ni confirma pagos. Los ejecutores conservan su comportamiento: pueden procesar trabajos de campañas ya autorizadas y sus colas pendientes, respetando sus reglas. WhatsApp conserva únicamente su alcance de pruebas al propietario.

## Qué localiza

- Conexión: variable `CENTRAL_CONFIG_FILE`, `.env` en la raíz o ruta guardada por el iniciador de WhatsApp en `%LOCALAPPDATA%\CentralComercial\WhatsApp\correo-path.txt`.
- Correo: `worker.mjs` y dependencias en la carpeta del `.env` ya configurado.
- WhatsApp: instalación y sesión existentes en `%LOCALAPPDATA%\CentralComercial\WhatsApp`, con su `browser-path.txt` guardado. No crea otra sesión.
- OpenJarvis: ejecutable `jarvis.exe` del PATH o `%LOCALAPPDATA%\OpenJarvis\src\.venv\Scripts\jarvis.exe`, ubicación usada por el instalador oficial de Windows. Se conserva compatibilidad con la variante sin la carpeta `src`. Se puede indicar `CENTRAL_JARVIS_EXE` para otra instalación de confianza.
- Ollama: API local `127.0.0.1:11434`; si no está ejecutándose, se intenta iniciar el ejecutable ya instalado, limitado a esa dirección. No se accede a motores remotos ni se instala Ollama automáticamente.

## Instalación inicial del motor

El paquete incluye `PREPARAR_CENTRAL_COMERCIAL.bat`. Primero revisa este equipo y localiza la conexión existente. Si falta el motor, ofrece ejecutar el instalador oficial de OpenJarvis únicamente después de escribir SI en la consola. Descarga una revisión fijada y comprueba su resumen SHA-256 normalizado antes de ejecutarla. No usa `ExecutionPolicy Bypass`, no modifica la política de ejecución y no intenta eludir bloqueos del sistema. El instalador oficial puede instalar dependencias, descargar un modelo y requerir herramientas de compilación; la preparación puede detenerse si falta algún requisito. No se asegura que esa instalación haya finalizado hasta comprobar el equipo real.

OpenJarvis y Ollama deben estar instalados previamente con un modelo apropiado. Documentación oficial: https://open-jarvis.github.io/OpenJarvis/getting-started/installation/

No se instalan programas ni modelos en silencio. La app web no puede instalar software en tu computadora por el solo hecho de abrir un botón o un QR.

Se recomienda `qwen3.5:2b` para equipos con menos de 16 GB y `qwen3.5:4b` a partir de 16 GB; se reutiliza el modelo 2b si el 4b no está instalado. Esta selección es orientativa, no garantía de velocidad. Con menos de 6 GB no se arranca automáticamente la IA local. `OPENJARVIS_MODEL` permite elegir explícitamente otro modelo ya instalado; no se cambia por otro si se indicó esa variable.

El supervisor inicia OpenJarvis con motor Ollama y agente `simple`, en `127.0.0.1:8765`, con un perfil propio de Central Comercial. No conecta canales ni herramientas de shell al modelo. No hereda claves de proveedores cloud o contraseñas de correo. La configuración gestionada se guarda en `%LOCALAPPDATA%\CentralComercial\runtime\intelligence`; el perfil personal de OpenJarvis se conserva. El puente se conecta al modelo desde esta misma computadora; el usuario no necesita abrir una segunda interfaz de OpenJarvis.

## Límites claros

- El panel distingue un proceso iniciado de una conexión realmente confirmada. Los estados de correo, WhatsApp y OpenJarvis se toman de sus respectivos heartbeats.
- Falta de modelo, memoria o instalación se informa como pendiente; no se usa Gemini ni un servicio de pago como sustituto.
- El agente reporta solamente códigos de estado, modelo elegido y cantidad total de RAM. No transmite carpetas, QR, contraseñas ni salidas de procesos al servidor.
- No se habilitan túneles, puertos públicos, tareas administrativas, inicio de sesión automático ni acceso remoto al sistema.
- El guardián recupera una interrupción del supervisor y este recupera procesos con esperas progresivas de 5 segundos a 5 minutos. Los procesos nativos propios se coordinan mediante un envoltorio que los termina si pierde contacto con el supervisor. No se promete recuperación frente a toda posible terminación forzada del sistema; esto debe verificarse en Windows.
- Gmail crea una nueva conexión IMAP cuando pierde la anterior, conservando el último UID y las respuestas ya procesadas. Un rechazo de credenciales detiene los reintentos hasta que el propietario lo corrija.
- WhatsApp conserva su perfil y diario de envíos. Un corte temporal solicita reinicio del componente. Si la sesión fue revocada o la cuenta no coincide, requiere intervención; no se elimina la sesión ni se intenta eludir la vinculación por QR.
- Antes de SMTP se guarda y sincroniza a disco un identificador de intento. Los resultados quedan conservados incluso después de confirmar al servidor. Un mensaje ya intentado no vuelve a enviarse al recuperar el trabajo, aunque reaparezca con otra asignación. Los resultados inciertos requieren revisión.
- El inicio único actualiza únicamente los ejecutores conocidos de correo y WhatsApp con la versión incluida. Conserva una copia del código anterior. No reemplaza `.env`, claves, estado de correo, perfiles de WhatsApp ni carpetas completas.
- Si Windows bloquea un archivo, detener la instalación y revisar el motivo; no desactivar Control Inteligente de Aplicaciones, antivirus ni otras protecciones.

Las consultas y estrategias requieren la versión actualizada de Central Comercial publicada y el puente actualizado que incluye este proyecto. La instalación y el funcionamiento en el equipo Windows del propietario siguen pendientes de verificación presencial.

## Conservación de datos

El supervisor descarga una copia de la base comercial y las colas cada minuto por la conexión privada existente. Verifica integridad y la escribe de forma atómica en `%LOCALAPPDATA%\CentralComercial\runtime\backups\latest.json`, conservando hasta 12 puntos anteriores. No incluye el `.env`, las sesiones de WhatsApp ni los secretos de configuración. La app muestra la hora del último respaldo real. Son datos privados: no compartir esos archivos.

Si falla Internet o el servidor no tiene publicada esta versión, conserva el respaldo anterior y muestra el problema. No se restauran copias antiguas automáticamente sobre registros más nuevos. Una recuperación del servidor requiere revisar consistencia y envíos con resultado incierto antes de usar esas copias.

En el servidor, `CENTRAL_DATA_DIR` puede señalar una carpeta absoluta de un volumen persistente. Debe existir ese almacenamiento; una variable no garantiza durabilidad en un contenedor efímero. `DATABASE_URL` por sí sola no conecta PostgreSQL en esta versión. Si la base actual está corrupta, el arranque se detiene conservando el archivo y los respaldos en lugar de reemplazarla por datos iniciales.
