# syntax=docker/dockerfile:1

FROM node:22.17.1-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json turbo.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY ai/package.json ai/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN npm ci

COPY frontend frontend
COPY packages/contracts packages/contracts
COPY packages/ui packages/ui
RUN npm run build --workspace @fitai/frontend

FROM node:22.17.1-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0

COPY --from=builder --chown=node:node /app/frontend/.next/standalone ./
COPY --from=builder --chown=node:node /app/frontend/.next/static ./frontend/.next/static
COPY --from=builder --chown=node:node /app/frontend/public ./frontend/public

USER node
EXPOSE 8080
WORKDIR /app/frontend
CMD ["node", "server.js"]
