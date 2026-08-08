# Contributing to Raven

Thanks for your interest. Raven is a small, opinionated project — a few principles up front will save us both time.

## Principles

- **Local-first, always.** Anything that calls home, phones an analytics vendor, or requires an account is a non-starter.
- **Observation, not intervention.** Raven watches; it never edits files, runs commits, or kicks off automation in the agent's repo. The agent under observation does all the writing.
- **Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before adding a route or repository.** The split between routes (HTTP) and repositories (SQLite) is enforced by dependency-cruiser — `npx depcruise` will reject anything that bypasses it.

## Dev setup

Requirements: Node 20.19+, Linux or macOS.

```bash
git clone https://github.com/seheart/raven.git
cd raven
npm install
./start.sh
```

The `start.sh` script:

- Cleans up any prior backend/frontend processes on `:9100` / `:9000`.
- Builds the backend TypeScript if `dist/` is missing.
- Boots both servers and warms a handful of cache endpoints.
- Prints frontend / backend / session URLs when ready.

Other helpers: `./stop.sh`, `./restart.sh`.

For a faster boot during heavy iteration, `./start-fast.sh` skips the cache-warming step (first page load pays the cost instead).

## Tests

Backend (Jest):

```bash
cd backend
npm test                              # full suite
npm test -- __tests__/routes/foo.js   # one file
npm run test:coverage                 # coverage report
```

Frontend (Vitest):

```bash
cd frontend
npm test                              # full suite
npx vitest run src/lib/__tests__/foo  # one file/dir
```

End-to-end (Playwright):

```bash
npm run e2e                           # from repo root
```

There's no CI — checks run locally. Beyond the three test suites, run Knip (dead-code), dependency-cruiser (architecture rules), and the type-coverage check before pushing if you've touched anything structural. The pre-commit hook runs lint-staged (eslint, stylelint, prettier, svelte-check) on staged files.

## Workflow

Raven is maintained by a single developer who commits straight to `main` — no feature branches, no internal PR review. A few habits keep history clean:

- **One concern per commit.** Bug fix + refactor + new feature in one commit is hard to revert cleanly; please split.
- **Tests required for behavior changes.** If you're adding a route, add a `__tests__/routes/` file. New frontend component, add a `__tests__/` next to it. Bug fixes need a regression test.
- **No `--no-verify` or `--no-gpg-sign`.** If a hook fails, fix the underlying issue.
- **Outside contributions** are welcome via fork + pull request — fork, branch, and open a PR against `main`. Keep it scoped to one concern; if you find a separate problem, file an issue and link it rather than bundling.

## Commit messages

Conventional commits, lowercase scope:

```
feat(today): narrative beats on landing
fix(insights): handle 503 gracefully when Ollama is offline
refactor(db): extract sessions repository
docs(roadmap): restructure into phases
test(routes): cover today/narrative aggregation
```

The body should explain the _why_, not the _what_. The diff already says what changed.

## Style

- Frontend: Svelte 5 runes (`$state`, `$derived`, `$effect`). Tailwind utilities. Layout primitives (`PageLayout`, `PageHeader`, `PageSection`) — every page should use them.
- Backend: TypeScript, route per concern, repository per table. Always parameterize SQL. Never `db.db.prepare()` inside a route handler — that's a repository's job.
- No comments that restate the code. Comment the _why_ when it isn't obvious from a function name.

## Reporting bugs

Open an issue at <https://github.com/seheart/raven/issues>. Include:

- What you ran (`./start.sh`, navigated to `/today`, etc.)
- What you expected
- What happened (error message, screenshot, or `tail /tmp/raven-backend.log`)
- OS + Node version

## Questions?

If something in the codebase is opaque, that's a documentation bug. File an issue.
