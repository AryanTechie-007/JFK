# Cross-Workstream Dependency Matrix

Dependency types: **decision** (a choice must be made), **interface** (an agreed contract/signature is enough — the dependent plan can start and test against fixtures), **implementation** (merged working code is required), **integration** (both sides must be merged to run the joint test). "Early start" = the dependent plan may begin before the source plan finishes. "Earliest safe start" = the first point in the four-developer schedule (`roadmap.md` §4) at which the consumer may rely on the artifact without inventing anything.

## 1. Within-workstream order (for completeness)
| Workstream | Order | Reason |
| --- | --- | --- |
| WS-FND | P1 → P2 → P3; P2 → P4; P5 after P3 + cross deps; P6 last | Harness before schema; schema before plumbing and seed; retirement and E2E need everyone |
| WS-CAT | P1 → P2; P1 → P3 | Pipeline fixes before new entry points and correction rework |
| WS-SEN | P1 → P2 | Proven functions before rule-library parity and view contracts |
| WS-PLT | P1 → P2 | Consent-safe execution before event-driven monitor uses executors |
| WS-AGT | P1 → P2 → P3 | Runner before specialists before live evaluation |
| WS-JON | P1 → P2 | Router/synthesis/streaming before proposal flows |
| WS-UI | P1 → P2; P1 → P3 | Shell and client before workspaces and chat |

## 2. Cross-workstream dependencies
| # | Source | Dependent | Required artifact or contract | Type | Early start? | Fallback / unblocking strategy | Earliest safe start (4-dev schedule) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | WS-FND-P1 | WS-CAT-P1 | `node --test` harness, `backend/test/helpers/temp-db.js`, route split | implementation | No (P1 lands D1) | Write tests in `node:test` style locally; run with `node --test <file>` until CI exists | WS-FND-P1 merged (D1 evening); test design earlier against its branch |
| 2 | WS-FND-P1 | WS-SEN-P1 | Same as #1 | implementation | No | Same | WS-FND-P1 merged (D1); Dev D starts D3 |
| 3 | WS-FND-P1 | WS-SEN-P2 | `routes/v1/workspaces-*.js` files created by the split | implementation | Not needed (WS-SEN-P2 runs D4–D5) | — | After WS-FND-P1 merges (D1 end) |
| 4 | WS-FND-P1 | WS-UI-P1 | Route paths unchanged by the split (`/api/v1/...`) | interface | Yes | Paths are fixed in `baseline.md` §3 | Immediately (D1) |
| 5 | WS-FND-P2 | WS-CAT-P2 | `ingestion_batches`, `ingestion_errors` tables | implementation | Yes (parser, validator, mapping) | CAT may add `110_ingestion.sql` in its own range if FND-P2 slips; FND reconciles | Parser/validator immediately; tables after WS-FND-P2 merge (D2 am) |
| 6 | WS-FND-P2 | WS-PLT-P1 | `intent_tokens` table | implementation | Yes | PLT may add `300_intent_tokens.sql` in its range | After WS-FND-P2 merge (D2 am) or `300` fallback |
| 7 | WS-FND-P3 | WS-CAT-P1 | `events.append(tx, userId, type, payload)` | interface | Yes | Call the documented signature; the stub inserts into existing `outbox_events` | Immediately (Doc 2 §5.1 signature) |
| 8 | WS-FND-P3 | WS-SEN-P1 | `snapshot.assertCurrent(snapshot)` and `tool_results` persistence in the gateway | interface | Yes | SEN tests call `assertCurrent` via the agreed signature; stub returns true | Immediately |
| 9 | WS-FND-P3 | WS-PLT-P1 | `events.append` | interface | Yes | Same as #7 | Immediately |
| 10 | WS-FND-P3 | WS-PLT-P2 | `events.subscribe(type, handlerName, fn)` + dispatcher | implementation | Yes (handler logic + unit tests) | Call handlers directly in tests until the dispatcher lands | Handler logic immediately; dispatcher wiring after WS-FND-P3 merge (end D3) |
| 11 | WS-FND-P3 | WS-AGT-P1 | `llm.complete()` with `fake` provider; gateway `getResult`, `verifyResultOwnership` | implementation | Yes (runner logic against the interface) | Local in-test fake implementing the same signature | Runner logic immediately; adapter after WS-FND-P3 merge (end D3) |
| 12 | WS-FND-P3 | WS-JON-P1 | Same as #11 | implementation | Yes | Same | Immediately against local fake; adapter after WS-FND-P3 merge (end D3) |
| 13 | WS-FND-P4 | WS-CAT-P3 | Labelled golden set `backend/src/seed/dataset/golden-labels.json` | implementation | Yes (evaluation code first) | Use CAT's own 30-row fixture until the full set lands | Eval code immediately; golden run after WS-FND-P4 merge (end D4) |
| 14 | WS-SEN-P1 | WS-PLT-P1 | Rule library output `{verdict, rule_codes, warnings}` per Sentinel §E | interface | Yes | Contract already in spec; SEN-P1 must not change it without an approved contract change | Immediately (Sentinel §E frozen) |
| 15 | WS-SEN-P1 | WS-PLT-P2 | `sentinel_run_category_utilization` result shape | interface | Yes | Spec Sentinel §C.3 | Immediately (Sentinel §C.3) |
| 16 | WS-SEN-P1 | WS-AGT-P1 | `SentinelResult@1` envelope fields (SC §10.2) | interface | Yes | Spec SC §10.2 | Immediately (SC §10.2) |
| 17 | WS-SEN-P2 | WS-UI-P1 | Published HTTP JSON Schemas for `/workspaces/*` responses | interface | Yes | UI codes against current response shapes and Doc 2 §6; WS-SEN-P2 reconciles (same developer) | Immediately; schemas binding after WS-SEN-P2 merges (D5 am) |
| 18 | WS-SEN-P2 | WS-UI-P2 | Workspace view routes conformant | implementation | Yes (UI layout) | — | Layout immediately; wiring after WS-SEN-P2 merge (D5 am) |
| 19 | WS-PLT-P1 | WS-CAT-P3 | `ActionCtx` shape and executor registration (`registerExecutor(action, fn)`) | interface → integration | Yes | Spec SC §13.6; CAT unit tests call executors with a hand-built ctx | Executors once the WS-PLT-P1 contract commit is approved in its Draft PR (D2); integration after merge (D4 am) |
| 20 | WS-PLT-P1 | WS-JON-P2 | `createProposal`, `confirmAndExecute`, `issueIntentToken`, `executeT1` semantics | implementation | Yes (JON-P2 UI-block rendering) | — | After WS-PLT-P1 merge (D4 am) |
| 21 | WS-PLT-P1 | WS-UI-P1 | `POST /api/v1/proposals/:id/confirm`, `…/decline`, `POST /api/v1/actions` (T1) | interface | Yes | Contract in Doc 2 §6 | Immediately against Doc 2 §6; confirmed by the WS-PLT-P1 contract commit (D2) |
| 22 | WS-PLT-P1 | WS-UI-P3 | Same endpoints implemented | implementation | Yes | — | After WS-PLT-P1 merge (D4 am) |
| 23 | WS-PLT-P1 | WS-FND-P5 | No client depends on legacy `/goals`, `/budget` writes | implementation | No | — | After WS-PLT-P1 merge |
| 24 | WS-PLT-P2 | WS-CAT-P2 | `profile.upsertAccounts(userId, accounts)`, `profile.recordBalances(userId, balances)` | interface | Yes | Signatures fixed in `WS-PLT-P2` §5; CAT calls them through `platform/profile.js` exports | Immediately (signatures in WS-PLT-P2 §5) |
| 25 | WS-PLT-P2 | WS-UI-P2 | `/alerts`, `/notifications`, `/bills`, `/preferences`, `/profile` routes | implementation | Yes (layout) | — | Layout immediately; wiring after WS-PLT-P2 merge (end D4) |
| 26 | WS-CAT-P2 | WS-FND-P4 | `CanonicalBatch@1` (SC §17.7) and `MappingProfile@1` `demo-bank-v1` | interface | Yes | Spec contract; FND produces files, CAT validates them | Immediately against SC §17.7 (frozen spec); WS-CAT-P2 validates the files (D5) |
| 27 | WS-CAT-P2 | WS-UI-P2 | `POST /api/v1/demo/ingest` | implementation | Yes | — | After WS-CAT-P2 merge (end D5) |
| 28 | WS-CAT-P2 | WS-FND-P5 | Legacy `/transactions/import` unused | implementation | No | — | After WS-CAT-P2 merge |
| 29 | WS-CAT-P3 | WS-JON-P2 | `listTransactions`, `addReviewItem`, correction executors | implementation | Yes | — | Interface immediately; integration after WS-CAT-P3 merge (end D6) |
| 30 | WS-CAT-P3 | WS-UI-P2 | `GET /transactions`, `/review-queue`; corrections via `/actions` and `/proposals` | implementation | Yes | — | After WS-CAT-P3 merge (end D6) |
| 31 | WS-AGT-P1 | WS-JON-P1 | Specialists still return `SpecialistResponse@1` via `invoke(packet, {signal})` | interface | Yes | Contract unchanged from today | Immediately (contract unchanged) |
| 32 | WS-JON-P1 | WS-UI-P3 | SSE `ChatResponse@1` blocks (John §C.2) on `POST /api/v1/chat/messages` | interface → implementation | Yes | UI builds against the John §C.2 schema | Once the WS-JON-P1 contract commit is approved in its Draft PR (D1) |
| 33 | WS-JON-P1 | WS-FND-P5 | Chat no longer uses `routes/coach.js` | implementation | No | — | After WS-JON-P1 merge |
| 34 | WS-JON-P2 | WS-UI-P3 | Cards, chips, questions, Undo blocks emitted | implementation | Yes | — | After WS-JON-P2 merge (D7 am) |
| 35 | WS-UI-P1 | WS-FND-P5 | Views moved to `src/workspaces/**`; no imports from legacy folders | implementation | No | — | After WS-UI-P1 merge |
| 36 | WS-UI-P2 | WS-FND-P5 | Analyser, Subscriptions, Statement Import, Onboarding, Settings off legacy endpoints | implementation | No | — | After WS-UI-P2 merge |
| 37 | WS-UI-P3 | WS-FND-P5 | John view off `geminiService` | implementation | No | — | After WS-UI-P3 merge |
| 38 | WS-CAT-P3, WS-SEN-P2, WS-PLT-P2, WS-AGT-P2, WS-JON-P2, WS-UI-P2, WS-UI-P3, WS-FND-P4, WS-FND-P5 | WS-FND-P6 | Everything merged | integration | No | Tiered acceptance (roadmap §5) lets Tier 1 pass without Tier 2/3 | All listed plans merged (D8) |
| 39 | WS-AGT-P3 | WS-FND-P6 (live suite) | Live evaluation results | integration | No | Qwen details arrive D3; stand-in OpenAI-compatible provider if unavailable (D-PLAN-12); fake-provider E2E always runs | After WS-AGT-P3 run (D9) |
| 40 | Decision U-2 | WS-AGT-P3 | Qwen endpoint details | decision | No | Details promised for D3 (decided); stand-in provider if unavailable | D3 |
| 41 | Decision C-1 | WS-AGT-P1, WS-JON-P1 | Confirmation that LLM layer follows specs | decision | Yes | Decided 2026-10-13: LLM layer per specs | Decided |
| 42 | Decision A-ARCH | all | Approval of `docs/prototype-design` | decision | Yes | Decided 2026-10-13: design approved | Decided |
| 43 | WS-PLT-P1 | WS-FND-P4 | Canonical action names and `createProposal`/`confirmAndExecute` used by the seed script | interface | Yes | Seed calls an internal `seedAction()` wrapper; switched to the final functions when PLT-P1 merges | Once the WS-PLT-P1 contract commit is approved (D2); final when WS-PLT-P1 merges (D4 am) |
| 44 | WS-JON-P1 | WS-AGT-P3 | `POST /chat/messages` for end-to-end live cases | interface | Yes | Specialist-level live cases first | After WS-JON-P1 merge (D4 am) |
| 45 | WS-AGT-P2 | WS-JON-P2 | Atlas `HANDLE_PEER_FINDING` and Iris `PeerHint@1` for the dependency-edge and parallel tests | interface | Yes | Use fixture specialist responses until AGT-P2 merges | Immediately with fixture responses |
| 46 | Decision D-PLAN-2 | WS-FND-P2 | Keep physical table names on `main` (Doc 2 §3 names are logical) | decision | Yes (default: keep) | Rename migration in WS-FND-P5 only if vetoed | Decided 2026-10-13: keep names |

| 47 *(added 2026-10-13)* | Decision D-PLAN-3 (repository starts from the source baseline) | **all 21 plans** | Source-baseline import commit (`fc0981d`) on `main` | implementation | No | None — without the code there is nothing to modify | After the import is merged (before D1) |

## 3. Acyclicity
The graph in `roadmap.md` §3 was checked: every edge points from a plan to a plan that does not (transitively) depend back on it. Interface edges (#4, #7–#9, #14–#17, #19, #21, #24, #26, #31, #32, #43–#45) are listed so that implementation can start in parallel; none of them creates a cycle with implementation edges.

## 4. Unblocking rules
1. A dependent plan never waits on an **interface** dependency once the contract is in `docs/specifications`, `docs/prototype-design`, a merged schema file, or a contract commit approved in the producer's Draft PR (D-PLAN-4: plans are never split, so early contracts are reviewed inside the producer's single PR).
2. If an **implementation** source is more than **half a day** late (D-PLAN-7), its owner publishes a contract-faithful stub (behind the same export) so dependants can integrate; the stub is tracked as a known limitation and removed by the owner's plan.
3. Migration-range fallback (#5, #6): a dependent may add its own migration in its range for a missing table (`110_ingestion.sql`, `300_intent_tokens.sql`, always `CREATE TABLE IF NOT EXISTS`); WS-FND reconciles duplicates in the next migration.
4. Decisions (#40–#42, #46) are escalated at the daily stand-up; the default listed is applied if no answer arrives by the stated day.
