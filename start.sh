#!/bin/bash
set -e

# Colors
DIM='\033[2m'
BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Spinner animation - runs in background, updates in-place
SPINNER_PID=""
spin() {
  local msg="$1"
  local frames=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")
  local i=0
  tput civis 2>/dev/null  # hide cursor
  while true; do
    printf "\r  ${CYAN}${frames[$i]}${NC} ${msg}"
    i=$(( (i + 1) % ${#frames[@]} ))
    sleep 0.08
  done
}

start_spin() {
  spin "$1" &
  SPINNER_PID=$!
}

stop_spin() {
  local symbol="${1:-${GREEN}✓${NC}}"
  local msg="$2"
  if [ ! -z "$SPINNER_PID" ]; then
    kill "$SPINNER_PID" 2>/dev/null
    wait "$SPINNER_PID" 2>/dev/null || true
    SPINNER_PID=""
  fi
  printf "\r  ${symbol} ${msg}\033[K\n"
  tput cnorm 2>/dev/null  # show cursor
}

# Ensure cursor is restored on exit
trap 'tput cnorm 2>/dev/null; [ ! -z "$SPINNER_PID" ] && kill "$SPINNER_PID" 2>/dev/null' EXIT

# Helper to check ports
check_port() {
  local port=$1
  if command -v lsof &> /dev/null; then
    lsof -ti:$port 2>/dev/null
  elif command -v ss &> /dev/null; then
    ss -tlnp 2>/dev/null | grep ":$port " | awk '{print $NF}' | grep -o '[0-9]*' | head -1
  fi
}

# ── Header ──────────────────────────────────────────
echo ""
echo -e "  ${BOLD}Raven${NC} ${DIM}starting...${NC}"
echo ""

# ── Clean up ────────────────────────────────────────
start_spin "Cleaning up old processes..."
pkill -f "node.*dist/server.js" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
BACKEND_PORT_PID=$(check_port 9100 || true)
FRONTEND_PORT_PID=$(check_port 9000 || true)
[[ "$BACKEND_PORT_PID" =~ ^[0-9]+$ ]] && kill -9 $BACKEND_PORT_PID 2>/dev/null || true
[[ "$FRONTEND_PORT_PID" =~ ^[0-9]+$ ]] && kill -9 $FRONTEND_PORT_PID 2>/dev/null || true
# Poll until ports release (usually <100ms; cap at 1.5s)
for i in {1..15}; do
  if [ -z "$(check_port 9100)" ] && [ -z "$(check_port 9000)" ]; then
    break
  fi
  sleep 0.1
done
stop_spin "${GREEN}✓${NC}" "Cleaned up"

# ── Build check ─────────────────────────────────────
if [ ! -d "backend/dist" ]; then
  start_spin "Building backend TypeScript..."
  cd backend && npm run build > /dev/null 2>&1 && cd ..
  stop_spin "${GREEN}✓${NC}" "Backend built"
fi

# ── Start servers ───────────────────────────────────
start_spin "Starting servers..."
cd backend
nohup env NODE_ENV=development DISABLE_AUTH=true node dist/server.js > /tmp/raven-backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > /tmp/raven-backend.pid
disown
cd ..

cd frontend
nohup npm run dev > /tmp/raven-frontend.log 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > /tmp/raven-frontend.pid
disown
cd ..
stop_spin "${GREEN}✓${NC}" "Servers launched"

# ── Wait for backend ────────────────────────────────
# Capture the full health JSON once; reuse for status + session_id below.
start_spin "Backend booting..."
BACKEND_HEALTH=""
for i in {1..60}; do
  BACKEND_HEALTH=$(curl -s http://localhost:9100/api/health 2>/dev/null || true)
  if echo "$BACKEND_HEALTH" | grep -q '"status":"healthy"'; then
    stop_spin "${GREEN}✓${NC}" "Backend ready"
    break
  fi
  sleep 0.5
  if [ $i -eq 60 ]; then
    stop_spin "${RED}✗${NC}" "Backend failed (check /tmp/raven-backend.log)"
    exit 1
  fi
done

# ── Wait for frontend ──────────────────────────────
start_spin "Frontend booting..."
for i in {1..20}; do
  if curl -s http://localhost:9000 > /dev/null 2>&1; then
    stop_spin "${GREEN}✓${NC}" "Frontend ready"
    break
  fi
  sleep 0.5
  if [ $i -eq 20 ]; then
    stop_spin "${RED}✗${NC}" "Frontend failed (check /tmp/raven-frontend.log)"
    exit 1
  fi
done

# ── Warm caches ─────────────────────────────────────
# Skip in fast mode — startup drops from ~30s to ~5s; first page load pays the cost.
if [ -z "$SKIP_HEALTH_CHECKS" ]; then
start_spin "Warming caches..."
BASE="http://localhost:9100/api"
CURL_PIDS=()
curl -s "$BASE/dashboard-stats" > /dev/null 2>&1 & CURL_PIDS+=($!)
curl -s "$BASE/system-metrics" > /dev/null 2>&1 & CURL_PIDS+=($!)
curl -s "$BASE/agent-stats" > /dev/null 2>&1 & CURL_PIDS+=($!)
curl -s "$BASE/agents-status" > /dev/null 2>&1 & CURL_PIDS+=($!)
curl -s "$BASE/file-events" > /dev/null 2>&1 & CURL_PIDS+=($!)
curl -s "$BASE/tracked-files" > /dev/null 2>&1 & CURL_PIDS+=($!)
curl -s "$BASE/top-modified-files" > /dev/null 2>&1 & CURL_PIDS+=($!)
curl -s "$BASE/longest-edits" > /dev/null 2>&1 & CURL_PIDS+=($!)
curl -s "$BASE/projects" > /dev/null 2>&1 & CURL_PIDS+=($!)
curl -s "$BASE/sessions" > /dev/null 2>&1 & CURL_PIDS+=($!)
curl -s "$BASE/sessions/stats" > /dev/null 2>&1 & CURL_PIDS+=($!)
curl -s "$BASE/conversations" > /dev/null 2>&1 & CURL_PIDS+=($!)
curl -s "$BASE/conversations/stats" > /dev/null 2>&1 & CURL_PIDS+=($!)
curl -s "$BASE/storage" > /dev/null 2>&1 & CURL_PIDS+=($!)
curl -s "$BASE/triggers-config" > /dev/null 2>&1 & CURL_PIDS+=($!)
curl -s "$BASE/trigger-stats" > /dev/null 2>&1 & CURL_PIDS+=($!)
curl -s "$BASE/triggered-events" > /dev/null 2>&1 & CURL_PIDS+=($!)
curl -s "$BASE/pattern-warnings" > /dev/null 2>&1 & CURL_PIDS+=($!)
curl -s "$BASE/errors" > /dev/null 2>&1 & CURL_PIDS+=($!)
curl -s "$BASE/errors/stats" > /dev/null 2>&1 & CURL_PIDS+=($!)
curl -s "$BASE/git/status" > /dev/null 2>&1 & CURL_PIDS+=($!)
curl -s "$BASE/git/history" > /dev/null 2>&1 & CURL_PIDS+=($!)
curl -s "$BASE/models" > /dev/null 2>&1 & CURL_PIDS+=($!)
curl -s "$BASE/metrics-stats" > /dev/null 2>&1 & CURL_PIDS+=($!)
curl -s "$BASE/trends/historical" > /dev/null 2>&1 & CURL_PIDS+=($!)
curl -s "$BASE/performance-correlations" > /dev/null 2>&1 & CURL_PIDS+=($!)
curl -s "$BASE/all-agent-events" > /dev/null 2>&1 & CURL_PIDS+=($!)
curl -s "$BASE/health/status" > /dev/null 2>&1 & CURL_PIDS+=($!)
curl -s "$BASE/rate-limit-status" > /dev/null 2>&1 & CURL_PIDS+=($!)
for pid in "${CURL_PIDS[@]}"; do wait "$pid" 2>/dev/null || true; done
stop_spin "${GREEN}✓${NC}" "Caches warm"
fi

# ── Done ────────────────────────────────────────────
# Session ID comes from the boot-wait response — no extra curl needed.
SESSION_INFO=$(echo "$BACKEND_HEALTH" | grep -o '"session_id":"[^"]*"' | cut -d'"' -f4)

echo ""
echo -e "  ${GREEN}${BOLD}Raven is running${NC}"
echo ""
LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo -e "  ${DIM}Frontend${NC}  http://localhost:9000"
if [ -n "$LAN_IP" ]; then
echo -e "  ${DIM}LAN${NC}       http://${LAN_IP}:9000"
fi
echo -e "  ${DIM}Backend${NC}   http://localhost:9100"
echo -e "  ${DIM}Session${NC}   ${SESSION_INFO:0:36}"
echo ""
echo -e "  ${DIM}Stop${NC}      raven stop"
echo -e "  ${DIM}Restart${NC}   raven restart"
echo ""

# Don't open new browser tabs — user already has Raven open
