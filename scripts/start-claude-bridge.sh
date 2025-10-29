#!/bin/bash

# Start Claude Code Telemetry Bridge
# This script starts the telemetry bridge in the background

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BRIDGE_SCRIPT="$SCRIPT_DIR/claude-telemetry-bridge.js"
PID_FILE="/tmp/claude-telemetry-bridge.pid"
LOG_FILE="/tmp/claude-telemetry-bridge.log"

# Check if already running
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if ps -p "$PID" > /dev/null 2>&1; then
    echo "⚠️  Telemetry bridge already running (PID: $PID)"
    echo "   To restart, run: ./scripts/stop-claude-bridge.sh"
    exit 1
  else
    # Stale PID file
    rm "$PID_FILE"
  fi
fi

# Check if Raven is running
if ! curl -s http://localhost:3030/api/status > /dev/null 2>&1; then
  echo "⚠️  Warning: Raven backend doesn't appear to be running"
  echo "   Start Raven first with: ./start.sh"
  echo ""
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

echo "🔗 Starting Claude Code Telemetry Bridge..."
echo "📂 Monitoring: $PROJECT_DIR"
echo "📝 Logs: $LOG_FILE"
echo ""

# Start bridge in background
nohup node "$BRIDGE_SCRIPT" "$PROJECT_DIR" > "$LOG_FILE" 2>&1 &
BRIDGE_PID=$!
disown

# Save PID
echo "$BRIDGE_PID" > "$PID_FILE"

# Wait a moment and check if it started successfully
sleep 1

if ps -p "$BRIDGE_PID" > /dev/null 2>&1; then
  echo "✅ Telemetry bridge started successfully!"
  echo "   PID: $BRIDGE_PID"
  echo ""
  echo "📊 View logs: tail -f $LOG_FILE"
  echo "🛑 Stop: ./scripts/stop-claude-bridge.sh"
  echo ""
  echo "🎯 All Claude Code file operations will now appear in Raven's Agents panel!"
else
  echo "❌ Failed to start telemetry bridge"
  echo "   Check logs: cat $LOG_FILE"
  rm "$PID_FILE"
  exit 1
fi
