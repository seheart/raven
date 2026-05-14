#!/bin/bash
#
# Raven Backend Clean Restart Script
# Prevents port conflicts by killing old instances first
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PORT="${PORT:-9100}"
CORS_ORIGIN="${CORS_ORIGIN:-http://localhost:9000}"
API_RATE_LIMIT_MAX="${API_RATE_LIMIT_MAX:-500}"
TELEMETRY_RATE_LIMIT_MAX="${TELEMETRY_RATE_LIMIT_MAX:-5000}"
LOG_FILE="/tmp/raven-backend.log"

# Cross-platform "is this TCP port in use?". `ss` is Linux iproute2 (preferred,
# fast); `lsof` covers macOS. Returns 0 if a process is listening on $1.
port_in_use() {
  local p="$1"
  if command -v ss &>/dev/null; then
    ss -tln 2>/dev/null | grep -q ":${p} "
  elif command -v lsof &>/dev/null; then
    lsof -iTCP:"${p}" -sTCP:LISTEN -P 2>/dev/null | grep -q LISTEN
  else
    return 1
  fi
}

echo -e "${YELLOW}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}  Raven Backend Clean Restart${NC}"
echo -e "${YELLOW}═══════════════════════════════════════${NC}"
echo ""

# Step 1: Kill any existing backend processes
echo -e "${YELLOW}[1/4]${NC} Killing existing backend processes..."
pkill -f "node dist/server.js" 2>/dev/null && echo -e "${GREEN}✓${NC} Killed existing processes" || echo -e "${GREEN}✓${NC} No existing processes found"

# Step 2: Wait for port to be freed
echo -e "${YELLOW}[2/4]${NC} Waiting for port ${PORT} to be freed..."
for i in {1..10}; do
    if ! port_in_use "${PORT}"; then
        echo -e "${GREEN}✓${NC} Port ${PORT} is free"
        break
    fi
    if [ $i -eq 10 ]; then
        echo -e "${RED}✗${NC} Port ${PORT} still in use after 5 seconds"
        echo -e "${RED}  Please manually kill the process using the port${NC}"
        exit 1
    fi
    sleep 0.5
done

# Step 3: Build TypeScript
echo -e "${YELLOW}[3/4]${NC} Building TypeScript..."
npm run build > /dev/null 2>&1 && echo -e "${GREEN}✓${NC} Build complete" || {
    echo -e "${RED}✗${NC} Build failed"
    exit 1
}

# Step 4: Start backend
echo -e "${YELLOW}[4/4]${NC} Starting backend on port ${PORT}..."
PORT="${PORT}" \
CORS_ORIGIN="${CORS_ORIGIN}" \
API_RATE_LIMIT_MAX="${API_RATE_LIMIT_MAX}" \
TELEMETRY_RATE_LIMIT_MAX="${TELEMETRY_RATE_LIMIT_MAX}" \
node dist/server.js > "${LOG_FILE}" 2>&1 &

# Wait a moment and verify it started
sleep 2
if port_in_use "${PORT}"; then
    echo -e "${GREEN}✓${NC} Backend started successfully"
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════${NC}"
    echo -e "${GREEN}  Backend is running!${NC}"
    echo -e "${GREEN}═══════════════════════════════════════${NC}"
    echo -e "  Port:     ${PORT}"
    echo -e "  CORS:     ${CORS_ORIGIN}"
    echo -e "  Log file: ${LOG_FILE}"
    echo ""
    echo -e "To view logs: ${YELLOW}tail -f ${LOG_FILE}${NC}"
    echo -e "To stop:      ${YELLOW}pkill -f 'node dist/server.js'${NC}"
    echo ""
else
    echo -e "${RED}✗${NC} Backend failed to start"
    echo -e "${RED}  Check logs: tail -20 ${LOG_FILE}${NC}"
    exit 1
fi
