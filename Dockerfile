# Stage 1: Build Frontend
FROM node:20-bookworm AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Build Backend
FROM node:20-bookworm AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
COPY backend/prisma ./prisma/
RUN npm ci
COPY backend/ ./
RUN npx prisma generate && npm run build

# Stage 3: Production Server
FROM node:20-bookworm
WORKDIR /app/backend

# Install libvips and poppler-utils for PDF-to-PMTiles generation
RUN apt-get update && apt-get install -y libvips-tools poppler-utils bc && rm -rf /var/lib/apt/lists/*

# Copy backend build and dependencies
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=backend-builder /app/backend/node_modules ./node_modules
COPY --from=backend-builder /app/backend/package*.json ./
COPY --from=backend-builder /app/backend/prisma ./prisma

# Copy frontend build output into backend public folder for static serving
COPY --from=frontend-builder /app/frontend/dist ./public

# Copy tiling scripts to both /app/scripts and /app/backend/scripts
COPY scripts/ /app/scripts/
COPY scripts/ ./scripts/
RUN chmod +x /app/scripts/*.sh ./scripts/*.sh

# Setup persistent directories for PDF uploads, single-file .pmtiles storage, and DB migrations
RUN mkdir -p /app/backend/uploads /app/storage/tiles prisma/migrations

EXPOSE 3000

# Push schema and start production server
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/server.js"]
