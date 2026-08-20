# syntax=docker/dockerfile:1

FROM node:22.17.1-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY ai/package.json ai/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci

COPY backend backend
COPY ai ai
COPY packages/contracts packages/contracts
RUN npm run build --workspace @fitai/backend

FROM node:22.17.1-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY ai/package.json ai/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --omit=dev --workspace @fitai/backend --include-workspace-root=false \
  && npm cache clean --force

COPY --from=builder --chown=node:node /app/backend/dist backend/dist

USER node
EXPOSE 8080
CMD ["node", "backend/dist/index.js"]
