#!/bin/bash

# Raven - Professional Startup Script
# Boots backend + frontend servers with enterprise-grade verification
#
# Backend Professional Boot Sequence (7 phases):
#   1. Pre-flight checks (disk, ports, directories, dependencies)
#   2. Critical services (auth, databases)
#   3. Data layer (project databases with retry)
#   4. Monitoring services (metrics + verification)
#   5. Non-critical services (watchers, triggers, bridge)
#   6. Health verification (comprehensive checks)
#   7. Stabilization period (3s wait + final checks)
#
# Expected boot time: 12-17 seconds (longer but guarantees zero errors)

set -e

# ============================================================
# AUTHENTICATION CONFIGURATION
# ============================================================
# Authentication has been removed from Raven
# The app runs without any login requirements
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

# Helper function to check ports (works on both Linux and macOS)
check_port() {
  local port=$1
  if command -v lsof &> /dev/null; then
    # lsof works on both Linux and macOS
    lsof -ti:$port 2>/dev/null
  elif command -v ss &> /dev/null; then
    # ss is Linux-only
    ss -tlnp 2>/dev/null | grep ":$port " | awk '{print $NF}' | grep -o '[0-9]*' | head -1
  elif command -v netstat &> /dev/null; then
    # netstat syntax differs between Linux and macOS
    # On macOS, netstat doesn't support -p flag, so just check if port is in use
    netstat -an 2>/dev/null | grep "LISTEN" | grep -q ":$port " && echo "in_use"
  fi
}

# Step 1: Kill existing processes
echo -e "${YELLOW}[1/6]${NC} Cleaning up existing processes..."
pkill -f "node.*dist/server.js" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
# Kill processes on specific ports (cross-platform compatible)
BACKEND_PORT_PID=$(check_port 9100)
FRONTEND_PORT_PID=$(check_port 9000)
# Only kill if PID is numeric (not "in_use" string from netstat)
if [[ "$BACKEND_PORT_PID" =~ ^[0-9]+$ ]]; then
  kill -9 $BACKEND_PORT_PID 2>/dev/null || true
fi
if [[ "$FRONTEND_PORT_PID" =~ ^[0-9]+$ ]]; then
  kill -9 $FRONTEND_PORT_PID 2>/dev/null || true
fi
sleep 1

# Step 1.5: Check backend build
echo -e "${YELLOW}[2/6]${NC} Checking backend build..."
if [ ! -d "backend/dist" ]; then
  echo -e "  📦 Building backend TypeScript (first run)..."
  cd backend && npm run build && cd ..
fi

# Step 3: Start backend in background
echo -e "${YELLOW}[3/6]${NC} Starting backend server..."
cd backend
nohup env NODE_ENV=development DISABLE_AUTH=true node dist/server.js > /tmp/raven-backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > /tmp/raven-backend.pid
disown
cd ..

# Step 4: Start frontend in background
echo -e "${YELLOW}[4/6]${NC} Starting frontend server..."
cd frontend
nohup npm run dev > /tmp/raven-frontend.log 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > /tmp/raven-frontend.pid
disown
cd ..

# Step 5: Wait for both servers to be ready
echo -e "${YELLOW}[5/6]${NC} Waiting for servers to complete professional boot sequence..."
echo -e "  ${BLUE}ℹ${NC}  Backend is running 7-phase startup with verification..."

# Wait for backend (max 30 seconds for professional boot sequence)
BACKEND_READY=false
for i in {1..60}; do
  # First check if backend is listening at all
  if curl -s http://localhost:9100/api/status > /dev/null 2>&1; then
    # Then check if all services are ready
    READY_STATUS=$(curl -s http://localhost:9100/api/health/ready 2>/dev/null | grep -o '"ready":true' || echo "")
    if [ ! -z "$READY_STATUS" ]; then
      echo -e "${GREEN}✓${NC} Backend ready on http://localhost:9100 (all services verified)"
      BACKEND_READY=true
      break
    elif [ $((i % 4)) -eq 0 ]; then
      # Show progress every 2 seconds
      echo -e "  ${BLUE}...${NC} Backend startup in progress (phase verification)"
    fi
  fi
  sleep 0.5
  if [ $i -eq 60 ]; then
    echo -e "${RED}✗${NC} Backend failed to complete startup (check /tmp/raven-backend.log)"
    echo -e "  ${YELLOW}Tip:${NC} Backend may still be booting. Run: ${YELLOW}curl http://localhost:9100/api/health/ready${NC}"
    exit 1
  fi
done

# Wait for frontend (max 10 seconds)
for i in {1..20}; do
  if curl -s http://localhost:9000 > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Frontend ready on http://localhost:9000"
    break
  fi
  sleep 0.5
  if [ $i -eq 20 ]; then
    echo -e "${RED}✗${NC} Frontend failed to start (check /tmp/raven-frontend.log)"
    exit 1
  fi
done

# Step 6: Claude Log Watcher (now built into backend - no separate bridge needed)
echo -e "${YELLOW}[6/7]${NC} Claude Log Watcher enabled (built-in)..."
# Note: ClaudeLogWatcher is now integrated directly into server.js
# It automatically monitors ALL projects via Claude's log files

# Step 7: Run comprehensive health checks (skip if SKIP_HEALTH_CHECKS=1)
if [ "${SKIP_HEALTH_CHECKS}" != "1" ]; then
  echo -e "${YELLOW}[7/7]${NC} Running comprehensive health checks..."
  echo -e "  ${BLUE}ℹ${NC}  Validating all features are operational..."

  # Run comprehensive startup validation and capture output
  cd backend
  HEALTH_OUTPUT=$(node scripts/run-startup-validation.js --wait=0 2>&1)
  HEALTH_EXIT_CODE=$?
  cd ..

  # Parse health check results
  if [ $HEALTH_EXIT_CODE -eq 0 ]; then
    # All checks passed
    PASSED_COUNT=$(echo "$HEALTH_OUTPUT" | grep -o "Passed: [0-9]*/[0-9]*" | head -1 | cut -d' ' -f2)
    echo -e "${GREEN}✓${NC} Health checks passed ($PASSED_COUNT)"
  elif [ $HEALTH_EXIT_CODE -eq 2 ]; then
    # Warnings only (non-critical failures)
    PASSED_COUNT=$(echo "$HEALTH_OUTPUT" | grep -o "Passed: [0-9]*/[0-9]*" | head -1 | cut -d' ' -f2)
    WARNING_COUNT=$(echo "$HEALTH_OUTPUT" | grep -o "Warnings: [0-9]*" | head -1 | cut -d' ' -f2)
    echo -e "${YELLOW}⚠${NC}  Health checks passed with warnings ($PASSED_COUNT, $WARNING_COUNT warnings)"
    echo -e "  ${YELLOW}Note:${NC} Some non-critical features may not be working. Check logs for details."
  else
    # Critical failures
    echo -e "${RED}✗${NC} Health checks FAILED - Critical features are broken!"
    echo ""
    echo -e "${RED}══════════════════════════════════════════════════${NC}"
    echo -e "${RED}║  STARTUP ABORTED - FIX ERRORS BEFORE DEPLOYMENT${NC}"
    echo -e "${RED}══════════════════════════════════════════════════${NC}"
    echo ""
    echo "$HEALTH_OUTPUT" | grep -E "❌|Error|Failed" | head -10
    echo ""
    echo -e "${YELLOW}Full health check report:${NC}"
    echo -e "  curl http://localhost:9100/api/health-checks/comprehensive | jq"
    echo ""
    echo -e "${YELLOW}Backend logs:${NC}"
    echo -e "  tail -50 /tmp/raven-backend.log"
    echo ""
    exit 1
  fi
else
  echo -e "${YELLOW}[7/7]${NC} Skipping health checks (SKIP_HEALTH_CHECKS=1)"
  echo -e "  ${BLUE}ℹ${NC}  Run health checks manually: ${YELLOW}curl http://localhost:9100/api/health/ready${NC}"
fi

# Get session info
SESSION_INFO=$(curl -s http://localhost:9100/health | grep -o '"session_id":"[^"]*"' | cut -d'"' -f4)

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          🚀 Raven is Running!                 ║${NC}"
echo -e "${GREEN}╠════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}  Backend:  http://localhost:9100             ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}  Frontend: http://localhost:9000             ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}  Session:  ${SESSION_INFO:0:36} ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}                                                ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}  Backend PID:  $BACKEND_PID                        ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}  Frontend PID: $FRONTEND_PID                       ${GREEN}║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Logs:${NC}"
echo -e "  Backend:  ${YELLOW}tail -f /tmp/raven-backend.log${NC} (includes Claude Log Watcher)"
echo -e "  Frontend: ${YELLOW}tail -f /tmp/raven-frontend.log${NC}"
echo ""
echo -e "${BLUE}Stop:${NC}     ${YELLOW}./stop.sh${NC}"
echo -e "${BLUE}Restart:${NC}  ${YELLOW}./restart.sh${NC}"
echo ""
