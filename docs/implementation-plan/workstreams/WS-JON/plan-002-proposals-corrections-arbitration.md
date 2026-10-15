# WS-JON · Plan 2 — Proposals, Rule-Detected Instructions, Corrections and Arbitration in Chat

> **Local plan number: Plan 2 of 2 in WS-JON** · Unique ID: **`WS-JON-P2`** · Branch: `ws-jon/p2-proposals-corrections`

> **Repository context (updated 2026-10-13).** Work happens in `https://github.com/Kathir-M-03/FINNMIN-JFK-John` on a branch created from `main`, following [`development-workflow.md`](../../../development-workflow.md). Files marked *Modify*, *Keep*, *Delete*, *Move* or `[E]` belong to the **source baseline** — the application code described in [`baseline.md`](../../baseline.md). Per team decision **D-PLAN-3** (2026-10-13) the repository starts from that code at commit `fc0981d`; **until the source-baseline import commit is on `main` this plan cannot start** (one-time import by the team lead — see [`repository-migration-notes.md`](../../../repository-migration-notes.md) §5). One plan = one branch = one PR (D-PLAN-4). Statements below about what exists "on `main`" or "today" describe the source baseline, not the new repository's `main`.

## 1. Plan identity
| Field | Value |
| --- | --- |
| Workstream / local number / ID | WS-JON / **Plan 2** / `WS-JON-P2` |
| Owner / subagent | Dev C — AI Engineer |
| Objective | Complete John's write-adjacent behaviour safely: specialist proposals become `CARD` blocks via `actionService.createProposal` (no tokens); rule-detected T1 instructions execute with an intent token and return `UNDO`; router-only T1 intents become `CHIP`s; typed "yes" never executes T2/T3; categorization corrections from chat (John §B.10); arbitration and the Iris→Atlas dependency edge |
| Expected outcome | Fake-LLM integration tests for: card flow, T1 with Undo, typed-yes refusal, chat correction affecting the next answer, arbitration flag, dependency edge |
| Size | ~1 day |

## 2. Dependencies
| Type | Source | Needed | Early start |
| --- | --- | --- | --- |
| implementation | WS-JON-P1 | Chat lifecycle, SSE | No |
| implementation | WS-PLT-P1 | `createProposal`, `confirmAndExecute`, `issueIntentToken`, `executeT1` | Yes — block rendering first |
| implementation | WS-CAT-P3 | `listTransactions`, correction executors, `addReviewItem` | Yes |

**Parallel with:** WS-AGT-P2, WS-UI-P2.
**Unblocks:** WS-UI-P3 (cards/chips/undo), WS-FND-P6.

## 3. Scope
**In:** proposal binding (params exactly as validated; `validation_tool_result_id` required); CARD block with `proposal_id`, `params_hash`, rendered grounded summary, warnings, `requires_ack`; deterministic instruction detector for T1 (`DISMISS_ALERT`, `UPDATE_PREFERENCE`, `RECATEGORIZE_TRANSACTION` scope TRANSACTION, `CONFIRM_CATEGORY`) → `issueIntentToken` + `executeT1` → `UNDO` block; router-only T1 → `CHIP`; T2 instructions (`UPDATE_PROFILE`, merchant-scope recategorize, `CREATE_CATEGORY_RULE`) → card; typed confirmations ("yes", "do it") never execute — reply points to the card; transaction search for corrections (C.6 groundable source); `addReviewItem` for specialist hints; conflict rule arbitration flag (John §B.7) and dependency-edge scheduling (PeerHint → `ATLAS HANDLE_PEER_FINDING`, max one hop).
**Tier cut (D-PLAN-9):** if the end-of-D5 checkpoint cuts Tier 3, skip the dependency edge (PeerHint → ATLAS `HANDLE_PEER_FINDING`); arbitration stays (Tier 2).
**Out:** UI rendering (WS-UI-P3); `RESTORE_GOAL` via chat (deferred).

## 4. Files and ownership
| File | Action | Purpose | Ownership | Shared-file risk |
| --- | --- | --- | --- | --- |
| `backend/src/agents/john/{proposals,instructions,corrections,arbitration}.js` | Create | Logic per scope item | WS-JON | Low |
| `backend/src/agents/john/routing/instruction-rules.json` | Create | Deterministic T1/T2 instruction patterns | WS-JON | Low |
| `backend/src/agents/john/index.js` | Modify | Wire steps into lifecycle | WS-JON | Low |
| `backend/test/john/*.test.js`, `backend/test/integration/chat-*.test.js`, fixtures | Create | Tests | WS-JON | Low |

## 5. Interfaces and contracts
- CARD block: `{type:'CARD', proposal_id, action, tier, title, body (grounded), params_hash, warnings[], requires_ack, expires_at}` — confirm happens only via `POST /api/v1/proposals/:id/confirm` from the UI (WS-PLT-P1).
- CHIP block: `{type:'CHIP', label, action, params}` → UI posts `/actions` (T1) on tap.
- UNDO block: `{type:'UNDO', action_id, undo_available_until}`.
- Origins: proposals from specialists `CHAT_PROPOSAL`; rule-detected instructions `CHAT_INSTRUCTION`.

## 6. Implementation steps
1. Proposal binding and card rendering with grounding; drop proposals from non-proposers or with unvalidated params.
2. Instruction detector rules + tests (high-precision patterns only; ambiguous → CHIP or QUESTION).
3. T1 execution path with intent token; UNDO block.
4. Typed-confirmation refusal: messages matching confirmation phrases while a card is open produce a NOTICE "Tap Confirm on the card", no execution (S-4, P-AC-13).
5. Corrections: resolve transaction reference via `listTransactions` (merchant/date/amount); ambiguity → QUESTION listing candidates; scope TRANSACTION → T1, MERCHANT → card with dry-run counts.
6. After a correction, next answer uses new `categorization_version` (snapshot on next request).
7. Arbitration flag and dependency edge per John §B.5/§B.7 (single hop, budgeted).
8. Integration tests with fakes.

## 7. Edge cases
| Case | Handling |
| --- | --- |
| Two proposals for the same target | Later supersedes earlier (Action Service); only latest card shown |
| Card expired when user taps | UI gets `EXPIRED`; John offers to re-propose |
| Correction target ambiguous (two Spencer's rows) | QUESTION with candidates (grounded) |
| Instruction for a protected-category cap reduction | Card with ack requirement; never `override_protected` from `CHAT_PROPOSAL` |
| Specialist hint "this looks miscategorised" | `addReviewItem` only (CAT-AC-18) |

## 8. Constraints
- No token ever reaches the LLM or the chat transcript.
- Instruction rules are deterministic; the LLM router alone can only produce CHIPs for T1 and cards for T2/T3.

## 9. Test plan
| Test | Command |
| --- | --- |
| `test/john/proposals.test.js` | `npm --prefix backend test` |
| `test/john/instructions.test.js` | same |
| `test/john/typed-yes.test.js` (P-AC-13) | same |
| `test/integration/chat-correction.test.js` (P-AC-09) | same |
| `test/integration/chat-arbitration.test.js`, `chat-dependency-edge.test.js` | same |

## 10. Acceptance criteria
**Plan:** tests green; no execution path from chat text to T2/T3.
**Workstream:** WS-JON accepted per checklist §3.
**Integration:** G4 complete list; P-AC-07, P-AC-09, P-AC-11, P-AC-13.

## 11. Risks and recovery
| Risk | Recovery |
| --- | --- |
| Instruction detector false positive | High-precision rules only; everything else CHIP; undo available for T1 |
| CAT-P3 late | Corrections feature behind `QUESTION` "use the transaction list" until merged; Tier 2 still demonstrable |

## 12. Assumptions and unresolved questions
- [A] Prototype action subset (Doc 4 §8.1).

## 13. Completion handoff
README template; block examples; instruction rule list. Next eligible: **WS-UI-P3**, WS-FND-P6.
