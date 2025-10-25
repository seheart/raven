#!/bin/bash

# Script to identify frontend components with timer memory leaks
# Checks for setInterval/setTimeout without proper cleanup

echo "🔍 MEMORY LEAK AUDIT - Frontend Timer Cleanup"
echo "=============================================="
echo ""

TOTAL_FILES=0
LEAK_FILES=0

for file in frontend/src/lib/*.svelte frontend/src/App.svelte; do
  if [ -f "$file" ]; then
    # Check if file has setInterval or setTimeout
    if grep -q "setInterval\|setTimeout" "$file"; then
      TOTAL_FILES=$((TOTAL_FILES + 1))

      # Check if file has clearInterval or clearTimeout in onDestroy
      if ! grep -q "clearInterval\|clearTimeout" "$file"; then
        LEAK_FILES=$((LEAK_FILES + 1))
        echo "🔴 LEAK: $file"
        echo "   Has timers but NO cleanup"

        # Show the timer lines
        grep -n "setInterval\|setTimeout" "$file" | head -3 | sed 's/^/   Line /'
        echo ""
      else
        # Check if onDestroy exists
        if grep -q "onDestroy" "$file"; then
          echo "✅ OK: $file"
        else
          echo "⚠️  WARNING: $file"
          echo "   Has cleanup code but no onDestroy"
          echo ""
        fi
      fi
    fi
  fi
done

echo "=============================================="
echo "📊 SUMMARY:"
echo "   Total files with timers: $TOTAL_FILES"
echo "   Files with memory leaks: $LEAK_FILES"
echo "   Files properly cleaned: $((TOTAL_FILES - LEAK_FILES))"
echo ""
echo "=============================================="
