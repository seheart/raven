/**
 * Canonical USD formatter for the entire frontend. Use this instead of
 * `toFixed(2)` so every dollar figure renders with thousands separators
 * (e.g. $2,206.02 instead of $2206.02). The previous scattered
 * implementations had inconsistent comma behavior — some had it, most
 * didn't — so a $212k figure read like a phone number.
 *
 * Conventions:
 *  - Negatives are formatted with a leading "-$" (the rare case here).
 *  - Sub-cent values render as "<$0.01" rather than "$0.00", so a tiny
 *    real cost doesn't read as free.
 *  - Default: 2 decimal places. Pass `{precision: 0}` for whole-dollar
 *    summaries (e.g. burn-rate displays).
 *  - Pass `{compact: true}` for header chips: $1.2k / $3.4M / $1.2B for
 *    big numbers; below $1000 falls back to the standard format.
 *
 * @param {number | null | undefined} n
 * @param {{ precision?: number, compact?: boolean }} [opts]
 * @returns {string}
 */
export function formatUsd(n, opts = {}) {
  const { precision = 2, compact = false } = opts;
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (n === 0) return '$0';
  // Sub-cent guard: a value of $0.003 should not display as "$0.00".
  if (abs > 0 && abs < 0.01 && precision >= 2) {
    return n < 0 ? '-<$0.01' : '<$0.01';
  }
  if (compact && abs >= 1000) {
    // Manual compact so we keep the leading $ and one decimal of precision.
    const sign = n < 0 ? '-' : '';
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
    return `${sign}$${(abs / 1000).toFixed(1)}k`;
  }
  // toLocaleString does the comma grouping for us. minimumFractionDigits
  // and maximumFractionDigits both pinned to `precision` so a whole number
  // doesn't render as $5 when we asked for $5.00.
  const sign = n < 0 ? '-' : '';
  return `${sign}$${abs.toLocaleString('en-US', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision
  })}`;
}
