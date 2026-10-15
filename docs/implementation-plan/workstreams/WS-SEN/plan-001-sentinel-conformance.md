# WS-SEN · Plan 1 — Sentinel Conformance: Envelope, Read-Only Access and Golden Tests

> **Local plan number: Plan 1 of 2 in WS-SEN** · Unique ID: **`WS-SEN-P1`** · Branch: `ws-sen/p1-sentinel-conformance`

> **Repository context (updated 2026-10-13).** Work happens in `https://github.com/Kathir-M-03/FINNMIN-JFK-John` on a branch created from `main`, following [`development-workflow.md`](../../../development-workflow.md). Files marked *Modify*, *Keep*, *Delete*, *Move* or `[E]` belong to the **source baseline** — the application code described in [`baseline.md`](../../baseline.md). Per team decision **D-PLAN-3** (2026-10-13) the repository starts from that code at commit `fc0981d`; **until the source-baseline import commit is on `main` this plan cannot start** (one-time import by the team lead — see [`repository-migration-notes.md`](../../../repository-migration-notes.md) §5). One plan = one branch = one PR (D-PLAN-4). Statements below about what exists "on `main`" or "today" describe the source baseline, not the new repository's `main`.

## 1. Plan identity
| Field | Value |
| --- | --- |
| Workstream / local number / ID | WS-SEN — Sentinel Engine & Workspace Views / **Plan 1** / `WS-SEN-P1` |
| Owner / subagent | Dev D — Workspaces & Analytics Engineer / WS-SEN subagent |
| Objective | Prove all 17 functions in `backend/src/engines/sentinel/index.js` (`SENTINEL_FUNCTIONS`) against Sentinel spec §B.6/§B.9 with golden tests, enforce the `SentinelResult@1` envelope (SC §10.2), a read-only DB connection (S-12) and snapshot freshness, and fix defects found (gap G-12) |
| Expected outcome | SEN-AC-01…05, 07, 10, 12–20 tested and green; determinism replay; `query_only` connection; `snapshot.assertCurrent` honoured |
| Size | ~1.5 days (largest test-writing effort) |

## 2. Dependencies
| Type | Source | Needed | Early start |
| --- | --- | --- | --- |
| implementation | WS-FND-P1 | Harness, temp DB | No |
| interface | WS-FND-P3 | `snapshot.assertCurrent(snapshot, conn)`, gateway persistence | Yes — call the signature; stub returns true until merged |

**Parallel with:** WS-CAT-P1, WS-FND-P2/P3, WS-UI-P1.
**Unblocks:** WS-SEN-P2; interface for WS-PLT-P1 (rule outputs), WS-PLT-P2 (utilization shape), WS-AGT-P1 (`SentinelResult@1`).

## 3. Scope
**In:** golden tests (≥ 3 cases + edge cases per function), envelope validation, identity-param rejection (SEN-AC-03), static no-LLM check (SEN-AC-04), read-only connection (SEN-AC-05), confidence/variance presence (SEN-AC-07), isolation (SEN-AC-10), snapshot behaviour (SEN-AC-12), spend-definition cases (SEN-AC-13/14), confidence caps (SEN-AC-15), cap partition (SEN-AC-16), surplus/simulation agreement (SEN-AC-17), rebalance donors (SEN-AC-18), health score worked examples (SEN-AC-19), SIP reference (SEN-AC-20), defect fixes.
**Out:** rule-library parity with the Action Service (SEN-AC-06 → WS-SEN-P2); view routes (P2); backtests (SEN-AC-08) and performance (SEN-AC-11) → P2; parameter registry versioning (SEN-AC-09) → P2.

## 4. Files and ownership
| File | Action | Purpose | Ownership | Shared-file risk |
| --- | --- | --- | --- | --- |
| `backend/src/engines/sentinel/index.js` | Modify | Defect fixes; envelope builder; `assertCurrent`; identity-param guard | WS-SEN | Medium — 1,541-line file; consider extracting per-function modules only if a fix requires it |
| `backend/src/engines/sentinel/params.js` | Modify | Ensure every parameter used is registered | WS-SEN | Low |
| `backend/src/engines/sentinel/connection.js` | Create | Separate `DatabaseSync` on the same file with `PRAGMA query_only=ON` | WS-SEN | Low |
| `backend/src/shared/finance/movement.js`, `coverage.js` | Review/modify | Spend definition (co-owned; WS-CAT owns, SEN approves) | WS-CAT | Medium |
| `backend/test/sentinel/<function>.test.js` (17 files) | Create | Golden + edge cases | WS-SEN | Low |
| `backend/test/sentinel/envelope.test.js`, `determinism.test.js`, `readonly.test.js`, `isolation.test.js`, `no-llm.test.js` | Create | Cross-cutting | WS-SEN | Low |
| `backend/test/fixtures/sentinel/**` | Create | Snapshot fixtures built via the categorizer pipeline (not hand-inserted rows) | WS-SEN | Low |
| `backend/test/fixtures/sentinel/sip-reference.csv` | Create | 20 SIP cases computed in a spreadsheet (SEN-AC-20) | WS-SEN | Low |

## 5. Interfaces and contracts
- Unchanged public API: `callSentinel(functionName, params, ctx)`, `SENTINEL_FUNCTIONS`, `loadSnapshotState`, `rules.*` (WS-PLT-P1 and WS-AGT-P1 depend on these shapes; any change = a contract commit approved by them).
- Envelope `SentinelResult@1`: `{tool_result_id, function, model_version, snapshot_id, status:'OK'|'PARTIAL'|'INSUFFICIENT_DATA'|'ERROR', confidence, data_quality: DataQuality@1, data, warnings[], computed_at}` validated with `contracts.validate('SentinelResult@1')` before return.
- Rule output: `{verdict:'PASS'|'WARN'|'REJECT', rule_codes[], warnings[]}` (Sentinel §E) — frozen for WS-PLT-P1.

## 6. Implementation steps
1. Build fixture builder: given a small canonical batch + plan state, run categorizer ingest into temp DB and create a snapshot.
2. For each of the 17 functions write ≥ 3 golden cases with values computed by hand/spreadsheet (record derivations in test comments) + spec edge cases (zero income, no history, negative surplus, cap 0, leap month, IST midnight boundary, goal at target, refunds).
3. Envelope test over all functions; fix any missing fields.
4. Identity-param guard: reject `user_id`, `tenant_id`, literal values for `fact` params (SEN-AC-03).
5. Read-only connection used by all Sentinel reads; test that a write through it throws (SEN-AC-05).
6. Determinism: same snapshot + model version → deep-equal `data` across 2 runs and process restarts (SEN-AC-02).
7. Snapshot pinning: correction after snapshot creation → pinned request unchanged; new snapshot → changed (SEN-AC-12).
8. Spend-definition golden cases (SEN-AC-13) and cross-function spend equality (SEN-AC-14), cap partition (SEN-AC-16), surplus/simulation identity (SEN-AC-17), rebalance donors (SEN-AC-18), health worked examples (SEN-AC-19), SIP reference (SEN-AC-20).
9. Fix defects; each fix has a failing test first. List all fixes in the PR.

## 7. Edge cases
Listed per function in the test files; cross-cutting: empty ledger → `INSUFFICIENT_DATA` with `data_quality`; stale balances → confidence capped (SEN-AC-15); missing cap for a category → uncapped bucket; rounding half-even on all ratios; leap-year February daily rates.

## 8. Constraints
- No LLM import (SEN-AC-04). No writes. Integer paise and `decimal.js`/basis points only.
- Do not change rule output shapes without a contract change approved by WS-PLT and WS-AGT (first commit of the PR that needs it).

## 9. Test plan
| Test | Command |
| --- | --- |
| All Sentinel tests | `npm --prefix backend test` (files under `backend/test/sentinel/`) |
| One function | `node --test backend/test/sentinel/sentinel_run_category_utilization.test.js` |
| Static checks | included (`no-llm.test.js`) |

## 10. Acceptance criteria
**Plan:** SEN-AC-01–05, 07, 10, 12–20 pass; envelope valid for all 17 functions.
**Workstream:** proven analytical core for P2 and all consumers.
**Integration:** G3 "Sentinel golden tests for all 17 functions pass; determinism replay passes"; P-AC-04, P-AC-12 evidence.

## 11. Risks and recovery
| Risk | Recovery |
| --- | --- |
| Many defects found in the 1,541-line file | Prioritise functions on the demo path (utilization, velocity, rebalance, validators, goal progress/feasibility/balance, health) — Tier 1 list in Doc 6 §6; log the rest as known limitations |
| Fixture building through the pipeline is slow | Cache built fixtures per test file in the temp DB |

## 12. Assumptions and unresolved questions
- [A] Health-score worked examples in the spec are authoritative.
- [A] Team-set backtest thresholds (SEN-AC-08) are defined in P2 with the team lead.

## 13. Completion handoff
README template; list per-function case counts, defects fixed, any contract clarification. Next eligible: **WS-SEN-P2**; interface confirmations for WS-PLT-P1, WS-PLT-P2, WS-AGT-P1.
