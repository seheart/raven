#!/bin/bash

# Raven - Stop Script
# Gracefully stops backend + frontend servers

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🛑 Stopping Raven servers...${NC}"

# Stop telemetry bridge first
./scripts/stop-claude-bridge.sh > /dev/null 2>&1 || true

# Kill by PID files if they exist
if [ -f /tmp/raven-backend.pid ]; then
  BACKEND_PID=$(cat /tmp/raven-backend.pid)
  if ps -p $BACKEND_PID > /dev/null 2>&1; then
    kill $BACKEND_PID 2>/dev/null
    echo -e "  Stopped backend (PID $BACKEND_PID)"
  fi
  rm /tmp/raven-backend.pid
fi

if [ -f /tmp/raven-frontend.pid ]; then
  FRONTEND_PID=$(cat /tmp/raven-frontend.pid)
  if ps -p $FRONTEND_PID > /dev/null 2>&1; then
    kill $FRONTEND_PID 2>/dev/null
    echo -e "  Stopped frontend (PID $FRONTEND_PID)"
  fi
  rm /tmp/raven-frontend.pid
fi

# Fallback: kill by process name and port
pkill -f "node server.js" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
fuser -k 3030/tcp 5173/tcp 2>/dev/null || true

sleep 1

echo -e "${RED}✓ All servers stopped${NC}"
