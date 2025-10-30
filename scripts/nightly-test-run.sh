#!/bin/bash

# Raven Nightly Test Runner
# Runs comprehensive E2E, backend, and frontend tests at 3 AM daily
# Results are saved to logs/nightly-tests/ with timestamps

set -e

# Setup
PROJECT_DIR="/home/seth/Projects/raven"
LOG_DIR="$PROJECT_DIR/logs/nightly-tests"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
LOG_FILE="$LOG_DIR/test-run-$TIMESTAMP.log"

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR"

cd "$PROJECT_DIR"

echo "======================================" | tee "$LOG_FILE"
echo "🌙 Raven Nightly Test Run" | tee -a "$LOG_FILE"
echo "Started: $(date)" | tee -a "$LOG_FILE"
echo "======================================" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# 1. Backend Tests
echo "📦 Running Backend Tests..." | tee -a "$LOG_FILE"
echo "----------------------------" | tee -a "$LOG_FILE"
cd backend
npm test 2>&1 | tee -a "$LOG_FILE"
BACKEND_EXIT=$?
cd ..
echo "" | tee -a "$LOG_FILE"

# 2. Frontend Tests
echo "🎨 Running Frontend Tests..." | tee -a "$LOG_FILE"
echo "----------------------------" | tee -a "$LOG_FILE"
cd frontend
npm test 2>&1 | tee -a "$LOG_FILE"
FRONTEND_EXIT=$?
cd ..
echo "" | tee -a "$LOG_FILE"

# 3. E2E Tests (all browsers)
echo "🎭 Running E2E Tests (All Browsers)..." | tee -a "$LOG_FILE"
echo "---------------------------------------" | tee -a "$LOG_FILE"
npm run test:e2e 2>&1 | tee -a "$LOG_FILE"
E2E_EXIT=$?
echo "" | tee -a "$LOG_FILE"

# Summary
echo "======================================" | tee -a "$LOG_FILE"
echo "📊 Test Summary" | tee -a "$LOG_FILE"
echo "======================================" | tee -a "$LOG_FILE"
echo "Backend:  $([ $BACKEND_EXIT -eq 0 ] && echo "✅ PASS" || echo "❌ FAIL")" | tee -a "$LOG_FILE"
echo "Frontend: $([ $FRONTEND_EXIT -eq 0 ] && echo "✅ PASS" || echo "❌ FAIL")" | tee -a "$LOG_FILE"
echo "E2E:      $([ $E2E_EXIT -eq 0 ] && echo "✅ PASS" || echo "❌ FAIL")" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"
echo "Finished: $(date)" | tee -a "$LOG_FILE"
echo "Log saved to: $LOG_FILE" | tee -a "$LOG_FILE"
echo "======================================" | tee -a "$LOG_FILE"

# Keep only last 30 days of logs
find "$LOG_DIR" -name "test-run-*.log" -type f -mtime +30 -delete

# Create a symlink to the latest log for easy access
ln -sf "$LOG_FILE" "$LOG_DIR/latest.log"

echo "" | tee -a "$LOG_FILE"
echo "✨ View results: cat $LOG_DIR/latest.log" | tee -a "$LOG_FILE"
