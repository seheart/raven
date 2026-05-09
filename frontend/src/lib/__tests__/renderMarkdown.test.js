/**
 * Tests for renderMarkdown utility used in Insights and Project Health
 */

import { describe, it, expect } from 'vitest';

// Replicate the renderMarkdown function used in InsightsPage and SystemProjectsPage
function renderMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(
      /^### (.+)$/gm,
      '<h4 class="font-semibold text-[var(--text-heading)] mt-3 mb-1">$1</h4>'
    )
    .replace(
      /^## (.+)$/gm,
      '<h3 class="font-semibold text-[var(--text-heading)] mt-3 mb-1">$1</h3>'
    )
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-[var(--text-heading)]">$1</strong>')
    .replace(
      /`([^`]+)`/g,
      '<code class="px-1 py-0.5 bg-[var(--bg)] rounded text-[var(--accent)] text-[11px] font-mono">$1</code>'
    )
    .replace(
      /^- (.+)$/gm,
      '<div class="flex gap-2 ml-2"><span class="text-[var(--muted)]">-</span><span>$1</span></div>'
    )
    .replace(/\n/g, '<br>')
    .replace(/<\/(h3|h4|p|div)>(?:\s*<br>)+/g, '</$1>')
    .replace(/(<br>\s*){2,}/g, '<br>');
}

describe('renderMarkdown', () => {
  it('should return empty string for null/undefined', () => {
    expect(renderMarkdown(null)).toBe('');
    expect(renderMarkdown(undefined)).toBe('');
    expect(renderMarkdown('')).toBe('');
  });

  it('should escape HTML entities', () => {
    expect(renderMarkdown('<script>alert("xss")</script>')).toContain('&lt;script&gt;');
    expect(renderMarkdown('<script>alert("xss")</script>')).not.toContain('<script>');
  });

  it('should render h3 headings', () => {
    const result = renderMarkdown('## Status');
    expect(result).toContain('<h3');
    expect(result).toContain('Status');
  });

  it('should render h4 headings', () => {
    const result = renderMarkdown('### Details');
    expect(result).toContain('<h4');
    expect(result).toContain('Details');
  });

  it('should render bold text', () => {
    const result = renderMarkdown('This is **important**');
    expect(result).toContain('<strong');
    expect(result).toContain('important');
  });

  it('should render inline code', () => {
    const result = renderMarkdown('Use `console.log`');
    expect(result).toContain('<code');
    expect(result).toContain('console.log');
  });

  it('should render list items', () => {
    const result = renderMarkdown('- Item one\n- Item two');
    expect(result).toContain('Item one');
    expect(result).toContain('Item two');
    // Should not contain raw markdown dashes
    expect(result).not.toMatch(/^- /m);
  });

  it('should convert newlines to br tags', () => {
    const result = renderMarkdown('Line 1\nLine 2');
    expect(result).toContain('<br>');
  });

  it('should handle mixed markdown', () => {
    const input = `## Summary
**Status**: Healthy

- No issues found
- Tests passing

Use \`npm test\` to verify.`;

    const result = renderMarkdown(input);
    expect(result).toContain('<h3');
    expect(result).toContain('<strong');
    expect(result).toContain('<code');
    expect(result).toContain('No issues found');
  });

  it('should not stack <br> after a heading even when LLM pads with blank lines', () => {
    // LLM commonly emits `### Title\n\n1. Item` — naive newline→<br> conversion
    // produces `</h4><br><br>1. ...` which renders as ~2em of dead space.
    const result = renderMarkdown('### Project Health\n\n1. **Status**: Healthy');
    expect(result).not.toContain('</h4><br>');
    expect(result).not.toMatch(/<br>\s*<br>/);
  });

  it('should collapse runs of newlines to a single break', () => {
    const result = renderMarkdown('Line 1\n\n\n\nLine 2');
    expect(result).not.toMatch(/<br>\s*<br>/);
  });

  it('should handle LLM-style output with bold sections', () => {
    const input = `**Today's Highlights** — Worked on performance optimizations for the API layer.

**Productivity** — High activity with 340 file events across 3 projects.

**Code Quality** — 2 syntax errors detected and auto-resolved.`;

    const result = renderMarkdown(input);
    expect(result).toContain('<strong');
    expect(result).toContain("Today's Highlights");
    expect(result).toContain('Productivity');
    expect(result).toContain('Code Quality');
  });
});
