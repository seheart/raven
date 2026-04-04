#!/bin/bash

# Test Quick Start Wizard Workflow
# This script tests the complete flow from project creation to template application

set -e

echo "======================================"
echo "🧪 Testing Quick Start Wizard Workflow"
echo "======================================"
echo ""

BASE_URL="http://localhost:9100"
TEST_PROJECT_NAME="test-quickstart-project"
TEST_PROJECT_PATH="/Users/seth/$TEST_PROJECT_NAME"
TEST_TEMPLATE="ai-safety-basic"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
pass() {
    echo -e "${GREEN}✓${NC} $1"
}

fail() {
    echo -e "${RED}✗${NC} $1"
    exit 1
}

info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

# Cleanup function
cleanup() {
    info "Cleaning up test project..."
    rm -rf "$TEST_PROJECT_PATH" 2>/dev/null || true
    curl -s -X DELETE "$BASE_URL/api/projects/$TEST_PROJECT_NAME" >/dev/null 2>&1 || true
}

# Setup trap for cleanup
trap cleanup EXIT

echo "Step 1: Pre-flight checks"
echo "-------------------------"

# Check if servers are running
if ! curl -s "$BASE_URL/api/health" >/dev/null 2>&1; then
    fail "Backend server is not running on $BASE_URL"
fi
pass "Backend server is running"

if ! curl -s "http://localhost:9000" >/dev/null 2>&1; then
    fail "Frontend server is not running on http://localhost:9000"
fi
pass "Frontend server is running"

echo ""
echo "Step 2: Get basePath from config"
echo "--------------------------------"

BASEPATH=$(curl -s "$BASE_URL/api/projects" | jq -r '.basePath')
if [ -z "$BASEPATH" ] || [ "$BASEPATH" = "null" ]; then
    fail "Failed to get basePath from config"
fi
pass "Got basePath: $BASEPATH"

echo ""
echo "Step 3: Create test project directory"
echo "-------------------------------------"

mkdir -p "$TEST_PROJECT_PATH"
if [ ! -d "$TEST_PROJECT_PATH" ]; then
    fail "Failed to create test project directory at $TEST_PROJECT_PATH"
fi
pass "Created test directory: $TEST_PROJECT_PATH"

echo ""
echo "Step 4: Verify path is within basePath"
echo "--------------------------------------"

if [[ ! "$TEST_PROJECT_PATH" == "$BASEPATH"* ]]; then
    fail "Test path $TEST_PROJECT_PATH is not within basePath $BASEPATH"
fi
pass "Test path is within allowed basePath"

echo ""
echo "Step 5: Create project via API (simulating Quick Start Wizard)"
echo "--------------------------------------------------------------"

PROJECT_RESPONSE=$(curl -s -X POST "$BASE_URL/api/projects" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$TEST_PROJECT_NAME\",\"path\":\"$TEST_PROJECT_PATH\",\"enabled\":true}")

echo "Response: $PROJECT_RESPONSE"

if echo "$PROJECT_RESPONSE" | jq -e '.error' >/dev/null 2>&1; then
    ERROR=$(echo "$PROJECT_RESPONSE" | jq -r '.error')
    fail "Failed to create project: $ERROR"
fi

if ! echo "$PROJECT_RESPONSE" | jq -e '.success' >/dev/null 2>&1; then
    fail "Project creation did not return success"
fi

PROJECT_ID=$(echo "$PROJECT_RESPONSE" | jq -r '.project.id')
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "null" ]; then
    fail "Project creation did not return project ID"
fi
pass "Created project with ID: $PROJECT_ID"

echo ""
echo "Step 6: Verify project was saved"
echo "--------------------------------"

PROJECTS=$(curl -s "$BASE_URL/api/projects")
if ! echo "$PROJECTS" | jq -e ".projects[] | select(.id == \"$PROJECT_ID\")" >/dev/null 2>&1; then
    fail "Project not found in projects list"
fi
pass "Project found in projects list"

echo ""
echo "Step 7: Get available alert templates"
echo "-------------------------------------"

TEMPLATES=$(curl -s "$BASE_URL/api/alerts/templates")
if ! echo "$TEMPLATES" | jq -e ".templates.\"$TEST_TEMPLATE\"" >/dev/null 2>&1; then
    fail "Template $TEST_TEMPLATE not found in available templates"
fi
pass "Template $TEST_TEMPLATE is available"

echo ""
echo "Step 8: Apply alert template to project"
echo "---------------------------------------"

TEMPLATE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/alerts/templates/$TEST_TEMPLATE/apply" \
    -H "Content-Type: application/json" \
    -d "{\"projectId\":\"$PROJECT_ID\"}")

echo "Response: $TEMPLATE_RESPONSE"

if echo "$TEMPLATE_RESPONSE" | jq -e '.error' >/dev/null 2>&1; then
    ERROR=$(echo "$TEMPLATE_RESPONSE" | jq -r '.error')
    fail "Failed to apply template: $ERROR"
fi

if ! echo "$TEMPLATE_RESPONSE" | jq -e '.success' >/dev/null 2>&1; then
    fail "Template application did not return success"
fi
pass "Applied template successfully"

echo ""
echo "Step 9: Verify triggers were created"
echo "------------------------------------"

TRIGGERS=$(curl -s "$BASE_URL/api/triggers")
PROJECT_TRIGGERS=$(echo "$TRIGGERS" | jq "[.triggers[] | select(.projectId == \"$PROJECT_ID\")]")
TRIGGER_COUNT=$(echo "$PROJECT_TRIGGERS" | jq 'length')

if [ "$TRIGGER_COUNT" -eq 0 ]; then
    fail "No triggers were created for project"
fi
pass "Created $TRIGGER_COUNT triggers for project"

echo ""
echo "Step 10: Test directory picker path construction"
echo "------------------------------------------------"

# Simulate directory picker selecting "test-quickstart-project"
DIRECTORY_NAME="$TEST_PROJECT_NAME"
CONSTRUCTED_PATH="$BASEPATH/$DIRECTORY_NAME"

if [ "$CONSTRUCTED_PATH" != "$TEST_PROJECT_PATH" ]; then
    fail "Path construction failed: expected $TEST_PROJECT_PATH, got $CONSTRUCTED_PATH"
fi
pass "Directory picker path construction works correctly"

echo ""
echo "======================================"
echo -e "${GREEN}✅ All tests passed!${NC}"
echo "======================================"
echo ""
echo "Summary:"
echo "  - Backend and frontend servers are running"
echo "  - basePath is correctly configured: $BASEPATH"
echo "  - Project creation works"
echo "  - Alert template application works"
echo "  - Triggers are created correctly"
echo "  - Directory picker path construction is correct"
echo ""
echo "The Quick Start Wizard workflow is fully functional!"
