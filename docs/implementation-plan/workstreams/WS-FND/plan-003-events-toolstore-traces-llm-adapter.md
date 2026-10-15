# WS-FND · Plan 3 — Event Dispatcher, Tool-Result Store, Traces and LLM Adapter

> **Local plan number: Plan 3 of 6 in WS-FND** · Unique ID: **`WS-FND-P3`** · Branch: `ws-fnd/p3-platform-plumbing`

> **Repository context (updated 2026-10-13).** Work happens in `https://github.com/Kathir-M-03/FINNMIN-JFK-John` on a branch created from `main`, following [`development-workflow.md`](../../../development-workflow.md). Files marked *Modify*, *Keep*, *Delete*, *Move* or `[E]` belong to the **source baseline** — the application code described in [`baseline.md`](../../baseline.md). Per team decision **D-PLAN-3** (2026-10-13) the repository starts from that code at commit `fc0981d`; **until the source-baseline import commit is on `main` this plan cannot start** (one-time import by the team lead — see [`repository-migration-notes.md`](../../../repository-migration-notes.md) §5). One plan = one branch = one PR (D-PLAN-4). Statements below about what exists "on `main`" or "today" describe the source baseline, not the new repository's `main`.

## 1. Plan identity
| Field | Value |
| --- | --- |
| Workstream / local number / ID | WS-FND / **Plan 3** / `WS-FND-P3` |
| Owner / subagent | Dev A — Integration Lead / WS-FND subagent |
| Objective | Build the shared plumbing every component needs and the source baseline lacks: outbox event append + dispatcher with retries and dead letter (G-3), persistent tool results with ownership checks (G-4), snapshot freshness check, trace spans, and the **runtime LLM adapter** (G-1) with an OpenAI-compatible provider (Qwen prototype) and a test-only fake |
| Expected outcome | `events.append/subscribe`, dispatcher loop, `gateway.getResult/verifyResultOwnership`, `snapshot.assertCurrent`, `trace.span`, `llm.complete` exported with JSDoc and tests; `/api/v1/health` reports DB, breaker and dead letters |
| Size | ~1–1.5 days; one PR with four commits (envelope schemas + events, gateway store + snapshot, traces + health, LLM adapter). Open it as a Draft once the schema commit exists so consumers can review the envelope schemas early |

## 2. Dependencies
| Type | Source | Needed | Early start |
| --- | --- | --- | --- |
| implementation | WS-FND-P2 | `event_deliveries`, `jobs`, `jobs_dead_letter`, `tool_results`, `traces` tables | No |
| decision | C-1 | LLM layer follows specs | Default applied |
| decision | U-2 | Real Qwen endpoint | **Not needed** — adapter built and tested with the fake provider; Qwen details arrive on D3 (live smoke then) |

**Parallel with:** WS-FND-P4, WS-CAT-P1, WS-SEN-P1. Interface consumers (WS-CAT-P1, WS-SEN-P1, WS-PLT-P1/P2, WS-AGT-P1, WS-JON-P1) code against §5 signatures before merge.
**Unblocks:** WS-PLT-P2, WS-AGT-P1, WS-JON-P1 (implementation); WS-FND-P5.

## 3. Scope
**In:** `platform/events/**`, gateway persistence, `snapshot.assertCurrent`, `shared/trace.js`, `platform/llm/**`, `routes/v1/system.js` health, `.env.example` keys, JSON-schema validation helper with Ajv.
**Out:** handlers (Budget Monitor = WS-PLT-P2, John version events = WS-JON-P1); prompts (WS-AGT/WS-JON); Gemini provider (production, stub only); live-model evaluation (WS-AGT-P3).

## 4. Files and ownership
| File | Action | Purpose | Ownership | Shared-file risk |
| --- | --- | --- | --- | --- |
| `backend/src/platform/events/index.js` | Create | `append`, `subscribe`, `startDispatcher`, `stopDispatcher`, `drainOnce` (tests) | WS-FND | Low |
| `backend/src/platform/events/jobs.js` | Create | `enqueueJob`, `registerJob`, scheduler tick, locks, dead letter | WS-FND | Low |
| `backend/src/platform/gateway.js` | Modify | Persist each `SentinelResult@1` in `tool_results`; `getResult`, `verifyResultOwnership`; keep `GatewaySession` API | WS-FND | Medium — used by agents; API additive |
| `backend/src/platform/snapshot.js` | Modify | Add `assertCurrent(snapshot, conn)` throwing `DATA_STALE` | WS-FND | Medium — additive |
| `backend/src/shared/trace.js` | Create | `span(ctx, component, name, fn)` writing `traces` rows; `newTraceId()` | WS-FND | Low |
| `backend/src/shared/contracts/schemas/**` + `schemas/index.js` | Create | Ajv instance; `validate(schemaName, value)`; SC schemas TaskPacket@1, SpecialistResponse@1, SentinelResult@1, DataQuality@1, Proposal@1, ActionRequest@1, ActionResult@1, Event@1, ErrorBody@1 | WS-FND (schema commit reviewed by consumers in the Draft PR) | Medium |
| `backend/src/platform/llm/index.js` | Create | `complete()`, provider registry, breaker, timeout, usage tracing | WS-FND | Low |
| `backend/src/platform/llm/providers/openai-compat.js` | Create | `POST {LLM_BASE_URL}/chat/completions` via global `fetch`; `response_format` JSON schema when supported, else JSON-mode + local validation | WS-FND | Low |
| `backend/src/platform/llm/providers/fake.js` | Create | Fixture-driven, **refuses unless `NODE_ENV==='test'`** | WS-FND | Low |
| `backend/src/platform/llm/providers/gemini-vertex.js` | Create (stub) | Throws `NOT_IMPLEMENTED`; documents production path (D-008) | WS-FND | Low |
| `backend/src/routes/v1/system.js` | Modify | `GET /api/v1/health` `{status, db, llm:{provider, breaker}, events:{undelivered, dead_letters}}` (no auth, no user data) | WS-FND | Low |
| `backend/src/index.js` | Modify | Start dispatcher + scheduler when listening (not when required by tests) | WS-FND | Low |
| `backend/.env.example` | Modify | `LLM_PROVIDER=openai_compat`, `LLM_BASE_URL=`, `LLM_API_KEY=`, `LLM_MODEL_ROUTER=`, `LLM_MODEL_SPECIALIST=`, `LLM_MODEL_SYNTHESIS=`, `LLM_TIMEOUT_MS=6000`, `LLM_JSON_MODE=schema` (or `json`, `none`) | WS-FND | Low |
| `backend/package.json` | Modify | Add `ajv`, `ajv-formats`, `decimal.js` (SC §3) | WS-FND | Medium |
| `backend/test/platform/*.test.js`, `backend/test/fixtures/llm/fnd/*` | Create | Tests and fake fixtures | WS-FND | Low |

## 5. Interfaces and contracts
```js
// events (Doc 2 §5.1; SC §14.1 Event@1)
events.append(tx, userId, type, payload) -> eventId     // inserts outbox_events inside caller's transaction; validates Event@1
events.subscribe(type, handlerName, async fn(event))    // idempotent per (event_id, handlerName)
events.startDispatcher({intervalMs=250}); events.drainOnce() -> {delivered, failed}
// retries: 3 attempts at 1 s / 5 s / 30 s, then status DEAD (RL-2); on startup undelivered rows are re-delivered (RL-6)
jobs.registerJob(kind, async fn(job)); jobs.enqueueJob(kind, {userId, runAt, payload}); jobs.scheduleDaily(kind, 'HH:MM', tz='Asia/Kolkata')

// gateway (additive)
gateway.getResult(toolResultId, session) -> SentinelResult@1          // NOT_FOUND for other users
gateway.verifyResultOwnership(ids, requestId, session) -> boolean
// snapshot
snapshot.assertCurrent(snapshot, conn)   // throws {code:'DATA_STALE'} if any version counter moved

// trace
trace.span(ctx, component, name, fn) -> fn's result   // ctx = {traceId, userId, parentSpanId}

// LLM adapter (SC §17.8; Doc 2 §5.5)
llm.complete({modelClass:'ROUTER'|'SPECIALIST'|'SYNTHESIS', system, messages, jsonSchema?, maxTokens, temperature=0,
              timeoutMs, signal, traceId}) -> {json?, text?, usage:{input_tokens, output_tokens}, model, provider}
// errors: LLM_TIMEOUT, LLM_UNAVAILABLE (breaker open), LLM_SCHEMA_VIOLATION (json fails jsonSchema), LLM_CONSENT_REQUIRED (caller passes session.consent=false)
// breaker: opens after 5 failures in 60 s for 60 s; half-open single probe (RL-3)
```
- Runtime model is **configuration**, never code: model IDs come only from `LLM_MODEL_*`. The coding model a developer uses is irrelevant to this contract.
- The adapter logs `usage` and duration into `traces`; it never logs prompts in production mode (only hashes); test mode may log full prompts to `backend/test/.tmp`.

## 6. Implementation steps
1. Add Ajv/decimal.js; create `schemas/index.js` loading JSON files; port each SC schema; contract test validates the SC §7.x example payloads (from Doc 2 §7) against them.
2. `events/index.js`: `append` uses the existing `outbox_events` table (columns verified in `000_baseline.sql`; add missing columns via `012_outbox_columns.js` migration if needed). Dispatcher: select undelivered events, fan out to subscribed handlers, record `event_deliveries`.
3. `jobs.js`: lock with `locked_until`; dead-letter after 3 failures; daily scheduling in IST.
4. Gateway: after each successful `callSentinel`, insert into `tool_results`; keep in-memory map as a request cache; add `getResult`/`verifyResultOwnership`.
5. `snapshot.assertCurrent` using `currentVersions(userId)` compared with `snapshot.versions`.
6. `trace.span`; wire into gateway calls and LLM calls.
7. LLM adapter: provider selection by `LLM_PROVIDER`; `openai-compat` builds `{model, messages, temperature, max_tokens, response_format}`; parses `choices[0].message.content`; strips code fences; JSON-parses; validates against `jsonSchema` with Ajv; one local retry on parse failure is **not** done here (runners own repair).
8. Fake provider: fixtures keyed by `(modelClass, sha256(system+last user message))` or by an explicit `fixtureId` passed in `messages[0].meta` for tests; missing fixture → `LLM_UNAVAILABLE` (so fallbacks are testable).
9. Health route; start dispatcher/scheduler only under `require.main === module` (and in Electron's boot path).
10. Live smoke once Qwen details arrive (D3) — or with the stand-in provider (D-PLAN-12): `node backend/scripts/llm-smoke.js` sends one JSON-schema request; not part of CI.

## 7. Edge cases
| Case | Handling |
| --- | --- |
| Handler throws once then succeeds | Retry schedule; `attempts` incremented; delivered once |
| Handler not idempotent | Contract: handlers receive `event_id`; WS-PLT/WS-JON tests must assert re-delivery is harmless |
| Event appended in a transaction that rolls back | Outbox row rolls back too → no delivery (tested) |
| Provider returns non-JSON or prose around JSON | Strip fences; if still invalid → `LLM_SCHEMA_VIOLATION` |
| Provider lacks `response_format` JSON schema | `LLM_JSON_MODE=json` or `none` → prompt-level instruction + Ajv validation |
| `fake` selected outside tests | Startup error `FAKE_PROVIDER_FORBIDDEN` |
| `LLM_API_KEY` missing with openai_compat | Health shows `llm: unconfigured`; chat degrades (WS-JON) |
| Abort signal fires | `fetch` aborted; `LLM_TIMEOUT` |
| Tool result requested by another user | `NOT_FOUND` (no existence leak) |

## 8. Constraints
- Secrets only from env (S-1); the key never appears in logs, traces or errors.
- No module other than `platform/llm` may call an LLM HTTP endpoint (lint rule: grep for `chat/completions` outside it in CI).
- Additive changes only to `gateway.js` and `snapshot.js`; existing callers unchanged.

## 9. Test plan
| Test | Command |
| --- | --- |
| `test/platform/events.test.js` — append in tx, rollback, retries, dead letter, startup redelivery, per-handler idempotency | `npm --prefix backend test` |
| `test/platform/jobs.test.js` — lock, retry, dead letter, daily schedule computed in IST | same |
| `test/platform/gateway-store.test.js` — persistence, ownership, cross-user `NOT_FOUND` | same |
| `test/platform/snapshot-assert.test.js` | same |
| `test/platform/llm-adapter.test.js` — fake fixtures, schema violation, timeout via abort, breaker open/half-open, fake forbidden outside test, key redaction | same |
| `test/contracts/schemas.test.js` — Doc 2 §7 examples validate | same |
| `test/routes/health.test.js` | same |
| Live smoke (optional) | `node backend/scripts/llm-smoke.js` |

## 10. Acceptance criteria
**Plan:** all tests above green; health endpoint returns breaker and dead-letter counts; no regressions.
**Workstream:** platform plumbing ready for P4–P6.
**Integration:** G2 items "dispatcher delivers a test event exactly once per handler; dead-letter after 3 failures" and "`llm.complete` works with `fake` under test, refuses otherwise".

## 11. Risks and recovery
| Risk | Recovery |
| --- | --- |
| Qwen endpoint lacks JSON-schema mode | `LLM_JSON_MODE=json` path already built; runners validate locally |
| Dispatcher polling adds latency to alerts | 250 ms interval; `drainOnce()` callable synchronously after commit in the same process (`setImmediate`) |
| Ajv schemas diverge from SC | Contract tests on SC examples; schema commits need consumer approval in the Draft PR |

## 12. Assumptions and unresolved questions
- [D] U-2 / D-PLAN-11 / D-PLAN-12: Qwen key and model arrive on D3. The key lives only in each developer's local `backend/.env` and in a GitHub Actions secret for the manual live workflow — never committed. If Qwen is unavailable, a stand-in OpenAI-compatible provider is configured through the same env vars (`LLM_BASE_URL`, `LLM_MODEL_*`, `LLM_API_KEY`); no code change.
- [A] Node 22 global `fetch` is available in Electron 41's Node runtime (it is ≥ 22); verify in WS-FND-P5 desktop check.

## 13. Completion handoff
README template; list exported signatures, env vars added, fixture format for the fake provider (documented in `backend/test/fixtures/llm/README.md`). Next eligible: **WS-PLT-P2, WS-AGT-P1, WS-JON-P1** (implementation), WS-FND-P5 later.
