/**
 * Persona Service — Raven's read on *you*.
 *
 * The relationship centerpiece of the Narrative page. Where the daily/weekly
 * digests narrate *what happened*, the persona narrates *who you are at the
 * keyboard* — a deterministic, data-derived profile that makes Raven feel like
 * it has been paying attention.
 *
 * Everything here is computed from real telemetry over a rolling 30-day
 * window — no LLM, no guessing. The voice matches the established narrative
 * beats: second-person, specific, only-when-the-data-supports-it. A trait that
 * isn't backed by enough signal simply isn't emitted.
 *
 * Signals (all from events / agent_events / token_usage / project_stats):
 *   • chronotype  — when you work (local hour-of-day distribution)
 *   • cadence     — how you work (session lengths: marathoner vs sprinter)
 *   • focus       — how you spread (one home base vs many projects)
 *   • languages   — your mother tongue (file extensions, code-only)
 *   • rhythm      — your week shape (busiest weekday, weekend lean)
 *   • model       — the mind you reach for most
 *   • tenure      — how long Raven has been watching
 *
 * The output is cached on the `insights` table (type='user_persona') with a
 * 6-hour TTL — a persona drifts slowly, so it doesn't need recomputing often.
 */

import type { RavenDB } from '../db.js';
import { randomUUID } from 'node:crypto';

const WINDOW_DAYS = 30;

// ── Types ─────────────────────────────────────────────────────────
export interface PersonaTrait {
  glyph: string;
  tone: 'accent' | 'success' | 'info' | 'warning' | 'muted';
  /** Short tag, e.g. "Night owl". */
  label: string;
  /** Relational sentence, e.g. "You do your best work after dark…". */
  text: string;
}

export interface UserPersona {
  generated_at: string;
  window_days: number;
  /** Days since Raven first saw any activity. */
  tenure_days: number;
  /** False when there's not enough data to characterize anyone yet. */
  has_data: boolean;
  /** Archetype, e.g. "The Nocturnal Marathoner". */
  title: string;
  /** One-line relational summary. */
  tagline: string;
  chronotype: {
    key: 'nocturnal' | 'evening' | 'daylight' | 'dawn' | null;
    label: string;
    peak_hour: number | null;
    after_hours_share: number;
  };
  cadence: {
    key: 'marathoner' | 'sprinter' | 'steady' | null;
    label: string;
    avg_session_seconds: number;
    longest_session_seconds: number;
    sessions: number;
  };
  focus: {
    key: 'specialist' | 'polyglot' | 'juggler' | 'generalist' | null;
    label: string;
    project_count: number;
    top_project: string | null;
    top_project_share: number;
  };
  languages: Array<{ ext: string; language: string; share: number; files: number }>;
  top_model: string | null;
  rhythm: {
    busiest_weekday: string | null;
    busiest_weekday_share: number;
    active_days: number;
    weekend_share: number;
  };
  current_streak: number;
  totals: {
    events: number;
    files: number;
    cost_usd: number;
    requests: number;
    projects: number;
  };
  /** The rendered persona, as relational beats. */
  traits: PersonaTrait[];
}

export interface PersonaService {
  /** Returns (and caches) the persona, recomputing on a 6h cache miss. */
  get(at?: Date): UserPersona;
  /** Force recompute and persist. */
  recompute(at?: Date): UserPersona;
}

// ── Helpers ───────────────────────────────────────────────────────
function plural(n: number, s: string, p: string): string {
  return n === 1 ? s : p;
}

function fmtUsd(n: number): string {
  if (n < 0.01) return '<$0.01';
  if (n < 100) return `$${n.toFixed(2)}`;
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtDuration(seconds: number): string {
  if (!seconds || seconds < 60) return `${Math.max(0, Math.round(seconds))}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} ${plural(m, 'minute', 'minutes')}`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (remM === 0) return `${h} ${plural(h, 'hour', 'hours')}`;
  return `${h}h ${remM}m`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Markup / data / docs formats — counted, but not treated as the craft a
// developer identifies with. Used to bias identity narration toward real code.
const MARKUP_OR_DATA = new Set(['Markdown', 'JSON', 'YAML', 'TOML', 'HTML', 'CSS']);

// Code-only extension → language. Raven watches non-code dirs too (icons,
// model weights, images), so the "mother tongue" deliberately ignores anything
// not on this list — otherwise a folder of .ico files would drown out the code.
const EXT_LANGUAGE: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TypeScript',
  js: 'JavaScript',
  jsx: 'JavaScript',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  svelte: 'Svelte',
  vue: 'Vue',
  py: 'Python',
  rb: 'Ruby',
  go: 'Go',
  rs: 'Rust',
  java: 'Java',
  kt: 'Kotlin',
  swift: 'Swift',
  c: 'C',
  h: 'C',
  cpp: 'C++',
  cc: 'C++',
  hpp: 'C++',
  cs: 'C#',
  php: 'PHP',
  sh: 'Shell',
  bash: 'Shell',
  zsh: 'Shell',
  sql: 'SQL',
  css: 'CSS',
  scss: 'CSS',
  html: 'HTML',
  md: 'Markdown',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  toml: 'TOML',
  lua: 'Lua',
  ex: 'Elixir',
  exs: 'Elixir',
  dart: 'Dart',
  scala: 'Scala',
  clj: 'Clojure',
  hs: 'Haskell',
  zig: 'Zig'
};

/** Pretty-print a raw model id like "claude-opus-4-6" → "Claude Opus 4.6". */
function prettyModel(model: string): string {
  if (!model) return model;
  const m = model.match(/^claude-(opus|sonnet|haiku)-(\d+)-(\d+)/i);
  if (m) {
    const tier = m[1].charAt(0).toUpperCase() + m[1].slice(1);
    return `Claude ${tier} ${m[2]}.${m[3]}`;
  }
  // Fall back to a tidied version of the raw id.
  return model.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function extOf(filepath: string): string | null {
  const base = filepath.split('/').pop() || '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return null;
  return base.slice(dot + 1).toLowerCase();
}

// ── Service ───────────────────────────────────────────────────────
export function createPersonaService(db: RavenDB): PersonaService {
  function compute(at: Date): UserPersona {
    const cutoff = new Date(at.getTime() - WINDOW_DAYS * 86400000);
    const cutoffIso = cutoff.toISOString();
    const generatedAt = at.toISOString();

    // ── Totals over the window ─────────────────────────────────────
    const totalsRow = db.db
      .prepare(
        `SELECT
           COUNT(*) AS events,
           COUNT(DISTINCT filepath) AS files,
           COUNT(DISTINCT date(timestamp, 'localtime')) AS days_active
         FROM events
         WHERE timestamp >= ?`
      )
      .get(cutoffIso) as { events: number; files: number; days_active: number } | undefined;
    const events = totalsRow?.events ?? 0;
    const files = totalsRow?.files ?? 0;
    const activeDays = totalsRow?.days_active ?? 0;

    // Per-project breakdown (events table).
    const projects = db.db
      .prepare(
        `SELECT project_name AS project, COUNT(*) AS events
         FROM events
         WHERE timestamp >= ? AND project_name IS NOT NULL AND project_name != ''
         GROUP BY project_name
         ORDER BY events DESC`
      )
      .all(cutoffIso) as Array<{ project: string; events: number }>;
    const projectEventTotal = projects.reduce((a, p) => a + p.events, 0);
    const topProject = projects[0] ?? null;
    const topProjectShare =
      topProject && projectEventTotal > 0 ? topProject.events / projectEventTotal : 0;

    // Cost + requests.
    const costRow = db.db
      .prepare(
        `SELECT COALESCE(SUM(estimated_cost_usd), 0) AS cost_usd, COUNT(*) AS requests
         FROM token_usage WHERE timestamp >= ?`
      )
      .get(cutoffIso) as { cost_usd: number; requests: number } | undefined;
    const cost = costRow?.cost_usd ?? 0;
    const requests = costRow?.requests ?? 0;

    const topModelRow = db.db
      .prepare(
        `SELECT model, COUNT(*) AS requests
         FROM token_usage
         WHERE timestamp >= ? AND model IS NOT NULL AND model != '' AND model NOT LIKE '<%'
         GROUP BY model ORDER BY requests DESC LIMIT 1`
      )
      .get(cutoffIso) as { model: string; requests: number } | undefined;
    const topModel = topModelRow ? prettyModel(topModelRow.model) : null;

    // ── Chronotype — local hour-of-day distribution ────────────────
    // Union agent_events + events timestamps for a dense activity signal.
    // 'localtime' converts UTC→server-local; on a single-machine app the
    // server clock *is* the user's clock, so this reads as their wall time.
    const hourRows = db.db
      .prepare(
        `SELECT CAST(strftime('%H', timestamp, 'localtime') AS INTEGER) AS hr, COUNT(*) AS c
         FROM (
           SELECT timestamp FROM agent_events WHERE timestamp >= ?
           UNION ALL
           SELECT timestamp FROM events WHERE timestamp >= ?
         )
         GROUP BY hr`
      )
      .all(cutoffIso, cutoffIso) as Array<{ hr: number; c: number }>;
    const hourTotal = hourRows.reduce((a, r) => a + r.c, 0);
    const bands = { nocturnal: 0, dawn: 0, daylight: 0, evening: 0 };
    let peakHour: number | null = null;
    let peakCount = -1;
    for (const r of hourRows) {
      if (r.c > peakCount) {
        peakCount = r.c;
        peakHour = r.hr;
      }
      if (r.hr >= 22 || r.hr <= 4) bands.nocturnal += r.c;
      else if (r.hr <= 10) bands.dawn += r.c;
      else if (r.hr <= 16) bands.daylight += r.c;
      else bands.evening += r.c;
    }
    let chronoKey: UserPersona['chronotype']['key'] = null;
    let chronoLabel = '';
    if (hourTotal > 0) {
      const entries = Object.entries(bands) as Array<[NonNullable<typeof chronoKey>, number]>;
      entries.sort((a, b) => b[1] - a[1]);
      chronoKey = entries[0][0];
      chronoLabel = {
        nocturnal: 'Night owl',
        dawn: 'Early riser',
        daylight: 'Daytime',
        evening: 'Evening'
      }[chronoKey];
    }
    const afterHoursShare = hourTotal > 0 ? (bands.nocturnal + bands.evening) / hourTotal : 0;

    // ── Cadence — session lengths ──────────────────────────────────
    const sessionRows = db.db
      .prepare(
        `SELECT (julianday(MAX(timestamp)) - julianday(MIN(timestamp))) * 86400 AS span
         FROM events
         WHERE timestamp >= ? AND session_id IS NOT NULL
         GROUP BY session_id
         HAVING COUNT(*) > 1`
      )
      .all(cutoffIso) as Array<{ span: number }>;
    const spans = sessionRows.map(r => Math.max(0, r.span || 0));
    const sessionCount = spans.length;
    const avgSession = sessionCount > 0 ? spans.reduce((a, s) => a + s, 0) / sessionCount : 0;
    const longestSession = sessionCount > 0 ? Math.max(...spans) : 0;
    let cadenceKey: UserPersona['cadence']['key'] = null;
    let cadenceLabel = '';
    if (sessionCount >= 3) {
      if (avgSession >= 90 * 60) {
        cadenceKey = 'marathoner';
        cadenceLabel = 'Marathoner';
      } else if (avgSession <= 25 * 60) {
        cadenceKey = 'sprinter';
        cadenceLabel = 'Sprinter';
      } else {
        cadenceKey = 'steady';
        cadenceLabel = 'Steady';
      }
    }

    // ── Languages — code-only mother tongue ────────────────────────
    const fileRows = db.db
      .prepare(
        `SELECT filepath, COUNT(*) AS c
         FROM events
         WHERE timestamp >= ? AND filepath IS NOT NULL AND filepath != ''
         GROUP BY filepath`
      )
      .all(cutoffIso) as Array<{ filepath: string; c: number }>;
    /** ext → {files, events} for code extensions only. */
    const langAgg = new Map<string, { language: string; files: number; events: number }>();
    let codeFileTotal = 0;
    for (const row of fileRows) {
      const ext = extOf(row.filepath);
      if (!ext) continue;
      const language = EXT_LANGUAGE[ext];
      if (!language) continue;
      codeFileTotal++;
      const cur = langAgg.get(ext) || { language, files: 0, events: 0 };
      cur.files += 1;
      cur.events += row.c;
      langAgg.set(ext, cur);
    }
    const languages = Array.from(langAgg.entries())
      .map(([ext, v]) => ({
        ext,
        language: v.language,
        files: v.files,
        share: codeFileTotal > 0 ? v.files / codeFileTotal : 0
      }))
      .sort((a, b) => b.files - a.files)
      .slice(0, 4);
    // Collapse extensions that map to the same language (ts+tsx → TypeScript).
    const byLanguage = new Map<string, { language: string; files: number; share: number }>();
    for (const l of languages) {
      const cur = byLanguage.get(l.language) || { language: l.language, files: 0, share: 0 };
      cur.files += l.files;
      cur.share += l.share;
      byLanguage.set(l.language, cur);
    }
    const topLanguages = Array.from(byLanguage.values()).sort((a, b) => b.files - a.files);
    // For *identity* narration (tagline, mother tongue, polyglot list) prefer
    // actual programming languages — "you build mostly in Markdown" rings
    // false when Markdown is just docs. The full list still drives the chips.
    const codeLanguages = topLanguages.filter(l => !MARKUP_OR_DATA.has(l.language));
    const identityLanguages = codeLanguages.length > 0 ? codeLanguages : topLanguages;

    // ── Rhythm — week shape ────────────────────────────────────────
    const wdRows = db.db
      .prepare(
        `SELECT CAST(strftime('%w', timestamp, 'localtime') AS INTEGER) AS wd, COUNT(*) AS c
         FROM (
           SELECT timestamp FROM agent_events WHERE timestamp >= ?
           UNION ALL
           SELECT timestamp FROM events WHERE timestamp >= ?
         )
         GROUP BY wd`
      )
      .all(cutoffIso, cutoffIso) as Array<{ wd: number; c: number }>;
    const wdTotal = wdRows.reduce((a, r) => a + r.c, 0);
    let busiestWd: number | null = null;
    let busiestWdCount = -1;
    let weekendCount = 0;
    for (const r of wdRows) {
      if (r.c > busiestWdCount) {
        busiestWdCount = r.c;
        busiestWd = r.wd;
      }
      if (r.wd === 0 || r.wd === 6) weekendCount += r.c;
    }
    const busiestWeekday = busiestWd != null ? WEEKDAYS[busiestWd] : null;
    const busiestWeekdayShare = wdTotal > 0 ? busiestWdCount / wdTotal : 0;
    const weekendShare = wdTotal > 0 ? weekendCount / wdTotal : 0;

    // ── Current streak — consecutive active days ending today ──────
    const dayRows = db.db
      .prepare(
        `SELECT DISTINCT date(timestamp, 'localtime') AS d
         FROM events WHERE timestamp >= ?
         ORDER BY d DESC`
      )
      .all(new Date(at.getTime() - 60 * 86400000).toISOString()) as Array<{ d: string }>;
    let streak = 0;
    if (dayRows.length > 0) {
      const today = new Date(at);
      today.setHours(0, 0, 0, 0);
      const dayMs = 86400000;
      // Anchor must be today or yesterday for an "active streak" to count.
      const mostRecent = new Date(dayRows[0].d + 'T00:00:00');
      const gap = Math.round((today.getTime() - mostRecent.getTime()) / dayMs);
      if (gap <= 1) {
        streak = 1;
        for (let i = 1; i < dayRows.length; i++) {
          const cur = new Date(dayRows[i - 1].d + 'T00:00:00');
          const prev = new Date(dayRows[i].d + 'T00:00:00');
          if (Math.round((cur.getTime() - prev.getTime()) / dayMs) === 1) streak++;
          else break;
        }
      }
    }

    // ── Tenure — how long Raven has been watching ──────────────────
    const tenureRow = db.db.prepare(`SELECT MIN(first_seen_at) AS f FROM project_stats`).get() as
      | { f: string | null }
      | undefined;
    let tenureDays = 0;
    if (tenureRow?.f) {
      tenureDays = Math.max(
        0,
        Math.floor((at.getTime() - new Date(tenureRow.f).getTime()) / 86400000)
      );
    }

    // ── Focus classification ───────────────────────────────────────
    const projectCount = projects.length;
    const distinctLanguages = identityLanguages.length;
    let focusKey: UserPersona['focus']['key'] = null;
    let focusLabel = '';
    if (projectCount > 0) {
      if (topProjectShare >= 0.6 || projectCount === 1) {
        focusKey = 'specialist';
        focusLabel = 'Specialist';
      } else if (distinctLanguages >= 4) {
        focusKey = 'polyglot';
        focusLabel = 'Polyglot';
      } else if (projectCount >= 4) {
        focusKey = 'juggler';
        focusLabel = 'Juggler';
      } else {
        focusKey = 'generalist';
        focusLabel = 'Generalist';
      }
    }

    const hasData = events >= 20 && hourTotal > 0;

    // ── Title + tagline ────────────────────────────────────────────
    const chronoAdjective: Record<NonNullable<typeof chronoKey>, string> = {
      nocturnal: 'Nocturnal',
      dawn: 'Dawn',
      daylight: 'Daylight',
      evening: 'Evening'
    };
    // Pick the noun from the strongest distinguishing trait: a pronounced
    // cadence wins; otherwise the focus archetype; otherwise just "Builder".
    let noun = 'Builder';
    if (cadenceKey === 'marathoner') noun = 'Marathoner';
    else if (cadenceKey === 'sprinter') noun = 'Sprinter';
    else if (focusKey === 'specialist') noun = 'Specialist';
    else if (focusKey === 'polyglot') noun = 'Polyglot';
    else if (focusKey === 'juggler') noun = 'Juggler';
    const adjective = chronoKey ? chronoAdjective[chronoKey] : '';
    const title = hasData
      ? `The ${[adjective, noun].filter(Boolean).join(' ')}`
      : 'Getting to know you';

    const chronoPhrase: Record<NonNullable<typeof chronoKey>, string> = {
      nocturnal: 'after dark',
      dawn: 'at first light',
      daylight: 'through the day',
      evening: 'in the evenings'
    };
    const cadencePhrase: Record<NonNullable<typeof cadenceKey>, string> = {
      marathoner: 'in long, unbroken stretches',
      sprinter: 'in short, focused bursts',
      steady: 'at a steady rhythm'
    };
    let tagline = 'Raven is still learning your patterns — keep building.';
    if (hasData) {
      const parts: string[] = ['You build'];
      if (chronoKey) parts.push(chronoPhrase[chronoKey]);
      if (cadenceKey) parts.push(cadencePhrase[cadenceKey]);
      let sentence = parts.join(' ');
      if (identityLanguages[0]) sentence += `, mostly in ${identityLanguages[0].language}`;
      tagline = sentence + '.';
    }

    // ── Traits — the rendered persona, as relational beats ─────────
    const traits: PersonaTrait[] = [];

    if (tenureDays > 0) {
      traits.push({
        glyph: '◉',
        tone: 'muted',
        label: 'Tenure',
        text: `Raven has been perched over your shoulder for ${tenureDays} ${plural(
          tenureDays,
          'day',
          'days'
        )} — long enough to know your habits.`
      });
    }

    if (chronoKey && peakHour != null) {
      const h12 = ((peakHour + 11) % 12) + 1;
      const ampm = peakHour < 12 ? 'am' : 'pm';
      const sharePct = Math.round(afterHoursShare * 100);
      if (chronoKey === 'nocturnal') {
        traits.push({
          glyph: '☾',
          tone: 'info',
          label: chronoLabel,
          text: `You do your best work after dark — your activity peaks around ${h12}${ampm}, and ${sharePct}% of it lands in the evening or small hours.`
        });
      } else if (chronoKey === 'evening') {
        traits.push({
          glyph: '☾',
          tone: 'info',
          label: chronoLabel,
          text: `Evenings are when you come alive — your activity crests around ${h12}${ampm}, ${sharePct}% of it after the workday winds down.`
        });
      } else if (chronoKey === 'dawn') {
        traits.push({
          glyph: '☀',
          tone: 'warning',
          label: chronoLabel,
          text: `You're an early starter — your sharpest hours cluster around ${h12}${ampm}, while the world's still waking up.`
        });
      } else {
        traits.push({
          glyph: '☀',
          tone: 'warning',
          label: chronoLabel,
          text: `You keep daylight hours — your work centers on the middle of the day, peaking around ${h12}${ampm}.`
        });
      }
    }

    if (cadenceKey && sessionCount >= 3) {
      if (cadenceKey === 'marathoner') {
        traits.push({
          glyph: '◐',
          tone: 'accent',
          label: cadenceLabel,
          text: `When you lock in, you stay locked in — your sessions average ${fmtDuration(
            avgSession
          )}, the longest a ${fmtDuration(longestSession)} marathon.`
        });
      } else if (cadenceKey === 'sprinter') {
        traits.push({
          glyph: '◐',
          tone: 'accent',
          label: cadenceLabel,
          text: `You work in sharp bursts — sessions average ${fmtDuration(
            avgSession
          )}, in and out with intent.`
        });
      } else {
        traits.push({
          glyph: '◐',
          tone: 'accent',
          label: cadenceLabel,
          text: `You keep an even keel — sessions average ${fmtDuration(
            avgSession
          )}, the longest stretching to ${fmtDuration(longestSession)}.`
        });
      }
    }

    if (focusKey && topProject) {
      const sharePct = Math.round(topProjectShare * 100);
      if (focusKey === 'specialist') {
        traits.push({
          glyph: '◆',
          tone: 'success',
          label: focusLabel,
          text: `${topProject.project} is your home base — ${sharePct}% of everything Raven has watched these ${WINDOW_DAYS} days.`
        });
      } else if (focusKey === 'polyglot') {
        const list = identityLanguages
          .slice(0, 3)
          .map(l => l.language)
          .join(', ');
        traits.push({
          glyph: '◆',
          tone: 'success',
          label: focusLabel,
          text: `You move fluently between languages — ${list} all in rotation, across ${projectCount} projects.`
        });
      } else if (focusKey === 'juggler') {
        traits.push({
          glyph: '◆',
          tone: 'success',
          label: focusLabel,
          text: `You keep a lot in the air — ${projectCount} projects in play, ${topProject.project} leading at ${sharePct}%.`
        });
      } else {
        traits.push({
          glyph: '◆',
          tone: 'success',
          label: focusLabel,
          text: `You spread your time across ${projectCount} projects, with ${topProject.project} just ahead at ${sharePct}%.`
        });
      }
    }

    // Mother tongue — only when not already implied by a polyglot focus beat.
    if (identityLanguages[0] && focusKey !== 'polyglot') {
      const top = identityLanguages[0];
      const sharePct = Math.round(top.share * 100);
      if (sharePct >= 20) {
        traits.push({
          glyph: '⌘',
          tone: 'info',
          label: 'Mother tongue',
          text:
            identityLanguages[1] && identityLanguages[1].share >= 0.15
              ? `${top.language} is your mother tongue here, with ${identityLanguages[1].language} close behind.`
              : `${top.language} is your mother tongue — ${sharePct}% of the files you touch.`
        });
      }
    }

    if (busiestWeekday && wdTotal > 0) {
      const weekendPct = Math.round(weekendShare * 100);
      traits.push({
        glyph: '◴',
        tone: 'muted',
        label: 'Rhythm',
        text:
          weekendShare >= 0.45
            ? `${busiestWeekday}s are your heaviest day — and you don't clock out on weekends, ${weekendPct}% of your work lands Saturday or Sunday.`
            : `${busiestWeekday}s are when you push hardest. Active on ${activeDays} of the last ${WINDOW_DAYS} days.`
      });
    }

    if (topModel) {
      traits.push({
        glyph: '◇',
        tone: 'muted',
        label: 'Mind of choice',
        text: `${topModel} does most of your thinking — ${requests.toLocaleString()} ${plural(
          requests,
          'request',
          'requests'
        )} and ${fmtUsd(cost)} over the window.`
      });
    }

    return {
      generated_at: generatedAt,
      window_days: WINDOW_DAYS,
      tenure_days: tenureDays,
      has_data: hasData,
      title,
      tagline,
      chronotype: {
        key: chronoKey,
        label: chronoLabel,
        peak_hour: peakHour,
        after_hours_share: afterHoursShare
      },
      cadence: {
        key: cadenceKey,
        label: cadenceLabel,
        avg_session_seconds: Math.floor(avgSession),
        longest_session_seconds: Math.floor(longestSession),
        sessions: sessionCount
      },
      focus: {
        key: focusKey,
        label: focusLabel,
        project_count: projectCount,
        top_project: topProject?.project ?? null,
        top_project_share: topProjectShare
      },
      languages: topLanguages.map(l => ({
        ext: '',
        language: l.language,
        share: l.share,
        files: l.files
      })),
      top_model: topModel,
      rhythm: {
        busiest_weekday: busiestWeekday,
        busiest_weekday_share: busiestWeekdayShare,
        active_days: activeDays,
        weekend_share: weekendShare
      },
      current_streak: streak,
      totals: {
        events,
        files,
        cost_usd: cost,
        requests,
        projects: projectCount
      },
      traits
    };
  }

  function persist(persona: UserPersona): void {
    db.db.prepare(`DELETE FROM insights WHERE type = ?`).run('user_persona');
    db.db
      .prepare(
        `INSERT INTO insights (id, timestamp, type, title, content, model, duration_ms, context_events)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        `persona_${randomUUID()}`,
        persona.generated_at,
        'user_persona',
        persona.title,
        JSON.stringify(persona),
        'aggregator',
        0,
        persona.totals.events
      );
  }

  function getCached(maxAgeMs: number): UserPersona | null {
    const row = db.db
      .prepare(
        `SELECT timestamp, content FROM insights
         WHERE type = 'user_persona' ORDER BY timestamp DESC LIMIT 1`
      )
      .get() as { timestamp: string; content: string } | undefined;
    if (!row) return null;
    if (Date.now() - new Date(row.timestamp).getTime() > maxAgeMs) return null;
    try {
      return JSON.parse(row.content) as UserPersona;
    } catch {
      return null;
    }
  }

  return {
    get(at = new Date()) {
      const cached = getCached(6 * 60 * 60 * 1000); // 6h TTL
      if (cached) return cached;
      const fresh = compute(at);
      persist(fresh);
      return fresh;
    },
    recompute(at = new Date()) {
      const fresh = compute(at);
      persist(fresh);
      return fresh;
    }
  };
}
