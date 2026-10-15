# WS-SEN · Plan 2 — Rule-Library Parity, Workspace View Contracts and Performance

> **Local plan number: Plan 2 of 2 in WS-SEN** · Unique ID: **`WS-SEN-P2`** · Branch: `ws-sen/p2-rules-and-views`

> **Repository context (updated 2026-10-13).** Work happens in `https://github.com/Kathir-M-03/FINNMIN-JFK-John` on a branch created from `main`, following [`development-workflow.md`](../../../development-workflow.md). Files marked *Modify*, *Keep*, *Delete*, *Move* or `[E]` belong to the **source baseline** — the application code described in [`baseline.md`](../../baseline.md). Per team decision **D-PLAN-3** (2026-10-13) the repository starts from that code at commit `fc0981d`; **until the source-baseline import commit is on `main` this plan cannot start** (one-time import by the team lead — see [`repository-migration-notes.md`](../../../repository-migration-notes.md) §5). One plan = one branch = one PR (D-PLAN-4). Statements below about what exists "on `main`" or "today" describe the source baseline, not the new repository's `main`.

## 1. Plan identity
| Field | Value |
| --- | --- |
| Workstream / local number / ID | WS-SEN / **Plan 2** / `WS-SEN-P2` |
| Owner / subagent | Dev D — Workspaces & Analytics Engineer / WS-SEN subagent |
| Objective | (a) One rule library used identically by Sentinel and the Action Service (SEN-AC-06), including the missing `validateRebalance` and `loadState`; (b) publish JSON Schemas for every `/workspaces/*` response and conform the routes, including the Sentinel workspace views `overview`, `spending`, `timeseries`, `forecast` (Doc 2 §6; Sentinel §B.6.18); (c) parameter registry versioning, methods documentation and performance |
| Expected outcome | `rules/index.js` is the single source; shared-corpus parity test; `schemas/http/workspaces-*.json` merged and enforced by contract tests; `METHODS.md`; performance test at 24 months × 300 rows |
| Size | ~1 day (D4 pm–D5 am); one PR, schema commit first |

## 2. Dependencies
| Type | Source | Needed | Early start |
| --- | --- | --- | --- |
| implementation | WS-SEN-P1 | Proven functions | No |
| implementation | WS-FND-P1 | Split route files `workspaces-*.js` | No (merged D1) |

**Parallel with:** WS-PLT-P1/P2, WS-AGT-P1, WS-CAT-P2.
**Unblocks:** WS-UI-P1 (schemas, interface), WS-UI-P2 (routes, implementation), WS-FND-P6.

## 3. Scope
**In:** rule library consolidation; `rules.validateRebalance`, `rules.loadState(userId, conn)`; HTTP view schemas + contract tests; Sentinel workspace routes per Doc 2 §6 (keeping `GET /workspaces/sentinel` as an aggregate alias until WS-UI-P2 switches); `GET /workspaces/john` health strip; `model_version` derivation from parameter registry hash (SEN-AC-09); `METHODS.md` (SEN-AC-08 documentation and backtest on held-out demo history); performance (SEN-AC-11).
**Out:** Action Service changes (WS-PLT-P1 switches its imports to `rules.*` — PLT owns that edit).

## 4. Files and ownership
| File | Action | Purpose | Ownership | Shared-file risk |
| --- | --- | --- | --- | --- |
| `backend/src/engines/sentinel/rules/index.js` | Modify | Add `validateRebalance`, `loadState`; normalised names `validateGoalChange` etc. (keep `*Rule` aliases until PLT-P1 switches) | WS-SEN | Medium — consumed by Action Service |
| `backend/src/engines/sentinel/index.js` | Modify | `sentinel_validate_*` functions call `rules/*` only (no duplicated logic) | WS-SEN | Medium |
| `backend/src/engines/sentinel/params.js` | Modify | `model_version = MAJOR.MINOR + '+' + sha256(params)[0:8]` | WS-SEN | Low |
| `backend/src/engines/sentinel/METHODS.md` | Create | Method per statistical component, backtest results | WS-SEN | Low |
| `backend/src/routes/v1/workspaces-{atlas,nova,iris,sentinel}.js` | Modify | Conform responses; add `/workspaces/sentinel/{overview,spending,timeseries,forecast}`, `/workspaces/john` | WS-SEN | Low |
| `backend/src/shared/contracts/schemas/http/workspaces-*.json` | Create | Response schemas | WS-SEN (UI reviews) | Medium |
| `backend/test/sentinel/rule-parity.test.js`, `perf.test.js`, `backtest.test.js` | Create | Tests | WS-SEN | Low |
| `backend/test/contracts/http-workspaces.test.js` | Create | Every workspace route validated against its schema | WS-SEN | Low |

## 5. Interfaces and contracts
```js
rules.validateGoalChange(state, op) / validateCapChange(state, change) / validateRebalance(state, transfers)
     / checkAvailableBalance(state, amountMinor) / validateProfile(state, profile) -> {verdict, rule_codes, warnings}
rules.loadState(userId, conn) -> state      // current (not snapshot) state for Action Service execution-time re-validation
```
- HTTP view responses always include `snapshot` `{snapshot_id, versions, created_at}` and `data_quality` (DataQuality@1); money as `*_minor` integers; percentages as `*_bp`. **The frontend performs no money arithmetic** (P-AC-05) — any derived figure the UI shows must be in the response.
- Sentinel workspace views (Doc 2 §6): `GET /workspaces/sentinel/overview` (balances, coverage badge, upcoming bills incl. declared), `/spending?period=` (by category with parent roll-ups), `/timeseries?category_id=&months=`, `/forecast` (bill outlays, cash-flow risk).

## 6. Implementation steps
1. Schema commit first: HTTP schemas drafted from the current route outputs and Doc 2 §6, reconciled with what WS-UI-P1 (same developer) already consumes; Dev B reviews the Nova schema in the Draft PR.
2. Inventory where validation logic lives (Sentinel `sentinel_validate_*`, `rules/index.js`, Action Service inline checks); move all logic into `rules/`.
3. Implement `validateRebalance` (zero-sum, no protected/FIXED donor, per-leg cap validation) and `loadState`.
4. Shared corpus (≥ 60 cases) run through both `callSentinel('sentinel_validate_*')` and `rules.*` directly → identical results (SEN-AC-06).
5. Routes: conform outputs; add Sentinel view routes and `/workspaces/john`; contract tests.
6. Parameter registry hash → `model_version` (SEN-AC-09).
7. `METHODS.md` and backtest on the held-out final month of the demo dataset. Provisional limit (D-PLAN-10): monthly spend forecast within ±15 % of actual; confirm or adjust with the team lead on D4 after the baseline run and record the final number in `METHODS.md`.
8. Performance test: generate 24 × 300 rows; assert p95 per function class per Sentinel §B.8.

## 7. Edge cases
| Case | Handling |
| --- | --- |
| Action Service still calling `*Rule` names | Aliases kept; removed in WS-FND-P5 together with action aliases |
| Workspace with no data | Schema allows empty arrays + `INSUFFICIENT_DATA` data quality; never 500 |
| Category with parent and leaf caps | Exclusive partition (SEN-AC-16) reflected in `/spending` |
| Forecast with no bills | Empty list, not error |

## 8. Constraints
- Routes stay read-only (except existing `POST …/validate`, `/sip`, `/simulate`, which compute without writing; `/workspaces/nova/rebalance` creates a proposal via the Action Service — coordinate with WS-PLT-P1).
- Schemas are contracts: changes after merge require UI approval.

## 9. Test plan
| Test | Command |
| --- | --- |
| `rule-parity.test.js` | `npm --prefix backend test` |
| `http-workspaces.test.js` | same |
| `backtest.test.js` | same |
| `perf.test.js` (skipped unless `RUN_PERF=1`, so the default suite stays fast) | Bash: `RUN_PERF=1 node --test backend/test/sentinel/perf.test.js` · PowerShell: `$env:RUN_PERF=1; node --test backend/test/sentinel/perf.test.js` |

## 10. Acceptance criteria
**Plan:** SEN-AC-06, 08, 09, 11 pass; schemas merged; all workspace routes validate.
**Workstream:** WS-SEN accepted per checklist §3.
**Integration:** G4/G5 — UI workspaces render only schema-valid data; P-AC-05 (backend side).

## 11. Risks and recovery
| Risk | Recovery |
| --- | --- |
| UI built against old shapes | WS-UI-P1 was built against current shapes (same developer); the schemas here reconcile them; WS-UI-P2 uses the schemas; aggregate alias kept until the switch |
| Performance miss | Index review (`1xx`/`2xx` migration) and per-snapshot memoisation of base aggregates |

## 12. Assumptions and unresolved questions
- [D] D-PLAN-10: provisional backtest limit ±15 %, confirmed on D4.

## 13. Completion handoff
README template; list schemas, route changes, parity corpus size, perf numbers. Next eligible: **WS-UI-P2**, WS-FND-P6; notify WS-PLT to switch to `rules.*` names.
