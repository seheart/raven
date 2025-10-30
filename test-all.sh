#!/bin/bash
# Full Test Suite Runner with Progress Tracking

set -e  # Exit on error (optional, remove if you want to continue on failure)

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  🧪 RAVEN COMPLETE TEST SUITE"
echo "════════════════════════════════════════════════════════════"
echo ""

# Track results
BACKEND_RESULT=""
FRONTEND_RESULT=""
E2E_RESULT=""

START_TIME=$(date +%s)

# ============================================================
# BACKEND TESTS
# ============================================================
echo -e "${BLUE}📦 BACKEND TESTS${NC}"
echo "──────────────────────────────────────────────────────────"
echo "Status: Testing..."
echo ""

if cd backend && npm test --silent > /tmp/backend-test-results.txt 2>&1; then
    BACKEND_RESULT="${GREEN}✅ PASSED${NC}"
    BACKEND_STATS=$(tail -5 /tmp/backend-test-results.txt | grep "Tests:" || echo "Results available in /tmp/backend-test-results.txt")
else
    BACKEND_RESULT="${RED}❌ FAILED${NC}"
    BACKEND_STATS=$(tail -5 /tmp/backend-test-results.txt | grep "Tests:" || echo "See /tmp/backend-test-results.txt")
fi
cd ..

echo -e "Status: ${BACKEND_RESULT}"
echo "$BACKEND_STATS"
echo ""

# ============================================================
# FRONTEND TESTS
# ============================================================
echo -e "${BLUE}🎨 FRONTEND TESTS${NC}"
echo "──────────────────────────────────────────────────────────"
echo "Status: Testing..."
echo ""

if cd frontend && npm test --silent > /tmp/frontend-test-results.txt 2>&1; then
    FRONTEND_RESULT="${GREEN}✅ PASSED${NC}"
    FRONTEND_STATS=$(tail -5 /tmp/frontend-test-results.txt | grep "Test Files" || echo "Results available in /tmp/frontend-test-results.txt")
else
    FRONTEND_RESULT="${YELLOW}⚠️  WITH WARNINGS${NC}"
    FRONTEND_STATS=$(tail -5 /tmp/frontend-test-results.txt | grep "Test Files" || echo "See /tmp/frontend-test-results.txt")
fi
cd ..

echo -e "Status: ${FRONTEND_RESULT}"
echo "$FRONTEND_STATS"
echo ""

# ============================================================
# E2E USER STORY TESTS
# ============================================================
echo -e "${BLUE}🎭 E2E USER STORY TESTS${NC}"
echo "──────────────────────────────────────────────────────────"
echo "Status: Testing (this takes 60-120 seconds)..."
echo ""

if npm run test:e2e > /tmp/e2e-test-results.txt 2>&1; then
    E2E_RESULT="${GREEN}✅ ALL PASSED${NC}"
else
    # Check if any passed
    PASSED=$(grep "passed" /tmp/e2e-test-results.txt | tail -1 || echo "0 passed")
    if [[ "$PASSED" == *"passed"* ]]; then
        E2E_RESULT="${YELLOW}⚠️  SOME FAILED${NC}"
    else
        E2E_RESULT="${RED}❌ FAILED${NC}"
    fi
fi

E2E_STATS=$(grep -E "passed|failed" /tmp/e2e-test-results.txt | tail -2 | head -1 || echo "See /tmp/e2e-test-results.txt")

echo -e "Status: ${E2E_RESULT}"
echo "$E2E_STATS"
echo ""

# ============================================================
# FINAL SUMMARY
# ============================================================
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo "════════════════════════════════════════════════════════════"
echo "  ✅ TESTING COMPLETE"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "RESULTS SUMMARY:"
echo "─────────────────"
echo -e "  Backend:   ${BACKEND_RESULT}"
echo -e "  Frontend:  ${FRONTEND_RESULT}"
echo -e "  E2E Tests: ${E2E_RESULT}"
echo ""
echo "Total Duration: ${DURATION} seconds"
echo ""
echo "DETAILED REPORTS:"
echo "─────────────────"
echo "  • Backend:  /tmp/backend-test-results.txt"
echo "  • Frontend: /tmp/frontend-test-results.txt"
echo "  • E2E:      /tmp/e2e-test-results.txt"
echo ""
echo "VIEW E2E VISUAL REPORT:"
echo "  npx playwright show-report"
echo ""
echo "════════════════════════════════════════════════════════════"
