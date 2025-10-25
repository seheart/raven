#!/bin/bash

# Raven - Fast Startup Script
# Boots backend + frontend servers in parallel

set -e

# ============================================================
# AUTHENTICATION CONFIGURATION
# ============================================================
# By default, authentication is DISABLED for local development.
# To enable JWT authentication:
#   1. Comment out the line below (add # at start)
#   2. Restart Raven with ./restart.sh
#   3. Login with: admin / admin123
#
export DISABLE_AUTH=true
#
# When enabled, you'll see a login page at http://localhost:5173
# ============================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════╗"
echo "║          🐦‍⬛ Raven - Starting...              ║"
echo "╚════════════════════════════════════════════════╝"
echo -e "${NC}"

# Step 1: Kill existing processes
echo -e "${YELLOW}[1/4]${NC} Cleaning up existing processes..."
pkill -f "node.*dist/server.js" 2>/dev/null || true
pkill -f "node server.js" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
fuser -k 3030/tcp 5173/tcp 2>/dev/null || true
sleep 1

# Step 2: Start backend in background
echo -e "${YELLOW}[2/4]${NC} Starting backend server..."
cd backend
node dist/server.js > /tmp/raven-backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > /tmp/raven-backend.pid
cd ..

# Step 3: Start frontend in background
echo -e "${YELLOW}[3/4]${NC} Starting frontend server..."
cd frontend
npm run dev > /tmp/raven-frontend.log 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > /tmp/raven-frontend.pid
cd ..

# Step 4: Start Claude telemetry bridge
echo -e "${YELLOW}[4/5]${NC} Starting Claude telemetry bridge..."
./scripts/start-claude-bridge.sh > /dev/null 2>&1 || echo -e "${YELLOW}⚠${NC}  Telemetry bridge failed to start (non-critical)"

# Step 5: Wait for both servers to be ready
echo -e "${YELLOW}[5/5]${NC} Waiting for servers to be ready..."

# Wait for backend (max 10 seconds)
for i in {1..20}; do
  if curl -s http://localhost:3030/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Backend ready on http://localhost:3030"
    break
  fi
  sleep 0.5
  if [ $i -eq 20 ]; then
    echo -e "${RED}✗${NC} Backend failed to start (check /tmp/raven-backend.log)"
    exit 1
  fi
done

# Wait for frontend (max 10 seconds)
for i in {1..20}; do
  if curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Frontend ready on http://localhost:5173"
    break
  fi
  sleep 0.5
  if [ $i -eq 20 ]; then
    echo -e "${RED}✗${NC} Frontend failed to start (check /tmp/raven-frontend.log)"
    exit 1
  fi
done

# Get session info
SESSION_INFO=$(curl -s http://localhost:3030/health | grep -o '"session_id":"[^"]*"' | cut -d'"' -f4)

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          🚀 Raven is Running!                 ║${NC}"
echo -e "${GREEN}╠════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}  Backend:  http://localhost:3030             ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}  Frontend: http://localhost:5173             ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}  Session:  ${SESSION_INFO:0:36} ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}                                                ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}  Backend PID:  $BACKEND_PID                        ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}  Frontend PID: $FRONTEND_PID                       ${GREEN}║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Logs:${NC}"
echo -e "  Backend:  ${YELLOW}tail -f /tmp/raven-backend.log${NC}"
echo -e "  Frontend: ${YELLOW}tail -f /tmp/raven-frontend.log${NC}"
echo -e "  Bridge:   ${YELLOW}tail -f /tmp/claude-telemetry-bridge.log${NC}"
echo ""
echo -e "${BLUE}Stop:${NC}     ${YELLOW}./stop.sh${NC}"
echo -e "${BLUE}Restart:${NC}  ${YELLOW}./restart.sh${NC}"
echo ""
