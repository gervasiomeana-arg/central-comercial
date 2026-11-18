FROM python:3.12-slim-bookworm AS jarvis

RUN python -m pip install --no-cache-dir 'OpenJarvis[server]==1.0.4' \
    && useradd --create-home --uid 10001 jarvis
COPY cloud/openjarvis.toml /etc/openjarvis/config.toml
ENV OPENJARVIS_CONFIG=/etc/openjarvis/config.toml
USER jarvis
ENTRYPOINT ["jarvis"]

FROM node:22-bookworm-slim AS bridge

WORKDIR /app
COPY --chown=node:node client.mjs worker.mjs ./
RUN install -d -o node -g node -m 0700 /var/lib/central-openjarvis
USER node
CMD ["node", "worker.mjs"]
