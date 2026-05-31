/**
 * Shared display formatters for narrative surfaces (persona + digests).
 *
 * Kept in one place so the persona, daily digest, and weekly digest can't
 * drift apart on how they render money, durations, model names, or plurals.
 */

/** "1 file" / "2 files" — pick the singular or plural form for a count. */
export function plural(n: number, singular: string, pluralForm: string): string {
  return n === 1 ? singular : pluralForm;
}

/** Compact USD: "<$0.01", "$4.20", or "$1,234" for larger sums. */
export function fmtUsd(n: number): string {
  if (n < 0.01) return '<$0.01';
  if (n < 100) return `$${n.toFixed(2)}`;
  return `$${Math.round(n).toLocaleString()}`;
}

/** Human duration: "45s", "12 minutes", "3 hours", "1h 20m". Always a string. */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 60) return `${Math.max(0, Math.round(seconds))}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} ${plural(m, 'minute', 'minutes')}`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (remM === 0) return `${h} ${plural(h, 'hour', 'hours')}`;
  return `${h}h ${remM}m`;
}

/** Pretty-print a raw model id like "claude-opus-4-6" → "Claude Opus 4.6". */
export function prettyModel(model: string): string {
  if (!model) return model;
  const m = model.match(/^claude-(opus|sonnet|haiku)-(\d+)-(\d+)/i);
  if (m) {
    const tier = m[1].charAt(0).toUpperCase() + m[1].slice(1);
    return `Claude ${tier} ${m[2]}.${m[3]}`;
  }
  // Fall back to a tidied version of the raw id.
  return model.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
