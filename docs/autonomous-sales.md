# Objetivo y dirección comercial

El panel **Objetivo del mes** permite configurar mes, clientes nuevos a alcanzar, países, límite de correos y páginas públicas a investigar, y activar o pausar cada capacidad. Noviembre de 2026 comienza con una meta conjunta de cinco clientes de Open Voley, Visibility AI y NeuroPlaneta. Funeraria queda excluida mientras esté en desarrollo. La meta es comercial; no representa una promesa de resultados.

Se cuentan clientes únicos por su primer pago confirmado manualmente y con fecha del mes elegido. Las renovaciones, pruebas, pagos pendientes y clientes repetidos en dos aplicaciones no suman dos conversiones al objetivo conjunto. Cada aplicación muestra además sus primeros pagos por separado.

## Investigación y campañas

El planificador crea campañas por aplicación y país, sin duplicarlas. Parte de públicos concretos: clubes/escuelas/asociaciones de vóley, agencias/consultoras digitales, e instituciones educativas con contacto institucional público. Rota consultas diariamente. Consulta el RSS público de Bing y luego páginas públicas HTTPS de las organizaciones. El acceso depende de la disponibilidad del proveedor; no hay una API paga contratada ni una garantía de cobertura.

Cada contacto conserva la URL y fecha donde se publicó el email o enlace de WhatsApp, y evidencia de afinidad y país. No se inventan direcciones, no se investigan familias ni datos de niños y no se confunde publicación de un contacto con consentimiento del destinatario. Las campañas del objetivo permiten expresamente contacto comercial institucional público; una baja o permiso revocado siempre bloquea nuevos envíos. La investigación deduplica por email y dominio y tiene cupos diarios persistentes. Un bloqueo del buscador detiene su uso para revisión, sin intentar evadirlo. Un error de DNS o de red queda registrado, no se muestra como búsqueda exitosa.

El plan puede ampliarse editando campañas, públicos y plantillas. No estima ventas ni tasas de conversión inexistentes. Una vez alcanzada la meta deja de buscar y contactar nuevos prospectos; conserva la atención de respuestas. Cambiar de mes requiere configurar la meta de ese mes.

## Ejecutor comercial de correo

`email-worker/` es un programa independiente para la computadora que permanecerá encendida, con Node.js 20 o posterior. Ejecutar `iniciar-correo.bat`: en la primera ejecución abre `.env` para completar las conexiones del correo propio. Después instala dependencias gratuitas y arranca el programa. El servidor Central Comercial debe estar ejecutándose y ser accesible; una pestaña abierta no reemplaza al servidor.

Configurar `CHANNEL_TEST_WORKER_KEY` con el mismo secreto privado de al menos 32 caracteres del servidor, `EMAIL_ADDRESS`, SMTP e IMAP. En Gmail corresponde usar una contraseña de aplicación cuando esté disponible en la cuenta; no la contraseña habitual de Google. No subir `.env`, sesiones o `email-state.json` al repositorio. El ejecutor usa TLS, comprueba las conexiones reales antes de declararlas listas y no inicia WhatsApp.

El SMTP acepta un correo antes de que pueda considerarse enviado al proveedor. Eso no acredita entrega ni lectura. Antes de transmitir se guarda un intento con identificador y una reserva exclusiva; la computadora conserva un diario local. Un resultado incierto no se reintenta automáticamente. Una pérdida de conexión no duplica el envío. Los límites diarios, los horarios, las bajas y las pausas se revalidan antes de reservar cada correo. Se admite un único ejecutor activo.

El lector IMAP consulta cabeceras y solo importa el texto de respuestas cuyo remitente y referencias coincidan con un envío aceptado registrado. No copia el buzón completo ni adjuntos. Ignora respuestas automáticas identificadas. Resuelve preguntas sencillas con información verificada del catálogo, sin usar una API de IA paga. Las consultas de Brasil, negociaciones, reclamos, pagos y consultas sin respuesta verificada crean tareas para el propietario. El operador puede preparar una respuesta en Conversaciones; se encola como respuesta aprobada al hilo, y el ejecutor la transmite. No se marca enviada al guardarla.

Una intención explícita de contratar crea la ficha de cliente y una tarea para acordar el plan. No confirma un pago ni activa el acceso en las otras aplicaciones. El propietario registra suscripción y verifica el primer pago; la cuenta corriente existente registra vencimientos, saldo y crédito por moneda. Los accesos de las otras apps requieren sus integraciones específicas.

## Operación y límites verificables

Para operar de forma continua deben permanecer activos el servidor, el ejecutor, Internet y la computadora sin suspensión. No hay costos de software agregados por esta implementación; correo, equipo, conexión y cualquier alojamiento tienen sus propias condiciones y límites. No se realizaron envíos comerciales reales con credenciales nuevas durante las pruebas de código.

La publicación web estaba bloqueada por Google con el mensaje `Suspicious activity detected. Request blocked for project gen-lang-client-0958943545`. Los cambios del repositorio no acreditan publicación. Se requiere resolver ese bloqueo antes de presentar esta versión como disponible en la URL pública. WhatsApp Web sigue expresamente postergado: solo se recopilan contactos públicos, sin iniciar sesión ni enviar mensajes.

Validación: `npm run lint`, `npm run build`, `npm run test:sales`, `npm run test:campaigns`, `npm run test:ledger`, `npm run test:channels`. Las pruebas comerciales usan una base temporal aislada, sin mensajes a destinatarios reales y sin modificar la base de producción.
