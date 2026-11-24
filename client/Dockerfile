# Step 1: build the React app
FROM node:22-alpine AS build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
# The cache keeps downloaded packages, so a slow or interrupted build does not start from zero.
RUN --mount=type=cache,target=/root/.npm npm ci --prefer-offline --no-audit --no-fund
COPY shared /app/shared
COPY client ./
RUN npm run build

# Step 2: nginx serves the built files, and passes /api and /uploads on to the server
FROM nginx:1.29-alpine
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80
