# First-Day Action Plan (D1)

Decisions are already taken (`baseline.md` §6, 2026-10-13). Every plan is **one branch = one PR** (D-PLAN-4); no plan is split.

## 0. Before D1 (added 2026-10-15)
The repository is `https://github.com/Kathir-M-03/FINNMIN-JFK-John` (D-PLAN-3). It holds the documentation only; the team lead commits the **source-baseline import** (`fc0981d`) before D1, following [`../repository-migration-notes.md`](../repository-migration-notes.md) §5.3. Git/GitHub procedure for all four developers: [`../development-workflow.md`](../development-workflow.md).

## 1. What the team does first (first hour, together)
1. ~~Map real names and GitHub handles~~ — done 2026-10-15 (`workstream-assignments.md` §2.0: Abhilash, Kathir, Anish, Aryan). Confirm who will share the Qwen key on D3 (D-PLAN-11).
2. In the new repository (D-PLAN-3): check that `docs/specifications`, `docs/prototype-design` and `docs/implementation-plan` are present. If not, they become the first commit of WS-FND-P1. Check whether branch protection is available (Settings → Branches); if not, agree to enforce "PR + green CI before merge" by convention.
3. Everyone clones the repository (`git clone https://github.com/Kathir-M-03/FINNMIN-JFK-John.git`), runs `npm ci` (root) and `npm --prefix backend ci`, copies `backend/.env.example` to `backend/.env`, sets `JWT_SECRET`, and confirms `node --version` ≥ 22.5.

## 2. What all four developers read (≈ 1 hour each)
- `README.md`, `baseline.md` (esp. §6 decisions), `workstream-assignments.md`, `execution-manual.md` §1–§4, `prompt-templates.md`.
- `docs/prototype-design/01-system-architecture.md` §8 (ADRs) and `system-contracts.md` §4 (conventions), §13.1–13.4 (consent).
- Their own plan files and `tracking/state/<WS>.md`.

## 3. Contracts agreed on D1–D3 (inside each producer's single PR)
| Contract | Producer (plan) | How it is agreed | Consumers who approve | Due |
| --- | --- | --- | --- | --- |
| Test harness helpers + `npm --prefix backend test` glob | Dev A (WS-FND-P1) | Harness commit first; whole PR merges in the evening window | All | D1 |
| Route split + CODEOWNERS | Dev A (WS-FND-P1) | Same PR, later commits | All | D1 end |
| `ChatRequest@1`, `ChatResponse@1`, `RouterOutput@1` | Dev C (WS-JON-P1) | Contract commit first; PR opened as Draft | Dev D | D1 |
| Action registry (SC names), aliases, `ActionCtx`, `registerExecutor`, `/proposals` HTTP | Dev B (WS-PLT-P1) | Contract commit first; PR opened as Draft | Dev C, Dev D, Dev A (seed) | D2 |
| Envelope schemas (Event, Proposal, ActionRequest/Result, SentinelResult, TaskPacket, SpecialistResponse) + fake-LLM fixture format | Dev A (WS-FND-P3) | Schema commit first; PR opened as Draft | All | D2–D3 |
| HTTP view schemas `/workspaces/*` | Dev D (WS-SEN-P2, D4–D5) | Not needed early: WS-UI-P1 (same developer) builds against current responses + Doc 2 §6 | Dev B (Nova schema) | D4–D5 |
| `CanonicalBatch@1`, `MappingProfile@1` | Dev B (WS-CAT-P2, D5) | Not needed early: WS-FND-P4 builds against SC §17.7 (frozen) | Dev A | D5 |

## 4. Which coding session each developer starts first, with which prompt
| Developer | First session | Prompt | Notes |
| --- | --- | --- | --- |
| Dev A | WS-FND-P1 (whole plan) | Template A (WS-FND context per manual §1.4) → Template B with `plan-001-baseline-guardrails-route-split.md` | One PR, six commits in plan order (harness commit early so others can work against the branch); merge commit in the 17:30 window; time-box the route split (green by 16:00, else merge D2 morning) |
| Dev B | WS-CAT-P1 test design (pm) | Template A (WS-CAT) → Template B for WS-CAT-P1, stopping after the inspection report and failing-test list on D1 | Write tests against Dev A's branch (or run single files with `node --test <file>`); rebase on `main` once WS-FND-P1 merges |
| Dev C | WS-JON-P1 (whole plan, contract commit first) | Template A (WS-JON) → Template B for WS-JON-P1 | Push the Chat-schema contract commit and open the PR as a Draft for Dev D's review the same day; implementation continues against a local fake adapter |
| Dev D | WS-UI-P1 (whole plan) | Template A (WS-UI) → Template B for WS-UI-P1 | Build against the current workspace responses and Doc 2 §6; review Dev C's Chat-schema commit |

Each developer may choose any coding model/provider; use a different one (or a fresh session) for Template C reviews.

## 5. Plans that can start immediately
- **WS-FND-P1** (Ready).
- **WS-JON-P1** and **WS-UI-P1** against the frozen specs (interface dependencies only; their implementation dependencies are not needed on D1).
- **WS-CAT-P1** test design against Dev A's branch from the afternoon.

## 6. What to implement first to expose integration problems early
1. The **test harness on temporary databases** (first commits of WS-FND-P1) — every later test depends on it and it surfaces the `db.js` singleton/`DB_PATH` ordering issue immediately.
2. The **route split + route inventory test** — it fails loudly if a moved handler breaks a path.
3. The **contract commits in Draft PRs** (§3) — producer/consumer mismatches appear as review comments on D1–D3 instead of failed merges on D6.
4. By D3: one **end-to-end skeleton call path** in CI — ingest via existing `/ingest/batch` → categorizer → `outbox_events` row → workspace GET — so the first integration break shows up on D3, not D8.

## 7. Evidence that must exist at the end of D1
- The repository contains `docs/specifications`, `docs/prototype-design`, `docs/implementation-plan`.
- WS-FND-P1 merged (or, if the route split overran the time-box, in review with the harness green): `npm --prefix backend test` runs on temp DBs locally and in CI; `legacy-v1-specs.test.js` passes with ≥ the original assertion count; inventory test lists 25 routes; CODEOWNERS present.
- WS-JON-P1 Draft PR open with the Chat-schema contract commit under Dev D's review.
- `tracking/STATUS.md`: WS-FND-P1 *Complete* or *In review*; developer names recorded; G1 row filled.
- Each developer has a `tracking/state/<WS>.md` entry for the session they ran.
