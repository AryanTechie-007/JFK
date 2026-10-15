# Execution Manual — Implementing FinMate AI with Coding Models (Four Developers)

This manual turns the 21 plans into a repeatable process. It assumes nothing about the coding model or provider: Dev A–Dev D may each use a different one. Every rule here applies to a repo-aware agent (can read files and run commands) and to a chat-only model (cannot see the repository); where they differ, both are described.

Read in this order: `README.md` → `baseline.md` → `workstream-assignments.md` → this manual → `prompt-templates.md` → your own plan files.

---

## 1. How to feed plans to coding models

### 1.1 Strategies considered
| Strategy | What happens | Verdict |
| --- | --- | --- |
| 1. All plans of the workstream at once | Model sees Plan 1…N and is told to implement them | **Rejected.** The model blends plans, starts later work before dependencies exist, and produces one giant unreviewable diff. Acceptance per plan becomes impossible |
| 2. One plan at a time, nothing else | Model sees only the current plan | **Rejected.** The model lacks the contracts, the reasons behind constraints and the neighbouring plans, so it re-invents interfaces and "helpfully" implements the next plan's scope |
| 3. Primer (architecture + contracts + sequence overview) once, then one plan at a time | Session starts with a compact primer; each request carries only the current plan and validation context | **Recommended for implementation** |
| 4. Different strategies per activity | Implementation, review, debugging and integration use different sessions and context | **Recommended in combination with 3** |

### 1.2 Recommended approach: "primer + one plan per session, separate reviewer"
1. **One fresh implementation session per plan.** It begins with Template A (primer) and immediately continues with Template B (execute exactly one plan). The session ends when the plan's handoff (Template E) is written.
2. **A separate reviewer session** (Template C) with no memory of the implementation checks the diff against the plan. Use a different model or provider for review when one is available; otherwise a fresh session of the same model.
3. **Debugging** (Template D) runs in the implementation session if the failure is inside the plan's own scope and the session is still small; otherwise in a fresh session seeded with the failing output.
4. **Continuity lives in files, not in model memory:** the plan file, `tracking/state/<WS>.md`, Git history, test output and the previous handoff. Any model can resume from those.

### 1.3 The five context layers
| Layer | Contents | How to provide it | Size target |
| --- | --- | --- | --- |
| **Context documents** | ADRs (Doc 1 §8), the spec sections listed for the workstream (§1.4), `workstream-assignments.md` §4–§5 (ownership), global rules (`README.md`) | Repo-aware agent: **paths + section numbers** ("read SC §13.1–13.6"). Chat-only model: paste the listed sections only | ≤ 25 % of the model's context |
| **Sequence overview** | The workstream's plan list (titles, IDs, one-line objective, dependencies), from the workstream folder + `tracking/state/<WS>.md` | Always pasted (short, in Template A) | ≤ 1 page |
| **Current execution instruction** | The full current plan file | Always pasted in full (Template B) — never summarised | 3–6 pages |
| **Validation context** | Plan §9 test commands, §10 acceptance, relevant spec acceptance IDs, previous plan's handoff, current test output | Pasted (Template B, C, D) | ≤ 2 pages |
| **Cross-workstream context** | Only the contracts this plan consumes or produces (rows of `cross-workstream-dependencies.md`, merged schema files, signatures from Doc 2 §5) | Paths for repo-aware agents; pasted excerpts for chat-only | ≤ 2 pages |

Rule of thumb: **paste what defines the task and how it is judged; reference what the model can look up.** Never paste the whole specification set, the whole roadmap or other workstreams' plans.

### 1.4 Context map per workstream (what each primer references)
SC = `docs/specifications/system-contracts.md`; Doc N = `docs/prototype-design/0N-*.md`.

| Workstream | Specification sections | Design sections | Existing code to inspect first (source-baseline files — available once the D-PLAN-3 import is on `main`) |
| --- | --- | --- | --- |
| WS-FND | SC §3, §4, §7, §10.2–10.3, §14, §15, §16, §17.8 | Doc 1 §2, §8 (ADR-01, 02, 04, 05, 06, 13); Doc 2 §3, §5.1, §5.5, §6; Doc 5; Doc 6 §1–§5 | `backend/src/{index,db}.js`, `routes/v1/index.js`, `platform/{gateway,snapshot}.js`, `backend/test-v1-specs.js`, `electron/main.js`, root + backend `package.json` |
| WS-CAT | `item-categorizer-spec.md` (all; esp. §B, §C, §K); SC §5.3, §6, §8, §13.2 (categorizer rows), §14, §17.7 | Doc 2 §3.3, §5.2–5.3; Doc 3 F1, F2, F8; Doc 4 §7 | `engines/categorizer/**`, `shared/finance/**`, `routes/v1/{categorizer,ingest}.js`, `platform/action-service.js` (categorization cases) |
| WS-SEN | `sentinel-financial-observer-spec.md` (§B, §C, §K); SC §6, §7, §8, §10, §11, §12 | Doc 2 §5.4, §6; Doc 3 F3; Doc 4 §6 | `engines/sentinel/{index,params}.js`, `engines/sentinel/rules/index.js`, `routes/v1/workspaces-*.js` |
| WS-PLT | SC §5.1–5.10, §12, §13, §14, §16.7; `nova-budget-guardian-spec.md` §B.4 | Doc 2 §3.4, §5.5, §6; Doc 3 F6, F7, F9; Doc 4 §8; Doc 5 S-4–S-6, S-15 | `platform/{action-service,profile,budget-monitor}.js`, `shared/contracts/{action-registry,constraint-messages}.js` |
| WS-AGT | SC §9, §10, §11, §16.4–16.5; `atlas-*`, `nova-*`, `iris-*` specs (§B–§K) | Doc 1 ADR-06, ADR-07; Doc 4 §2–§5; Doc 5 S-9, S-10 | `agents/{atlas,nova,iris}/index.js`, `platform/gateway.js`, `shared/contracts/{grounding,validator}.js` |
| WS-JON | `john-orchestrator-spec.md` (all); SC §9, §11, §13.1–13.4, §15, §16.4–16.6 | Doc 3 F4, F5, F6, F8, F10, F11; Doc 4 §1; Doc 5 S-4, S-11 | `agents/john/index.js`, `routes/v1/chat.js` (after split), `shared/contracts/grounding.js` |
| WS-UI | SC §18; workspace sections: Atlas §B.4, Nova §B.5, Iris §B.4, Sentinel §B.6.18; John §C.1–C.2 (Plan 3) | Doc 1 §6, ADR-11; Doc 2 §6; Doc 3 F3, F6, F10; Doc 6 §5; **Doc 7 (screens, added 2026-10-13)** | `src/App.jsx`, `src/components/**`, view files listed in WS-UI-P1 §3, `src/services/workspaceService.js` |

### 1.5 Repo-aware agent vs chat-only model
> **This team (2026-10-15):** DeepSeek (Dev A), Claude Pro (Dev B) and Gemini (Dev C, Dev D). Each developer checks whether their tool can read the repository and run commands (repo-aware) or only chats (chat-only) and follows the matching rules below. Because the team has three different model families, a Template C review can always use a model other than the one that wrote the code.

- **Repo-aware agent** (can read files and run commands): give paths and section numbers; require it to read them and to run the plan's tests itself. Paste only the plan, the sequence overview and validation context.
- **Chat-only model** (cannot see the repository): build a *context pack* per plan and paste it. From the repo root (Git Bash or PowerShell):
  ```
  git ls-files backend/src src > context-files.txt
  ```
  then paste: the plan; the spec sections from §1.4 (copy the sections, not whole files); the **current content of every file in the plan's §4 table** (whole file if under ~400 lines, otherwise the relevant functions plus its exports); merged contract files it consumes. Ask for complete replacement files or unified diffs; the developer applies them, runs the tests, and pastes results back (Template D). Chat-only models must never be asked to "assume" a file's content.

### 1.6 Keeping the model inside its scope
- The plan's §4 table is the **allow-list of files**. Template B repeats it and forbids any other file; reviewers reject diffs outside it (`git diff --stat` against the list).
- Files owned by another workstream may be changed only where the plan's §4 row says "coordinated"/"approves", and then only inside this plan's PR with that owner as a required reviewer (CODEOWNERS).
- CODEOWNERS makes GitHub request the right reviewer automatically.

---

## 2. Standard implementation loop (every plan)

| # | Step | Who | Concrete action | Exit condition |
| --- | --- | --- | --- | --- |
| 1 | Check prerequisites | Developer | Plan §2: every *implementation* dependency is *Complete* in `tracking/STATUS.md`; every *interface* dependency's contract is merged (or in the spec). `git pull` `main` | All satisfied, or the plan stays **Blocked** |
| 2 | Prepare context | Developer | Pick documents from §1.4; update `tracking/state/<WS>.md` (last handoff, decisions); collect plan §9 commands | Context pack ready |
| 3 | Start a clean session | Developer | New conversation/agent task; create branch `ws-<id>/p<n>-<slug>` from `main` | Branch exists; STATUS row → **In progress** |
| 4 | Provide overview + plan | Developer | Send Template A, then Template B with the full plan | Model restates scope, files and acceptance in its own words; correct it if wrong |
| 5 | Inspect before changing | Model | Read every file in plan §4 and the consumed contracts; list what already exists vs what is missing; flag spec/code conflicts | Inspection report reviewed by developer before any code |
| 6 | Implement current scope only | Model | Steps in plan §6, in order; tests first where the plan says so | Model reports done **with** command output |
| 7 | Run tests and validation | Developer (not only the model) | Plan §9 commands + `npm --prefix backend test` + `npm run build` + `npx oxlint` (+ grep gates) | All green locally; counts recorded |
| 8 | Inspect the diff | Developer, then reviewer session (Template C) | `git diff --stat main...HEAD`, then the full diff; checklist §3 | No unrelated change, no invented API, no contract violation |
| 9 | Check acceptance against behaviour | Developer | Walk plan §10 line by line with evidence (test name, command output, screenshot) | Every criterion has evidence or a recorded, approved exception |
| 10 | Commit / PR | Developer | **One PR for the whole plan** (D-PLAN-4); commits in plan-step order titled `WS-<ID>-P<n>: …`; contract files (if any) in the first commit, PR opened as Draft for consumer approval; CI green; owner review commit by commit (`git diff --color-moved=dimmed-zebra main...HEAD`) | PR merged whole with a merge commit (not squash) |
| 11 | Handoff | Model drafts (Template E), developer verifies | Paste into PR description and `tracking/state/<WS>.md` | Handoff matches reality |
| 12 | Update status, unblock | Developer | STATUS row → **Complete**; mark newly **Ready** plans (plan §13 "Next eligible"); post in team channel | Downstream owners notified |

**A plan is complete only when** steps 7–12 are done: merged to `main`, CI green on `main` after merge, all plan §10 plan-level criteria evidenced, independent review recorded where required, handoff written and STATUS updated. A model saying "done" is never evidence.

**Before moving to the next plan:** `main` must be green with the plan merged; the state file must name the next plan; the session for the finished plan is closed.

---

## 3. Developer review checklist (FinMate-specific)
Run on every diff before the PR (and give to the reviewer model in Template C):
1. **Scope:** only files in plan §4; no edits to another workstream's files without the approval named in §4.
2. **Invented things:** no new public function, route, table, event type, action name, env var or dependency that is not in the plan, the spec or a merged contract.
3. **Money:** integer paise / basis points only; no `parseFloat`, `Number(x) * 100`, `/ 100` or `toFixed` on money; half-even rounding via `shared/money`.
4. **Writes and consent:** no write path outside the Action Service (ingestion excepted); no code path where LLM output or chat text causes a T2/T3 execution; tokens never returned at proposal creation or sent to an LLM.
5. **Isolation:** every query filters `user_id` from the session; foreign IDs → 404.
6. **Grounding:** no numbers in LLM-visible or user-visible text that are not bound to a tool result; no fabricated `tool_result_id`.
7. **No mock data / no hardcoded financial results** in product code; synthetic data only through ingestion and labelled.
8. **Tests:** no deleted, skipped or weakened assertions; new tests fail without the change (spot-check one by reverting).
9. **Contracts:** schema files unchanged unless this plan produces them (first commit, approved by the consumers).
10. **Secrets:** no keys in code, fixtures, logs or `dist/`.

---

## 4. Sessions: when to continue, restart, review or debug
| Situation | Rule |
| --- | --- |
| Next plan in the same workstream | **New session** (Template A + B). Carry context only through the state file and handoff |
| Same plan, model still focused, context < ~60 % used | Continue in the same session |
| Same plan, context > ~60 %, repeated re-reading of files, contradictions with earlier decisions, or > 2 hours elapsed | Write a handoff (Template E, status *partial*), **start a new session** with Template A + B + that handoff |
| Plan finished, before merge | **Separate reviewer session** (Template C), preferably a different model/provider |
| A test fails and the cause is inside this plan's files | Ask the implementing session to fix it (Template D) **once**; if the second attempt fails, open a fresh debug session with the failing output |
| A test fails in another workstream's area, or after a merge | Fresh debug session (Template D) owned by the developer whose PR caused it; the other owner is consulted |
| Two developers' code disagrees at an interface | Integration session (Template F) run by the consumer, with both contracts pasted; result goes to both owners |
| Model starts redesigning, adding features or editing unrelated files | Stop; revert the session's changes (`git restore`, or `git reset --hard <last good>` **only on your own local plan branch and only for commits you have not pushed**; for pushed commits use `git revert` — see `../development-workflow.md` §10.7); restart with Template B emphasising scope |

**Context carry-over kit** (enough for any model to resume): (1) plan file; (2) `tracking/state/<WS>.md`; (3) `git log --oneline main..HEAD` and `git diff --stat main...HEAD`; (4) the last test output (failing tests verbatim); (5) the latest handoff. Never rely on "as we discussed earlier".

---

## 5. Parallel execution for four developers

### 5.1 Decisions in force (decided 2026-10-13 — full record in `baseline.md` §6)
| Item | Decision | ID |
| --- | --- | --- |
| Architecture and scope | Design approved; real LLM agents with deterministic fallback; aim for Tier 3, fall back to Tier 2 (checkpoint end of D5) | A-ARCH, C-1, D-PLAN-9 |
| Time | 9 or more working days (D1–D9) | U-1 |
| Repository and branches | `https://github.com/Kathir-M-03/FINNMIN-JFK-John` (owned by the team lead, starts from the source baseline at `fc0981d`); short-lived plan branches; protected `main`; procedure in [`../development-workflow.md`](../development-workflow.md) | D-PLAN-3, U-4 |
| PR granularity | One plan = one branch = one PR; contract commit first in a Draft PR; merge commit, not squash | D-PLAN-4 |
| Action names / table names | SC names + temporary aliases / keep physical table names | C-5, D-PLAN-2 |
| Deferred actions | Keep those already working on `main`; build no new ones | D-PLAN-5 |
| LLM consent | Off until the user opts in; demo user seeded on | D-PLAN-6 |
| Late dependencies | Contract-matching stub after half a day | D-PLAN-7 |
| Independent review | Mandatory for sensitive plans only | D-PLAN-8 |
| Qwen | Key and model arrive on D3; key in each local `backend/.env` + GitHub Actions secret, never committed; stand-in OpenAI-compatible provider if Qwen is unavailable | U-2, D-PLAN-11, D-PLAN-12 |
| Sentinel backtest | Provisional ±15 % monthly spend forecast error, confirmed on D4 | D-PLAN-10 |
| Team | Dev A Abhilash (@Falterred, DeepSeek) · Dev B Kathir (@Kathir-M-03, Claude Pro) · Dev C Anish (@DEstroy746, 1 Gemini account) · Dev D Aryan (@AryanTechie-007, 3 Gemini accounts) | D-PLAN-1 |
| Coding conventions | CommonJS backend, `node:test`, money rules (§3), no new dependencies without WS-FND approval | — |
| Environment | Node ≥ 22.5 (CI uses 22.x); `backend/.env` from `.env.example`; `LLM_PROVIDER=fake` only in tests | — |
| Test/build commands | `npm --prefix backend test`, `npm run build`, `npx oxlint` (available once WS-FND-P1 merges, end of D1) | — |
| Shared-file ownership, tracking, integration | `workstream-assignments.md` §4–§7; `tracking/`; merge windows midday/evening + Dev A's evening build | — |
| **Still open** | Source-baseline import commit (before D1); stand-in provider and its key holder (before D8); branch-protection availability | — |

### 5.2 Stages (mapped to `roadmap.md` §4)
| Stage | Days | Starts | Runs in parallel | Blocked until | Deliverable / verification |
| --- | --- | --- | --- | --- | --- |
| 1. Repository and environment | D1 | Dev A WS-FND-P1 (one PR) | Dev C WS-JON-P1 (contract commit, Draft PR); Dev D WS-UI-P1; Dev B test design on Dev A's branch | — | WS-FND-P1 merged in the evening window; everyone runs `npm --prefix backend test` locally |
| 2. Contract stabilisation | D1–D3 | Contract commits reviewed in Draft PRs: WS-JON-P1 (Dev C, D1), WS-PLT-P1 (Dev B, D2), envelope schemas in WS-FND-P3 (Dev A, D2–D3); other consumers build against the frozen spec sections | All four | Consumers' approval | Contract commits approved; G1 |
| 3. Skeleton integration | D2–D3 | WS-FND-P2, WS-FND-P3, WS-UI-P1 | WS-CAT-P1, WS-PLT-P1, WS-JON-P1 (local fake) | FND-P3 for adapter/dispatcher use | G2: CI green, migrations, dispatcher, fake LLM, five workspaces render |
| 4. Deterministic core | D3–D4 | WS-SEN-P1, WS-PLT-P1/P2, WS-FND-P4 | WS-JON-P1 completes | — | G3: ingest → categorize → event → alert; T2 needs confirm |
| 5. Component implementation | D4–D7 | WS-AGT-P1, WS-SEN-P2, WS-CAT-P2, WS-CAT-P3, WS-UI-P2, WS-JON-P2 | All | Per matrix | Plans merged one by one; nightly integration build |
| 6. Cross-component integration | D6–D8 | WS-JON-P2, WS-UI-P3, WS-AGT-P2 | WS-FND-P5 prep | JON-P2 for UI-P3 | G4 (D7): chat flows with fake LLM |
| 7. End-to-end verification | D8–D9 | WS-FND-P5, WS-FND-P6 | Fix PRs from all | All plans merged | G5 (D8), G6 (D9) |
| 8. Demo readiness | D9 | Team | — | G6 | G7 sign-off; demo rehearsal from `npm run reset-demo` |

**Delays.** A developer more than half a day late on a plan with dependants publishes the contract-faithful stub described in `cross-workstream-dependencies.md` §4 rule 2 (same export, real signature, documented limitation) or the consumer continues on fixtures — **never** on an interface the consumer invents. If Dev D slips past D2, apply contingency 1 in `workstream-assignments.md` §2.3.

### 5.3 Dependency management
Use `cross-workstream-dependencies.md` (46 rows: producer, consumer, artifact, type, early start, fallback, earliest safe start). Only rows typed *implementation* or *integration* block; *interface* rows are satisfied by a merged contract. Ordering preferences are not dependencies (e.g. WS-CAT-P2 and WS-CAT-P3 both need only WS-CAT-P1).

### 5.4 Git and integration workflow
`workstream-assignments.md` §7 is authoritative. In short: new repository owned by the team lead; protected `main`; one plan = one branch = one PR, contract commit first in a Draft PR, reviewed commit by commit, merged with a merge commit; CI must be green; two merge windows a day; Dev A's nightly integration build (`npm run reset-demo` once it exists, full suite, skeleton smoke, later the E2E journey); a breaking PR is reverted the same day and fixed via Template F. Rebase daily: `git fetch origin && git rebase origin/main`.

### 5.5 Integration gates (evidence)
| Gate | Evidence required (attach to `tracking/STATUS.md` gate log) |
| --- | --- |
| G1 (end D1) | Links: docs in the repository, WS-FND-P1 PR (harness, CI, route split, CODEOWNERS), WS-JON-P1 Draft PR with its contract commit; decision log entries |
| G2 (end D3) | CI run green on `main`; `schema-baseline.test.js` pass; dispatcher + adapter tests pass; screenshot of five workspaces + Settings in Electron |
| G3 (end D4) | Integration test names and output: ingest → `categorization.updated` → alert; `no-auto-execute.test.js`; Sentinel golden summary (17 functions) |
| G4 (end D7) | `backend/test/integration/chat-*.test.js` output; correction-propagation test; consent-off zero-call test |
| G5 (end D8) | `demo-journey.test.js` (fake) output; `legacy-gone.test.js`; `git grep` gates empty; Electron single-server check |
| G6 (D9) | Security S-1…S-16, failure injection, restart test outputs; live suite with Qwen or the labelled stand-in provider |
| G7 (D9) | `acceptance-checklist.md` §4 filled with evidence; team-lead sign-off |

Integration starts on D1 (shared harness, contract commits in Draft PRs) and happens every evening — never only at the end.

---

## 6. Quality control and failure recovery
| Situation | Response procedure |
| --- | --- |
| Plan prerequisites missing | Keep the plan **Blocked** in STATUS; work only on steps the matrix marks as early-start against merged contracts; tell the producer at stand-up; switch to your other sequence if one is Ready |
| Model invents APIs or files | Reject the change; point the model to the contract/spec section; if the thing is genuinely needed, stop and escalate (it is a contract change) |
| Model changes unrelated code | Revert those hunks (`git restore -p <file>` or `git checkout main -- <file>`); restate the allow-list (plan §4); if repeated, new session |
| Tests fail after implementation | Template D: reproduce, read the failure, find root cause before any edit, minimal fix, rerun the whole suite. Never edit a test to match the code unless the test contradicts the spec — then escalate |
| A shared contract must change | Stop implementation; make the change the first commit of the plan's PR (opened as Draft), describing the change, the spec reference and all consumers; owner + consumers approve that commit; then implement. Spec-level changes go to the team lead |
| Another developer is delayed | Use fixtures/contract stubs per matrix; reorder to your other Ready sequence; Dev A rebalances at stand-up (contingency rules) |
| Two models produced incompatible implementations | Template F with both sides; the contract file (or spec) decides; the side that deviates fixes; if the contract is ambiguous, owner clarifies in a contract commit approved by both sides |
| Model reaches context limit | Template E (partial handoff) → new session with A + B + handoff + carry-over kit |
| Task larger than expected | Keep one PR (D-PLAN-4): add commits in plan-step order and review commit by commit; if it exceeds the plan's size by > 50 %, tell Dev A to re-plan the schedule — never split the plan and never pull scope from a later plan |
| Architecture lacks detail | Check spec → Doc 2 → existing code, in that order; if still unclear, record an assumption in the PR and ask the owner; anything touching money, consent, security or data model is escalated, not assumed |
| Model reports completion without evidence | Not complete. Run the commands yourself; require test names and outputs in the handoff |
| Merge introduces regressions | Revert the PR on `main` the same day; author reproduces on the branch; Template D; re-merge after green |
| Passes tests but fails acceptance criteria | Not complete. Add a test that captures the criterion (failing first), then fix; if the criterion is untestable automatically, record manual evidence |

**Mandatory escalation (to owner, and to the team lead for architecture/spec):** any change to the approved architecture (ADRs), a shared contract or schema, financial correctness (spend definition, rounding, money types), a security boundary (auth, consent, tokens, isolation, LLM data minimisation) or the data model (tables, migrations outside your range). Coding models are instructed (Templates A–D) to stop and report such needs instead of deciding.

---

## 7. Tracking
Lightweight, in-repo, no extra tool: `tracking/README.md` (conventions and completion evidence), `tracking/STATUS.md` (one row per plan, gate log, decision log) and `tracking/state/<WS>.md` (execution-state file per sequence, fed to every new session). Local plan numbers stay per workstream; cross-references always use `WS-<ID>-P<n>`.

---

## 8. Context checklist per stage
| Question | Answer |
| --- | --- |
| All architecture diagrams? | No. Only the Doc 3 flow(s) and Doc 1 ADRs named for the workstream in §1.4. Diagrams are references, not prompt content |
| Which specification sheets? | Only the workstream's own spec plus the SC sections in §1.4; consumers of another component get that component's interface section (§K.2) only |
| Full roadmap? | No. The sequence overview (Template A) and the plan's §2 rows from the matrix |
| Local plan sequence? | Template A lists all plans of the workstream with status; Template B pastes only the current plan in full |
| Cross-workstream contracts? | Merged schema files and Doc 2 §5 signatures the plan consumes/produces — paths for agents, excerpts for chat-only models |
| Files already in the repository? | Agent: must read plan §4 files before proposing changes (Template B step 1). Chat-only: paste current file contents |
| Test commands and acceptance? | Always: plan §9 commands, plan §10 criteria, spec acceptance IDs cited by the plan |
| Prior results? | Previous handoff + state file + `git log` of the workstream; never the previous conversation |
| Preventing out-of-scope edits? | Allow-list from plan §4 in Template B; reviewer rejects others; CODEOWNERS |
| Model without repository access? | Context pack (§1.5); model returns full files/diffs; developer applies, runs tests, pastes output back |
| Implementation vs review vs debug? | Implementation: A + B. Review: C only (plus diff + test output). Debug: D (failing output + relevant files). Integration: F. End of workstream: G |
