# ==============================================================================
# Stage 1: Build the React Client SPA Bundle
# ==============================================================================
FROM node:22-alpine AS client-builder

WORKDIR /app/client

# Install frontend dependencies cleanly using package-lock
COPY client/package.json client/package-lock.json ./
RUN npm ci

# Copy client source files and configuration
COPY client/ ./

# Build arguments for Vite environment variables with enterprise defaults
ARG VITE_API_URL=/api
ARG VITE_SUPER_ADMIN_ID=10001
ARG VITE_SUPER_ADMIN_GROUP_NAME=ADMINISTRATORS
ARG VITE_ENABLE_EMAIL_REPORTS=false

ENV VITE_API_URL=${VITE_API_URL} \
    VITE_SUPER_ADMIN_ID=${VITE_SUPER_ADMIN_ID} \
    VITE_SUPER_ADMIN_GROUP_NAME=${VITE_SUPER_ADMIN_GROUP_NAME} \
    VITE_ENABLE_EMAIL_REPORTS=${VITE_ENABLE_EMAIL_REPORTS}

# Compile TypeScript and build production bundle into /app/client/dist
RUN npm run build

# ==============================================================================
# Stage 2: Production Runtime (OpenShift / Kubernetes v1.33+ Compliant)
# ==============================================================================
FROM node:22-alpine

# Install dumb-init for PID 1 signal forwarding and zombie reaping in Kubernetes
RUN apk add --no-cache dumb-init

WORKDIR /app

# Set default production environment variables
ENV NODE_ENV=production \
    PORT=5000

# Install backend production dependencies only
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev --ignore-scripts

# Copy backend application source code
COPY server/ ./server/

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
