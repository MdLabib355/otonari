# The API server. Node runs the TypeScript files directly, so there is no build step.
FROM node:22-alpine

WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

COPY shared /app/shared
COPY server ./

# Not as root. The photos folder is a volume (docker-compose.yml), so it must belong to this user.
RUN mkdir -p uploads && chown -R node:node uploads
USER node

EXPOSE 3001
CMD ["node", "index.ts"]
