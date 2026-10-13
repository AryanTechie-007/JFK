# Document 5 — Prototype Security and Reliability

**Principle:** build the safeguards that make the prototype's claims true (isolation, consent, exact money, no unauthorized writes, no duplicate changes); defer infrastructure the prototype cannot use (KMS, mTLS, RLS, SIEM).

## 1. Essential safeguards (built)

| # | Safeguard | Mechanism | Verified by |
| --- | --- | --- | --- |
| S-1 | Secrets never in frontend, logs or Git | LLM key and `JWT_SECRET` only in `backend/.env` (git-ignored); `.env.example` with placeholders; startup refuses to run without `JWT_SECRET`; logger redacts `authorization`, `api_key`, `password`, `description_raw`; Vite build scanned for the key string in CI | Test `secrets.test.js` greps `dist/` and logs for the configured key |
| S-2 | Authentication on every route | Existing JWT middleware on `/api/v1/*` except `/auth/*` and `/health`; Backend B's `x-user-id` header path is deleted | Route table test: each route without a token → 401 |
| S-3 | User-data isolation | Repository functions require `userId` from the session; every SQL statement filters `user_id`; foreign IDs → 404; tool results bound to request + user | Isolation suite with two seeded users (every GET/POST with the other user's IDs → 404/no data) |
| S-4 | No LLM-authorized writes | Specialists have no write tools (gateway allowlist); John's LLM output parsed only into router schema and synthesis text; proposals executed only with a user confirmation token (T2/T3) or a user-tap / rule-layer intent token (T1) | Tests: write-tool call → `FORBIDDEN`; typed "yes" never executes T2; router-only T1 → chip |
| S-5 | Deterministic re-validation | Action Service re-runs the Sentinel rule library on current state at creation and execution; base-version check | Tests per rule code; stale version → `REJECTED_STALE` |
| S-6 | Duplicate-change protection | `UNIQUE(user_id, idempotency_key)` on `action_ledger`; single-use tokens; `row_version` If-Match on categorization; ingestion idempotency keys | Double-submit tests return `DUPLICATE` with no second write |
| S-7 | Exact money | Integer paise; `money.parseRupeesToMinor` string parsing; `decimal.js` for ratios; half-even rounding; lint rule forbidding arithmetic on `*_minor` outside `shared/money` and Sentinel | Unit tests incl. ₹0.10 + ₹0.20 cases; golden totals |
| S-8 | Input validation | JSON Schema (Ajv) on every request body and every inter-module payload (`contracts.validate`); size limit 1 MB; message ≤ 2,000 chars | Contract tests |
| S-9 | Untrusted text handling | Merchant names sanitized (`[A-Za-z0-9 &.'-]`, ≤ 40) before reaching any LLM; raw descriptions and counterparty names never sent; prompts mark data fields; IDs emitted by an LLM must exist in the packet/results | Injection fixtures ("ignore previous instructions…", fake IDs) produce no tool call outside allowlist and no state change |
| S-10 | Data minimisation to the LLM provider | Packets carry aggregates and IDs only; no account numbers, balances in summaries, or user identifiers | Packet snapshot test asserts absent fields |
| S-11 | LLM consent | `preferences.llm_processing_consent`; when false, `/chat` returns `FORBIDDEN` with a consent prompt and no LLM call is made; workspaces work | Test with consent false counts zero adapter calls |
| S-12 | Read-only analytics | Sentinel uses a `query_only` connection | Test: write via Sentinel connection fails |
| S-13 | Immutable raw data and audit | Trigger aborts UPDATE/DELETE on `raw_transactions`; `classification_events` and `action_ledger` append-only | Tests |
| S-14 | Consistent persisted data | CHECK constraints (Doc 2 §3); foreign keys on; one transaction per action/chunk with counter + outbox; migrations versioned; startup integrity check (`PRAGMA integrity_check`, counters ≥ max row versions) | Startup test; forced-failure test leaves neither change nor event |
| S-15 | Rate limits (basic) | In-memory per-user token bucket: 20 chat messages/min, 30 proposals/hour, 60 actions/hour | Unit test |
| S-16 | Demo-only controls gated | `/api/v1/demo/*` exists only when `DEMO_CONTROLS=true` and responds 404 otherwise; UI labels them "Demo: bank feed simulator" | Test both settings |

## 2. Reliability

| # | Concern | Prototype behaviour |
| --- | --- | --- |
| RL-1 | Timeouts | Chat 20 s; router 4 s; specialist 8 s; LLM completion 6 s; Sentinel 3× p95 (0.9/3/6 s); action 5 s (SC §15.3) |
| RL-2 | Bounded retries | Router 1; specialist 1 (smaller packet); runner repair 1; synthesis regenerate 1; Sentinel 1 on `TIMEOUT`/`INTERNAL_ERROR`; event delivery 3 (1/5/30 s) then dead letter; ingestion chunk 3 (2/10/60 s) |
| RL-3 | Circuit breaker | LLM adapter opens after 5 failures in 60 s for 60 s; half-open probe; chat shows degraded notice |
| RL-4 | Unavailable dependencies | LLM down → workspaces, forms, alerts unaffected; Sentinel function failure → panel-level "Unavailable"; DB locked → retry 3× with 50 ms backoff (SQLite busy timeout 2 s) |
| RL-5 | Incomplete results | `PARTIAL` labels; never fill gaps from memory; conservative headline when confidence ≠ HIGH |
| RL-6 | Crash recovery | Committed chunks/actions survive; outbox re-delivers undelivered events at startup; job locks expire; chat turn persisted atomically with `client_message_id` idempotency |
| RL-7 | Stale data | Optimistic snapshot → `DATA_STALE` → one retry with a new snapshot |
| RL-8 | Observability (minimum) | `traces` table spans per request (route, tasks, tool calls, LLM usage, validation outcomes, proposal IDs); `/api/v1/health` shows DB, LLM breaker state, undelivered/dead-letter counts |

## 3. Deferred to production hardening
| Item | Reason deferred |
| --- | --- |
| Bank OIDC SSO, refresh-token rotation, httpOnly cookie sessions | Same claims as prototype JWT; no bank IdP available |
| Encryption at rest with KMS for descriptions/counterparty | SQLite file on a laptop; production uses Postgres + KMS (Categorizer §H) |
| PostgreSQL RLS | Repository scoping already enforced and tested |
| mTLS/HMAC bank ingestion endpoint | No external bank in the prototype |
| Persistent, distributed rate limiting | Single process |
| SIEM/trace export, operator break-glass | No operators |
| Data-retention jobs and legal terms (O-1, O-2) | Counsel-dependent |
| LLM vendor data-processing agreement (Gemini Enterprise) | Production procurement |

## 4. Prototype data rules
- Use synthetic data or the team's own consented data only; never commit real statements; `seed/dataset/*.json` contains synthetic merchants and masked account numbers.
- Delete `finmate.db` files from the repository; add to `.gitignore`.
