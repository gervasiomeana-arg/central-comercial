# Preparación de campañas por email

En Campañas, «Preparar correos» genera notas personalizadas y las guarda en Conversaciones como `preparado`. No existe ninguna llamada al proveedor de correo ni a WhatsApp en esta operación. La preparación no modifica el estado comercial ni el historial de envíos del contacto.

Para repetir la preparación automáticamente, editar la campaña, marcar «Preparar correos automáticamente» y dejarla en estado Lista. El motor del servidor revisa nuevas oportunidades cada 30 segundos mientras esté ejecutándose y las automatizaciones no estén pausadas. Una campaña bloqueada solo por falta de conexión también puede preparar borradores. Borrador, Pausada y Finalizada no se procesan automáticamente.

La selección exige aplicación habilitada, contacto autorizado, fuente con fecha de revisión, correo válido y coincidencia de aplicación, país e idioma. Se admiten varios países separados por comas, como en el asistente existente. El tipo de organización debe coincidir exactamente con el segmento, ignorando mayúsculas y acentos; vacío incluye todos los tipos. Clientes, descartados y bajas quedan excluidos. Si ya hay una respuesta en una conversación de esa aplicación, se requiere revisar esa conversación.

La misma campaña no vuelve a preparar un contacto ni otro registro con el mismo correo. El cupo diario usa la zona horaria de la campaña y cuenta los borradores ya creados ese día, incluso después de reiniciar. Las fechas delimitan los días de preparación; la ventana horaria de envío no ejecuta envíos en esta etapa.

Variables: `{nombre}`, `{organizacion}`, `{cargo}`, `{pais}`, `{aplicacion}`, `{web}`. Las variables desconocidas bloquean la preparación. El contenido proviene exclusivamente de la plantilla guardada, sin generación de afirmaciones, precios o planes por IA.

La última preparación muestra cantidad de borradores, bloqueos y exclusiones. Los borradores se contabilizan como pendientes, nunca como enviados. No se inicia WhatsApp Web ni se crean contactos en WhatsApp.

Verificación: `npm run test:campaigns`, `npm run test:channels`, `npm run lint`, `npm run build`.
