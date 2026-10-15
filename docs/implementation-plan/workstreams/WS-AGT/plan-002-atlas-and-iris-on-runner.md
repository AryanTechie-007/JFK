# WS-AGT · Plan 2 — Atlas and Iris on the Runner

> **Local plan number: Plan 2 of 3 in WS-AGT** · Unique ID: **`WS-AGT-P2`** · Branch: `ws-agt/p2-atlas-iris`

> **Repository context (updated 2026-10-13).** Work happens in `https://github.com/Kathir-M-03/FINNMIN-JFK-John` on a branch created from `main`, following [`development-workflow.md`](../../../development-workflow.md). Files marked *Modify*, *Keep*, *Delete*, *Move* or `[E]` belong to the **source baseline** — the application code described in [`baseline.md`](../../baseline.md). Per team decision **D-PLAN-3** (2026-10-13) the repository starts from that code at commit `fc0981d`; **until the source-baseline import commit is on `main` this plan cannot start** (one-time import by the team lead — see [`repository-migration-notes.md`](../../../repository-migration-notes.md) §5). One plan = one branch = one PR (D-PLAN-4). Statements below about what exists "on `main`" or "today" describe the source baseline, not the new repository's `main`.

## 1. Plan identity
| Field | Value |
| --- | --- |
| Workstream / local number / ID | WS-AGT / **Plan 2** / `WS-AGT-P2` |
| Owner / subagent | Dev C — AI Engineer / WS-AGT subagent |
| Objective | Configure Atlas and Iris on the shared runner with prompts, domain schemas, fake fixtures and deterministic fallbacks built from their current compositions |
| Expected outcome | Atlas task types `GOAL_PROGRESS`, `EVALUATE_FUND_ADDITION`, `CREATE_GOAL`, `GOAL_PLAN_REVIEW`, `SIP_PROJECTION`, `HANDLE_PEER_FINDING`; Iris task types `MONTHLY_PLAN`, `WHAT_IF_PURCHASE`, `BILL_OUTLOOK`, `OVERSPEND_DIAGNOSIS`, `PLAN_REVIEW` (prototype rows of Doc 4 §3/§5) — each with LLM path + fallback |
| Size | ~1 day; one PR (schema commit, then Atlas commits, then Iris commits) |

## 2. Dependencies
| Type | Source | Needed | Early start |
| --- | --- | --- | --- |
| implementation | WS-AGT-P1 | Runner, catalogue, post-checks, fallback | No |

**Parallel with:** WS-CAT-P3, WS-JON-P2, WS-UI-P2.
**Unblocks:** WS-AGT-P3, WS-FND-P6; enables WS-JON parallel-specialist and dependency-edge tests.

## 3. Scope
**In:** configs, plans, compose (fallback), postprocess checks (Atlas: feasibility consistency, goal IDs exist; Iris: simulation totals consistent, proposals limited to registry proposers), prompts, domain schemas `AtlasDomain@1`, `IrisDomain@1`, PeerHint@1 emission (Iris → Atlas pressure/capacity hints, SC §9.6), fixtures.
**Tier cut (D-PLAN-9):** if the end-of-D5 checkpoint cuts Tier 3, build only Iris `WHAT_IF_PURCHASE` and Atlas `GOAL_PROGRESS`, `EVALUATE_FUND_ADDITION`, `CREATE_GOAL`; the other task types keep today's deterministic behaviour (fallback path).
**Out:** Atlas edit/pause/release/delete via chat (LINK to form, Doc 4 §1 routing); John routing (WS-JON).

## 4. Files and ownership
| File | Action | Purpose | Ownership | Shared-file risk |
| --- | --- | --- | --- | --- |
| `backend/src/agents/atlas/{index,config,plan,compose,postprocess}.js`, `prompts/system.v1.md` | Modify/Create | Atlas on runner | WS-AGT | Medium — `invoke` used by John |
| `backend/src/agents/iris/{index,config,plan,compose,postprocess}.js`, `prompts/system.v1.md` | Modify/Create | Iris on runner | WS-AGT | Medium |
| `backend/src/shared/contracts/schemas/AtlasDomain@1.json`, `IrisDomain@1.json`, `PeerHint@1.json` | Create | Contracts | WS-AGT (JON reviews) | Medium |
| `backend/test/agents/atlas.test.js`, `iris.test.js`, `peer-hints.test.js` | Create | Tests | WS-AGT | Low |
| `backend/test/fixtures/llm/specialists/{atlas,iris}/*.json` | Create | Fakes | WS-AGT | Low |

## 5. Interfaces and contracts
- `agents.atlas.invoke(TaskPacket@1, {signal})`, `agents.iris.invoke(...)` → `SpecialistResponse@1` (unchanged).
- Proposals allowed (SC §13.2 proposers): Atlas → goal actions; Iris → `CREATE_GOAL`, `UPDATE_GOAL`, `SET_GOAL_MONTH_OVERRIDE`, `ADJUST_BUDGET_CAP`, `APPLY_REBALANCE`. Each validated by its validator before inclusion (`validation_tool_result_id` set).
- PeerHint@1 from Iris consumed by John to schedule `ATLAS HANDLE_PEER_FINDING` (dependency edge; WS-JON-P2).

## 6. Implementation steps
1. Atlas (PR 1): split current composition into plan/compose; config per task type with budgets from SC §9.3; prompt; fixtures; tests (LLM + fallback per type).
2. Iris (PR 2): same; `WHAT_IF_PURCHASE` plan uses `sentinel_run_spending_simulation` + `sentinel_flag_cashflow_risk` conditionally (date ≤ 30 days); emits PeerHint when goal pressure detected.
3. Shared: domain schemas as the first commit; injection/minimisation tests extended to both agents.
4. Joint: phone what-if fixture set used by WS-JON and WS-FND-P6 (P-AC-11).

## 7. Edge cases
| Case | Handling |
| --- | --- |
| Goal name in packet not found | `QUESTION` (ambiguity) per Atlas spec; no proposal |
| Add funds exceeding available balance | Validator rejects → constraint `INSUFFICIENT_BALANCE`; explanation kept |
| Iris proposes action it is not a proposer for | Dropped by runner (and by John) |
| SIP with unrealistic return input | Sentinel params validation error surfaced as constraint; illustrative label |
| Plan review with > 6 goals | Budget cap 8 tool calls; progress for top goals by priority, PARTIAL label |

## 8. Constraints
- Same as WS-AGT-P1 (no provider code, no writes, minimisation).
- Atlas and Iris changes stay in their own folders; shared schema changes are the first commit of the PR.

## 9. Test plan
| Test | Command |
| --- | --- |
| `test/agents/atlas.test.js` | `npm --prefix backend test` |
| `test/agents/iris.test.js` | same |
| `test/agents/peer-hints.test.js` | same |
| Regression John/Nova tests | same |

## 10. Acceptance criteria
**Plan:** every listed task type passes LLM-path and fallback tests; proposals validated; schemas merged.
**Workstream:** three specialists on the runner (checklist §3, WS-AGT row, fake part).
**Integration:** G4 parallel specialists and dependency edge; P-AC-11.

## 11. Risks and recovery
| Risk | Recovery |
| --- | --- |
| Time pressure | Tier 2 needs Iris `WHAT_IF_PURCHASE` + Atlas `GOAL_PROGRESS`/`EVALUATE_FUND_ADDITION` first; rest Tier 3 |
| Divergent style between Atlas and Iris prompts | Shared prompt skeleton in `agents/shared/prompts/base.v1.md` |

## 12. Assumptions and unresolved questions
- [A] Task-type subset per Doc 4 §3/§5 is the prototype scope.

## 13. Completion handoff
README template (one handoff for the whole plan). Next eligible: **WS-AGT-P3**, WS-FND-P6.
