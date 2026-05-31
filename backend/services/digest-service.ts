/**
 * Digest Service — weekly recap aggregator.
 *
 * Produces a `WeeklyDigest` from the events / token_usage tables. The
 * digest selects ONE lead moment (the most narratable thing about the
 * week) and 3–5 supporting beats. Persists the JSON payload to the
 * existing `insights` table as type='weekly_digest' for cheap re-reads
 * and a short-lived past-digests history.
 *
 * Lead-moment selection (priority order):
 *   1. returning to a project after a >= 7-day gap
 *   2. a streak of 5+ consecutive days of activity
 *   3. a clearly dominant project (>= 60% of week's events)
 *   4. cost surge vs prior week (>= 2x)
 *   5. fallback: top project + share
 */

import type { RavenDB } from '../db.js';
import { randomUUID } from 'node:crypto';

// ── Types ─────────────────────────────────────────────────────────
interface WeeklyDigestBeat {
  glyph: string;
  tone: 'accent' | 'success' | 'info' | 'warning' | 'muted';
  text: string;
}

interface WeeklyDigestLead {
  kind: 'returning' | 'streak' | 'focus' | 'cost-surge' | 'top-project' | 'quiet-week';
  text: string;
}

interface WeeklyDigest {
  /** ISO week key, e.g. "2026-W19". Unique per Mon-anchored week. */
  week_key: string;
  /** ISO date for Monday of the week (UTC). */
  week_start: string;
  /** ISO date for the Sunday of the week (UTC). */
  week_end: string;
  /** Lead "moment" — the lede sentence. */
  lead: WeeklyDigestLead;
  /** 3–5 supporting beats. */
  beats: WeeklyDigestBeat[];
  /** Raw stats so the UI can build its own follow-on visualizations. */
  stats: {
    events: number;
    files: number;
    days_active: number;
    longest_session_seconds: number;
    cost_usd: number;
    requests: number;
    top_project: string | null;
    top_project_share: number;
    top_project_events: number;
    projects: Array<{ project: string; events: number; days_active: number }>;
    top_model: string | null;
    top_model_requests: number;
    streak_days: number;
    returning_project: { project: string; days_since_last: number } | null;
    prev_week_cost_usd: number;
  };
}

// ── Daily digest types ────────────────────────────────────────────
interface DailyDigestLead {
  kind: 'quiet' | 'returning' | 'busy' | 'late-night' | 'focus' | 'streak' | 'top-project';
  text: string;
}

interface DailyDigest {
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  /** Friendly label, e.g. "Today" / "Saturday". */
  day_label: string;
  day_start: string;
  day_end: string;
  lead: DailyDigestLead;
  beats: WeeklyDigestBeat[];
  stats: {
    events: number;
    files: number;
    cost_usd: number;
    requests: number;
    top_project: string | null;
    top_project_share: number;
    top_project_events: number;
    longest_session_seconds: number;
    top_model: string | null;
    top_model_requests: number;
    projects: Array<{ project: string; events: number }>;
    /** Trailing-7-day daily averages (excluding the digest day). */
    avg_events_7d: number;
    avg_cost_7d: number;
    peak_hour: number | null;
    streak_days: number;
    returning_project: { project: string; days_since_last: number } | null;
  };
}

export interface DigestService {
  /**
   * Returns (and caches) the digest for the week containing `at`.
   * Uses a 1-hour TTL: if a cached row is younger than that we return
   * it; otherwise we recompute and re-persist.
   */
  getOrCompute(at?: Date): WeeklyDigest;
  /** Force recompute and persist regardless of cache. */
  recompute(at?: Date): WeeklyDigest;
  /** Recent digests (descending by week_start). */
  recent(limit?: number): WeeklyDigest[];
  /**
   * Returns (and caches) the digest for the calendar day containing `at`.
   * Short TTL while the day is in progress so "today" stays live.
   */
  getDailyOrCompute(at?: Date): DailyDigest;
  /** Force recompute and persist the daily digest. */
  recomputeDaily(at?: Date): DailyDigest;
}

// ── Date helpers ──────────────────────────────────────────────────
/**
 * ISO week start: Monday 00:00 UTC of the week containing `d`.
 * Note: we keep the math UTC-aligned so the digest is stable across
 * timezones; users will read "this week" as their Mon→Sun window.
 */
function startOfIsoWeek(d: Date): Date {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = t.getUTCDay() || 7; // 1..7 (Mon..Sun)
  if (dow !== 1) t.setUTCDate(t.getUTCDate() - (dow - 1));
  t.setUTCHours(0, 0, 0, 0);
  return t;
}

function endOfIsoWeek(weekStart: Date): Date {
  const e = new Date(weekStart);
  e.setUTCDate(e.getUTCDate() + 6);
  e.setUTCHours(23, 59, 59, 999);
  return e;
}

function isoWeekKey(d: Date): string {
  // ISO 8601 week numbering (Mon-anchored).
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function plural(n: number, s: string, p: string): string {
  return n === 1 ? s : p;
}

function fmtUsd(n: number): string {
  if (n < 0.01) return '<$0.01';
  if (n < 100) return `$${n.toFixed(2)}`;
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtDuration(seconds: number): string | null {
  if (!seconds || seconds < 60) return null;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} ${plural(m, 'minute', 'minutes')}`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (remM === 0) return `${h} ${plural(h, 'hour', 'hours')}`;
  return `${h}h ${remM}m`;
}

// ── Service ───────────────────────────────────────────────────────
export function createDigestService(db: RavenDB): DigestService {
  function compute(at: Date): WeeklyDigest {
    const weekStart = startOfIsoWeek(at);
    const weekEnd = endOfIsoWeek(weekStart);
    const startIso = weekStart.toISOString();
    const endIso = weekEnd.toISOString();
    const weekKey = isoWeekKey(at);

    // Per-project breakdown for this week.
    const projects = db.db
      .prepare(
        `SELECT
           project_name AS project,
           COUNT(*) AS events,
           COUNT(DISTINCT date(timestamp)) AS days_active
         FROM events
         WHERE timestamp >= ? AND timestamp <= ?
           AND project_name IS NOT NULL AND project_name != ''
         GROUP BY project_name
         ORDER BY events DESC`
      )
      .all(startIso, endIso) as Array<{ project: string; events: number; days_active: number }>;

    // Week totals.
    const totals = db.db
      .prepare(
        `SELECT
           COUNT(*) AS events,
           COUNT(DISTINCT filepath) AS files,
           COUNT(DISTINCT date(timestamp)) AS days_active
         FROM events
         WHERE timestamp >= ? AND timestamp <= ?`
      )
      .get(startIso, endIso) as { events: number; files: number; days_active: number } | undefined;

    // Longest session in the week.
    const longestRow = db.db
      .prepare(
        `SELECT MAX(span) AS s FROM (
           SELECT (julianday(MAX(timestamp)) - julianday(MIN(timestamp))) * 86400 AS span
           FROM events
           WHERE timestamp >= ? AND timestamp <= ? AND session_id IS NOT NULL
           GROUP BY session_id
           HAVING COUNT(*) > 1
         )`
      )
      .get(startIso, endIso) as { s: number | null } | undefined;
    const longestSessionSeconds = Math.floor(longestRow?.s ?? 0);

    // Cost + top-model from token_usage.
    const costRow = db.db
      .prepare(
        `SELECT
           COALESCE(SUM(estimated_cost_usd), 0) AS cost_usd,
           COUNT(*) AS requests
         FROM token_usage
         WHERE timestamp >= ? AND timestamp <= ?`
      )
      .get(startIso, endIso) as { cost_usd: number; requests: number } | undefined;

    const topModelRow = db.db
      .prepare(
        `SELECT model, COUNT(*) AS requests
         FROM token_usage
         WHERE timestamp >= ? AND timestamp <= ? AND model IS NOT NULL AND model != ''
         GROUP BY model
         ORDER BY requests DESC
         LIMIT 1`
      )
      .get(startIso, endIso) as { model: string; requests: number } | undefined;

    // Prior week cost — for cost-surge detection.
    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setUTCDate(prevWeekStart.getUTCDate() - 7);
    const prevWeekEnd = endOfIsoWeek(prevWeekStart);
    const prevCostRow = db.db
      .prepare(
        `SELECT COALESCE(SUM(estimated_cost_usd), 0) AS cost_usd
         FROM token_usage
         WHERE timestamp >= ? AND timestamp <= ?`
      )
      .get(prevWeekStart.toISOString(), prevWeekEnd.toISOString()) as
      | { cost_usd: number }
      | undefined;

    // Streak: consecutive days ending on the most recent active day in the week.
    const dayRows = db.db
      .prepare(
        `SELECT DISTINCT date(timestamp) AS d
         FROM events
         WHERE timestamp >= ? AND timestamp <= ?
         ORDER BY d ASC`
      )
      .all(startIso, endIso) as Array<{ d: string }>;
    let streakDays = 0;
    if (dayRows.length > 0) {
      streakDays = 1;
      for (let i = dayRows.length - 1; i > 0; i--) {
        const cur = new Date(dayRows[i].d);
        const prev = new Date(dayRows[i - 1].d);
        const diff = Math.round((cur.getTime() - prev.getTime()) / 86400000);
        if (diff === 1) streakDays++;
        else break;
      }
    }

    // Returning-to-project: any project whose first edit this week was
    // preceded by a >= 7-day gap.
    const returningRows = db.db
      .prepare(
        `SELECT
           cur.project_name AS project,
           cur.first_in_week AS first_in_week,
           prev.last_before AS last_before
         FROM (
           SELECT project_name, MIN(timestamp) AS first_in_week
           FROM events
           WHERE timestamp >= ? AND timestamp <= ?
             AND project_name IS NOT NULL AND project_name != ''
           GROUP BY project_name
         ) AS cur
         LEFT JOIN (
           SELECT project_name, MAX(timestamp) AS last_before
           FROM events
           WHERE timestamp < ? AND project_name IS NOT NULL AND project_name != ''
           GROUP BY project_name
         ) AS prev
         ON cur.project_name = prev.project_name`
      )
      .all(startIso, endIso, startIso) as Array<{
      project: string;
      first_in_week: string;
      last_before: string | null;
    }>;
    let returning: { project: string; days_since_last: number } | null = null;
    for (const r of returningRows) {
      if (!r.last_before) continue;
      const days = Math.floor(
        (new Date(r.first_in_week).getTime() - new Date(r.last_before).getTime()) / 86400000
      );
      if (days >= 7 && (!returning || days > returning.days_since_last)) {
        returning = { project: r.project, days_since_last: days };
      }
    }

    // Stats roll-up.
    const events = totals?.events ?? 0;
    const files = totals?.files ?? 0;
    const daysActive = totals?.days_active ?? 0;
    const cost = costRow?.cost_usd ?? 0;
    const requests = costRow?.requests ?? 0;
    const top = projects[0] ?? null;
    const topShare = top && events > 0 ? top.events / events : 0;
    const prevCost = prevCostRow?.cost_usd ?? 0;

    // ── Lead selection ────────────────────────────────────────────
    let lead: WeeklyDigestLead;
    if (events === 0) {
      lead = { kind: 'quiet-week', text: 'Quiet week — no recorded activity this week.' };
    } else if (returning) {
      lead = {
        kind: 'returning',
        text: `You came back to ${returning.project} after ${returning.days_since_last} ${plural(
          returning.days_since_last,
          'day',
          'days'
        )} away.`
      };
    } else if (streakDays >= 5) {
      lead = {
        kind: 'streak',
        text: `${streakDays}-day streak — you wrote code every day this week${streakDays === 7 ? ', start to finish' : ''}.`
      };
    } else if (top && topShare >= 0.6) {
      const sharePct = Math.round(topShare * 100);
      lead = {
        kind: 'focus',
        text: `${sharePct}% of your week was on ${top.project} — heads-down focus.`
      };
    } else if (prevCost > 0 && cost / prevCost >= 2) {
      const ratio = (cost / prevCost).toFixed(1);
      lead = {
        kind: 'cost-surge',
        text: `Heavy week — ${fmtUsd(cost)} spent, ${ratio}× last week.`
      };
    } else if (top) {
      lead = {
        kind: 'top-project',
        text: `${top.project} led your week with ${top.events} ${plural(top.events, 'event', 'events')} across ${top.days_active} ${plural(top.days_active, 'day', 'days')}.`
      };
    } else {
      lead = { kind: 'quiet-week', text: 'A quiet week without a clear focus.' };
    }

    // ── Beats ─────────────────────────────────────────────────────
    const beats: WeeklyDigestBeat[] = [];
    if (cost > 0) {
      beats.push({
        glyph: '$',
        tone: 'accent',
        text: `${fmtUsd(cost)} spent across ${requests.toLocaleString()} ${plural(requests, 'request', 'requests')}.`
      });
    }
    if (files > 0) {
      beats.push({
        glyph: '◆',
        tone: 'info',
        text: `${files.toLocaleString()} ${plural(files, 'unique file', 'unique files')} touched, ${events.toLocaleString()} ${plural(events, 'event', 'events')} total.`
      });
    }
    if (daysActive > 0 && lead.kind !== 'streak') {
      beats.push({
        glyph: '◴',
        tone: 'success',
        text: `Active on ${daysActive} of 7 days.`
      });
    }
    if (top && lead.kind !== 'focus' && lead.kind !== 'top-project' && projects.length >= 2) {
      const sharePct = Math.round(topShare * 100);
      beats.push({
        glyph: '★',
        tone: 'success',
        text: `${top.project} took ${sharePct}% of activity${projects.length >= 3 ? `, ahead of ${projects.length - 1} other projects` : ''}.`
      });
    }
    if (topModelRow) {
      beats.push({
        glyph: '◇',
        tone: 'muted',
        text: `${topModelRow.model} was your most-used model (${topModelRow.requests.toLocaleString()} ${plural(topModelRow.requests, 'call', 'calls')}).`
      });
    }
    const dur = fmtDuration(longestSessionSeconds);
    if (dur && longestSessionSeconds >= 30 * 60) {
      beats.push({
        glyph: '◐',
        tone: 'info',
        text: `Longest session: ${dur}.`
      });
    }

    // Cap to keep the modal scannable.
    const cappedBeats = beats.slice(0, 5);

    const digest: WeeklyDigest = {
      week_key: weekKey,
      week_start: weekStart.toISOString(),
      week_end: weekEnd.toISOString(),
      lead,
      beats: cappedBeats,
      stats: {
        events,
        files,
        days_active: daysActive,
        longest_session_seconds: longestSessionSeconds,
        cost_usd: cost,
        requests,
        top_project: top?.project ?? null,
        top_project_share: topShare,
        top_project_events: top?.events ?? 0,
        projects,
        top_model: topModelRow?.model ?? null,
        top_model_requests: topModelRow?.requests ?? 0,
        streak_days: streakDays,
        returning_project: returning,
        prev_week_cost_usd: prevCost
      }
    };

    return digest;
  }

  // ── Daily digest ──────────────────────────────────────────────
  // Narrates one calendar day against a trailing-7-day baseline, so a
  // standout day ("your busiest in a while") reads as a moment rather
  // than a raw count. Local-day boundaries — the digest day is the
  // user's wall-clock day, matching how they'd describe "today".
  function computeDaily(at: Date): DailyDigest {
    const dayStart = new Date(at);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);
    const startIso = dayStart.toISOString();
    const endIso = dayEnd.toISOString();
    // YYYY-MM-DD in local time (not toISOString, which is UTC).
    const dayKey = `${dayStart.getFullYear()}-${String(dayStart.getMonth() + 1).padStart(2, '0')}-${String(dayStart.getDate()).padStart(2, '0')}`;

    const now = new Date();
    const isToday =
      dayStart.getFullYear() === now.getFullYear() &&
      dayStart.getMonth() === now.getMonth() &&
      dayStart.getDate() === now.getDate();
    const dayLabel = isToday
      ? 'Today'
      : dayStart.toLocaleDateString(undefined, { weekday: 'long' });

    const projects = db.db
      .prepare(
        `SELECT project_name AS project, COUNT(*) AS events
         FROM events
         WHERE timestamp >= ? AND timestamp <= ?
           AND project_name IS NOT NULL AND project_name != ''
         GROUP BY project_name ORDER BY events DESC`
      )
      .all(startIso, endIso) as Array<{ project: string; events: number }>;

    const totals = db.db
      .prepare(
        `SELECT COUNT(*) AS events, COUNT(DISTINCT filepath) AS files
         FROM events WHERE timestamp >= ? AND timestamp <= ?`
      )
      .get(startIso, endIso) as { events: number; files: number } | undefined;

    const costRow = db.db
      .prepare(
        `SELECT COALESCE(SUM(estimated_cost_usd), 0) AS cost_usd, COUNT(*) AS requests
         FROM token_usage WHERE timestamp >= ? AND timestamp <= ?`
      )
      .get(startIso, endIso) as { cost_usd: number; requests: number } | undefined;

    const topModelRow = db.db
      .prepare(
        `SELECT model, COUNT(*) AS requests
         FROM token_usage
         WHERE timestamp >= ? AND timestamp <= ? AND model IS NOT NULL AND model != '' AND model NOT LIKE '<%'
         GROUP BY model ORDER BY requests DESC LIMIT 1`
      )
      .get(startIso, endIso) as { model: string; requests: number } | undefined;

    const longestRow = db.db
      .prepare(
        `SELECT MAX(span) AS s FROM (
           SELECT (julianday(MAX(timestamp)) - julianday(MIN(timestamp))) * 86400 AS span
           FROM events
           WHERE timestamp >= ? AND timestamp <= ? AND session_id IS NOT NULL
           GROUP BY session_id HAVING COUNT(*) > 1
         )`
      )
      .get(startIso, endIso) as { s: number | null } | undefined;
    const longestSessionSeconds = Math.floor(longestRow?.s ?? 0);

    const peakRow = db.db
      .prepare(
        `SELECT CAST(strftime('%H', timestamp, 'localtime') AS INTEGER) AS hr, COUNT(*) AS c
         FROM events WHERE timestamp >= ? AND timestamp <= ?
         GROUP BY hr ORDER BY c DESC LIMIT 1`
      )
      .get(startIso, endIso) as { hr: number; c: number } | undefined;
    const peakHour = peakRow?.hr ?? null;

    // Trailing 7-day baseline (the 7 days *before* the digest day), used
    // to decide whether this day was unusually busy or quiet.
    const baseStart = new Date(dayStart);
    baseStart.setDate(baseStart.getDate() - 7);
    const baseRows = db.db
      .prepare(
        `SELECT date(timestamp, 'localtime') AS d,
                COUNT(*) AS events
         FROM events
         WHERE timestamp >= ? AND timestamp < ?
         GROUP BY d`
      )
      .all(baseStart.toISOString(), startIso) as Array<{ d: string; events: number }>;
    const baseCostRows = db.db
      .prepare(
        `SELECT date(timestamp, 'localtime') AS d,
                COALESCE(SUM(estimated_cost_usd), 0) AS cost
         FROM token_usage
         WHERE timestamp >= ? AND timestamp < ?
         GROUP BY d`
      )
      .all(baseStart.toISOString(), startIso) as Array<{ d: string; cost: number }>;
    // Average across the 7 calendar days (active days only — zero-days
    // would drag the baseline down and make every working day look "busy").
    const avgEvents7d =
      baseRows.length > 0 ? baseRows.reduce((a, r) => a + r.events, 0) / baseRows.length : 0;
    const avgCost7d =
      baseCostRows.length > 0
        ? baseCostRows.reduce((a, r) => a + r.cost, 0) / baseCostRows.length
        : 0;

    // Returning-to-project: any project whose first edit today was preceded
    // by a >= 2-day gap (matches the Today-narrative threshold).
    const returningRows = db.db
      .prepare(
        `SELECT cur.project_name AS project, cur.first_today AS first_today, prev.last_before AS last_before
         FROM (
           SELECT project_name, MIN(timestamp) AS first_today FROM events
           WHERE timestamp >= ? AND timestamp <= ? AND project_name IS NOT NULL AND project_name != ''
           GROUP BY project_name
         ) AS cur
         LEFT JOIN (
           SELECT project_name, MAX(timestamp) AS last_before FROM events
           WHERE timestamp < ? AND project_name IS NOT NULL AND project_name != ''
           GROUP BY project_name
         ) AS prev ON cur.project_name = prev.project_name`
      )
      .all(startIso, endIso, startIso) as Array<{
      project: string;
      first_today: string;
      last_before: string | null;
    }>;
    let returning: { project: string; days_since_last: number } | null = null;
    for (const r of returningRows) {
      if (!r.last_before) continue;
      const lastMidnight = new Date(r.last_before);
      lastMidnight.setHours(0, 0, 0, 0);
      const days = Math.round((dayStart.getTime() - lastMidnight.getTime()) / 86400000);
      if (days >= 2 && (!returning || days > returning.days_since_last)) {
        returning = { project: r.project, days_since_last: days };
      }
    }

    // Streak: consecutive active days ending on the digest day.
    const streakRows = db.db
      .prepare(
        `SELECT DISTINCT date(timestamp, 'localtime') AS d
         FROM events WHERE timestamp >= ? AND timestamp <= ?
         ORDER BY d DESC`
      )
      .all(new Date(dayStart.getTime() - 60 * 86400000).toISOString(), endIso) as Array<{
      d: string;
    }>;
    let streakDays = 0;
    if (streakRows.length > 0 && streakRows[0].d === dayKey) {
      streakDays = 1;
      for (let i = 1; i < streakRows.length; i++) {
        const a = new Date(streakRows[i - 1].d + 'T00:00:00');
        const b = new Date(streakRows[i].d + 'T00:00:00');
        if (Math.round((a.getTime() - b.getTime()) / 86400000) === 1) streakDays++;
        else break;
      }
    }

    const events = totals?.events ?? 0;
    const files = totals?.files ?? 0;
    const cost = costRow?.cost_usd ?? 0;
    const requests = costRow?.requests ?? 0;
    const top = projects[0] ?? null;
    const topShare = top && events > 0 ? top.events / events : 0;
    const isLateNight = peakHour != null && (peakHour >= 22 || peakHour <= 4);

    // ── Lead selection (priority order) ───────────────────────────
    let lead: DailyDigestLead;
    if (events === 0) {
      lead = {
        kind: 'quiet',
        text: isToday
          ? 'Quiet so far today — Raven is keeping watch.'
          : 'A quiet day — nothing recorded.'
      };
    } else if (returning) {
      lead = {
        kind: 'returning',
        text: `You came back to ${returning.project} after ${returning.days_since_last} ${plural(
          returning.days_since_last,
          'day',
          'days'
        )} away.`
      };
    } else if (avgEvents7d > 0 && events >= avgEvents7d * 1.6 && events >= 30) {
      const ratio = (events / avgEvents7d).toFixed(1);
      lead = {
        kind: 'busy',
        text: `${isToday ? "Today's" : 'A'} heavy day — ${events.toLocaleString()} ${plural(
          events,
          'change',
          'changes'
        )}, ${ratio}× your recent daily pace.`
      };
    } else if (isLateNight && events >= 20) {
      lead = {
        kind: 'late-night',
        text: top ? `Burning the midnight oil on ${top.project}.` : 'Burning the midnight oil.'
      };
    } else if (top && topShare >= 0.7) {
      const pct = Math.round(topShare * 100);
      lead = {
        kind: 'focus',
        text: `Heads-down on ${top.project} — ${pct}% of ${isToday ? "today's" : "the day's"} work.`
      };
    } else if (streakDays >= 3) {
      lead = {
        kind: 'streak',
        text: `Day ${streakDays} of your current streak — still going.`
      };
    } else if (top) {
      lead = {
        kind: 'top-project',
        text: `${top.project} led ${isToday ? 'today' : 'the day'} with ${top.events} ${plural(
          top.events,
          'change',
          'changes'
        )}.`
      };
    } else {
      lead = {
        kind: 'top-project',
        text: `${events} ${plural(events, 'change', 'changes')} logged.`
      };
    }

    // ── Beats ─────────────────────────────────────────────────────
    const beats: WeeklyDigestBeat[] = [];
    if (cost > 0) {
      const vsAvg =
        avgCost7d > 0 && cost >= avgCost7d * 1.4
          ? ` — above your ${fmtUsd(avgCost7d)}/day average`
          : avgCost7d > 0 && cost <= avgCost7d * 0.6
            ? ` — a lighter spend than usual`
            : '';
      beats.push({
        glyph: '$',
        tone: 'accent',
        text: `${fmtUsd(cost)} across ${requests.toLocaleString()} ${plural(requests, 'request', 'requests')}${vsAvg}.`
      });
    }
    if (files > 0) {
      beats.push({
        glyph: '◆',
        tone: 'info',
        text: `${files.toLocaleString()} ${plural(files, 'file', 'files')} touched, ${events.toLocaleString()} ${plural(events, 'change', 'changes')} in all.`
      });
    }
    if (top && lead.kind !== 'focus' && lead.kind !== 'top-project' && projects.length >= 2) {
      const pct = Math.round(topShare * 100);
      beats.push({
        glyph: '★',
        tone: 'success',
        text: `${top.project} took ${pct}%${projects.length >= 3 ? `, ahead of ${projects.length - 1} other projects` : ` over ${projects[1].project}`}.`
      });
    }
    const dur = fmtDuration(longestSessionSeconds);
    if (dur && longestSessionSeconds >= 25 * 60) {
      beats.push({ glyph: '◐', tone: 'info', text: `Longest session: ${dur}.` });
    }
    if (topModelRow && lead.kind !== 'late-night') {
      beats.push({
        glyph: '◇',
        tone: 'muted',
        text: `Mostly ${topModelRow.model} (${topModelRow.requests.toLocaleString()} ${plural(topModelRow.requests, 'call', 'calls')}).`
      });
    }

    return {
      day: dayKey,
      day_label: dayLabel,
      day_start: startIso,
      day_end: endIso,
      lead,
      beats: beats.slice(0, 4),
      stats: {
        events,
        files,
        cost_usd: cost,
        requests,
        top_project: top?.project ?? null,
        top_project_share: topShare,
        top_project_events: top?.events ?? 0,
        longest_session_seconds: longestSessionSeconds,
        top_model: topModelRow?.model ?? null,
        top_model_requests: topModelRow?.requests ?? 0,
        projects,
        avg_events_7d: avgEvents7d,
        avg_cost_7d: avgCost7d,
        peak_hour: peakHour,
        streak_days: streakDays,
        returning_project: returning
      }
    };
  }

  function persistDaily(digest: DailyDigest): void {
    db.db
      .prepare(`DELETE FROM insights WHERE type = ? AND title = ?`)
      .run('daily_recap', digest.day);
    db.db
      .prepare(
        `INSERT INTO insights (id, timestamp, type, title, content, model, duration_ms, context_events)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        `dr_${randomUUID()}`,
        new Date().toISOString(),
        'daily_recap',
        digest.day,
        JSON.stringify(digest),
        'aggregator',
        0,
        digest.stats.events
      );
  }

  function getCachedDaily(dayKey: string, maxAgeMs: number): DailyDigest | null {
    const row = db.db
      .prepare(
        `SELECT timestamp, content FROM insights
         WHERE type = 'daily_recap' AND title = ? ORDER BY timestamp DESC LIMIT 1`
      )
      .get(dayKey) as { timestamp: string; content: string } | undefined;
    if (!row) return null;
    if (Date.now() - new Date(row.timestamp).getTime() > maxAgeMs) return null;
    try {
      return JSON.parse(row.content) as DailyDigest;
    } catch {
      return null;
    }
  }

  function persist(digest: WeeklyDigest): void {
    // One row per week, replace prior cached version. Stored on the
    // existing insights table to avoid a new schema for what is
    // effectively a JSON blob with a known type.
    db.db
      .prepare(`DELETE FROM insights WHERE type = ? AND title = ?`)
      .run('weekly_digest', digest.week_key);
    db.db
      .prepare(
        `INSERT INTO insights (id, timestamp, type, title, content, model, duration_ms, context_events)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        `wd_${randomUUID()}`,
        new Date().toISOString(),
        'weekly_digest',
        digest.week_key,
        JSON.stringify(digest),
        'aggregator',
        0,
        digest.stats.events
      );
  }

  function getCached(weekKey: string, maxAgeMs: number): WeeklyDigest | null {
    const row = db.db
      .prepare(
        `SELECT timestamp, content FROM insights
         WHERE type = ? AND title = ?
         ORDER BY timestamp DESC
         LIMIT 1`
      )
      .get('weekly_digest', weekKey) as { timestamp: string; content: string } | undefined;
    if (!row) return null;
    const age = Date.now() - new Date(row.timestamp).getTime();
    if (age > maxAgeMs) return null;
    try {
      return JSON.parse(row.content) as WeeklyDigest;
    } catch {
      return null;
    }
  }

  return {
    getOrCompute(at = new Date()) {
      const weekKey = isoWeekKey(at);
      const cached = getCached(weekKey, 60 * 60 * 1000); // 1h TTL
      if (cached) return cached;
      const fresh = compute(at);
      persist(fresh);
      return fresh;
    },

    recompute(at = new Date()) {
      const fresh = compute(at);
      persist(fresh);
      return fresh;
    },

    recent(limit = 10) {
      const rows = db.db
        .prepare(
          `SELECT content FROM insights
           WHERE type = 'weekly_digest'
           ORDER BY title DESC
           LIMIT ?`
        )
        .all(limit) as Array<{ content: string }>;
      const out: WeeklyDigest[] = [];
      for (const r of rows) {
        try {
          out.push(JSON.parse(r.content) as WeeklyDigest);
        } catch {
          // skip malformed rows
        }
      }
      return out;
    },

    getDailyOrCompute(at = new Date()) {
      const d = new Date(at);
      d.setHours(0, 0, 0, 0);
      const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      // Today is still in motion → short TTL so it stays live. Past days are
      // settled → cache hard.
      const now = new Date();
      const isToday =
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();
      const ttl = isToday ? 5 * 60 * 1000 : 24 * 60 * 60 * 1000;
      const cached = getCachedDaily(dayKey, ttl);
      if (cached) return cached;
      const fresh = computeDaily(at);
      persistDaily(fresh);
      return fresh;
    },

    recomputeDaily(at = new Date()) {
      const fresh = computeDaily(at);
      persistDaily(fresh);
      return fresh;
    }
  };
}
