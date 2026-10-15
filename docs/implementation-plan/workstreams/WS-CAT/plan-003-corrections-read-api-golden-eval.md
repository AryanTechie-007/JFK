# WS-CAT · Plan 3 — Corrections via the Action Service, Read API and Golden Evaluation

> **Local plan number: Plan 3 of 3 in WS-CAT** · Unique ID: **`WS-CAT-P3`** · Branch: `ws-cat/p3-corrections-read-api`

> **Repository context (updated 2026-10-13).** Work happens in `https://github.com/Kathir-M-03/FINNMIN-JFK-John` on a branch created from `main`, following [`development-workflow.md`](../../../development-workflow.md). Files marked *Modify*, *Keep*, *Delete*, *Move* or `[E]` belong to the **source baseline** — the application code described in [`baseline.md`](../../baseline.md). Per team decision **D-PLAN-3** (2026-10-13) the repository starts from that code at commit `fc0981d`; **until the source-baseline import commit is on `main` this plan cannot start** (one-time import by the team lead — see [`repository-migration-notes.md`](../../../repository-migration-notes.md) §5). One plan = one branch = one PR (D-PLAN-4). Statements below about what exists "on `main`" or "today" describe the source baseline, not the new repository's `main`.

## 1. Plan identity
| Field | Value |
| --- | --- |
| Workstream / local number / ID | WS-CAT / **Plan 3** / `WS-CAT-P3` |
| Owner / subagent | Dev B — Data & Write-Path Engineer / WS-CAT subagent |
| Objective | Make the categorizer the **only** writer of categorization state (gap G-14): move the category/type/manual-entry logic now inside `platform/action-service.js` into categorizer executors registered with the Action Service; expose the read API the UI and John need; report golden-set quality |
| Expected outcome | `applyChange`, `dryRun`, `ingestManual`, `listTransactions`, `getTransaction`, `listReviewItems`, `addReviewItem` exported; executors registered for `RECATEGORIZE_TRANSACTION`, `CONFIRM_CATEGORY`, `SET_TRANSACTION_TYPE`, `DISMISS_REVIEW_ITEM`, `UNDO_CLASSIFICATION_CHANGE`, `ADD_MANUAL_TRANSACTION`, `CREATE_CATEGORY_RULE`; `GET /transactions`, `/transactions/:id`, `/review-queue`, `/categorization/status`; golden report |
| Size | ~1 day |

## 2. Dependencies
| Type | Source | Needed | Early start |
| --- | --- | --- | --- |
| implementation | WS-CAT-P1 | Conformant pipeline | No |
| interface → integration | WS-PLT-P1 | `registerExecutor(action, {applyChange, dryRun?, undo})`, `ActionCtx` | Yes — unit tests call executors with a hand-built ctx; integration once PLT-P1 merges |
| implementation | WS-FND-P4 | `golden-labels.json` | Yes — evaluate on own 30-row fixture first |

**Parallel with:** WS-AGT-P2, WS-UI-P2 (layout), WS-JON-P1.
**Unblocks:** WS-JON-P2 (corrections in chat), WS-UI-P2 (transactions/review list), WS-FND-P6.

## 3. Scope
**In:** executors and their undo; dry-run counts for merchant scope; read API + routes; versioned reads (CAT-AC-08); review items from specialist hints; golden evaluation script (CAT-AC-19 report).
**Out:** link/duplicate/own-account actions and `DELETE_CATEGORY_RULE` (deferred, Doc 0 §3.2 / Doc 4 §8.1); taxonomy migration.
**Scope note (audit A-18):** `SET_TRANSACTION_TYPE` and `CREATE_CATEGORY_RULE` are deferred in Doc 0 §3.2 but **already implemented in the source baseline** (as `SET_TRANSACTION_MOVEMENT_TYPE` / `CREATE_CATEGORY_RULE` in `action-service.js`). This plan only *moves* that existing behaviour into categorizer executors so nothing working is lost; it adds no new deferred action. Their UI controls stay as they are in the source baseline. Confirmed by team decision D-PLAN-5 (2026-10-13).

## 4. Files and ownership
| File | Action | Purpose | Ownership | Shared-file risk |
| --- | --- | --- | --- | --- |
| `backend/src/engines/categorizer/executors.js` | Create | Executors per action; inverse computation for undo (24 h) | WS-CAT | Low |
| `backend/src/engines/categorizer/read.js` | Create | `listTransactions(filters, page, session)`, `getTransaction`, `listReviewItems`, `addReviewItem` | WS-CAT | Low |
| `backend/src/engines/categorizer/index.js` | Modify | Export the new functions; register executors at module load via `actionService.registerExecutor` | WS-CAT | Medium |
| `backend/src/platform/action-service.js` | Modify (coordinated) | **Remove** the `CONFIRM_TRANSACTION_CATEGORY`/`CORRECT_TRANSACTION_CATEGORY`/`CONFIRM_PROVISIONAL_CATEGORY`/`SET_TRANSACTION_MOVEMENT_TYPE`/`CREATE_MANUAL_TRANSACTION`/`CREATE_CATEGORY_RULE` case bodies (they delegate to registered executors) | **WS-PLT owns** — PR co-authored, PLT approves | **High** — coordinate with WS-PLT-P1 branch |
| `backend/src/routes/v1/categorizer.js` | Modify | `GET /transactions`, `/transactions/:id`, `/review-queue`, `/categorization/status`; keep `/categorizer/*` aliases until WS-UI-P2 switches | WS-CAT | Low |
| `backend/src/shared/contracts/schemas/actions/{RECATEGORIZE_TRANSACTION,CONFIRM_CATEGORY,SET_TRANSACTION_TYPE,DISMISS_REVIEW_ITEM,UNDO_CLASSIFICATION_CHANGE,ADD_MANUAL_TRANSACTION,CREATE_CATEGORY_RULE}.json` | Create | Params schemas (SC §13.2) | WS-CAT (PLT reviews) | Medium |
| `backend/scripts/golden-eval.js` | Create | Precision/recall per category, auto-assigned precision, review share, uncategorized share → `docs/implementation-plan/reports/golden-eval.md` | WS-CAT | Low |
| `backend/test/categorizer/executors.test.js`, `read-api.test.js`, `cat-ac-08-versioned-read.test.js`, `golden.test.js` | Create | Tests | WS-CAT | Low |

## 5. Interfaces and contracts
```js
// registered with the Action Service (WS-PLT-P1 contract)
actionService.registerExecutor('RECATEGORIZE_TRANSACTION', {
  applyChange: (params, actionCtx, tx) -> {changedTxnIds, categorizationVersion, rowVersions, inverse},
  dryRun:      (params, actionCtx)     -> {affected:{updated, skippedConfirmed, skippedChanged}},   // MERCHANT scope card
  undo:        (inverse, actionCtx, tx) -> {...}
});
// read API (Doc 2 §5.3)
listTransactions({period?, category_id?, status?, q?}, {cursor?, limit<=100}, session) -> {items: TransactionView[], nextCursor}
getTransaction(txnId, session) -> TransactionView & {evidence[], events[]}
listReviewItems(session) -> ReviewItem[];  addReviewItem({txnId, reason:'SPECIALIST_HINT'}, session) -> ReviewItem
```
- Executors run **inside the Action Service transaction** (`tx` passed in); they bump `categorization` version and append `categorization.updated` via `events.append(tx, …)`.
- Tiers: `RECATEGORIZE_TRANSACTION` scope `TRANSACTION` = T1, scope `MERCHANT` = T2 with dry-run counts on the card (SC §13.2).
- `TransactionView` includes `category_id`, `movement_type`, `status (AUTO|NEEDS_REVIEW|CONFIRMED|USER_SET)`, `confidence_band`, `merchant_display`, `amount_minor`, `posted_at`, `row_version`.

## 6. Implementation steps
1. Agree the executor contract with WS-PLT (same developer). If anything differs from §5, record the change as the first commit of this PR.
2. Extract logic from the action-service case bodies into `executors.js`, adapting to `(params, ctx, tx)`; add inverse capture.
3. Implement merchant-scope dry-run and `include_confirmed` handling (CAT-AC-06/07).
4. Implement `UNDO_CLASSIFICATION_CHANGE` (within 24 h, rows unchanged since — else `REJECTED_STALE`).
5. `ADD_MANUAL_TRANSACTION` → `ingestManual` with source `MANUAL`.
6. Read API + routes; snapshot-pinned reads (CAT-AC-08).
7. Co-authored PR with WS-PLT removing action-service case bodies; run both teams' tests.
8. Golden evaluation script over `golden-labels.json`; commit report; thresholds for P-AC-03 taken from Doc 6 §3.
9. Tests; handoff.

## 7. Edge cases
| Case | Handling |
| --- | --- |
| Correction to a category not applicable to the movement type | `CATEGORY_NOT_APPLICABLE_TO_TYPE` |
| Concurrent corrections | `row_version` If-Match → `VERSION_CONFLICT` (CAT-AC-15) |
| Undo after a later correction on the same row | `REJECTED_STALE` |
| Merchant scope with no merchant key | Merchant scope not offered (CAT-AC-07) |
| Specialist hint for a row already confirmed | No review item; no change (CAT-AC-18) |
| Paging beyond end | `nextCursor: null` |

## 8. Constraints
- No direct writes to categorizer tables from outside `engines/categorizer/` after this plan (grep test).
- Executors never commit their own transaction.
- Keep `/categorizer/*` paths until WS-UI-P2 merges; WS-FND-P5 removes them.

## 9. Test plan
| Test | Command |
| --- | --- |
| `executors.test.js` (each action, inverse, undo window) | `npm --prefix backend test` |
| `read-api.test.js` (filters, paging, isolation) | same |
| `cat-ac-08-versioned-read.test.js` | same |
| `single-writer.test.js` (grep: no `UPDATE transactions_v1` outside categorizer) | same |
| Golden | `node backend/scripts/golden-eval.js` |

## 10. Acceptance criteria
**Plan:** all executors registered and tested; read API live; single-writer test green; golden report produced.
**Workstream:** WS-CAT accepted per checklist §3.
**Integration:** G4 "correction → next chat answer uses new `categorization_version`"; P-AC-03, P-AC-09.

## 11. Risks and recovery
| Risk | Recovery |
| --- | --- |
| Merge conflict with WS-PLT-P1 in `action-service.js` | Sequence: PLT-P1 lands registry + `registerExecutor` first; CAT-P3 PR removes case bodies on top |
| Golden precision below threshold | Report; tune rules/merchant aliases (data, not code) |

## 12. Assumptions and unresolved questions
- [A] Canonical action names per SC §13.2 (conflict C-5 default).
- [A] P-AC-03 thresholds from Doc 6 §3 are final for the prototype.

## 13. Completion handoff
README template; list registered executors, routes added, golden metrics. Next eligible: **WS-JON-P2, WS-UI-P2**, WS-FND-P6.
