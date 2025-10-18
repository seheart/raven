#!/bin/bash
# Memory profiling script for Raven

set -e

echo "🦅 Raven Memory Profiling Tool"
echo "================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Target memory usage (in MB)
TARGET_MEMORY=50

# Check if process is running
if ! pgrep -f "raven" > /dev/null 2>&1; then
    echo -e "${YELLOW}Warning: Raven process not found${NC}"
    echo "Start Raven with: cargo tauri dev"
    echo ""
    echo "For this demo, we'll show system memory stats instead:"
    echo ""
fi

# Function to get memory usage
get_memory_usage() {
    if pgrep -f "raven" > /dev/null 2>&1; then
        # Get all Raven-related processes
        ps aux | grep -i raven | grep -v grep | awk '{print $6}' | awk '{s+=$1} END {print s/1024}'
    else
        echo "0"
    fi
}

# Function to format memory
format_memory() {
    local mb=$1
    if (( $(echo "$mb < 1" | bc -l) )); then
        echo "${mb}KB"
    elif (( $(echo "$mb < 1024" | bc -l) )); then
        printf "%.1fMB" "$mb"
    else
        local gb=$(echo "scale=2; $mb / 1024" | bc)
        echo "${gb}GB"
    fi
}

echo "System Memory Stats:"
echo "-------------------"

# Total system memory
TOTAL_MEM=$(free -m | awk 'NR==2{print $2}')
USED_MEM=$(free -m | awk 'NR==2{print $3}')
FREE_MEM=$(free -m | awk 'NR==2{print $4}')
PERCENT=$(awk "BEGIN {printf \"%.1f\", ($USED_MEM/$TOTAL_MEM)*100}")

echo -e "Total:    ${BLUE}$(format_memory $TOTAL_MEM)${NC}"
echo -e "Used:     ${YELLOW}$(format_memory $USED_MEM)${NC} (${PERCENT}%)"
echo -e "Free:     ${GREEN}$(format_memory $FREE_MEM)${NC}"
echo ""

# Check Raven process memory
echo "Raven Process Memory:"
echo "--------------------"

RAVEN_MEM=$(get_memory_usage)

if (( $(echo "$RAVEN_MEM > 0" | bc -l) )); then
    echo -e "Current:  ${BLUE}$(format_memory $RAVEN_MEM)${NC}"
    echo -e "Target:   ${GREEN}$(format_memory $TARGET_MEMORY)${NC}"

    if (( $(echo "$RAVEN_MEM > $TARGET_MEMORY" | bc -l) )); then
        OVER=$(echo "$RAVEN_MEM - $TARGET_MEMORY" | bc)
        echo -e "Status:   ${RED}Over target by $(format_memory $OVER)${NC}"
    else
        UNDER=$(echo "$TARGET_MEMORY - $RAVEN_MEM" | bc)
        echo -e "Status:   ${GREEN}Under target by $(format_memory $UNDER)${NC}"
    fi
else
    echo -e "${YELLOW}Raven not running${NC}"
fi

echo ""
echo "Memory Breakdown by Process:"
echo "---------------------------"

if pgrep -f "raven" > /dev/null 2>&1; then
    ps aux | grep -i raven | grep -v grep | awk '{printf "%-8s  %6s  %s\n", $2, $6/1024 "MB", $11}'
else
    echo "No Raven processes found"
fi

echo ""
echo "Top Memory Consumers:"
echo "--------------------"
ps aux --sort=-%mem | head -6 | awk 'NR==1 || NR>1 {printf "%-8s  %6.1fMB  %-20s\n", $2, $6/1024, $11}'

echo ""
echo "Profiling Tips:"
echo "--------------"
echo "1. Run stress tests: npm run test:stress"
echo "2. Monitor with: watch -n 1 ./scripts/memory_profile.sh"
echo "3. Use valgrind for detailed analysis: valgrind --leak-check=full ./target/debug/raven"
echo "4. Check database size: du -h .raven/db/"
echo "5. Monitor snapshot directory: du -h .raven/snapshots/"
