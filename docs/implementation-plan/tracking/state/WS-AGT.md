# Execution State — WS-AGT (Specialist Runner & LLM Specialists)

Fed to every new coding session for this workstream (Template A `[STATE FILE]`). Keep it short and factual; append, do not rewrite history.

| Field | Value |
| --- | --- |
| Developer | Dev C — Anish (@DEstroy746) |
| Branch prefix | `ws-agt/p<n>-<slug>` |
| Current plan | WS-AGT-P1 (not started) |

## 1. Sequence overview
| Local | Plan ID | Title | Objective (short) | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| Plan 1 | WS-AGT-P1 | Specialist Runner and Nova on the LLM Adapter | Build the shared specialist runner (ADR-07, Doc 4 §2) and move Nova onto it: deterministic tool plan → LLM draft (with at most one optional tool-request round) →… | C-1, WS-FND-P3, WS-SEN-P1 | Blocked |
| Plan 2 | WS-AGT-P2 | Atlas and Iris on the Runner | Configure Atlas and Iris on the shared runner with prompts, domain schemas, fake fixtures and deterministic fallbacks built from their current compositions | WS-AGT-P1 | Blocked |
| Plan 3 | WS-AGT-P3 | Live-Model Evaluation (Qwen prototype endpoint) | Measure the real runtime model (Qwen 32B-class via OpenAI-compatible API, D-008) on John + specialists: schema validity, grounding, routing accuracy, latency; tune… | U-2, WS-AGT-P2, WS-JON-P1 | Blocked |

Plan files: `docs/implementation-plan/workstreams/WS-AGT/`. Status of record: `tracking/STATUS.md`.

## 2. Interfaces this workstream consumes / produces
See the rows naming WS-AGT in `cross-workstream-dependencies.md`. Record here the merged contract files as they land:
- (none merged yet)

## 3. Decisions and assumptions in force
- **Source-baseline import (D-PLAN-3) not yet on `main` — every plan in this sequence is Blocked until it is** (`../../../repository-migration-notes.md` §5).
- Decisions of 2026-10-13 in `baseline.md` §6: LLM agents with deterministic fallback; aim Tier 3, fall back to Tier 2 (checkpoint end of D5); one plan = one branch = one PR (contract commit first, Draft PR, merge commit); SC action names + aliases; keep table names; keep existing deferred actions only; LLM consent off by default; stub after half a day late; Qwen details on D3, stand-in provider if unavailable.

## 4. Handoff log (append Template E summaries, newest last)
- (empty)
