# Execution Tracking — Conventions

Lightweight and in-repo: no project-management tool is required. GitHub Issues may be used for assignment and discussion (one issue per plan, see [`../../development-workflow.md`](../../development-workflow.md) §4); `STATUS.md` stays the record of status and evidence (team decision TD-11, still open). Three kinds of file:

| File | Purpose | Updated by | When |
| --- | --- | --- | --- |
| `tracking/STATUS.md` | One row per plan (status, PR, evidence), developer queues, gate log, decision/escalation log | Plan owner; Dev A for gates | Every status change; gates at gate time |
| `tracking/state/<WS>.md` | Execution-state file for one sequence: sequence overview, current plan, interfaces landed, decisions, handoff log | Plan owner | Start and end of every plan/session |
| PR description | Completion handoff (Template E) | Plan owner | Before merge |

## 1. Identifiers
- Local numbering restarts at **Plan 1** in each workstream folder; it is shown as "Plan N" in the *Local* column.
- Every reference across workstreams, in STATUS, PR titles, commit messages and branch names uses the unique ID `WS-<ID>-P<n>` (branch `ws-<id>/p<n>-<slug>`, PR/commit title `WS-<ID>-P<n>: …`).
- Plans are never split (D-PLAN-4). When a plan's contract commit is approved early in its Draft PR, note it in the plan's *Notes* column (e.g. "contract approved: PR #12, commit abc123"); the plan stays *In progress* until the whole PR merges.

## 2. Status definitions
| Status | Meaning | Enter when |
| --- | --- | --- |
| Blocked | An implementation/integration prerequisite is not merged, or a required decision is open | Default |
| Ready | All implementation prerequisites merged; interface contracts merged | Producer's plan reaches Complete (owner of the consumer flips it) |
| In progress | Branch created; implementation session started | Execution loop step 3 |
| In review | PR open; tests green locally; reviewer session/owner review running | Loop step 10 |
| Complete | Evidence in §3 recorded | Loop step 12 |

A plan may move back from *Complete* to *In progress* if a regression is traced to it; record why in Notes.

## 3. Evidence required to mark a plan Complete
1. The plan's single PR merged to `main` with a merge commit (link) and CI green on `main` after the merge (link).
2. Test commands from plan §9 run by the developer, with pass counts (pasted in the handoff).
3. Every plan-level criterion in plan §10 mapped to evidence (test name, command output, screenshot) — or an exception approved by the owner and noted in the decision log.
4. Independent review recorded (Template C verdict or human reviewer approval) — **mandatory (D-PLAN-8)** for plans touching money, consent/tokens, security, a shared contract or the data model: WS-FND-P2, WS-FND-P3, WS-CAT-P1–P3, WS-SEN-P1–P2, WS-PLT-P1–P2, WS-JON-P1–P2, WS-AGT-P1.
5. No new `TODO(<plan ID>)` left unless listed as a known limitation with the plan that removes it.
6. Handoff (Template E) in the PR and summary appended to `tracking/state/<WS>.md`.
7. Contract files or changes (if any) were the first commit of the PR and approved by the consumers listed in `workstream-assignments.md` §6.
8. Routes inventory updated if routes changed.

## 4. Workstream acceptance
A workstream is accepted when all its plans are Complete and Template G returns **WORKSTREAM COMPLETE** against `acceptance-checklist.md` §3. Record the Template G result in the gate log.

## 5. Final end-to-end verification
Before G7: on a clean checkout of `main` — `npm ci`, `npm --prefix backend ci`, `npm --prefix backend test`, `npm run build`, `npx oxlint`, `npm run reset-demo`, `backend/test/e2e/demo-journey.test.js`, security and reliability suites, the Doc 6 §5 manual walkthrough in the Electron app, and `npm --prefix backend run test:live` with Qwen or the stand-in provider (D-PLAN-12). Evidence goes into `docs/implementation-plan/reports/acceptance-run.md` (WS-FND-P6).
