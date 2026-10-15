# WS-JON · Plan 1 — LLM Router Fallback, Grounded Synthesis, Streaming and Consent

> **Local plan number: Plan 1 of 2 in WS-JON** · Unique ID: **`WS-JON-P1`** · Branch: `ws-jon/p1-router-synthesis-streaming`

> **Repository context (updated 2026-10-13).** Work happens in `https://github.com/Kathir-M-03/FINNMIN-JFK-John` on a branch created from `main`, following [`development-workflow.md`](../../../development-workflow.md). Files marked *Modify*, *Keep*, *Delete*, *Move* or `[E]` belong to the **source baseline** — the application code described in [`baseline.md`](../../baseline.md). Per team decision **D-PLAN-3** (2026-10-13) the repository starts from that code at commit `fc0981d`; **until the source-baseline import commit is on `main` this plan cannot start** (one-time import by the team lead — see [`repository-migration-notes.md`](../../../repository-migration-notes.md) §5). One plan = one branch = one PR (D-PLAN-4). Statements below about what exists "on `main`" or "today" describe the source baseline, not the new repository's `main`.

## 1. Plan identity
| Field | Value |
| --- | --- |
| Workstream / local number / ID | WS-JON — John Orchestrator & Chat / **Plan 1** / `WS-JON-P1` |
| Owner / subagent | Dev C — AI Engineer / WS-JON subagent |
| Objective | Turn `backend/src/agents/john/index.js` (deterministic regex router + templates) into the spec'd orchestrator: rules router first, LLM router fallback with `RouterOutput@1`; parallel specialist dispatch; deterministic validation; LLM synthesis bound by the grounding gate with one regenerate and a deterministic fallback; consent gate; SSE `POST /api/v1/chat/messages`; threads, turns and rolling summaries (gaps G-1, G-11) |
| Expected outcome | `john.handleMessage(req, session, emit)`, `john.onVersionEvent(event)`; SSE blocks `TEXT`, `NOTICE`, `LINK`, `QUESTION` (cards/chips/undo in P2); 0 ungrounded digits on ≥ 40 fake cases |
| Size | ~1.5 days |

## 2. Dependencies
| Type | Source | Needed | Early start |
| --- | --- | --- | --- |
| implementation | WS-FND-P3 | `llm.complete` (fake), gateway, traces, events | Yes — against local fake |
| interface | WS-AGT-P1 | Specialists keep `invoke(packet, {signal})` → `SpecialistResponse@1` | Yes |
| decision | C-1 | LLM per specs | Default applied |

**Parallel with:** WS-AGT-P1/P2, WS-PLT-P1/P2, WS-CAT-P2/P3.
**Unblocks:** WS-JON-P2; WS-UI-P3 (SSE contract); WS-FND-P5 (coach route removal); WS-AGT-P3 chat cases (interface).

## 3. Scope
**In:** lifecycle John §B.2 steps 1–14 (except proposal/correction specifics → P2); routing rules file `routing/routing-rules.json` with entity extractors and ≥ 100 labelled phrasings; LLM router fallback (modelClass ROUTER, 4 s, 1 retry); packet building with context budgets and data minimisation; parallel dispatch with deadlines (8 s each, 20 s total); validation of specialist responses (John §B.6); conflict rules (§B.7) for the deterministic subset; synthesis (modelClass SYNTHESIS) with placeholders → grounding binder → `findUnboundDigits` gate → 1 regenerate → deterministic template fallback; direct answers (health overview, health score via `sentinel_compute_health_score`, greetings, refusals for money movement/investment/credit/tax); consent gate (S-11); rate limit 20 msgs/min; SSE route; `GET /chat/threads`, `/chat/threads/:id`; rolling summary (John §G.4); `client_message_id` idempotency; `onVersionEvent` invalidation; existing `POST /chat` kept as a non-streaming wrapper until WS-UI-P3 switches.
**Out:** proposal cards, T1 rule detection, corrections in chat, arbitration flag, dependency edge (P2); memory-fact injection into packets (deferred per Doc 4 §1 — existing memory endpoints stay as-is).

## 4. Files and ownership
| File | Action | Purpose | Ownership | Shared-file risk |
| --- | --- | --- | --- | --- |
| `backend/src/agents/john/index.js` | Modify | `handleMessage`, `onVersionEvent`; keep `handleChat` wrapper | WS-JON | Medium |
| `backend/src/agents/john/{router,packets,dispatch,validate,synthesis,direct,threads,summary,consent}.js` | Create | Modules per John §K.1 | WS-JON | Low |
| `backend/src/agents/john/routing/routing-rules.json` | Create | Ordered rules + extractors | WS-JON | Low |
| `backend/src/agents/john/prompts/{router,synthesis}.v1.md` | Create | Prompts | WS-JON | Low |
| `backend/src/shared/contracts/grounding.js` | Modify | `bind(text, sources)` with Indian grouping; `check(text)` | WS-JON | Medium — used by agents runner post-checks |
| `backend/src/shared/contracts/schemas/{ChatRequest@1,ChatResponse@1,RouterOutput@1}.json` | Create | Contracts (UI reviews ChatResponse) | WS-JON | Medium |
| `backend/src/routes/v1/chat.js` | Modify | `POST /chat/messages` (SSE), threads routes, `POST /chat` wrapper | WS-JON | Low |
| `backend/src/db/migrations/500_chat_columns.sql` | Create (if needed) | `client_message_id` unique per thread, block JSON column | WS-JON | Low |
| `backend/test/john/*.test.js`, `backend/test/fixtures/llm/john/**` | Create | Tests and fakes | WS-JON | Low |

## 5. Interfaces and contracts
```js
john.handleMessage(ChatRequest@1, session, emit) -> ChatResponse@1     // emit(block) streams SSE `block` events, then `done`
john.onVersionEvent(Event@1)                                           // categorization.updated, plan.changed → invalidate caches/summaries
```
- SSE: `event: block` `data: {type:'TEXT'|'NOTICE'|'LINK'|'QUESTION'|'CARD'|'CHIP'|'UNDO', …}`; final `event: done` `data: {turn_id, trace_id, degraded:boolean}` (John §C.2).
- Consent false → HTTP 403 `{code:'LLM_CONSENT_REQUIRED'}` with a NOTICE block payload; **zero** adapter calls (spy-tested).
- LLM budget per request ≤ 6 completions (router + specialists + synthesis + 1 regenerate).
- Rendering: numbers only via placeholders `{{trs_x:/data/path|inr}}` bound to tool results of **this request** (`gateway.verifyResultOwnership`).

## 6. Implementation steps
1. Contract commit first: ChatRequest/ChatResponse/RouterOutput schemas. Open this PR as a Draft on D1 and get Dev D's (WS-UI) approval of that commit before continuing.
2. Routing: convert current regex routes into `routing-rules.json`; write ≥ 100 labelled phrasings test; rules confident → no LLM call.
3. LLM router fallback with schema validation; unknown → clarifying QUESTION.
4. Packet builder (TaskPacket@1) with minimisation; dispatch in parallel with AbortController deadlines.
5. Validation (John §B.6) of each response; conflict rules subset.
6. Synthesis + grounding gate + regenerate + deterministic fallback (existing templates).
7. Direct answers incl. health score through Sentinel (P-AC-12).
8. Consent gate, rate limit, threads, rolling summary (summarise after N turns with SYNTHESIS model; fallback: last-N turns), `client_message_id` idempotency, turn persisted atomically.
9. SSE route; keep `POST /chat` wrapper; `onVersionEvent` subscription.
10. Fake-LLM integration tests (≥ 40 cases), degraded mode (LLM down → deterministic answer + NOTICE).

## 7. Edge cases
| Case | Handling |
| --- | --- |
| Message > 2,000 chars | 400 INVALID_INPUT |
| Same `client_message_id` resent | Return stored turn; no second dispatch |
| A specialist times out | Partial answer with PARTIAL label; others continue |
| Synthesis invents a number | Gate fails → regenerate → fallback template |
| Prompt injection in user text | Router output schema only; IDs validated; no tool outside allowlist |
| Out-of-scope request (transfer money, stock tips) | Refusal per John §B.11 |
| Client disconnects mid-stream | Abort dispatch; turn stored as `CANCELLED` |
| Version event during request | Request completes on its snapshot; next request uses new snapshot |

## 8. Constraints
- John performs no arithmetic, categorization or execution; only Action Service (P2) writes.
- Only `platform/llm` talks to providers. John's own tables only.

## 9. Test plan
| Test | Command |
| --- | --- |
| `test/john/routing.test.js` (≥ 100 phrasings) | `npm --prefix backend test` |
| `test/john/router-llm.test.js` | same |
| `test/john/validation.test.js` (each §B.6 check) | same |
| `test/john/grounding.test.js` (Indian grouping, unbound digits) | same |
| `test/john/consent.test.js` (0 adapter calls) | same |
| `test/john/sse.test.js` (block order, done, disconnect) | same |
| `test/john/threads-summary.test.js` | same |
| `test/integration/chat-single.test.js`, `chat-parallel.test.js`, `chat-degraded.test.js` | same |

## 10. Acceptance criteria
**Plan:** all tests green; ≥ 40 fake cases with 0 ungrounded digits; consent and degraded modes verified.
**Workstream:** chat backbone ready for P2.
**Integration:** G4 (single, parallel, consent off); P-AC-12, P-AC-14, P-AC-17 (fake part).

## 11. Risks and recovery
| Risk | Recovery |
| --- | --- |
| Grounding binder too strict (dates, counts) | Allow-list for non-money tokens per John §B.12 (dates, ordinals in placeholders) |
| Dev C overloaded (owns WS-AGT and WS-JON) | WS-JON runs first (critical path); Dev A reviews in D5–D7 slack; contingency in `workstream-assignments.md` §2.3 |

## 12. Assumptions and unresolved questions
- [A] Memory facts not injected into packets in the prototype (Doc 4 §1 "Defer").
- [A] Four-developer allocation (`workstream-assignments.md` §2).

## 13. Completion handoff
README template; SSE example transcript; routing accuracy; fake-case grounding stats. Next eligible: **WS-JON-P2, WS-UI-P3**, WS-FND-P5 (coach route removal).
