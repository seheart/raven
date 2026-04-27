#!/bin/bash
# Coverage check: every primitive in lib/components/ui/ should be shown
# (or at least named) in DesignSystemPage.svelte. Forces the showcase
# to stay in sync with the actual component library.
#
# A primitive is "shown" if its component name appears anywhere in
# DesignSystemPage.svelte — either as <Name ... /> or in a documenting
# string. Tag the primitive with /* design-system-skip */ on its first
# line to opt out (e.g. for internal helpers that aren't user-facing).

set -e

UI_DIR="src/lib/components/ui"
DSP="src/lib/pages/DesignSystemPage.svelte"

[ ! -f "$DSP" ] && { echo "❌ $DSP not found" >&2; exit 1; }

MISSING=0
CHECKED=0

for f in "$UI_DIR"/*.svelte; do
  name=$(basename "$f" .svelte)

  # Opt-out marker on the first 5 lines of the primitive
  if head -5 "$f" | grep -q "design-system-skip"; then
    continue
  fi

  CHECKED=$((CHECKED + 1))
  if ! grep -q "\b${name}\b" "$DSP"; then
    echo "❌ $name (in $f) is not shown in DesignSystemPage"
    MISSING=$((MISSING + 1))
  fi
done

echo ""
if [ $MISSING -eq 0 ]; then
  echo "✅ All $CHECKED ui/ primitives are referenced in DesignSystemPage"
  exit 0
else
  echo "⚠️  $MISSING of $CHECKED primitives missing from DesignSystemPage."
  echo "   Add a section showing each one, or add /* design-system-skip */"
  echo "   to its first lines if it's not user-facing."
  exit 1
fi
