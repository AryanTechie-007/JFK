# WS-FND · Plan 6 — End-to-End Suites and Acceptance Run

> **Local plan number: Plan 6 of 6 in WS-FND** · Unique ID: **`WS-FND-P6`** · Branch: `ws-fnd/p6-e2e-acceptance`

> **Repository context (updated 2026-10-13).** Work happens in `https://github.com/Kathir-M-03/FINNMIN-JFK-John` on a branch created from `main`, following [`development-workflow.md`](../../../development-workflow.md). Files marked *Modify*, *Keep*, *Delete*, *Move* or `[E]` belong to the **source baseline** — the application code described in [`baseline.md`](../../baseline.md). Per team decision **D-PLAN-3** (2026-10-13) the repository starts from that code at commit `fc0981d`; **until the source-baseline import commit is on `main` this plan cannot start** (one-time import by the team lead — see [`repository-migration-notes.md`](../../../repository-migration-notes.md) §5). One plan = one branch = one PR (D-PLAN-4). Statements below about what exists "on `main`" or "today" describe the source baseline, not the new repository's `main`.

## 1. Plan identity
| Field | Value |
| --- | --- |
| Workstream / local number / ID | WS-FND / **Plan 6** / `WS-FND-P6` |
| Owner / subagent | Dev A — Integration Lead / WS-FND subagent; all owners on bug-fix duty |
| Objective | Prove the integrated prototype: demo-journey E2E on the fake provider, security suite S-1…S-16, failure injection, restart persistence, live-model suite (Qwen from D3, or the agreed stand-in provider), and the signed acceptance checklist P-AC-01…20 |
| Expected outcome | `backend/test/e2e/**` and `backend/test/security/**` green in CI; `docs/implementation-plan/reports/acceptance-run.md` with evidence per criterion |
| Size | ~1 day + fix cycle |

## 2. Dependencies
| Type | Source | Needed | Early start |
| --- | --- | --- | --- |
| integration | WS-FND-P4, WS-FND-P5, WS-CAT-P3, WS-SEN-P2, WS-PLT-P2, WS-AGT-P2, WS-JON-P2, WS-UI-P2, WS-UI-P3 | All merged | Test scaffolding can be written from D4 against merged parts |
| integration | WS-AGT-P3 | Live evaluation results | Live part needs Qwen (details D3) or the stand-in provider (D-PLAN-12); fake-provider part runs regardless |

**Unblocks:** G6, G7 sign-off.

## 3. Scope
**In:** E2E API tests mirroring Doc 6 §5 steps 1–10; security suite; failure injection; restart test; acceptance report; removal of temporary stubs/`todo` markers left by earlier plans; oxlint made blocking.
**Out:** new features; UI automation beyond a scripted manual checklist (UI acceptance P-AC-20 is a recorded manual walkthrough).

## 4. Files and ownership
| File | Action | Purpose | Ownership | Shared-file risk |
| --- | --- | --- | --- | --- |
| `backend/test/e2e/demo-journey.test.js` | Create | Steps 1–10 over HTTP with fake LLM fixtures | WS-FND | Low |
| `backend/test/fixtures/llm/e2e/**` | Create | Fake router/specialist/synthesis outputs for the journey | WS-FND (AGT/JON review) | Low |
| `backend/test/security/s01…s16-*.test.js` | Create | One file per safeguard (Doc 5 §1) | WS-FND | Low |
| `backend/test/reliability/failure-injection.test.js` | Create | LLM down, Sentinel throws, DB write failure, stale snapshot, duplicate submit, expired proposal | WS-FND | Low |
| `backend/test/reliability/restart.test.js` | Create | Spawn server, act, kill, respawn, assert state + outbox redelivery | WS-FND | Low |
| `backend/test/live/*.live.js` | Create/extend | Uses WS-AGT-P3 eval set with real provider; excluded from CI | WS-FND + WS-AGT | Low |
| `docs/implementation-plan/reports/acceptance-run.md` | Create | Evidence table P-AC-01…20, G6 results | WS-FND | Low |
| `.github/workflows/ci.yml` | Modify | oxlint blocking; e2e + security jobs | WS-FND | Low |
| `.github/workflows/live.yml` | Create | Manual `workflow_dispatch` with secrets for the live suite | WS-FND | Low |

## 5. Interfaces and contracts
- E2E uses only public HTTP (`/api/v1`) and `npm run reset-demo` state; no internal imports except the fake LLM fixture loader.
- Every assertion on money compares against `backend/test/fixtures/demo-expectations.json` (independent), never against values computed by the system under test.
- Report format: `| ID | Criterion | Evidence (test name / command / screenshot) | Result | Notes |`.

## 6. Implementation steps
1. Build E2E helper: `resetDemo()` into temp DB, start app, login demo user.
2. Encode steps 1–10 (Doc 6 §5) as sub-tests (drop step 9 if the end-of-D5 checkpoint cut Tier 3, D-PLAN-9); capture `trace_id`s to assert specialist fan-out (P-AC-11) and LLM call counts (P-AC-06: 0 LLM calls during seeding).
3. Security suite S-1…S-16 (secrets grep in `dist/` and logs; route table without token → 401; two-user isolation sweep over every route in `routes-inventory`; write-tool call → FORBIDDEN; typed "yes" → no execution; Sentinel connection write fails; raw-row immutability; rate limits; `/demo/*` 404 when `DEMO_CONTROLS` unset; …).
4. Failure injection via env/test hooks (`LLM_PROVIDER=fake` with missing fixture; stub Sentinel function throwing; `PRAGMA query_only` toggled to force write failure).
5. Restart test with child process.
6. Remove all `{ todo: … }` markers and temporary fallbacks (e.g. seed loader fallback from WS-FND-P4); confirm none remain via grep.
7. Run `npm --prefix backend run test:live` with Qwen (details from D3) or, if Qwen is unavailable, the agreed stand-in OpenAI-compatible provider (D-PLAN-12); collect P-AC-17/18/19 numbers and label them with the model actually used.
8. Manual UI walkthrough for P-AC-20 and desktop; screenshots stored under `docs/implementation-plan/reports/screens/`.
9. Fill `acceptance-checklist.md` evidence; team lead signs.

## 7. Edge cases
| Case | Handling |
| --- | --- |
| Flaky timing in dispatcher-driven assertions | Use `events.drainOnce()` via a test-only endpoint guarded by `NODE_ENV=test`, or poll with timeout 5 s |
| Live model nondeterminism | Live suite asserts schema validity, grounding and rates (thresholds), not exact text |
| Clock-dependent results | `DEMO_TODAY` fixed |
| A failure belongs to another workstream | Open bug with owner; owner fixes on their branch; E2E re-run |

## 8. Constraints
- Do not weaken assertions to pass; failures go to owners.
- Live keys only in GitHub secrets / local `.env`.

## 9. Test plan
| Suite | Command |
| --- | --- |
| E2E (fake) | `cd backend && node --test "test/e2e/**/*.test.js"` (also part of `npm --prefix backend test`) |
| Security | `npm --prefix backend test` (includes `test/security`) |
| Reliability | same |
| Live | `npm --prefix backend run test:live` |
| Gate | `npm test` (`tests/verifyApp.js`), `npm run build`, `npx oxlint` |

## 10. Acceptance criteria
**Plan:** all suites green (live: thresholds met with Qwen or the labelled stand-in provider); report complete.
**Workstream:** WS-FND accepted per `acceptance-checklist.md` §3.
**Integration:** G5 (E2E), G6, G7 evidence.

## 11. Risks and recovery
| Risk | Recovery |
| --- | --- |
| Late merges compress fix time | Tiered acceptance (roadmap §5): accept Tier 1 first |
| Live latency above P-AC-19 | Report; tune `maxTokens`/model class mapping; record as known limitation if endpoint-bound |

## 12. Assumptions and unresolved questions
- [D] D-PLAN-12 for live criteria P-AC-17 (live part), 18, 19; [U] stand-in provider and its owner, decided before D8.
- [A] Manual UI walkthrough acceptable for P-AC-20 in the prototype.

## 13. Completion handoff
README template + `reports/acceptance-run.md`. No further plans; hand to team lead for G7 sign-off.
