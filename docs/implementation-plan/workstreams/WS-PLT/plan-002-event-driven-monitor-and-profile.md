# WS-PLT · Plan 2 — Event-Driven Budget Monitor and Profile Conformance

> **Local plan number: Plan 2 of 2 in WS-PLT** · Unique ID: **`WS-PLT-P2`** · Branch: `ws-plt/p2-monitor-profile`

> **Repository context (updated 2026-10-13).** Work happens in `https://github.com/Kathir-M-03/FINNMIN-JFK-John` on a branch created from `main`, following [`development-workflow.md`](../../../development-workflow.md). Files marked *Modify*, *Keep*, *Delete*, *Move* or `[E]` belong to the **source baseline** — the application code described in [`baseline.md`](../../baseline.md). Per team decision **D-PLAN-3** (2026-10-13) the repository starts from that code at commit `fc0981d`; **until the source-baseline import commit is on `main` this plan cannot start** (one-time import by the team lead — see [`repository-migration-notes.md`](../../../repository-migration-notes.md) §5). One plan = one branch = one PR (D-PLAN-4). Statements below about what exists "on `main`" or "today" describe the source baseline, not the new repository's `main`.

## 1. Plan identity
| Field | Value |
| --- | --- |
| Workstream / local number / ID | WS-PLT / **Plan 2** / `WS-PLT-P2` |
| Owner / subagent | Dev B — Data & Write-Path Engineer / WS-PLT subagent |
| Objective | Make the Budget Monitor event-driven (gap G-3, ADR-04): react to `categorization.updated`, `plan.changed`, `balances.updated`, `period.rolled`; remove GET-time scans; daily scan and monthly rollover jobs; alerts/notifications routes. Bring the Profile Service to SC §5.1–5.5/5.8: accounts and balances upsert with precedence and staleness, preferences incl. LLM consent, declared bills |
| Expected outcome | Dining Warning alert appears after seeding with **zero LLM calls** (P-AC-06); a categorization change updates alerts via the dispatcher; `GET /alerts`, `/notifications`, `/profile`, `/preferences`, `/bills` routes |
| Size | ~1 day |

## 2. Dependencies
| Type | Source | Needed | Early start |
| --- | --- | --- | --- |
| implementation | WS-PLT-P1 | Executor registration (alert, profile, bill executors) | No |
| implementation | WS-FND-P3 | `events.subscribe`, dispatcher, `jobs` | Yes — handlers unit-tested by direct call |
| interface | WS-SEN-P1 | `sentinel_run_category_utilization`, `sentinel_run_velocity_projection` result shapes | Yes |

**Parallel with:** WS-CAT-P2, WS-AGT-P1, WS-JON-P1, WS-SEN-P2.
**Unblocks:** WS-CAT-P2 (Profile interface), WS-UI-P2 (routes), WS-FND-P6.

## 3. Scope
**In:** Monitor handlers + idempotency; alert state machine (SC §5.9: OPEN/ACKNOWLEDGED/RESOLVED/DISMISSED; kinds WARNING/BREACH/WATCH/VELOCITY); `CREATE_ALERT`/`DISMISS_ALERT` executors; daily scan job (IST), `PERIOD_ROLLOVER` (00:05 IST day 1: expire month overrides, resolve period alerts); `/demo/daily-scan` gated; Profile: `upsertAccounts`, `recordBalances` (precedence BANK > MANUAL, staleness flag per SC §5.2), `getProfile`, `getPreferences` (consent default **false** for new users, true in demo seed), declared bills CRUD executors; removal of `scanUserBudgets` calls from GET routes.
**Out:** notification push channels (in-app list only); legacy sync removal (WS-FND-P5).

## 4. Files and ownership
| File | Action | Purpose | Ownership | Shared-file risk |
| --- | --- | --- | --- | --- |
| `backend/src/platform/budget-monitor.js` | Modify | `onEvent`, `runDailyScan`, `listAlerts`, `dismiss`, rollover; subscribe at module load | WS-PLT | Medium |
| `backend/src/platform/profile.js` | Modify | `upsertAccounts`, `recordBalances`, `getProfile`, `getPreferences`, `listAccounts`, `balances`; bill executors | WS-PLT | Medium — CAT-P2 calls it |
| `backend/src/routes/v1/alerts.js` | Create | `GET /alerts?kind=&state=`, `GET /notifications`, `POST /demo/daily-scan` (gated) | WS-PLT | Low |
| `backend/src/routes/v1/settings.js` | Modify | `GET /profile`, `GET /preferences`, `GET /bills`; keep `/settings` aggregate until WS-UI-P2 switches | WS-PLT | Low |
| `backend/src/routes/v1/workspaces-nova.js`, `ingest.js` | Modify (coordinated) | Remove synchronous `scanUserBudgets` calls | WS-SEN / WS-CAT approve | Low |
| `backend/src/routes/v1/index.js` | Modify (1 line) | `router.use(require('./alerts'))` | WS-FND reviews | Low |
| `backend/src/db/migrations/310_monitor_profile.sql` | Create (if needed) | Alert unique key `(user_id, kind, subject, period)`; balances `as_of`, `source` | WS-PLT | Low |
| `backend/test/monitor/*.test.js`, `backend/test/profile/*.test.js` | Create | Tests | WS-PLT | Low |

## 5. Interfaces and contracts
```js
budgetMonitor.onEvent(Event@1)               // subscribed: categorization.updated, plan.changed, balances.updated, period.rolled
budgetMonitor.runDailyScan(userId) -> {alerts_created, alerts_resolved}
budgetMonitor.listAlerts({kind?, state?}, session) -> Alert@1[]
// emits alert.changed {alert_id, state, kind, subject, period} (consumed by John for notifications, WS-JON-P1)
profile.upsertAccounts(userId, [{account_ref, type, institution, masked_number}]) -> {[account_ref]: account_id}
profile.recordBalances(userId, [{account_id, balance_minor, as_of, source:'BANK'|'MANUAL'}]) -> void   // emits balances.updated
profile.getProfile(session); profile.getPreferences(session) -> Preferences (incl. llm_processing_consent)
profile.listAccounts(userId); profile.balances(userId, conn) -> [{account_id, balance_minor, as_of, stale:boolean}]
```
- Alert evaluation uses Sentinel functions through the gateway with `caller: 'BUDGET_MONITOR'` (allowlist SC §10.4); no LLM.
- Handlers are idempotent per `(event_id, handler)` and tolerate out-of-order events (compare `categorization_version`/`plan_version`).

## 6. Implementation steps
1. Write handler unit tests with hand-built events; implement `onEvent` recomputing utilization for affected `(category, period)` pairs only.
2. Alert state machine and dedupe key; `alert.changed` events.
3. Remove GET-time and ingest-time `scanUserBudgets` calls (coordinate PR approvals); keep `scanUserBudgets` as `runDailyScan` internals.
4. Jobs: daily scan 06:00 IST; `PERIOD_ROLLOVER` 00:05 IST day 1 as SYSTEM action through the Action Service.
5. Profile functions; balance precedence + staleness (> `balance.stale_hours` registry default); consent preference with default false for new users.
6. Executors: `DISMISS_ALERT`, `CREATE_ALERT` (existing watch behaviour migrated, not extended — audit A-18), `UPDATE_PROFILE`, `UPDATE_PREFERENCE`, `ADD_DECLARED_BILL`, `DELETE_DECLARED_BILL` (registration from P1 completed; `UPDATE_DECLARED_BILL` deferred).
7. Routes; inventory test update.
8. Integration test: ingest demo batch → dispatcher drain → Dining WARNING with zero adapter calls (spy on `llm.complete`).

## 7. Edge cases
| Case | Handling |
| --- | --- |
| Duplicate event delivery | Idempotent by `(event_id, handler)` |
| Correction moves spend out of a breached category | Alert RESOLVED; `alert.changed` |
| Rebalance executed | `plan.changed` → alert recomputed → resolved (P-AC-08) |
| Balance older than threshold | `stale: true`; Sentinel caps confidence |
| Bank and manual balances same day | BANK wins |
| Month rollover with open WATCH alerts | WATCH persists (not period-bound); period alerts resolved |
| Consent off | Preferences returned; John refuses chat (WS-JON-P1) |

## 8. Constraints
- Monitor never writes plan state; Profile is the single writer of profile/accounts/balances/bills.
- No LLM in the Monitor or Profile.

## 9. Test plan
| Test | Command |
| --- | --- |
| `test/monitor/handlers.test.js` | `npm --prefix backend test` |
| `test/monitor/state-machine.test.js` | same |
| `test/monitor/rollover-and-daily.test.js` | same |
| `test/monitor/no-get-scan.test.js` (GET `/workspaces/nova` performs no writes) | same |
| `test/monitor/seed-dining-warning.test.js` (P-AC-06) | same |
| `test/profile/*.test.js` (precedence, staleness, consent default, bills) | same |

## 10. Acceptance criteria
**Plan:** monitor fully event-driven; alerts correct for demo; profile functions and routes live.
**Workstream:** WS-PLT accepted per checklist §3.
**Integration:** G3 "categorization change produces an alert change through the dispatcher"; P-AC-06, P-AC-08.

## 11. Risks and recovery
| Risk | Recovery |
| --- | --- |
| Alert appears late in UI | Dispatcher `drainOnce` after commit; UI polls `/notifications` every 10 s |
| Recompute cost on large ingests | Recompute only affected pairs; coalesce per event batch |

## 12. Assumptions and unresolved questions
- [D] D-PLAN-6: LLM consent is off until the user opts in; the demo seed sets it on (Doc 6 §5).
- [A] In-app notifications only for the prototype.

## 13. Completion handoff
README template; list subscribed events, jobs, routes, profile signatures. Next eligible: **WS-UI-P2**; WS-CAT-P2 switches from fallback to Profile functions; WS-FND-P6.
