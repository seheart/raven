/**
 * Looking Back service — narrative year-in-review.
 *
 * Aggregates a configurable trailing window (default 365 days) into
 * a sequence of headline cards: top model, top project, total spend,
 * longest streak, biggest day, most-edited file, time-of-day pattern,
 * longest session, closing.
 *
 * Returns the full payload in one round-trip. Each card carries:
 *   { id, label, headline, stat, support, tone }
 * — designed to be rendered as a vertical card stack on the frontend.
 *
 * Audit notes (corrections from the first pass):
 *   • All `date()` and `strftime()` calls use 'localtime' so day-bucketed
 *     stats line up with how the user actually experiences a "day". The
 *     prior version grouped in UTC and an EDT user's 11pm session split
 *     across two UTC days — broke streaks, mislabeled biggest-day, and
 *     reported peak hour off by 4–5 hours.
 *   • Top-file filters out database/lock/log noise so the result is a
 *     human-typeable file, not the SQLite write target of the moment.
 *   • Top model ranks by output tokens (the actual "thinking" volume),
 *     not raw request count.
 *   • Longest session splits on >15-min gaps so a laptop closed mid-
 *     session doesn't inflate the "heads-down focus" stat.
 *   • Spend copy is neutral about billing mode — the page wraps it in
 *     subscription-aware framing rather than claiming "you burned $X".
 *   • Closing copy scopes "local-first" to the Wrapped/Raven analytics
 *     themselves, not the LLM calls (which obviously go to Anthropic).
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

    // ── Agent events (the "AI activity" signal — distinct from raw file
    //    events which include any watcher noise). Used in the opener so
    //    the headline doesn't oversell file-watcher hits as "agent
    //    activity". ──
    const agentTotals = db.db
      .prepare(
        `SELECT COUNT(*) AS c FROM agent_events
          WHERE timestamp >= ? AND timestamp <= ?`
      )
      .get(startIso, endIso) as { c: number } | undefined;
    const agentEvents = agentTotals?.c ?? 0;

    // ── Top project. Local-day count for "active days" so a 11pm-EDT
    //    session doesn't get split across two UTC days. ──
    const topProj = db.db
      .prepare(
        `SELECT project_name AS p, COUNT(*) AS c,
                COUNT(DISTINCT date(timestamp, 'localtime')) AS days
           FROM events
          WHERE timestamp >= ? AND timestamp <= ?
            AND project_name IS NOT NULL AND project_name != ''
          GROUP BY project_name ORDER BY c DESC LIMIT 1`
      )
      .get(startIso, endIso) as { p: string; c: number; days: number } | undefined;

    // ── Total spend rollup (used for the spend card). ──
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

    // ── Top model — ranked by output tokens (= actual "thinking" volume),
    //    not raw request count. A handful of huge-output Opus runs is
    //    more meaningful than thousands of tiny Haiku probes. ──
    const topModel = db.db
      .prepare(
        `SELECT model AS m,
                COUNT(*) AS c,
                COALESCE(SUM(output_tokens), 0) AS out_tok,
                COALESCE(SUM(estimated_cost_usd), 0) AS cost
           FROM token_usage
          WHERE timestamp >= ? AND timestamp <= ? AND model IS NOT NULL AND model != ''
          GROUP BY model ORDER BY out_tok DESC LIMIT 1`
      )
      .get(startIso, endIso) as { m: string; c: number; out_tok: number; cost: number } | undefined;

    // ── Longest active-day streak. localtime grouping so timezone
    //    midnight rollover doesn't fake-break a streak. ──
    const dayRows = db.db
      .prepare(
        `SELECT DISTINCT date(timestamp, 'localtime') AS d FROM events
          WHERE timestamp >= ? AND timestamp <= ? ORDER BY d ASC`
      )
      .all(startIso, endIso) as Array<{ d: string }>;
    let longestStreak = 0;
    let currentStreak = 0;
    let prevDay: number | null = null;
    for (const r of dayRows) {
      // Date.parse('YYYY-MM-DD') treats the string as UTC midnight; that's
      // fine for difference math because every entry has the same offset.
      const day = new Date(r.d + 'T00:00:00Z').getTime() / 86_400_000;
      if (prevDay !== null && day - prevDay === 1) currentStreak++;
      else currentStreak = 1;
      if (currentStreak > longestStreak) longestStreak = currentStreak;
      prevDay = day;
    }

    // ── Biggest day. Localtime grouping so the displayed weekday matches
    //    the user's lived day. ──
    const biggestDay = db.db
      .prepare(
        `SELECT date(timestamp, 'localtime') AS d, COUNT(*) AS c
           FROM events
          WHERE timestamp >= ? AND timestamp <= ?
          GROUP BY date(timestamp, 'localtime') ORDER BY c DESC LIMIT 1`
      )
      .get(startIso, endIso) as { d: string; c: number } | undefined;

    // ── Most-edited file. Excludes:
    //    - SQLite/db files: written on every transaction → huge useless count
    //    - Lock files (package-lock.json, yarn.lock, *.lock)
    //    - Log files
    //    - Snapshots / cache / build artifacts
    //   Goal: surface a file the user actually typed in, not a write-target. ──
    const topFile = db.db
      .prepare(
        `SELECT filepath AS f, COUNT(*) AS c
           FROM events
          WHERE timestamp >= ? AND timestamp <= ? AND filepath IS NOT NULL
            AND filepath NOT LIKE '%.db'
            AND filepath NOT LIKE '%.db-journal'
            AND filepath NOT LIKE '%.db-wal'
            AND filepath NOT LIKE '%.db-shm'
            AND filepath NOT LIKE '%.sqlite'
            AND filepath NOT LIKE '%.sqlite3'
            AND filepath NOT LIKE '%.lock'
            AND filepath NOT LIKE '%-lock.json'
            AND filepath NOT LIKE '%lock.yaml'
            AND filepath NOT LIKE '%.log'
            AND filepath NOT LIKE '%/snapshots/%'
            AND filepath NOT LIKE '%/.cache/%'
            AND filepath NOT LIKE '%/dist/%'
            AND filepath NOT LIKE '%/build/%'
            AND filepath NOT LIKE '%/coverage/%'
            AND filepath NOT LIKE '%/.git/%'
            AND filepath NOT LIKE '%/node_modules/%'
          GROUP BY filepath ORDER BY c DESC LIMIT 1`
      )
      .get(startIso, endIso) as { f: string; c: number } | undefined;

    // ── Time-of-day pattern. Localtime hour, so "06:00" means 6am for the
    //    user, not 6am UTC (which is 2am EDT — opposite story). ──
    const hourRows = db.db
      .prepare(
        `SELECT strftime('%H', timestamp, 'localtime') AS h, COUNT(*) AS c
           FROM events
          WHERE timestamp >= ? AND timestamp <= ?
          GROUP BY h ORDER BY c DESC LIMIT 1`
      )
      .get(startIso, endIso) as { h: string; c: number } | undefined;

    // ── Longest single session, gap-aware. The previous version did
    //    MAX(ts) - MIN(ts) per session_id, which counts wall-clock from
    //    first to last event — a laptop closed for hours mid-session would
    //    inflate the "heads-down focus" stat. This walks the events of
    //    each session in order and breaks the run on any gap > 15 minutes,
    //    so the reported stretch is real focused activity. ──
    const sessionEvents = db.db
      .prepare(
        `SELECT session_id, timestamp FROM events
          WHERE timestamp >= ? AND timestamp <= ? AND session_id IS NOT NULL
          ORDER BY session_id, timestamp ASC`
      )
      .all(startIso, endIso) as Array<{ session_id: string; timestamp: string }>;
    const GAP_MS = 15 * 60_000;
    let longestSessionSeconds = 0;
    let curSession: string | null = null;
    let runStart = 0;
    let runLast = 0;
    for (const ev of sessionEvents) {
      const t = new Date(ev.timestamp).getTime();
      if (ev.session_id !== curSession) {
        // Wrap up the previous run before starting a new session.
        if (runStart && runLast > runStart) {
          longestSessionSeconds = Math.max(longestSessionSeconds, (runLast - runStart) / 1000);
        }
        curSession = ev.session_id;
        runStart = t;
        runLast = t;
        continue;
      }
      if (t - runLast > GAP_MS) {
        // Gap — close out the run and start a new one in the same session.
        if (runLast > runStart) {
          longestSessionSeconds = Math.max(longestSessionSeconds, (runLast - runStart) / 1000);
        }
        runStart = t;
      }
      runLast = t;
    }
    if (runLast > runStart) {
      longestSessionSeconds = Math.max(longestSessionSeconds, (runLast - runStart) / 1000);
    }
    longestSessionSeconds = Math.floor(longestSessionSeconds);

    // ── Cards ──
    const cards: WrappedCard[] = [];

    cards.push({
      id: 'opener',
      label: 'Your year with Raven',
      headline:
        spanDays > 0
          ? `${spanDays} ${plural(spanDays, 'day', 'days')} of activity, captured.`
          : 'Welcome to your year-in-review.',
      stat: events.toLocaleString(),
      // Honest split: events = file watcher hits, agent_events = AI turns.
      // Earlier copy called all events "agent activity" which oversold a
      // count that includes any file-system noise across watched projects.
      support:
        events > 0
          ? `${events.toLocaleString()} file ${plural(events, 'event', 'events')} · ${agentEvents.toLocaleString()} AI ${plural(agentEvents, 'turn', 'turns')} · ${projects} ${plural(projects, 'project', 'projects')}.`
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
        support: `${topModel.c.toLocaleString()} ${plural(topModel.c, 'turn', 'turns')} · ${fmtTokens(topModel.out_tok)} output tokens generated.`,
        tone: 'info'
      });
    }

    if (cost && cost.reqs > 0) {
      // Neutral framing — "this much compute, valued at $X" — instead
      // of "you burned $X". The frontend layers subscription-aware copy
      // on top so a Claude Max user doesn't read this as actual spend.
      cards.push({
        id: 'spend',
        label: 'Compute used',
        headline: `That much thinking, valued at ${fmtUsd(cost.cost)} at API rates.`,
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
      // biggestDay.d is a "YYYY-MM-DD" string from `date(.., 'localtime')`.
      // new Date('YYYY-MM-DD') parses as UTC midnight, so toLocaleDateString
      // in any non-UTC zone displays the previous day. Anchor at noon
      // local-zone via the 3-arg Date constructor to dodge that.
      const [yyyy, mm, dd] = biggestDay.d.split('-').map(n => parseInt(n, 10));
      const dayDate = new Date(yyyy, (mm || 1) - 1, dd || 1, 12, 0, 0);
      cards.push({
        id: 'biggest-day',
        label: 'Biggest day',
        headline: `${dayDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} was your busiest day.`,
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
        headline: `${fmtDuration(longestSessionSeconds)} of focused activity, unbroken.`,
        stat: fmtDuration(longestSessionSeconds),
        // Gap-aware (15-min idle splits the run), so this is real focus
        // time — not wall-clock with a closed laptop in the middle.
        support: 'Activity within 15 minutes of itself counts. Real heads-down stretch.',
        tone: 'success'
      });
    }

    cards.push({
      id: 'closing',
      label: 'Local-first',
      // Scoped to Raven specifically — the LLM calls obviously go to
      // Anthropic, but Raven itself never phoned home with any of this.
      headline: 'This whole story stayed on your machine.',
      stat: '0 telemetry',
      support: 'Raven never phoned home. The trail is yours.',
      tone: 'muted'
    });

    return {
      window_start: startIso,
      window_end: endIso,
      span_days: spanDays,
      cards,
      stats: {
        events,
        agent_events: agentEvents,
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
