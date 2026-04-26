#!/bin/bash
# One-shot migration: rewrite arbitrary-token Tailwind syntax
# (text-[var(--X)]) into the semantic utilities declared in @theme.
# Usage: bash scripts/migrate-tokens.sh <file>...
# Idempotent — safe to run multiple times.

set -e
[ $# -eq 0 ] && { echo "usage: $0 <svelte file>..." >&2; exit 1; }

for f in "$@"; do
  [ ! -f "$f" ] && { echo "skip (missing): $f" >&2; continue; }
  sed -i -E \
    -e 's|text-\[var\(--text-heading\)\]|text-heading|g' \
    -e 's|text-\[var\(--text\)\]|text-body|g' \
    -e 's|text-\[var\(--muted\)\]|text-muted|g' \
    -e 's|text-\[var\(--accent\)\]|text-accent|g' \
    -e 's|text-\[var\(--accent-2\)\]|text-accent-strong|g' \
    -e 's|text-\[var\(--success\)\]|text-success|g' \
    -e 's|text-\[var\(--error\)\]|text-error|g' \
    -e 's|text-\[var\(--warning\)\]|text-warning|g' \
    -e 's|text-\[var\(--info\)\]|text-info|g' \
    -e 's|bg-\[var\(--bg\)\]|bg-canvas|g' \
    -e 's|bg-\[var\(--surface\)\]|bg-surface|g' \
    -e 's|bg-\[var\(--surface-2\)\]|bg-surface-2|g' \
    -e 's|bg-\[var\(--accent\)\]|bg-accent|g' \
    -e 's|bg-\[var\(--accent-2\)\]|bg-accent-strong|g' \
    -e 's|bg-\[var\(--success\)\]|bg-success|g' \
    -e 's|bg-\[var\(--error\)\]|bg-error|g' \
    -e 's|bg-\[var\(--warning\)\]|bg-warning|g' \
    -e 's|bg-\[var\(--info\)\]|bg-info|g' \
    -e 's|bg-\[var\(--accent-subtle\)\]|bg-accent-subtle|g' \
    -e 's|bg-\[var\(--success-subtle\)\]|bg-success-subtle|g' \
    -e 's|bg-\[var\(--error-subtle\)\]|bg-error-subtle|g' \
    -e 's|bg-\[var\(--warning-subtle\)\]|bg-warning-subtle|g' \
    -e 's|text-\[var\(--border\)\]|text-border|g' \
    -e 's|ring-\[var\(--accent\)\]|ring-accent|g' \
    -e 's|ring-\[var\(--success\)\]|ring-success|g' \
    -e 's|ring-\[var\(--error\)\]|ring-error|g' \
    -e 's|bg-\[var\(--muted\)\]|bg-muted|g' \
    -e 's|bg-\[var\(--border\)\]|bg-border|g' \
    -e 's|border-\[var\(--border\)\]|border-border|g' \
    -e 's|border-\[var\(--accent\)\]|border-accent|g' \
    -e 's|border-\[var\(--success\)\]|border-success|g' \
    -e 's|border-\[var\(--error\)\]|border-error|g' \
    -e 's|border-\[var\(--warning\)\]|border-warning|g' \
    -e 's|border-\[var\(--info\)\]|border-info|g' \
    -e 's|fill-\[var\(--accent\)\]|fill-accent|g' \
    -e 's|fill-\[var\(--muted\)\]|fill-muted|g' \
    -e 's|stroke-\[var\(--accent\)\]|stroke-accent|g' \
    -e 's|accent-\[var\(--accent\)\]|accent-accent|g' \
    -e 's|accent-\[var\(--success\)\]|accent-success|g' \
    -e 's|accent-\[var\(--error\)\]|accent-error|g' \
    -e 's|accent-\[var\(--warning\)\]|accent-warning|g' \
    -e 's|accent-\[var\(--info\)\]|accent-info|g' \
    -e 's|border-([trblxy])-\[var\(--accent\)\]|border-\1-accent|g' \
    -e 's|border-([trblxy])-\[var\(--success\)\]|border-\1-success|g' \
    -e 's|border-([trblxy])-\[var\(--error\)\]|border-\1-error|g' \
    -e 's|border-([trblxy])-\[var\(--warning\)\]|border-\1-warning|g' \
    -e 's|border-([trblxy])-\[var\(--info\)\]|border-\1-info|g' \
    "$f"
  echo "migrated: $f"
done
