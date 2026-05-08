/**
 * Wrapped Service — Spotify-Wrapped-style year-in-review.
 *
 * Aggregates a configurable trailing window (default 365 days) into
 * a sequence of headline cards: top model, top project, total spend,
 * longest streak, biggest day, most-edited file, time-of-day pattern,
 * AI/human ratio, top milestone.
 *
 * Returns the full payload in one round-trip. Each card carries:
 *   { id, label, headline, stat, support, tone }
 * — designed to be rendered as a vertical card stack on the frontend.
 */

import type { RavenDB } from '../db.js';

type CardTone = 'accent' | 'success' | 'info' | 'warning' | 'muted';

interface WrappedCard {
  /** Stable id so the frontend can swap individual cards. */
  id: string;
  /** Small uppercase label rendered above the headline. */
  label: string;
  /** The big sentence — second-person voice. */
  headline: string;
  /** A single stat the card pivots on (rendered prominently). */
  stat: string;
  /** Optional supporting detail line beneath the stat. */
  support: string | null;
  tone: CardTone;
}

interface WrappedPayload {
  window_start: string;
  window_end: string;
  /** Days actually covered by the data (often less than 365). */
  span_days: number;
  cards: WrappedCard[];
  /** Raw stats so the UI can layer extra panels if desired. */
  stats: Record<string, unknown>;
}

export interface WrappedService {
  build(opts?: { windowDays?: number }): WrappedPayload;
}

function plural(n: number, s: string, p: string): string {
  return n === 1 ? s : p;
}

function fmtUsd(n: number): string {
  if (n < 0.01) return n === 0 ? '$0' : '<$0.01';
  if (n < 100) return `$${n.toFixed(2)}`;
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtTokens(n: number): string {
  if (!n) return '0';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} ${plural(m, 'minute', 'minutes')}`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (remM === 0) return `${h} ${plural(h, 'hour', 'hours')}`;
  return `${h}h ${remM}m`;
}

export function createWrappedService(db: RavenDB): WrappedService {
  function build({ windowDays = 365 }: { windowDays?: number } = {}): WrappedPayload {
    const now = new Date();
    const start = new Date(now.getTime() - windowDays * 86_400_000);
    const startIso = start.toISOString();
    const endIso = now.toISOString();

    // ── Total events + earliest timestamp (so span_days reflects reality) ──
    const totalsRow = db.db
      .prepare(
        `SELECT COUNT(*) AS events,
                COUNT(DISTINCT filepath) AS files,
                COUNT(DISTINCT project_name) AS projects,
                MIN(timestamp) AS first_ts,
                MAX(timestamp) AS last_ts
           FROM events
          WHERE timestamp >= ? AND timestamp <= ?`
      )
      .get(startIso, endIso) as
      | {
          events: number;
          files: number;
          projects: number;
          first_ts: string | null;
          last_ts: string | null;
        }
      | undefined;

    const events = totalsRow?.events ?? 0;
    const files = totalsRow?.files ?? 0;
    const projects = totalsRow?.projects ?? 0;
    const firstTs = totalsRow?.first_ts;
    const lastTs = totalsRow?.last_ts;
    const spanDays =
      firstTs && lastTs
        ? Math.max(
            1,
            Math.ceil((new Date(lastTs).getTime() - new Date(firstTs).getTime()) / 86_400_000)
          )
        : 0;

    // ── Top project ──
    const topProj = db.db
      .prepare(
        `SELECT project_name AS p, COUNT(*) AS c, COUNT(DISTINCT date(timestamp)) AS days
           FROM events
          WHERE timestamp >= ? AND timestamp <= ?
            AND project_name IS NOT NULL AND project_name != ''
          GROUP BY project_name ORDER BY c DESC LIMIT 1`
      )
      .get(startIso, endIso) as { p: string; c: number; days: number } | undefined;

    // ── Top model + cost rollup ──
    const cost = db.db
      .prepare(
        `SELECT COALESCE(SUM(estimated_cost_usd), 0) AS cost,
                COALESCE(SUM(input_tokens),  0) AS in_tok,
                COALESCE(SUM(output_tokens), 0) AS out_tok,
                COUNT(*) AS reqs
           FROM token_usage
          WHERE timestamp >= ? AND timestamp <= ?`
      )
      .get(startIso, endIso) as
      | { cost: number; in_tok: number; out_tok: number; reqs: number }
      | undefined;
    const topModel = db.db
      .prepare(
        `SELECT model AS m, COUNT(*) AS c, COALESCE(SUM(estimated_cost_usd), 0) AS cost
           FROM token_usage
          WHERE timestamp >= ? AND timestamp <= ? AND model IS NOT NULL AND model != ''
          GROUP BY model ORDER BY c DESC LIMIT 1`
      )
      .get(startIso, endIso) as { m: string; c: number; cost: number } | undefined;

    // ── Longest active-day streak ──
    const dayRows = db.db
      .prepare(
        `SELECT DISTINCT date(timestamp) AS d FROM events
          WHERE timestamp >= ? AND timestamp <= ? ORDER BY d ASC`
      )
      .all(startIso, endIso) as Array<{ d: string }>;
    let longestStreak = 0;
    let currentStreak = 0;
    let prevDay: number | null = null;
    for (const r of dayRows) {
      const day = new Date(r.d).getTime() / 86_400_000;
      if (prevDay !== null && day - prevDay === 1) currentStreak++;
      else currentStreak = 1;
      if (currentStreak > longestStreak) longestStreak = currentStreak;
      prevDay = day;
    }

    // ── Biggest day (max events on a single calendar day) ──
    const biggestDay = db.db
      .prepare(
        `SELECT date(timestamp) AS d, COUNT(*) AS c
           FROM events
          WHERE timestamp >= ? AND timestamp <= ?
          GROUP BY date(timestamp) ORDER BY c DESC LIMIT 1`
      )
      .get(startIso, endIso) as { d: string; c: number } | undefined;

    // ── Most-edited file ──
    const topFile = db.db
      .prepare(
        `SELECT filepath AS f, COUNT(*) AS c
           FROM events
          WHERE timestamp >= ? AND timestamp <= ? AND filepath IS NOT NULL
          GROUP BY filepath ORDER BY c DESC LIMIT 1`
      )
      .get(startIso, endIso) as { f: string; c: number } | undefined;

    // ── Time-of-day pattern: most-active hour bucket ──
    const hourRows = db.db
      .prepare(
        `SELECT strftime('%H', timestamp) AS h, COUNT(*) AS c
           FROM events
          WHERE timestamp >= ? AND timestamp <= ?
          GROUP BY h ORDER BY c DESC LIMIT 1`
      )
      .get(startIso, endIso) as { h: string; c: number } | undefined;

    // ── Longest single session ──
    const longestSession = db.db
      .prepare(
        `SELECT MAX(span) AS s FROM (
           SELECT (julianday(MAX(timestamp)) - julianday(MIN(timestamp))) * 86400 AS span
             FROM events
            WHERE timestamp >= ? AND timestamp <= ? AND session_id IS NOT NULL
            GROUP BY session_id HAVING COUNT(*) > 1
         )`
      )
      .get(startIso, endIso) as { s: number | null } | undefined;
    const longestSessionSeconds = Math.floor(longestSession?.s ?? 0);

    // ── Cards ──
    const cards: WrappedCard[] = [];

    cards.push({
      id: 'opener',
      label: 'Your year with Raven',
      headline:
        spanDays > 0
          ? `${spanDays} ${plural(spanDays, 'day', 'days')} of agent activity, captured.`
          : 'Welcome to your year-in-review.',
      stat: events.toLocaleString(),
      support:
        events > 0
          ? `${plural(events, 'event', 'events')} logged across ${projects} ${plural(projects, 'project', 'projects')}.`
          : 'Once you have a few weeks of events, this card will fill in.',
      tone: 'accent'
    });

    if (topProj) {
      cards.push({
        id: 'top-project',
        label: 'Your top project',
        headline: `You spent more time on ${topProj.p} than anywhere else.`,
        stat: topProj.p,
        support: `${topProj.c.toLocaleString()} ${plural(topProj.c, 'event', 'events')} across ${topProj.days} ${plural(topProj.days, 'day', 'days')}.`,
        tone: 'success'
      });
    }

    if (topModel) {
      cards.push({
        id: 'top-model',
        label: 'Your top model',
        headline: `${topModel.m} did most of the thinking.`,
        stat: topModel.m,
        support: `${topModel.c.toLocaleString()} ${plural(topModel.c, 'inference', 'inferences')} · ${fmtUsd(topModel.cost)} spent through this model.`,
        tone: 'info'
      });
    }

    if (cost && cost.reqs > 0) {
      cards.push({
        id: 'spend',
        label: 'Total spend',
        headline: `You burned ${fmtUsd(cost.cost)} on AI this year.`,
        stat: fmtUsd(cost.cost),
        support: `${cost.reqs.toLocaleString()} requests · ${fmtTokens(cost.in_tok)}↑ in, ${fmtTokens(cost.out_tok)}↓ out.`,
        tone: 'accent'
      });
    }

    if (longestStreak >= 3) {
      cards.push({
        id: 'streak',
        label: 'Longest streak',
        headline:
          longestStreak >= 14
            ? `${longestStreak} days in a row coding — your longest stretch this year.`
            : `${longestStreak} days in a row of activity.`,
        stat: `${longestStreak} ${plural(longestStreak, 'day', 'days')}`,
        support:
          longestStreak >= 14 ? "Two-week-plus streak — that's a habit, not a sprint." : null,
        tone: longestStreak >= 14 ? 'success' : 'info'
      });
    }

    if (biggestDay && biggestDay.c >= 50) {
      cards.push({
        id: 'biggest-day',
        label: 'Biggest day',
        headline: `${new Date(biggestDay.d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} was your busiest day.`,
        stat: `${biggestDay.c.toLocaleString()} events`,
        support: 'In a single day. Hope you got a good lunch.',
        tone: 'warning'
      });
    }

    if (topFile && topFile.c >= 5) {
      const fileShort =
        topFile.f.length > 56 ? `…/${topFile.f.split('/').slice(-2).join('/')}` : topFile.f;
      cards.push({
        id: 'top-file',
        label: 'Most-edited file',
        headline: `One file kept calling you back.`,
        stat: fileShort,
        support: `Touched ${topFile.c.toLocaleString()} times this year.`,
        tone: 'info'
      });
    }

    if (hourRows) {
      const hourNum = parseInt(hourRows.h, 10);
      const period =
        hourNum < 6
          ? 'before sunrise'
          : hourNum < 12
            ? 'in the morning'
            : hourNum < 17
              ? 'in the afternoon'
              : hourNum < 21
                ? 'in the evening'
                : 'late at night';
      cards.push({
        id: 'time-of-day',
        label: 'Your peak hour',
        headline: `You ship ${period}.`,
        stat: `${String(hourNum).padStart(2, '0')}:00`,
        support: `That's when ${hourRows.c.toLocaleString()} of your events landed.`,
        tone: 'muted'
      });
    }

    if (longestSessionSeconds >= 30 * 60) {
      cards.push({
        id: 'longest-session',
        label: 'Longest stretch',
        headline: `${fmtDuration(longestSessionSeconds)} in a single session.`,
        stat: fmtDuration(longestSessionSeconds),
        support: 'Heads-down focus. Hope it shipped.',
        tone: 'success'
      });
    }

    cards.push({
      id: 'closing',
      label: 'Local-first',
      headline: 'Every byte of this stayed on your machine.',
      stat: '0 cloud',
      support: 'No telemetry, no account, no third party. The trail is yours.',
      tone: 'muted'
    });

    return {
      window_start: startIso,
      window_end: endIso,
      span_days: spanDays,
      cards,
      stats: {
        events,
        files,
        projects,
        cost_usd: cost?.cost ?? 0,
        requests: cost?.reqs ?? 0,
        input_tokens: cost?.in_tok ?? 0,
        output_tokens: cost?.out_tok ?? 0,
        top_project: topProj?.p ?? null,
        top_model: topModel?.m ?? null,
        longest_streak_days: longestStreak,
        biggest_day_events: biggestDay?.c ?? 0,
        biggest_day_date: biggestDay?.d ?? null,
        top_file: topFile?.f ?? null,
        top_file_edits: topFile?.c ?? 0,
        peak_hour: hourRows ? parseInt(hourRows.h, 10) : null,
        longest_session_seconds: longestSessionSeconds
      }
    };
  }

  return { build };
}
