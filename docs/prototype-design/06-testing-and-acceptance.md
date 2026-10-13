# Document 6 — Testing and Acceptance Criteria (prototype)

**How we prove it works:** deterministic logic is proven by golden tests on real SQLite; contracts by schema tests; orchestration by integration tests with a deterministic LLM substitute; real AI behaviour by a separate live suite; the product by a scripted end-to-end demo whose numbers are checked against hand-computed expectations.

## 1. Tooling (no new framework)
| Need | Choice |
| --- | --- |
| Runner | `node --test` (Node ≥ 22.5), tests beside modules (`*.test.js`) + `tests/e2e/` |
| Database | `tests/helpers/temp-db.js`: creates a temp file DB, applies migrations, loads `seed/` fixtures; never the in-memory emulator |
| HTTP | `app.listen(0)` + built-in `fetch`; SSE parsed by a small helper |
| LLM substitute | `fake` provider: fixture map keyed by `(modelClass, task_type or route, fixture_id)` returning recorded JSON. **Enabled only when `NODE_ENV=test`**; the app refuses to start with it otherwise |
| Live LLM | `npm run test:live` with the real Qwen endpoint (`LLM_*` env); not part of the merge gate (cost, nondeterminism) but required before the demo |
| Schema validation | Ajv against `shared/contracts/schemas` |

Fake-LLM tests prove **orchestration, validation and grounding**; they do not prove model quality. The live suite proves the real model produces schema-valid, grounded responses on the demo scenarios. Reports label which suite produced each result.

## 2. Test layers
| Layer | What | Examples (minimum) |
| --- | --- | --- |
| Unit — money/time | Paise parsing/formatting, IST periods, days elapsed/remaining | ₹1,20,000.50 parse; Feb 2028 leap; 31 Oct 23:59 IST vs UTC |
| Unit — Sentinel | Each of 17 functions: ≥ 3 golden cases + edge cases (Sentinel §J) | cap 0; refund across months; exclusive cap partition; FIXED exclusion; SIP vs reference spreadsheet; health score worked examples |
| Unit — rule library | Every rule code positive/negative | `FUNDS_EXCEED_TARGET`, `PROTECTED_CATEGORY` with/without override, `ZERO_SUM_VIOLATION` |
| Unit — Categorizer | Each pipeline rule (type a–i, merchant precedence, confidence routing, supersession) | Card payment pair; reversal within 7 days; manual entry superseded by bank row |
| Contract | Every schema in SC §5, §8–§10, §13, Doc 2 §5 payloads; module stubs export documented signatures | `SpecialistResponse@1` fixtures valid/invalid; `SentinelResult@1` for every function |
| Integration — persistence | Ingestion → classification → status; action → executor → versions → outbox → Monitor | F1, F2, F6, F7, F8, F9 on a temp DB |
| Integration — routing & synthesis | John with fake specialists/LLM | Routing table cases; validation checks 1–11; conflict rules; grounding regenerate + fallback |
| Integration — changes | Budget, category, goal changes affect later results | See P-AC-08…10 |
| Failure paths | Injected faults | Sentinel throws; LLM timeout; malformed JSON; DB write failure; stale snapshot; duplicate submit; expired proposal |
| Security | Doc 5 S-1…S-16 tests | Two-user isolation; write tool attempt; consent false |
| E2E (API level, fake LLM) | Whole demo journey via HTTP/SSE | `tests/e2e/demo-journey.test.js` |
| E2E (live LLM) | Same journey with the real model | `npm run test:live` |
| UI checklist | Manual, scripted (§5) — each step has an observable expected result | Run before demo |

## 3. Acceptance criteria (observable; prototype is accepted when all pass)

| ID | Criterion | How observed |
| --- | --- | --- |
| P-AC-01 | One server and one database serve all five workspaces; no request goes to port 4001; no frontend file imports `src/data/mock*` | Grep test + network log during UI checklist |
| P-AC-02 | Loading the demo batch twice creates rows once (second load returns the original batch) | Row count and `categorization_version` unchanged after second load |
| P-AC-03 | Golden classification: on the 120-row labelled demo set, 0 transfers/card payments counted as spend; refunds/reversals linked; ≥ 90 % of rows match their labelled category or are correctly abstained (`UNCATEGORIZED`) | Golden test report |
| P-AC-04 | Sentinel spend for every category equals the hand-computed expectation file `tests/fixtures/expected-spend.json` (computed independently in a spreadsheet) to the paisa | Golden test |
| P-AC-05 | Every number in every workspace view response carries a `tool_result_id` or comes from Categorizer status/Profile; the frontend contains no financial arithmetic (lint rule: no `+ - * /` on `_minor` fields in `src/`) | View contract test + lint |
| P-AC-06 | A Dining Warning alert exists after seeding without any LLM call (adapter call count 0) | Integration test |
| P-AC-07 | Opening the alert yields a Nova explanation whose numbers all bind to cited results and an `APPLY_REBALANCE` card whose transfers equal the rebalance result | E2E fake + live |
| P-AC-08 | Confirming the rebalance creates current-month overrides only; the Dining alert resolves in the same dispatcher cycle; next month's effective caps equal the standing caps | Integration |
| P-AC-09 | Correcting one transaction's category changes both categories' utilization; the next chat answer uses the new figures (no cached old-version result served) | Integration + E2E |
| P-AC-10 | `ADD_FUNDS` above available balance is rejected with `INSUFFICIENT_BALANCE`; within balance it executes and the next progress result reflects it; double confirm returns `DUPLICATE` | Integration |
| P-AC-11 | The phone what-if question invokes Iris and Atlas in parallel (trace shows overlapping spans), returns a grounded answer, and any goal-override proposal is a card, not an executed change | E2E trace |
| P-AC-12 | "How healthy are my finances?" returns score, grade and four components equal to `sentinel_compute_health_score` output | E2E |
| P-AC-13 | Typed "yes" after a card never executes a T2/T3 action; tapping Confirm does | E2E |
| P-AC-14 | With the LLM provider unreachable, all five workspaces, forms, alerts and confirmations still work; chat shows the degraded notice | Failure test (provider URL pointed at a closed port) |
| P-AC-15 | Restarting the server preserves caps, goals, overrides, alerts, proposals, ledger, chat threads and categorization state | Restart test |
| P-AC-16 | Cross-user access to any ID returns 404 / no data | Isolation suite |
| P-AC-17 | Synthesis grounding: 0 ungrounded digits across the fake-LLM eval set (≥ 40 cases) and the live demo set (≥ 15 cases) | Eval reports |
| P-AC-18 | Live suite: ≥ 90 % of specialist responses are schema-valid on first or repair attempt; 100 % of user-visible numbers grounded (invalid ones stripped) | `test:live` report |
| P-AC-19 | Chat p95 ≤ 12 s for single-specialist requests and ≤ 20 s cap overall on the demo laptop with the live model | Live suite timing |
| P-AC-20 | Every deferred control is visibly disabled with "Not in prototype"; no visible control errors | UI checklist |

## 4. Fake-vs-real labelling rule
Any test, screenshot or demo artefact produced with the `fake` provider is labelled "deterministic substitute". The demo itself must run with the live provider (P-AC-18/19); if the provider fails on the day, the team states that chat is degraded rather than switching to the fake.

## 5. Repeatable demonstration procedure
1. `npm run reset-demo` → deletes `finmate.db`, applies migrations, seeds users, profile (income ₹95,000 declared; fixed line rent `HOUSING.RENT` ₹25,000), preferences (protected `HEALTH`, `HOUSING.RENT`; consent true), leaf caps (`FOOD.DINING`, `FOOD.GROCERIES`, `FOOD.DELIVERY`, `ENTERTAINMENT`, `SHOPPING`, `TRANSPORT`), two goals (Goa Trip, Home Deposit), declared bills, and loads the demo canonical batch (90 days to the demo date, fixed clock `DEMO_TODAY=2026-10-10`).
2. `npm run dev` + `npm run web` (or `npm run app`). Check `/api/v1/health`: DB ok, LLM breaker closed.
3. Sentinel workspace: balances, data-quality badge (coverage shown), spending by category, trends, upcoming bills incl. declared rent; Needs-review list shows the 3 seeded uncertain rows. *Expected values: `tests/fixtures/demo-expectations.md`.*
4. Nova: Dining at Warning (provisional flag false), envelope shown; open the alert → Explain → rebalance card → Confirm → Dining Healthy, alert resolved.
5. Sentinel transactions: change the seeded Spencer's row (rules placed it in Dining) to Groceries → Undo appears; Nova reflects both categories.
6. John: phone what-if question → answer with Iris and Atlas findings; goal-override card shown (Decline it).
7. Atlas: add ₹2,00,000 to Home Deposit → rejected (`INSUFFICIENT_BALANCE` wording); add ₹10,000 → card → Confirm → progress updates.
8. John: "How healthy are my finances?" → score and components.
9. Iris planner: move the Delivery slider → simulated balance and risk level change (no LLM).
10. Stop and restart the server → repeat a Nova view: state persisted.

## 6. Scope tiers (for time pressure; unresolved decision U-1)
| Tier | Must work for the demo | Includes |
| --- | --- | --- |
| 1 | Steps 1–5, 7, 10 | Foundations, ingestion + categorizer, Sentinel (utilization, velocity, rebalance, validators, ledger, goal progress/feasibility/balance), Action Service, Monitor, Nova specialist + John single-specialist path, Nova/Sentinel/Atlas workspaces |
| 2 | Steps 6, 8 | Iris specialist, parallel dispatch, arbitration, health score, John workspace strip |
| 3 | Step 9 + remaining | Iris planner workspace, bills/cash-flow scan, SIP, plan review, dependency edge, remaining task types in Doc 4 |
Tier 1 alone already proves the end-to-end architecture (data → categorization → persistence → deterministic analysis → LLM specialist → consent → execution → propagation).
