#!/bin/bash
# Metrics Collection Health Check Script
# This script checks if the Raven metrics collection system is running properly

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
RAVEN_DIR="${1:-$HOME/Projects/raven}"
DB_DIR="$RAVEN_DIR/.raven/db"
API_URL="http://localhost:9100/api/health-checks"
MAX_AGE_MINUTES=5

echo "🔍 Checking Raven Metrics Collection Health"
echo "==========================================="
echo ""

# Check if Raven is running
if ! raven status &>/dev/null; then
    echo -e "${RED}❌ Raven is not running${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Raven server is running"
echo ""

# Check via API
echo "📡 Checking via API..."
HEALTH_CHECK=$(curl -s "$API_URL" 2>/dev/null || echo '{"status":"error"}')

if echo "$HEALTH_CHECK" | jq -e '.checks[] | select(.name == "System Metrics Collection")' > /dev/null 2>&1; then
    METRICS_STATUS=$(echo "$HEALTH_CHECK" | jq -r '.checks[] | select(.name == "System Metrics Collection") | .passed')
    METRICS_MESSAGE=$(echo "$HEALTH_CHECK" | jq -r '.checks[] | select(.name == "System Metrics Collection") | .message')

    if [ "$METRICS_STATUS" = "true" ]; then
        echo -e "${GREEN}✓${NC} API Health Check: $METRICS_MESSAGE"
    else
        echo -e "${RED}❌${NC} API Health Check: $METRICS_MESSAGE"
    fi
else
    echo -e "${YELLOW}⚠${NC}  Could not reach API health check endpoint"
fi

echo ""

# Check database directly
echo "💾 Checking database directly..."

# Find the first project database (where metrics are stored)
FIRST_DB=$(ls -t "$DB_DIR"/*.db 2>/dev/null | head -1)

if [ -z "$FIRST_DB" ]; then
    echo -e "${RED}❌ No project databases found${NC}"
    exit 1
fi

DB_NAME=$(basename "$FIRST_DB")
echo "   Database: $DB_NAME"

# Check latest metric timestamp
LATEST_METRIC=$(sqlite3 "$FIRST_DB" "SELECT timestamp FROM raven_metrics ORDER BY timestamp DESC LIMIT 1;" 2>/dev/null || echo "")

if [ -z "$LATEST_METRIC" ]; then
    echo -e "${RED}❌ No metrics found in database${NC}"
    exit 1
fi

echo "   Latest metric: $LATEST_METRIC"

# Calculate age of latest metric
if [[ "$LATEST_METRIC" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2} ]]; then
    # Convert to seconds since epoch
    METRIC_TIME=$(date -d "$LATEST_METRIC" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S" "${LATEST_METRIC:0:19}" +%s 2>/dev/null)
    CURRENT_TIME=$(date +%s)
    AGE_SECONDS=$((CURRENT_TIME - METRIC_TIME))
    AGE_MINUTES=$((AGE_SECONDS / 60))

    echo "   Age: ${AGE_MINUTES} minutes"

    if [ $AGE_MINUTES -le $MAX_AGE_MINUTES ]; then
        echo -e "${GREEN}✓${NC} Metrics collection is active (< ${MAX_AGE_MINUTES} min old)"
    else
        echo -e "${RED}❌${NC} Metrics collection may be stalled (> ${MAX_AGE_MINUTES} min old)"
        echo ""
        echo "To fix this, restart Raven:"
        echo "  cd $RAVEN_DIR && raven restart"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠${NC}  Could not parse metric timestamp"
fi

echo ""

# Count recent metrics
RECENT_COUNT=$(sqlite3 "$FIRST_DB" "SELECT COUNT(*) FROM raven_metrics WHERE timestamp > datetime('now', '-5 minutes');" 2>/dev/null)
echo "📊 Recent activity: $RECENT_COUNT metrics in last 5 minutes"

if [ "$RECENT_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓${NC} Metrics collection is actively recording"
else
    echo -e "${YELLOW}⚠${NC}  No recent metrics recorded"
fi

echo ""
echo -e "${GREEN}✓${NC} Metrics collection health check complete"
