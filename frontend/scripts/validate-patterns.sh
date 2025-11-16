#!/bin/bash

# Raven Frontend Pattern Validator
# Catches common Svelte + Tailwind issues before they cause problems

echo "🔍 Validating Svelte + Tailwind patterns..."
echo ""

ERRORS=0

# 1. Check for class: directive with opacity syntax (/)
echo "Checking for class: directive with opacity syntax..."
if grep -rn "class:[a-z-]*/[0-9]" src/lib/ 2>/dev/null; then
  echo "❌ Found class: directive with opacity syntax (use dynamic class strings instead)"
  ERRORS=$((ERRORS + 1))
else
  echo "✅ No class: opacity syntax issues found"
fi
echo ""

# 2. Check for common api client anti-patterns (more targeted)
echo "Checking for Response object patterns with api client..."
FOUND_ISSUES=0

# Check for .json() directly after api client calls in same statement
if grep -rn "await api\.\(get\|post\|put\|delete\)(.*)\s*\.json()" src/lib/ 2>/dev/null; then
  echo "❌ Found .json() chained after api client calls"
  FOUND_ISSUES=1
fi

# Note: Many .json() calls are legitimate (using raw fetch), so we only check for direct chains
if [ $FOUND_ISSUES -eq 1 ]; then
  echo "   (api client returns parsed JSON directly)"
  ERRORS=$((ERRORS + 1))
else
  echo "✅ No obvious api client anti-patterns found"
  echo "   (Note: Script only checks for directly chained .json() calls)"
fi
echo ""

# 3. Check for Tailwind arbitrary values in <style> blocks
echo "Checking for Tailwind arbitrary values in <style> blocks..."
if grep -rn "<style>" src/lib/pages/ 2>/dev/null | while read -r line; do
  file=$(echo "$line" | cut -d: -f1)
  if grep -q "\.\[.*\]" "$file" 2>/dev/null; then
    echo "$line"
    exit 1
  fi
done; then
  echo "❌ Found Tailwind arbitrary values in <style> blocks"
  echo "   (use :global() wrapper or remove <style> block)"
  ERRORS=$((ERRORS + 1))
else
  echo "✅ No <style> block issues found"
fi
echo ""

# 4. Run svelte-check for syntax errors
echo "Running svelte-check..."
if npx svelte-check --tsconfig ./jsconfig.json --threshold error 2>&1 | grep -q "Error:"; then
  echo "❌ Svelte syntax errors found (run 'npx svelte-check' for details)"
  ERRORS=$((ERRORS + 1))
else
  echo "✅ No Svelte syntax errors"
fi
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $ERRORS -eq 0 ]; then
  echo "✨ All pattern checks passed!"
  exit 0
else
  echo "⚠️  Found $ERRORS issue(s). See SVELTE_TAILWIND_BEST_PRACTICES.md for solutions."
  exit 1
fi
