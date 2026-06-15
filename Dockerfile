FROM node:20-alpine

# Install build tools for sqlite3 native module
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files first (layer caching)
COPY package*.json ./

# Install production dependencies only
RUN npm install --only=production

# Copy project files
COPY . .

# Create data directory for SQLite database
RUN mkdir -p /app/data

# Expose port
EXPOSE 3333

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3333/api/server-info || exit 1

CMD ["node", "server.js"]
