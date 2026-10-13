# First-Day Action Plan (D1)

## 0. Before D1 (added 2026-10-13)
D1 cannot start until the **pre-implementation decisions** in [`../team-decisions.md`](../team-decisions.md) §2 are recorded — above all **TD-01** (source baseline). If the source baseline is imported, the import PR must be merged and verified first (see [`../repository-migration-notes.md`](../repository-migration-notes.md) §5).

## 1. What the team does first (first hour, together)
1. Map real names and GitHub handles to **Dev A–Dev D** (`workstream-assignments.md` §2) and confirm the defaults C-1, C-5, D-PLAN-2, U-4. Name who will answer **U-2** (Qwen endpoint) by D3 and **U-1** (demo date).
2. ~~Dev A merges the design and plan docs to `main`~~ — already done: the new repository was initialised with all documentation on `main`. Dev A instead confirms the source-baseline check in WS-FND-P1 step 1.
3. Everyone clones `https://github.com/Kathir-M-03/finmate-ai` (`git clone https://github.com/Kathir-M-03/finmate-ai.git`; see [`../development-workflow.md`](../development-workflow.md) §3), runs `npm ci` (root) and `npm --prefix backend ci`, copies `backend/.env.example` to `backend/.env`, sets `JWT_SECRET`, and confirms `node --version` ≥ 22.5.

## 2. What all four developers read (≈ 1 hour each)
- `README.md`, `baseline.md`, `workstream-assignments.md`, `execution-manual.md` §1–§4, `prompt-templates.md`.
- `docs/prototype-design/01-system-architecture.md` §8 (ADRs) and `system-contracts.md` §4 (conventions), §13.1–13.4 (consent).
- Their own plan files and `tracking/state/<WS>.md`.

## 3. Contracts and decisions agreed on D1–D2
| Contract / decision | Owner | Consumers who approve | Due |
| --- | --- | --- | --- |
| Test harness helpers + `npm --prefix backend test` glob | Dev A (WS-FND-P1) | All | D1 midday |
| Route split + CODEOWNERS | Dev A (WS-FND-P1) | All | D1 end |
| HTTP view schemas `/workspaces/*` | Dev D (WS-SEN-P2 step 1) | Dev B (Nova route) | D1 |
| `ChatRequest@1`, `ChatResponse@1`, `RouterOutput@1` | Dev C (WS-JON-P1 step 1) | Dev D | D1 |
| Action registry (SC names), aliases, `ActionCtx`, `registerExecutor`, `/proposals` HTTP | Dev B (WS-PLT-P1 step 1) | Dev C, Dev D, Dev A (seed) | D2 |
| `CanonicalBatch@1`, `MappingProfile@1` | Dev B (WS-CAT-P2 step 1) | Dev A (seed) | D2 |
| Envelope schemas (Event, Proposal, ActionRequest/Result, SentinelResult, TaskPacket, SpecialistResponse) + fake-LLM fixture format | Dev A (WS-FND-P3) | All | D2–D3 |

## 4. Which coding session each developer starts first, with which prompt
| Developer | First session | Prompt | Notes |
| --- | --- | --- | --- |
| Dev A | WS-FND-P1 implementation | Template A (WS-FND context per manual §1.4) → Template B with `plan-001-baseline-guardrails-route-split.md` | Ship the harness + CI PR **before** the route split so others can write tests by midday |
| Dev B | WS-CAT-P1 test design (after harness PR) | Template A (WS-CAT) → Template B for WS-CAT-P1, stopping after the inspection report and failing-test list on D1 | Do not modify pipeline code until the harness is on `main` |
| Dev C | WS-JON-P1 step 1 (contract PR) | Template A (WS-JON) → Template B for WS-JON-P1 restricted to "step 1: contract PR for ChatRequest/ChatResponse/RouterOutput + routing-rules inventory" | Implementation against a local fake adapter follows on D2 |
| Dev D | WS-SEN-P2 step 1 (schema drafts, morning), then WS-UI-P1 | Template A (WS-SEN) → Template B restricted to WS-SEN-P2 step 1; then a **new** session: Template A (WS-UI) → Template B for WS-UI-P1 | Two separate sessions because they are different sequences |

Each developer may choose any coding model/provider; use a different one (or a fresh session) for Template C reviews.

## 5. Plans/steps that can start immediately
- **WS-FND-P1** (Ready).
- Contract-first steps: **WS-SEN-P2 step 1**, **WS-JON-P1 step 1** (D1); **WS-PLT-P1 step 1**, **WS-CAT-P2 step 1** (D2).
- **WS-UI-P1** layout work (route paths are fixed in `baseline.md` Appendix A).
- **WS-CAT-P1** test design once the harness PR is merged.

## 6. What to implement first to expose integration problems early
1. The **test harness on temporary databases** (WS-FND-P1) — every later test depends on it and it surfaces the `db.js` singleton/`DB_PATH` ordering issue immediately.
2. The **route split + route inventory test** — it fails loudly if anyone's handler move breaks a path.
3. The **contract PRs** (§3) — mismatches between producers and consumers appear as review comments on D1–D2 instead of failed merges on D6.
4. By D3: one **end-to-end skeleton call path** in CI — ingest via existing `/ingest/batch` → categorizer → `outbox_events` row → workspace GET — so the first integration break shows up on D3, not D8.

## 7. Evidence that must exist at the end of D1
- `main` contains `docs/specifications`, `docs/prototype-design`, `docs/implementation-plan`.
- `npm --prefix backend test` runs on temp DBs locally and in CI; `legacy-v1-specs.test.js` passes with ≥ the original assertion count.
- Route split merged (or in review with the inventory test green); CODEOWNERS present.
- Contract PRs open: HTTP view schemas (Dev D), Chat schemas (Dev C).
- `tracking/STATUS.md`: WS-FND-P1 *Complete* or *In review*; decisions logged; G1 row filled.
- Each developer has a `tracking/state/<WS>.md` entry for the session they ran.
