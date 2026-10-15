# WS-UI · Plan 3 — Chat UX (Streaming, Cards, Chips, Undo), Alert Explain and Desktop Verification

> **Local plan number: Plan 3 of 3 in WS-UI** · Unique ID: **`WS-UI-P3`** · Branch: `ws-ui/p3-chat-ux-desktop`

> **Repository context (updated 2026-10-13).** Work happens in `https://github.com/Kathir-M-03/FINNMIN-JFK-John` on a branch created from `main`, following [`development-workflow.md`](../../../development-workflow.md). Files marked *Modify*, *Keep*, *Delete*, *Move* or `[E]` belong to the **source baseline** — the application code described in [`baseline.md`](../../baseline.md). Per team decision **D-PLAN-3** (2026-10-13) the repository starts from that code at commit `fc0981d`; **until the source-baseline import commit is on `main` this plan cannot start** (one-time import by the team lead — see [`repository-migration-notes.md`](../../../repository-migration-notes.md) §5). One plan = one branch = one PR (D-PLAN-4). Statements below about what exists "on `main`" or "today" describe the source baseline, not the new repository's `main`. Screen-level UI design: [`07-ui-screens-and-interactions.md`](../../../prototype-design/07-ui-screens-and-interactions.md) (generated 2026-10-13; awaiting team approval, TD-05).

## 1. Plan identity
| Field | Value |
| --- | --- |
| Workstream / local number / ID | WS-UI / **Plan 3** / `WS-UI-P3` |
| Owner / subagent | Dev D — Workspaces & Analytics Engineer / WS-UI subagent |
| Objective | Rebuild the John view and workspace chat panels on the SSE `ChatResponse@1` stream: render TEXT/NOTICE/LINK/QUESTION/CARD/CHIP/UNDO blocks, confirm cards through `/proposals/:id/confirm`, chips through `/actions`, degraded-mode notices; alert "Explain" opens John with `ALERT_OPEN`; verify the Electron desktop build end to end |
| Expected outcome | John view has no Gemini fallback; typed "yes" shows the card reminder; workspace panels send `ui_context.workspace`; desktop walkthrough of Doc 6 §5 steps 4, 6, 8, 10 recorded |
| Size | ~1 day |

## 2. Dependencies
| Type | Source | Needed | Early start |
| --- | --- | --- | --- |
| implementation | WS-UI-P1 | Shell, ProposalCard/ActionChip/UndoBar/Notice | No |
| interface → implementation | WS-JON-P1 | `POST /chat/messages` SSE, threads routes | Yes — build against John §C.2 schema |
| implementation | WS-JON-P2 | CARD/CHIP/UNDO blocks emitted | Yes |
| implementation | WS-PLT-P1 | Confirm/decline/actions endpoints | Yes |

**Parallel with:** WS-UI-P2, WS-FND-P5 preparation.
**Unblocks:** WS-FND-P5 (no `geminiService`), WS-FND-P6.

## 3. Scope
**In:** SSE client (`fetch` + `ReadableStream` parser; `EventSource` cannot POST); block renderer; thread list; `client_message_id` per send; cancel button (aborts fetch); degraded notice when `done.degraded`; consent-required state with link to Settings; alert Explain flow from Nova/Bell (`ChatRequest.kind = ALERT_OPEN`, `alert_id`); `WorkspaceChatPanel` on the same endpoint with `ui_context.workspace`; remove `workspaceService` transitional file; Electron verification.
**Out:** voice, attachments, push notifications.

## 4. Files and ownership
| File | Action | Purpose | Ownership | Shared-file risk |
| --- | --- | --- | --- | --- |
| `src/services/api/sse.js` | Create | POST-SSE parser with abort | WS-UI | Low |
| `src/workspaces/john/{JohnWorkspace,MessageList,BlockRenderer,ThreadList,Composer}.jsx` | Create (from `JohnCoachDashboard.jsx`) | Chat UX | WS-UI | Low |
| `src/components/WorkspaceChatPanel.jsx` | Modify | SSE + `ui_context` | WS-UI | Low |
| `src/components/FormattedText.jsx` | Modify | Render grounded text (no number formatting logic beyond display) | WS-UI | Low |
| `src/workspaces/nova/*`, `src/components/NotificationBell.jsx` | Modify | Explain → John `ALERT_OPEN` | WS-UI | Low |
| `src/services/workspaceService.js`, `src/services/conversationService.js` | Delete | Transitional re-export; legacy chat client (last importer rebuilt here) | WS-UI | Low |

## 5. Interfaces and contracts
- Request: `ChatRequest@1` exactly as defined in John §C.1 — `{thread_id, message, ui_context:{workspace,…}, trigger:{kind:'USER_MESSAGE'|'UI_ACTION'|'ALERT_OPEN', alert_id?, prompt_id?}, answer_to?, client_message_id}`. *(Corrected 2026-10-13: this line previously paraphrased the schema with different field names — `kind:'MESSAGE'`, `text` — which conflicted with the frozen spec; Q-UI-07 asks the team to confirm in the WS-JON-P1 contract commit (Draft PR, D1).)*
- Stream: `block` events then one `done {turn_id, trace_id, degraded}` (John §C.2). Unknown block types rendered as plain text with a console warning (forward compatibility).
- CARD confirm → `POST /proposals/:id/confirm {params_hash, ack}`; result rendered inline under the card; CHIP → `POST /actions`.

## 6. Implementation steps
1. SSE parser with tests in a small Node script (`node --test src/services/api/sse.test.mjs`) — pure function over chunks.
2. Block renderer using P1 components.
3. John workspace: threads, composer, cancel, degraded and consent states.
4. Workspace chat panels.
5. Alert Explain wiring.
6. Delete transitional client file and Gemini fallback remnants; grep gate.
7. Desktop verification: `npm run reset-demo && npm run app`; walk Doc 6 §5 steps 4, 6, 8, 10. `LLM_PROVIDER=fake` is test-only, so manual runs use Qwen from D3 (or the stand-in provider, D-PLAN-12); before D3, verify degraded mode and the deterministic fallbacks. Record which model was used.

## 7. Edge cases
| Case | Handling |
| --- | --- |
| Stream cut mid-way | Show partial blocks + "Response interrupted"; retry resends same `client_message_id` (server returns stored turn) |
| Card expired | Card shows "Expired — ask again" |
| User types "yes" | Server NOTICE displayed; card remains |
| Consent off | Composer disabled with link to Settings |
| Very long answer | Virtualised list not needed; cap thread view to last 50 turns + load more |

## 8. Constraints
- No LLM keys or provider calls in the frontend (S-1). No money arithmetic. Only WS-UI files.

## 9. Test plan
| Test | Command |
| --- | --- |
| SSE parser unit tests | `node --test src/services/api/sse.test.mjs` |
| Build + lint | `npm run build && npx oxlint` |
| Grep gate | `git grep -n -e "geminiService" -e "askGeminiJohn" -e "conversationService" -- src/` → empty |
| Desktop walkthrough (recorded) | `npm run app` |

## 10. Acceptance criteria
**Plan:** chat UX renders all block types; confirm/chip/undo paths work against backend; no Gemini; desktop walkthrough recorded.
**Workstream:** WS-UI accepted per checklist §3.
**Integration:** G5; P-AC-07, P-AC-13, P-AC-14 (UI), P-AC-20.

## 11. Risks and recovery
| Risk | Recovery |
| --- | --- |
| SSE through Electron/Vite proxy buffering | Disable proxy buffering; set `Cache-Control: no-cache`, `X-Accel-Buffering: no` (backend side, JON) |
| JON-P2 late | Cards/chips render from fixture stream; integrate when merged |

## 12. Assumptions and unresolved questions
- [D] D-PLAN-12: manual desktop runs use Qwen from D3, or the stand-in provider.
- [U] Q-UI-01 (Electron-only vs browser build) and Q-UI-07 (ChatRequest field names) — `docs/team-decisions.md` (TD-16, TD-15).

## 13. Completion handoff
README template; recording/screenshots of chat flows. Next eligible: **WS-FND-P5**, WS-FND-P6.
