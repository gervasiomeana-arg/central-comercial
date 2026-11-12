# Pruebas reales ordenadas por Central Comercial

El panel crea una orden por canal. Este ejecutor en la computadora del propietario la retira, envía y devuelve evidencia. No usa Gmail de ChatGPT ni simula mensajes. Solo admite el email y WhatsApp de prueba ya autorizados del propietario; no ejecuta campañas a terceros.

## Preparación única

1. Descargar el repositorio actualizado en la PC e instalar Node.js LTS (20 o posterior).
2. Abrir `channel-worker/iniciar-windows.bat` (o `iniciar-windows.bat` en el paquete independiente). El asistente genera la clave privada y la copia al portapapeles en Windows. En Secrets de AI Studio, agregar `CHANNEL_TEST_WORKER_KEY`, pegar ese valor y aplicar/publicar. No usar la clave de recuperación ni guardar la nueva clave en GitHub.
3. El asistente solicita una **contraseña de aplicación** de Google, sin mostrarla en pantalla, y la conserva solo en el archivo `.env` de la PC. Google requiere verificación en dos pasos y esta opción puede no estar disponible en todas las cuentas: https://support.google.com/accounts/answer/185833. No colocar la contraseña normal de Gmail. La autorización SMTP es solo para gervasiomeana@gmail.com. Puede omitirse temporalmente el correo presionando Enter.
4. Escanear el QR que aparece en la consola usando WhatsApp > Dispositivos vinculados. El QR y la sesión permanecen en la PC. Esta integración con WhatsApp Web es extraoficial y puede fallar o restringirse; no es una API oficial gratuita.
5. Mantener el ejecutor abierto. En Central Comercial > Conectores y Sistema, pulsar **Enviar ambas pruebas** cuando ambos canales aparezcan conectados.

Las credenciales de Gmail y WhatsApp no se envían al servidor de Central Comercial. La clave de enlace sí se usa para autenticar peticiones HTTPS al servidor. No copiar `.env`, `private-state` ni el QR a chats o repositorios. Para revocar, cerrar sesión en Dispositivos vinculados, revocar la contraseña de aplicación y retirar el secreto de enlace.

## Resultados

- Correo: requiere respuesta SMTP 250 y destinatario aceptado. No afirma recepción en bandeja ni lectura.
- WhatsApp: requiere ACK del servidor. Un ID local por sí solo no se considera éxito.
- Una interrupción después de intentar enviar queda como resultado desconocido. No se reenvía automáticamente.
- Máximo cinco pruebas por canal cada 24 horas. No crea contactos, ventas, pagos ni suscripciones.
- El registro usa un archivo local del servidor (`data/channel_test_jobs.json`): ejecutar una sola instancia con almacenamiento persistente. En alojamiento efímero las órdenes pueden perderse; antes de repetir, verificar que el mensaje no haya llegado. No se garantiza entrega exactamente una vez entre despliegues.

No requiere contratar mensajería ni alojamiento adicional. La PC y la conexión deben estar disponibles. Esto implementa pruebas de canales, no búsqueda de prospectos ni campañas autónomas completas.
