/**
 * Milestones Service
 *
 * Detects life-cycle milestones the user has hit with Raven running:
 * the first session, the 7-day and 30-day marks, the 100th / 1000th
 * file edit, the n-th-anniversary of the user's earliest event, and
 * a per-project "first-month" milestone.
 *
 * Frontend keeps a localStorage flag per milestone to avoid
 * re-firing the same modal twice.
 */

import type { RavenDB } from '../db.js';

type MilestoneKind =
  | 'first_session'
  | 'seven_days'
  | 'thirty_days'
  | 'hundred_edits'
  | 'thousand_edits'
  | 'anniversary'
  | 'project_first_month';

interface Milestone {
  /** Unique ID — used as the localStorage dismiss key. */
  id: string;
  kind: MilestoneKind;
  /** ISO date the milestone was reached. */
  reached_at: string;
  /** Human-readable summary suitable for a modal headline. */
  title: string;
  /** Body text — explains what changed and offers a small reflection. */
  body: string;
  /** When relevant: project the milestone is about. */
  project: string | null;
  /** Supporting numbers the modal can display. */
  stats: Record<string, number | string>;
}

export interface MilestonesService {
  list(): Milestone[];
}

function plural(n: number, s: string, p: string): string {
  return n === 1 ? s : p;
}

export function createMilestonesService(db: RavenDB): MilestonesService {
  function reachedDays(daysAgo: number): boolean {
    const earliestRow = db.db.prepare(`SELECT MIN(timestamp) AS first_ts FROM events`).get() as
      | { first_ts: string | null }
      | undefined;
    if (!earliestRow?.first_ts) return false;
    const ageMs = Date.now() - new Date(earliestRow.first_ts).getTime();
    return ageMs >= daysAgo * 86_400_000;
  }

  function eventsCount(): number {
    const row = db.db.prepare(`SELECT COUNT(*) AS c FROM events`).get() as
      | { c: number }
      | undefined;
    return row?.c ?? 0;
  }

  function distinctProjects(): number {
    const row = db.db
      .prepare(
        `SELECT COUNT(DISTINCT project_name) AS c
         FROM events WHERE project_name IS NOT NULL AND project_name != ''`
      )
      .get() as { c: number } | undefined;
    return row?.c ?? 0;
  }

  function firstSessionTimestamp(): string | null {
    const row = db.db.prepare(`SELECT MIN(timestamp) AS first_ts FROM events`).get() as
      | { first_ts: string | null }
      | undefined;
    return row?.first_ts ?? null;
  }

  function projectFirstMonthHits(): Array<{ project: string; reached_at: string; events: number }> {
    // For each project, find first event. If first event was >= 30 days
    // ago AND the project still has activity in the last 7 days
    // (i.e., they kept using it), call it a "first month" milestone.
    const rows = db.db
      .prepare(
        `SELECT
           p.project_name AS project,
           p.first_ts     AS first_ts,
           p.events       AS events
         FROM (
           SELECT project_name, MIN(timestamp) AS first_ts, COUNT(*) AS events
           FROM events
           WHERE project_name IS NOT NULL AND project_name != ''
           GROUP BY project_name
         ) p
         WHERE p.first_ts <= datetime('now', '-30 days')
           AND EXISTS (
             SELECT 1 FROM events e
             WHERE e.project_name = p.project_name
               AND e.timestamp >= datetime('now', '-7 days')
           )`
      )
      .all() as Array<{ project: string; first_ts: string; events: number }>;
    return rows.map(r => ({
      project: r.project,
      reached_at: new Date(new Date(r.first_ts).getTime() + 30 * 86_400_000).toISOString(),
      events: r.events
    }));
  }

  return {
    list() {
      const out: Milestone[] = [];
      const firstTs = firstSessionTimestamp();
      if (!firstTs) return out;

      // 1. First session ever
      out.push({
        id: `first_session:${firstTs}`,
        kind: 'first_session',
        reached_at: firstTs,
        title: 'Your first session with Raven',
        body: "Welcome — Raven's been recording since this moment. Every file edit, every inference, every project you'll touch from here on lives in your local SQLite, on your machine, and nowhere else.",
        project: null,
        stats: {}
      });

      // 2. Seven-day mark
      if (reachedDays(7)) {
        const date = new Date(new Date(firstTs).getTime() + 7 * 86_400_000).toISOString();
        out.push({
          id: `seven_days:${date.slice(0, 10)}`,
          kind: 'seven_days',
          reached_at: date,
          title: 'Seven days in.',
          body: "A week with Raven watching. The Today landing, the cost ticker, the narrative beats — they all lean on a week of data to mean anything. From here forward they're tuned for you.",
          project: null,
          stats: { events: eventsCount(), projects: distinctProjects() }
        });
      }

      // 3. Thirty-day mark
      if (reachedDays(30)) {
        const date = new Date(new Date(firstTs).getTime() + 30 * 86_400_000).toISOString();
        out.push({
          id: `thirty_days:${date.slice(0, 10)}`,
          kind: 'thirty_days',
          reached_at: date,
          title: 'A month with Raven.',
          body: "Thirty days is the bend in the retention curve — most tools you try, you stop using by now. You didn't. The before/after panel on Insights now has enough history to show how far you've come.",
          project: null,
          stats: { events: eventsCount(), projects: distinctProjects() }
        });
      }

      // 4. 100th file edit (events count)
      const events = eventsCount();
      if (events >= 100) {
        // Approximate when the 100th event happened by querying ORDER BY timestamp.
        const row = db.db
          .prepare(`SELECT timestamp FROM events ORDER BY timestamp ASC LIMIT 1 OFFSET 99`)
          .get() as { timestamp: string } | undefined;
        if (row) {
          out.push({
            id: `hundred_edits:${row.timestamp.slice(0, 10)}`,
            kind: 'hundred_edits',
            reached_at: row.timestamp,
            title: '100th file event recorded.',
            body: "Three digits of activity. The pattern detector, the diff scoring, the per-agent baselines — all of those need a corpus to lock onto. They've got one now.",
            project: null,
            stats: { events }
          });
        }
      }

      // 5. 1000th edit
      if (events >= 1000) {
        const row = db.db
          .prepare(`SELECT timestamp FROM events ORDER BY timestamp ASC LIMIT 1 OFFSET 999`)
          .get() as { timestamp: string } | undefined;
        if (row) {
          out.push({
            id: `thousand_edits:${row.timestamp.slice(0, 10)}`,
            kind: 'thousand_edits',
            reached_at: row.timestamp,
            title: '1,000th file event.',
            body: "Four digits. The activity feed, the timeline view, the trend charts — they're rendering against a real working set now. This is the kind of corpus the analytics views were built for.",
            project: null,
            stats: { events }
          });
        }
      }

      // 6. Anniversaries (1y, 2y, 3y, ...). One milestone per year passed.
      const ageMs = Date.now() - new Date(firstTs).getTime();
      const years = Math.floor(ageMs / (365.25 * 86_400_000));
      for (let y = 1; y <= years; y++) {
        const date = new Date(new Date(firstTs).getTime() + y * 365.25 * 86_400_000).toISOString();
        out.push({
          id: `anniversary:${y}:${date.slice(0, 10)}`,
          kind: 'anniversary',
          reached_at: date,
          title: y === 1 ? 'One year with Raven.' : `${y} years with Raven.`,
          body:
            y === 1
              ? 'A full year of agent activity, projects come and gone, and the running cost meter you can actually trust. Raven Wrapped knows where to look.'
              : `${y} years and counting. The audit trail goes deep — the Insights page can compare any two arbitrary windows now.`,
          project: null,
          stats: { events: eventsCount(), days: Math.floor(ageMs / 86_400_000) }
        });
      }

      // 7. Per-project "first month" — one per project that hit 30 days
      // and is still active.
      for (const p of projectFirstMonthHits()) {
        out.push({
          id: `project_first_month:${p.project}:${p.reached_at.slice(0, 10)}`,
          kind: 'project_first_month',
          reached_at: p.reached_at,
          title: `One month on ${p.project}.`,
          body: `${p.events.toLocaleString()} ${plural(p.events, 'event', 'events')} on ${p.project} since you started, still active in the last week. The historical trends view has enough data to chart its arc now.`,
          project: p.project,
          stats: { events: p.events }
        });
      }

      // Sort by reached_at descending so the most recent milestone is first.
      out.sort((a, b) => new Date(b.reached_at).getTime() - new Date(a.reached_at).getTime());
      return out;
    }
  };
}
