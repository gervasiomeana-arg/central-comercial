# Inicio único de Central Comercial

## Paquete completo y datos en tu PC

Esta versión incluye la interfaz compilada y el servidor de Central Comercial. Durante la preparación instala las dependencias de la app desde npm. En el primer inicio obtiene una copia íntegra de los registros publicados mediante la conexión privada existente y pausa la instancia publicada. No traslada mientras existan envíos con una asignación todavía vigente. El traslado es repetible ante fallos de red, y una base local existente nunca se sobrescribe con la copia de la publicación.

Después del traslado, Central Comercial trabaja en `http://127.0.0.1:39300`, dentro de la misma computadora, con sus datos en `%LOCALAPPDATA%\CentralComercial\runtime\records`. Esa carpeta se conserva al reiniciar y al actualizar el código. La publicación previa deja de ejecutar campañas y de servir los registros administrativos; muestra cómo abrir la instancia local. No hay dos motores activos ni dos interfaces que debas operar. Las cuatro apps que se promocionan siguen usando sus sitios públicos habituales.

El servidor escucha solo en loopback y rechaza nombres de host u orígenes de otros sitios en su API local. No habilita acceso desde Internet o desde otros equipos de la red. La copia de traslado no incluye credenciales de correo ni perfiles de WhatsApp; se reutilizan los ya guardados. Si el traslado no se verifica, el inicio se detiene sin crear una base vacía ni enviar mensajes.

## Circuito autónomo

En **Iniciar Central Comercial**, configurar aplicación, país, límite total, objetivo mensual, horario y canales. Con la opción OpenJarvis activa, el sistema solicita una estrategia al motor local, valida que sus consultas correspondan al país y a la actividad de esa app y aplica esas consultas a la investigación. Hasta contar con una estrategia válida no investiga ni prepara promociones para esa campaña. Las búsquedas consultan fuentes públicas, verifican actividad y país, deduplican contactos y conservan las páginas pendientes. Los errores o bloqueos de fuentes se muestran y no se reemplazan con contactos inventados.

Las notas usan el catálogo y las condiciones verificadas, no precios generados por el modelo. Los envíos respetan pausa, horario, límites, exclusiones y autorización de cada canal. Una búsqueda de teléfonos no da autorización para escribirles por WhatsApp. Es necesario registrar consentimiento, fecha y evidencia en el contacto, junto con permiso autorizado. Si se eligen ambos canales, se prepara una sola conversación por contacto y campaña, usando el canal preferido cuando está habilitado.

WhatsApp utiliza la sesión ya vinculada y requiere aceptación del servidor para registrar un envío aceptado. Solo procesa chats comerciales previamente asociados a mensajes de Central, no grupos ni otros chats del teléfono. Las consultas de catálogo reciben respuestas verificadas; una solicitud de baja revoca el contacto. Negociaciones, condiciones no confirmadas y avisos de pago crean una tarea para el propietario. La API web es extraoficial: cambios del servicio, revocaciones o un QR nuevo pueden necesitar intervención. No se garantiza disponibilidad permanente del proveedor.

Cuando hay intención de contratar, se crea la ficha del cliente y una tarea para confirmar plan y condiciones. La cuenta corriente registra vencimientos según la suscripción acordada. Los pagos nuevos permanecen pendientes y solo se cuentan como clientes con primer pago después de la revisión manual del propietario.

Abrir `INICIAR_CENTRAL_COMERCIAL.bat` en la raíz del proyecto actualizado. Requiere Node.js 22 o posterior. No requiere instalar dependencias nuevas para el supervisor.

## Uso diario

1. La primera vez, cerrar las ventanas anteriores de correo, WhatsApp y puente OpenJarvis. No cerrar ni desvincular el WhatsApp del teléfono.
2. Abrir el iniciador único. Reutiliza `.env` del correo y la sesión privada de WhatsApp en sus carpetas existentes; no los copia, borra ni pide otras claves.
3. Mantener abierta esa única ventana. La página de Central Comercial se abre en Windows y muestra el estado de cada componente en **Conexiones → Tu computadora**.
4. Para detener el conjunto, usar Ctrl+C en la ventana. El supervisor solo termina los procesos que él inició. La detención manual no se revierte automáticamente durante esa sesión.
5. Para el inicio tras reiniciar Windows, abrir una vez `ACTIVAR_INICIO_AUTOMATICO.bat` en la PC dedicada. Copia únicamente el código del paquete a una ubicación estable del usuario y agrega un iniciador en su carpeta Inicio. No requiere guardar la contraseña de Windows. Requiere que el usuario inicie sesión; no funciona antes de ese momento ni en una PC apagada. `DESACTIVAR_INICIO_AUTOMATICO.bat` retira ese iniciador sin borrar datos.

El inicio por sí mismo no crea campañas, cambia objetivos ni confirma pagos. Los ejecutores pueden procesar trabajos de campañas ya autorizadas y sus colas pendientes, respetando sus reglas. WhatsApp incluye promoción autorizada y consultas relacionadas, además de las comprobaciones al propietario.

## Qué localiza

- Conexión: variable `CENTRAL_CONFIG_FILE`, `.env` en la raíz o ruta guardada por el iniciador de WhatsApp en `%LOCALAPPDATA%\CentralComercial\WhatsApp\correo-path.txt`.
- Correo: `worker.mjs` y dependencias en la carpeta del `.env` ya configurado.
- WhatsApp: instalación y sesión existentes en `%LOCALAPPDATA%\CentralComercial\WhatsApp`, con su `browser-path.txt` guardado. No crea otra sesión.
- OpenJarvis: ejecutable `jarvis.exe` del PATH o `%LOCALAPPDATA%\OpenJarvis\src\.venv\Scripts\jarvis.exe`, ubicación usada por el instalador oficial de Windows. Se conserva compatibilidad con la variante sin la carpeta `src`. Se puede indicar `CENTRAL_JARVIS_EXE` para otra instalación de confianza.
- Ollama: API local `127.0.0.1:11434`; si no está ejecutándose, se intenta iniciar el ejecutable ya instalado, limitado a esa dirección. No se accede a motores remotos ni se instala Ollama automáticamente.

## Instalación inicial del motor

El paquete incluye `PREPARAR_CENTRAL_COMERCIAL.bat`. Revisa la conexión existente y ofrece preparar el motor mediante winget y uv después de escribir SI. No descarga ni ejecuta el instalador .ps1 ni el EXE de OpenJarvis. Ver la preparación integrada detallada al final de este documento.

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

### Preparación sin el instalador PowerShell

PREPARAR_CENTRAL_COMERCIAL usa el catálogo winget para Git, uv, Rust, Ollama y
las herramientas C++ de Microsoft. uv instala Python 3.12 y las dependencias del
motor oficial, fijado al commit afdbd5b35cb21f51564588c8cdbf6b74889c4f1f, en
%LOCALAPPDATA%/OpenJarvis/central-src. No ejecuta el instalador .ps1 ni el EXE de
OpenJarvis, no modifica políticas o protecciones, ni registra servicios.
La confirmación SI incluye descargas de varios GB y las autorizaciones normales
del instalador de Microsoft. Si winget falta, un permiso se rechaza, se requiere
reiniciar o un binario no inicia, se detiene con el motivo real; no declara éxito.
Comprueba importaciones del motor/extensión nativa y presencia del modelo.
Las claves y sesiones existentes no se copian a los instaladores.
Este método se revisó en el entorno de desarrollo; la ejecución e instalación
completas en Windows siguen pendientes de comprobar en la PC dedicada.

Detección v3: comprueba winget ejecutándolo, sin depender de existsSync para
alias de WindowsApps. Si falla el alias, consulta la ubicación del paquete de
Microsoft con Get-AppxPackage (solo lectura) y prueba su ejecutable. No registra
paquetes ni cambia las políticas de Windows.

### Director mensual como activación principal

Activar director autónomo toma el objetivo mensual, los países y cupos guardados.
Crea y mantiene campañas para las aplicaciones listas, excluye productos en
desarrollo y requiere estrategias validadas de OpenJarvis antes de investigar
o enviar. Continúa diariamente dentro de los límites, sin tope total de piloto.
Los envíos por WhatsApp requieren autorización ya registrada del destinatario;
la confirmación de pagos sigue siendo manual. No habilita países nuevos fuera
de los parámetros del objetivo. El piloto avanzado conserva su selección
manual y su tope total y desactiva el director mientras dure esa modalidad.
Activar la modalidad no equivale a haber enviado mensajes ni conseguido clientes.

### Contrato del planificador local

El servidor OpenJarvis se inicia sin agente genérico (server.agent vacío),
para que /v1/chat/completions use el motor directo y respete los mensajes,
temperatura y max_tokens del planificador. La versión fijada no transmite esos
parámetros al agente SimpleAgent. No se habilitan herramientas ni acciones del
modelo. La salida compacta debe superar las mismas validaciones de estructura,
país y actividad. Los fallos distinguen truncamiento, JSON, esquema, contenido
vacío y conexión; no convierten una respuesta inválida en una campaña enviada.

### Recuperación acotada de la planificación

La corrección del contrato permite como máximo tres intentos adicionales en
24 horas, uno por aplicación/país, únicamente si ya falló un intento anterior
al contrato nuevo y se agotó el cupo normal de seis. El historial se conserva
y reiniciar no renueva esta concesión. Los intentos nuevos se etiquetan con
la versión del contrato. No se cambia el límite diario de mensajes.
Las consultas de NeuroPlaneta reconocen centros institucionales de autismo,
TDAH, psicopedagogía y actividades terapéuticas; siguen excluyendo búsquedas
de personas/familias. Se conservan únicamente consultas que incluyen país y
actividad y, para NeuroPlaneta, una categoría institucional. Una estrategia
sin consultas válidas se marca fallida y no se reutiliza como completada.

### Ejecución con catálogo verificado

El director mensual aplica consultas determinísticas del público de cada app y
país autorizado cuando todavía no hay una estrategia válida del modelo. La UI
lo identifica como Catálogo verificado, sin presentarlo como resultado de IA.
Se comprueba que esas consultas sean exactamente las del catálogo antes de
investigar, preparar o enviar. Las propuestas válidas de OpenJarvis pueden
reemplazar esa base; sus fallos no bloquean una base del catálogo válida.
La interfaz muestra estado, páginas del cupo, motivo y próximo intento de
búsqueda. No elude bloqueos del buscador ni inventa contactos/resultados.

### Reparación de resultados de búsqueda ajenos

El plan de descubrimiento v3 archiva consultas, colas y contadores anteriores
por campaña, sin borrar registros ni reiniciar las solicitudes globales del día.
Las consultas deben buscar organizaciones compradoras y no la propia app.
Los títulos y resúmenes del listado se filtran por actividad y país antes de
abrir páginas; esos indicios no reemplazan la verificación en el sitio oficial.
Bing RSS se consulta con mercado e idioma; ante respuesta 200 sin resultados
pertinentes se permite una consulta HTML pública alternativa de DuckDuckGo.
No se cambia de método para evadir bloqueos ni se resuelven captchas.
No se siguen enlaces institucionales de páginas sin actividad comprobada,
salvo una visita a la portada para verificar un contacto que carece de contexto.
El cambio de cupo diario elimina esperas programadas si el propietario lo
aumenta y no hay un bloqueo del proveedor; no elimina solicitudes ya gastadas.

### Verificación de estado del director

Las campañas del director que estaban en lista pasan a activa cuando su base
comercial está lista; no se reactivan campañas pausadas ni productos en desarrollo.
Esto evita mostrar cero campañas activas mientras el director está ejecutándolas.
El estado de WhatsApp del objetivo consulta al ejecutor real y no usa el mensaje
fijo de conexión pendiente.
Se comprobó la regresión del respaldo en almacenamiento temporal: once solicitudes
consumidas, cola antigua, RSS ajeno, resultado HTML pertinente, portada, contacto,
borrador y aceptación de transporte simulada sin duplicados. También se revisó
el servidor HTTP de producción con copia aislada, actualización de objetivo,
activación/pausa y rechazo de orígenes externos. No son envíos reales.

### Calidad de correos públicos

La extracción toma correos de texto visible, enlaces mailto o datos de
organización, no de atributos de inputs ni de áreas de texto de formularios.
Una regla común excluye direcciones de ejemplo como tu@email.com. Esa misma
regla se aplica al preparar notas y al reclamar un envío, para bloquear también
borradores antiguos sin borrar sus registros. Las direcciones legítimas de
dominios gratuitos no se excluyen en bloque. El tipo de organización heredado
se conserva al editar aunque no pertenezca a las opciones predefinidas.
