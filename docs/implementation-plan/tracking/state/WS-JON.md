# Execution State — WS-JON (John Orchestrator & Chat)

Fed to every new coding session for this workstream (Template A `[STATE FILE]`). Keep it short and factual; append, do not rewrite history.

| Field | Value |
| --- | --- |
| Developer | Dev C |
| Branch prefix | `ws-jon/p<n>-<slug>` |
| Current plan | WS-JON-P1 (not started) |

## 1. Sequence overview
| Local | Plan ID | Title | Objective (short) | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| Plan 1 | WS-JON-P1 | LLM Router Fallback, Grounded Synthesis, Streaming and Consent | Turn `backend/src/agents/john/index.js` (deterministic regex router + templates) into the spec'd orchestrator: rules router first, LLM router fallback with… | C-1, WS-AGT-P1, WS-FND-P3 | Blocked |
| Plan 2 | WS-JON-P2 | Proposals, Rule-Detected Instructions, Corrections and Arbitration in Chat | Complete John's write-adjacent behaviour safely: specialist proposals become `CARD` blocks via `actionService.createProposal` (no tokens); rule-detected T1… | WS-CAT-P3, WS-JON-P1, WS-PLT-P1 | Blocked |

Plan files: `docs/implementation-plan/workstreams/WS-JON/`. Status of record: `tracking/STATUS.md`.

## 2. Interfaces this workstream consumes / produces
See the rows naming WS-JON in `cross-workstream-dependencies.md`. Record here the merged contract files as they land:
- (none merged yet)

## 3. Decisions and assumptions in force
- Defaults from `baseline.md` §5–§6 (C-1, C-5, D-PLAN-2, U-4) unless the decision log in `tracking/STATUS.md` says otherwise.

## 4. Handoff log (append Template E summaries, newest last)
- (empty)
