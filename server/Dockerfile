# The API server. Node runs the TypeScript files directly, so there is no build step.
FROM node:22-alpine

WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
# The cache keeps downloaded packages, so a slow or interrupted build does not start from zero.
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --prefer-offline --no-audit --no-fund

COPY shared /app/shared
COPY server ./

# Not as root. The photos folder is a volume (docker-compose.yml), so it must belong to this user.
RUN mkdir -p uploads && chown -R node:node uploads
USER node

EXPOSE 3001
CMD ["node", "index.ts"]
