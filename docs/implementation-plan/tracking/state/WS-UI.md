# Execution State — WS-UI (Frontend Workspaces & Desktop Shell)

Fed to every new coding session for this workstream (Template A `[STATE FILE]`). Keep it short and factual; append, do not rewrite history.

| Field | Value |
| --- | --- |
| Developer | Dev D |
| Branch prefix | `ws-ui/p<n>-<slug>` |
| Current plan | WS-UI-P1 (not started) |

## 1. Sequence overview
| Local | Plan ID | Title | Objective (short) | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| Plan 1 | WS-UI-P1 | Five-Workspace Shell, Single API Client and Shared Components | Reshape the React app to the SC §18 / D-025 map: five nav items (John, Atlas, Nova, Iris, Sentinel) + Settings from the avatar menu; move views into… | WS-FND-P1, WS-PLT-P1, WS-SEN-P2 | Blocked |
| Plan 2 | WS-UI-P2 | Sentinel Workspace and Settings | Build the Sentinel workspace per SC §18 (spending analyser, forecast and risk radar incl. declared bills, balances + data-quality badge, Needs-review list,… | WS-CAT-P2, WS-CAT-P3, WS-PLT-P2, WS-SEN-P2, WS-UI-P1 | Blocked |
| Plan 3 | WS-UI-P3 | Chat UX (Streaming, Cards, Chips, Undo), Alert Explain and Desktop Verification | Rebuild the John view and workspace chat panels on the SSE `ChatResponse@1` stream: render TEXT/NOTICE/LINK/QUESTION/CARD/CHIP/UNDO blocks, confirm cards through… | WS-JON-P1, WS-JON-P2, WS-PLT-P1, WS-UI-P1 | Blocked |

Plan files: `docs/implementation-plan/workstreams/WS-UI/`. Status of record: `tracking/STATUS.md`.

## 2. Interfaces this workstream consumes / produces
See the rows naming WS-UI in `cross-workstream-dependencies.md`. Record here the merged contract files as they land:
- (none merged yet)

## 3. Decisions and assumptions in force
- Defaults from `baseline.md` §5–§6 (C-1, C-5, D-PLAN-2, U-4) unless the decision log in `tracking/STATUS.md` says otherwise.

## 4. Handoff log (append Template E summaries, newest last)
- (empty)
