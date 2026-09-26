# syntax=docker/dockerfile:1
# Single image: the Node server serves the API, Socket.IO and the built client.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci

FROM deps AS build
COPY tsconfig.base.json ./
COPY shared shared
COPY server server
COPY client client
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
# Only the server's production dependencies (native: canvas, sharp, better-sqlite3).
RUN npm ci --omit=dev --workspace server --include-workspace-root=false && npm cache clean --force
COPY shared/src shared/src
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist
COPY server/photos server/photos

WORKDIR /app/server
ENV PORT=3001 \
    DATA_DIR=/app/server/data \
    PHOTOS_DIR=/app/server/photos \
    CLIENT_DIST=/app/client/dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN sed -i 's/$//' /usr/local/bin/docker-entrypoint.sh && chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
