# Migración de Central Comercial a la nube

GitHub sigue siendo el origen del código. Google AI Studio y Publish siguen siendo el flujo de la interfaz. Los procesos de fondo se ejecutan en infraestructura de nube con almacenamiento externo.

## Despliegue en un servidor Linux

El directorio [deploy](../deploy) permite desplegar la misma aplicación con un único servidor Node, disco persistente y un ejecutor de correo opcional. GitHub conserva el código y AI Studio sigue siendo el entorno de desarrollo. La publicación existente mantiene su comportamiento mientras se prepara y verifica el servidor de operación.

1. Conservar una copia íntegra del directorio de registros del ejecutor activo, el respaldo de Publish y el diario de correo. Conciliar las dos fuentes antes del corte. La copia saneada del endpoint de respaldo preserva el historial comercial y deja fuera credenciales. Para conservarlas, trasladarlas por separado mediante el gestor de secretos del servidor.
2. Si la fuente conciliada es un checkpoint con SHA-256, restaurarlo en un directorio nuevo dentro del disco persistente con `node deploy/restore-checkpoint.mjs respaldo.json /disco/central/registros`. El importador conserva colas y convierte intentos interrumpidos en resultados pendientes de revisión. Los respaldos originales quedan intactos. Con una copia íntegra ya conciliada, ubicar los registros en el volumen preservando su estructura.
3. Configurar en `deploy/.env` la ruta `CENTRAL_RECORDS_DIR`, una clave privada nueva `CHANNEL_TEST_WORKER_KEY` de 32 caracteres como mínimo y un `ADMIN_SETUP_KEY` privado si hace falta crear el administrador. Dejar `CENTRAL_CLOUD_SENDS=false` durante la prueba. El proceso usa el usuario Node del contenedor (UID 1000) y necesita acceso de escritura al volumen.
4. Ejecutar `docker compose -f deploy/compose.yaml up -d --build app`. El puerto se publica solo en loopback. Para usar OpenJarvis desde el puente existente, exponer el panel detrás de un proxy HTTPS y configurar `CENTRAL_CLOUD_OPENJARVIS=true` y su clave privada. Usar el modo de nube con una sola réplica y un único disco local persistente. El bloqueo del disco impide arrancar dos servidores sobre el mismo directorio.
5. Si se va a usar correo, trasladar el diario a `CENTRAL_EMAIL_DIR` y configurar `deploy/.env.email` con la cuenta y credenciales autorizadas para SMTP e IMAP. Comprobar primero con `docker compose -f deploy/compose.yaml --profile email up -d --build`. El servicio de correo puede revisar el buzón y los rebotes con los envíos bloqueados.
6. Cuando la base activa y la copia conciliada coincidan, detener los envíos del ejecutor anterior y configurar `CENTRAL_CLOUD_SENDS=true` para el corte. Verificar el primer envío y la recuperación de un reinicio antes de retirar la instalación anterior. Las campañas conservan sus países, cupos y reglas de aprobación.

Este despliegue reutiliza el generador MP4 y sus pantallas públicas, requiere autenticación administrativa y conserva la base en disco. El modo de nube no sincroniza automáticamente con la antigua base de Publish. WhatsApp Business, el envío automático de videos y la publicación en Instagram requieren sus integraciones oficiales y una prueba real antes de habilitar los canales.

## Datos y cambio de operación

1. Conservar por separado la base publicada y el último punto de control de la PC dedicada. Incluir base comercial, colas, historial de OpenJarvis, comprobantes de envío y archivos de video que se quieran conservar. Registrar fecha, checksum y conteos. Conservar credenciales y configuraciones sensibles fuera del repositorio, con acceso restringido.
2. Restaurar ambas fuentes en una base de prueba y conciliar por identificador y por claves de negocio. Revisar conflictos, pagos, bajas, envíos inciertos y diferencias de historial. La copia de la web y la copia de la PC pueden contener actividad distinta.
3. Implementar almacenamiento de nube antes de mover el proceso principal. Firestore permite guardar contactos, conversaciones, mensajes, campañas, pagos, calendarios y colas en colecciones separadas. Usar transacciones para asignar un mensaje a un único ejecutor y conservar los identificadores originales. Usar Cloud Storage privado para video, copias e informes. Un directorio de Cloud Run es temporal.
4. Probar una copia con envíos bloqueados. Ejecutar ciclos programados aunque el panel esté cerrado. Comprobar recuperación tras un reinicio, reintentos, exclusión de campañas incompatibles, roles y trazabilidad. Hacer un envío autorizado de prueba a un destino controlado y verificar el identificador devuelto por el proveedor.
5. Importar las diferencias desde el último respaldo. Cuando ambos registros coincidan, detener las asignaciones del ejecutor anterior y activar el nuevo. Mantener ambos respaldos y el ejecutor de la PC disponibles para recuperación hasta comprobar el funcionamiento continuo. Antes de una reversión, conciliar los intentos registrados desde el cambio.

## Procesos independientes

| Componente | Ejecución prevista |
| --- | --- |
| Panel y API | Servicio de Cloud Run publicado desde Google AI Studio, autenticación administrativa y secretos del despliegue. |
| Investigación y campañas | Proceso invocado por Cloud Scheduler con identidad de servicio. Arrendar cada ciclo en la base, limitar trabajo por ejecución y guardar las operaciones con evidencia. |
| OpenJarvis | Ejecutar el puente de este repositorio y OpenJarvis más Ollama en el mismo contenedor de trabajo o equipo virtual. El modelo escucha por loopback. Medir tiempo, CPU y memoria con el modelo real para elegir entre ejecuciones programadas o ejecución persistente. |
| Correo | Integración autorizada con Gmail API para envío y sincronización incremental. Guardar el identificador del proveedor y el cursor de lectura. Un intento incierto queda sujeto a conciliación y un correo aceptado queda registrado con el identificador devuelto. |
| WhatsApp | WhatsApp Business Cloud API para el resumen privado diario y campañas que cuenten con autorización. Usar una plantilla aprobada si corresponde. A las 20:00 de Buenos Aires, registrar un envío por fecha de operación, con consultas escaladas y pagos pendientes para revisión del propietario. |
| Videos | Aislar Chromium y FFmpeg cuando el volumen lo requiera. Conservar guion y MP4 en almacenamiento privado con estado de revisión y aprobación. Para pantallas privadas se necesita acceso expresamente autorizado. |

El puente admite un modo de prueba en la nube con `CENTRAL_CLOUD_OPENJARVIS=true`, `REQUIRE_ADMIN_AUTH=true` y `OPENJARVIS_WORKER_KEY` de al menos 32 caracteres. Usar esa clave también en el entorno del puente, junto con `CENTRAL_URL`, `OPENJARVIS_STATE_DIR` en un volumen persistente y `OPENJARVIS_MODEL`. El estado de la cola del servidor debe estar en almacenamiento duradero antes del corte. Esta conexión abre consultas y planificación. La ejecución de envíos sigue bloqueada en el modo de supervisión publicado.

El [despliegue del ejecutor de OpenJarvis](../openjarvis-worker/cloud/README.md) incluye la descarga del modelo, comprobaciones de salud, la conexión privada con Central Comercial y el volumen para conservar el estado del puente en un servidor Linux.

Los planes gratuitos de Cloud Run, Cloud Scheduler y Firestore tienen límites y condiciones por región, cuenta y consumo. El coste más incierto es mantener OpenJarvis y su modelo disponibles 24 horas. Medir el consumo primero y solicitar autorización antes de activar facturación o usar servicios pagos.

- [Google AI Studio y despliegue](https://ai.google.dev/gemini-api/docs/aistudio-build-mode)
- [Precios de Cloud Run](https://cloud.google.com/run/pricing)
- [Precios de Cloud Scheduler](https://cloud.google.com/scheduler/pricing)
- [Cuotas de Firestore](https://docs.cloud.google.com/firestore/quotas)
- [API de OpenJarvis](https://open-jarvis.github.io/OpenJarvis/deployment/api-server/)

## Tandas diarias y publicación

La interfaz de AI Studio sigue publicándose desde GitHub. Cuando exista el servidor HTTPS de operación con la base reconciliada, configurar `CENTRAL_OPERATIONS_URL` en Publish para que sus acciones y consultas usen esa misma API. La versión publicada sin esa variable conserva su comportamiento actual. Mantener los secretos de correo, OpenJarvis y tareas fuera de Publish.

En el servidor de operación con disco persistente, configurar `CENTRAL_CLOUD_BATCHES=true` y una nueva `CENTRAL_BATCH_KEY` de al menos 32 caracteres. En el modo de tandas no arranca el bucle comercial permanente. Si se usa Cloud Run Jobs, compilar el objetivo `batch` de `deploy/Dockerfile` y configurar tres trabajos de una sola tarea, con `CENTRAL_BATCH_PHASE` igual a `buscar`, `enviar` o `revisar`. Programarlos a las 09:00, 13:00 y 19:00 en `America/Argentina/Buenos_Aires`, con límite de una hora. Configurar la URL HTTPS de la API y la clave privada de tandas. Los trabajos de correo necesitan además sus propias credenciales y un directorio privado persistente compartido entre envío y revisión para conservar el diario y el cursor IMAP. Usar el mismo servidor y las mismas claves de trabajador en todos los ciclos. En este modo no iniciar el perfil de correo continuo.

- La tanda de las 09:00 puede usar la imagen `deploy/research.Dockerfile`. El contenedor verifica con la API si corresponde ejecutar la tanda, inicia Ollama y OpenJarvis en loopback, confirma el modelo y espera que el puente se registre. Al terminar, detiene los tres procesos. Montar los directorios `OLLAMA_MODELS` y `OPENJARVIS_STATE_DIR` con acceso de escritura para el UID 10001. El modelo se descarga solo si falta. Configurar la clave `OPENJARVIS_WORKER_KEY` en el trabajo y el servidor de operación, y habilitar allí `CENTRAL_CLOUD_OPENJARVIS=true`. Las tandas de correo siguen usando el objetivo `batch` del Dockerfile principal.
- La búsqueda ejecuta hasta ocho ciclos iniciales y da tiempo adicional a las estrategias pendientes. Puede hacer un ciclo final cuando recibe esas estrategias. Si el modelo deja de responder, queda trabajo de planificación pendiente o la fuente exige revisión, la tanda se informa como incompleta. El contenedor de búsqueda se dedica a planificación de campañas; el chat interactivo requiere que OpenJarvis esté activo en un ejecutor que atienda consultas.
- La tanda de envío respeta el consentimiento, la pausa, el horario de la campaña y sus cupos. Mantener `CENTRAL_CLOUD_SENDS=false` durante el ensayo.
- La revisión importa rebotes y respuestas antes de guardar el resumen en el disco de operación. El endpoint administrativo `GET /api/batches/today` consulta el estado y el resumen. Las pruebas locales no habilitan el envío por WhatsApp.
- Si una ejecución de correo termina con error, libera su asignación si la API sigue disponible. Una interrupción sin aviso conserva la asignación del día y los intentos con resultado incierto. Revisar el registro antes de repetir un envío.

El cambio de publicación solo debe efectuarse después de comprobar la URL de operación con una copia de datos. La provisión, la compilación y ejecución de la imagen en el proveedor y la prueba real con la PC apagada requieren un entorno de nube autorizado.
