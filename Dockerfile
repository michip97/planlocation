# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Build Backend
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
COPY backend/prisma ./prisma/
RUN npm ci
COPY backend/ ./
RUN npm run build

# Stage 3: Production Server
FROM node:20-alpine
WORKDIR /app/backend

# Copy backend build and dependencies
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=backend-builder /app/backend/node_modules ./node_modules
COPY --from=backend-builder /app/backend/package*.json ./
COPY --from=backend-builder /app/backend/prisma ./prisma

# Copy frontend build output into backend public folder for static serving
COPY --from=frontend-builder /app/frontend/dist ./public

# Setup volumes for uploads and DB
RUN mkdir -p uploads prisma/migrations

EXPOSE 3000

# Start script
CMD ["sh", "-c", "npx prisma db push && node dist/server.js"]
