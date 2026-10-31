# Stage 30a: `docker compose up` runs the same app as the public site.
# web-build mirrors .github/workflows/pages.yml (vite build with
# PAGES_BASE=/, VITE_STATIC=1, runtime-data.tgz, committed scenarios);
# `web` serves dist on 8080; `relay` runs relay/server.mjs on 8787.
# The relay handler imports only node builtins and web/src files, so the
# relay stage needs no node_modules.

FROM node:22-slim AS web-build
ARG VITE_API_BASE=http://localhost:8787
WORKDIR /app
COPY web/package.json web/package-lock.json ./web/
WORKDIR /app/web
RUN npm ci
WORKDIR /app
COPY web/ ./web/
COPY scenarios/ ./scenarios/
WORKDIR /app/web
ENV PAGES_BASE=/ VITE_STATIC=1
RUN VITE_API_BASE=${VITE_API_BASE} npx vite build
RUN node -e "fetch('https://github.com/halo-sw/ithaca/releases/download/data-v1/runtime-data.tgz').then(async (r) => { if (!r.ok) throw new Error('runtime-data.tgz download failed: ' + r.status); const { writeFile } = await import('node:fs/promises'); await writeFile('/tmp/runtime-data.tgz', Buffer.from(await r.arrayBuffer())); })" \
  && tar -xzf /tmp/runtime-data.tgz -C dist && rm /tmp/runtime-data.tgz
RUN mkdir -p dist/scenarios && cd ../scenarios \
  && find . -name '*.json' -exec cp --parents {} ../web/dist/scenarios/ \; \
  && cp --parents transit/seoul-metro-interstation.csv ../web/dist/scenarios/

FROM node:22-slim AS web
WORKDIR /srv
COPY --from=web-build /app/web/dist ./dist
COPY web/scripts/serve-static.mjs ./
EXPOSE 8080
ENV PORT=8080
CMD ["node", "serve-static.mjs", "dist", "8080"]

FROM node:22-slim AS relay
WORKDIR /srv
COPY relay/ ./relay/
COPY web/src/ ./web/src/
EXPOSE 8787
ENV PORT=8787
CMD ["node", "relay/server.mjs"]
