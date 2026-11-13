# OpenJarvis dentro de Central Comercial — primera integración

Esta etapa prepara estrategias comerciales por aplicación y país. Central Comercial conserva contactos, campañas, correo, WhatsApp y cuentas corrientes. El puente no cambia esos registros ni inicia envíos. Las propuestas del modelo se muestran para revisión: no son contactos investigados ni resultados comerciales.

## Antes de iniciar

1. Revisar RAM/procesador del equipo y elegir un modelo compatible. La guía oficial explica la selección: https://open-jarvis.github.io/OpenJarvis/getting-started/installation/
2. Instalar OpenJarvis desde su repositorio oficial y un motor local Ollama, sin configurar proveedores de pago. Este puente no instala paquetes ni descarga modelos automáticamente.
3. Descargar en Ollama el modelo elegido. El ejemplo siguiente supone que ya está disponible `qwen3.5:2b`; no garantiza rendimiento en cualquier PC.
4. Con OpenJarvis instalado y su extra `server` disponible, iniciar su API solo en la propia computadora:

```text
jarvis serve --host 127.0.0.1 --port 8000 --engine ollama --model qwen3.5:2b --agent simple
```

No cambiar el host a `0.0.0.0` ni abrir puertos del router. Usar un perfil OpenJarvis local sin herramientas de shell, canales comerciales ni enrutamiento a proveedores cloud. El puente únicamente solicita una respuesta JSON; no ejecuta las instrucciones producidas por el modelo. La configuración de OpenJarvis determina el motor que procesa esas solicitudes.

## Conectar el puente

Requiere Node.js 22 o posterior; no requiere `npm install`. Extraer la carpeta completa `openjarvis-worker` del proyecto actualizado. Abrir `INICIAR_OPENJARVIS.bat`. Reutiliza la ruta del correo guardada por el iniciador de WhatsApp en esta misma computadora. No cambia ese archivo ni pide otra clave.

Si no existe la ruta guardada, desde una consola dentro de esta carpeta:

```text
node worker.mjs "C:\ruta\Central_Comercial_Correo\.env"
```

La ruta es del archivo existente, no su contenido. No enviar `.env`, claves ni QR por chat.

Si se eligió otro modelo, establecer `OPENJARVIS_MODEL` antes de abrir el puente. `OPENJARVIS_URL` acepta únicamente una dirección de loopback literal (predeterminada `http://127.0.0.1:8000`). `OPENJARVIS_API_KEY` es opcional si la API local ya usa autenticación; no se comparte con Central Comercial.

## Usar desde la app

Después de incorporar esta versión en AI Studio y publicarla, abrir **Conexiones → Inteligencia local**. El estado solo pasa a **Listo para planificar** cuando el puente verifica `/health` y encuentra el modelo solicitado en `/v1/models`. Elegir una app lista y un país del objetivo mensual; pulsar **Preparar estrategia**. La app genera un trabajo, el puente consulta OpenJarvis y devuelve segmentos, búsquedas sugeridas, enfoque, pasos y dudas para el propietario.

La aplicación publicada no puede acceder al `localhost` de tu PC. Por eso el puente realiza conexiones salientes a Central Comercial; no se requieren túneles ni exponer el equipo a Internet. Usa la conexión privada ya configurada `CHANNEL_TEST_WORKER_KEY`, sin otorgar al modelo acceso a ella.

## Datos y costos

- A OpenJarvis solo se entregan ficha pública, funciones verificadas, país, objetivo mensual conjunto y límites. No se entregan contactos, emails privados, conversaciones, saldos, credenciales ni pagos.
- Con Ollama local no se utiliza Gemini ni se configura un proveedor cloud como respaldo. El consumo de recursos y rendimiento dependen del equipo. Cualquier configuración externa de OpenJarvis debe revisarse por separado.
- Máximo seis estrategias nuevas por día; solicitudes idénticas reutilizan el resultado durante 24 horas. Una estrategia requiere revisar vigencia, fuentes y condiciones antes de usarla.
- Fallos de conexión o respuestas inválidas quedan explícitos. No se inventan estrategias ni se regeneran tareas interrumpidas automáticamente.
- Cola independiente: `data/openjarvis_plans.json`; incluirla en respaldos del servidor. El almacenamiento local de AI Studio puede ser efímero. El respaldo comercial existente sigue siendo independiente de esta cola.
- Estado del puente: `openjarvis-worker/private-state/bridge.json`. No subirlo al repositorio.

## Alcance pendiente

Esta entrega conecta la planificación y las consultas del propietario. Aplicar automáticamente estrategias a campañas, investigar fuentes con el agente y atender consultas de clientes mediante OpenJarvis son etapas posteriores. Los envíos, límites, solicitudes de baja y confirmaciones de pago siguen en el circuito existente; este puente no los reemplaza ni promete autonomía completa.

## Hablar, escribir y escuchar informes

El menú **Hablar con Central** permite escribir o dictar una consulta y revisar el texto antes de enviarlo. **Informe actual** devuelve un informe escrito de los registros reales, incluso si OpenJarvis no está conectado. **Escuchar** lee la respuesta en voz alta; **Detener lectura** la interrumpe. La lectura automática de nuevas respuestas es opcional y comienza desactivada. Cada respuesta se puede descargar como texto.

El dictado utiliza Web Speech API cuando el navegador la admite y solicita el permiso de micrófono al iniciar. El navegador puede procesar audio con su proveedor: no se promete dictado sin conexión ni transcripción local. Central Comercial no recibe ni guarda grabaciones. El dictado se detiene automáticamente; el texto nunca se envía por el solo hecho de hablar. Las voces dependen del sistema; se prefieren las voces españolas del equipo.

Las consultas generales requieren este puente actualizado. El heartbeat anuncia la capacidad de conversación para no presentar un puente antiguo como compatible. Al modelo solo llega la consulta de texto y un informe agregado fechado; no se entregan identidades de clientes, correos, conversaciones comerciales ni credenciales. Las respuestas del modelo se muestran como **recomendaciones**, separadas de los informes deterministas. Las solicitudes de ejecutar acciones reciben una aclaración: este chat no cobra, activa campañas ni envía promociones.

Se conservan las consultas y las respuestas por escrito en `data/assistant_history.json`, con acceso administrativo igual al resto del panel. Incluir ese archivo y `data/openjarvis_plans.json` en el respaldo del servidor. El informe es acumulado, con meta mensual conjunta y filtro por aplicación; no se presenta como actividad del día. La cola del asistente limita las consultas al modelo a veinte diarias, sin llamadas a Gemini.

Contrato consultado: https://open-jarvis.github.io/OpenJarvis/deployment/api-server/
Licencia del proyecto externo: Apache-2.0. Esta integración usa su API; no incluye una copia de su código.
