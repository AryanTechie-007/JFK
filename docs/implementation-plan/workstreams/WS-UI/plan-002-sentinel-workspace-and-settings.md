# WS-UI · Plan 2 — Sentinel Workspace and Settings

> **Local plan number: Plan 2 of 3 in WS-UI** · Unique ID: **`WS-UI-P2`** · Branch: `ws-ui/p2-sentinel-settings`

> **Repository context (updated 2026-10-13).** Work happens in `https://github.com/Kathir-M-03/FINNMIN-JFK-John` on a branch created from `main`, following [`development-workflow.md`](../../../development-workflow.md). Files marked *Modify*, *Keep*, *Delete*, *Move* or `[E]` belong to the **source baseline** — the application code described in [`baseline.md`](../../baseline.md). Per team decision **D-PLAN-3** (2026-10-13) the repository starts from that code at commit `fc0981d`; **until the source-baseline import commit is on `main` this plan cannot start** (one-time import by the team lead — see [`repository-migration-notes.md`](../../../repository-migration-notes.md) §5). One plan = one branch = one PR (D-PLAN-4). Statements below about what exists "on `main`" or "today" describe the source baseline, not the new repository's `main`. Screen-level UI design: [`07-ui-screens-and-interactions.md`](../../../prototype-design/07-ui-screens-and-interactions.md) (generated 2026-10-13; awaiting team approval, TD-05).

## 1. Plan identity
| Field | Value |
| --- | --- |
| Workstream / local number / ID | WS-UI / **Plan 2** / `WS-UI-P2` |
| Owner / subagent | Dev D — Workspaces & Analytics Engineer / WS-UI subagent |
| Objective | Build the Sentinel workspace per SC §18 (spending analyser, forecast and risk radar incl. declared bills, balances + data-quality badge, Needs-review list, transaction list with category chips and inline correction, demo bank-feed loader) and the Settings page (profile, fixed lines, preferences incl. LLM consent and protected categories, category rules read-only, memory facts) — replacing legacy Home, Subscriptions, Spending Analyser, Statement Import and Onboarding calls |
| Expected outcome | No view calls legacy endpoints; corrections go through `/actions` (T1) and `/proposals` (merchant scope, T2); declared bills via `ADD/DELETE_DECLARED_BILL`; onboarding via `POST /onboarding` or sequential proposals |
| Size | ~1.5 days |

## 2. Dependencies
| Type | Source | Needed | Early start |
| --- | --- | --- | --- |
| implementation | WS-UI-P1 | Shell, client, components | No |
| implementation | WS-SEN-P2 | `/workspaces/sentinel/{overview,spending,timeseries,forecast}` | Yes (layout with schema fixtures) |
| implementation | WS-CAT-P2 | `POST /demo/ingest` | Yes |
| implementation | WS-CAT-P3 | `GET /transactions`, `/transactions/:id`, `/review-queue`; correction executors | Yes |
| implementation | WS-PLT-P2 | `/alerts`, `/notifications`, `/profile`, `/preferences`, `/bills` | Yes |

**Parallel with:** WS-UI-P3, WS-AGT-P2, WS-JON-P2.
**Unblocks:** WS-FND-P5 (legacy UI calls gone), WS-FND-P6.

## 3. Scope
**In:** Sentinel workspace sections; transaction list with filters and paging; inline correction (category picker filtered by movement type) → T1 `RECATEGORIZE_TRANSACTION` scope TRANSACTION with `UndoBar`, "apply to all from this merchant" → proposal card with dry-run counts; Needs-review actions (`CONFIRM_CATEGORY`, `DISMISS_REVIEW_ITEM`); bills panel (declared bills CRUD as T1); demo loader (visible only when backend reports `demo_controls: true` in `/health`, labelled "Demo: bank feed simulator", synthetic); Settings: profile (`UPDATE_PROFILE` card), preferences (`UPDATE_PREFERENCE` T1), consent toggle, memory facts list/delete (John store route), rules list (read-only; editing deferred); onboarding flow mapped to the same actions; bell feed from `/notifications`.
**Tier cut (D-PLAN-9):** if the end-of-D5 checkpoint cuts Tier 3, skip the forecast/risk-radar section beyond the upcoming-bills list, and the demo loader control (the `reset-demo` script loads the data); transactions, corrections, review list, bills panel and Settings stay.
**Out:** chat panels and John view (P3).

## 4. Files and ownership
| File | Action | Purpose | Ownership | Shared-file risk |
| --- | --- | --- | --- | --- |
| `src/workspaces/sentinel/{SentinelWorkspace,SpendingSection,ForecastSection,BalancesSection,ReviewList,TransactionList,BillsPanel,DemoLoader}.jsx` | Create | Workspace | WS-UI | Low |
| `src/components/SettingsView.jsx` → `src/workspaces/settings/SettingsPage.jsx` | Move/rewrite | Settings | WS-UI | Low |
| `src/components/OnboardingView.jsx` | Modify | v1 actions | WS-UI | Low |
| `src/components/{HomeDashboardView,SubscriptionsView,StatementImportModal,FinancialHealthView}.jsx`, `src/tools/tally/SpendingAnalyserView.jsx` | Delete | Replaced by Sentinel workspace | WS-UI | Low |
| `src/App.jsx` | Modify | Remove `profileService`/`goalService`/`transactionService` loading and the Statement Import hook; data comes from `/api/v1` | WS-UI | Medium |
| `src/services/{goalService,profileService,subscriptionService,transactionService}.js` | Delete | Legacy clients (`conversationService.js` is deleted in WS-UI-P3, which rebuilds its only importer) | WS-UI | Low |
| `src/components/NotificationBell.jsx` | Create | Bell feed | WS-UI | Low |

## 5. Interfaces and contracts
- Reads: Doc 2 §6 routes only; schemas from WS-SEN-P2 (`schemas/http/workspaces-*.json`) used in dev-mode response validation (console warning).
- Writes: canonical actions via `/actions` (T1) and `/proposals` (T2/T3). `If-Match`/`row_version` passed for corrections (CAT-AC-15) and conflicts shown as "This transaction changed; refresh".

## 6. Implementation steps
1. Sentinel overview, spending (category totals + parent roll-ups + trends chart from `/timeseries`), forecast/risk radar, balances with stale marker and data-quality badge.
2. Transaction list + detail drawer (evidence, events); inline correction + Undo; merchant-scope card.
3. Needs-review list actions.
4. Bills panel (declared bills).
5. Demo loader (file picker for JSON/CSV → `/demo/ingest`, shows batch status and errors).
6. Settings page and onboarding on v1 actions; consent toggle; memory facts.
7. Notification bell.
8. Delete legacy views/services; grep gate; Electron walkthrough of Doc 6 §5 steps 3–5.

## 7. Edge cases
| Case | Handling |
| --- | --- |
| Correction category not applicable | Picker filters; server error shown inline if still returned |
| Undo window expired | UndoBar hidden after `undo_available_until` |
| Demo controls off | Loader hidden; route 404 anyway |
| Large transaction list | Server paging (`nextCursor`), 50 per page |
| Consent turned off | Settings shows that John chat is disabled; workspaces still work |

## 8. Constraints
- Same as WS-UI-P1. Synthetic data labelled. No client-side category logic beyond filtering the taxonomy list from `/categorizer/taxonomy`.

## 9. Test plan
| Test | Command |
| --- | --- |
| Build + lint | `npm run build && npx oxlint` |
| Grep gate for legacy endpoints | `git grep -n -e "/api/goals" -e "/api/budget" -e "/api/transactions" -e "/api/subscriptions" -e "/api/insights" -e "/api/coach" -- src/workspaces src/components src/App.jsx src/services` → empty |
| Manual walkthrough Doc 6 §5 steps 3–5, 7, 9 in Electron | `npm run reset-demo && npm run app` |

## 10. Acceptance criteria
**Plan:** Sentinel workspace and Settings complete; no legacy calls; corrections with Undo; demo loader gated.
**Workstream:** WS-UI five workspaces + Settings.
**Integration:** G5 UI items; P-AC-09 (UI), P-AC-20.

## 11. Risks and recovery
| Risk | Recovery |
| --- | --- |
| Backend routes late | Build against schema fixtures; integrate when merged |
| Scope too large for time | Tier order: transactions + correction + review (Tier 1) → spending/forecast → bills → demo loader → rules list |

## 12. Assumptions and unresolved questions
- [A] Category-rule editing UI deferred (rules list read-only).
- [U] Q-UI-04 (how onboarding completion is detected), Q-UI-05 (`POST /onboarding` has no backend owner in any plan — build sequential proposals unless assigned), Q-UI-11 (memory facts section vs Doc 0 §3.2 deferral) — `docs/team-decisions.md`.

## 13. Completion handoff
README template; screenshots; walkthrough notes. Next eligible: WS-FND-P5, WS-FND-P6.
