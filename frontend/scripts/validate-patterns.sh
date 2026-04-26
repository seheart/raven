#!/bin/bash

# Raven Frontend Pattern Validator
# Catches common Svelte + Tailwind issues before they cause problems
#
# Design-system rules (sections 5–8) are *ratchet-style*: they only run
# against pages that have migrated onto the layout primitives (i.e. import
# PageLayout). Legacy pages are skipped until Phase 4/5 migrates them.
# Once a page is migrated, it can never drift back — adding `<style>`,
# raw hex, etc. to a migrated page fails CI.

echo "🔍 Validating Svelte + Tailwind patterns..."
echo ""

ERRORS=0

# DesignSystemPage intentionally shows token names and example markup
# inside string literals; it can't satisfy the rules and shouldn't.
DESIGN_SYSTEM_ALLOWLIST=("src/lib/pages/DesignSystemPage.svelte")

is_allowlisted() {
  local f="$1"
  for entry in "${DESIGN_SYSTEM_ALLOWLIST[@]}"; do
    [[ "$f" == "$entry" ]] && return 0
  done
  return 1
}

# Pages that have migrated to PageLayout — gated against design-system rules.
migrated_pages() {
  grep -lE "from ['\"]\.\./components/layout(/index\.js)?['\"]" src/lib/pages/*.svelte 2>/dev/null
}

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

# 3. Check for Tailwind arbitrary values inside <style> blocks
# (Tailwind class arbitrary values like .text-[var(...)] don't compile inside
#  <style> blocks — they only work as HTML class attributes.)
echo "Checking for Tailwind arbitrary values inside <style> blocks..."
STYLE_ARB_VIOLATIONS=0
for f in $(grep -lE "<style\b" src/lib/pages/*.svelte 2>/dev/null); do
  # Extract content between <style ...> and </style>, then look for .name-[...] patterns
  if awk '/<style[^>]*>/{flag=1;next}/<\/style>/{flag=0}flag' "$f" \
     | grep -nE "\.[a-z-]+-\[[^]]+\]" > /tmp/style-arb.$$ 2>/dev/null; then
    if [ -s /tmp/style-arb.$$ ]; then
      echo "❌ $f: Tailwind arbitrary value inside <style> block (use :global() or remove)"
      cat /tmp/style-arb.$$ | sed 's/^/   /'
      STYLE_ARB_VIOLATIONS=$((STYLE_ARB_VIOLATIONS + 1))
    fi
  fi
  rm -f /tmp/style-arb.$$
done
if [ $STYLE_ARB_VIOLATIONS -eq 0 ]; then
  echo "✅ No Tailwind arbitrary values inside <style> blocks"
else
  ERRORS=$((ERRORS + STYLE_ARB_VIOLATIONS))
fi
echo ""

# ── Design-system rules (5-8): ratcheted on migrated pages ────────────────
MIGRATED=$(migrated_pages)
MIGRATED_COUNT=$(echo "$MIGRATED" | grep -c . || true)

# 5. Migrated pages must not contain raw hex literals — use semantic tokens
# A "design-system-allow: hex" marker is honored on the same line OR on any
# of the 30 lines preceding the hex (covers brand-color tables/blocks).
echo "Checking migrated pages for raw hex literals..."
HEX_VIOLATIONS=0
for f in $MIGRATED; do
  is_allowlisted "$f" && continue
  awk '
    /design-system-allow:[ ]*hex/ { allow_until = NR + 30 }
    /#[0-9a-fA-F]{6}([^a-fA-F0-9]|$)/ {
      if (NR > allow_until && !/design-system-allow/) print NR ":" $0
    }
  ' "$f" > /tmp/hex-hits.$$
  if [ -s /tmp/hex-hits.$$ ]; then
    echo "❌ $f: raw hex literal (use semantic tokens or mark with /* design-system-allow: hex */)"
    cat /tmp/hex-hits.$$ | sed 's/^/   /'
    HEX_VIOLATIONS=$((HEX_VIOLATIONS + 1))
  fi
  rm -f /tmp/hex-hits.$$
done
if [ $HEX_VIOLATIONS -eq 0 ]; then
  echo "✅ No raw hex on migrated pages ($MIGRATED_COUNT checked)"
else
  ERRORS=$((ERRORS + HEX_VIOLATIONS))
fi
echo ""

# 6. Migrated pages must not use arbitrary token syntax — use semantic utilities
echo "Checking migrated pages for arbitrary-token syntax..."
ARB_VIOLATIONS=0
for f in $MIGRATED; do
  is_allowlisted "$f" && continue
  if grep -nE "(text|bg|border|fill|stroke|ring|accent)[a-z-]*-\[var\(--" "$f" > /tmp/arb-hits.$$ 2>/dev/null; then
    if [ -s /tmp/arb-hits.$$ ]; then
      echo "❌ $f: arbitrary token syntax (use text-heading, bg-surface, text-accent, etc.)"
      cat /tmp/arb-hits.$$ | sed 's/^/   /'
      ARB_VIOLATIONS=$((ARB_VIOLATIONS + 1))
    fi
  fi
  rm -f /tmp/arb-hits.$$
done
if [ $ARB_VIOLATIONS -eq 0 ]; then
  echo "✅ No arbitrary-token syntax on migrated pages"
else
  ERRORS=$((ERRORS + ARB_VIOLATIONS))
fi
echo ""

# 7. Migrated pages must not use raw <h1>/<h2> — use PageHeader / PageSection
echo "Checking migrated pages for raw <h1>/<h2>..."
HX_VIOLATIONS=0
for f in $MIGRATED; do
  is_allowlisted "$f" && continue
  if grep -nE "<h[12](\s|>)" "$f" > /tmp/hx-hits.$$ 2>/dev/null; then
    if [ -s /tmp/hx-hits.$$ ]; then
      echo "❌ $f: raw <h1>/<h2> (use <PageHeader> for h1, <PageSection> for h2)"
      cat /tmp/hx-hits.$$ | sed 's/^/   /'
      HX_VIOLATIONS=$((HX_VIOLATIONS + 1))
    fi
  fi
  rm -f /tmp/hx-hits.$$
done
if [ $HX_VIOLATIONS -eq 0 ]; then
  echo "✅ No raw <h1>/<h2> on migrated pages"
else
  ERRORS=$((ERRORS + HX_VIOLATIONS))
fi
echo ""

# 8. Migrated pages must not contain <style> blocks — lift to lib/styles/
echo "Checking migrated pages for <style> blocks..."
STYLE_VIOLATIONS=0
for f in $MIGRATED; do
  is_allowlisted "$f" && continue
  if grep -nE "<style\b" "$f" > /tmp/style-hits.$$ 2>/dev/null; then
    if [ -s /tmp/style-hits.$$ ]; then
      echo "❌ $f: <style> block (lift styles to lib/styles/animations.css or use utilities)"
      cat /tmp/style-hits.$$ | sed 's/^/   /'
      STYLE_VIOLATIONS=$((STYLE_VIOLATIONS + 1))
    fi
  fi
  rm -f /tmp/style-hits.$$
done
if [ $STYLE_VIOLATIONS -eq 0 ]; then
  echo "✅ No <style> blocks on migrated pages"
else
  ERRORS=$((ERRORS + STYLE_VIOLATIONS))
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
