# syntax=docker/dockerfile:1
# ==============================================================================
# Stage 1: Build the React Client SPA Bundle
# ==============================================================================
FROM node:22-alpine AS client-builder

WORKDIR /app

# Install frontend dependencies cleanly using root package-lock and npm workspace
COPY package.json package-lock.json ./
COPY client/package.json ./client/
RUN --mount=type=cache,target=/root/.npm npm ci --workspace=client --include-workspace-root

# Copy client source files and configuration
COPY client/ ./client/

# Build arguments for Vite environment variables with enterprise defaults
ARG VITE_API_URL=/api
ARG VITE_SUPER_ADMIN_ID=10001
ARG VITE_SUPER_ADMIN_GROUP_NAME=ADMINISTRATORS

ENV VITE_API_URL=${VITE_API_URL} \
    VITE_SUPER_ADMIN_ID=${VITE_SUPER_ADMIN_ID} \
    VITE_SUPER_ADMIN_GROUP_NAME=${VITE_SUPER_ADMIN_GROUP_NAME}

# Compile TypeScript and build production bundle into /app/client/dist
RUN npm run build --workspace=client

# ==============================================================================
# Stage 2: Build the Backend TypeScript Application
# ==============================================================================
FROM node:22-alpine AS server-builder

WORKDIR /app

# Install backend dependencies (including devDependencies for TypeScript compiler)
COPY package.json package-lock.json ./
COPY server/package.json ./server/
RUN --mount=type=cache,target=/root/.npm npm ci --workspace=server --include-workspace-root

# Copy server source code and TypeScript build configuration
COPY server/ ./server/

# Compile TypeScript into JavaScript in /app/server/dist
RUN npm run build --workspace=server

# ==============================================================================
# Stage 3: Production Runtime (OpenShift / Kubernetes v1.33+ Compliant)
# ==============================================================================
FROM node:22-alpine

# Install dumb-init for PID 1 signal forwarding and zombie reaping in Kubernetes
RUN apk add --no-cache dumb-init

WORKDIR /app

# Set default production environment variables
ENV NODE_ENV=production \
    PORT=5000 \
    STATIC_FILES_PATH=/app/client/dist

# Install backend production dependencies only using root package-lock
COPY package.json package-lock.json ./
COPY server/package.json ./server/
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --workspace=server --include-workspace-root --ignore-scripts

# Copy compiled backend JavaScript application from Stage 2 into /app/server
COPY --from=server-builder /app/server/dist ./server

# Copy compiled frontend SPA bundle from Stage 1 into /app/client/dist
COPY --from=client-builder /app/client/dist ./client/dist

# Configure OpenShift Restricted-v2 SCC Permissions:
# Ensure files are owned by UID 1001 and Group 0 (root group) with group-read/write permissions
# so that dynamic arbitrary OpenShift non-root UIDs can execute and access files.
RUN chown -R 1001:0 /app && chmod -R g+rwX /app

# Switch to unprivileged non-root user
USER 1001

# Expose unprivileged backend port
EXPOSE 5000

WORKDIR /app/server

# Use dumb-init as entrypoint to handle SIGTERM/SIGINT gracefully during rolling updates
ENTRYPOINT ["dumb-init", "--"]

# Launch Express server (serves both API routes and React SPA static assets)
CMD ["node", "index.js"]
