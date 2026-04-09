/**
 * Token Cost Calculator
 *
 * Calculates estimated USD costs from Claude API token usage.
 * Prices are per million tokens (MTok) as of April 2026.
 */

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

interface ModelPricing {
  input: number;       // $ per MTok
  output: number;      // $ per MTok
  cacheWrite: number;  // $ per MTok
  cacheRead: number;   // $ per MTok
}

// Claude model pricing (per million tokens)
const MODEL_PRICING: Record<string, ModelPricing> = {
  // Opus 4
  'claude-opus-4-20250514': { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.50 },
  'claude-opus-4-0': { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.50 },
  // Opus 4.6
  'claude-opus-4-6': { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.50 },
  'claude-opus-4-6-20260409': { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.50 },
  // Sonnet 4
  'claude-sonnet-4-20250514': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.30 },
  'claude-sonnet-4-0': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.30 },
  // Sonnet 4.5
  'claude-sonnet-4-5-20250514': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.30 },
  // Sonnet 4.6
  'claude-sonnet-4-6': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.30 },
  // Haiku 3.5
  'claude-haiku-3-5-20241022': { input: 0.80, output: 4, cacheWrite: 1, cacheRead: 0.08 },
  // Haiku 4.5
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4, cacheWrite: 1, cacheRead: 0.08 },
};

/**
 * Resolve a model string to its pricing. Handles partial matches
 * (e.g., "claude-sonnet-4-6-20260409" → sonnet-4.6 pricing).
 */
function resolvePricing(model: string): ModelPricing {
  // Exact match
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];

  // Partial match — try progressively shorter prefixes
  const lower = model.toLowerCase();
  if (lower.includes('opus-4')) return MODEL_PRICING['claude-opus-4-6'];
  if (lower.includes('sonnet-4')) return MODEL_PRICING['claude-sonnet-4-6'];
  if (lower.includes('haiku-4') || lower.includes('haiku-3')) return MODEL_PRICING['claude-haiku-4-5-20251001'];

  // Unknown model — use Sonnet pricing as a conservative default
  return MODEL_PRICING['claude-sonnet-4-6'];
}

/**
 * Calculate the estimated cost in USD for a single API response.
 */
export function calculateCost(model: string, usage: TokenUsage): number {
  const pricing = resolvePricing(model);

  const inputCost = (usage.input_tokens / 1_000_000) * pricing.input;
  const outputCost = (usage.output_tokens / 1_000_000) * pricing.output;
  const cacheWriteCost = (usage.cache_creation_input_tokens / 1_000_000) * pricing.cacheWrite;
  const cacheReadCost = (usage.cache_read_input_tokens / 1_000_000) * pricing.cacheRead;

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
