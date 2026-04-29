# AGENTS.md

Guidance for human and AI contributors working in this repository.

## 1. Purpose

Paperclip is a control plane for AI-agent companies.
The current implementation target is V1 and is defined in `doc/SPEC-implementation.md`.

## 2. Read This First

Before making changes, read in this order:

1. `doc/GOAL.md`
2. `doc/PRODUCT.md`
3. `doc/SPEC-implementation.md`
4. `doc/DEVELOPING.md`
5. `doc/DATABASE.md`

`doc/SPEC.md` is long-horizon product context.
`doc/SPEC-implementation.md` is the concrete V1 build contract.

## 3. Repo Map

- `server/`: Express REST API and orchestration services
- `ui/`: React + Vite board UI
- `packages/db/`: Drizzle schema, migrations, DB clients
- `packages/shared/`: shared types, constants, validators, API path constants
- `packages/adapters/`: agent adapter implementations (Claude, Codex, Cursor, etc.)
- `packages/adapter-utils/`: shared adapter utilities
- `packages/plugins/`: plugin system packages
- `doc/`: operational and product docs

## 4. Dev Setup (Auto DB)

Use embedded PGlite in dev by leaving `DATABASE_URL` unset.

```sh
pnpm install
pnpm dev
```

This starts:

- API: `http://localhost:3100`
- UI: `http://localhost:3100` (served by API server in dev middleware mode)

Quick checks:

```sh
curl http://localhost:3100/api/health
curl http://localhost:3100/api/companies
```

Reset local dev DB:

```sh
rm -rf data/pglite
pnpm dev
```

## 5. Core Engineering Rules

1. Keep changes company-scoped.
Every domain entity should be scoped to a company and company boundaries must be enforced in routes/services.

2. Keep contracts synchronized.
If you change schema/API behavior, update all impacted layers:
- `packages/db` schema and exports
- `packages/shared` types/constants/validators
- `server` routes/services
- `ui` API clients and pages

3. Preserve control-plane invariants.
- Single-assignee task model
- Atomic issue checkout semantics
- Approval gates for governed actions
- Budget hard-stop auto-pause behavior
- Activity logging for mutating actions

4. Do not replace strategic docs wholesale unless asked.
Prefer additive updates. Keep `doc/SPEC.md` and `doc/SPEC-implementation.md` aligned.

5. Keep repo plan docs dated and centralized.
When you are creating a plan file in the repository itself, new plan documents belong in `doc/plans/` and should use `YYYY-MM-DD-slug.md` filenames. This does not replace Paperclip issue planning: if a Paperclip issue asks for a plan, update the issue `plan` document per the `paperclip` skill instead of creating a repo markdown file.

## 6. Database Change Workflow

When changing data model:

1. Edit `packages/db/src/schema/*.ts`
2. Ensure new tables are exported from `packages/db/src/schema/index.ts`
3. Generate migration:

```sh
pnpm db:generate
```

4. Validate compile:

```sh
pnpm -r typecheck
```

Notes:
- `packages/db/drizzle.config.ts` reads compiled schema from `dist/schema/*.js`
- `pnpm db:generate` compiles `packages/db` first

## 7. Verification Before Hand-off

Run this full check before claiming done:

```sh
pnpm -r typecheck
pnpm test:run
pnpm build
```

If anything cannot be run, explicitly report what was not run and why.

## 8. API and Auth Expectations

- Base path: `/api`
- Board access is treated as full-control operator context
- Agent access uses bearer API keys (`agent_api_keys`), hashed at rest
- Agent keys must not access other companies

When adding endpoints:

- apply company access checks
- enforce actor permissions (board vs agent)
- write activity log entries for mutations
- return consistent HTTP errors (`400/401/403/404/409/422/500`)

## 9. UI Expectations

- Keep routes and nav aligned with available API surface
- Use company selection context for company-scoped pages
- Surface failures clearly; do not silently ignore API errors

## 10. Pull Request Requirements

When creating a pull request (via `gh pr create` or any other method), you **must** read and fill in every section of [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md). Do not craft ad-hoc PR bodies — use the template as the structure for your PR description. Required sections:

- **Thinking Path** — trace reasoning from project context to this change (see `CONTRIBUTING.md` for examples)
- **What Changed** — bullet list of concrete changes
- **Verification** — how a reviewer can confirm it works
- **Risks** — what could go wrong
- **Model Used** — the AI model that produced or assisted with the change (provider, exact model ID, context window, capabilities). Write "None — human-authored" if no AI was used.
- **Checklist** — all items checked

## 11. Definition of Done

A change is done when all are true:

1. Behavior matches `doc/SPEC-implementation.md`
2. Typecheck, tests, and build pass
3. Contracts are synced across db/shared/server/ui
4. Docs updated when behavior or commands change
5. PR description follows the [PR template](.github/PULL_REQUEST_TEMPLATE.md) with all sections filled in (including Model Used)

## 11. Fork-Specific: HenkDz/paperclip

This is a fork of `paperclipai/paperclip` with QoL patches and an **external-only** Hermes adapter story on branch `feat/externalize-hermes-adapter` ([tree](https://github.com/HenkDz/paperclip/tree/feat/externalize-hermes-adapter)).

### Branch Strategy

- `feat/externalize-hermes-adapter` → core has **no** `hermes-paperclip-adapter` dependency and **no** built-in `hermes_local` registration. Install Hermes via the Adapter Plugin manager (`@henkey/hermes-paperclip-adapter` or a `file:` path).
- Older fork branches may still document built-in Hermes; treat this file as authoritative for the externalize branch.

### Hermes (plugin only)

- Register through **Board → Adapter manager** (same as Droid). Type remains `hermes_local` once the package is loaded.
- UI uses generic **config-schema** + **ui-parser.js** from the package — no Hermes imports in `server/` or `ui/` source.
- Optional: `file:` entry in `~/.paperclip/adapter-plugins.json` for local dev of the adapter repo.

### Local Dev

- Fork runs on port 3101+ (auto-detects if 3100 is taken by upstream instance)
- `npx vite build` hangs on NTFS — use `node node_modules/vite/bin/vite.js build` instead
- Server startup from NTFS takes 30-60s — don't assume failure immediately
- Kill ALL paperclip processes before starting: `pkill -f "paperclip"; pkill -f "tsx.*index.ts"`
- Vite cache survives `rm -rf dist` — delete both: `rm -rf ui/dist ui/node_modules/.vite`

### Fork QoL Patches (not in upstream)

These are local modifications in the fork's UI. If re-copying source, these must be re-applied:

1. **stderr_group** — amber accordion for MCP init noise in `RunTranscriptView.tsx`
2. **tool_group** — accordion for consecutive non-terminal tools (write, read, search, browser)
3. **Dashboard excerpt** — `LatestRunCard` strips markdown, shows first 3 lines/280 chars

### Plugin System

PR #2218 (`feat/external-adapter-phase1`) adds external adapter support. See root `AGENTS.md` for full details.

- Adapters can be loaded as external plugins via `~/.paperclip/adapter-plugins.json`
- The plugin-loader should have ZERO hardcoded adapter imports — pure dynamic loading
- `createServerAdapter()` must include ALL optional fields (especially `detectModel`)
- Built-in UI adapters can shadow external plugin parsers — remove built-in when fully externalizing
- Reference external adapters: Hermes (`@henkey/hermes-paperclip-adapter` or `file:`) and Droid (npm)


<claude-mem-context>
# Memory Context

# [paperclip] recent context, 2026-04-29 9:56am GMT+8

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 43 obs (17,796t read) | 616,575t work | 97% savings

### Apr 20, 2026
264 9:39a 🔵 Agent Launch & Interactive Task Creation — Feature Only Present in Avocats and Icona Projects
268 9:44a 🔵 Project Configuration Centralized at Global Level — Not Project-Specific
269 9:50a 🔵 Agent Launch & Interactive Task Creation — Feature Gap in New Projects
270 " 🔵 Project-Level settings.local.json Files Are Manually Accumulated — No Global Config Exists
272 9:51a 🔵 Paperclip Project .claude Directory — Skills Present via Symlinks, No CLAUDE.md, No Agent Config
275 " 🔵 Paperclip IS the Agent/Task Platform — Feature Gap Exists in the Platform Source Itself
276 9:52a 🔵 Agent Launch & Interactive Task Creation — Feature Gap in New Projects
277 9:54a 🟣 Interactive Session (Meet Label) Automatically Seeded for All New Companies
279 9:55a 🟣 Default Labels Backfill Runs at Server Startup for All Companies
280 9:57a 🔵 Paperclip "Meet" Label — External Company Creation Skips Seeding
293 10:11a 🔵 Social Presence Agent — "Meet" Option Missing from Agent UI
303 10:45a 🔵 Paperclip "Meet" Button & Interactive Task Mode — Still Missing After Restart
316 11:05a 🔵 paperclip UI — AgentDetail.tsx "Meet" Button Uses meetMutation, Defined Only in AgentDetail.tsx
317 11:06a 🔵 paperclip UI — App.tsx Routing Structure: Two Route Trees for Prefixed and Unprefixed Agent URLs
318 11:07a 🔵 paperclip UI — meetMutation Calls agentsApi.meet(agentLookupRef, undefined, resolvedCompanyId)
319 " 🔵 paperclip — agentsApi.meet POSTs to agentPath(id, companyId, "/meet") — companyId Required for Correct URL
320 " 🔵 paperclip — AgentDetail resolvedCompanyId Returns null When companyPrefix Is Missing from URL Params
326 11:08a 🔵 paperclip AgentDetail — resolvedCompanyId Comes from Fetched Agent Data, Not URL Param
327 " 🔵 paperclip AgentDetail — Meet Button Has No Role/Permission Guard; Only Disabled During Pending State
328 11:09a 🔵 paperclip — meetMutation onSuccess Shows Toast Only; No Navigation or Session Window Opened in UI
329 " 🔵 paperclip Layout — hasUnknownCompanyPrefix Flag Could Block Agent Page Rendering for Unrecognized Org Prefix
330 11:10a 🔵 paperclip Layout — Root Cause Found: hasUnknownCompanyPrefix Renders NotFoundPage Instead of AgentDetail
331 " 🔵 paperclip — Subagent Audit Confirms Meet Button Code Is Unconditional; Issue Is Runtime/Browser Rendering
332 11:11a 🔵 paperclip Server — Static UI Served from server/ui-dist/ First, then ../../ui/dist — Stale Build May Explain Missing Meet Button
333 " 🔵 paperclip Server — server/ui-dist/ Confirmed Absent; Static Mode Falls Through to ../../ui/dist (Monorepo ui/dist)
334 " 🔵 paperclip Server — Dev Mode Uses tsx src/index.ts; Both Dev and Production Resolve Static UI to ui/dist
337 11:14a 🔵 paperclip — Compiled Bundle Confirmed to Contain Meet Button — Stale Build Theory Definitively Ruled Out
358 11:26a 🔵 Paperclip Monorepo Root Package Scripts
359 " 🔵 Server and UI Package Build Lifecycles
360 " 🔵 Paperclip 7-Step Release Pipeline (release.sh)
S58 Paperclip CLI Opens on localhost:3101 (Apr 20 at 11:26 AM)
S56 Server and UI Package Build Lifecycles (Apr 20 at 11:26 AM)
376 11:31a 🔵 Paperclip CLI Opens on localhost:3101
S715 Fix Paperclip codex_local agents defaulting to GPT-5.3-codex instead of GPT-5.5, and enable GPT-5.5 selection in UI (Apr 20 at 11:31 AM)
### Apr 29, 2026
1534 9:29a 🔵 Paperclip Codex adapter model display: GPT-5.3/Codex label normalization logic identified
1535 9:30a 🔵 Root cause found: DEFAULT_CODEX_LOCAL_MODEL hardcoded to "gpt-5.3-codex", GPT-5.5 absent from fallback models list
S716 Fix Paperclip codex_local agents defaulting to GPT-5.3-codex instead of GPT-5.5, and enable GPT-5.5 selection in the UI — then reverted by primary session (Apr 29 at 9:35 AM)
1540 9:36a 🔵 Investigation Target Corrected: Mobile Studio, Not Paperclip
1543 9:37a 🔵 DB Connection Confirmed: paperclip:paperclip Works, companies Table Has No short_name Column
1544 " 🔵 Paperclip DB: All Companies Queried — Mobile Studio Confirmed with ID and Full Schema
1541 9:43a 🔵 Paperclip Embedded PostgreSQL Authentication: Correct Credentials Are paperclip:paperclip
1542 " 🔵 opencode-local Adapter Exists Alongside codex-local in Paperclip
1545 9:50a 🔵 Root Cause Found: All Mobile Studio Agents Have gpt-5.3-codex Hardcoded in DB adapter_config
1546 9:53a 🔵 Paperclip Fork Architecture: Terminal Agent Mode + Project Docs Added as Custom Features
1547 " 🔵 Fork Git State: feat/interactive-sessions Branch, upstream Remote Already Configured
1548 9:54a 🔵 heartbeat_runs context_snapshot Has No adapter_meta or adapter_config — No Execution-Time Model Audit Trail
1549 9:55a 🔵 cost_events Confirms gpt-5.3-codex Was Actually Executed; Codex CLI Receives --model Flag Directly

Access 617k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>