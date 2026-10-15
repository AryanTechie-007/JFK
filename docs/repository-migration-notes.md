# Repository Migration Notes

| Field | Value |
| --- | --- |
| New repository | `https://github.com/Kathir-M-03/FINNMIN-JFK-John` — owner `Kathir-M-03`, **private** |
| Project name | **FinMate AI** (product name used throughout `docs/specifications/` and `docs/prototype-design/`; "John Financial Coach" is the chat persona, not the product) |
| Migration date | 2026-10-13 |
| Input received | `finmate-docs-all.zip` — 54 Markdown files under `docs/` (specifications, prototype design, implementation plans, tracking) |
| Previous repository | `AryanTechie-007/JFK` — **historical reference only.** It is out of scope: it was not accessed, cloned, copied from or modified during this migration, and no active instruction in this repository depends on it |
| Status of this file | Audit trail. Records changes actually made. Update §2.2 when the repository is published and §5.5 when the source baseline is imported |

> **Reading rule.** This file names the previous repository to explain where the plans came from. Since 2026-10-13 the team's decision **D-PLAN-3** also names it in `implementation-plan/baseline.md` §6 and `workstream-assignments.md` §7 as the **one-time source of the initial code import** (`fc0981d`). Apart from that single import, no instruction uses the previous repository.

---

## 1. Summary
1. A new repository was prepared for FinMate AI with all received documentation, a root `README.md`, a documentation index, a four-developer Git/GitHub workflow guide, a team-decision register, a `.gitignore`, and these notes.
2. **All referenced specifications (7) and prototype-design documents (7 files, Docs 0–6) were found in the received package** — none were missing by filename. One substantive gap was found: no screen-level UI design existed, so **Doc 7 `prototype-design/07-ui-screens-and-interactions.md` was generated** from the existing documents.
3. Every implementation plan and supporting planning document was updated to target the new repository, with a per-plan "Repository context" banner and targeted rewrites where an instruction depended on the previous repository.
4. **Critical unresolved dependency:** the 21 plans modify application code (the *source baseline*) that is **not** in the new repository. All plans are Blocked until team decision **TD-01** is made (§5).
5. The repository could **not** be created on GitHub from the preparation environment (the session's GitHub access is limited to repositories already attached to it). It was prepared locally with full history; publishing requires the owner's action (§2.2).

---

## 2. The new repository

### 2.1 Identity
| Item | Value | Basis |
| --- | --- | --- |
| Name | `FINNMIN-JFK-John` | Chosen by the project lead on 2026-10-13 (replacing the initially prepared name `finmate-ai`). The product name in all specifications remains **FinMate AI**. The "JFK" in the repository name is the owner's naming choice and does **not** refer to or depend on the previous repository |
| Owner | `Kathir-M-03` | Chosen by the project lead on 2026-10-13 |
| Visibility | Private | Chosen by the project lead on 2026-10-13. Consequence: branch protection is enforced only with GitHub Pro/Team (TD-04) |
| Default branch | `main` | Plans assume `main` |

### 2.2 Publication status
| Check | Result (2026-10-13) |
| --- | --- |
| Repository exists on GitHub | **Not yet verified.** Creation through the API was refused in the preparation environment ("sessions are bound to their configured repositories"). The owner must create it (§2.3) |
| Local repository prepared | Yes — `main` with the commits listed in §7 |
| Pushed | **No** (pending owner action) |

*Update this table after publishing:* replace "Not yet verified" with the date and the URL check, e.g. `gh repo view Kathir-M-03/FINNMIN-JFK-John --json url,visibility`.

### 2.3 Publishing procedure (owner)
1. Create an **empty** private repository `FINNMIN-JFK-John` under `Kathir-M-03` (no README, no `.gitignore`, no licence — the prepared history already has them): `gh repo create Kathir-M-03/FINNMIN-JFK-John --private` or github.com → *New repository*.
2. From the prepared repository (delivered as `FINNMIN-JFK-John.bundle`): `git clone FINNMIN-JFK-John.bundle FINNMIN-JFK-John`, `cd FINNMIN-JFK-John`, `git remote set-url origin https://github.com/Kathir-M-03/FINNMIN-JFK-John.git`, `git push -u origin main`. Step-by-step Windows instructions were given to the owner on 2026-10-13.
3. Verify: `gh repo view Kathir-M-03/FINNMIN-JFK-John --json url,visibility,defaultBranchRef` and open `README.md` on GitHub; check that the relative links resolve.
4. Invite Dev A–D (TD-03) and configure `main` as described in `development-workflow.md` §2.
5. Update §2.2 of this file in a `docs/` PR.

---

## 3. Documentation inventory and organisation

| Area | Files | Found / generated | Location |
| --- | --- | --- | --- |
| Specifications | `system-contracts.md`, `john-orchestrator-spec.md`, `atlas-savings-strategist-spec.md`, `nova-budget-guardian-spec.md`, `iris-spending-advisor-spec.md`, `sentinel-financial-observer-spec.md`, `item-categorizer-spec.md` | Found (7/7). **Unchanged** | `docs/specifications/` |
| Prototype design | `00-overview.md` … `06-testing-and-acceptance.md` | Found (7/7). `00-overview.md` received a provenance note and a Doc 7 row; others unchanged | `docs/prototype-design/` |
| Prototype design — UI | `07-ui-screens-and-interactions.md` | **Generated** (gap: no screen-level design) | `docs/prototype-design/` |
| Implementation plans | 21 plan files in 7 workstreams | Found (21/21). Updated | `docs/implementation-plan/workstreams/` |
| Planning package | `README.md`, `baseline.md`, `workstream-assignments.md`, `cross-workstream-dependencies.md`, `roadmap.md`, `acceptance-checklist.md`, `audit-report.md`, `execution-manual.md`, `prompt-templates.md`, `first-day-action-plan.md` | Found. Updated (except `prompt-templates.md`: reviewed, repository-neutral, unchanged) | `docs/implementation-plan/` |
| Tracking | `tracking/README.md`, `STATUS.md`, `state/WS-*.md` (7) | Found. Updated | `docs/implementation-plan/tracking/` |
| New repository docs | `README.md` (root), `docs/README.md`, `docs/development-workflow.md`, `docs/team-decisions.md`, `docs/repository-migration-notes.md`, `.gitignore` | Generated | root and `docs/` |

**Layout decision.** The plans live in `docs/implementation-plan/` (singular), the name used in more than a hundred internal references, in CODEOWNERS instructions (WS-FND-P1) and in the ownership table. Renaming it to `implementation-plans/` would have created churn and risk without benefit, so the existing name was kept.

**Files referenced by plans but intentionally absent.** Plans reference many files they *create* during implementation (e.g. `backend/test/fixtures/llm/README.md`, `docs/implementation-plan/reports/acceptance-run.md`, `backend/src/db/TABLES.md`, `engines/sentinel/METHODS.md`, `.github/workflows/ci.yml`, `.github/CODEOWNERS`). These are implementation outputs owned by specific plans; they were **not** pre-created, to avoid ownership conflicts.

---

## 4. Repository-reference changes made

### 4.1 Categories of references updated
| Category | Example before | After |
| --- | --- | --- |
| Repository identity | "Repository state planned against `AryanTechie-007/JFK` `main` @ `54f9f6f`" | "Project repository `https://github.com/Kathir-M-03/FINNMIN-JFK-John`"; code state described as the **source baseline** (commit IDs kept as provenance) |
| "On `main`" meaning existing code | "already implemented on `main`", "`main` lacks", "physical names on `main`" | "in the source baseline" / "the source baseline lacks" |
| Docs-merge instructions | "Merge `docs/requirements-freeze-specs` into `main`" (WS-FND-P1 step 1, first-day plan step 2, gate G1) | Marked satisfied (docs are on `main` since initialisation); replaced by a source-baseline check |
| Old branch model | "long-lived module branches `atlas`, `iris`, `john`, `nova`, `sentinel`, `tally`; `sentinel_web` diverged; frozen" | Not carried over; must not be recreated; short-lived plan branches only |
| Clone / setup | "Everyone clones `main`" | "Everyone clones `https://github.com/Kathir-M-03/FINNMIN-JFK-John`" + link to the workflow guide |
| Push failures / delivered patch | "Push to `AryanTechie-007/JFK` (403) … delivered patch/zip" | "Push to the previous repository (403)" — historical, with a banner that it is superseded |
| Destructive recovery advice | "`git reset --hard <last good>` on the plan branch" | Restricted to unpushed commits on your own local branch; `git revert` otherwise |
| UI design references | WS-UI plans and execution manual §1.4 | Added Doc 7 references |

### 4.2 Files changed and what changed
| File | Change |
| --- | --- |
| All 21 `implementation-plan/workstreams/WS-*/plan-*.md` | Inserted a **Repository context** banner after the plan banner: repository URL, branch-from-`main` rule, link to the workflow guide, statement that *Modify/Keep/Delete/Move/[E]* files belong to the source baseline which is not yet in the repository, TD-01 gate, reinterpretation of "on `main`". WS-UI plans also link Doc 7. WS-AGT-P3 uses an adapted wording (no direct source-baseline edits) |
| `WS-FND/plan-001-…` | Objective note; scope item 1 and step 1 rewritten (docs merge → source-baseline check that stops the plan if code is absent); docs row in file table; `.gitignore` row and step 9 (entries already present; merge with an imported `.gitignore`); acceptance (1); assumptions on GitHub Actions minutes (TD-10) and branch protection (TD-04) |
| `WS-FND/plan-002-…`, `plan-003-…` | "`main` lacks" / "on `main`" → source baseline |
| `WS-PLT/plan-001-…` | `REMOVE_CAP` "not yet in the source baseline"; step 6: `RESTORE_GOAL`/`CREATE_ALERT` exist in the source baseline; not built under greenfield (TD-18) |
| `WS-CAT/plan-003-…` | Scope note: existing behaviour is in the source baseline; under greenfield nothing to move (TD-18) |
| `WS-UI/plan-001-…` | Step 7 conditional on TD-01; §12 adds Q-UI-02/06/10 |
| `WS-UI/plan-002-…` | §12 adds Q-UI-04/05/11 |
| `WS-UI/plan-003-…` | §5 request shape corrected to John §C.1 verbatim (was a conflicting paraphrase — see §6); §12 adds Q-UI-01/07 |
| `implementation-plan/README.md` | Repository row; source-baseline row; Doc 7 in authoritative inputs; start-condition row; step 0 in the execution procedure; link to the workflow guide |
| `implementation-plan/baseline.md` | Title → "Source Baseline"; read-first banner (out-of-scope previous repository, re-verification after import); prototype-design now on `main`; C-3 updated; C-4 updated; **C-7 added** (source baseline absent); Appendix B wording |
| `implementation-plan/workstream-assignments.md` | §1 wording; §7 intro (new repository, no module branches) and rule 1 (enforcement depends on TD-04) |
| `implementation-plan/audit-report.md` | Historical banner; 403 row reworded without the old repository name |
| `implementation-plan/first-day-action-plan.md` | New §0 (pre-D1 decisions); step 2 marked done; step 3 clone URL |
| `implementation-plan/roadmap.md` | New milestone M−1 "Repository ready"; G1 notes |
| `implementation-plan/acceptance-checklist.md` | G1 docs item ticked; source-baseline item added |
| `implementation-plan/cross-workstream-dependencies.md` | Row 46 wording; **row 47 added** (TD-01 → all plans). The matrix now has 47 rows (was 46) |
| `implementation-plan/execution-manual.md` | §1.4 header and WS-UI row (Doc 7); §4 reset advice made safe; §5.1 repository row + source-baseline row |
| `implementation-plan/tracking/STATUS.md` | TD-01 note; WS-FND-P1 and WS-UI-P1 "Waiting on" → TD-01 (WS-FND-P1 Ready → **Blocked**); decision-log rows TD-01, TD-02…TD-25 |
| `implementation-plan/tracking/state/WS-*.md` (7) | TD-01 line in §3; WS-FND objective wording |
| `implementation-plan/tracking/README.md` | GitHub Issues role (TD-11) |
| `prototype-design/00-overview.md` | Provenance row no longer names the previous repository; repository notes block (source baseline, P-0/R-11 satisfied, §4 six-person team and U-3/U-4 superseded for execution); Doc 7 row |

### 4.3 Instructions that required substantive revision (not just renaming)
1. **WS-FND-P1 step 1** — "merge the docs branch" became "verify the source baseline exists, else stop".
2. **WS-FND-P1 `.gitignore`** — now "verify and merge", because the repository already has a `.gitignore`.
3. **WS-UI-P3 §5** — the request shape contradicted the frozen spec; replaced by the spec definition (pending team confirmation TD-15).
4. **Conditional actions** in WS-PLT-P1, WS-CAT-P3, WS-UI-P1 — "exists on `main`, migrate as-is" now depends on TD-01.
5. **Status board** — WS-FND-P1 changed from *Ready* to *Blocked*: with no code in the repository it cannot start.
6. **Recovery advice** in the execution manual — `git reset --hard` limited to unpushed local work.

---

## 5. Source-code dependency (SD)

### 5.1 Statement
The plans are brownfield plans. They were written against application code (the **source baseline**) verified at commit `54f9f6f` and re-checked at `fc0981d` of the previous repository. **No application code was provided** in the received materials, and the previous repository is out of scope. Therefore:
- No source file referenced by a plan as existing (`[E]`, *Modify*, *Keep*, *Delete*, *Move*) exists in the new repository.
- No replacement code was written and no file was assumed to exist.
- `baseline.md` facts marked **[V]** were verified against the previous repository on 2026-10-11; they are **unverified for the new repository** until re-checked after an import.

### 5.2 Per-plan dependency on source-baseline files
| Plan | Source-baseline files it modifies / keeps / deletes (from plan §4) |
| --- | --- |
| WS-FND-P1 | `backend/package.json`, `backend/test-v1-specs.js`, `backend/src/routes/v1/index.js` (697 lines, split), `backend/src/index.js` (export guard), `.gitignore` |
| WS-FND-P2 | `backend/src/db.js` (inline DDL → migrations; schema dump of the existing DB) |
| WS-FND-P3 | `backend/src/platform/{gateway,snapshot}.js`, `backend/src/routes/v1/system.js`, `backend/src/index.js`, `backend/.env.example`, `backend/package.json` |
| WS-FND-P4 | `backend/src/seed.js`, root and backend `package.json` |
| WS-FND-P5 | Deletes legacy Backend B (`src/index.js`, `src/db/**`, `src/routes/**`, `src/contracts/**`, non-JSX `src/agents|tools/*/*.js`, `demo.js`), legacy routes; modifies `routes/{auth,users}.js`, `src/services/authService.js`, `backend/src/index.js`, `platform/profile.js`, `engines/categorizer/index.js`, `electron/main.js`, `launch.bat`, root `package.json` |
| WS-FND-P6 | `.github/workflows/ci.yml` (created by WS-FND-P1); everything merged |
| WS-CAT-P1 | `backend/src/engines/categorizer/{index,normalize,merchants,taxonomy}.js`, `shared/finance/{movement,coverage}.js` |
| WS-CAT-P2 | `backend/src/shared/money.js`, `backend/src/routes/v1/ingest.js` |
| WS-CAT-P3 | `engines/categorizer/index.js`, `platform/action-service.js`, `routes/v1/categorizer.js` |
| WS-SEN-P1 | `engines/sentinel/{index,params}.js` (17 functions) |
| WS-SEN-P2 | `engines/sentinel/{rules/index,index,params}.js`, `routes/v1/workspaces-{atlas,nova,iris,sentinel}.js` |
| WS-PLT-P1 | `platform/action-service.js` (major), `shared/contracts/action-registry.js`, `routes/v1/{actions,workspaces-nova,settings}.js` |
| WS-PLT-P2 | `platform/{budget-monitor,profile}.js`, `routes/v1/{settings,workspaces-nova,ingest,index}.js` |
| WS-AGT-P1 | `agents/nova/index.js` (deterministic composition becomes plan step + fallback) |
| WS-AGT-P2 | `agents/{atlas,iris}/index.js` and their compositions |
| WS-AGT-P3 | None directly; evaluates code from WS-AGT-P1/P2 and WS-JON-P1 |
| WS-JON-P1 | `agents/john/index.js`, `shared/contracts/grounding.js`, `routes/v1/chat.js` |
| WS-JON-P2 | `agents/john/index.js` |
| WS-UI-P1 | `src/App.jsx`, `src/components/{Sidebar,Header,AgentStatusBadge}.jsx`, view files under `src/agents/*/*.jsx`, `src/tools/sentinel/*.jsx`, `src/services/workspaceService.js`, `geminiService.js`, `src/data/mock*.js` |
| WS-UI-P2 | `src/components/{SettingsView,OnboardingView,HomeDashboardView,SubscriptionsView,StatementImportModal,FinancialHealthView}.jsx`, `src/tools/tally/SpendingAnalyserView.jsx`, `src/App.jsx`, legacy `src/services/*` |
| WS-UI-P3 | `src/components/{WorkspaceChatPanel,FormattedText}.jsx`, John view (`JohnCoachDashboard.jsx`), `src/services/{workspaceService,conversationService}.js` |

**Implication:** without the source baseline, no plan can start (cross-workstream matrix row 47).

### 5.3 Import procedure (decided by D-PLAN-3 on 2026-10-13; not yet performed)
1. The team lead (repository owner), who has access to the code and the code owner's agreement, creates branch `chore/import-source-baseline` from `main`.
2. Copy the working tree of the agreed commit (TD-02; recommended `fc0981d`) **without** its `.git` directory, `node_modules/`, any `.env` file except `.env.example` and `*.db*` files. Keep the committed `dist/` (Electron loads it; D-PLAN-13 deletes it on D8 in WS-FND-P5). Do not copy its `docs/` folder over this repository's `docs/` (this repository's copy is newer); compare and report differences instead.
3. Merge its `.gitignore` with this repository's `.gitignore` (keep every entry from both).
4. Secret scan before committing, e.g. `git grep -n -I -E "(api[_-]?key|secret|password|token)\s*[:=]" -- .` and a check that no `.env` or `*.db` is staged (`git status`). Rotate any credential that ever appeared in the previous repository's history.
5. Commit as one commit `chore: import source baseline from fc0981d (D-PLAN-3)`; open a PR; Dev A and one other developer review.
6. Re-verify `implementation-plan/baseline.md`: §2 stack facts, §3 module table, Appendix A (25 routes in `backend/src/routes/v1/index.js`), Appendix B tooling facts; run `node backend/test-v1-specs.js` against a temp DB (WS-FND-P1 §9 command). Record the result in this file (§5.5) and set WS-FND-P1 to *Ready* in STATUS.md.

### 5.4 Greenfield alternative (not chosen)
The team chose the import (D-PLAN-3). For the record, a greenfield build would have required re-planning all 21 plans before D1: *Modify/Keep/Delete* rows become *Create*; conformance plans (WS-CAT-P1, WS-SEN-P1) become build plans; WS-FND-P5 (legacy retirement) largely disappears; sizes and the D1–D9 schedule must be re-estimated; Doc 0 §1.6 ("existing code to reuse") no longer applies; TD-18 controls stay deferred. The specifications, Docs 0–7, the dependency structure between components and the four-developer allocation remain usable as the basis for the re-plan.

### 5.5 Resolution record
| Date | TD-01 decision | Imported commit | Verified by | Notes |
| --- | --- | --- | --- | --- |
| 2026-10-13 | Import `fc0981d` (D-PLAN-3) | — (not yet committed) | — | Execution pending |

---

## 6. Generated documents and conflicts found

### 6.1 Generated because the original did not exist
| Document | Why | Basis |
| --- | --- | --- |
| `prototype-design/07-ui-screens-and-interactions.md` | No screen-level UI design (layouts, fields, states, transitions, accessibility) existed; WS-UI-P1/P2/P3 needed it | SC §5, §8, §13, §18; Atlas §B.4; Nova §B.4–B.5; Iris §B.4; Sentinel §B.6.18, §C.3; Categorizer §B.7, §C.2–C.6; John §B.1, §B.8–B.11, §C.1–C.3; Docs 0–6; WS-UI plans. Confirmed vs inferred content is labelled **[C]/[P]/[I]/[Q]** |
| `team-decisions.md`, `development-workflow.md`, `docs/README.md`, root `README.md`, this file | Requested deliverables for the new repository | The planning package |

No specification was regenerated: all seven were present and internally referenced correctly.

### 6.2 Conflicts and inconsistencies found
| # | Conflict | Handling |
| --- | --- | --- |
| K-1 | WS-UI-P3 §5 `ChatRequest@1` paraphrase (`text`, `kind: MESSAGE`) vs John §C.1 (`message`, `trigger.kind: USER_MESSAGE`) | The plan names the spec schema it implements and the spec is frozen → plan corrected to the spec; confirmation requested (TD-15) |
| K-2 | Sidebar order: SC §18 vs WS-UI-P1 step 6 | Not resolved arbitrarily; Doc 7 uses SC order "until decided"; TD-22 |
| K-3 | `POST /onboarding` in Doc 2 §6 but no backend owner in any plan | TD-17 |
| K-4 | `RESTORE_GOAL`, `CREATE_ALERT`, `SET_TRANSACTION_TYPE`: deferred in Doc 0 §3.2 but kept "as-is" by audit A-18 because they existed in the source baseline | Now conditional on TD-01 (TD-18) |
| K-5 | John memory facts: deferred in Doc 0 §3.2; WS-UI-P2 lists a Settings section | TD-21 |
| K-6 | Delivery surface: C-2 (Electron only) vs Doc 0 §3.1 / Doc 6 §5 step 2 (`npm run web`) vs SC A-3 (production web) | TD-16 |
| K-7 | Doc 0 §4 (six developers, branch per workstream, U-4 default) vs the four-developer plan package (short-lived plan branches) | Already superseded by the audit (A-02, C-3); now stated explicitly in Doc 0's repository notes |
| K-8 | Chat endpoint: source-baseline `POST /chat` (used by WS-UI-P1 until WS-UI-P3) vs `POST /chat/messages` (John §B.1, Doc 2 §6) | Not a conflict: planned transition (WS-JON-P1 adds `/chat/messages`; WS-UI-P3 switches). Recorded for clarity |
| K-9 | Doc 4 §8.1 says `RESTORE_GOAL` deferred; WS-UI-P1 step 7 keeps it enabled | Same as K-4 |
| K-10 | `workstream-assignments.md` §7 "rebase daily" vs the request not to force-push shared branches | Workflow guide recommends merging `main` into the branch by default; rebase only on unshared branches with `--force-with-lease`; TD-09 asks the team to confirm |
| K-11 | Doc 6 uses `tests/…` fixture paths (e.g. `tests/fixtures/expected-spend.json`, `demo-expectations.md`) while the plans use `backend/test/fixtures/…` (e.g. `demo-expectations.json`) | Informational: the plans' paths (more specific, owned per `workstream-assignments.md` §4) govern file locations; Doc 6 defines the criteria, not the paths |

---

## 7. Commits in the prepared repository
| Commit | Content |
| --- | --- |
| 1 `cb60980` | `docs/` exactly as received in `finmate-docs-all.zip` (baseline for diffing every change below) |
| 2 `beaa50f` | Generated Doc 7 (UI screens) and prototype-design overview notes |
| 3 `7574143` | Implementation plans and planning package updated for the new repository |
| 4 `a905032` | Root README, docs index, development workflow, team decisions, migration notes, `.gitignore` |
| 5 `fadbab8` | Final audit results (§8), conflict K-11, execution-manual cross-reference fix |
| 6 `008e29a` | Repository renamed to `Kathir-M-03/FINNMIN-JFK-John` |
| 7 `f1d6210` (branch `team-updates-2026-10-13`) | The team's 36 updated files exactly as received in `finmate-docs-bundle.zip`, on top of commit 1 |
| 8 (merge) | Merge of commit 7 into `main` (§10) |

`git diff cb60980 HEAD -- docs/` shows every change made to the received documents. (Hashes are stable when the prepared history is pushed unchanged.)

---

## 8. Final reference audit (2026-10-13)
Method: case-insensitive search of every file in the repository for `JFK`, `AryanTechie`, any `github.com/<owner>/<repo>` URL, the old docs branch name, old module-branch names, and statements about "on `main`" that describe the old code state. Every match was reviewed by hand.

### 8.1 Results
| Search | Matches remaining | Where | Verdict |
| --- | --- | --- | --- |
| `AryanTechie` (previous repository owner) | 1 file | This file only (§0 header, §4.1 "before" examples) | **Historical.** Labelled; nowhere an instruction |
| `JFK` | Every file that names the new repository `Kathir-M-03/FINNMIN-JFK-John`, plus this file's historical references | Repository name chosen 2026-10-13 | **Correct target** in the new repository name; the only references to the *previous* repository `AryanTechie-007/JFK` are in this file |
| GitHub URLs | Only `Kathir-M-03/FINNMIN-JFK-John` (no `AryanTechie-007` URL anywhere) | README, workflow guide, plans' banners, planning files | **Correct target.** No other repository URL anywhere |
| Old docs branch `docs/requirements-freeze-specs` | 4 mentions | `audit-report.md` (2, under the historical banner), `prototype-design/00-overview.md` R-11 (marked *satisfied*), this file | **Historical**, each marked |
| Old module branches (`sentinel_web`, `atlas`, …) | `baseline.md` re-check note (marked historical: must not be recreated), `audit-report.md` (historical), `workstream-assignments.md` §7 (states they were not carried over) | | **Historical / prohibitive**, not active |
| Commit IDs `54f9f6f`, `fc0981d`, `485ed0f`, `546a226` | `baseline.md`, plans README, `audit-report.md`, Doc 0, this file, `team-decisions.md` | | **Provenance of the source baseline.** Needed for TD-02 (which commit to import, if any) |
| "on `main`" describing existing code | Remaining occurrences are covered by the banner in every plan and in `baseline.md` ("read 'in the source baseline'"); the explicit cases in plans were rewritten (§4.2) | | **Reinterpreted**, not an instruction to use the old repository |
| Instructions to clone, pull from, push to or open PRs against the old repository | **0** | — | — |

**Conclusion:** no active implementation plan or development instruction directs a developer or AI coding assistant to the previous repository. All active instructions target `https://github.com/Kathir-M-03/FINNMIN-JFK-John`. The remaining dependency on the old code base is the explicit, documented **TD-01** gate, not a silent assumption.

### 8.2 Other validation performed (2026-10-13)
| Check | Result |
| --- | --- |
| Relative Markdown links and `#anchors` (all files) | 193 links checked, **0 broken** (GitHub slug rules) |
| Backtick paths to `.md` files that don't exist | All are files that plans **create** during implementation or source-baseline files (e.g. `backend/src/db/TABLES.md`, `reports/acceptance-run.md`, agent prompt files) — expected; none refer to missing documentation |
| Plan structure | All 21 plans keep sections 1–13 and have the repository-context banner |
| Plan numbering and IDs | Unchanged: 7 sequences (6/3/2/2/3/2/3), 21 unique IDs |
| Secrets / local files | No keys, tokens, passwords, `.env`, `*.db`, `*.pem` or `*.key` files in the repository; `.gitignore` covers them |
| Tracked files | 61: 55 documentation files under `docs/` (54 received + Doc 7) + 4 new docs guides + root `README.md` + `.gitignore` |

---

## 9. Unresolved items requiring a decision
All listed in [`team-decisions.md`](team-decisions.md) (updated 2026-10-15). Before D1: the **source-baseline import** (decided, not yet executed), **TD-03** (people and access), **TD-04** (branch protection). Also open: TD-05 (Doc 7 approval), TD-10, TD-11, TD-15…TD-17, TD-19…TD-21, the stand-in LLM provider (before D8).

---

## 10. Update of 2026-10-15 — team decision bundle merged

### 10.1 What was received and how it was verified
| Check | Result |
| --- | --- |
| Received | `finmate-docs-bundle.zip` — 54 files under `docs/` (same file list as the original package) |
| Compared with the **original package** (`finmate-docs-all.zip`, commit `cb60980`) | **36 files changed, 18 identical, 0 added, 0 removed** — confirms the stated 36 updates (SHA-256 per file) |
| Compared with the **prepared repository bundle** (`FINNMIN-JFK-John.bundle`, commit `008e29a`) | 41 files differ, 13 identical, **7 files missing** from the received bundle |
| Origin of the 36 changes | Made on the original package, not on the prepared repository: none of the received files contains the repository edits of 2026-10-13 |
| Nature of the 36 changes | Recording the team decisions of 2026-10-13: A-ARCH, C-1, C-3, C-4, C-5, U-1, U-2, U-4, D-PLAN-1…13 (`baseline.md` §6) and applying them consistently across plans, roadmap, matrix, manual, checklist, templates and tracking |

**The 36 updated files:** `implementation-plan/` README, acceptance-checklist, baseline, cross-workstream-dependencies, execution-manual, first-day-action-plan, prompt-templates, roadmap, workstream-assignments; `tracking/` README, STATUS and the 7 state files; plans WS-AGT-P2, WS-AGT-P3, WS-CAT-P2, WS-CAT-P3, WS-FND-P1, WS-FND-P2, WS-FND-P3, WS-FND-P5, WS-FND-P6, WS-JON-P1, WS-JON-P2, WS-PLT-P1, WS-PLT-P2, WS-SEN-P1, WS-SEN-P2, WS-UI-P1, WS-UI-P2, WS-UI-P3. Unchanged by the team: all specifications, prototype-design Docs 0–6, `audit-report.md`, and plans WS-AGT-P1, WS-CAT-P1, WS-FND-P4.

**Are they necessary?** Yes. Each change applies a recorded decision (e.g. one plan = one PR, merge commit; tier checkpoint at end of D5; Qwen details on D3 with a stand-in provider; LLM consent off by default; stub after half a day). A scripted scan found no leftover contradictions in the received set (no remaining "squash", "≤ 600 lines", "separate contract PR", "step 1", "blocked by U-2" instructions).

### 10.2 Files missing from the received bundle — restored
`README.md`, `.gitignore`, `docs/README.md`, `docs/development-workflow.md`, `docs/team-decisions.md`, `docs/repository-migration-notes.md`, `docs/prototype-design/07-ui-screens-and-interactions.md`. All seven are part of the repository and were restored, then updated for the team decisions (10.4).

### 10.3 How the two sets were merged
A three-way merge with the original package as the common base: the 36 team-updated files on one side, the repository edits of 2026-10-13 on the other. 18 of the 36 files merged automatically; 18 had overlapping edits. **In every overlap the team's text was kept**, then the repository information was re-applied where it is still true (repository URL, link to the workflow guide, source-baseline import status, Doc 7 references). The team's decisions were not altered. A line-by-line check confirms every line the team added is present verbatim except 10 lines that were amended only to record facts the team had left open: the repository name/link ("name/link still to be recorded"), the clone URL, the pending import, and that Doc 7 still awaits approval.

### 10.4 Repository documents revised to match the team decisions
| Document | Revision |
| --- | --- |
| `development-workflow.md` | Squash merge → **merge commit**; "≤ 600 lines / split plans / separate contract PRs" → **one plan = one branch = one PR**, contract files as the **first commit of a Draft PR**, review commit by commit; daily **rebase** with `--force-with-lease` on one's own plan branch only (never `main` or shared branches); stub after half a day; D1 table; tier checkpoint; full example rewritten; settings (merge commits only) |
| `team-decisions.md` | Rewritten: each TD item mapped to the team decision that answered it; still-open items only; readiness verdict "almost ready" |
| `prototype-design/07-…` | Conditional controls resolved by D-PLAN-5 (enabled); consent toggle **off by default** (D-PLAN-6); tier-cut note for the Sentinel workspace (D-PLAN-9) |
| Plan banners (21), plans README, baseline, STATUS, state files, matrix row 47, roadmap M−1, checklist, first-day §0, execution manual, Doc 0 notes | "TD-01 pending" → "D-PLAN-3 decided; import of `fc0981d` pending"; repository name/link recorded where the team wrote "name/link still to be recorded" |
| Root `README.md`, `docs/README.md` | Status, contribution rules and open items aligned with the decisions |

### 10.5 Earlier recommendations superseded by team decisions
| Earlier recommendation (2026-10-13) | Team decision | Now |
| --- | --- | --- |
| Squash merges; PRs ≤ 600 lines; split large plans; separate contract PRs | D-PLAN-4 | One PR per plan, merge commit, contract commit first in a Draft PR |
| Merge `main` into branches by default | U-4 | Daily rebase (own plan branch, `--force-with-lease`) |
| LLM key never in GitHub Actions | D-PLAN-11 | Key also stored as an Actions secret for the manual live workflow |
| Exclude `dist/` from the import | D-PLAN-13 | Keep `dist/`; delete it on D8 |
| "Stub after one day late" (matrix, original) | D-PLAN-7 | Half a day |

### 10.6 Reference audit after the merge
| Search | Result |
| --- | --- |
| `AryanTechie-007/JFK` | This file (history) and **D-PLAN-3** in `baseline.md` (§ banner and §6 row) and `workstream-assignments.md` §7: an **active team decision** naming the old repository as the one-time import source (`fc0981d`). No clone/pull/push/PR instruction for daily work |
| Other repository URLs | Only `https://github.com/Kathir-M-03/FINNMIN-JFK-John` |
| Links | All relative links and anchors resolve |

---

## 11. Update of 2026-10-15 — team members recorded
`main` on GitHub was replaced with commit `b0c55b2` by the repository owner (force push, 2026-10-15). One other remote branch, `ws-sen/p2-http-schemas`, was created by a team member and was **kept** on purpose; its owner rebases it on `main` before continuing.

This commit records D-PLAN-1 / TD-03 in `workstream-assignments.md` §2.0, `baseline.md` §6, `STATUS.md` §4, the seven state files, the execution manual, the first-day plan, the checklist, the roadmap, `team-decisions.md`, the root README and the docs index:

| Role | Name | GitHub | Coding-model resources |
| --- | --- | --- | --- |
| Dev A — Integration Lead (WS-FND) | Abhilash | @Falterred | DeepSeek |
| Dev B — WS-CAT + WS-PLT | Kathir | @Kathir-M-03 | Claude Pro |
| Dev C — WS-JON + WS-AGT | Anish | @DEstroy746 | 1 Gemini account |
| Dev D — WS-SEN + WS-UI | Aryan | @AryanTechie-007 | 3 Gemini accounts |
