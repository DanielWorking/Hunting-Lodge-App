# ==============================================================================
# Stage 1: Build (Client & Server)
# ==============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy the root package files that manage the workspaces
COPY package.json package-lock.json ./

# Copy the workspace directories
COPY client/ ./client/
COPY server/ ./server/

# Install all dependencies using the single root lockfile
RUN npm ci

# Dynamic build arguments for Vite client bundle compilation
ARG VITE_API_URL=/api
ARG VITE_APP_VERSION
ARG VITE_APP_ENV=prod

ENV VITE_API_URL=${VITE_API_URL} \
    VITE_APP_VERSION=${VITE_APP_VERSION} \
    VITE_APP_ENV=${VITE_APP_ENV}

# Build both client and server using the root script
RUN npm run build

# ==============================================================================
# Stage 2: Production Runtime (OpenShift / Kubernetes v1.33+ Compliant)
# ==============================================================================
FROM node:22-alpine

# Install dumb-init for PID 1 signal forwarding and zombie reaping in Kubernetes
RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy root package files and server, client package.json for production install
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/

# Install backend production dependencies only
RUN npm ci --omit=dev --ignore-scripts

# Copy compiled backend JavaScript application from Stage 1 into /app/server
COPY --from=builder /app/server/dist ./server

# Copy compiled frontend SPA bundle from Stage 1 into /app/client/dist
COPY --from=builder /app/client/dist ./client/dist

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