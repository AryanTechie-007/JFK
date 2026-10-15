# WS-FND · Plan 1 — Baseline, Guardrails and Route Split

> **Local plan number: Plan 1 of 6 in WS-FND** · Unique ID: **`WS-FND-P1`** · Branch: `ws-fnd/p1-baseline-guardrails`

> **Repository context (updated 2026-10-13).** Work happens in `https://github.com/Kathir-M-03/FINNMIN-JFK-John` on a branch created from `main`, following [`development-workflow.md`](../../../development-workflow.md). Files marked *Modify*, *Keep*, *Delete*, *Move* or `[E]` belong to the **source baseline** — the application code described in [`baseline.md`](../../baseline.md). Per team decision **D-PLAN-3** (2026-10-13) the repository starts from that code at commit `fc0981d`; **until the source-baseline import commit is on `main` this plan cannot start** (one-time import by the team lead — see [`repository-migration-notes.md`](../../../repository-migration-notes.md) §5). One plan = one branch = one PR (D-PLAN-4). Statements below about what exists "on `main`" or "today" describe the source baseline, not the new repository's `main`.

## 1. Plan identity
| Field | Value |
| --- | --- |
| Workstream | WS-FND — Foundations, Tooling & Integration |
| Local plan number | **Plan 1** |
| Unique ID | `WS-FND-P1` |
| Owner | Dev A — Integration Lead |
| Suggested subagent | WS-FND subagent (sequence 1) |
| Objective | Give every other workstream a safe place to work: specs and design on `main` (already true in the new repository — see step 1), a real test runner on temporary databases, CI, CODEOWNERS, and one route file per domain so owners stop colliding in `routes/v1/index.js` |
| Expected outcome | `npm --prefix backend test` runs `node --test` on temp DBs (existing `test-v1-specs.js` assertions ported, none weakened); `routes/v1/index.js` only wires sub-routers; CI green on every PR |
| Size | ~1 day; **one PR** (D-PLAN-4) with six commits in this order: docs (only if not already in the repository), test helpers, legacy test port + scripts, CI + `.gitignore`, route split + inventory test, CODEOWNERS. Merged with a merge commit (not squash) in the D1 evening window. Time-box: if the route split is not green by 16:00, merge first thing on D2 |

## 2. Dependencies
| Type | Source | Needed | Early start |
| --- | --- | --- | --- |
| decision | A-ARCH, C-1, U-4, D-PLAN-1 (team lead) | Approval of `docs/prototype-design`, LLM layer per spec, branching model, staffing | Proceed on defaults (baseline §5–6) |
| — | none (first plan) | — | — |

**Runs in parallel with:** WS-JON-P1 (contract commit), WS-UI-P1, test design in WS-CAT-P1 (written against this plan's branch until it merges).
**Unblocks:** WS-FND-P2, WS-CAT-P1, WS-SEN-P1, WS-SEN-P2, WS-UI-P1 (interface), every plan's CI.

## 3. Scope
**In scope**
1. Make sure `docs/specifications/`, `docs/prototype-design/` and `docs/implementation-plan/` are in the repository; if not, add them as the first commit of this plan's PR.
2. Test harness: `node --test`, temp-DB helper, app factory helper, port of `backend/test-v1-specs.js`.
3. CI workflow and CODEOWNERS.
4. Split `backend/src/routes/v1/index.js` (697 lines) into domain routers with **byte-for-byte identical behaviour** (same paths, same responses).
5. `.gitignore`: stop committing `dist/` (remove it from the index in WS-FND-P5 when the Electron build path is confirmed).

**Out of scope:** any behaviour change to routes, schema changes (WS-FND-P2), new endpoints, dependency additions other than none (harness uses `node:test` only).

## 4. Files and ownership
| File | Action | Purpose | Ownership | Shared-file risk |
| --- | --- | --- | --- | --- |
| `docs/prototype-design/*`, `docs/implementation-plan/*` | Already on `main` (repository initialisation, 2026-10-13) | Authoritative design + plans | WS-FND | Low |
| `backend/package.json` | Modify | `"test": "node --test --test-concurrency=1 \"test/**/*.test.js\""`, `"test:live": "node --test --test-concurrency=1 \"test/live/**/*.live.js\""` (glob form is required: on Node 22 a bare directory argument fails with "Cannot find module"; live files use the `*.live.js` suffix so the default glob never runs them) | WS-FND | Medium — only FND edits |
| `backend/test/helpers/temp-db.js` | Create | Creates a temp file path, sets `process.env.DB_PATH` **before** first `require('../../src/db')`, deletes file after | WS-FND | Low |
| `backend/test/helpers/app.js` | Create | Loads `src/index.js` `app` with temp DB and test `JWT_SECRET`; `signup(user)` → bearer token helper | WS-FND | Low |
| `backend/test/legacy-v1-specs.test.js` | Create | `node:test` port of all 7 sections of `test-v1-specs.js` | WS-FND | Low |
| `backend/test-v1-specs.js` | Keep | Unchanged until the port is reviewed; deleted in WS-FND-P5 | WS-FND | Low |
| `backend/src/routes/v1/index.js` | Modify | Only `router.use(...)` lines after split | WS-FND (wiring) | **High** — every workstream touches; split removes the hotspot |
| `backend/src/routes/v1/{chat,actions,workspaces-atlas,workspaces-nova,workspaces-iris,workspaces-sentinel,categorizer,ingest,settings,system}.js` | Create | Handlers moved verbatim from `index.js` | Created by FND, then owned per `workstream-assignments.md` §3 | Medium during the split PR only |
| `backend/src/routes/v1/_shared.js` | Create | Helpers currently defined at the top of `index.js` (auth guard, error mapping) | WS-FND | Low |
| `.github/workflows/ci.yml` | Create | Node 22.x; `ELECTRON_SKIP_BINARY_DOWNLOAD=1`; `npm ci` (root, backend); `npm --prefix backend test`; `npm run build`; `npx oxlint` (non-blocking until baseline clean) | WS-FND | Low |
| `.github/CODEOWNERS` | Create | Encodes ownership table | WS-FND | Low |
| `.gitignore` | Modify | Ensure `dist/`, `backend/test/.tmp/` are listed (the repository-initialisation `.gitignore` already lists both; if the source-baseline import brings its own `.gitignore`, merge the two without dropping entries) | WS-FND | Low |

## 5. Interfaces and contracts
- **Test helper contract** (used by every workstream):
  ```js
  // backend/test/helpers/temp-db.js
  useTempDb() -> { dbPath, cleanup() }      // call at top of a test file, before requiring src modules
  // backend/test/helpers/app.js
  loadApp() -> express.Application          // requires src/index.js after useTempDb()
  createUser(app, {email?, name?}) -> { userId, token }
  authed(app, token) -> supertest-like {get, post, del} built on node:http (no new dependency)
  ```
- Test files run one process per file (`node --test` default), so each file gets its own DB (module-singleton `db.js` is safe).
- Route split: every path in baseline §3 keeps its method, path, status codes and body shape. `routes/v1/index.js` becomes:
  ```js
  router.use(require('./system')); router.use(require('./chat')); router.use(require('./actions'));
  router.use(require('./workspaces-atlas')); … router.use(require('./settings'));
  ```

## 6. Implementation steps
1. If the docs are missing from the repository, add them as commit 1 (docs only). Confirm `docs/specifications` is identical to the frozen set.
2. Add `backend/test/helpers/temp-db.js`: `fs.mkdtempSync(os.tmpdir()+'/finmate-')`, set `DB_PATH`, register `process.on('exit')` cleanup.
3. Add `backend/test/helpers/app.js`: set `JWT_SECRET='test-secret'`, `NODE_ENV='test'`; require `src/index.js` (it exports `app` and only listens when run directly — verify `require.main === module` guard; if absent, add it in this plan as the only `index.js` change). Implement `request(method, path, body, token)` using `http.createServer(app).listen(0)`.
4. Port `backend/test-v1-specs.js` to `backend/test/legacy-v1-specs.test.js`: one `test()` per original section; copy every `assert` verbatim; replace the real-DB path with `useTempDb()`. Run both old and new; both must pass. Record the assertion count of each in the PR.
5. Add `"test"` and `"test:live"` scripts to `backend/package.json` exactly as in §4; create `backend/test/live/.gitkeep`. Verify `npm --prefix backend test` discovers files in nested folders and that a dummy `test/live/x.live.js` is **not** run by it.
6. Route split (its own commit in this PR): create the domain files listed in §4; move handlers **without editing their bodies** (cut/paste plus `require` adjustments); move shared helpers into `_shared.js`.
7. Add `backend/test/routes-inventory.test.js`: walk the Express router stack and assert the set of `METHOD path` pairs equals the 25 pairs recorded before the split (`baseline.md` Appendix A). From then on, **every plan that adds or removes a route updates this expected list in the same PR** (WS-FND reviews), so later plans add routes intentionally.
8. Add `.github/workflows/ci.yml` and `.github/CODEOWNERS` (paths from `workstream-assignments.md` §3).
9. `.gitignore`: verify `dist/` and `backend/test/.tmp/` are present (added at repository initialisation). Do not `git rm` an imported `dist/` yet — Electron loads it; WS-FND-P5 decides (the committed `dist/` is deleted on D8 per D-PLAN-13).
10. Run the full test command locally and in CI; fill the handoff.

## 7. Edge cases
| Case | Handling |
| --- | --- |
| A module requires `db.js` before the helper sets `DB_PATH` | Helper must be the first `require` in every test file; `temp-db.test.js` asserts `db` file path ≠ `backend/finmate.db` |
| `src/index.js` calls `process.exit` when `JWT_SECRET` missing | Helper sets it before require |
| Tests leave temp files on crash | Temp dir under OS tmp; CI is ephemeral |
| Handler relies on closure variables at top of old `index.js` | Move them into `_shared.js`; inventory test + ported tests catch omissions |
| `oxlint` reports many existing issues | Run non-blocking in CI until WS-FND-P6; new-file errors blocking |
| Windows developers (`launch.bat`) | `node --test` and helpers use `path`/`os.tmpdir()` only |

## 8. Constraints
- No behaviour changes in the split; no test weakened; no new runtime dependency.
- Do not touch `backend/finmate.db` from any test.
- Do not modify files owned by other workstreams beyond moving their route handlers verbatim.

## 9. Test plan
| Level | Test | Command |
| --- | --- | --- |
| Unit | `temp-db.test.js` (isolation, cleanup) | `npm --prefix backend test` |
| Regression | `legacy-v1-specs.test.js` (all 7 original sections) | same |
| Contract | `routes-inventory.test.js` (25 route pairs unchanged) | same |
| Old script | `node backend/test-v1-specs.js` still passes (against a temp `DB_PATH`) | Bash: `DB_PATH=$(mktemp) node backend/test-v1-specs.js` · PowerShell: `$env:DB_PATH="$env:TEMP\v1.db"; node backend/test-v1-specs.js` |
| CI | Workflow runs on PR | push branch, open PR |
| Build | Vite build | `npm run build` |

## 10. Acceptance criteria
**Plan:** (1) docs on `main` (satisfied at repository initialisation) and the source baseline imported per D-PLAN-3; (2) `npm --prefix backend test` green, zero tests touch `backend/finmate.db`; (3) ported assertion count ≥ original; (4) route inventory identical; (5) CI and CODEOWNERS active on `main`.
**Workstream contribution:** test/CI foundation required by every WS-FND plan.
**Integration:** Gate **G1** items "docs on main", "route split", "CODEOWNERS".

## 11. Risks and recovery
| Risk | Signal | Recovery |
| --- | --- | --- |
| Split breaks a route subtly | Ported tests or manual Electron smoke fails | Revert only the route-split commit (`git revert <sha>`, possible because the PR is merged with a merge commit); re-split route by route |
| CI cannot install deps (registry/network) | CI install step fails | Cache `node_modules`; document in PR; owners run tests locally until fixed |
| Other workstreams start editing `index.js` before the split lands | Merge conflicts | Announce a 4-hour freeze on `routes/v1/index.js` on D1 |

## 12. Assumptions and unresolved questions
- [A] `src/index.js` can be required without listening (baseline says it exports `app`). Verify in step 3.
- [A] GitHub Actions is available for the repository (`Kathir-M-03/FINNMIN-JFK-John`, private: Actions minutes are limited by the account's plan — TD-10; the manual live workflow uses an Actions secret per D-PLAN-11). If not, the same commands run as a pre-merge checklist.
- [A] Branch protection on `main` requires GitHub Pro/Team for a private repository (TD-04, still open per `baseline.md` §6); without it "PR + green CI before merge" is enforced by team agreement.
- [U] U-4 branching model (default: short-lived plan branches).

## 13. Completion handoff
Use the README template. Must list: ported assertion counts; route inventory; CI run link; CODEOWNERS paths; next eligible plans **WS-FND-P2, WS-CAT-P1, WS-SEN-P1, WS-SEN-P2, WS-UI-P1**.
