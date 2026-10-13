# Team Decisions Register

| Field | Value |
| --- | --- |
| Repository | `https://github.com/Kathir-M-03/FINNMIN-JFK-John` |
| Created | 2026-10-13, during the repository migration and implementation-readiness review |
| Purpose | One place for every decision the team still has to make before or during implementation, with options, a recommendation and the tasks each one blocks |
| How to use | Review §2 together before D1. For each item, fill in **Decision**, **Decided by** and **Date**, and set **Status** to `Approved` (or `Deferred`). Then the owner listed under "Docs to update" changes those documents in a PR titled `decisions: TD-nn …` |
| Status values | `Pending` (no decision yet) · `Approved` (team agreed; record the answer) · `Deferred` (deliberately postponed; say until when) |

Nothing in this file is a team answer yet. Every **Recommendation** is a proposal made during the readiness review; it becomes binding only when the team records it as `Approved`.

**Readiness verdict (2026-10-13): NOT READY to start implementation.** The documentation set is complete and consistent enough to work from, but **TD-01 blocks all 21 plans**, and TD-02, TD-03 and TD-05 must be settled before D1. See §6 for the recommended order.

---

## 1. Summary

| ID | Question (short) | Category | Blocks | Status |
| --- | --- | --- | --- | --- |
| TD-01 | How does the source-baseline code enter the new repository (import or greenfield)? | Implementation blocker | **All 21 plans** | Pending |
| TD-02 | If importing: which commit, what is excluded, who imports, with whose permission? | Implementation blocker (if TD-01 = import) | All plans | Pending |
| TD-03 | Who is Dev A, B, C, D (names and GitHub handles), and do they all have write access? | Pre-implementation decision | WS-FND-P1 (CODEOWNERS), every assignment | Pending |
| TD-04 | How is `main` protected on a private repository? | Pre-implementation decision | Merge policy from D1 | Pending |
| TD-05 | Approve the prototype design (A-ARCH), including the generated Doc 7 | Pre-implementation decision | All plans (re-plan on rejection) | Pending |
| TD-06 | Confirm C-1: LLM layer per specification | Pre-implementation decision (default exists) | WS-AGT-P1, WS-JON-P1 | Pending |
| TD-07 | Confirm C-5: SC §13.2 action names are canonical | Pre-implementation decision (default exists) | WS-PLT-P1, WS-UI-P1, WS-FND-P5 | Pending |
| TD-08 | Confirm D-PLAN-2: keep the source baseline's physical table names | Pre-implementation decision (default exists) | WS-FND-P2 | Pending |
| TD-09 | Confirm U-4: branching, merge method and PR size rules | Pre-implementation decision (default exists) | All PRs | Pending |
| TD-10 | CI: GitHub Actions on a private repository (minutes) | Pre-implementation decision | WS-FND-P1 CI | Pending |
| TD-11 | Task tracking: GitHub Issues + `STATUS.md` roles | Pre-implementation decision | Daily workflow | Pending |
| TD-12 | Secrets and local environment (LLM key holder, `.env` handling) | Pre-implementation decision | D1 setup, WS-FND-P3 | Pending |
| TD-13 | U-2: Qwen endpoint details | Task blocker | WS-AGT-P3, live parts of WS-FND-P6 | Pending |
| TD-14 | U-1: demo date / hackathon length (tier cut) | Task-level decision | Scope from D5 onward | Pending |
| TD-15 | `ChatRequest@1` field names (spec vs WS-UI-P3 wording) | Task-level decision | WS-JON-P1 step 1, WS-UI-P3 | Pending |
| TD-16 | Electron-only or also a browser build (Q-UI-01) | Task-level decision | WS-FND-P5, WS-UI-P3 | Pending |
| TD-17 | Onboarding: `POST /onboarding` owner or sequential actions (Q-UI-05) | Task-level decision | WS-UI-P2 (onboarding), WS-PLT-P2 | Pending |
| TD-18 | Conditional controls `RESTORE_GOAL`, `CREATE_ALERT`, `SET_TRANSACTION_TYPE` (Q-UI-09) | Task-level decision | WS-PLT-P1 step 6, WS-CAT-P3, WS-UI-P1 step 7 | Pending |
| TD-19 | Money input parsing vs "no arithmetic on `_minor`" lint (Q-UI-06) | Task-level decision | WS-UI-P1 (lint rule, forms) | Pending |
| TD-20 | How the UI detects that onboarding is complete (Q-UI-04) | Task-level decision | WS-UI-P2 | Pending |
| TD-21 | Memory facts in Settings vs Doc 0 deferral (Q-UI-11) | Task-level decision | WS-UI-P2, WS-JON | Pending |
| TD-22 | Sidebar order, landing screen, visual style (Q-UI-02/03/08) | Non-blocking | — | Pending |
| TD-23 | Iris planner slider ranges and step (Q-UI-10) | Non-blocking | WS-UI-P1 (Iris view polish) | Pending |
| TD-24 | Repository licence | Non-blocking / informational | — | Pending |
| TD-25 | Numeric thresholds and production open items (backtest/golden thresholds, SC §21.3 O-1…O-5) | Non-blocking (already scheduled) | WS-SEN-P2 thresholds; production only | Deferred by the plans |

Categories: **Implementation blocker** = a task cannot begin. **Pre-implementation decision** = agree before D1 to avoid incompatible assumptions. **Task-level decision** = must be settled before the named task starts. **Non-blocking** = can be decided during implementation without affecting others.

---

## 2. Decisions to resolve before implementation begins

### TD-01 — Source baseline: import the existing code, or rebuild?
| Field | Content |
| --- | --- |
| Question | The 21 plans modify, move, test and delete code that existed in the previous project repository (`backend/`, `src/`, `electron/`, `package.json`s, `launch.bat`, …; see `implementation-plan/baseline.md`). The new repository contains **documentation only**. How does that code enter the new repository? |
| Why it matters | Every plan's file table contains *Modify*/*Keep*/*Delete*/*Move* rows on that code (see `repository-migration-notes.md` §5.2). Without the code there is nothing to modify; WS-FND-P1 step 1 stops. |
| References | `implementation-plan/baseline.md` (whole file, C-7); every plan's §4; `prototype-design/00-overview.md` §1, §1.6 ("existing code to reuse, not rewrite") |
| Option A — Import a snapshot | A team member who legitimately has the code **and the code owner's agreement** commits a snapshot (no history) to the new repository in one PR. **Pros:** all 21 plans stay valid as written; schedule D1–D9 holds; the design's reuse decisions (Doc 0 §1.6) remain true. **Cons:** reintroduces code that originated in the previous repository — needs the owner's permission and a clean secret scan; `baseline.md` facts must be re-verified against the imported commit. |
| Option B — Greenfield rebuild | Start from an empty codebase and build to the specifications. **Pros:** no dependency on the previous repository at all. **Cons:** the plans are written as *conformance and refactoring* plans ("prove the existing categorizer", "split the 697-line router", "port `test-v1-specs.js`"); most steps become meaningless and **all 21 plans must be re-planned** (new file tables, new sizes; the D1–D9 schedule is not achievable as estimated); Doc 0 §1.6 reuse decisions are void; conditional controls (TD-18) become deferred. |
| Option C — Hybrid | Import only selected modules (e.g. `backend/src/shared`, `engines/*`) and rebuild the rest. **Pros:** smaller import. **Cons:** plans would need per-file re-planning anyway; highest coordination cost. Listed for completeness; not recommended. |
| Recommendation | **Option A**, provided the code owner agrees in writing (e.g. a GitHub comment or email kept with the import PR). It is the only option under which the existing plans, schedule and acceptance criteria remain valid. If permission is not available, choose **B** and ask for a re-planning pass before D1. |
| Affected | All developers; all 21 plans |
| Blocks | **Every plan.** |
| Docs to update after decision | A: `repository-migration-notes.md` §5 (record commit and verification), `implementation-plan/baseline.md` (re-verification note), `tracking/STATUS.md` (WS-FND-P1 → Ready). B: full re-plan of `docs/implementation-plan/` |
| Status | Pending |
| Decision / Decided by / Date | ___ / ___ / ___ |

### TD-02 — Import procedure (only if TD-01 = A)
| Field | Content |
| --- | --- |
| Question | Which commit is imported, what is excluded, and who does it? |
| Why it matters | The plans were verified at `54f9f6f` and re-checked at `fc0981d` (lockfile-only difference). Importing anything else invalidates `baseline.md`. Importing secrets or databases would leak data. |
| Options | Commit: **`fc0981d`** (recommended: latest verified, lockfile consistent with `package.json`) or `54f9f6f`. `dist/`: **exclude** (recommended — WS-FND-P1/P5 already plan to stop committing it; the Electron app is rebuilt with `npm run build`) or include as-is (avoids a build step until WS-FND-P5). |
| Mandatory exclusions | `backend/.env`, any `.env*` except `.env.example`, `*.db`, `*.db-wal`, `*.db-shm`, `node_modules/`, OS/editor files, any file containing an API key or password |
| Procedure | `repository-migration-notes.md` §5.3 (import as one PR `chore/import-source-baseline`, run the secret scan, re-run the `baseline.md` checks, Dev A reviews) |
| Recommendation | `fc0981d`, exclude `dist/`; Dev A performs; a second developer reviews the secret scan |
| Blocks | All plans (as part of TD-01 A) |
| Status | Pending |
| Decision / Decided by / Date | ___ / ___ / ___ |

### TD-03 — Developer mapping and repository access
| Field | Content |
| --- | --- |
| Question | Which person is Dev A (Integration Lead, WS-FND), Dev B (WS-CAT + WS-PLT), Dev C (WS-JON + WS-AGT), Dev D (WS-SEN + WS-UI)? What are their GitHub handles? Who is the team lead who signs decisions and G7? |
| Why it matters | Ownership, CODEOWNERS (WS-FND-P1 step 8), review assignments and the contingency rules all refer to Dev A–D. Collaborators need **Write** access to push branches. |
| References | `implementation-plan/workstream-assignments.md` §2, §5; `implementation-plan/first-day-action-plan.md` §1 step 1 |
| Options | The allocation of workstreams to roles is already settled (D-PLAN-1); only the person-to-role mapping is open. Consider: Dev D has the least slack (≈ 0.5 day) — assign the strongest frontend developer there; Dev A needs the most Git/CI experience. |
| Recommendation | Map by strength as above; repository owner invites the other three as collaborators with Write access before D1 (`development-workflow.md` §2). |
| Blocks | WS-FND-P1 CODEOWNERS; meaningful task assignment |
| Status | Pending |
| Decision | Dev A: ___ (@___) · Dev B: ___ (@___) · Dev C: ___ (@___) · Dev D: ___ (@___) · Team lead: ___ · Date: ___ |

### TD-04 — Protecting `main` on a private repository
| Field | Content |
| --- | --- |
| Question | The repository is private under a personal account. GitHub enforces branch protection (required reviews, required checks) on private repositories only with GitHub Pro, Team or Enterprise; on the free plan it works only on public repositories (GitHub Docs, "About protected branches", checked 2026-10-13). How is the "PR + 1 review + green CI, no direct push" rule enforced? |
| Why it matters | `workstream-assignments.md` §7 rule 1 assumes a protected `main`. Without enforcement, one accidental push can break everyone. |
| Options | **A** Upgrade the owner account to GitHub Pro (enforced protection on this private repo). **B** Move the repository into an organisation on GitHub Team (enforced; adds team management). **C** Make the repository public (free enforcement; code and docs visible to everyone). **D** Stay on the free plan and enforce by agreement: nobody pushes to `main`; Dev A checks `git log main` daily. |
| Recommendation | **A** if the cost is acceptable; otherwise **D** with the daily check. C is not recommended without a licence and a review of what the docs disclose. |
| Blocks | Merge policy from D1 (not code) |
| Status | Pending |
| Decision / Decided by / Date | ___ / ___ / ___ |

### TD-05 — Approve the prototype design (A-ARCH), including Doc 7
| Field | Content |
| --- | --- |
| Question | Is `docs/prototype-design/` (Docs 0–6, status "Proposed") approved as the architecture? Is the generated `07-ui-screens-and-interactions.md` accepted as the UI design baseline? |
| Why it matters | All plans rely on the ADRs (assumption A-ARCH). Doc 7 was generated on 2026-10-13 from the existing documents; its **[I]** items are design choices nobody has approved yet. |
| Options | Approve all · approve with listed exceptions (affected plans are re-planned) · approve Docs 0–6 and treat Doc 7 as a draft owned by Dev D |
| Recommendation | Approve Docs 0–6; approve Doc 7 as the baseline with Dev D allowed to change **[I]** items without a contract PR |
| Blocks | All plans (re-plan on rejection) |
| Status | Pending |
| Decision / Decided by / Date | ___ / ___ / ___ |

### TD-06 — C-1: LLM layer follows the specifications
| Field | Content |
| --- | --- |
| Question | The source baseline's agents are deterministic only; specs and D-008 require LLM specialists and an LLM-assisted John. Confirm the plans' default: add the LLM layer and keep the deterministic composition as the plan step and fallback. |
| References | `implementation-plan/baseline.md` C-1; WS-AGT-P1, WS-JON-P1 |
| Recommendation | Approve the default (already the planning assumption) |
| Blocks | WS-AGT-P1, WS-JON-P1 (default applies on D1 if unanswered, per the plans) |
| Status | Pending |
| Decision / Decided by / Date | ___ / ___ / ___ |

### TD-07 — C-5: canonical action names
| Field | Content |
| --- | --- |
| Question | Confirm SC §13.2 names are canonical, with a temporary alias table (WS-PLT-P1) removed in WS-FND-P5. Under greenfield (TD-01 B) no aliases are needed. |
| Recommendation | Approve |
| Blocks | WS-PLT-P1 step 1 contract PR (D2) |
| Status | Pending |
| Decision / Decided by / Date | ___ / ___ / ___ |

### TD-08 — D-PLAN-2: physical table names
| Field | Content |
| --- | --- |
| Question | Keep the source baseline's physical table names (`transactions_v1`, `goals_v1`, …) and map them in `TABLES.md`, or rename to the Doc 2 §3 logical names? Under greenfield, use the Doc 2 §3 names directly. |
| Recommendation | Keep (import) / Doc 2 names (greenfield) |
| Blocks | WS-FND-P2 |
| Status | Pending |
| Decision / Decided by / Date | ___ / ___ / ___ |

### TD-09 — U-4: branching, merging and PR size
| Field | Content |
| --- | --- |
| Question | Confirm: one short-lived branch per plan `ws-<id>/p<n>-<slug>`; contract PRs separate; squash merge; ≤ 600 changed lines per PR; rebase or merge `main` into your branch at least daily; two merge windows a day. |
| References | `implementation-plan/workstream-assignments.md` §7; `development-workflow.md` |
| Recommendation | Approve. One clarification proposed: developers update their branch from `main` with **merge** by default (safe for beginners) and use rebase only on branches nobody else has pulled (see `development-workflow.md` §6.4). |
| Blocks | All PRs from D1 |
| Status | Pending |
| Decision / Decided by / Date | ___ / ___ / ___ |

### TD-10 — CI on a private repository
| Field | Content |
| --- | --- |
| Question | WS-FND-P1 adds a GitHub Actions workflow. Private repositories have a monthly Actions-minutes allowance that depends on the owner's plan. Is that enough for ~20+ PRs with `npm ci` twice per run, or should CI run only on PRs to `main` (not on every push)? |
| Recommendation | Trigger CI on `pull_request` to `main` and on `push` to `main` only; cache npm; check the minutes balance at the end of D3 |
| Blocks | WS-FND-P1 CI configuration |
| Status | Pending |
| Decision / Decided by / Date | ___ / ___ / ___ |

### TD-11 — Task tracking
| Field | Content |
| --- | --- |
| Question | The plans use `implementation-plan/tracking/STATUS.md` as the status board (no PM tool). Should GitHub Issues also be used? |
| Options | **A** STATUS.md only. **B** One GitHub Issue per plan (21 issues, labels `WS-xxx`, `blocked`, `ready`, `in-progress`) for assignment and discussion; PRs say `Closes #n`; STATUS.md remains the **record of status, evidence and gates**. **C** GitHub Projects board replacing STATUS.md (changes the plans' tracking rules). |
| Recommendation | **B** — gives beginners notifications and a clear "who is on what" without changing the plans' evidence rules |
| Blocks | Day-to-day coordination |
| Status | Pending |
| Decision / Decided by / Date | ___ / ___ / ___ |

### TD-12 — Secrets and local environment
| Field | Content |
| --- | --- |
| Question | Who holds the Qwen API key? How is it shared (never through Git, chat logs or screenshots)? Does each developer use their own `JWT_SECRET`? |
| References | Doc 5 S-1; WS-FND-P3 (`LLM_*` variables); `implementation-plan/first-day-action-plan.md` §1 step 3 |
| Recommendation | Each developer creates `backend/.env` from `backend/.env.example` with a random local `JWT_SECRET`; the LLM key is held by the U-2 owner and shared one-to-one through a password manager only with the developers running live tests (Dev C, Dev A); GitHub Actions never receives it (live tests are manual). Rotate any key that was ever committed in the previous repository. |
| Blocks | D1 environment setup; live runs |
| Status | Pending |
| Decision / Decided by / Date | ___ / ___ / ___ |

---

## 3. Decisions required before specific tasks begin

### TD-13 — U-2: Qwen endpoint
| Field | Content |
| --- | --- |
| Question | Base URL, model IDs per model class (ROUTER / SPECIALIST / SYNTHESIS), JSON-schema or JSON-mode support, rate limits |
| References | `implementation-plan/baseline.md` U-2; WS-FND-P3 §12; WS-AGT-P3 |
| Options | Only the team can supply these facts |
| Recommendation | Name an owner on D1; answer by end of D3 |
| Blocks | **WS-AGT-P3**; live parts of WS-FND-P6 (P-AC-17 live, 18, 19); a live manual run in WS-UI-P3. All other plans use the fake provider |
| Status | Pending |
| Decision / Decided by / Date | ___ / ___ / ___ |

### TD-14 — U-1: demo date and tier cut
| Field | Content |
| --- | --- |
| Question | When is the demo, and how many working days are available? |
| Why it matters | The schedule assumes D1–D9; if fewer days exist, scope is cut by tier (`implementation-plan/roadmap.md` §5), never by skipping a gate |
| Recommendation | Decide before D1 if possible; at the latest before D5, when Tier 3 plans start |
| Blocks | Tier 3 plans (WS-AGT-P2/P3, WS-CAT-P2, WS-SEN-P2, WS-UI-P2, WS-FND-P5) if days are short |
| Status | Pending |
| Decision / Decided by / Date | ___ / ___ / ___ |

### TD-15 — `ChatRequest@1` field names
| Field | Content |
| --- | --- |
| Question | John spec §C.1 defines `message` and `trigger.kind ∈ {USER_MESSAGE, UI_ACTION, ALERT_OPEN}`; WS-UI-P3 §5 originally paraphrased it as `text` and `kind ∈ {MESSAGE, …}`. |
| Resolution so far | WS-UI-P3 §5 was corrected on 2026-10-13 to cite John §C.1 verbatim, because the plan itself names `ChatRequest@1` and the spec is frozen. The team should confirm this in the WS-JON-P1 step-1 contract PR. |
| Recommendation | Approve John §C.1 as-is |
| Blocks | WS-JON-P1 step 1 (D1), WS-UI-P3 |
| Status | Pending |
| Decision / Decided by / Date | ___ / ___ / ___ |

### TD-16 — Electron only, or also a browser build? (Q-UI-01)
| Field | Content |
| --- | --- |
| Question | `baseline.md` C-2 records the prototype as desktop-only (Electron) based on the source baseline's latest commit; Doc 0 §3.1 says "browser or Electron"; Doc 6 §5 step 2 mentions `npm run web`; SC A-3 says production is web. |
| Options | Electron only (as C-2) · Electron + `npm run web` for development |
| Recommendation | Electron for the demo (C-2); keep the Vite dev server for development since it costs nothing |
| Blocks | WS-FND-P5 scripts; WS-UI-P3 verification |
| Status | Pending |
| Decision / Decided by / Date | ___ / ___ / ___ |

### TD-17 — Onboarding endpoint (Q-UI-05)
| Field | Content |
| --- | --- |
| Question | Doc 2 §6 defines `POST /api/v1/onboarding`; no backend plan lists it in its files table; WS-UI-P2 allows "`POST /onboarding` or sequential proposals". |
| Options | **A** Sequential: `UPDATE_PROFILE` card + `UPDATE_PREFERENCE` actions + optional `CREATE_GOAL` card (no new route). **B** Assign `/onboarding` to WS-PLT-P2 (adds ~0.25 day to Dev B and a route-inventory update). |
| Recommendation | **A** (no new contract; Dev B has no slack to spare). Note: with A the user confirms one or two cards during onboarding |
| Blocks | WS-UI-P2 onboarding step |
| Status | Pending |
| Decision / Decided by / Date | ___ / ___ / ___ |

### TD-18 — Conditional controls (Q-UI-09)
| Field | Content |
| --- | --- |
| Question | `RESTORE_GOAL`, `CREATE_ALERT` (watch) and `SET_TRANSACTION_TYPE` are deferred in Doc 0 §3.2 but exist in the source baseline; the audit (A-18) chose "migrate as-is, don't extend". |
| Options | Follows TD-01: import → keep enabled as-is (audit A-18); greenfield → not built, controls disabled ("Not in prototype") |
| Recommendation | Follow TD-01 automatically |
| Blocks | WS-PLT-P1 step 6, WS-CAT-P3 scope note, WS-UI-P1 step 7 |
| Status | Pending (decided by TD-01) |

### TD-19 — Money input vs the no-arithmetic lint rule (Q-UI-06)
| Field | Content |
| --- | --- |
| Question | Forms accept rupees typed by the user; something must turn "1250.50" into `125050`. Progress bars need a width ratio. Does that violate P-AC-05 / the `_minor` lint rule? |
| Recommendation | Allow both only in two files (`src/lib/format.js`, `src/lib/money-input.js`), using string parsing (no floating point), with the lint rule exempting those files; reviewers check nothing else does arithmetic |
| Blocks | WS-UI-P1 lint rule and forms |
| Status | Pending |
| Decision / Decided by / Date | ___ / ___ / ___ |

### TD-20 — Detecting "onboarding complete" (Q-UI-04)
| Field | Content |
| --- | --- |
| Question | No flag is defined. |
| Recommendation | Onboarding is complete when `GET /preferences` returns a record whose `llm_processing_consent` is set (consent is the only mandatory answer, SC §17.6) |
| Blocks | WS-UI-P2 onboarding |
| Status | Pending |
| Decision / Decided by / Date | ___ / ___ / ___ |

### TD-21 — Memory facts in Settings (Q-UI-11)
| Field | Content |
| --- | --- |
| Question | Doc 0 §3.2 defers John's memory facts; WS-UI-P2 builds a list/delete section; the source baseline has memory routes. |
| Recommendation | Show the section only if the routes exist (TD-01 A); otherwise hide it |
| Blocks | WS-UI-P2 Settings |
| Status | Pending |
| Decision / Decided by / Date | ___ / ___ / ___ |

---

## 4. Non-blocking decisions (can be made during implementation)

| ID | Question | Recommendation | Owner | Status |
| --- | --- | --- | --- | --- |
| TD-22 | Sidebar order (SC §18 vs WS-UI-P1 step 6); landing screen after login; visual style | SC §18 order; John as landing; keep the existing styles if imported | Dev D | Pending |
| TD-23 | Iris planner slider bounds and step | ±50 % of the trailing monthly average, ₹100 steps (needs the value in the view response — coordinate with WS-SEN-P2 schema) | Dev D (with WS-SEN-P2) | Pending |
| TD-24 | Licence for the repository | None needed while private; decide before making it public | Team lead | Pending |
| TD-25 | Backtest and golden thresholds (WS-SEN-P2, Doc 6); SC §21.3 O-1…O-5 (regulatory, retention, numeric floors, scale, exact model IDs) | Keep as the plans and specs schedule them: thresholds during WS-SEN-P2 (D4); O-1…O-5 production only | Dev D / team lead | Deferred by the plans |

---

## 5. Decisions already settled (do not reopen without a reason)

| Topic | Outcome | Where documented |
| --- | --- | --- |
| Component behaviour, contracts, decisions D-001…D-025 | Frozen specifications | `specifications/system-contracts.md` §20 |
| Runtime LLM | Qwen 32B-class via OpenAI-compatible API for the prototype; Gemini Enterprise for production (D-008) | SC §20; `implementation-plan/README.md` |
| Team size and allocation | Exactly four developers; Dev A WS-FND; Dev B WS-CAT + WS-PLT; Dev C WS-JON + WS-AGT; Dev D WS-SEN + WS-UI (D-PLAN-1) | `implementation-plan/workstream-assignments.md` §2 |
| Plan numbering | Local Plan 1…N per workstream; unique IDs `WS-<ID>-P<n>` | `implementation-plan/README.md` |
| Migration number ranges | `0xx` FND, `1xx` CAT, `2xx` SEN, `3xx` PLT, `4xx` AGT, `5xx` JON; merged migrations immutable | `workstream-assignments.md` §5 |
| Money | Integer paise, basis points, half-even rounding; no floats | SC §4.2 |
| Writes | Only through the Action Service (ingestion excepted) | D-001 |
| Contracts first | Contract changes are separate PRs approved by consumers | `implementation-plan/README.md` global rules |
| Doc 0 §4 "six-person team" | Superseded for execution by the four-developer allocation | `implementation-plan/audit-report.md` §5 |
| Repository | `Kathir-M-03/FINNMIN-JFK-John`, private (name and owner decided by the project lead on 2026-10-13; product name stays FinMate AI) | `repository-migration-notes.md` §2 |
| Documentation layout | Plans stay in `docs/implementation-plan/` (singular, as referenced throughout the plans) rather than being renamed | `repository-migration-notes.md` §3 |

---

## 6. Recommended order for resolving the open items

1. **TD-01** and, if import, **TD-02** — nothing else matters until the code question is answered.
2. **TD-03** (people and access) and **TD-05** (design approval) — needed to assign and start D1.
3. **TD-04, TD-09, TD-10, TD-11, TD-12** — one 30-minute meeting; recommendations are ready to approve.
4. **TD-06, TD-07, TD-08** — confirm the documented defaults (two minutes each).
5. Before their tasks: **TD-15** (D1, WS-JON-P1 step 1), **TD-13** (by D3), **TD-14** (by D5), **TD-16 … TD-21** (before WS-UI-P2/P3 and WS-FND-P5).
6. TD-22 … TD-25 during implementation.

## 7. Implementation-readiness summary

| Area | Ready? | Notes |
| --- | --- | --- |
| Specifications | Yes | All 7 found; frozen; no gaps found that block implementation |
| Prototype design | Yes, pending approval | Docs 0–6 found; Doc 7 (UI screens) generated; TD-05 |
| Implementation plans | Yes as documents | Updated for the new repository; consistent dependency graph (21 plans, 63 edges + new TD-01 row) |
| Source code | **No** | Not in the repository — TD-01 |
| Team and access | No | TD-03, TD-04 |
| Environment / CI | Partly | Commands are defined; CI is created by WS-FND-P1; TD-10, TD-12 |
| External dependencies | Partly | Qwen endpoint (TD-13) needed only for live evaluation |

**Conclusion:** the project is **not ready** for the four developers to begin implementation until TD-01, TD-02 (if applicable), TD-03 and TD-05 are resolved. Once they are, the remaining pre-implementation items have ready recommendations and can be approved in one meeting.
