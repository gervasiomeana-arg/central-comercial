# Cuenta corriente y vencimientos

La cuenta corriente registra asientos internos, no cargos bancarios ni facturas fiscales. Los pagos continúan ingresando pendientes de confirmación manual. El módulo no conecta ni utiliza WhatsApp Web y no envía avisos.

## Activación

Al registrar una suscripción, se puede elegir un plan del catálogo o escribir el importe acordado. No hay importes de ejemplo precargados. Se pueden registrar períodos mensuales, trimestrales, anuales y de pago único. Los valores guardados son los del acuerdo con el cliente: una modificación posterior del catálogo no los reemplaza.

Las nuevas suscripciones permiten activar vencimientos automáticos. Las existentes mantienen esta opción apagada; el propietario puede pulsar «Activar desde hoy». No se generan asientos de períodos anteriores a la activación. Pausar y reactivar comienza otra vez desde la fecha de reactivación. La opción global de pausar automatizaciones también detiene el procesamiento programado.

El motor del servidor genera los períodos vencidos cada 30 segundos mientras esté ejecutándose. «Actualizar vencimientos» permite procesarlos manualmente. Cada combinación de suscripción y fecha tiene un ID estable; un reinicio o ejecución repetida no duplica el asiento. Un asiento anulado tampoco se regenera.

Las fechas se calculan con calendario y día ancla, no sumando 30 días: una suscripción del 31 de enero vence el 28/29 de febrero y el 31 de marzo. La fecha contable usa Argentina. Los vencimientos se registran al comienzo del período; las pruebas gratuitas, suscripciones canceladas o vencidas y aplicaciones no listas no generan asientos automáticos.

## Aplicación de pagos

Un pago pendiente o rechazado no reduce el saldo. El propietario puede seleccionar la suscripción al informar el pago; se aplica únicamente después de confirmarlo. Los pagos históricos no se aplican por suposición: aparecen como «Pagos confirmados sin asignar» y se pueden asociar explícitamente a una suscripción del mismo cliente, app y moneda.

Los importes se calculan en centavos. Los pagos se aplican por orden de vencimiento dentro de la suscripción asignada. Los pagos parciales dejan saldo; los excedentes quedan a favor de esa suscripción. Las monedas se muestran separadas y no se convierten. Cambiar un pago a rechazado vuelve a calcular el saldo a partir de su estado actual.

Al anular un asiento, se exige un motivo y se conservan fecha, operador e importe original. La anulación no devuelve dinero. Un recordatorio interno de vencimiento se completa al saldarse o anularse el asiento; no se crea un recordatorio repetido cada ciclo.

Una vez iniciada una cuenta, cambiar cliente, aplicación, moneda, fecha de inicio o intervalo exige registrar otra suscripción para conservar el historial anterior. Cambiar el importe acordado no reescribe asientos ya generados; antes del cambio se procesan los períodos pendientes con el importe anterior.

## Verificación

`npm run test:ledger`, `npm run test:campaigns`, `npm run test:channels`, `npm run lint` y `npm run build`. La prueba aislada de base incluye creación idempotente de vencimientos, registro pendiente de un pago, aplicación posterior a confirmación y conservación de un asiento anulado. No utiliza datos de producción.
