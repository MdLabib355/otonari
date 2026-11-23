# Stage 1: Build the React + Vite PWA client
FROM node:22-slim AS client-builder
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Production runtime (Express 5 + PostgreSQL + built SPA/PWA)
FROM node:22-slim AS runtime
WORKDIR /app

COPY server/package.json server/package-lock.json ./server/
RUN npm ci --omit=dev --prefix server

COPY server/ ./server/
COPY client/src/i18n ./client/src/i18n
COPY --from=client-builder /app/client/dist ./client/dist

RUN mkdir -p /data/uploads && chown -R node:node /app /data

ENV NODE_ENV=production \
    PORT=3001 \
    UPLOADS_DIR=/data/uploads

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/index.js"]
