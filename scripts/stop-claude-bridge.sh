#!/bin/bash

# Stop Claude Code Telemetry Bridge

PID_FILE="/tmp/claude-telemetry-bridge.pid"
LOG_FILE="/tmp/claude-telemetry-bridge.log"

if [ ! -f "$PID_FILE" ]; then
  echo "ℹ️  Telemetry bridge is not running"
  exit 0
fi

PID=$(cat "$PID_FILE")

if ! ps -p "$PID" > /dev/null 2>&1; then
  echo "ℹ️  Telemetry bridge is not running (stale PID file)"
  rm "$PID_FILE"
  exit 0
fi

echo "🛑 Stopping telemetry bridge (PID: $PID)..."

# Send SIGTERM for graceful shutdown
kill -TERM "$PID" 2>/dev/null

# Wait up to 5 seconds for graceful shutdown
for i in {1..5}; do
  if ! ps -p "$PID" > /dev/null 2>&1; then
    echo "✅ Telemetry bridge stopped"
    rm "$PID_FILE"
    exit 0
  fi
  sleep 1
done

# Force kill if still running
if ps -p "$PID" > /dev/null 2>&1; then
  echo "⚠️  Forcing shutdown..."
  kill -9 "$PID" 2>/dev/null
  sleep 1
fi

rm "$PID_FILE"
echo "✅ Telemetry bridge stopped"
