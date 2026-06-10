# syntax=docker/dockerfile:1.7
# CVantage production image (issue #93 / 11.1)
# One container serves the API and the SPA. Yarn 1 classic ships with the
# node image - no corepack anywhere (project rule).

ARG NODE_VERSION=22

# ---------- stage 1: build everything ----------
FROM node:${NODE_VERSION} AS build
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=1
# manifests first for layer-cached installs
COPY package.json yarn.lock ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY frontend/package.json frontend/
RUN yarn install --frozen-lockfile --network-timeout 300000
COPY shared/ shared/
COPY server/ server/
COPY frontend/ frontend/
COPY tsconfig*.json ./
RUN yarn workspace @cvantage/shared build \
 && yarn workspace @cvantage/server build \
 && yarn workspace @cvantage/frontend build

# ---------- stage 2: production node_modules ----------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=1
COPY package.json yarn.lock ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY frontend/package.json frontend/
# shared is consumed via its built dist through the workspace symlink
COPY --from=build /app/shared/dist shared/dist
RUN yarn install --production --frozen-lockfile --network-timeout 300000 \
 && yarn cache clean

# ---------- stage 3: runtime ----------
FROM node:${NODE_VERSION}-slim AS runtime
ARG APP_VERSION=dev
ARG GIT_SHA=unknown
LABEL org.opencontainers.image.title="cvantage" \
      org.opencontainers.image.source="https://github.com/adityaparab/CVantage" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}"

# chromium for PDF export + fonts; tini as PID 1
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium fonts-liberation fonts-noto-core fonts-noto-color-emoji fontconfig tini \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    APP_VERSION=${APP_VERSION}

COPY --from=deps  --chown=node:node /app/node_modules ./node_modules
COPY --from=deps  --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/shared/dist ./shared/dist
COPY --from=build --chown=node:node /app/shared/package.json ./shared/package.json
COPY --from=build --chown=node:node /app/server/dist ./server/dist
COPY --from=build --chown=node:node /app/server/package.json ./server/package.json
COPY --from=build --chown=node:node /app/frontend/dist ./frontend/dist

# writable upload dir for the local-disk storage driver
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/v1/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server/dist/main.js"]
