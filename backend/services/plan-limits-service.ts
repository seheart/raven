/**
 * Plan Limits Service — 5-hour window burn-down for subscription plans.
 *
 * Claude subscription plans (Pro / Max 5x / Max 20x) meter usage in rolling
 * 5-hour session windows that open at the first request. Anthropic does not
 * publish the caps, so the budgets here are COMMUNITY ESTIMATES expressed in
 * cost-equivalent dollars (the same weighting the cost calculator already
 * applies per model, cache tier included). Every number this service returns
 * is labeled an estimate, and the budget is overridable — when a user
 * observes their real cap, they can pin it in Settings.
 *
 * Window anchoring: the true window opens at the first request and closes
 * exactly 5h later; chained windows can follow. From local logs alone the
 * closest honest approximation is "first usage row within the last 5 hours"
 * — after 5h of silence the window is over, which matches the real reset.
 *
 * Weekly usage is reported as a rolling 7-day total for context. No weekly
 * prediction is attempted unless the user supplies their own weekly budget —
 * the weekly caps vary too much account-to-account to guess at.
 */

import type { TokenUsageRepository } from '../repositories/token-usage-repository.js';

const WINDOW_MS = 5 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const BURN_LOOKBACK_MS = 60 * 60 * 1000;

export type PlanTier = 'pro' | 'max_5x' | 'max_20x';

/**
 * Cost-equivalent 5h budgets. Sources: the defaults the Claude Code Usage
 * Monitor community converged on through observed lockouts (Pro ≈ $18,
 * Max 5x ≈ $35, Max 20x ≈ $140 per 5h window). Estimates, not gospel.
 */
const PLAN_BUDGETS_USD: Record<PlanTier, number> = {
  pro: 18,
  max_5x: 35,
  max_20x: 140
};

export interface PlanLimitsSnapshot {
  plan: PlanTier;
  estimated: true;
  window: {
    start: string | null;
    resets_at: string | null;
    usage_usd: number;
    budget_usd: number;
    pct_used: number;
    burn_rate_usd_per_hour: number;
    /** Projected moment the window budget runs out at the current burn rate; null if idle or already over. */
    projected_exhaustion: string | null;
    /** True when projected exhaustion lands before the window resets. */
    on_pace_to_hit_cap: boolean;
  };
  weekly: {
    usage_usd: number;
    budget_usd: number | null;
    pct_used: number | null;
  };
}

export interface PlanLimitsService {
  snapshot(plan: PlanTier, budgetUsd?: number, weeklyBudgetUsd?: number): PlanLimitsSnapshot;
}

export function createPlanLimitsService(tokenUsageRepo: TokenUsageRepository): PlanLimitsService {
  return {
    snapshot(plan, budgetUsd, weeklyBudgetUsd) {
      const now = Date.now();
      const budget = budgetUsd && budgetUsd > 0 ? budgetUsd : PLAN_BUDGETS_USD[plan];

      const windowStart = tokenUsageRepo.firstUsageSince(new Date(now - WINDOW_MS).toISOString());
      const usage = windowStart
        ? tokenUsageRepo.costSummary({ start: windowStart }).total_cost_usd
        : 0;

      const burnUsage = tokenUsageRepo.costSummary({
        start: new Date(now - BURN_LOOKBACK_MS).toISOString()
      }).total_cost_usd;
      const burnRate = burnUsage; // USD over the last hour == USD/hour

      const resetsAt = windowStart ? new Date(Date.parse(windowStart) + WINDOW_MS) : null;
      const remaining = budget - usage;
      let projected: Date | null = null;
      if (windowStart && burnRate > 0.0001 && remaining > 0) {
        projected = new Date(now + (remaining / burnRate) * 60 * 60 * 1000);
      }

      const weeklyUsage = tokenUsageRepo.costSummary({
        start: new Date(now - WEEK_MS).toISOString()
      }).total_cost_usd;

      return {
        plan,
        estimated: true,
        window: {
          start: windowStart,
          resets_at: resetsAt ? resetsAt.toISOString() : null,
          usage_usd: round2(usage),
          budget_usd: budget,
          pct_used: budget > 0 ? Math.min(999, round2((usage / budget) * 100)) : 0,
          burn_rate_usd_per_hour: round2(burnRate),
          projected_exhaustion: projected ? projected.toISOString() : null,
          on_pace_to_hit_cap: !!(projected && resetsAt && projected.getTime() < resetsAt.getTime())
        },
        weekly: {
          usage_usd: round2(weeklyUsage),
          budget_usd: weeklyBudgetUsd && weeklyBudgetUsd > 0 ? weeklyBudgetUsd : null,
          pct_used:
            weeklyBudgetUsd && weeklyBudgetUsd > 0
              ? round2((weeklyUsage / weeklyBudgetUsd) * 100)
              : null
        }
      };
    }
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
