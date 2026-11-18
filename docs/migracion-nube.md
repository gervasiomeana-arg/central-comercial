# Migración de Central Comercial a la nube

GitHub sigue siendo el origen del código. Google AI Studio y Publish siguen siendo el flujo de la interfaz. Los procesos de fondo se ejecutan en infraestructura de nube con almacenamiento externo.

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

Los planes gratuitos de Cloud Run, Cloud Scheduler y Firestore tienen límites y condiciones por región, cuenta y consumo. El coste más incierto es mantener OpenJarvis y su modelo disponibles 24 horas. Medir el consumo primero y solicitar autorización antes de activar facturación o usar servicios pagos.

- [Google AI Studio y despliegue](https://ai.google.dev/gemini-api/docs/aistudio-build-mode)
- [Precios de Cloud Run](https://cloud.google.com/run/pricing)
- [Precios de Cloud Scheduler](https://cloud.google.com/scheduler/pricing)
- [Cuotas de Firestore](https://docs.cloud.google.com/firestore/quotas)
- [API de OpenJarvis](https://open-jarvis.github.io/OpenJarvis/deployment/api-server/)
