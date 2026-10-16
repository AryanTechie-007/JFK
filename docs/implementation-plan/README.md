# FinMate AI Prototype — Implementation Plan Package

| Attribute | Value |
| --- | --- |
| Status | **Planning only.** No application code is changed by this package. Implementation starts only when the team lead says so. |
| Project repository | `https://github.com/Kathir-M-03/FINNMIN-JFK-John` (private). All branches, PRs and merges happen here — see [`../development-workflow.md`](../development-workflow.md) |
| Code state planned against | The **source baseline**: application code at commit `54f9f6f` of the previous project repository (re-verified against `fc0981d`, lockfile-only change). Per **D-PLAN-3** the new repository starts from this code at `fc0981d`; the one-time import has **not yet been committed** to the new repository ([`../repository-migration-notes.md`](../repository-migration-notes.md) §5). After the import, all work happens only in the new repository |
| Team | **Four developers** (Dev A–Dev D) — see `workstream-assignments.md` §2 |
| Decisions | Taken 2026-10-13 and recorded in `baseline.md` §6 and `tracking/STATUS.md` §4. Build repository: a new repository owned by the team lead (D-PLAN-3) — `https://github.com/Kathir-M-03/FINNMIN-JFK-John`. Every plan = one branch = one PR (D-PLAN-4) |
| Audit | `audit-report.md` — verdict **PASS WITH CORRECTIONS**; corrections applied |
| Authoritative inputs | 1. `docs/prototype-design/` (prototype architecture, diagrams — see assumption A-ARCH; Doc 7 `07-ui-screens-and-interactions.md` added 2026-10-13, awaiting team approval, TD-05) · 2. `docs/specifications/` (frozen component specs + `system-contracts.md`) · 3. repository code, tests, config · 4. established conventions · 5. labelled recommendations |
| Plans | 7 workstreams, 21 plans, each workstream numbered locally from Plan 1 |
| Start condition | **Satisfied 2026-10-16:** the source-baseline import (D-PLAN-3, commit `645355c`) is on `main` and **WS-FND-P1 is Complete**, so no plan is blocked by the import; each plan now waits only on its own listed implementation dependencies (`tracking/STATUS.md`). Remaining open items: [`../team-decisions.md`](../team-decisions.md) |

## How the numbering works
- **Every workstream has its own sequence starting at Plan 1.** "Plan 2" in WS-CAT and "Plan 2" in WS-UI are different plans.
- Every plan also has a **unique cross-reference ID** `WS-<ID>-P<n>` (e.g. `WS-CAT-P2`). Use the ID in dependencies, PRs, branch names and stand-ups; use the local number when talking inside a workstream.
- Plan files live in `workstreams/<workstream-id>/plan-00<n>-<short-title>.md`; each folder has an uninterrupted local sequence.
- Dependencies are technical, never "because the number is lower". Cross-workstream dependencies are listed in `cross-workstream-dependencies.md` and drawn in `roadmap.md`.

## Files in this package
| File | Purpose |
| --- | --- |
| `README.md` | This file: navigation, numbering, how to run a plan with a coding subagent, handoff template |
| `baseline.md` | Verified starting state of the repository, gaps against the specs, conflicts and blockers |
| `workstream-assignments.md` | Workstreams, owners, subagents, owned files, shared-file rules, branching and review workflow |
| `cross-workstream-dependencies.md` | Complete dependency matrix with dependency type, early-start rules and unblocking strategies |
| `roadmap.md` | Milestones, integration gates, execution schedule, Mermaid dependency graph |
| `acceptance-checklist.md` | Plan-, workstream- and integration-level acceptance and the final prototype criteria |
| `audit-report.md` | Independent audit of this package (numbering, dependencies, ownership, commands) and the corrections applied |
| `execution-manual.md` | **Start here to implement:** how to feed plans to coding models, the per-plan loop, sessions, parallel execution, failure recovery |
| `prompt-templates.md` | Copyable coding-model prompts A–G |
| `tracking/` | `STATUS.md` board, per-workstream execution-state files, completion-evidence rules |
| `first-day-action-plan.md` | What the four developers do on D1 |
| `workstreams/WS-FND/` … `workstreams/WS-UI/` | The 21 plans |

| Workstream | Local plans |
| --- | --- |
| WS-FND — Foundations, Tooling & Integration | Plan 1 – Plan 6 |
| WS-CAT — Item Categorizer & Ingestion | Plan 1 – Plan 3 |
| WS-SEN — Sentinel Engine & Workspace Views | Plan 1 – Plan 2 |
| WS-PLT — Action Service, Profile & Budget Monitor | Plan 1 – Plan 2 |
| WS-AGT — Specialist Runner & LLM Specialists (Atlas, Nova, Iris) | Plan 1 – Plan 3 |
| WS-JON — John Orchestrator & Chat | Plan 1 – Plan 2 |
| WS-UI — Frontend Workspaces & Desktop Shell | Plan 1 – Plan 3 |

## How to execute a plan with a coding subagent (model- and provider-neutral)
> Summary only. The full procedure, context-selection rules and prompts are in `execution-manual.md` and `prompt-templates.md`.
0. Confirm the plan's **Repository context** banner conditions are met (source baseline imported per D-PLAN-3; the files the plan modifies exist on `main`).
1. Check the plan's **Dependencies** section: every "implementation" dependency must be merged on `main`; "interface" dependencies only need the named contract.
2. Create the branch `ws-<id>/p<n>-<short-title>` from the latest `main` (e.g. `ws-cat/p2-canonical-ingestion`).
3. Give the subagent, as its full context: this README, `baseline.md`, the plan file, the spec sections the plan cites, and the files listed in its *Files and ownership* table. The plan is written to be executable without any prior conversation.
4. The subagent works **only** inside the files its plan owns. Changes to a file owned by another workstream go through that owner (see `workstream-assignments.md` §4).
5. The subagent runs the plan's test commands and fills in the **Completion handoff** (template below) in the PR description.
6. Open **one PR for the whole plan** (contract files, if any, as the first commit with the PR opened as a Draft for consumer approval); the owner reviews commit by commit; CI (added by `WS-FND-P1`) must be green; merge with a merge commit (not squash). Step-by-step Git and GitHub instructions: [`../development-workflow.md`](../development-workflow.md).

Development-time model choice (the coding model a developer's subagent uses) is free. **FinMate's runtime model choice** is fixed by D-008: Qwen 32B-class via an OpenAI-compatible API for the prototype (exact endpoint pending U-2), Gemini Enterprise for production. Plans never depend on a specific coding tool's features.

## Completion handoff template (paste into the PR description)
```
Plan: WS-<ID>-P<n> — <title>
Files changed: <list>
Functionality implemented: <bullets>
Tests executed: <commands> → <pass/fail counts>
Acceptance criteria: <ID: satisfied / outstanding + reason>
Contract changes: <none | schema/interface + PR to docs>
Known limitations: <bullets>
Decisions required: <ID, owner>
Remaining risks: <bullets>
Next eligible plans: <IDs now unblocked>
Integration instructions: <migrations to run, env vars, seed steps>
```

## Global rules for every plan
- **Genuine functionality only.** No hardcoded financial conclusions, fabricated `tool_result_id`s, or mock data in the product. Synthetic demo data is allowed only through the ingestion pipeline and must be labelled synthetic.
- **Money:** integer paise (`*_minor`), basis points (`*_bp`), half-even rounding, never floating-point arithmetic on money (SC §4.2).
- **Writes:** only through the Action Service (D-001), bank ingestion excepted.
- **LLMs never authorize:** specialist/John output never triggers a write without a user token (SC §13).
- **Do not weaken, delete or rewrite existing tests** to make an implementation pass. If a test contradicts an approved requirement, record the conflict in the PR and get the owner's decision.
- **Contracts first, inside the plan's single PR:** a change to any shared contract (SC, Doc 2, HTTP schemas) is the first commit of the PR, approved by its owner and consumers before the rest is reviewed. Plans are never split into several PRs (D-PLAN-4).
- **Routes:** a PR that adds or removes a route updates `backend/test/routes-inventory.test.js` in the same PR.
- **Tests:** unit/integration files end in `.test.js` (run by `npm --prefix backend test`); live-model files end in `.live.js` (run only by `npm --prefix backend run test:live`).
- **Escalate, never decide silently:** any change to the approved architecture, a shared contract, financial correctness, a security boundary or the data model goes to the owner/team lead (`execution-manual.md` §6).
