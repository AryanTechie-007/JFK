# WS-CAT · Plan 1 — Categorizer Conformance and Pipeline Fixes

> **Local plan number: Plan 1 of 3 in WS-CAT** · Unique ID: **`WS-CAT-P1`** · Branch: `ws-cat/p1-categorizer-conformance`

> **Repository context (updated 2026-10-13).** Work happens in `https://github.com/Kathir-M-03/FINNMIN-JFK-John` on a branch created from `main`, following [`development-workflow.md`](../../../development-workflow.md). Files marked *Modify*, *Keep*, *Delete*, *Move* or `[E]` belong to the **source baseline** — the application code described in [`baseline.md`](../../baseline.md). Per team decision **D-PLAN-3** (2026-10-13) the repository starts from that code at commit `fc0981d`; **until the source-baseline import commit is on `main` this plan cannot start** (one-time import by the team lead — see [`repository-migration-notes.md`](../../../repository-migration-notes.md) §5). One plan = one branch = one PR (D-PLAN-4). Statements below about what exists "on `main`" or "today" describe the source baseline, not the new repository's `main`.

## 1. Plan identity
| Field | Value |
| --- | --- |
| Workstream / local number / ID | WS-CAT — Item Categorizer & Ingestion / **Plan 1** / `WS-CAT-P1` |
| Owner / subagent | Dev B — Data & Write-Path Engineer / WS-CAT subagent |
| Objective | Prove the existing `backend/src/engines/categorizer/` against Item Categorizer spec §B.9 with executable tests, and fix what fails: idempotency, pending/posted supersession, transfer and refund typing, merchant evidence, chunk atomicity with outbox events, isolation, no-LLM rule (gap G-12) |
| Expected outcome | Tests for CAT-AC-01…07, 09–11, 13–18 in `backend/test/categorizer/` green; `categorization.updated` events appended via `events.append` in the same transaction as each chunk |
| Size | ~1 day |

## 2. Dependencies
| Type | Source | Needed | Early start |
| --- | --- | --- | --- |
| implementation | WS-FND-P1 | `node --test` harness, temp DB | No (lands D1) |
| interface | WS-FND-P3 | `events.append(tx, userId, type, payload)` | Yes — call the signature; until merged, a local shim inserts into `outbox_events` exactly as the final function will |

**Parallel with:** WS-SEN-P1, WS-FND-P2/P3, WS-UI-P1.
**Unblocks:** WS-CAT-P2, WS-CAT-P3.

## 3. Scope
**In:** acceptance tests; pipeline fixes in `index.js`, `normalize.js`, `merchants.js`; versioned read function used by Sentinel (`getTransactionsAsOf` → `readTransactionsForSnapshot` alias); status `coverage_by_amount_bp` via `shared/finance/coverage.js`; raw-field immutability (S-13).
**Out:** canonical ingestion entry (WS-CAT-P2); corrections executors and action routing (WS-CAT-P3); taxonomy migrations (CAT-AC-12, deferred per Doc 4 §8.1); LLM anything (forbidden).

## 4. Files and ownership
| File | Action | Purpose | Ownership | Shared-file risk |
| --- | --- | --- | --- | --- |
| `backend/src/engines/categorizer/index.js` | Modify | Pipeline fixes, events, chunking (500 rows/transaction), `readTransactionsForSnapshot` | WS-CAT | Medium — used by Sentinel, routes, Action Service; keep exported names |
| `backend/src/engines/categorizer/{normalize,merchants,taxonomy}.js` | Modify | Evidence-only merchant assignment (CAT-AC-05); taxonomy v1 parity with spec §C.6 | WS-CAT | Low |
| `backend/src/shared/finance/movement.js`, `coverage.js` | Modify if needed | Spend definition / coverage parity | WS-CAT, **WS-SEN approves** | Medium |
| `backend/src/db/migrations/100_categorizer_constraints.sql` | Create (if needed) | Unique `(user_id, account_id, bank_txn_ref)`; trigger blocking UPDATE of raw columns on `transactions_v1` | WS-CAT | Low |
| `backend/test/categorizer/cat-ac-*.test.js` | Create | One file per criterion group | WS-CAT | Low |
| `backend/test/fixtures/categorizer/*.json` | Create | Small labelled fixtures (30 rows) | WS-CAT | Low |

## 5. Interfaces and contracts
- Keep existing exports (`ingestTransactions`/`ingestBatch`, `getStatus`, `getReviewQueue`, `getTransactionsAsOf`, …) so routes and Sentinel keep working; add:
  ```js
  readTransactionsForSnapshot(userId, {fromDate, toDate}, {categorizationVersion}) -> Transaction@1[]   // Sentinel only
  ```
- Event: `categorization.updated` payload `{categorization_version, changed_txn_ids[], periods[], reason:'INGEST'|'CORRECTION'|'RULE'}` (SC §14.1), appended inside the chunk transaction.
- Error codes from SC §15.2 only (`INVALID_INPUT`, `VERSION_CONFLICT`, `CATEGORY_NOT_APPLICABLE_TO_TYPE`).

## 6. Implementation steps
1. Write tests first for each criterion against the current code; record which fail (list in PR).
2. Idempotency (CAT-AC-03): dedupe key `(account, bank_txn_ref)` else hash of `(account, posted_date, amount_minor, direction, normalized_description)`; re-delivery creates no rows, no event, no version bump; genuine repeats with different refs kept.
3. Supersession (CAT-AC-04): posted row supersedes pending twin and matching manual entry within `manual_match_window_days=2`; superseded rows excluded from spend.
4. Movement typing (CAT-AC-01/02): transfers between own accounts within 3 days → `TRANSFER_INTERNAL` pair; card bill payments → `CARD_PAYMENT`; refunds within 90 days → link `REFUND_OF`, never `INCOME`.
5. Merchant evidence (CAT-AC-05): set `merchant_id` only with alias/VPA/ID evidence; otherwise null + lower confidence.
6. Chunk atomicity (CAT-AC-09): each 500-row chunk in one transaction with version bump and `events.append`; forced failure (test hook) rolls back both.
7. Consumer idempotency (CAT-AC-10): event carries version; document for consumers; test with a dummy consumer fed duplicates/out-of-order.
8. Coverage parity (CAT-AC-11): status uses `shared/finance/coverage.js`; assert equals Sentinel's computation for the same version.
9. Error reporting and resume (CAT-AC-13): invalid rows reported with codes, valid processed; rerun after interruption → no duplicates.
10. Isolation (CAT-AC-14), parallel corrections conflict (CAT-AC-15, `row_version` If-Match), static no-LLM check (CAT-AC-16), type-transition table (CAT-AC-17), specialist hint → at most one review item (CAT-AC-18).
11. Raw immutability trigger (S-13) if raw fields live in `transactions_v1`.
12. Run full suite; handoff with pass list.

## 7. Edge cases
| Case | Handling |
| --- | --- |
| Same amount same day two genuine purchases | Different `bank_txn_ref` → both kept |
| Pending row never posts | Stays pending; excluded from spend after `pending_expiry_days` (registry default) |
| Refund larger than original | Link partial; excess typed per spec (not income) and review item created |
| Transfer to an account not yet marked own | Typed per spec as outgoing; `MARK_OWN_ACCOUNT_COUNTERPARTY` deferred (prototype subset) |
| IST date boundaries | Use `posted_at` converted to IST (`shared/time.js` when available) |
| Event appended but consumer absent | Outbox keeps it; dispatcher delivers later |

## 8. Constraints
- No LLM import in `categorizer/` (CAT-AC-16). No floating-point money. Single writer for categorizer tables.
- Do not change `shared/finance/*` semantics without WS-SEN approval.
- Do not modify `test-v1-specs.js` assertions; if one contradicts the spec, record the conflict.

## 9. Test plan
| Test | Command |
| --- | --- |
| `backend/test/categorizer/cat-ac-01-02-movement.test.js` | `npm --prefix backend test` |
| `cat-ac-03-04-idempotency-supersession.test.js` | same |
| `cat-ac-05-merchant-evidence.test.js` | same |
| `cat-ac-06-07-15-17-corrections-basics.test.js` (existing correction paths; executors move in P3) | same |
| `cat-ac-09-10-atomicity-events.test.js` | same |
| `cat-ac-11-coverage.test.js` | same |
| `cat-ac-13-14-16-18-robustness.test.js` | same |
| Single file during development | `node --test backend/test/categorizer/<file>` |

## 10. Acceptance criteria
**Plan:** CAT-AC-01…07, 09–11, 13–18 pass; events emitted in-transaction; no regressions in ported legacy tests.
**Workstream:** conformance baseline for P2/P3.
**Integration:** G3 item "Categorizer AC tests pass".

## 11. Risks and recovery
| Risk | Recovery |
| --- | --- |
| Fixes change outputs relied on by Sentinel tests | Coordinate via `shared/finance` PR with WS-SEN; run SEN tests in the same PR |
| Existing schema lacks a needed column | Add in `1xx` migration (own range) |

## 12. Assumptions and unresolved questions
- [A] `transactions_v1` holds both raw and classified fields; immutability enforced by trigger on raw columns.
- [A] CAT-AC-12 (taxonomy merge/split) is deferred with `APPLY_TAXONOMY_MIGRATION` (Doc 4 §8.1).

## 13. Completion handoff
README template; list criteria with test names; event payload sample; columns/migrations added. Next eligible: **WS-CAT-P2, WS-CAT-P3**.
