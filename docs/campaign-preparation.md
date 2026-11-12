# Preparación de campañas por email

En Campañas, «Preparar correos» genera notas personalizadas y las guarda en Conversaciones como `preparado`. No existe ninguna llamada al proveedor de correo ni a WhatsApp en esta operación. La preparación no modifica el estado comercial ni el historial de envíos del contacto.

Para repetir la preparación automáticamente, editar la campaña, marcar «Preparar correos automáticamente» y dejarla en estado Lista. El motor del servidor revisa nuevas oportunidades cada 30 segundos mientras esté ejecutándose y las automatizaciones no estén pausadas. Una campaña bloqueada solo por falta de conexión también puede preparar borradores. Borrador, Pausada y Finalizada no se procesan automáticamente.

La selección exige aplicación habilitada, contacto autorizado, fuente con fecha de revisión, correo válido y coincidencia de aplicación, país e idioma. Se admiten varios países separados por comas, como en el asistente existente. El tipo de organización debe coincidir exactamente con el segmento, ignorando mayúsculas y acentos; vacío incluye todos los tipos. Clientes, descartados y bajas quedan excluidos. Si ya hay una respuesta en una conversación de esa aplicación, se requiere revisar esa conversación.

La misma campaña no vuelve a preparar un contacto ni otro registro con el mismo correo. El cupo diario usa la zona horaria de la campaña y cuenta los borradores ya creados ese día, incluso después de reiniciar. Las fechas delimitan los días de preparación; la ventana horaria de envío no ejecuta envíos en esta etapa.

Variables: `{nombre}`, `{organizacion}`, `{cargo}`, `{pais}`, `{aplicacion}`, `{web}`. Las variables desconocidas bloquean la preparación. El contenido proviene exclusivamente de la plantilla guardada, sin generación de afirmaciones, precios o planes por IA.

La última preparación muestra cantidad de borradores, bloqueos y exclusiones. Los borradores se contabilizan como pendientes, nunca como enviados. No se inicia WhatsApp Web ni se crean contactos en WhatsApp.

Verificación: `npm run test:campaigns`, `npm run test:channels`, `npm run lint`, `npm run build`.

## Revisión de notas

En Conversaciones, cada borrador preparado por email permite editar, aprobar o descartar la nota. Una edición invalida la aprobación anterior. La revisión conserva fecha, operador, revisión numérica y destinatario aprobado; no genera evidencia de envío ni cambia el estado comercial del contacto. Las solicitudes con una revisión anterior se rechazan para evitar sobrescribir cambios recientes.

La aprobación comprueba nuevamente que la aplicación y el contacto estén habilitados, que el correo sea válido y que la fuente tenga revisión. Descartar conserva la nota y la excluye del contador de pendientes. La preparación automática no regenera notas descartadas de la misma campaña. Aprobar todavía no envía el correo.

## Catálogo de cuatro aplicaciones

Se incorporan Open Voley, Visibility AI, NeuroPlaneta y Funeraria también en bases existentes. La migración versionada conserva IDs, contactos, conversaciones, cuentas, tarifas personalizadas y enlaces propios. Los precios antiguos de ejemplo conocidos se archivan sin borrar sus registros. Las nuevas instalaciones ya no contienen esos precios ficticios.

Precios consultados el 12/11/2026: Open Voley DT ARS 30.000 / USD 20; Club Pro ARS 52.500 / USD 35; Federación ARS 148.500 / USD 99 por mes. Brasil tiene tabla independiente en USD con precio a consultar. Visibility: Diagnóstico USD 30 único; Monitor USD 50, Growth USD 100, PRO USD 200 y Agency USD 350 por mes. NeuroPlaneta: Familia USD 20 por mes y prueba de 2 días. Funeraria se registra sin tarifa de lanzamiento y conserva el estado en desarrollo.

Cada plan importado incluye fuente, fecha y mercado. Open Voley y NeuroPlaneta fueron comprobados en la página publicada; Visibility fue contrastado con src/config/markets.ts porque la web publicada presenta acceso privado. Diagnóstico conserva el cobro único aprobado por el propietario. La respuesta sin Gemini también usa el catálogo verificado. No se contrata ningún servicio ni se crean cargos.
