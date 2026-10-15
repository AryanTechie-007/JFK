# WS-UI · Plan 1 — Five-Workspace Shell, Single API Client and Shared Components

> **Local plan number: Plan 1 of 3 in WS-UI** · Unique ID: **`WS-UI-P1`** · Branch: `ws-ui/p1-workspace-shell`

> **Repository context (updated 2026-10-13).** Work happens in `https://github.com/Kathir-M-03/FINNMIN-JFK-John` on a branch created from `main`, following [`development-workflow.md`](../../../development-workflow.md). Files marked *Modify*, *Keep*, *Delete*, *Move* or `[E]` belong to the **source baseline** — the application code described in [`baseline.md`](../../baseline.md). Per team decision **D-PLAN-3** (2026-10-13) the repository starts from that code at commit `fc0981d`; **until the source-baseline import commit is on `main` this plan cannot start** (one-time import by the team lead — see [`repository-migration-notes.md`](../../../repository-migration-notes.md) §5). One plan = one branch = one PR (D-PLAN-4). Statements below about what exists "on `main`" or "today" describe the source baseline, not the new repository's `main`. Screen-level UI design: [`07-ui-screens-and-interactions.md`](../../../prototype-design/07-ui-screens-and-interactions.md) (generated 2026-10-13; awaiting team approval, TD-05).

## 1. Plan identity
| Field | Value |
| --- | --- |
| Workstream / local number / ID | WS-UI — Frontend Workspaces & Desktop Shell / **Plan 1** / `WS-UI-P1` |
| Owner / subagent | Dev D — Workspaces & Analytics Engineer / WS-UI subagent |
| Objective | Reshape the React app to the SC §18 / D-025 map: five nav items (John, Atlas, Nova, Iris, Sentinel) + Settings from the avatar menu; move views into `src/workspaces/**`; remove mock data and `geminiService`; one API client on `/api/v1` with SC canonical action names and the new proposal/confirm flow; shared Card/Chip/Notice/Undo/Disabled components (gap G-9, conflict C-5 UI side) |
| Expected outcome | Electron app boots against port 4000 only for the five workspaces; zero imports of `src/data/mock*`, `geminiService`, Backend B modules from the moved views; T2/T3 form submissions use `POST /proposals` → card → `POST /proposals/:id/confirm` |
| Size | ~1.5 days |

## 2. Dependencies
| Type | Source | Needed | Early start |
| --- | --- | --- | --- |
| interface | WS-FND-P1 | Route paths unchanged by split | Yes (D1) |
| interface | WS-SEN-P2 | HTTP view schemas for `/workspaces/*` | Yes — build against the current response shapes and Doc 2 §6; WS-SEN-P2 (same developer, D4–D5) publishes the schemas and WS-UI-P2 adopts them |
| interface | WS-PLT-P1 | `/proposals`, `/proposals/:id/confirm`, `/proposals/:id/decline`, `/actions` contracts and canonical names | Yes — contract in Doc 2 §6 |

**Parallel with:** WS-FND-P2/P3, WS-CAT-P1, WS-SEN-P1.
**Unblocks:** WS-UI-P2, WS-UI-P3, WS-FND-P5.

## 3. Scope
**In:** nav and routing in `App.jsx`/`Sidebar.jsx`; Header/AgentStatusBadge without mocks (live from `/api/v1/health` + `/notifications` count); move `AtlasStrategistView`, `NovaGuardianView`(+css), `IrisAdvisorView`, `SentinelPredictorView`, `JohnCoachDashboard`, `WorkspaceChatPanel` into `src/workspaces/{atlas,nova,iris,sentinel,john}/` and `src/components/`; `workspaceService` becomes `src/services/api/v1.js` (single client, JWT, ErrorBody handling); Atlas off `goalService` (legacy); action calls switched to canonical names and proposal flow; shared components; formatting helpers display-only (`formatMinorInr`, `formatBpPct`) — **no money arithmetic in the frontend** (P-AC-05); deferred controls disabled with label "Not in prototype".
**Out:** Sentinel workspace rebuild and Settings (P2); chat SSE UX (P3); retiring Home/Subscriptions/Analyser/Health views (moved into Sentinel in P2; Health retired — health score is a John answer).

## 4. Files and ownership
| File | Action | Purpose | Ownership | Shared-file risk |
| --- | --- | --- | --- | --- |
| `src/App.jsx`, `src/components/Sidebar.jsx`, `Header.jsx`, `AgentStatusBadge.jsx` | Modify | Five nav items; avatar → Settings; no mocks | WS-UI | Medium |
| `src/workspaces/{john,atlas,nova,iris,sentinel}/**` | Create (moves) | Workspace views | WS-UI | Low |
| `src/agents/*/*.jsx`, `src/tools/sentinel/*.jsx` | Delete (after move) | Old locations; non-JSX files stay for WS-FND-P5 to delete | WS-UI | Low |
| `src/services/api/v1.js` | Create | Single client: `get/post`, SSE helper stub, error mapping | WS-UI | Low |
| `src/services/workspaceService.js` | Modify → thin re-export of `api/v1.js` (removed in P3) | Transitional | WS-UI | Low |
| `src/services/geminiService.js`, `src/data/mockFinancialData.js`, `src/data/mockNovaData.js` | Delete | No mocks (P-AC-01) | WS-UI | Low |
| `src/components/ui/{ProposalCard,ActionChip,Notice,UndoBar,DisabledControl,DataQualityBadge}.jsx` | Create | Shared UI blocks matching ChatResponse block types | WS-UI | Low |
| `src/lib/format.js` | Create | Display formatting only (Indian grouping, bp → %) | WS-UI | Low |
| `eslint/oxlint` rule config (`.oxlintrc.json`) | Create/modify | Forbid arithmetic on identifiers ending `_minor` in `src/` (best-effort lint) | WS-UI (FND reviews CI) | Low |

## 5. Interfaces and contracts
- Client calls only `/api/v1/*` (Doc 2 §6). Action names = SC §13.2.
- T2/T3 form submit: `POST /proposals {action, params}` → render `ProposalCard` from response (`params_hash`, warnings, `requires_ack`) → Confirm → `POST /proposals/:id/confirm {params_hash, ack}` → render `ActionResult@1` (status-specific messages from `constraint-messages`).
- T1 taps: `POST /actions {action, params, idempotency_key}` (UUID per tap) → `UndoBar` when `undo_available_until`.
- Every displayed money value comes from a response field; the UI formats, never computes.

## 6. Implementation steps
1. Create `api/v1.js`; port `workspaceService` functions; add proposal/confirm/decline/actions/undo functions.
2. Shared components; `ProposalCard` handles `REJECTED_*`, `DUPLICATE`, `EXPIRED` states.
3. Move views to `src/workspaces/**`; fix imports; delete old JSX locations.
4. Atlas: replace `goalService` calls with v1 workspace + proposals; Nova: rebalance via `/workspaces/nova/rebalance` (returns proposal) → card; cap edits → proposals.
5. Remove mocks; Header/Badge read health and notification count. In the moved John view, delete the `askGeminiJohn` fallback and the `geminiService` import so it calls only `/api/v1/chat` (non-streaming) until WS-UI-P3; `conversationService.js` stays until WS-UI-P3 rebuilds the John view.
6. Navigation: John, Sentinel, Nova, Atlas, Iris; Settings via avatar; temporarily route old Home/Analyser/Subscriptions views under Sentinel tab sections until P2 rebuilds them; remove Financial Health page.
7. Mark deferred controls with `DisabledControl` — the Doc 0 §3.2 list minus actions that already work in the source baseline (`RESTORE_GOAL` stays enabled — D-PLAN-5; see Doc 7 §8); category-rule editing and `UPDATE_DECLARED_BILL` are disabled. `REMOVE_CAP` is enabled once WS-PLT-P1 registers it.
8. Lint rule; build; manual run in Electron.

## 7. Edge cases
| Case | Handling |
| --- | --- |
| Token expired (401) | Redirect to login; preserve route |
| Proposal `REJECTED_VALIDATION` | Card shows rule messages; no retry loop |
| Double-click Confirm | Button disabled after first click; server returns `DUPLICATE` anyway |
| Backend down | Global Notice "Service unavailable"; workspaces show retry |
| Empty data (`INSUFFICIENT_DATA`) | Empty state with data-quality badge, no zeros fabricated |

## 8. Constraints
- No mocks, no Gemini, no Backend B calls. No money arithmetic. Only `src/**` files (WS-UI ownership).

## 9. Test plan
| Test | Command |
| --- | --- |
| Build | `npm run build` |
| Lint (incl. `_minor` rule, no `data/mock` import) | `npx oxlint` |
| Grep gate | `git grep -n -e "data/mock" -e "geminiService" -e "localhost:4001" -- src/workspaces src/components src/App.jsx` → empty |
| Manual Electron walkthrough of five workspaces (recorded checklist in PR) | `npm run app` |
| Backend contract tests for used routes (owned by SEN/PLT) | `npm --prefix backend test` |

## 10. Acceptance criteria
**Plan:** five nav items + Settings; no mocks/Gemini; proposal flow used for all T2/T3 forms; build/lint green.
**Workstream:** shell for P2/P3.
**Integration:** G2 "five workspaces + Settings render from `/api/v1`"; P-AC-05 (UI side), P-AC-20 (partial).

## 11. Risks and recovery
| Risk | Recovery |
| --- | --- |
| Backend proposal routes not merged yet | Feature flag in client: fall back to `/actions/propose` alias (removed when PLT-P1 merges) |
| View move breaks CSS imports | Move CSS with views; visual check |

## 12. Assumptions and unresolved questions
- [A] Deferred controls list = Doc 4 §8.1 "all other registry actions"; the screen-level list is Doc 7 §8.
- [U] Q-UI-02 (nav order: SC §18 vs step 6 of this plan), Q-UI-06 (money input parsing vs the `_minor` lint rule), Q-UI-10 (Iris slider ranges) — `docs/team-decisions.md`.

## 13. Completion handoff
README template; screenshots of five workspaces; list of deleted UI files. Next eligible: **WS-UI-P2, WS-UI-P3**; partial input to WS-FND-P5.
