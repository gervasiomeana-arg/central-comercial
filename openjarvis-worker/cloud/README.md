# Ejecutar OpenJarvis en la nube

Este despliegue conecta OpenJarvis a la instancia publicada de Central Comercial. Se ejecuta en un servidor Linux x86_64 con Docker Compose v2 y disco persistente. Como punto de partida para el modelo `qwen3.5:2b`, usar 2 vCPU y 8 GiB de RAM y medir la primera inferencia antes de fijar el tamaño definitivo.

## Configuración

1. En Central Comercial, habilitar `CENTRAL_CLOUD_OPENJARVIS=true` y `REQUIRE_ADMIN_AUTH=true`. Verificar que la cuenta administradora funcione y que la cola web se guarde en almacenamiento duradero. Una carpeta del contenedor de AI Studio no garantiza persistencia.
2. Configurar `OPENJARVIS_WORKER_KEY` como secreto de la publicación y del servidor que ejecuta el puente. Usar la misma clave de al menos 32 caracteres en ambos entornos. La clave del iniciador de la PC se administra por separado.
3. Clonar el repositorio en el servidor y configurar las variables del despliegue en un archivo `.env` de acceso restringido, junto a `compose.yaml`. Usar `CENTRAL_URL=https://central-comercial.ai.studio/` y `OPENJARVIS_MODEL=qwen3.5:2b`. Las variables tienen esos valores predeterminados. La clave se obtiene del gestor de secretos o del entorno administrativo.
4. En la carpeta `openjarvis-worker/cloud`, ejecutar:

   ```sh
   docker compose config --quiet
   docker compose up -d --build
   docker compose ps -a
   docker compose logs --tail=60 model jarvis bridge
   ```

Ollama descarga el modelo al disco persistente. OpenJarvis espera a que termine la descarga y el puente espera a que responda la API. Ollama y OpenJarvis escuchan por loopback en una red compartida por los contenedores, sin puertos publicados. El estado del puente se guarda en un volumen Docker aparte. Para mantener ambas copias, apagar con `docker compose stop` o `docker compose down` sin eliminar los volúmenes.

## Verificación

- En la edición publicada de Central Comercial, abrir **Conexiones** y buscar **Inteligencia en la nube · OpenJarvis** y **Listo para planificar**.
- En **Hablar con Central**, pedir una consulta comercial de prueba. Verificar que aparezca una recomendación atribuida a OpenJarvis. Probar también **Preparar estrategia** para confirmar que el resultado llega a la cola de planificación.
- Cerrar el panel y reiniciar el puente de forma controlada. Comprobar que vuelve a reportar su estado y que el procesamiento se reanuda.
- Mantener la ejecución de envíos en el modo de supervisión vigente hasta completar la migración de los canales y reconciliar el estado comercial.

Referencias: [API de OpenJarvis](https://open-jarvis.github.io/OpenJarvis/deployment/api-server/) · [Precios de Compute Engine](https://cloud.google.com/compute/vm-instance-pricing)
