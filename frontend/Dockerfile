FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# next.config.mjs reads these at build time (basePath + rewrite destinations
# are baked into the standalone output).
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_BASE_PATH
ARG BACKEND_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH \
    BACKEND_URL=$BACKEND_URL
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
# HOSTNAME=0.0.0.0 — otherwise Next standalone binds to the container
# hostname and the loopback healthcheck can't connect.
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
ARG NEXT_PUBLIC_BASE_PATH
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -q --spider "http://127.0.0.1:3000${NEXT_PUBLIC_BASE_PATH}/" || exit 1
CMD ["node", "server.js"]
