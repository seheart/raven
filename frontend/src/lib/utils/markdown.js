import DOMPurify from 'dompurify';

const ALLOWED_TAGS = ['h3', 'h4', 'strong', 'em', 'code', 'br', 'div', 'span', 'p'];
const ALLOWED_ATTR = ['class'];

export function renderMarkdown(text) {
  if (!text) return '';
  const html = text
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
    // Cleanup: LLM output often pads `### Heading\n\n1. Item` which becomes
    // `</h4><br><br>1. ...` — two stacked breaks add ~2em of dead space.
    // Strip <br> immediately after block-level close tags so headings/list
    // items hug the next line, and collapse runs of <br> to a single break.
    .replace(/<\/(h3|h4|p|div)>(?:\s*<br>)+/g, '</$1>')
    .replace(/(<br>\s*){2,}/g, '<br>');
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}
