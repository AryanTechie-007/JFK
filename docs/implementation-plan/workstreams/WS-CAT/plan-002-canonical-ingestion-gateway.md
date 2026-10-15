# WS-CAT · Plan 2 — Canonical Ingestion Gateway

> **Local plan number: Plan 2 of 3 in WS-CAT** · Unique ID: **`WS-CAT-P2`** · Branch: `ws-cat/p2-canonical-ingestion`

> **Repository context (updated 2026-10-13).** Work happens in `https://github.com/Kathir-M-03/FINNMIN-JFK-John` on a branch created from `main`, following [`development-workflow.md`](../../../development-workflow.md). Files marked *Modify*, *Keep*, *Delete*, *Move* or `[E]` belong to the **source baseline** — the application code described in [`baseline.md`](../../baseline.md). Per team decision **D-PLAN-3** (2026-10-13) the repository starts from that code at commit `fc0981d`; **until the source-baseline import commit is on `main` this plan cannot start** (one-time import by the team lead — see [`repository-migration-notes.md`](../../../repository-migration-notes.md) §5). One plan = one branch = one PR (D-PLAN-4). Statements below about what exists "on `main`" or "today" describe the source baseline, not the new repository's `main`.

## 1. Plan identity
| Field | Value |
| --- | --- |
| Workstream / local number / ID | WS-CAT / **Plan 2** / `WS-CAT-P2` |
| Owner / subagent | Dev B — Data & Write-Path Engineer / WS-CAT subagent |
| Objective | Implement the Ingestion Gateway (SC §17.7, D-023, ADR-10): accept `CanonicalBatch@1` JSON and bank CSV via a `MappingProfile@1`, validate, record idempotent batches and row errors, upsert accounts/balances via Profile, and hand canonical rows to the categorizer (gap G-7). ISO 20022 camt.053/054 is specified for production; the prototype ships JSON + CSV and a documented adapter interface |
| Expected outcome | `platform/ingestion/` module; `POST /api/v1/demo/ingest` (only when `DEMO_CONTROLS=true`); existing `/ingest/batch` routes re-pointed through the gateway; demo batch loads twice with rows created once (P-AC-02) |
| Size | ~1 day |

## 2. Dependencies
| Type | Source | Needed | Early start |
| --- | --- | --- | --- |
| implementation | WS-CAT-P1 | Pipeline idempotency and chunk events | No |
| implementation | WS-FND-P2 | `ingestion_batches`, `ingestion_errors` | Yes — parser/validator first; fallback `110_ingestion.sql` (CREATE TABLE IF NOT EXISTS) in CAT range if FND-P2 slips — `100_*` is taken by WS-CAT-P1 |
| interface | WS-PLT-P2 | `profile.upsertAccounts(userId, accounts)`, `profile.recordBalances(userId, balances)` | Yes — call signatures; PLT implements |

**Parallel with:** WS-CAT-P3, WS-PLT-P2, WS-FND-P4.
**Unblocks:** WS-UI-P2 (demo loader), WS-FND-P4 (format validation), WS-FND-P5 (legacy import removal).

## 3. Scope
**In:** `CanonicalBatch@1` schema; CSV parser with `MappingProfile@1` (column map, date format, amount sign convention, debit/credit columns, encoding); validation with row-level error codes; batch idempotency key; chunked hand-off; demo route; re-pointing `/ingest/batch` and `/ingest/manual`; camt adapter interface stub.
**Out:** live bank connectivity; camt parser implementation (production); UI (WS-UI-P2).

## 4. Files and ownership
| File | Action | Purpose | Ownership | Shared-file risk |
| --- | --- | --- | --- | --- |
| `backend/src/platform/ingestion/index.js` | Create | `ingest({format, body, mappingProfileId?, idempotencyKey}, ctx)`, `getBatch(batchId, ctx)` | WS-CAT | Low |
| `backend/src/platform/ingestion/csv.js` | Create | RFC 4180 parser (no new dependency), mapping application, rupee-string → paise via `money.parseRupeesToMinor` | WS-CAT | Low |
| `backend/src/platform/ingestion/validate.js` | Create | Row checks: required fields, ISO date ≤ today+1, amount > 0 integer paise, direction, currency INR, known account ref | WS-CAT | Low |
| `backend/src/platform/ingestion/mapping-profiles/demo-bank-v1.json` | Create | Mapping for the demo CSV (shared with WS-FND-P4) | WS-CAT | Low |
| `backend/src/platform/ingestion/adapters/iso20022.js` | Create (stub) | Interface `toCanonical(xml) -> CanonicalBatch@1`; throws `NOT_IMPLEMENTED` | WS-CAT | Low |
| `backend/src/shared/contracts/schemas/CanonicalBatch@1.json`, `MappingProfile@1.json` | Create | Contract (first commit of this PR) | WS-CAT (FND reviews) | Medium |
| `backend/src/shared/money.js` | Modify (if missing) | `parseRupeesToMinor(str)` exact string parsing | WS-FND owns → PR reviewed by FND | Medium |
| `backend/src/routes/v1/ingest.js` | Modify | Route through gateway; add `POST /demo/ingest` guarded by `DEMO_CONTROLS` | WS-CAT | Low |
| `backend/test/ingestion/*.test.js`, `backend/test/fixtures/ingestion/*` | Create | Tests | WS-CAT | Low |

## 5. Interfaces and contracts
```js
ingestion.ingest({format:'CANONICAL_JSON'|'CSV', body, mappingProfileId?, idempotencyKey}, {userId, tenantId, traceId})
  -> {batchId, status:'ACCEPTED'|'DUPLICATE'|'REJECTED', counts:{received, accepted, rejected, duplicates}}
ingestion.getBatch(batchId, session) -> IngestionBatch & {errors:[{row_index, code, detail}]}
// Profile (WS-PLT-P2): profile.upsertAccounts(userId, [{account_ref, type, institution, masked_number}]) -> {account_ref → account_id}
//                      profile.recordBalances(userId, [{account_id, balance_minor, as_of, source:'BANK'}])
// Categorizer: categorizer.ingestBatch(canonicalBatch, {tenantId, idempotencyKey, traceId})
```
- HTTP: `POST /api/v1/demo/ingest` body `{format, body, mapping_profile_id?}` → `{batch_id, status}`; 404 when `DEMO_CONTROLS!=='true'` (S-16).
- Row error codes: `MISSING_FIELD`, `INVALID_DATE`, `INVALID_AMOUNT`, `UNKNOWN_ACCOUNT`, `UNSUPPORTED_CURRENCY`, `DUPLICATE_ROW`.

## 6. Implementation steps
1. Contract commit (first in this PR): `CanonicalBatch@1` (SC §17.7) and `MappingProfile@1` JSON Schemas + examples. WS-FND-P4 builds its seed files directly against SC §17.7 earlier; validate those files against the schemas here and report any mismatch to Dev A.
2. `money.parseRupeesToMinor` (if absent): strings like `"1,23,456.70"`, `"-250"`, `"0.1"`; reject >2 decimals.
3. CSV parser + mapping; canonical conversion.
4. Validation; record `ingestion_batches` row (`UNIQUE(user_id, idempotency_key)` → second call returns `DUPLICATE` with the original batch ID) and `ingestion_errors`.
5. Accounts/balances via Profile interface; then `categorizer.ingestBatch` in chunks (P1 semantics).
6. Re-point `/ingest/batch` and `/ingest/manual` (manual becomes `ADD_MANUAL_TRANSACTION` via Action Service in WS-CAT-P3; keep current behaviour here).
7. Demo route with flag; update `routes-inventory.test.js` (FND reviews).
8. Tests; handoff.

## 7. Edge cases
| Case | Handling |
| --- | --- |
| Same file uploaded with a different idempotency key | Batch accepted; row-level dedupe (CAT-AC-03) prevents duplicates; counts report `duplicates` |
| CSV with BOM, CRLF, quoted commas | Parser handles; tests |
| Debit/credit in separate columns vs signed amount | Mapping option `amount_mode`: `SIGNED` or `SPLIT` |
| Indian grouping `1,23,456.70` | Parsed exactly |
| Future-dated rows | `INVALID_DATE` unless ≤ today+1 (bank posting lag) |
| Batch > 1 MB | 413 at HTTP layer; CLI loader for larger seeds |
| Profile interface not merged | Temporary internal call to existing `ensureDefaultAccount`, marked with `TODO(WS-PLT-P2)` and removed before WS-FND-P6 |

## 8. Constraints
- No floating-point parsing of money. Raw description stored as received (untrusted text) and never sent to an LLM.
- Demo route gated; never enabled by default.

## 9. Test plan
| Test | Command |
| --- | --- |
| `test/ingestion/csv.test.js` | `npm --prefix backend test` |
| `test/ingestion/validate.test.js` (each error code) | same |
| `test/ingestion/idempotency.test.js` (P-AC-02: load twice → rows once) | same |
| `test/ingestion/demo-route.test.js` (flag on/off) | same |
| `test/contracts/canonical-batch.test.js` | same |

## 10. Acceptance criteria
**Plan:** JSON + CSV ingest; idempotent; row errors reported; demo route gated; existing ingest routes still pass their tests.
**Workstream:** canonical entry point for all data.
**Integration:** G3 "ingest → categorization → event"; P-AC-02.

## 11. Risks and recovery
| Risk | Recovery |
| --- | --- |
| Mapping too narrow for future bank formats | Profiles are data; add new JSON profiles without code |
| Profile signatures change | Contract fixed in WS-PLT-P2 §5; any change is a contract commit approved by the consumer |

## 12. Assumptions and unresolved questions
- [A] Prototype ingests own synthetic data only (user decision); camt.053/054 parser is production scope.
- [A] One deployment per bank (D-021): `tenant_id` constant per deployment.

## 13. Completion handoff
README template; list schemas, error codes, demo route usage example. Next eligible: **WS-UI-P2** (demo loader), WS-FND-P4 validation, WS-FND-P5.
