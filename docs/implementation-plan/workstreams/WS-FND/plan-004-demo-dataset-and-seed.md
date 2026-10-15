# WS-FND · Plan 4 — Demo Dataset and Seed

> **Local plan number: Plan 4 of 6 in WS-FND** · Unique ID: **`WS-FND-P4`** · Branch: `ws-fnd/p4-demo-dataset`

> **Repository context (updated 2026-10-13).** Work happens in `https://github.com/Kathir-M-03/FINNMIN-JFK-John` on a branch created from `main`, following [`development-workflow.md`](../../../development-workflow.md). Files marked *Modify*, *Keep*, *Delete*, *Move* or `[E]` belong to the **source baseline** — the application code described in [`baseline.md`](../../baseline.md). Per team decision **D-PLAN-3** (2026-10-13) the repository starts from that code at commit `fc0981d`; **until the source-baseline import commit is on `main` this plan cannot start** (one-time import by the team lead — see [`repository-migration-notes.md`](../../../repository-migration-notes.md) §5). One plan = one branch = one PR (D-PLAN-4). Statements below about what exists "on `main`" or "today" describe the source baseline, not the new repository's `main`.

## 1. Plan identity
| Field | Value |
| --- | --- |
| Workstream / local number / ID | WS-FND / **Plan 4** / `WS-FND-P4` |
| Owner / subagent | Dev A — Integration Lead / WS-FND subagent |
| Objective | Produce the labelled synthetic dataset and a one-command reset so every demo, golden test and E2E run starts from identical, independently verified state (prototype data rules, Doc 5 §4; demo procedure, Doc 6 §5) |
| Expected outcome | `npm run reset-demo` builds a fresh DB through migrations, seeds users/profile/preferences/caps/goals/bills **through the Action Service and Profile Service**, and loads the demo batch **through the ingestion pipeline**; golden labels and independently computed expectations are committed |
| Size | ~1 day |

## 2. Dependencies
| Type | Source | Needed | Early start |
| --- | --- | --- | --- |
| implementation | WS-FND-P2 | Migrations | No |
| interface | WS-CAT-P2 | `CanonicalBatch@1` + `MappingProfile@1 demo-bank-v1` | Yes — data files written against SC §17.7 before CAT-P2 merges; loader falls back to existing `ingestBatch` until then |
| interface | WS-PLT-P1 | Canonical action names and `createProposal`/`confirmAndExecute` | Yes — seed uses an internal `seedAction()` wrapper switched over when PLT-P1 merges |

**Parallel with:** WS-FND-P3, WS-CAT-P2, WS-PLT-P1/P2.
**Unblocks:** WS-CAT-P3 (golden labels), WS-FND-P6, demo rehearsals.

## 3. Scope
**In:** synthetic 90-day dataset (to `DEMO_TODAY=2026-10-10`), two users (demo + isolation user), golden labels, expectations file computed by an independent script, reset script, fixed clock support.
**Out:** ingestion code (WS-CAT-P2), demo UI loader (WS-UI-P2), any real customer data (forbidden).

## 4. Files and ownership
| File | Action | Purpose | Ownership | Shared-file risk |
| --- | --- | --- | --- | --- |
| `backend/src/seed/dataset/demo-batch.json` | Create | `CanonicalBatch@1`, ~280 rows, 3 accounts (savings, credit card, manual cash), balances; `"synthetic": true` | WS-FND | Low |
| `backend/src/seed/dataset/demo-batch.csv` + `mapping-demo-bank-v1.json` | Create | Same rows in bank-CSV form for the CSV path | WS-FND (CAT reviews) | Low |
| `backend/src/seed/dataset/golden-labels.json` | Create | `{external_txn_id → {movement_type, category_id}}` for every row; includes 3 deliberately uncertain rows and the "Spencer's" row (rules → Dining, truth → Groceries) | WS-FND (CAT reviews) | Low |
| `backend/src/seed/dataset/generate.js` | Create | Deterministic generator (seeded PRNG) that writes the files above; committed outputs are authoritative | WS-FND | Low |
| `backend/src/seed/expectations.js` | Create | **Independent** calculator (no import from `engines/` or `shared/finance`) producing per-category spend per month, utilisation, balances | WS-FND | Low |
| `backend/test/fixtures/demo-expectations.json` + `.md` | Create | Outputs of `expectations.js`, human-readable copy referenced by Doc 6 §5 step 3 | WS-FND | Low |
| `backend/src/seed/reset-demo.js` | Create | Delete DB → migrate → seed via services → ingest batch → run dispatcher to quiescence | WS-FND | Low |
| `backend/src/shared/time.js` | Create | `today()`, `periodOf()`, `daysInMonth()` honouring `DEMO_TODAY` (Doc 2 §5.1) | WS-FND | Medium — new shared module; consumers migrate gradually |
| `backend/src/seed.js` (existing) | Modify | Delegate to `reset-demo.js`; legacy seeding removed in WS-FND-P5 | WS-FND | Low |
| root `package.json`, `backend/package.json` | Modify | `"reset-demo"` scripts | WS-FND | Medium |

## 5. Interfaces and contracts
- Demo state (Doc 6 §5 step 1): income ₹95,000 declared; fixed line `HOUSING.RENT` ₹25,000; preferences protected `HEALTH`, `HOUSING.RENT`, consent true; leaf caps `FOOD.DINING`, `FOOD.GROCERIES`, `FOOD.DELIVERY`, `ENTERTAINMENT`, `SHOPPING`, `TRANSPORT`; goals **Goa Trip**, **Home Deposit**; declared bills; Dining sized so October is at **Warning**.
- All amounts in paise; every row has `external_txn_id`, `posted_at`, `amount_minor`, `direction`, `description_raw`, `account_ref`.
- `time.today()` returns `process.env.DEMO_TODAY` when set (only honoured when `DEMO_CONTROLS=true` or `NODE_ENV=test`), else IST date.
- Isolation user: same shapes, different values, used by S-3 tests.

## 6. Implementation steps
1. Write `generate.js` with a fixed seed: salary credit, rent debit, card bill payment (`CARD_PAYMENT`), own-account transfer pair (`TRANSFER_INTERNAL`), refunds, UPI merchants, 3 ambiguous rows, Spencer's row.
2. Generate JSON, CSV and mapping profile; hand-label `golden-labels.json` (labels are reviewed by WS-CAT owner, not produced by the categorizer).
3. Write `expectations.js` from first principles (SC §6.2 spend definition re-implemented independently) and commit its output.
4. Add `shared/time.js`; replace no existing callers in this plan (WS owners migrate in their plans; listed in handoff).
5. `reset-demo.js`: migrate → create users via `/auth` service functions → profile/preferences via Profile Service → caps/goals via Action Service with `origin: UI_FORM` and a system confirm helper available **only** to the seed script (`NODE_ENV!=='production'`) → declared bills → ingest batch → `events.drainOnce()` until empty.
6. Test that seeded state equals expectations (spend totals to the paisa, alert state for Dining = WARNING) — this test is expected to fail until WS-CAT-P1/WS-PLT-P2 land; mark it with `{ todo: 'needs WS-PLT-P2' }` rather than skipping silently, and remove the `todo` in WS-FND-P6.

## 7. Edge cases
| Case | Handling |
| --- | --- |
| Expectations computed with the same code as the system | Forbidden: `expectations.js` may not import from `engines/` or `shared/finance` (test enforces by reading its `require` calls) |
| Month boundary / IST timezone rows (23:30 IST) | Include rows at 18:00–23:59 UTC to test IST bucketing |
| Paise rounding | Include amounts like ₹0.10, ₹0.20, ₹999.995 rejected by validation (bad row in a separate `demo-bad-rows.json` for CAT error tests) |
| Reset while server running | Script refuses if port 4000 responds; prints instruction |
| Seed confirm helper misused in production | Throws unless `NODE_ENV` ∈ {test, development} and `DEMO_CONTROLS=true` |

## 8. Constraints
- Synthetic only; labelled synthetic in data and UI (Doc 6 §4).
- No direct SQL inserts into categorizer or plan tables — everything via services/pipeline.
- Deterministic: same files → same DB.

## 9. Test plan
| Test | Command |
| --- | --- |
| `test/seed/generator.test.js` — determinism (hash of output) | `npm --prefix backend test` |
| `test/seed/expectations-independence.test.js` | same |
| `test/seed/reset-demo.test.js` — runs reset on temp DB, row counts, idempotent second load | same |
| `test/seed/seed-matches-expectations.test.js` (todo until PLT-P2) | same |
| Manual | `npm run reset-demo && npm run app` |

## 10. Acceptance criteria
**Plan:** files committed; reset reproducible; expectations independent; isolation user present.
**Workstream:** demo baseline for P6.
**Integration:** G5 E2E starts from `reset-demo`; P-AC-02, P-AC-03, P-AC-04, P-AC-06 evidence sources.

## 11. Risks and recovery
| Risk | Recovery |
| --- | --- |
| Golden labels disagree with SC taxonomy v1 | WS-CAT reviews labels against Categorizer §C.6 before merge |
| Dining not at Warning after categorization | Adjust generator amounts, regenerate; never hardcode alert state |
| Ingestion API not merged | Loader falls back to `categorizer.ingestBatch` directly (temporary, removed in P6) |

## 12. Assumptions and unresolved questions
- [A] `DEMO_TODAY=2026-10-10` (Doc 6 §5).
- [A] Taxonomy leaf IDs in this plan match Categorizer §C.6; verify while labelling.

## 13. Completion handoff
README template; list dataset stats (rows per account/month, ambiguous rows), expectations summary, callers that should adopt `shared/time.js`. Next eligible: **WS-CAT-P3** (golden set), WS-FND-P6.
