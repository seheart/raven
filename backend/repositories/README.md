# Repositories

This directory holds the data-access layer. Every `db.prepare(...)` call lives
here, behind a small typed API. Routes and services consume these methods —
they should not touch `better-sqlite3` directly.

Why: see the 2026-04-29 architecture audit. Inline SQL in route handlers makes
`server.ts` a god-file and couples HTTP concerns to schema. Repositories give
each table a single owner, ready place to add zod schemas, and make the
`no-raw-sql-in-routes` depcruise rule meaningful.

## Conventions

- One file per logical table or domain (`errors-repository.ts`, not
  `app_errors_repository.ts`).
- Export a factory that takes the `RavenDB` instance and returns the typed
  methods. Keeps testing easy and avoids stateful module-level prepared
  statements.
- Methods are intent-named (`list`, `insertEvent`, `markResolved`) — not
  SQL-named (`runQuery`, `executeStatement`).
- Return shapes match what the route caller expects. Don't leak raw rows; map
  to plain objects.
- Throw on programmer errors (bad arguments). Don't silently swallow SQL
  exceptions — let them bubble to the error handler.
