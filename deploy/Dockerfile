FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY index.html tsconfig.json vite.config.ts ./
COPY src/ src/
RUN npm run build
COPY server.ts ./
COPY server/ server/

FROM node:24-bookworm-slim AS web
RUN apt-get update && apt-get install -y --no-install-recommends chromium util-linux \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /app /app
ENV NODE_ENV=production PORT=8080 CHROME_PATH=/usr/bin/chromium
USER node
CMD ["flock","-n","/var/lib/central/records/.server.lock","node","--import","tsx","server.ts"]

FROM node:24-bookworm-slim AS email
WORKDIR /app
COPY email-worker/package.json email-worker/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY email-worker/worker.mjs email-worker/journal.mjs ./
USER node
CMD ["node","worker.mjs"]
