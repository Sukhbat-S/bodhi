# ============================================================
# BODHI — Production Dockerfile
# Multi-stage build for Oracle Cloud ARM / any Linux VPS
# ============================================================

# Stage 1: Install dependencies
FROM node:22-slim AS deps
WORKDIR /app

# Copy root package files
COPY package.json package-lock.json ./

# Copy all workspace package.json files (needed for npm ci to resolve workspaces)
COPY packages/core/package.json packages/core/
COPY packages/bridge/package.json packages/bridge/
COPY packages/db/package.json packages/db/
COPY packages/memory/package.json packages/memory/
COPY packages/scheduler/package.json packages/scheduler/
COPY packages/notion/package.json packages/notion/
COPY packages/google/package.json packages/google/
COPY packages/knowledge/package.json packages/knowledge/
COPY packages/mcp-server/package.json packages/mcp-server/
COPY packages/channels/telegram/package.json packages/channels/telegram/
COPY apps/server/package.json apps/server/
COPY apps/dashboard/package.json apps/dashboard/

RUN npm ci

# Stage 2: Build dashboard (Vite + React)
FROM node:22-slim AS dashboard-build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build -w @seneca/dashboard

# Stage 3: Runtime
FROM node:22-slim
WORKDIR /app

# Install curl (for healthcheck) and tsx (for TypeScript runtime)
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
RUN npm install -g tsx @anthropic-ai/claude-code

# Copy hoisted node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy full source (tsx runs TypeScript directly, no build step needed)
COPY . .

# Copy built dashboard from build stage
COPY --from=dashboard-build /app/apps/dashboard/dist ./apps/dashboard/dist

HEALTHCHECK --interval=60s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

EXPOSE 4000

CMD ["tsx", "apps/server/src/index.ts"]
