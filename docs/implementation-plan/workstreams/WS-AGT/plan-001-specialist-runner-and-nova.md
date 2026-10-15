# WS-AGT · Plan 1 — Specialist Runner and Nova on the LLM Adapter

> **Local plan number: Plan 1 of 3 in WS-AGT** · Unique ID: **`WS-AGT-P1`** · Branch: `ws-agt/p1-runner-nova`

> **Repository context (updated 2026-10-13).** Work happens in `https://github.com/Kathir-M-03/FINNMIN-JFK-John` on a branch created from `main`, following [`development-workflow.md`](../../../development-workflow.md). Files marked *Modify*, *Keep*, *Delete*, *Move* or `[E]` belong to the **source baseline** — the application code described in [`baseline.md`](../../baseline.md). Per team decision **D-PLAN-3** (2026-10-13) the repository starts from that code at commit `fc0981d`; **until the source-baseline import commit is on `main` this plan cannot start** (one-time import by the team lead — see [`repository-migration-notes.md`](../../../repository-migration-notes.md) §5). One plan = one branch = one PR (D-PLAN-4). Statements below about what exists "on `main`" or "today" describe the source baseline, not the new repository's `main`.

## 1. Plan identity
| Field | Value |
| --- | --- |
| Workstream / local number / ID | WS-AGT — Specialist Runner & LLM Specialists / **Plan 1** / `WS-AGT-P1` |
| Owner / subagent | Dev C — AI Engineer / WS-AGT subagent |
| Objective | Build the shared specialist runner (ADR-07, Doc 4 §2) and move Nova onto it: deterministic tool plan → LLM draft (with at most one optional tool-request round) → proposal validation → post-checks → one repair → `SpecialistResponse@1`; the existing deterministic Nova composition in `backend/src/agents/nova/index.js` becomes the **plan step** and the **deterministic fallback** (resolves conflict C-1, gap G-1 for Nova) |
| Expected outcome | `agents/shared/runner.js` + Nova config for task types `LIVE_STATUS`, `BREACH_EVENT`, `EXPLAIN_ANOMALY`, `PROPOSE_REBALANCE`, `ADJUST_CAP_REQUEST`; schema-valid, grounded responses on fake fixtures; fallback on LLM failure |
| Size | ~1.5 days |

## 2. Dependencies
| Type | Source | Needed | Early start |
| --- | --- | --- | --- |
| implementation | WS-FND-P3 | `llm.complete` (fake provider), gateway `getResult`/persistence, `contracts.validate` | Yes — runner logic against a local in-test fake with the same signature |
| interface | WS-SEN-P1 | `SentinelResult@1` envelope | Yes |
| decision | C-1 | LLM layer per specs | Default applied |

**Parallel with:** WS-JON-P1, WS-PLT-P1/P2, WS-CAT-P2.
**Unblocks:** WS-AGT-P2; interface for WS-JON-P1 (unchanged `invoke` contract).

## 3. Scope
**In:** runner; prompt files (versioned); `SpecialistDraft` JSON schema; minimised results catalogue (aggregates + IDs only, S-10); proposal validation via validators (no writes, S-4); post-checks (schema, placeholders resolve, IDs known, headline rule SC §11.4, task-specific `postprocess.js`); repair; budgets and AbortSignal; deterministic fallback; Nova config; fake fixtures; prompt-injection fixtures (S-9).
**Out:** Atlas/Iris (P2); live evaluation (P3); John changes (WS-JON).

## 4. Files and ownership
| File | Action | Purpose | Ownership | Shared-file risk |
| --- | --- | --- | --- | --- |
| `backend/src/agents/shared/runner.js` | Create | `run(config, packet, {signal})` | WS-AGT | Low |
| `backend/src/agents/shared/catalogue.js` | Create | Builds the minimised results catalogue | WS-AGT | Low |
| `backend/src/agents/shared/postcheck.js` | Create | Generic post-checks using `shared/contracts/grounding.js` (`resolvePlaceholders`, `findUnboundDigits`) | WS-AGT | Low |
| `backend/src/agents/shared/fallback.js` | Create | Wraps a deterministic composer as `SpecialistResponse@1` with `meta.mode:'DETERMINISTIC_FALLBACK'` | WS-AGT | Low |
| `backend/src/shared/contracts/schemas/SpecialistDraft.json`, `NovaDomain@1.json` | Create | LLM output schema; domain schema | WS-AGT (FND/JON review) | Medium |
| `backend/src/agents/nova/index.js` | Modify | `invoke(packet, opts)` → `runner.run(novaConfig, …)`; existing composition moved to `nova/plan.js` + `nova/compose.js` | WS-AGT | Medium — John imports `invoke` |
| `backend/src/agents/nova/config.js`, `plan.js`, `compose.js`, `postprocess.js` | Create | Task-type plans, proposals map, checks | WS-AGT | Low |
| `backend/src/agents/nova/prompts/system.v1.md` | Create | Persona rules (Nova §A.2), output rules, data-field marking | WS-AGT | Low |
| `backend/test/agents/runner.test.js`, `nova.test.js`, `injection.test.js` | Create | Tests | WS-AGT | Low |
| `backend/test/fixtures/llm/specialists/nova/*.json` | Create | Fake LLM outputs (valid, invalid, need_tools, injection) | WS-AGT | Low |

## 5. Interfaces and contracts
```js
runner.run(config, packet, {signal}) -> SpecialistResponse@1
config = { name:'NOVA', promptVersion:'nova.v1', domainSchema:'NovaDomain@1',
  taskTypes: { LIVE_STATUS: { plan:[{tool, params:(packet, prior)=>{}, when?:(prior)=>bool}], optionalTools:[...],
                              proposals:{}, budget:{maxToolCalls:4}, compose:(packet, results)=>SpecialistResponse@1 }, … } }
// LLM calls: modelClass 'SPECIALIST'; ≤ 3 completions per task (draft, optional post-tools draft, repair)
// agents.nova.invoke(TaskPacket@1, {signal}) -> SpecialistResponse@1   (unchanged signature)
```
- Fallback rule: on `LLM_UNAVAILABLE`, `LLM_TIMEOUT`, consent false, or repair failure → `compose(packet, results)` (deterministic template, still grounded) with `meta.mode` recorded; John labels degraded output (John §B.12).
- Runner never writes; only gateway and LLM adapter calls.

## 6. Implementation steps
1. Write runner tests with a local fake (`complete` stub) covering: plan execution order and `when`; need_tools round (≤ 3 tools, allowlisted, budget enforced); proposal validation drops rejected proposals and adds `constraints` with source `VALIDATOR`; post-check failures → repair → success/failure; abort; fallback.
2. Implement runner modules.
3. Split existing Nova deterministic code into `plan.js` (tool calls) and `compose.js` (template output); verify unchanged outputs on existing tests.
4. Nova config + prompt; minimised catalogue (no raw descriptions, merchant names sanitised `[A-Za-z0-9 &.'-]{≤40}`).
5. Fake fixtures for each Nova task type; injection fixtures ("ignore previous instructions", fabricated `tool_result_id`, write-tool request).
6. Switch `nova.invoke` to runner; John's existing tests keep passing (deterministic mode with fake provider missing fixture → fallback).
7. Record per-task LLM usage in traces.

## 7. Edge cases
| Case | Handling |
| --- | --- |
| LLM cites a `tool_result_id` not in this task's results | Post-check fails → repair → else fallback |
| LLM emits a number not bound to a placeholder | `findUnboundDigits` → repair → else fallback |
| LLM requests a tool outside Nova's allowlist | Ignored; constraint logged; no call |
| Plan step returns `INSUFFICIENT_DATA` | Compose/draft must say so; headline conservative |
| Proposal with `override_protected` | Stripped by Action Service anyway; runner drops it for CHAT_PROPOSAL |
| Abort mid-plan | Stop; return `ERROR` `CANCELLED` |

## 8. Constraints
- Runtime model only via `llm.complete({modelClass})`; no provider-specific code in agents.
- Never send account numbers, balances in summaries, user identifiers to the LLM (S-10; packet snapshot test).
- Do not change the `invoke` contract consumed by John.

## 9. Test plan
| Test | Command |
| --- | --- |
| `test/agents/runner.test.js` | `npm --prefix backend test` |
| `test/agents/nova.test.js` (each task type: LLM path + fallback path) | same |
| `test/agents/injection.test.js` (S-9) | same |
| `test/agents/minimisation.test.js` (S-10) | same |
| Existing John tests (regression) | same |

## 10. Acceptance criteria
**Plan:** runner + Nova pass on fakes; fallback works; injection and minimisation tests green; ≤ 3 LLM completions per task.
**Workstream:** runner reusable by Atlas/Iris.
**Integration:** G4 single-specialist chat path; P-AC-07 (Nova explanation + rebalance card, with WS-JON).

## 11. Risks and recovery
| Risk | Recovery |
| --- | --- |
| Qwen output quality low for JSON | Schema mode/JSON mode + repair; fallback keeps product working; measured in WS-AGT-P3 |
| Prompt bloat exceeds context | Catalogue limited to aggregates; per-task `maxTokens` |

## 12. Assumptions and unresolved questions
- [A] Existing deterministic Nova outputs are spec-faithful enough to serve as fallback; discrepancies found are fixed in `compose.js`.
- [U] U-2 affects only live quality, not this plan.

## 13. Completion handoff
README template; list task types, fixtures, prompt version, LLM call counts. Next eligible: **WS-AGT-P2**; notify WS-JON-P1 that Nova runs on the runner.
