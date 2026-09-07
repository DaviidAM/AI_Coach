# syntax=docker/dockerfile:1.7
#
# AI Coach — single Dockerfile with two targets:
#   docker build --target backend  -t ai-coach-backend  .
#   docker build --target frontend -t ai-coach-frontend .
#
# Or via docker-compose.yml (uses `target:` to pick which stage to ship).
#
# Why one Dockerfile?
#   - One source of truth for base image, build args, labels
#   - Shared stages (e.g. base) avoid duplicating apt/python layers
#   - docker-compose.yml stays the only "orchestration" file

# ============================================================
# Stage: base — common toolchain for both services
# ============================================================
FROM python:3.11-slim AS base
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# OS deps for faster-whisper (audio), edge-tts (network), healthcheck curl
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        ffmpeg \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install uv (used by backend)
RUN pip install --no-cache-dir uv

WORKDIR /app

# ============================================================
# Stage: backend — FastAPI + audio janitor
# ============================================================
FROM base AS backend

# Copy backend project files. We keep the project at /app/backend/ so
# `uv sync` finds pyproject.toml and the source lives under ./app/.
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock ./backend/
WORKDIR /app/backend

# Install backend deps into a venv via uv
RUN uv sync --frozen --no-dev

# Copy the rest of the backend source. `backend/app/...` -> `/app/backend/app/...`
COPY backend/ ./

# Backend listens on 8091 in dev; the docker-compose exposes 8000 externally
ENV PORT=8091 \
    OMNIROUTE_BASE_URL="" \
    PYTHONUNBUFFERED=1

# Make sure the audio janitor has a writable place to put files
RUN mkdir -p /app/backend/app/static/audio /app/backend/app/static/audio/stt

EXPOSE 8091

# Health check — backend exposes /api/health with real probes
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -fsS http://localhost:8091/api/health || exit 1

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8091"]

# ============================================================
# Stage: frontend-builder — install deps + Next.js build
# ============================================================
FROM node:20-alpine AS frontend-builder
WORKDIR /app

# Install deps with the lockfile
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

# Copy frontend source
COPY frontend/ ./

# Build args let the caller (docker-compose) inject the backend URL at
# build time. NEXT_PUBLIC_* is inlined into the JS bundle by Next.js.
ARG NEXT_PUBLIC_API_URL=http://localhost:8091
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Build the production bundle
RUN npm run build

# ============================================================
# Stage: frontend — slim runtime with the built bundle
# ============================================================
FROM node:20-alpine AS frontend
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Copy only the artifacts we need at runtime
COPY --from=frontend-builder --chown=nextjs:nodejs /app/public ./public
COPY --from=frontend-builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=frontend-builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=frontend-builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=frontend-builder --chown=nextjs:nodejs /app/next.config.js ./next.config.js

USER nextjs
EXPOSE 3000

# Lightweight healthcheck via the same path the bundle serves
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -fsS http://localhost:3000/ || exit 1

CMD ["npm", "run", "start"]
