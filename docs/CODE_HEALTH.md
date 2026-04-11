# Code Health

Raven includes a self-analysis system that runs 10 code health checks every 24 hours (or on-demand). Results are stored in SQLite and displayed at **System > Code Health**.

## Architecture

- **Service:** `backend/services/self-analysis.ts`
- **Routes:** `backend/routes/self-analysis.ts`
- **Frontend:** `frontend/src/lib/pages/CodeHealthPage.svelte`
- **API:** `GET /api/analysis/code-health`, `POST /api/analysis/code-health/run`, `GET /api/analysis/code-health/:id`
- **DB tables:** `analysis_runs`, `analysis_checks`
- **Schedule:** 24h interval, first run 2 minutes after server startup

## The 10 Checks (run order matters)

1. **Backend Build** — `tsc` compile (runs first so tests use fresh `dist/`)
2. **Backend Tests** — Jest with `--json` for reliable result parsing
3. **Frontend Tests** — Vitest
4. **Backend Lint** — ESLint
5. **Frontend Lint** — ESLint
6. **Backend Types** — `tsc --noEmit`
7. **Frontend Types** — `svelte-check`
8. **Backend Format** — Prettier `--check`
9. **Frontend Format** — Prettier `--check`
10. **Dependency Audit** — `npm audit` for both backend and frontend

Everything runs locally. No network calls, no cloud services.

## Known Pitfalls

These were discovered during the initial cleanup and are important for anyone modifying the analysis system or the checks it runs.

### DISABLE_AUTH env leak
The Raven server runs with `DISABLE_AUTH=true` (set in `start.sh`). The analysis service inherits the server's environment. Without explicitly clearing this, all 12 auth middleware tests silently pass-through instead of testing rejection paths. The service sets `DISABLE_AUTH: ''` in the exec environment to prevent this.

### Jest --forceExit exit code
Jest with `--forceExit` exits non-zero even when all tests pass (due to open handles). Do not rely on exit code alone. The service uses `--json` and parses `numFailedTests` / `numPassedTests` from the structured output.

### Jest output size
Winston logging in tests produces huge output (>50KB). The `--json` flag puts structured results in stdout. The service extracts failure details (test names, error messages) from the JSON before the output gets truncated for storage.

### Build order
Backend tests import from `dist/`. If build runs after tests, you're testing stale compiled code. Build always runs first.

### Prettier vs ESLint indentation
Both backend and frontend configs include `eslint-config-prettier` as the last config entry. This disables ESLint's formatting rules (indent, semi, quotes, etc.) so Prettier owns all formatting. Without this, the two tools fight over indentation and the format check never passes.

### bcrypt → bcryptjs
`bcrypt` was replaced with `bcryptjs` (pure JS drop-in replacement) to eliminate 2 unfixable high-severity vulnerabilities in bcrypt's native build chain (`tar` via `@mapbox/node-pre-gyp`). These were build-time only, not runtime risk, but `npm audit` correctly flagged them.

## Fix History

### 2026-04-11: Initial cleanup (3/10 → 10/10)

**Lint fixes:**
- Backend: single quotes in `insights.test.js`, removed unused `jest` import from `insights-service.test.js`
- Frontend: quote style in `renderMarkdown.test.js`, `{#each}` key in `CostsPage`, trailing comma in `SubAgentTreePage`, unused `catch` vars, removed unused `cpuColor`/`memColor` from `OverviewPage`

**Svelte 5 reactivity (49 warnings → 0):**
- 12 UI components (`Accordion`, `Breadcrumbs`, `CodeBlock`, `Container`, `Divider`, `Dropdown`, `DropdownItem`, `List`, `Pagination`, `Skeleton`, `Spacer`, `Stat`, `Tabs`) had props destructured from `$props()` used in plain `const` expressions. Changed to `$derived()` for reactive updates.
- `Accordion.defaultOpen` is intentionally an initial value — suppressed with `svelte-ignore state_referenced_locally`.

**Svelte a11y:**
- Wrapped form inputs inside `<label>` tags in `SystemProjectsPage`
- Added `aria-label` to close button in `RateLimitIndicator`
- Removed invalid `aria-invalid` from button-role element in `FileUpload`

**Svelte 5 migration:**
- `VirtualScroll.svelte`: migrated from deprecated `on:scroll`/`<slot>` to Svelte 5 `onscroll`/`{@render children()}`
- Updated `ErrorLog.svelte` consumer to use `{#snippet children(item)}` pattern

**Formatting:**
- Added `.prettierignore` to both backend and frontend (excludes `dist/`, `node_modules/`, `coverage/`)
- Added `eslint-config-prettier` to both `eslint.config.js` files
- Ran `prettier --write` and `eslint --fix` across both codebases
- Removed broken `frontend/test-results.html`
- Removed unused `.animate-spin` CSS from `ActivityOverviewPage`

**Dependencies:**
- Frontend: `npm audit fix` resolved all 15 vulnerabilities
- Backend: replaced `bcrypt` with `bcryptjs`, removed `@types/bcrypt`, added `@types/bcryptjs`

**Analysis accuracy fixes:**
- Reordered checks: build runs before tests
- Backend test parser: uses `--json` + JSON parsing instead of regex on truncated output
- Frontend type parser: only marks `warn` when warning count > 0 (was matching "0 warnings" as a warning)
- Clears `DISABLE_AUTH` env var for test runs
- Cleans up stale "running" records on server restart
- `getLatestRun()` only returns completed runs
