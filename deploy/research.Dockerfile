FROM node:24-bookworm-slim AS node
FROM ollama/ollama:0.30.10@sha256:bfc9c6d53cc6989aa5131a6fde6b162b2802d4d337657f3253b5f69579bddeee

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates python3 python3-venv \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/jarvis \
    && /opt/jarvis/bin/pip install --no-cache-dir 'OpenJarvis[server]==1.0.4' \
    && useradd --create-home --uid 10001 jarvis \
    && install -d -o jarvis -g jarvis -m 0700 /var/lib/central-model /var/lib/central-openjarvis
COPY --from=node /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY deploy/run-batch.mjs deploy/research-runtime.mjs deploy/
COPY openjarvis-worker/client.mjs openjarvis-worker/worker.mjs openjarvis-worker/
COPY openjarvis-worker/cloud/openjarvis.toml /etc/openjarvis/config.toml
ENV PATH=/opt/jarvis/bin:$PATH HOME=/home/jarvis \
    CENTRAL_BATCH_PHASE=buscar CENTRAL_BATCH_BOOT_JARVIS=true \
    OPENJARVIS_CONFIG=/etc/openjarvis/config.toml OPENJARVIS_STATE_DIR=/var/lib/central-openjarvis \
    OLLAMA_MODELS=/var/lib/central-model
USER jarvis
ENTRYPOINT ["node","deploy/run-batch.mjs"]
