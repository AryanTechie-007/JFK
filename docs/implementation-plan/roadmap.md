# Shared Project Roadmap

Schedule uses relative working days **D1–D9** for **four developers** (Dev A–Dev D, `workstream-assignments.md` §2). The hackathon length is unresolved (U-1); if fewer days are available, cut by tier (§5), never by skipping a gate. The earlier D1–D6 schedule assumed six developers and is superseded.

## 1. Workstream inventory
| Workstream | Developer | Objective | Local plans | Key dependencies | Integration checkpoint |
| --- | --- | --- | --- | --- | --- |
| WS-FND | Dev A | Test/CI, route split, schema, events, tool-result store, LLM adapter, demo data, legacy retirement, E2E | P1–P6 | None to start; P5/P6 need all | G1 (P1), G2 (P2/P3), G5 (P4/P5), G6–G7 (P6) |
| WS-CAT | Dev B | Categorizer conformance, canonical ingestion, corrections via Action Service | P1–P3 | WS-FND-P1/P2/P3, WS-PLT-P1/P2 (interfaces), WS-FND-P4 | G3 (P1), G4 (P3), G5 (P2) |
| WS-SEN | Dev D | 17 functions golden-tested, one rule library, view contracts | P1–P2 | WS-FND-P1/P3 | G3 (P1), G5 (P2) |
| WS-PLT | Dev B | Consent-safe Action Service, event-driven Monitor, Profile | P1–P2 | WS-FND-P2/P3, WS-SEN-P1 (interface) | G3 (P1/P2) |
| WS-AGT | Dev C | Runner + LLM Atlas/Nova/Iris with deterministic fallback | P1–P3 | WS-FND-P3, WS-SEN-P1; U-2 for P3 | G4 (P1), G5 (P2), G6 (P3) |
| WS-JON | Dev C | LLM router/synthesis, grounding gate, streaming, consent, proposals, corrections | P1–P2 | WS-FND-P3, WS-AGT-P1 (interface), WS-PLT-P1, WS-CAT-P3 | G4 (P1/P2) |
| WS-UI | Dev D | Five workspaces, no mocks, chat UX, desktop | P1–P3 | WS-FND-P1, WS-SEN-P2, WS-PLT-P1/P2, WS-CAT-P2/P3, WS-JON-P1/P2 | G2 (P1), G5 (P2/P3) |

## 2. Milestones
| Milestone | Content | Target |
| --- | --- | --- |
| M0 — Contracts agreed | Specs + design + this package on `main`; harness, CI, route split; contract PRs opened (HTTP view schemas, Chat schemas) | End D1 |
| M1 — Skeleton integrated | Migrations, dispatcher, tool-result store, LLM adapter (fake), CI green; five-workspace shell renders its views from `/api/v1` | End D3 |
| M2 — Deterministic core proven | Categorizer + Sentinel conformance, consent-safe actions, event-driven alerts | End D4 |
| M3 — AI layer integrated | Runner + Nova + John on fake LLM; proposals → confirm → propagation; corrections in chat | End D7 |
| M4 — End-to-end prototype | Sentinel workspace, chat UX, canonical ingestion, demo data, legacy removed | End D8 |
| M5 — Verified and accepted | E2E fake (+ live if U-2), security/reliability, acceptance checklist | End D9 |

## 3. Dependency graph (unique IDs; solid = implementation, dashed = interface/decision)
```mermaid
flowchart LR
  FND1[WS-FND-P1 Baseline + route split] --> FND2[WS-FND-P2 Migrations]
  FND2 --> FND3[WS-FND-P3 Events, tool store, LLM adapter]
  FND2 --> FND4[WS-FND-P4 Demo dataset]
  FND1 --> CAT1[WS-CAT-P1 Categorizer conformance]
  FND1 --> SEN1[WS-SEN-P1 Sentinel conformance]
  FND3 -.-> CAT1
  FND3 -.-> SEN1
  CAT1 --> CAT2[WS-CAT-P2 Canonical ingestion]
  CAT1 --> CAT3[WS-CAT-P3 Corrections + golden eval]
  FND2 --> CAT2
  FND4 --> CAT3
  SEN1 --> SEN2[WS-SEN-P2 Rule parity + view contracts]
  FND1 --> SEN2
  FND2 --> PLT1[WS-PLT-P1 Consent-safe Action Service]
  FND3 -.-> PLT1
  SEN1 -.-> PLT1
  PLT1 --> PLT2[WS-PLT-P2 Event-driven Monitor + Profile]
  FND3 --> PLT2
  PLT2 -.-> CAT2
  PLT1 -.-> CAT3
  FND3 --> AGT1[WS-AGT-P1 Runner + Nova]
  SEN1 -.-> AGT1
  AGT1 --> AGT2[WS-AGT-P2 Atlas + Iris]
  AGT2 --> AGT3[WS-AGT-P3 Live evaluation]
  U2{{Decision U-2 Qwen endpoint}} -.-> AGT3
  FND3 --> JON1[WS-JON-P1 Router, synthesis, streaming]
  AGT1 -.-> JON1
  JON1 --> JON2[WS-JON-P2 Proposals, corrections, arbitration]
  PLT1 --> JON2
  CAT3 --> JON2
  FND1 -.-> UI1[WS-UI-P1 Five-workspace shell]
  SEN2 -.-> UI1
  PLT1 -.-> UI1
  UI1 --> UI2[WS-UI-P2 Sentinel workspace + Settings]
  CAT2 --> UI2
  CAT3 --> UI2
  PLT2 --> UI2
  SEN2 --> UI2
  UI1 --> UI3[WS-UI-P3 Chat UX + desktop]
  JON1 --> UI3
  JON2 --> UI3
  PLT1 --> UI3
  CAT2 -.-> FND4
  UI1 --> FND5[WS-FND-P5 Legacy retirement]
  UI2 --> FND5
  UI3 --> FND5
  JON1 --> FND5
  CAT2 --> FND5
  PLT1 --> FND5
  FND3 --> FND5
  FND4 --> FND6[WS-FND-P6 E2E + acceptance]
  FND5 --> FND6
  CAT3 --> FND6
  SEN2 --> FND6
  PLT2 --> FND6
  AGT2 --> FND6
  JON2 --> FND6
  AGT3 -.-> FND6
  PLT1 -.-> FND4
  JON1 -.-> AGT3
  AGT2 -.-> JON2
  SEN1 -.-> PLT2
  UI2 --> FND6
  UI3 --> FND6
```

**Critical path (dependencies only):** `WS-FND-P1 → WS-FND-P2 → WS-FND-P3 → WS-JON-P1 → WS-JON-P2 → WS-UI-P3 → WS-FND-P5 → WS-FND-P6`. `WS-JON-P2` also waits on `WS-CAT-P3` and `WS-PLT-P1`. A second implementation chain of equal length runs `WS-FND-P1 → WS-FND-P2 → WS-FND-P4 → WS-CAT-P3 → WS-JON-P2 → …`; matrix #13 shortens it (WS-CAT-P3 can start on its own 30-row fixture). Interface edges (dashed) never block: they only fix contracts.

**Critical chain with four developers (resources included):** Dev D's queue `WS-UI-P1 → WS-SEN-P1 → WS-SEN-P2 → WS-UI-P2 → WS-UI-P3`, followed by `WS-FND-P5 → WS-FND-P6`. Dev D has the least slack (≈ 0.5 day); protect it with the contingency rule in `workstream-assignments.md` §2.3.

## 4. Execution schedule (four developers)
"am"/"pm" = first/second half of the day. **Bold** = plan completes (merged to `main`). "Contract step" = only the contract PR of a later plan.

| Day | Dev A (WS-FND) | Dev B (WS-CAT, WS-PLT) | Dev C (WS-JON, WS-AGT) | Dev D (WS-SEN, WS-UI) | Gate |
| --- | --- | --- | --- | --- | --- |
| D1 | **WS-FND-P1** (docs merge, harness + CI PR by midday, route split PR by end of day) | Test design for WS-CAT-P1 (pm, after harness PR) | WS-JON-P1 step 1: `ChatRequest/ChatResponse/RouterOutput` contract PR; routing rules | WS-SEN-P2 step 1: HTTP view-schema contract PR (am); WS-UI-P1 start | **G1** |
| D2 | **WS-FND-P2** (am); WS-FND-P3 start | **WS-CAT-P1** (am); WS-PLT-P1 step 1 contract PR + WS-CAT-P2 step 1 contract PR (pm); WS-PLT-P1 start | WS-JON-P1 against local fake adapter | **WS-UI-P1** | — |
| D3 | **WS-FND-P3** (end of day) | WS-PLT-P1 | WS-JON-P1 (switch to real adapter as soon as WS-FND-P3 merges) | WS-SEN-P1 | **G2** |
| D4 | **WS-FND-P4** | **WS-PLT-P1** merged in the morning (rebased on FND-P3); **WS-PLT-P2** (full day) | **WS-JON-P1** (am); WS-AGT-P1 start | **WS-SEN-P1** (am); WS-SEN-P2 | **G3** |
| D5 | Integration lead: daily builds, reviews (Template C), WS-FND-P6 scaffolding | **WS-CAT-P2** | **WS-AGT-P1** | **WS-SEN-P2** (am); WS-UI-P2 start | — |
| D6 | Integration lead; WS-FND-P5 pre-checks (inventory of legacy imports) | **WS-CAT-P3** | WS-JON-P2 (corrections wired when CAT-P3 merges) | WS-UI-P2 | — |
| D7 | WS-FND-P5 start (backend + Electron parts) | Fixes, FND-P5 co-authoring (sync removal) | **WS-JON-P2** (am); WS-AGT-P2 | **WS-UI-P2** (am); WS-UI-P3 | **G4** |
| D8 | **WS-FND-P5** (after WS-UI-P3 merges); WS-FND-P6 start | Fixes | **WS-AGT-P2** (am); WS-AGT-P3 if U-2 answered | **WS-UI-P3** (am); fixes | **G5** |
| D9 | **WS-FND-P6** | Fixes | **WS-AGT-P3** or "blocked by U-2" | Desktop walkthrough evidence, fixes | **G6**, **G7** |

**Rules for this schedule**
- Same local plan number on the same day means nothing; developers follow their own execution order (`workstream-assignments.md` §2.1).
- A plan can start before its "implementation" dependency merges only where `cross-workstream-dependencies.md` says *Early start: Yes*, and only against the contract — never against an invented interface.
- If any plan slips more than half a day, the owner says so at the stand-up; Dev A updates `tracking/STATUS.md` and applies the contingency rules (`workstream-assignments.md` §2.3) or the tier cut (§5).

## 5. Scope tiers under time pressure (from prototype design Doc 6 §6)
| Tier | Plans that must be complete |
| --- | --- |
| 1 (architecture proven without AI) | WS-FND-P1–P4, WS-CAT-P1, WS-SEN-P1, WS-PLT-P1, WS-PLT-P2, WS-UI-P1, minimal WS-FND-P6 E2E (no chat) |
| 2 (AI layer) | + WS-AGT-P1, WS-JON-P1, WS-JON-P2, WS-UI-P3, WS-CAT-P3 |
| 3 (complete prototype) | + WS-AGT-P2, WS-AGT-P3, WS-CAT-P2, WS-SEN-P2, WS-UI-P2, WS-FND-P5 |

## 6. Integration gates
| Gate | Entry criteria | Verified by | Owner |
| --- | --- | --- | --- |
| G1 Contract agreement (end D1) | `docs/specifications` + `docs/prototype-design` + this package on `main`; harness + CI live; route files split with ownership in CODEOWNERS; HTTP view-schema and Chat-schema contract PRs open; decisions C-1, C-5, D-PLAN-2, U-4 answered or defaulted; U-2 owner named | Checklist in `acceptance-checklist.md` §2 | WS-FND |
| G2 Skeleton integration (end D3) | `npm --prefix backend test` green in CI on temp DBs; migrations reproduce today's schema; dispatcher delivers a test event; `llm.complete` works with `fake` under test; Electron boots and the five nav items + Settings render their workspace views from `/api/v1` (Backend B may still run until WS-FND-P5) | CI run + manual Electron smoke | WS-FND |
| G3 Core deterministic loop (end D4) | Ingest (existing `/ingest/batch`) → categorization → `categorization.updated` → Monitor alert (no LLM) → Nova view; proposal → confirm → executed; T2 cannot execute without confirm token | Integration tests in CAT, SEN, PLT plans | WS-PLT (coordinates) |
| G4 Cross-component behaviour (end D7) | Chat with fake LLM: single specialist, parallel specialists, arbitration, rule-detected T1 with Undo, typed "yes" refused; correction propagates to next answer | `backend/test/integration/chat-*.test.js` | WS-JON |
| G5 End-to-end prototype (end D8) | Demo journey steps 1–10 (Doc 6 §5) pass with the fake provider via E2E test; legacy code removed; UI shows no mocks | `backend/test/e2e/demo-journey.test.js` | WS-FND |
| G6 Regression/security/reliability (D9) | Security suite (Doc 5 S-1…S-16), failure injection, restart persistence, live suite (if U-2 answered) | `WS-FND-P6` reports | WS-FND |
| G7 Final acceptance (D9) | P-AC-01…P-AC-20 | `acceptance-checklist.md` signed by team lead | Team lead |
