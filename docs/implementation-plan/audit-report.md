# Implementation Plan Audit Report

> **Historical record (2026-10-11).** This audit was performed against the source baseline in the previous project repository. Its findings about plan content (numbering, dependencies, ownership, commands) remain valid. Its repository-specific statements (commits, branches, push access) are **historical only** and are superseded by [`../repository-migration-notes.md`](../repository-migration-notes.md). Do not act on them.

| Field | Value |
| --- | --- |
| Audited package | `docs/implementation-plan/` (commit `546a226`, branch `docs/requirements-freeze-specs`, rebased on `main` @ `fc0981d`) |
| Audit date | 2026-10-11 |
| Method | Every file read; structural checks scripted (numbering, banners, IDs, cross-references, table integrity, dependency graph vs matrix vs plan §2, cycle detection, schedule-vs-dependency ordering, file-ownership overlap); repository facts re-verified against code; tool behaviour verified by running it |
| **Verdict** | **PASS WITH CORRECTIONS** — the seven independent sequences are correctly numbered and acyclic, but the package was staffed for six developers (four required), contained a broken test command, two build-breaking deletion orders, an unachievable gate criterion and ownership gaps. All 19 corrections below have been applied; the post-correction audit reports 0 structural issues |

## 1. What exists today (Part 1)
| Question | Finding (verified) |
| --- | --- |
| Which planning documents exist? | `README.md`, `baseline.md`, `workstream-assignments.md`, `cross-workstream-dependencies.md`, `roadmap.md`, `acceptance-checklist.md`, and 21 plan files under `workstreams/<WS>/`. Added by this audit: `audit-report.md`, `execution-manual.md`, `prompt-templates.md`, `tracking/` (STATUS + 7 state files + conventions), `first-day-action-plan.md` |
| What each contains | README: navigation, numbering, handoff template, global rules. Baseline: verified repo state, gaps G-1…G-14, conflicts C-1…C-6, decisions. Assignments: ownership and workflow. Matrix: 46 dependency rows. Roadmap: milestones, Mermaid graph (63 edges), schedule, tiers, gates G1–G7. Checklist: plan/gate/workstream/final criteria P-AC-01…20. Each plan: 13 sections (identity, dependencies, scope, files, interfaces, steps, edge cases, constraints, tests, acceptance, risks, assumptions, handoff) |
| Where plans are stored | `docs/implementation-plan/workstreams/{WS-FND,WS-CAT,WS-SEN,WS-PLT,WS-AGT,WS-JON,WS-UI}/plan-00N-<slug>.md` |
| Divided into workstreams/subagents? | Yes: 7 workstreams = 7 subagent sequences. Originally assigned to six developers (Dev-1…Dev-6) with an optional fork of WS-AGT-P2 into two subagents — both corrected |
| Dependencies defined | Within-workstream order table; 46 cross-workstream rows (decision/interface/implementation/integration, early start, fallback); Mermaid DAG |
| Approved decisions | Specs frozen (`docs/specifications`, D-001…D-025). Architecture `docs/prototype-design` is "Proposed" on the docs branch, **not yet on `main`** (A-ARCH). Defaults recorded for C-1, C-5, D-PLAN-2, U-4. D-PLAN-1 resolved by the four-developer requirement |
| Missing to start safely | U-2 (Qwen endpoint — blocks WS-AGT-P3 and live criteria only); U-1 (demo date — drives tier cut); developer names → Dev A–D mapping; merge of design + plan docs to `main` |

### 1.1 Materials inspected
- Planning package: all 27 original files (6 top-level + 21 plans).
- Architecture: `docs/prototype-design/00`–`06` (incl. Doc 0 §3 scope, Doc 1 §8 ADRs, Doc 2 §5–§6 interfaces/HTTP, Doc 3 flows F1–F11, Doc 4 §1–§8, Doc 5 S-1…S-16, Doc 6 §3–§6).
- Specifications: `docs/specifications/*.md` (6 component specs + `system-contracts.md`), sections cited by the plans.
- Repository: `main` @ `fc0981d` — `backend/src/{index,db}.js`, `routes/v1/index.js` (route inventory), `platform/*`, `engines/sentinel/{index,rules}`, `engines/categorizer/index.js`, `agents/*/index.js`, both `package.json`/lockfiles, `electron/main.js`, `src/App.jsx`, `src/services/*`, view imports; remote branches.
- Executed: `node --test` behaviour on Node 22.22.0 (directory vs glob vs live-file exclusion); route extraction; schema extraction.

### 1.2 Not accessible / not verifiable
| Item | Effect on the audit |
| --- | --- |
| `npm install` blocked in this environment | Could not start the HTTP server, run the Vite build or the Electron app. HTTP behaviour statements remain code-reading based (as baseline §1 states) |
| Push to the previous repository (403) | Corrections existed only in the delivered documentation package; that package is now the initial content of the new repository |
| Remote branch `sentinel_web` (diverged) | Not inspected; frozen by workflow rule, not used by any plan |
| Qwen endpoint (U-2) | Live-model criteria (P-AC-17 live, 18, 19) cannot be planned beyond the fake provider |
| Approval of `docs/prototype-design` | Treated as assumption A-ARCH, as before |

## 2. Plan-numbering audit (Part 2)

### 2.1 Sequence-by-sequence results
| Workstream / Subagent | Developer | Plan sequence found | Starts at Plan 1? | Sequence complete? | Dependencies explicit? | Result |
| --- | --- | --- | --- | --- | --- | --- |
| WS-FND | Dev A | Plan 1 Baseline/route split → Plan 2 Migrations → Plan 3 Events/tool store/LLM adapter → Plan 4 Demo dataset → Plan 5 Legacy retirement → Plan 6 E2E/acceptance | Yes | Yes (6 files, banners "of 6", titles match) | Yes (§2 tables, matrix, graph) | PASS WITH CORRECTIONS (A-02, A-03, A-04, A-14, A-17, A-19) |
| WS-CAT | Dev B | Plan 1 Conformance → Plan 2 Canonical ingestion → Plan 3 Corrections/read API/golden eval | Yes | Yes (3) | Yes | PASS WITH CORRECTIONS (A-06, A-11, A-18) |
| WS-SEN | Dev D | Plan 1 Conformance/golden tests → Plan 2 Rule parity/view contracts | Yes | Yes (2) | Yes | PASS WITH CORRECTIONS (A-05) |
| WS-PLT | Dev B | Plan 1 Consent-safe Action Service → Plan 2 Event-driven Monitor + Profile | Yes | Yes (2) | Yes | PASS WITH CORRECTIONS (A-06, A-18) |
| WS-AGT | Dev C | Plan 1 Runner + Nova → Plan 2 Atlas + Iris → Plan 3 Live evaluation | Yes | Yes (3) | Yes (U-2 explicit) | PASS WITH CORRECTIONS (A-01) |
| WS-JON | Dev C | Plan 1 Router/synthesis/streaming → Plan 2 Proposals/corrections/arbitration | Yes | Yes (2) | Yes | PASS (owner line only, A-02) |
| WS-UI | Dev D | Plan 1 Five-workspace shell → Plan 2 Sentinel workspace + Settings → Plan 3 Chat UX + desktop | Yes | Yes (3) | Yes | PASS WITH CORRECTIONS (A-09, A-10, A-12) |

### 2.2 Required checks
| Check | Result | Evidence |
| --- | --- | --- |
| Every independent sequence starts at Plan 1 and runs to its own Plan N | PASS | Folders hold 6/3/2/2/3/2/3 files numbered 1..N; banner "Plan n of N in WS-X" and H1 "WS-X · Plan n —" match the filename in all 21 |
| No project-wide numbering replaces local numbering | PASS | No global "Plan 1..21"; roadmap and matrix use IDs only |
| Unique cross-reference IDs | PASS | 21 unique `WS-<ID>-P<n>`; 0 references to non-existent IDs across 40 files |
| No sequence continues another's numbering | PASS | Every folder restarts at 1 |
| Local numbers never ambiguous | PASS | Cross-workstream references always use full IDs (scripted check) |
| One subagent per sequence | **Corrected** | WS-AGT-P2 allowed two parallel subagents on one plan (A-01) |
| Roadmap includes all plans | PASS | All 21 nodes in the Mermaid graph; all 21 rows in `tracking/STATUS.md` |
| Cross-references identify the correct plan | PASS | Every edge into a plan appears in that plan's §2; every cross-workstream §2 dependency appears in the matrix and graph; every "Unblocks"/"Next eligible" claim has a graph edge |
| No circular dependencies | PASS | DFS over 63 edges: acyclic |
| No undocumented prerequisite | PASS after corrections | Added: auth client switch in WS-FND-P5 (A-19); App.jsx in WS-UI-P2 (A-10) |
| Schedule respects dependencies | PASS | No implementation edge whose producer completes after its consumer in the D1–D9 schedule (scripted) |
| No overlapping file ownership without a rule | PASS after corrections | 12 cross-workstream file edits all carry a coordination rule; 20+ created files were unowned (A-07) |
| All required implementation work covered | PASS after corrections | Doc 0 §3.1 build-now areas and gaps G-1…G-14 each map to plans; `REMOVE_CAP` (in Doc 4 §8.1) had no owner (A-18) |
| Four-developer assignment feasible | PASS after correction | Was six developers (A-02); now four with D1–D9 schedule, loads 5.5–6.5 days, contingency rules |

## 3. Defects found and corrections applied
Severity: **High** = execution would fail or violate a stated requirement; **Medium** = likely conflict, rework or broken CI; **Low** = clarity/robustness.

| ID | Severity | Document / plan | Problem | Smallest correction (applied) |
| --- | --- | --- | --- | --- |
| A-01 | High | WS-AGT-P2; `workstream-assignments.md` | Plan allowed forking into two parallel subagents sharing one plan, breaking "each independent subagent has its own Plan 1..N" | One WS-AGT subagent; Atlas then Iris as two PRs under the same plan ID |
| A-02 | High | `workstream-assignments.md`, `roadmap.md`, all 21 plan identity rows, JON-P1 risks | Package staffed for six developers (Dev-1…Dev-6); requirement is exactly four | Four-developer allocation (Dev A WS-FND; Dev B WS-CAT+WS-PLT; Dev C WS-JON+WS-AGT; Dev D WS-SEN+WS-UI), owner lines updated, D1–D9 schedule, gate dates, contingency rules |
| A-03 | High | WS-FND-P1 §4 (`backend/package.json`) | `node --test test/` fails on Node 22 ("Cannot find module", verified); the same command would also run live-model tests | `"test": "node --test --test-concurrency=1 \"test/**/*.test.js\""`; live files renamed `*.live.js` with `test:live` glob (WS-FND-P6, WS-AGT-P3 updated) |
| A-04 | Medium | WS-FND-P6 §9 | `npm --prefix backend test -- test/e2e` passes a directory to `node --test` (fails) | `cd backend && node --test "test/e2e/**/*.test.js"` |
| A-05 | Medium | WS-SEN-P2 §9 | Performance test (24 × 300 rows) would run in every default suite | Skipped unless `RUN_PERF=1`; commands for Bash and PowerShell |
| A-06 | Medium | WS-CAT-P2 §2, matrix #5; WS-PLT-P2 §4 | CAT-P1 `100_*` and CAT-P2 fallback `100_ingestion.sql` collide; PLT-P2 migration unnamed | Fallback renamed `110_ingestion.sql`; PLT-P2 `310_monitor_profile.sql`; reserved numbers listed in assignments §5; fallbacks use `IF NOT EXISTS` |
| A-07 | Medium | `workstream-assignments.md` §4 | Files created by plans had no owner: schemas created by CAT/PLT/AGT/JON inside an FND-owned folder, `plan-store.js`, `tokens.js`, `action-aliases.js`, `shared/time.js`, `backend/scripts/*`, test area folders, `reports/*`, `.oxlintrc.json`, `routes/{auth,users}.js`, `routes/v1/_shared.js` | Ownership table extended; **shared-folder rule**: creator owns the file, folder loaders/config belong to WS-FND |
| A-08 | Medium | WS-FND-P1 route inventory; 5 route-adding plans | `routes-inventory.test.js` freezes 25 routes, but only 2 of the 7 route-changing plans said to update it → CI breaks on correct work | Global rule (README, assignments §5, WS-FND-P1): update inventory in the same PR |
| A-09 | High | WS-UI-P1 | Deletes `geminiService.js` while the moved John view (rebuilt only in WS-UI-P3) still imports it → build break | WS-UI-P1 step 5 removes the Gemini fallback/import from the John view |
| A-10 | High | WS-UI-P2 | Deletes `conversationService.js` (only importer: John view, rebuilt in WS-UI-P3) and `profile/goal/transactionService.js` (imported by `App.jsx`, not in its file table) → build break if merged first | `conversationService.js` deletion moved to WS-UI-P3; `App.jsx` added to WS-UI-P2 files |
| A-11 | Low | WS-FND-P3, WS-CAT-P2, WS-UI-P1, matrix #21 | Unescaped pipe characters inside table cells broke four table rows | Rewritten without pipes |
| A-12 | Medium | WS-UI-P1/P2/P3, WS-FND-P5 | Gates used `grep -R "a\|b"` — not available in PowerShell (team works on Windows) and pipes break tables | `git grep -n -e … -e … -- <paths>` |
| A-13 | High | `roadmap.md` G2, `acceptance-checklist.md` G2 | G2 required "Electron boots with only port 4000", but single-server is delivered by WS-FND-P5 (G5) → gate unachievable when scheduled | G2: Electron boots and workspaces render from `/api/v1`; single server moved to G5 |
| A-14 | Low | WS-FND-P1 step 7 | Cited a 25-route list "in baseline §3" that did not exist | `baseline.md` Appendix A with the verified 25 method/path pairs |
| A-15 | Medium | `cross-workstream-dependencies.md` | No "earliest safe start point" per dependency | Column added for all 46 rows, tied to the D1–D9 schedule |
| A-16 | Low | `baseline.md`, README | `main` moved `54f9f6f → fc0981d` | Verified lockfile-only change (Electron pinned to 41.10.7); no plan impact; recorded |
| A-17 | Low | WS-FND-P1 CI | Root `npm ci` downloads the Electron binary in CI (slow/flaky) | `ELECTRON_SKIP_BINARY_DOWNLOAD=1` in CI |
| A-18 | Medium | WS-CAT-P3, WS-PLT-P1/P2, WS-UI-P1 | Plans built actions that Doc 0 §3.2 defers (`DELETE_CATEGORY_RULE`, `UPDATE_DECLARED_BILL`) and did not name `REMOVE_CAP` (in the Doc 4 §8.1 subset); deferred actions that already exist on `main` (`RESTORE_GOAL`, watch/`CREATE_ALERT`, movement-type, `CREATE_CATEGORY_RULE`) were treated inconsistently | New deferred actions removed; existing ones migrated as-is (scope note); `REMOVE_CAP` added to WS-PLT-P1; UI deferred-control rule made explicit |
| A-19 | Medium | WS-FND-P5 | Moving auth under `/api/v1/auth` requires editing `src/services/authService.js` (WS-UI-owned) without a coordination rule | Row added: coordinated edit, Dev D approves |

## 4. Coverage check (requirements → plans)
| Requirement source | Covered by |
| --- | --- |
| Doc 0 §3.1 Runtime (one process, dispatcher, one DB) | WS-FND-P2, P3, P5 |
| Ingestion (CanonicalBatch, CSV, demo loader) | WS-CAT-P2, WS-FND-P4, WS-UI-P2 |
| Item Categorizer pipeline, corrections, review, status | WS-CAT-P1, P3 |
| Sentinel 17 functions + shared rule library | WS-SEN-P1, P2 |
| Atlas/Nova/Iris LLM specialists via runner | WS-AGT-P1, P2 (P3 live) |
| John router/synthesis/grounding/proposals/corrections/threads | WS-JON-P1, P2 |
| Platform services (Action Service, Plan Store, Profile, Monitor, Snapshot, Gateway store, outbox, LLM adapter) | WS-PLT-P1, P2; WS-FND-P3 |
| Frontend five workspaces + Settings + Auth/Onboarding, cards/chips/Undo, no mocks | WS-UI-P1, P2, P3 |
| Tests (unit, contract, integration, evals fake + live, E2E) | Every plan §9; WS-FND-P6; WS-AGT-P3 |
| Gaps G-1…G-14 (baseline §4) | Each mapped to ≥ 1 plan in the baseline table |
| P-AC-01…P-AC-20 | Evidence sources named in `acceptance-checklist.md` §4; produced by WS-FND-P6 |

## 5. Requirements still unverified or assumed
- **A-ARCH:** the design is assumed approved; it is not yet on `main`.
- **U-2:** live-model thresholds cannot be verified until the endpoint is known.
- **U-1:** whether D1–D9 fits the hackathon; if shorter, the tier rule applies (roadmap §5).
- **Effort estimates** come from plan §1 sizes; they are planning estimates, not measured velocities. Dev D has the least slack.
- **Runtime behaviour** of HTTP routes, Vite build and Electron could not be executed here (dependency install blocked).
- Design Doc 0 §4 still describes a six-person team; it is architecture context only and is superseded for execution by `workstream-assignments.md` §2 (design text not edited, to keep the approved architecture untouched).

## 6. Post-correction verification
Scripted re-run after all corrections: 21 plans, 7 sequences (`WS-FND` 1–6, `WS-CAT` 1–3, `WS-SEN` 1–2, `WS-PLT` 1–2, `WS-AGT` 1–3, `WS-JON` 1–2, `WS-UI` 1–3), 63 graph edges, 50 matrix producer→consumer pairs, 62 plan-declared dependencies — **0 issues** (numbering, banners, titles, sections 1–13 present in every plan, IDs, references, tables, graph/matrix/plan consistency, cycles, status-board completeness, schedule ordering).
