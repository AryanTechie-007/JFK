# WS-FND · Plan 5 — Legacy Retirement and Single-Server Desktop

> **Local plan number: Plan 5 of 6 in WS-FND** · Unique ID: **`WS-FND-P5`** · Branch: `ws-fnd/p5-legacy-retirement`

> **Repository context (updated 2026-10-13).** Work happens in `https://github.com/Kathir-M-03/FINNMIN-JFK-John` on a branch created from `main`, following [`development-workflow.md`](../../../development-workflow.md). Files marked *Modify*, *Keep*, *Delete*, *Move* or `[E]` belong to the **source baseline** — the application code described in [`baseline.md`](../../baseline.md). Per team decision **D-PLAN-3** (2026-10-13) the repository starts from that code at commit `fc0981d`; **until the source-baseline import commit is on `main` this plan cannot start** (one-time import by the team lead — see [`repository-migration-notes.md`](../../../repository-migration-notes.md) §5). One plan = one branch = one PR (D-PLAN-4). Statements below about what exists "on `main`" or "today" describe the source baseline, not the new repository's `main`.

## 1. Plan identity
| Field | Value |
| --- | --- |
| Workstream / local number / ID | WS-FND / **Plan 5** / `WS-FND-P5` |
| Owner / subagent | Dev A — Integration Lead / WS-FND subagent |
| Objective | Make the prototype one server and one database (ADR-01, P-AC-01): delete Backend B, legacy REST routes, the Gemini coach route, legacy tables and sync code, and the temporary action-name aliases; Electron boots only port 4000 |
| Expected outcome | No code path writes or reads legacy tables; `electron/main.js` starts one server; grep tests prove no `:4001`, no `x-user-id`, no `geminiService`, no `src/data/mock*` |
| Size | ~1 day; one PR with three commits (frontend-leftovers check, backend deletions + migration, Electron/launch), merged with a merge commit |

## 2. Dependencies
| Type | Source | Needed | Early start |
| --- | --- | --- | --- |
| implementation | WS-UI-P1, WS-UI-P2, WS-UI-P3 | No UI code imports legacy services, Backend B or mocks; all views on `/api/v1` | No |
| implementation | WS-JON-P1 | Chat no longer uses `routes/coach.js` | No |
| implementation | WS-CAT-P2 | Ingestion replaces legacy `/transactions/import` and `syncLegacyTransactionsForUser` | No |
| implementation | WS-PLT-P1 | Writes only through `/proposals` and `/actions`; alias table in place | No |
| implementation | WS-FND-P3 | Health route and dispatcher used by Electron boot | No |

**Parallel with:** WS-AGT-P3, final WS-UI-P3 polish.
**Unblocks:** WS-FND-P6.

## 3. Scope
**In:** delete Backend B (`src/index.js`, `src/db/`, `src/routes/`, `src/contracts/`, non-JSX `src/agents/*/*.js`, `src/tools/*/*.js`, `demo.js`), legacy backend routes (`goals`, `transactions`, `budget`, `insights`, `coach`, `subscriptions`; move `auth` and `users` under `/api/v1/auth` and `/api/v1/profile` per Doc 2 §6 while keeping `/api/auth` as an alias until the UI switches in the same PR), legacy tables (`goals`, `budget_categories`, `transactions`, `upcoming_bills`, `subscriptions`; keep `users`), sync functions (`syncUserStateFromLegacy`, `syncLegacyTransactionsForUser`), action-name aliases, `backend/test-v1-specs.js` (already ported), `tests/verifyApp.js` rewrite, `dist/` removal from git, root scripts.
**Out:** any new feature.

## 4. Files and ownership
| File | Action | Purpose | Ownership | Shared-file risk |
| --- | --- | --- | --- | --- |
| `src/index.js`, `src/db/**`, `src/routes/**`, `src/contracts/**`, `src/agents/*/*.js` (non-JSX), `src/tools/*/*.js` (non-JSX), `demo.js`, legacy `src/**/*.test.js` | Delete | Backend B | WS-FND | Medium — confirm WS-UI moved all JSX first |
| `backend/src/routes/{goals,transactions,budget,insights,coach,subscriptions}.js` | Delete | Legacy REST | WS-FND | Low |
| `backend/src/routes/{auth,users}.js` | Modify/move | Mounted under `/api/v1/auth`, `/api/v1/profile` reads | WS-FND (PLT reviews profile) | Medium |
| `src/services/authService.js` (and `src/services/api.js` base URL if it hardcodes `/api`) | Modify (coordinated) | Switch auth calls to `/api/v1/auth` in the same PR that moves the route | **WS-UI owns — Dev D approves** | Low |
| `backend/src/index.js` | Modify | Mount only `/api/v1` (+ `/api/v1/health`) | WS-FND | Low |
| `backend/src/db/migrations/090_drop_legacy.sql` | Create | `DROP TABLE` legacy tables (after backing up dev DBs via script) | WS-FND | Low |
| `backend/src/platform/profile.js` | Modify (coordinated) | Remove `syncUserStateFromLegacy` | WS-PLT owns — PR co-authored, PLT approves | Medium |
| `backend/src/engines/categorizer/index.js` | Modify (coordinated) | Remove `syncLegacyTransactionsForUser` | WS-CAT approves | Medium |
| `backend/src/shared/contracts/action-aliases.js` | Delete | Temporary alias table from WS-PLT-P1 | WS-PLT approves | Low |
| `electron/main.js` | Modify | Start only `backend/src/index.js`; wait for `/api/v1/health` before loading window; start dispatcher | WS-FND | Low |
| `launch.bat`, root `package.json` | Modify | Remove `start`/`dev` for Backend B; `dev` = backend + Vite; `app` = build + Electron | WS-FND | Medium |
| `tests/verifyApp.js` | Rewrite | Gate checks: no legacy imports, health OK, five nav items present in built bundle | WS-FND | Low |
| `backend/test/legacy-gone.test.js` | Create | Grep-based assertions (P-AC-01) | WS-FND | Low |
| `dist/` | Remove from git | Built in CI / by `npm run app` | WS-FND | Low |

## 5. Interfaces and contracts
- Public HTTP surface after this plan = Doc 2 §6 table only (+ any routes added by plans and recorded in `routes-inventory.test.js`).
- Action names: SC §13.2 only; requests using an alias return `400 UNKNOWN_ACTION` (ErrorBody@1).
- Electron: one `BrowserWindow` loading `dist/index.html`; backend started in-process on `PORT` (default 4000).

## 6. Implementation steps
1. Pre-check: run `git grep -n -e "localhost:4001" -e "x-user-id" -e "geminiService" -e "data/mock" -e "/api/goals" -e "/api/budget" -e "/api/transactions" -e "/api/insights" -e "/api/coach" -e "/api/subscriptions" -- src/` (works in PowerShell and Bash) — must be empty (proves UI plans done). If not, stop and report the owner.
2. Grep backend for imports of legacy route modules and legacy tables (`FROM goals`, `FROM transactions `, `budget_categories`, `upcoming_bills`, `subscriptions`); list each hit with its owner; coordinate removal PRs.
3. Remove sync functions with owner approval; run full suite.
4. Delete Backend B and legacy routes; move auth/users under `/api/v1`.
5. Add `090_drop_legacy.sql`; add `scripts/backup-dev-db.js` that copies `finmate.db` before migrating a developer DB.
6. Delete alias table; update `routes-inventory.test.js`.
7. Update Electron, `launch.bat`, root scripts; rewrite `tests/verifyApp.js`.
8. Remove `dist/` from git; CI builds it.
9. Manual desktop check: `npm run reset-demo && npm run app` → login, five workspaces + Settings render, `/api/v1/health` OK, no process listening on 4001 (`netstat`/`lsof`).

## 7. Edge cases
| Case | Handling |
| --- | --- |
| A developer's DB has legacy data they care about | Backup script runs before `090`; synthetic data only, so loss is acceptable after backup |
| UI still calls `/api/auth` | Alias kept inside this PR until the UI change in the same PR merges; removed before merge |
| Electron window loads before server ready | Poll `/api/v1/health` up to 10 s; show error page otherwise |
| Windows path issues in `launch.bat` | Test on one Windows machine (owner records result) |

## 8. Constraints
- Do not start until every implementation dependency is merged; deletions are irreversible within the sprint.
- Changes to `profile.js`/categorizer need their owners' approval.
- No functionality may be lost that the specs keep: subscriptions → declared bills (WS-UI-P2), statement import → ingestion (WS-CAT-P2), insights → Sentinel/Iris.

## 9. Test plan
| Test | Command |
| --- | --- |
| `backend/test/legacy-gone.test.js` | `npm --prefix backend test` |
| Full backend suite | same |
| `tests/verifyApp.js` | `npm test` |
| Build | `npm run build` |
| Desktop smoke (manual, recorded) | `npm run reset-demo && npm run app` |

## 10. Acceptance criteria
**Plan:** all deletions done; grep test green; desktop smoke recorded; no alias accepted.
**Workstream:** one server, one DB.
**Integration:** G5 items "legacy removed", "no mocks"; P-AC-01.

## 11. Risks and recovery
| Risk | Recovery |
| --- | --- |
| Hidden dependency on a legacy route discovered late | Revert only the deletion commit (kept separate from the migration commit); owner fixes; retry |
| Electron packaging relies on committed `dist/` | Keep `npm run app` = `vite build && electron .`; document |

## 12. Assumptions and unresolved questions
- [A] Legacy subscriptions data has no spec home other than declared bills (SC §5.8, D-024).
- [A] Auth stays JWT + bcrypt for the prototype (bank SSO is production, decision recorded in specs).

## 13. Completion handoff
README template; include list of deleted paths, final route inventory, desktop smoke notes. Next eligible: **WS-FND-P6**.
