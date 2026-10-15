# WS-PLT · Plan 1 — Consent-Safe Action Service

> **Local plan number: Plan 1 of 2 in WS-PLT** · Unique ID: **`WS-PLT-P1`** · Branch: `ws-plt/p1-consent-safe-actions`

> **Repository context (updated 2026-10-13).** Work happens in `https://github.com/Kathir-M-03/FINNMIN-JFK-John` on a branch created from `main`, following [`development-workflow.md`](../../../development-workflow.md). Files marked *Modify*, *Keep*, *Delete*, *Move* or `[E]` belong to the **source baseline** — the application code described in [`baseline.md`](../../baseline.md). Per team decision **D-PLAN-3** (2026-10-13) the repository starts from that code at commit `fc0981d`; **until the source-baseline import commit is on `main` this plan cannot start** (one-time import by the team lead — see [`repository-migration-notes.md`](../../../repository-migration-notes.md) §5). One plan = one branch = one PR (D-PLAN-4). Statements below about what exists "on `main`" or "today" describe the source baseline, not the new repository's `main`.

## 1. Plan identity
| Field | Value |
| --- | --- |
| Workstream / local number / ID | WS-PLT — Action Service, Profile & Budget Monitor / **Plan 1** / `WS-PLT-P1` |
| Owner / subagent | Dev B — Data & Write-Path Engineer / WS-PLT subagent |
| Objective | Close security gap G-2 and conflict C-5: confirmation tokens issued only when the user confirms a card; T2/T3 never executable in one call; T1 only with an intent token; SC §13.2 canonical action names with a temporary alias table; executor registration so each store's owner executes its own writes; full SC §13.6 algorithm with outbox events |
| Expected outcome | `createProposal`, `confirmAndExecute`, `declineProposal`, `issueIntentToken`, `executeT1`, `undo`, `registerExecutor` exported; routes `POST /proposals`, `/proposals/:id/confirm`, `/proposals/:id/decline`, `POST /actions`, `/actions/:id/undo`; old `/actions/propose`/`/actions/execute` return `410 GONE` for T2/T3 auto-execute |
| Size | ~1.5 days |

## 2. Dependencies
| Type | Source | Needed | Early start |
| --- | --- | --- | --- |
| implementation | WS-FND-P2 | `intent_tokens` table | Yes — fallback `300_intent_tokens.sql` (CREATE TABLE IF NOT EXISTS) |
| interface | WS-FND-P3 | `events.append`, `snapshot.assertCurrent`, `contracts.validate` | Yes |
| interface | WS-SEN-P1 | Rule output `{verdict, rule_codes, warnings}` | Yes (frozen in spec) |

**Parallel with:** WS-CAT-P2, WS-SEN-P2, WS-AGT-P1, WS-JON-P1.
**Unblocks:** WS-PLT-P2; WS-CAT-P3 (executor registration); WS-JON-P2; WS-UI-P1 (interface), WS-UI-P3; WS-FND-P4 (seed via actions, interface); WS-FND-P5.

## 3. Scope
**In:** token model (SC §13.4); proposal lifecycle (SC §13.3) incl. expiry 30 min and supersession; execution algorithm steps 1–11 (SC §13.6) incl. idempotency, base-version staleness, rule re-validation via Sentinel `rules`, policy checks (tier vs origin, proposer allowlist, `override_protected` stripping on `CHAT_PROPOSAL`), single transaction with executor + ledger + versions + outbox, re-read verification and `reconcile_action` job; T1 undo (24 h); rate limits (S-15: 30 proposals/h, 60 actions/h); canonical names + alias table; plan-store executors (goals, caps, overrides, rebalance) moved into `platform/plan-store.js`; profile/preference executors registered by Profile (`platform/profile.js`); alert executors by Budget Monitor (stub registration, finished in P2).
**Out:** categorization executors (WS-CAT-P3 registers them); UI changes (WS-UI); John flows (WS-JON-P2).

## 4. Files and ownership
| File | Action | Purpose | Ownership | Shared-file risk |
| --- | --- | --- | --- | --- |
| `backend/src/platform/action-service.js` | Modify (major) | Algorithm, tokens, registry dispatch; remove inline writes to other owners' tables | WS-PLT | **High** — WS-CAT-P3 edits the same file afterwards (sequenced) |
| `backend/src/platform/plan-store.js` | Create | Goal/cap/override/rebalance executors incl. `REMOVE_CAP` (in the Doc 4 §8.1 subset, not yet in the source baseline) and the existing `RESTORE_GOAL` (sole writer of `goals_v1`, `caps_v1`, `*_month_overrides`) | WS-PLT | Low |
| `backend/src/platform/tokens.js` | Create | Intent + confirmation token issue/verify/consume | WS-PLT | Low |
| `backend/src/shared/contracts/action-registry.js` | Modify | SC §13.2 names, tiers, proposers, direct initiators; prototype subset flag (Doc 4 §8.1) | WS-PLT | Medium — read by John/specialists |
| `backend/src/shared/contracts/action-aliases.js` | Create (temporary) | Old → SC name map (`CORRECT_TRANSACTION_CATEGORY`/`CONFIRM_TRANSACTION_CATEGORY`→`RECATEGORIZE_TRANSACTION`, `CONFIRM_PROVISIONAL_CATEGORY`→`CONFIRM_CATEGORY`, `SET_TRANSACTION_MOVEMENT_TYPE`→`SET_TRANSACTION_TYPE`, `CREATE_MANUAL_TRANSACTION`→`ADD_MANUAL_TRANSACTION`, `UPDATE_USER_PROFILE`→`UPDATE_PROFILE`, `UPDATE_USER_PREFERENCES`→`UPDATE_PREFERENCE`, `CREATE_DECLARED_BILL`→`ADD_DECLARED_BILL`, `SET_CATEGORY_WATCH`→`CREATE_ALERT`); every alias use logged with `trace_id`; deleted in WS-FND-P5 | WS-PLT | Low |
| `backend/src/shared/contracts/schemas/actions/*.json` | Create | Params schemas for plan/profile/alert actions | WS-PLT | Medium |
| `backend/src/routes/v1/actions.js` | Modify | New routes; retire auto-execute | WS-PLT | Low |
| `backend/src/routes/v1/workspaces-nova.js` | Modify (coordinated) | `/workspaces/nova/rebalance` creates proposal via `createProposal` (proposer USER) | WS-SEN owns → SEN approves | Low |
| `backend/src/routes/v1/settings.js` | Modify | Memory-fact delete stays a John store operation (not an action; SC §13.2 has no `DELETE_MEMORY_FACT`) — route calls `john.memory.deleteFact` | WS-PLT (JON reviews) | Low |
| `backend/test/actions/*.test.js` | Create | Tests | WS-PLT | Low |

## 5. Interfaces and contracts
```js
actionService.createProposal({action, params, origin, proposer, snapshotId, requestId, traceId}, session)
   -> Proposal@1 & {card}      // NO token in the response; rejected → {rejected:true, rule_codes}
actionService.confirmAndExecute(proposalId, {paramsHash, ack}, session) -> ActionResult@1   // issues + consumes confirmation token internally
actionService.declineProposal(proposalId, session) -> {state:'DECLINED'}
actionService.issueIntentToken({action, params, origin}, session) -> token      // WORKSPACE_API taps, John rule layer only
actionService.executeT1({action, params, intentToken, idempotencyKey, origin}, session) -> ActionResult@1
actionService.undo(actionId, session) -> ActionResult@1
actionService.registerExecutor(action, {applyChange(params, ctx, tx), dryRun?(params, ctx), undo(inverse, ctx, tx), validator?(state, params)})
// ActionCtx = {actionId, actor:'USER'|'SYSTEM'|'MIGRATION', userId, tenantId, idempotencyKey, traceId}  (Categorizer §K.2)
```
HTTP (Doc 2 §6): `POST /proposals {action, params}` (T2/T3 forms); `POST /proposals/:id/confirm {params_hash, ack?}` → `ActionResult@1`; `POST /proposals/:id/decline`; `POST /actions {action, params, idempotency_key}` (T1 taps; server issues intent token for the authenticated tap); `POST /actions/:id/undo`; `GET /actions/history`.

## 6. Implementation steps
1. Contract commit first: registry (canonical names), alias table, `ActionCtx`, executor contract, HTTP shapes. Open this PR as a Draft on D2 and get Dev C (WS-JON) and Dev D (WS-UI) approval of that commit before continuing (WS-CAT is the same developer).
2. `tokens.js` with HMAC-free random tokens stored hashed (`sha256`) in `confirmation_tokens`/`intent_tokens`; TTL 5 min / 2 min; single use.
3. Refactor `registerProposal` → `createProposal`: validate params schema, compute `params_hash` (canonical JSON), `base_versions`, run validator at creation, supersede previous proposals for the same target, **no token returned**.
4. `confirmAndExecute`: SC §13.6 steps 1–11; executor lookup; one transaction; `events.append(tx, userId, 'plan.changed', …)` (or executor's event); re-read verification; `reconcile_action` job via `jobs.enqueueJob`.
5. `executeT1` with intent token; `undo` for T1 within 24 h.
6. Move plan writes into `plan-store.js` and register; register Profile executors in `profile.js` (`UPDATE_PROFILE`, `UPDATE_PREFERENCE`, `ADD_DECLARED_BILL`, `DELETE_DECLARED_BILL`) — same owner (WS-PLT). `UPDATE_DECLARED_BILL` is deferred (Doc 0 §3.2) and not built. `RESTORE_GOAL` and `CREATE_ALERT` (← `SET_CATEGORY_WATCH`) are deferred in Doc 0 §3.2 but already exist in the source baseline and are used by its UI; they are migrated as-is, not extended (audit A-18). Confirmed by team decision D-PLAN-5 (2026-10-13).
7. Keep categorization case bodies callable until WS-CAT-P3 registers its executors (dispatcher prefers registered executors; fallback marked `TODO(WS-CAT-P3)`).
8. Routes; old `/actions/execute` with `action_type` for T2/T3 → `410 GONE` with ErrorBody `{code:'CONFIRMATION_REQUIRED'}`; `/actions/propose` → alias of `/proposals` for one sprint.
9. Rate limits (in-memory token bucket per user).
10. Switch validators to `rules.*` normalised names when WS-SEN-P2 lands.
11. Tests; handoff.

## 7. Edge cases
| Case | Handling |
| --- | --- |
| Double confirm / double tap | Idempotency key `<proposal_id>:<params_hash[0:12]>` → second returns `DUPLICATE` (P-AC-10) |
| Card shown with old params, user confirms after edit | `params_hash` mismatch → `REJECTED_AUTH`/token invalid |
| Plan changed between proposal and confirm | `REJECTED_STALE` (S-5) |
| Proposal from a specialist not allowed as proposer | `REJECTED_POLICY` |
| `override_protected` from `CHAT_PROPOSAL` | Stripped (D-016) |
| Proposal expired (30 min) | `EXPIRED` |
| Another user's proposal ID | 404 (`REJECTED_AUTH` internally) |
| Executor throws | Rollback → `FAILED_ROLLED_BACK`, no outbox row |
| Re-read mismatch | `EXECUTED_UNVERIFIED` + reconcile job |

## 8. Constraints
- LLMs never authorize (SC §13): no code path executes T2/T3 without `confirmAndExecute` from an authenticated HTTP confirm.
- Action Service is the only caller of executors; executors never open their own transactions.
- Alias table logs every use; zero alias uses expected after WS-UI-P1.

## 9. Test plan
| Test | Command |
| --- | --- |
| `test/actions/tokens.test.js` | `npm --prefix backend test` |
| `test/actions/lifecycle.test.js` (states, expiry, supersede, decline) | same |
| `test/actions/execute-algorithm.test.js` (each rejection status) | same |
| `test/actions/no-auto-execute.test.js` (S-4: token absent from create response; `/actions/execute` T2 → 410) | same |
| `test/actions/idempotency.test.js` (P-AC-10) | same |
| `test/actions/t1-undo.test.js` | same |
| `test/actions/aliases.test.js` | same |
| `test/actions/rate-limit.test.js` | same |
| Regression: ported legacy tests | same |

## 10. Acceptance criteria
**Plan:** all tests green; no token in proposal responses; T2/T3 only through confirm; executors registered for plan/profile actions; events emitted in-transaction.
**Workstream:** consent rules SC §13 enforced.
**Integration:** G3 "T2 cannot execute without confirm"; P-AC-08, P-AC-10, P-AC-13 (backend side).

## 11. Risks and recovery
| Risk | Recovery |
| --- | --- |
| UI breaks when auto-execute is retired | Ship routes first with UI switch in WS-UI-P1 on the same day; `/actions/propose` alias for one sprint |
| Conflict with WS-CAT-P3 in `action-service.js` | PLT-P1 merges first; CAT-P3 rebases |
| Legacy tests assert old one-call execution | Record conflict with spec (SC §13.1); team lead decides; do not silently delete |

## 12. Assumptions and unresolved questions
- [A] C-5 default: SC names canonical.
- [A] Memory-fact deletion is a John-store operation, not an Action (SC §5.12, §13.2).

## 13. Completion handoff
README template; list routes, registry diff, alias usage log sample. Next eligible: **WS-PLT-P2, WS-CAT-P3, WS-JON-P2, WS-UI-P3**; notify WS-UI-P1 and WS-FND-P4.
