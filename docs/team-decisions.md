# Team Decisions Register

| Field | Value |
| --- | --- |
| Repository | `https://github.com/Kathir-M-03/FINNMIN-JFK-John` |
| Created / updated | Created 2026-10-13 during the repository migration; **updated 2026-10-15** with the team decisions of 2026-10-13 (received in the updated documentation bundle) |
| Record of decisions | The authoritative record of decisions is [`implementation-plan/baseline.md`](implementation-plan/baseline.md) §6 and the decision log in [`implementation-plan/tracking/STATUS.md`](implementation-plan/tracking/STATUS.md) §4. This register maps each readiness question (TD-nn) to those decisions and lists what is **still open** |
| How to use | For each `Pending` item, fill in **Decision**, **Decided by** and **Date**, set **Status** to `Approved` or `Deferred`, and add the decision to `baseline.md` §6 and STATUS §4 in the same PR (title `decisions: TD-nn …`) |
| Status values | `Pending` · `Approved` (with the team decision ID) · `Deferred` |

**Readiness verdict (2026-10-15): almost ready.** The team has taken all architectural and process decisions. Development can begin on D1 once two things exist: (1) the **source-baseline import** (`fc0981d`, D-PLAN-3) committed to `main`; (2) the **branch-protection** check (TD-04). Developer names and handles were recorded on 2026-10-15 (TD-03). Everything else open is task-level or non-blocking.

---

## 1. Summary

| ID | Question (short) | Category | Status | Team decision |
| --- | --- | --- | --- | --- |
| TD-01 | How does the source-baseline code enter the new repository? | Implementation blocker | **Approved** — import; **execution pending** | D-PLAN-3 |
| TD-02 | Import procedure (commit, exclusions, who) | Implementation blocker | **Partly approved** — commit `fc0981d`; procedure in migration notes §5.3 | D-PLAN-3, D-PLAN-13 |
| TD-03 | Who is Dev A, B, C, D (names, GitHub handles)? | Pre-implementation | **Approved** 2026-10-15 | D-PLAN-1 |
| TD-04 | How is `main` protected on a private repository? | Pre-implementation | **Pending** — check Settings → Branches | open in `baseline.md` §6 |
| TD-05 | Approve the prototype design | Pre-implementation | **Approved** for Docs 0–6; **Pending** for Doc 7 | A-ARCH |
| TD-06 | LLM layer per specification (C-1) | Pre-implementation | **Approved** | C-1 |
| TD-07 | Canonical action names (C-5) | Pre-implementation | **Approved** | C-5 |
| TD-08 | Physical table names (D-PLAN-2) | Pre-implementation | **Approved** | D-PLAN-2 |
| TD-09 | Branching, merging, PR size | Pre-implementation | **Approved — differs from the earlier recommendation** | U-4, D-PLAN-4 |
| TD-10 | CI minutes on a private repository | Pre-implementation | **Pending** | — |
| TD-11 | Task tracking (GitHub Issues + STATUS.md) | Pre-implementation | **Pending** | — |
| TD-12 | Secrets and local environment | Pre-implementation | **Approved** | D-PLAN-11 |
| TD-13 | Qwen endpoint (U-2) | Task blocker | **Approved** — details arrive D3; stand-in provider if unavailable (choose provider and key holder before D8) | U-2, D-PLAN-11, D-PLAN-12 |
| TD-14 | Time available and tier cut (U-1) | Task-level | **Approved** | U-1, D-PLAN-9 |
| TD-15 | `ChatRequest@1` field names | Task-level | **Pending** — confirm in WS-JON-P1's contract commit (D1) | — |
| TD-16 | Electron only, or also a browser build | Task-level | **Pending** | — |
| TD-17 | Onboarding endpoint owner | Task-level | **Pending** | — |
| TD-18 | Conditional controls (`RESTORE_GOAL`, `CREATE_ALERT`, `SET_TRANSACTION_TYPE`) | Task-level | **Approved** — keep those already working; build no new deferred actions | D-PLAN-5 |
| TD-19 | Money input vs the no-arithmetic lint rule | Task-level | **Pending** | — |
| TD-20 | Detecting "onboarding complete" | Task-level | **Pending** | — (D-PLAN-6 fixes the consent default) |
| TD-21 | Memory facts in Settings | Task-level | **Pending** | — |
| TD-22 | Sidebar order, landing screen, visual style | Non-blocking | Pending | — |
| TD-23 | Iris slider ranges | Non-blocking | Pending | — |
| TD-24 | Licence | Non-blocking | Pending | — |
| TD-25 | Thresholds and production open items | Non-blocking | **Partly approved** — backtest ±15 % provisional (confirm D4); golden target per P-AC-03 | D-PLAN-10, D-PLAN-13 |

New team decisions that had no TD item: **D-PLAN-6** (LLM consent off until the user opts in; demo user seeded on), **D-PLAN-7** (stub after half a day late), **D-PLAN-8** (independent review only for sensitive plans).

---

## 2. Open items that block the start (resolve before D1)

### TD-01 / TD-02 — Source-baseline import (decided; execution pending)
| Field | Content |
| --- | --- |
| Decision | **D-PLAN-3 (2026-10-13):** the new repository starts from `fc0981d` of the previous project repository. |
| What is still needed | One person (the team lead / repository owner) commits that code to `https://github.com/Kathir-M-03/FINNMIN-JFK-John` once, following [`repository-migration-notes.md`](repository-migration-notes.md) §5.3: no `.git` history, no `.env` files, no `*.db` files, no `node_modules/`; keep `dist/` (D-PLAN-13 deletes it on D8 in WS-FND-P5); merge the two `.gitignore` files; run the secret scan; re-check `baseline.md` Appendix A/B. After that, nobody uses the previous repository again. |
| Blocks | All 21 plans (dependency row 47) |
| Status | Approved — **execution pending** |
| Done by / Date / Import commit | ___ / ___ / ___ |

### TD-03 — Developer mapping and repository access (D-PLAN-1)
| Field | Content |
| --- | --- |
| Question | Which person is Dev A (WS-FND), Dev B (WS-CAT + WS-PLT), Dev C (WS-JON + WS-AGT), Dev D (WS-SEN + WS-UI)? GitHub handles? All three non-owners invited with **Write** access? |
| Why | CODEOWNERS in WS-FND-P1 (D1) needs the handles; reviews are requested by ownership |
| Recommendation | Strongest frontend developer as Dev D (least slack); most Git/CI-experienced as Dev A |
| Status | **Approved** 2026-10-15 — all four accepted the repository invitation (collaborators) |
| Decision | Dev A: Abhilash (@Falterred) — DeepSeek · Dev B: Kathir (@Kathir-M-03) — Claude Pro · Dev C: Anish (@DEstroy746) — 1 Gemini account · Dev D: Aryan (@AryanTechie-007) — 3 Gemini accounts · Team lead: ___ · Date: 2026-10-15 |

### TD-04 — Protecting `main`
| Field | Content |
| --- | --- |
| Question | GitHub enforces branch protection on private repositories only with GitHub Pro, Team or Enterprise (free plan: public repositories only). Is it available on this repository? |
| Options | **A** Upgrade to GitHub Pro · **B** Organisation on GitHub Team · **C** Public repository · **D** Enforce "PR + green CI before merge" by team agreement (the fallback already agreed in `baseline.md` §6) |
| Recommendation | A if affordable; otherwise D |
| Status | Pending — check Settings → Branches on D1 |
| Decision / Date | ___ / ___ |

---

## 3. Other open items

### TD-05 (part) — Doc 7 UI screens
Docs 0–6 are approved (A-ARCH). [`prototype-design/07-ui-screens-and-interactions.md`](prototype-design/07-ui-screens-and-interactions.md) was generated on 2026-10-13 and updated on 2026-10-15 for D-PLAN-5/6/9. **Recommendation:** approve as the UI baseline; Dev D may change items labelled **[I]** without a contract change. Needed before WS-UI-P1 (D1–D2). Status: Pending.

### TD-10 — CI minutes on a private repository
Private repositories have a monthly GitHub Actions allowance that depends on the owner's plan. **Recommendation:** run CI on `pull_request` to `main` and on `push` to `main` only; cache npm; the live workflow is manual (D-PLAN-11). Needed for WS-FND-P1. Status: Pending.

### TD-11 — Task tracking
`tracking/STATUS.md` is the status board (plans). **Recommendation:** additionally one GitHub Issue per plan for assignment and discussion (labels `WS-xxx`, `blocked`, `ready`, `in-progress`), linked from the plan's single PR with `Closes #n`; STATUS.md stays the record of status, evidence and gates. Status: Pending.

### TD-15 — `ChatRequest@1` field names
John spec §C.1 defines `message` and `trigger.kind ∈ {USER_MESSAGE, UI_ACTION, ALERT_OPEN}`. WS-UI-P3 §5 originally paraphrased it with different names; it was corrected to the spec on 2026-10-13. **Recommendation:** confirm John §C.1 as-is in WS-JON-P1's contract commit (Draft PR, D1). Blocks WS-UI-P3. Status: Pending.

### TD-16 — Electron only, or also a browser build (Q-UI-01)
`baseline.md` C-2: desktop-only; Doc 0 §3.1 "browser or Electron"; Doc 6 §5 step 2 mentions `npm run web`. **Recommendation:** Electron for the demo; keep the Vite dev server for development. Blocks WS-FND-P5 scripts and WS-UI-P3 verification. Status: Pending.

### TD-17 — Onboarding endpoint (Q-UI-05)
`POST /api/v1/onboarding` is in Doc 2 §6 but no backend plan owns it. **Recommendation:** sequential actions/cards (`UPDATE_PROFILE`, `UPDATE_PREFERENCE`, optional `CREATE_GOAL`) — no new route. Blocks the WS-UI-P2 onboarding step. Status: Pending.

### TD-19 — Money input vs the `_minor` lint rule (Q-UI-06)
**Recommendation:** typed-rupee → paise conversion (string parsing, no floats) and progress-bar ratios allowed only in `src/lib/format.js` and `src/lib/money-input.js`, exempted from the lint rule. Blocks WS-UI-P1 forms and lint rule. Status: Pending.

### TD-20 — Onboarding complete (Q-UI-04)
**Recommendation:** complete when `GET /preferences` returns a record where the user has answered the consent question (with D-PLAN-6 the stored default is off, so the record needs an explicit "answered" marker or the onboarding route must be the only creator of the record — WS-PLT-P2 to confirm). Blocks WS-UI-P2. Status: Pending.

### TD-21 — Memory facts in Settings (Q-UI-11)
Doc 0 §3.2 defers John's memory facts; WS-UI-P2 lists a list/delete section; the source baseline has the routes. **Recommendation:** show the section because the routes exist after the import (consistent with D-PLAN-5's "keep what already works"). Blocks WS-UI-P2 Settings. Status: Pending.

---

## 4. Non-blocking

| ID | Question | Recommendation | Owner | Status |
| --- | --- | --- | --- | --- |
| TD-22 | Sidebar order (SC §18 vs WS-UI-P1 step 6); landing screen; visual style | SC §18 order; John as landing; keep the imported app's styles | Dev D | Pending |
| TD-23 | Iris planner slider bounds and step | ±50 % of the trailing monthly average, ₹100 steps (value needed in the WS-SEN-P2 view schema) | Dev D | Pending |
| TD-24 | Licence | None while private; decide before making it public | Team lead | Pending |
| TD-25 | Thresholds; SC §21.3 O-1…O-5 | Backtest ±15 % confirmed on D4 (D-PLAN-10); golden target per P-AC-03 (D-PLAN-13); O-1…O-5 production only | Dev D / team lead | Partly approved |

---

## 5. Approved decisions (summary — full text in `baseline.md` §6)

| TD | Team decision | Outcome |
| --- | --- | --- |
| TD-01/02 | D-PLAN-3 | New repository owned by the team lead, starting from `fc0981d`; old module branches not carried over |
| TD-05 | A-ARCH | Docs 0–6 approved |
| TD-06 | C-1 | Real LLM agents (John, Atlas, Nova, Iris) with the existing deterministic code as fallback |
| TD-07 | C-5 | SC §13.2 action names + temporary aliases (removed in WS-FND-P5) |
| TD-08 | D-PLAN-2 | Keep physical table names; `TABLES.md` maps them |
| TD-09 | U-4, D-PLAN-4 | Short-lived plan branches; **one plan = one branch = one PR**; contract files as the **first commit** in a **Draft PR** for consumer approval; review commit by commit; **merge commit, not squash**; rebase on `main` at least daily. *(Supersedes this register's earlier recommendation of squash merges, ≤ 600-line PRs and separate contract PRs.)* |
| TD-12 | D-PLAN-11 | Qwen key in each developer's local `backend/.env` and a GitHub Actions secret for the manual live workflow; shared privately by one person; never committed |
| TD-13 | U-2, D-PLAN-12 | Qwen key and model arrive D3; if unavailable, a stand-in OpenAI-compatible provider via configuration only, results labelled with the model used |
| TD-14 | U-1, D-PLAN-9 | ≥ 9 working days (D1–D9); aim Tier 3, fall back to Tier 2; checkpoint end of D5 (G3 > 1 day late → cut Tier 3) |
| TD-18 | D-PLAN-5 | Keep deferred actions already working in the source baseline; build no new ones |
| TD-25 | D-PLAN-10, D-PLAN-13 | Backtest ±15 % provisional; golden target P-AC-03; D8 deletion of Backend B, legacy tables, committed `dist/` |
| — | D-PLAN-6 | LLM consent off until the user opts in; demo user seeded on |
| — | D-PLAN-7 | Producer publishes a contract-matching stub once half a day late |
| — | D-PLAN-8 | Independent review mandatory only for sensitive plans |
| TD-03 | D-PLAN-1 | Four developers: Abhilash (A), Kathir (B), Anish (C), Aryan (D) |

Other settled topics (do not reopen): frozen specifications and D-001…D-025; plan numbering and IDs; migration number ranges; money as integer paise; single write path through the Action Service; documentation layout (`docs/implementation-plan/` kept as named).

---

## 6. Recommended order
1. **Source-baseline import** (TD-01/02 execution) — before D1.
2. **TD-04** branch protection, **TD-10** CI minutes, **TD-11** tracking, **TD-05** Doc 7 — at the D1 kick-off (first hour).
3. **TD-15** during WS-JON-P1's contract commit review (D1); **TD-19** before WS-UI-P1 forms (D1–D2).
4. **TD-16, TD-17, TD-20, TD-21** before WS-UI-P2/P3 and WS-FND-P5 (by D5).
5. Stand-in provider and key holder (D-PLAN-12) before D8; backtest confirmation on D4.
6. TD-22 … TD-24 during implementation.

## 7. Implementation-readiness summary (2026-10-15)

| Area | Ready? | Notes |
| --- | --- | --- |
| Specifications | Yes | 7 frozen specs, unchanged |
| Prototype design | Yes | Docs 0–6 approved; Doc 7 pending approval |
| Implementation plans | Yes | 36 documents updated with the 2026-10-13 decisions; repository references reconciled |
| Process decisions | Yes | PR model, tiers, consent, stubs, review policy, Qwen handling all decided |
| Source code in repository | **No** | Import of `fc0981d` pending (TD-01 execution) |
| Team and access | Partly | Names, handles and access done (TD-03); branch protection open (TD-04) |
| External | Partly | Qwen details on D3; stand-in provider to choose before D8 |

**Conclusion:** the four developers can begin on D1 once the source-baseline import is merged and TD-04 is settled; the remaining open items have recommendations and are not on the D1 critical path.
