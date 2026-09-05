# =====================================================================
# Dockerfile — SambaPOS V3 Web Clone (backend + frontend served together)
# =====================================================================
# Multi-stage build: install deps, copy source, expose port, start server.
# =====================================================================

FROM node:20-slim

# Install sqlite3 build deps (node-gyp needs python3 + make + g++)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files + install deps first (better layer caching)
COPY backend/package*.json ./
RUN npm install --production

# Copy backend source
COPY backend/src ./src
COPY backend/knexfile.js ./knexfile.js 2>/dev/null || true

# Copy frontend (served as static by Express)
COPY frontend ./../frontend

# Create data directory for SQLite (will be mounted as volume)
RUN mkdir -p /app/data
ENV SAMBA_DB_PATH=/app/data/samba.db
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# Run migrations + seed on first start, then launch server
CMD ["sh", "-c", "node node_modules/knex/bin/cli.js migrate:latest --knexfile src/infrastructure/db/knexfile.js && (node node_modules/knex/bin/cli.js seed:run --knexfile src/infrastructure/db/knexfile.js || true) && node src/api/server.js"]
