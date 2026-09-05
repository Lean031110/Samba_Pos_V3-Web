# =====================================================================
# Dockerfile — SambaPOS V3 Web Clone (production multi-stage)
# =====================================================================
# Stage 1: Build (install deps, compile native bindings)
# Stage 2: Runtime (minimal image, non-root user, no build tools)
# =====================================================================

# ---- Stage 1: Builder ----
FROM node:20-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first (better layer caching)
COPY backend/package*.json ./

# Use npm ci for reproducible builds from package-lock.json
RUN npm ci --omit=dev

# ---- Stage 2: Runtime ----
FROM node:20-slim AS runtime

# Install only the runtime libsqlite3 (not build tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsqlite3-0 curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get autoremove -y

# Create non-root user
RUN groupadd -r samba && useradd -r -g samba -d /app -s /sbin/nologin samba

WORKDIR /app

# Copy node_modules from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy package files
COPY backend/package*.json ./

# Copy backend source
COPY backend/src ./src

# Copy frontend (served as static by Express)
COPY frontend ./frontend

# Create data directory for SQLite
RUN mkdir -p /app/data && chown -s samba:samba /app/data

# Switch to non-root user
USER samba

# Environment
ENV NODE_ENV=production
ENV PORT=3001
ENV SAMBA_DB_PATH=/app/data/samba.db
# JWT_SECRET MUST be set via docker-compose env or -e flag
# No default — the app refuses to start without it.

EXPOSE 3001

# Healthcheck: verify HTTP + DB
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Separate commands: migrate, seed, start
# Use a shell script that runs migrations, then starts the server.
# Seed must be run explicitly: docker compose exec samba-pos node -e "require('./src/infrastructure/db/seeds/seed.js').seed(require('knex')(require('./src/infrastructure/db/knexfile.js').production))"
CMD ["node", "src/api/server.js"]
