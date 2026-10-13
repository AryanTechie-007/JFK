# Plan Status Board

Update this file in the same PR that changes a plan's state (or via a small `tracking:` PR). Rules and evidence requirements: `tracking/README.md`. Statuses: **Blocked → Ready → In progress → In review → Complete**.

Local plan numbers restart at Plan 1 in every workstream; always refer to plans by **ID**.

> **2026-10-13:** every plan is additionally blocked by **TD-01** (source baseline not yet in the repository). When TD-01 is resolved and the import is merged, Dev A sets WS-FND-P1 to *Ready* and removes this note. Team decisions are recorded in [`../../team-decisions.md`](../../team-decisions.md).

## 1. Plans
| Plan ID | Local | Title | Developer | Target (roadmap §4) | Status | Waiting on (implementation deps) | PR | Evidence (tests · acceptance · review) | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WS-FND-P1 | Plan 1 | Baseline, Guardrails and Route Split | Dev A | D1 | Blocked | TD-01 (source baseline) | — | — | — |
| WS-FND-P2 | Plan 2 | Migrations Framework and Schema Gaps | Dev A | D2 | Blocked | WS-FND-P1 | — | — | — |
| WS-FND-P3 | Plan 3 | Event Dispatcher, Tool-Result Store, Traces and LLM Adapter | Dev A | D3 | Blocked | WS-FND-P2 | — | — | — |
| WS-FND-P4 | Plan 4 | Demo Dataset and Seed | Dev A | D4 | Blocked | WS-FND-P2 | — | — | — |
| WS-FND-P5 | Plan 5 | Legacy Retirement and Single-Server Desktop | Dev A | D8 | Blocked | WS-CAT-P2, WS-FND-P3, WS-JON-P1, WS-PLT-P1, WS-UI-P1, WS-UI-P2, WS-UI-P3 | — | — | — |
| WS-FND-P6 | Plan 6 | End-to-End Suites and Acceptance Run | Dev A | D9 | Blocked | WS-AGT-P2, WS-AGT-P3, WS-CAT-P3, WS-FND-P4, WS-FND-P5, WS-JON-P2, WS-PLT-P2, WS-SEN-P2, WS-UI-P2, WS-UI-P3 | — | — | — |
| WS-CAT-P1 | Plan 1 | Categorizer Conformance and Pipeline Fixes | Dev B | D2 | Blocked | WS-FND-P1 | — | — | — |
| WS-CAT-P2 | Plan 2 | Canonical Ingestion Gateway | Dev B | D5 | Blocked | WS-CAT-P1, WS-FND-P2 | — | — | step 1 (CanonicalBatch/MappingProfile contract PR) Ready D2 |
| WS-CAT-P3 | Plan 3 | Corrections via the Action Service, Read API and Golden Evaluation | Dev B | D6 | Blocked | WS-CAT-P1, WS-FND-P4 | — | — | — |
| WS-SEN-P1 | Plan 1 | Sentinel Conformance: Envelope, Read-Only Access and Golden Tests | Dev D | D4 am | Blocked | WS-FND-P1 | — | — | — |
| WS-SEN-P2 | Plan 2 | Rule-Library Parity, Workspace View Contracts and Performance | Dev D | D5 am | Blocked | WS-FND-P1, WS-SEN-P1 | — | — | step 1 (HTTP view-schema contract PR) Ready D1 |
| WS-PLT-P1 | Plan 1 | Consent-Safe Action Service | Dev B | D4 am | Blocked | WS-FND-P2 | — | — | step 1 (registry/ActionCtx contract PR) Ready D2 |
| WS-PLT-P2 | Plan 2 | Event-Driven Budget Monitor and Profile Conformance | Dev B | D4 | Blocked | WS-FND-P3, WS-PLT-P1 | — | — | — |
| WS-AGT-P1 | Plan 1 | Specialist Runner and Nova on the LLM Adapter | Dev C | D5 | Blocked | WS-FND-P3 | — | — | — |
| WS-AGT-P2 | Plan 2 | Atlas and Iris on the Runner | Dev C | D8 am | Blocked | WS-AGT-P1 | — | — | — |
| WS-AGT-P3 | Plan 3 | Live-Model Evaluation (Qwen prototype endpoint) | Dev C | D9 (U-2) | Blocked | WS-AGT-P2 | — | — | Decision U-2 required |
| WS-JON-P1 | Plan 1 | LLM Router Fallback, Grounded Synthesis, Streaming and Consent | Dev C | D4 am | Blocked | WS-FND-P3 | — | — | step 1 (Chat contract PR) Ready D1 |
| WS-JON-P2 | Plan 2 | Proposals, Rule-Detected Instructions, Corrections and Arbitration in Chat | Dev C | D7 am | Blocked | WS-CAT-P3, WS-JON-P1, WS-PLT-P1 | — | — | — |
| WS-UI-P1 | Plan 1 | Five-Workspace Shell, Single API Client and Shared Components | Dev D | D2 | Blocked | TD-01 (source baseline) | — | — | — |
| WS-UI-P2 | Plan 2 | Sentinel Workspace and Settings | Dev D | D7 am | Blocked | WS-CAT-P2, WS-CAT-P3, WS-PLT-P2, WS-SEN-P2, WS-UI-P1 | — | — | — |
| WS-UI-P3 | Plan 3 | Chat UX (Streaming, Cards, Chips, Undo), Alert Explain and Desktop Verification | Dev D | D8 am | Blocked | WS-JON-P2, WS-PLT-P1, WS-UI-P1 | — | — | — |

## 2. Developer queues (execution order)
| Developer | Order |
| --- | --- |
| Dev A | WS-FND-P1 → WS-FND-P2 → WS-FND-P3 → WS-FND-P4 → WS-FND-P5 → WS-FND-P6 |
| Dev B | WS-CAT-P1 → WS-PLT-P1 → WS-PLT-P2 → WS-CAT-P2 → WS-CAT-P3 |
| Dev C | WS-JON-P1 → WS-AGT-P1 → WS-JON-P2 → WS-AGT-P2 → WS-AGT-P3 |
| Dev D | WS-UI-P1 → WS-SEN-P1 → WS-SEN-P2 → WS-UI-P2 → WS-UI-P3 |

## 3. Gate log
| Gate | Target | Status | Evidence links | Date |
| --- | --- | --- | --- | --- |
| G1 Contract agreement | end D1 | Open | | |
| G2 Skeleton integration | end D3 | Open | | |
| G3 Core deterministic loop | end D4 | Open | | |
| G4 Cross-component behaviour | end D7 | Open | | |
| G5 End-to-end prototype | end D8 | Open | | |
| G6 Regression/security/reliability | D9 | Open | | |
| G7 Final acceptance | D9 | Open | | |

## 4. Decision and escalation log
| Date | ID | Decision / question | Raised by | Owner | Outcome |
| --- | --- | --- | --- | --- | --- |
| — | C-1 | LLM layer per specs (default) | audit | Team lead | Default applies unless overridden on D1 |
| — | C-5 | SC §13.2 action names canonical (default) | audit | Team lead | Default applies |
| — | D-PLAN-2 | Keep physical table names (default) | audit | Team lead | Default applies |
| — | U-1 | Demo date / hackathon length | audit | Team lead | Open — drives tier cut |
| — | U-2 | Qwen endpoint (URL, model IDs, JSON mode, limits) | audit | Team lead | Open — needed by D3 |
| — | U-4 | Branching model (short-lived plan branches) | audit | Team lead | Default applies |
| 2026-10-13 | TD-01 | Source baseline: import into the new repository or greenfield re-plan | repository migration | Team lead | **Open — blocks all plans** (`../../team-decisions.md`) |
| 2026-10-13 | TD-02…TD-25 | Other pre-implementation and task-level decisions | repository migration | Team lead | Open — see `../../team-decisions.md` |
