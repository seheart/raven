/**
 * Token Cost Calculator
 *
 * Calculates estimated USD costs from Claude API token usage.
 * Prices are per million tokens (MTok) as of May 2026.
 *
 * Two pricing wrinkles worth knowing:
 *  1. Haiku 4.5 is $1 / $5 (NOT $0.80 / $4 like Haiku 3.5). Earlier
 *     versions of this file had Haiku 4.5 at the cheaper Haiku 3.5 rate
 *     and were silently undercounting Haiku-heavy workloads.
 *  2. Sonnet 4.5+ and Opus 4.7-1m have a tiered pricing scheme: prompts
 *     up to 200k input tokens use the standard rate; above 200k the
 *     input/output/cache rates roughly double. This is implemented via
 *     `longContext` overrides below and is selected at calculate-time
 *     based on the prompt size (input + cache_creation + cache_read).
 */

interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

interface ModelPricing {
  input: number; // $ per MTok
  output: number; // $ per MTok
  cacheWrite: number; // $ per MTok
  cacheRead: number; // $ per MTok
  // Tier override for prompts > 200k input tokens. Only present on
  // models that actually have a long-context tier (Sonnet 4.5+,
  // Opus 4.7-1m). Absent → flat pricing applies regardless of prompt size.
  longContext?: { input: number; output: number; cacheWrite: number; cacheRead: number };
}

const LONG_CONTEXT_THRESHOLD = 200_000;

// Claude model pricing (per million tokens)
const MODEL_PRICING: Record<string, ModelPricing> = {
  // Opus 4 (200k context — flat pricing)
  'claude-opus-4-20250514': { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  'claude-opus-4-0': { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  // Opus 4.6 (200k context — flat pricing)
  'claude-opus-4-6': { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  'claude-opus-4-6-20260409': { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  // Opus 4.7 (200k context). Without -1m suffix, behaves like Opus 4/4.6.
  'claude-opus-4-7': { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  // Opus 4.7 with 1M context window — prompts > 200k input pay the
  // long-context tier. Below 200k still uses the standard rate, so this
  // is a single entry with a longContext override rather than two models.
  'claude-opus-4-7-1m': {
    input: 15,
    output: 75,
    cacheWrite: 18.75,
    cacheRead: 1.5,
    longContext: { input: 30, output: 150, cacheWrite: 37.5, cacheRead: 3.0 }
  },
  // Sonnet 4 (200k context — flat pricing)
  'claude-sonnet-4-20250514': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  'claude-sonnet-4-0': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  // Sonnet 4.5 — tiered. Prompts > 200k input pay the long-context tier.
  'claude-sonnet-4-5-20250514': {
    input: 3,
    output: 15,
    cacheWrite: 3.75,
    cacheRead: 0.3,
    longContext: { input: 6, output: 22.5, cacheWrite: 7.5, cacheRead: 0.6 }
  },
  // Sonnet 4.6 — tiered.
  'claude-sonnet-4-6': {
    input: 3,
    output: 15,
    cacheWrite: 3.75,
    cacheRead: 0.3,
    longContext: { input: 6, output: 22.5, cacheWrite: 7.5, cacheRead: 0.6 }
  },
  // Haiku 3.5 — flat.
  'claude-haiku-3-5-20241022': { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 },
  // Haiku 4.5 — flat. Note: $1 / $5, NOT $0.80 / $4. Earlier versions
  // of this file priced Haiku 4.5 at Haiku 3.5 rates and undercharged.
  'claude-haiku-4-5-20251001': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 }
};

/**
 * Resolve a model string to its pricing. Handles partial matches
 * (e.g., "claude-sonnet-4-6-20260409" → sonnet-4.6 pricing).
 */
function resolvePricing(model: string): ModelPricing {
  // Exact match
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];

  // Partial match — try progressively shorter prefixes. The 1m suffix
  // matters (long-context tier) and is checked before the generic match.
  const lower = model.toLowerCase();
  if (lower.includes('opus-4-7') && lower.includes('1m')) {
    return MODEL_PRICING['claude-opus-4-7-1m'];
  }
  if (lower.includes('opus-4-7')) return MODEL_PRICING['claude-opus-4-7'];
  if (lower.includes('opus-4')) return MODEL_PRICING['claude-opus-4-6'];
  if (lower.includes('sonnet-4-5')) return MODEL_PRICING['claude-sonnet-4-5-20250514'];
  if (lower.includes('sonnet-4-6')) return MODEL_PRICING['claude-sonnet-4-6'];
  if (lower.includes('sonnet-4')) return MODEL_PRICING['claude-sonnet-4-6'];
  if (lower.includes('haiku-4-5') || lower.includes('haiku-4'))
    return MODEL_PRICING['claude-haiku-4-5-20251001'];
  if (lower.includes('haiku-3')) return MODEL_PRICING['claude-haiku-3-5-20241022'];

  // Unknown model — use Sonnet pricing as a conservative default
  // This is intentionally not logged at warn level since it fires per-request
  return MODEL_PRICING['claude-sonnet-4-6'];
}

/**
 * Calculate the estimated cost in USD for a single API response.
 *
 * For tier-aware models (Sonnet 4.5+, Opus 4.7-1m), the long-context
 * rate is selected when the total prompt size — input + cache writes +
 * cache reads — exceeds 200k tokens. This matches Anthropic's billing:
 * the tier is determined by the prompt that hit the model, not just the
 * raw input.
 */
export function calculateCost(model: string, usage: TokenUsage): number {
  const pricing = resolvePricing(model);

  const promptSize =
    usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens;
  const useLongTier = !!pricing.longContext && promptSize > LONG_CONTEXT_THRESHOLD;
  const rates = useLongTier && pricing.longContext ? pricing.longContext : pricing;

  const inputCost = (usage.input_tokens / 1_000_000) * rates.input;
  const outputCost = (usage.output_tokens / 1_000_000) * rates.output;
  const cacheWriteCost = (usage.cache_creation_input_tokens / 1_000_000) * rates.cacheWrite;
  const cacheReadCost = (usage.cache_read_input_tokens / 1_000_000) * rates.cacheRead;

  return inputCost + outputCost + cacheWriteCost + cacheReadCost;
}

/**
 * Get the model family name for display (e.g., "Opus 4.6", "Sonnet 4", "Haiku 4.5")
 */
export function getModelFamily(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes('opus-4-6')) return 'Opus 4.6';
  if (lower.includes('opus-4')) return 'Opus 4';
  if (lower.includes('sonnet-4-6')) return 'Sonnet 4.6';
  if (lower.includes('sonnet-4-5')) return 'Sonnet 4.5';
  if (lower.includes('sonnet-4')) return 'Sonnet 4';
  if (lower.includes('haiku-4-5')) return 'Haiku 4.5';
  if (lower.includes('haiku-3-5')) return 'Haiku 3.5';
  return model;
}
