# Multi-Machine Roll-Up — Design Doc

**Status:** design — no code yet. The roadmap explicitly calls for a
design pass before implementation; this is that pass.

## Problem

Each Raven instance is single-host today. A developer who works on a
laptop and a desktop, or who pairs a workstation with a server-side
session, sees two disconnected histories. They want one view that
spans every machine they code on, without giving up the local-first
posture that makes Raven trustworthy in the first place.

## Non-goals

- **Cloud-hosted multi-tenant SaaS.** That's a different product. This
  doc covers an aggregator a single user runs on their own hardware.
- **Real-time cross-machine triggers.** Latency between machines is on
  the order of seconds, not the sub-100ms we get from local SQLite.
  Triggers stay per-host; the aggregator is for *review*, not *react*.
- **Cross-host live diff streaming.** A diff resolved on machine A is
  consumed via WebSocket from a panel on machine B is way out of
  scope. We're rolling up *records*, not live state.

## Constraints

1. **Local-first must survive.** No data may leave the user's
   infrastructure. The aggregator is on a host *they* trust; if they
   want to expose it to the internet they wire that themselves.
2. **Per-host Raven instances must keep working unchanged.** Adding
   the aggregator should not require touching the existing schema or
   flipping flags on existing installs.
3. **No new third-party services.** The user already pays for one
   server-room thing they trust (their machines); we're not adding
   another.
4. **Schema versioning must be addressable.** Raven's schema changes
   often. Two machines on different versions must coexist.

## Sketch

```
machine-a (laptop)         aggregator (home server)        machine-b (desktop)
┌──────────────────┐       ┌────────────────────────┐      ┌──────────────────┐
│ raven backend    │       │ raven-aggregator       │      │ raven backend    │
│  ├─ SQLite       │  ───► │  ├─ SQLite (rolled-up) │ ◄─── │  ├─ SQLite       │
│  ├─ /api/sync    │ pull  │  ├─ /api/* (mirrored)  │ pull │  ├─ /api/sync    │
│  └─ HTTP :9100   │       │  └─ HTTP :9100         │      │  └─ HTTP :9100   │
└──────────────────┘       └────────────────────────┘      └──────────────────┘
```

Two halves:

1. **Per-host export endpoint** on each Raven backend that streams the
   delta-since-cursor of every relevant table (events, agent_events,
   token_usage, insights, …) in a stable format.
2. **Aggregator instance** — same Raven binary, started in
   `aggregator` mode — that periodically pulls each registered host's
   delta and merges it into its own SQLite, namespaced by host_id.

## Push vs pull

**Decision: pull, with optional push notifications.**

Pull is simpler:

- The aggregator owns the schedule (every 60s by default).
- Hosts don't need to know the aggregator's URL or health state.
- A host that's offline simply has nothing to pull when it returns.
- No firewall holes outbound from the workstation.

Push is tempting because it's lower-latency, but the latency win
isn't load-bearing for the use case (review, not react). It also
introduces the harder problem of "host A is up, host B is up,
aggregator is down — buffer or drop?".

We CAN add a thin push notification ("hey aggregator, I'm online and
have N new events") so the aggregator can pull immediately rather
than waiting for the next tick. That's optional, not the design's
backbone.

## Identity + host naming

- Each Raven install gets a stable `host_id` written to
  `.raven/host.json` on first start. UUIDv4. Persists across reboots.
  Already partially supported via `SESSION_ID`, but session ≠ host.
- Hosts also self-report a human-readable `host_name` (default
  `os.hostname()`, overridable via `RAVEN_HOST_NAME`).
- Aggregator stores both. UI shows `host_name`, but joins always go
  through `host_id`.

## Schema versioning

Two non-trivial concerns:

1. The aggregator's schema may be a SUPERSET of any one host's (some
   hosts on older versions, no `diff_annotations` table yet, etc).
2. The aggregator may add columns over time that hosts don't fill in.

**Approach:**

- Each export payload carries a `schema_version` integer (bumped
  whenever a Raven release changes a tracked table).
- The aggregator keeps its own schema at the highest version it has
  ever seen, and tolerates missing columns from older hosts as NULL.
- An export endpoint returns 426 (Upgrade Required) only when the
  aggregator is on a version older than the host. The user upgrades
  the aggregator first.

## Conflict resolution

There's almost no real conflict to resolve, because each row's
ownership is unambiguous:

- `events`, `agent_events`, `token_usage`, `api_latency`: written
  exclusively by the originating host. Aggregator inserts with
  `host_id` as a discriminator. No update path; insert-only.
- `insights`, `analysis_runs`, `analysis_checks`: same story —
  computed on a host, immutable from the aggregator's POV.
- `pattern_warnings`, `syntax_errors`, `diff_annotations`: same.

The only ambiguity is the user's *settings* (retention policy, etc.).
**Decision: aggregator does not sync settings.** Each host owns its
own. If you want a setting to apply everywhere, set it everywhere —
this is the local-first version of that promise.

## Cursor + delta

Each tracked table needs a stable monotonic cursor:

- `events.id` (autoincrement) — fine.
- `agent_events.id` — fine.
- `token_usage.id` — fine.
- `insights.id` (TEXT) — needs a `(host_id, created_at)` ordering
  or we add a row_seq column at insert time. Lean toward the latter.

The export endpoint:

```
GET /api/sync/export?since=<table>:<cursor>&since=<table>:<cursor>
```

Streams JSONL or NDJSON (TBD — JSONL is simpler) so the aggregator
can apply deltas as they land. Each line is `{ table, row }`. The
final record is `{ done: true, cursors: { table: nextCursor, ... } }`.

## Auth at the boundary

The aggregator authenticates to each host (and vice-versa for the
optional push-notification channel) via a per-host shared secret
written to `.raven/peers.json`:

```json
{
  "peers": [
    { "host_id": "uuid-A", "name": "laptop", "url": "http://laptop:9100", "secret": "…" }
  ]
}
```

`secret` is a random 256-bit string. Used as a Bearer token. We
deliberately do NOT use full mTLS — the additional plumbing isn't
worth it for a single user's home network.

The export endpoint refuses requests without a valid peer secret, and
binds to `0.0.0.0` only when peers are configured. Default remains
loopback.

## What the aggregator's UI looks like

Largely the same as a normal Raven install. The differences:

- Status bar shows `RAVEN.AGGREGATOR :: 3 hosts · last sync 14s ago`.
- Today, Insights, Costs, Wrapped — all the existing pages — work
  unchanged because they query the local SQLite (which now includes
  every host's data).
- A new sub-tab under System: **Peers**, listing each host with sync
  status (`up to date` / `last seen 4m ago` / `version mismatch`).
- The Today narrative beats gain a host dimension when relevant
  ("This week, raven was your main focus on laptop and desktop").

## Recommended implementation order

1. **Phase 1 — host_id + export endpoint.**
   - Write `host_id` on first start.
   - Add `/api/sync/export?since=...` returning JSONL.
   - No aggregator yet; the endpoint is dormant. (Implementation:
     ~1 week.)

2. **Phase 2 — aggregator mode.**
   - `--aggregator` flag (or `RAVEN_MODE=aggregator` env).
   - Adds `host_id` columns to all rolled-up tables.
   - Adds the peers config + sync scheduler.
   - Aggregator's UI is identical to a normal Raven install but every
     query joins on host_id. (~2 weeks.)

3. **Phase 3 — Peers sub-tab + per-host attribution.**
   - System → Peers page.
   - Today narrative beats acknowledge multi-host context.
   - Wrapped gains a "your top host" card. (~1 week.)

4. **Phase 4 — push notifications (optional).**
   - Hosts ping the aggregator on idle-to-active transitions for
     near-real-time pull. (~3 days.)

Total estimate: ~4 weeks of focused work, ship Phase 1 first as a
no-op-by-default capability, then unlock the rest behind the
`--aggregator` flag.

## What we're NOT going to do

- **No conflict-free replicated data types (CRDTs).** Each row has a
  single writer (the originating host). CRDTs are over-engineered.
- **No live cross-host diff viewing.** Different product.
- **No central auth service.** Per-peer secrets, file-based config.
- **No web UI for adding peers.** Edit `.raven/peers.json` and
  restart. We can add a UI later if the file editing is friction.

## Open questions

- **Retention with multiple hosts?** If the aggregator keeps rolling
  up forever and the per-host retention is 30 days, the aggregator's
  history will diverge. Probably: aggregator runs its own retention
  policy on its rolled-up tables, independent of host policy.
- **Host removal.** What happens when a host disappears (laptop sold,
  desktop reinstalled)? Aggregator should retain its data but stop
  trying to sync. Add a "retire host" UI affordance.
- **Time skew.** All timestamps are ISO 8601 with timezone, but two
  hosts with mis-set clocks will produce out-of-order events. NTP is
  the user's responsibility; we assume sane clocks.
