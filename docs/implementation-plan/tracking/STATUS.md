# Plan Status Board

Update this file in the same PR that changes a plan's state (or via a small `tracking:` PR). Rules and evidence requirements: `tracking/README.md`. Statuses: **Blocked → Ready → In progress → In review → Complete**.

Local plan numbers restart at Plan 1 in every workstream; always refer to plans by **ID**.

> **2026-10-15:** every plan is additionally blocked by the **source-baseline import** (D-PLAN-3: the repository starts from `fc0981d`; the import is not yet committed). When the import is on `main`, Dev A sets WS-FND-P1 to *Ready* and removes this note. Open items: [`../../team-decisions.md`](../../team-decisions.md).

## 1. Plans
| Plan ID | Local | Title | Developer | Target (roadmap §4) | Status | Waiting on (implementation deps) | PR | Evidence (tests · acceptance · review) | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| WS-FND-P1 | Plan 1 | Baseline, Guardrails and Route Split | Dev A | D1 | Blocked | Source-baseline import (D-PLAN-3) | — | — | — |
| WS-FND-P2 | Plan 2 | Migrations Framework and Schema Gaps | Dev A | D2 | Blocked | WS-FND-P1 | — | — | — |
| WS-FND-P3 | Plan 3 | Event Dispatcher, Tool-Result Store, Traces and LLM Adapter | Dev A | D3 | Blocked | WS-FND-P2 | — | — | — |
| WS-FND-P4 | Plan 4 | Demo Dataset and Seed | Dev A | D4 | Blocked | WS-FND-P2 | — | — | — |
| WS-FND-P5 | Plan 5 | Legacy Retirement and Single-Server Desktop | Dev A | D8 | Blocked | WS-CAT-P2, WS-FND-P3, WS-JON-P1, WS-PLT-P1, WS-UI-P1, WS-UI-P2, WS-UI-P3 | — | — | — |
| WS-FND-P6 | Plan 6 | End-to-End Suites and Acceptance Run | Dev A | D9 | Blocked | WS-AGT-P2, WS-AGT-P3, WS-CAT-P3, WS-FND-P4, WS-FND-P5, WS-JON-P2, WS-PLT-P2, WS-SEN-P2, WS-UI-P2, WS-UI-P3 | — | — | — |
| WS-CAT-P1 | Plan 1 | Categorizer Conformance and Pipeline Fixes | Dev B | D2 | Blocked | WS-FND-P1 | — | — | — |
| WS-CAT-P2 | Plan 2 | Canonical Ingestion Gateway | Dev B | D5 | Blocked | WS-CAT-P1, WS-FND-P2 | — | — | Seed files from WS-FND-P4 are validated here (built against SC §17.7) |
| WS-CAT-P3 | Plan 3 | Corrections via the Action Service, Read API and Golden Evaluation | Dev B | D6 | Blocked | WS-CAT-P1, WS-FND-P4 | — | — | — |
| WS-SEN-P1 | Plan 1 | Sentinel Conformance: Envelope, Read-Only Access and Golden Tests | Dev D | D4 am | Blocked | WS-FND-P1 | — | — | — |
| WS-SEN-P2 | Plan 2 | Rule-Library Parity, Workspace View Contracts and Performance | Dev D | D5 am | Blocked | WS-FND-P1, WS-SEN-P1 | — | — | Schema commit first; Dev B reviews the Nova schema; backtest ±15 % provisional (D-PLAN-10) |
| WS-PLT-P1 | Plan 1 | Consent-Safe Action Service | Dev B | D4 am | Blocked | WS-FND-P2 | — | — | Contract commit first; Draft PR for Dev C/D approval on D2 |
| WS-PLT-P2 | Plan 2 | Event-Driven Budget Monitor and Profile Conformance | Dev B | D4 | Blocked | WS-FND-P3, WS-PLT-P1 | — | — | — |
| WS-AGT-P1 | Plan 1 | Specialist Runner and Nova on the LLM Adapter | Dev C | D5 | Blocked | WS-FND-P3 | — | — | — |
| WS-AGT-P2 | Plan 2 | Atlas and Iris on the Runner | Dev C | D8 am | Blocked | WS-AGT-P1 | — | — | Tier cut note applies if Tier 3 is cut at end of D5 |
| WS-AGT-P3 | Plan 3 | Live-Model Evaluation (Qwen prototype endpoint) | Dev C | D9 (U-2) | Blocked | WS-AGT-P2 | — | — | Qwen key/model arrive D3; stand-in provider if unavailable (D-PLAN-12) |
| WS-JON-P1 | Plan 1 | LLM Router Fallback, Grounded Synthesis, Streaming and Consent | Dev C | D4 am | Blocked | WS-FND-P3 | — | — | Contract commit first; Draft PR for Dev D approval on D1 |
| WS-JON-P2 | Plan 2 | Proposals, Rule-Detected Instructions, Corrections and Arbitration in Chat | Dev C | D7 am | Blocked | WS-CAT-P3, WS-JON-P1, WS-PLT-P1 | — | — | Tier cut note: dependency edge skipped if Tier 3 is cut |
| WS-UI-P1 | Plan 1 | Five-Workspace Shell, Single API Client and Shared Components | Dev D | D2 | Blocked | — | — | — | — |
| WS-UI-P2 | Plan 2 | Sentinel Workspace and Settings | Dev D | D7 am | Blocked | WS-CAT-P2, WS-CAT-P3, WS-PLT-P2, WS-SEN-P2, WS-UI-P1 | — | — | Tier cut note: forecast radar + demo loader skipped if Tier 3 is cut |
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
| Tier checkpoint (D-PLAN-9) | end D5 | Open | G3 ≤ 1 day late → keep Tier 3; else cut Tier 3 | |
| G4 Cross-component behaviour | end D7 | Open | | |
| G5 End-to-end prototype | end D8 | Open | | |
| G6 Regression/security/reliability | D9 | Open | | |
| G7 Final acceptance | D9 | Open | | |

## 4. Decision and escalation log
| Date | ID | Decision / question | Raised by | Owner | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-10-13 | A-ARCH, C-1 | Design approved; real LLM agents with deterministic fallback | Planning | Team lead | Decided |
| 2026-10-13 | U-1, D-PLAN-9 | ≥ 9 working days; aim Tier 3, fall back to Tier 2; checkpoint at end of D5 (G3 > 1 day late → cut Tier 3) | Planning | Team lead | Decided |
| 2026-10-13 | D-PLAN-3 | Build in a new repository owned by the team lead | Planning | Team lead | Decided — `https://github.com/Kathir-M-03/FINNMIN-JFK-John`; import of `fc0981d` pending |
| 2026-10-13 | U-4, D-PLAN-4 | Short-lived plan branches; one plan = one branch = one PR; contract commit first in a Draft PR; merge commit | Planning | Team lead | Decided |
| 2026-10-13 | C-5 | SC §13.2 action names + temporary aliases | Planning | Team lead | Decided |
| 2026-10-13 | D-PLAN-2 | Keep physical table names | Planning | Team lead | Decided |
| 2026-10-13 | D-PLAN-5 | Keep deferred actions that already work on `main`; build no new ones | Planning | Team lead | Decided |
| 2026-10-13 | D-PLAN-6 | LLM consent off until the user opts in; demo user seeded on | Planning | Team lead | Decided |
| 2026-10-13 | D-PLAN-7 | Contract-matching stub after half a day late | Planning | Team lead | Decided |
| 2026-10-13 | D-PLAN-8 | Independent review mandatory for sensitive plans only | Planning | Team lead | Decided |
| 2026-10-13 | U-2, D-PLAN-11 | Qwen key/model arrive D3; key in local `.env` + GitHub Actions secret, never committed | Planning | Team lead | Decided (details pending D3) |
| 2026-10-13 | D-PLAN-12 | If Qwen unavailable, temporarily use another OpenAI-compatible provider | Planning | Team lead | Decided — provider + key holder to choose before D8 |
| 2026-10-13 | D-PLAN-10 | Sentinel backtest limit ±15 % (provisional) | Planning | Team lead | Confirm on D4 |
| 2026-10-13 | D-PLAN-13 | Golden target per Doc 6 P-AC-03; D8 deletion of Backend B, legacy tables, `dist/` | Planning | Team lead | Default, not objected to |
| — | D-PLAN-1 | Developer names and GitHub handles for Dev A–D | Planning | Team lead | Open — D1 |
| — | — | Branch protection available on the new repository? | Planning | Team lead | Open — check Settings → Branches |
