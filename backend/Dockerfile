# Raven Backend - Production Dockerfile
# Multi-stage build for optimal image size

# Stage 1: Dependency stage
FROM node:24-alpine AS dependencies

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev && \
    npm cache clean --force

# Stage 2: Production stage
FROM node:24-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user for security
RUN addgroup -g 1001 -S raven && \
    adduser -S -u 1001 -G raven raven

WORKDIR /app

# Copy node_modules from dependencies stage
COPY --from=dependencies --chown=raven:raven /app/node_modules ./node_modules

# Copy application source
COPY --chown=raven:raven package*.json ./
COPY --chown=raven:raven server.js ./
COPY --chown=raven:raven healthcheck.js ./
COPY --chown=raven:raven db.js ./
COPY --chown=raven:raven developer-db.js ./
COPY --chown=raven:raven metrics-collector.js ./
COPY --chown=raven:raven trigger-engine.js ./
COPY --chown=raven:raven sync-service.js ./
COPY --chown=raven:raven health-checks.js ./
COPY --chown=raven:raven routes ./routes
COPY --chown=raven:raven middleware ./middleware
COPY --chown=raven:raven services ./services
COPY --chown=raven:raven utils ./utils
COPY --chown=raven:raven config ./config
COPY --chown=raven:raven dist ./dist

# Create necessary directories
RUN mkdir -p /app/.raven/databases /app/.raven/snapshots /app/logs && \
    chown -R raven:raven /app/.raven /app/logs

# Switch to non-root user
USER raven

# Expose port
EXPOSE 3030

# Health check using dedicated script
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD ["node", "healthcheck.js"]

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "server.js"]
