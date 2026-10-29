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
RUN npm run build

# Stage 3: Production Server
FROM node:20-bookworm
WORKDIR /app/backend

# Install libvips for maplibre-gl map tile generation
RUN apt-get update && apt-get install -y libvips-tools poppler-utils bc && rm -rf /var/lib/apt/lists/*

# Copy backend build and dependencies
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=backend-builder /app/backend/node_modules ./node_modules
COPY --from=backend-builder /app/backend/package*.json ./
COPY --from=backend-builder /app/backend/prisma ./prisma

# Copy frontend build output into backend public folder for static serving
COPY --from=frontend-builder /app/frontend/dist ./public
COPY scripts/ /app/scripts/

# Setup volumes for uploads and DB
RUN mkdir -p uploads prisma/migrations

EXPOSE 3000

# Start script
CMD ["sh", "-c", "npx prisma db push && node dist/server.js"]
