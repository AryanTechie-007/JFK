# Acceptance Checklist

## 1. Plan-level acceptance (applies to every plan)
- [ ] All acceptance criteria in the plan's §10 demonstrated, with test names or commands listed in the PR handoff.
- [ ] `npm --prefix backend test` green; `npm run build` green; `npx oxlint` no new errors.
- [ ] No existing test deleted, skipped or weakened (diff of `*.test.js` reviewed).
- [ ] Only files owned by the workstream changed, or the other owner approved.
- [ ] No hardcoded financial values, fabricated `tool_result_id`s, or mock data introduced.
- [ ] One PR for the whole plan (D-PLAN-4), merged with a merge commit; contract files it produces were its first commit and approved by the consumers.
- [ ] Completion handoff (README template) filled in and `tracking/STATUS.md` row set to *Complete* with the evidence listed in `tracking/README.md` §3.
- [ ] Independent review (Template C in `prompt-templates.md`) recorded for plans touching money, consent, security or a shared contract.

## 2. Gate checklists
### G1 Contract agreement (end D1)
- [x] `docs/specifications/`, `docs/prototype-design/`, `docs/implementation-plan/` on `main` of the new repository (since its first commit).
- [ ] Source baseline `fc0981d` imported to `main` (D-PLAN-3).
- [ ] `routes/v1/index.js` split; `.github/CODEOWNERS` merged.
- [ ] HTTP view schema drafts open as a PR by WS-SEN.
- [ ] WS-FND-P1 merged (harness + CI live, route split, CODEOWNERS); WS-JON-P1 Draft PR open with its Chat-schema contract commit under review.
- [ ] Decisions recorded (`baseline.md` §6, 2026-10-13); developer handles (`workstream-assignments.md` §2.0) used in CODEOWNERS.

### G2 Skeleton integration (end D3)
- [ ] CI runs `node --test` on temp databases (no test touches `backend/finmate.db`).
- [ ] Migration `000_baseline.sql` reproduces today's schema exactly (schema diff test).
- [ ] Dispatcher delivers a test event exactly once per handler; dead-letter after 3 failures.
- [ ] `llm.complete` returns fixture output with `LLM_PROVIDER=fake` under `NODE_ENV=test`; refuses `fake` otherwise.
- [ ] Electron boots; the five workspaces + Settings render their views from `/api/v1` (Backend B may still run until WS-FND-P5; single server is checked at G5).

### G3 Core deterministic loop (end D4)
- [ ] Categorizer AC tests (CAT-AC-01…07, 09–11, 13–18) pass.
- [ ] Sentinel golden tests for all 17 functions pass; determinism replay passes.
- [ ] A T2 action cannot execute without a confirm call; tokens never appear in proposal-creation responses.
- [ ] A categorization change produces an alert change through the dispatcher (no GET-time scanning).

### Tier checkpoint (end D5, D-PLAN-9)
- [ ] G3 closed on time or ≤ 1 day late → Tier 3 kept; otherwise Tier 3 items in `roadmap.md` §5 cut and the decision recorded in `tracking/STATUS.md`.

### G4 Cross-component behaviour (end D7)
- [ ] Fake-LLM chat tests: single specialist, parallel, arbitration, dependency edge, T1 rule-detected with Undo, typed "yes" refused, consent off → no LLM call.
- [ ] Correction → next chat answer uses new `categorization_version`.

### G5 End-to-end prototype (end D8)
- [ ] `backend/test/e2e/demo-journey.test.js` (fake LLM) passes steps 1–10.
- [ ] Legacy Backend B, legacy routes and legacy tables removed; Electron starts one server (:4000); app runs.
- [ ] No `src/data/mock*` or `geminiService` imports remain.

### G6 Regression, security and reliability (D9)
- [ ] Security suite S-1…S-16 (prototype design Doc 5) green.
- [ ] Failure injection: LLM down, Sentinel throws, DB write failure, stale snapshot, duplicate submit, expired proposal.
- [ ] Restart persistence test green.
- [ ] Live suite run with Qwen (details from D3) — or with the agreed stand-in OpenAI-compatible provider (D-PLAN-12), labelled with the model actually used.

## 3. Workstream-level acceptance
| Workstream | Accepted when |
| --- | --- |
| WS-FND | G1, G2, G5 entry criteria met; legacy removed; E2E and acceptance reports produced |
| WS-CAT | All CAT-AC tests in scope pass; canonical JSON + CSV ingestion idempotent; all category changes go through the Action Service; golden-set report ≥ P-AC-03 |
| WS-SEN | 17 functions golden-tested; Action Service and Sentinel validators identical over the shared corpus; HTTP view schemas merged and enforced by contract tests |
| WS-PLT | Consent rules SC §13 enforced; T1 Undo works; Monitor fully event-driven; balances precedence and staleness per SC §5.2 |
| WS-AGT | Three specialists produce schema-valid, grounded responses via the runner on fake fixtures; deterministic fallback on LLM failure; live evaluation report (or U-2 block noted) |
| WS-JON | Router, synthesis, grounding gate, streaming, consent, memory, proposals and corrections pass their tests |
| WS-UI | Five workspaces + Settings, no mocks, all deferred controls visibly disabled, chat UX complete, desktop app verified |

## 4. Final prototype acceptance (from `docs/prototype-design/06-testing-and-acceptance.md` §3)
| ID | Criterion | Evidence | Pass |
| --- | --- | --- | --- |
| P-AC-01 | One server, one database; no request to :4001; no mock imports | Grep test + network log | [ ] |
| P-AC-02 | Loading the demo batch twice creates rows once | Integration test | [ ] |
| P-AC-03 | Golden classification thresholds | Golden report | [ ] |
| P-AC-04 | Sentinel spend equals independent expectations to the paisa | Golden test | [ ] |
| P-AC-05 | Every displayed number grounded; no frontend money arithmetic | Contract test + lint | [ ] |
| P-AC-06 | Dining Warning alert exists after seeding with 0 LLM calls | Integration test | [ ] |
| P-AC-07 | Alert Explain → grounded Nova explanation + rebalance card equal to Sentinel result | E2E | [ ] |
| P-AC-08 | Rebalance writes current-month overrides only; alert resolves | Integration | [ ] |
| P-AC-09 | Correction updates both categories and the next chat answer | Integration + E2E | [ ] |
| P-AC-10 | `ADD_FUNDS` balance rule, execution, `DUPLICATE` on double confirm | Integration | [ ] |
| P-AC-11 | Phone what-if invokes Iris ∥ Atlas, grounded, proposals are cards | E2E trace | [ ] |
| P-AC-12 | Health-score answer equals Sentinel output | E2E | [ ] |
| P-AC-13 | Typed "yes" never executes T2/T3 | E2E | [ ] |
| P-AC-14 | LLM unreachable → workspaces/forms/alerts still work; chat degraded | Failure test | [ ] |
| P-AC-15 | Restart preserves all state | Restart test | [ ] |
| P-AC-16 | Cross-user access returns 404/no data | Isolation suite | [ ] |
| P-AC-17 | 0 ungrounded digits in fake (≥ 40) and live (≥ 15) eval sets | Eval reports | [ ] |
| P-AC-18 | Live: ≥ 90 % schema-valid specialist responses; 100 % visible numbers grounded | `test:live` | [ ] |
| P-AC-19 | Chat p95 ≤ 12 s single-specialist, ≤ 20 s cap | Live timing | [ ] |
| P-AC-20 | Every deferred control disabled and labelled; no erroring controls | UI checklist | [ ] |

Live criteria (P-AC-17 live part, P-AC-18, P-AC-19) may be evidenced with the stand-in provider if Qwen is unavailable (D-PLAN-12); the report names the model used. If Tier 3 was cut, demo step 9 is out of scope and is not evidenced.

Sign-off: team lead ____________________ date ________
