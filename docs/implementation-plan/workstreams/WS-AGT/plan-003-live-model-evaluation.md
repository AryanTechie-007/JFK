# WS-AGT · Plan 3 — Live-Model Evaluation (Qwen prototype endpoint)

> **Local plan number: Plan 3 of 3 in WS-AGT** · Unique ID: **`WS-AGT-P3`** · Branch: `ws-agt/p3-live-eval` · **Starts after D3** (Qwen key and model arrive on D3; stand-in provider if Qwen is unavailable)

> **Repository context (updated 2026-10-13).** Work happens in `https://github.com/Kathir-M-03/FINNMIN-JFK-John` on a branch created from `main`, following [`development-workflow.md`](../../../development-workflow.md). This plan edits no source-baseline file directly, but it evaluates code delivered by WS-AGT-P1/P2 and WS-JON-P1, which modify source-baseline files; it is therefore also gated by the source-baseline import (D-PLAN-3) and by the Qwen details arriving on D3 (U-2; stand-in provider per D-PLAN-12). Statements below about what exists "on `main`" or "today" describe the source baseline, not the new repository's `main`.

## 1. Plan identity
| Field | Value |
| --- | --- |
| Workstream / local number / ID | WS-AGT / **Plan 3** / `WS-AGT-P3` |
| Owner / subagent | Dev C — AI Engineer / WS-AGT subagent |
| Objective | Measure the real runtime model (Qwen 32B-class via OpenAI-compatible API, D-008) on John + specialists: schema validity, grounding, routing accuracy, latency; tune prompts and model-class mapping; document results. Production Gemini Enterprise is configuration-only and out of scope |
| Expected outcome | `backend/test/live/` suite (≥ 15 live cases for grounding, ≥ 40 fake cases already exist), `reports/live-eval.md` with P-AC-17/18/19 numbers |
| Size | ~0.5–1 day once the Qwen details (or the stand-in provider) are configured |

## 2. Dependencies
| Type | Source | Needed | Early start |
| --- | --- | --- | --- |
| implementation | WS-AGT-P2 | All specialists on runner | No |
| decision | U-2, D-PLAN-11, D-PLAN-12 | Base URL, model IDs, JSON-schema/JSON-mode support, rate limits, key — arriving D3; key handling per D-PLAN-11; stand-in provider if unavailable | No |
| interface | WS-JON-P1 | Chat path for end-to-end live cases | Yes (specialist-level cases first) |

**Unblocks:** WS-FND-P6 live suite (P-AC-17 live, P-AC-18, P-AC-19).

## 3. Scope
**In:** live eval set (questions + expected routing + grounding checks, no exact text); runner for live tests; metrics; prompt/`maxTokens`/`LLM_JSON_MODE` tuning; fixture refresh (capture real outputs as new fake fixtures after review).
**Out:** model training/fine-tuning; production provider.

## 4. Files and ownership
| File | Action | Purpose | Ownership | Shared-file risk |
| --- | --- | --- | --- | --- |
| `backend/test/live/eval-set.json` | Create | Cases with expected task routing, required grounded figures | WS-AGT (JON co-authors chat cases) | Low |
| `backend/test/live/specialists.live.js`, `chat.live.js` | Create | Live tests (excluded from CI) | WS-AGT / WS-JON | Low |
| `backend/scripts/live-eval-report.js` | Create | Aggregates metrics → `docs/implementation-plan/reports/live-eval.md` | WS-AGT | Low |
| `backend/src/agents/*/prompts/system.v2.md` | Create (if tuned) | New prompt versions (v1 kept) | WS-AGT | Low |
| `backend/.env.example` | Request change via WS-FND | Final model IDs placeholders | WS-FND | Low |

## 5. Interfaces and contracts
- No contract changes. Prompt versions recorded in `SpecialistResponse@1.meta.prompt_version`.
- Metrics: schema-valid rate (≥ 90 %, P-AC-18), visible numbers grounded (100 %), ungrounded digits (0, P-AC-17), routing accuracy, p95 latency (≤ 12 s single specialist, ≤ 20 s cap, P-AC-19), fallback rate.

## 6. Implementation steps
1. Receive the Qwen details on D3 from the key holder (shared privately); put them in your local `backend/.env` and in the GitHub Actions secret used by `live.yml`; never commit them.
2. Run `node backend/scripts/llm-smoke.js` (WS-FND-P3) to confirm JSON support; set `LLM_JSON_MODE`.
3. Build eval set from demo journey questions + variants (≥ 15 live grounding cases).
4. Run suite 3× to observe variance; compute metrics.
5. Tune prompts (new versions), `maxTokens`, temperature 0; re-run.
6. Capture reviewed outputs as new fake fixtures (labelled `captured-live`).
7. Write report; hand numbers to WS-FND-P6.

## 7. Edge cases
| Case | Handling |
| --- | --- |
| Provider rate limits | Sequential runs with backoff; report throughput limit |
| Model ignores JSON schema | JSON mode + repair; measure fallback rate |
| Latency over target | Reduce catalogue, `maxTokens`; parallel specialist dispatch already default |

## 8. Constraints
- Keys only in local env / CI secrets; live tests never in default CI.
- Live data = synthetic demo dataset only.

## 9. Test plan
| Test | Command |
| --- | --- |
| Live suite | `npm --prefix backend run test:live` |
| Report | `node backend/scripts/live-eval-report.js` |

## 10. Acceptance criteria
**Plan:** report produced with all metrics; thresholds met or gaps documented with mitigation.
**Workstream:** WS-AGT "live evaluation report" (Qwen, or the stand-in provider, labelled).
**Integration:** G6 live item; P-AC-17 (live), 18, 19.

## 11. Risks and recovery
| Risk | Recovery |
| --- | --- |
| Qwen unavailable | Configure the agreed stand-in OpenAI-compatible provider (D-PLAN-12), rerun, and label the report with the model actually used |
| Thresholds missed | Deterministic fallback keeps correctness; record limitation; consider larger model class mapping |

## 12. Assumptions and unresolved questions
- [D] D-PLAN-11/12 (key handling; stand-in provider). [U] Which stand-in provider and who holds its key — decide before D8.

## 13. Completion handoff
README template + `reports/live-eval.md`. Next eligible: WS-FND-P6 live part.
