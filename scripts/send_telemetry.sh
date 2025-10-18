#!/bin/bash
# Simple shell script to send a single telemetry event to Raven
# Usage: ./send_telemetry.sh [agent] [event_type] [message]

SOCKET="/tmp/raven-telemetry.sock"
AGENT="${1:-claude}"
EVENT="${2:-edit}"
MESSAGE="${3:-Test event from shell script}"

# Check if socket exists
if [ ! -S "$SOCKET" ]; then
    echo "✗ Socket not found at $SOCKET"
    echo "  Make sure Raven is running first!"
    exit 1
fi

# Build JSON event
JSON=$(cat <<EOF
{"agent":"$AGENT","event":"$EVENT","message":"$MESSAGE","file":"test.rs","lines_changed":10,"duration_ms":500}
EOF
)

# Send to socket using netcat or echo
echo "$JSON" | nc -U "$SOCKET" 2>/dev/null || echo "$JSON" | socat - UNIX-CONNECT:"$SOCKET"

if [ $? -eq 0 ]; then
    echo "✓ Event sent: $AGENT - $EVENT - $MESSAGE"
else
    echo "✗ Failed to send event"
    exit 1
fi
