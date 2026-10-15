# Workstream Assignments, Ownership and Collaboration Rules — Four Developers

> Revised for exactly **four developers** (Dev A–Dev D). The seven workstreams and their 21 locally numbered plans are unchanged. Each developer owns whole workstreams, so no plan is split across developers and no local numbering changes.

## 1. Why seven workstreams
The split follows ownership boundaries that already exist in the source baseline (`backend/src/{shared,platform,engines,agents,routes}`, `src/`) and the dependency structure of the remaining work (baseline §4), not one-workstream-per-component:
- **Shared plumbing** (schema, events, tool-result store, LLM adapter, test/CI, legacy removal, demo data, E2E) is one cross-cutting workstream so no component team edits another's infrastructure.
- **Atlas, Nova and Iris share one runner and one LLM contract**, so they are one workstream; splitting them would triplicate the runner work.
- **The Action Service, Profile and Budget Monitor** all mutate or police plan state and share the consent/token logic, so they form one workstream.
- **John** is separate from the specialists because its contract (chat, routing, synthesis, proposals) is consumed by the UI and has its own risk profile.
- Item Categorizer, Sentinel and the frontend are cohesive, independently testable units.

A workstream = one **independent local plan sequence** (Plan 1 … Plan N) executed by one coding-agent subagent sequence. There are 7 sequences.

## 2. Four-developer allocation

### 2.0 Team (D-PLAN-1, names recorded 2026-10-15)
| Role | Name | GitHub handle | Coding-model resources (as stated by the team) |
| --- | --- | --- | --- |
| **Dev A — Integration Lead** (WS-FND) | Abhilash | @Falterred | DeepSeek |
| **Dev B — Data & Write-Path Engineer** (WS-CAT, WS-PLT) | Kathir | @Kathir-M-03 | Claude Pro |
| **Dev C — AI Engineer** (WS-JON, WS-AGT) | Anish | @DEstroy746 | 1 Gemini account |
| **Dev D — Workspaces & Analytics Engineer** (WS-SEN, WS-UI) | Aryan | @AryanTechie-007 | 3 Gemini accounts |

All four are collaborators on the repository. Use these handles in `.github/CODEOWNERS` (WS-FND-P1 step 8). Coding-model choice stays free per developer (§2.2); see `execution-manual.md` §1.5 for how a developer using a chat-only model works, and §1.2 for using a *different* model for independent review (Template C).

### 2.1 Developer assignment matrix
| Developer | Assigned workstreams / subagent sequences | Plans owned (execution order) | Responsibilities | Files or modules owned | Depends on | Integration duties |
| --- | --- | --- | --- | --- | --- | --- |
| **Dev A — Integration Lead** | WS-FND (1 sequence) | WS-FND-P1 → P2 → P3 → P4 → P5 → P6 | Test harness, CI, CODEOWNERS, route split, migrations, events/jobs, tool-result store, traces, LLM adapter, demo dataset + seed, legacy retirement, single-server desktop, E2E/security/acceptance | WS-FND row of §4 (entry point, `db.js`, migrations `0xx`, manifests, `platform/{events,llm}`, `gateway.js`, `snapshot.js`, test helpers, seed, CI, Electron) | Nobody to start; P5 needs WS-UI-P1/P2/P3, WS-JON-P1, WS-CAT-P2, WS-PLT-P1 | Keeps `main` green; runs the daily integration build; reviews every shared-file PR (§5); owns gates G1, G2, G5, G6; independent reviewer (Template C) for other developers during D5–D7; tracks `tracking/STATUS.md` |
| **Dev B — Data & Write-Path Engineer** | WS-CAT, WS-PLT (2 sequences) | WS-CAT-P1 → WS-PLT-P1 → WS-PLT-P2 → WS-CAT-P2 → WS-CAT-P3 | Categorizer conformance, canonical ingestion, correction executors, consent-safe Action Service, plan store, tokens, event-driven Budget Monitor, Profile | WS-CAT and WS-PLT rows of §4 | WS-FND-P1/P2/P3 (P3 as interface first), WS-SEN-P1 (interface), WS-FND-P4 (golden labels) | Owns the single-writer rule and the executor contract; coordinates gate G3; reviews WS-FND-P4 golden labels; co-authors WS-FND-P5 sync removal |
| **Dev C — AI Engineer** | WS-JON, WS-AGT (2 sequences) | WS-JON-P1 → WS-AGT-P1 → WS-JON-P2 → WS-AGT-P2 → WS-AGT-P3 | John router/synthesis/grounding/streaming/consent/proposals; specialist runner; Nova/Atlas/Iris on the LLM adapter; live-model evaluation | WS-JON and WS-AGT rows of §4 | WS-FND-P3 (interface first), WS-PLT-P1, WS-CAT-P3, WS-SEN-P1 (interface); decision U-2 for WS-AGT-P3 | Owns `ChatResponse@1` and specialist contracts; coordinates gate G4; chases U-2; maintains fake-LLM fixture conventions |
| **Dev D — Workspaces & Analytics Engineer** | WS-SEN, WS-UI (2 sequences) | WS-UI-P1 → WS-SEN-P1 → WS-SEN-P2 → WS-UI-P2 → WS-UI-P3 | Sentinel golden tests and rule parity; workspace view routes and HTTP schemas; five-workspace React app; chat UX; desktop verification | WS-SEN and WS-UI rows of §4 | WS-FND-P1, WS-PLT-P1/P2, WS-CAT-P2/P3, WS-JON-P1/P2 | Owns the HTTP view-schema contract; approves `shared/finance/*` changes; produces UI evidence for G5 and P-AC-20 |

A developer stays accountable for everything their coding subagents produce: they run the tests themselves, read the diff, and sign the handoff (see `execution-manual.md` §3).

### 2.2 Subagent model
- **One subagent sequence per workstream.** A coding session for WS-CAT never edits WS-PLT plans, even though Dev B owns both. Each sequence has its own execution-state file `tracking/state/<WS>.md`.
- **One active implementation session per developer at a time**, following the execution order above. A second, separate session may run concurrently only as a **reviewer** (Template C) or **debugger** (Template D). Developer review time, not model speed, is the bottleneck; two implementation sessions in parallel double unreviewed diffs.
- **One plan = one branch = one PR (D-PLAN-4).** No plan is split. When others need a plan's contract early (WS-JON-P1 on D1, WS-PLT-P1 on D2, envelope schemas in WS-FND-P3), the contract files are the plan's **first commit** and the PR is opened as a **Draft** so consumers approve that commit; the PR merges whole later. Other consumers build against the frozen spec sections (e.g. SC §17.7 for the bank-batch format, Doc 2 §6 for HTTP).
- Models and providers are free per developer. Nothing in the plans depends on a specific coding tool.

### 2.3 Workload and contingency
| Developer | Planned effort (from plan §1 sizes) | Window in the D1–D9 schedule | Slack |
| --- | --- | --- | --- |
| Dev A | ≈ 6 days (P1 1, P2 0.5, P3 1.5, P4 1, P5 1, P6 1) | D1–D4, D7–D9 | D5–D7 used for integration, reviews, WS-FND-P6 scaffolding |
| Dev B | ≈ 5.5 days | D1–D6 | D7–D9 bug fixes, WS-FND-P5 co-authoring |
| Dev C | ≈ 6 days (AGT-P3 0.5–1 day, after the Qwen details arrive on D3) | D1–D9 | ≈ 0.5 day |
| Dev D | ≈ 6.5 days | D1–D8 morning | ≈ 0.5 day — **binding constraint** |

Contingency rules (decided at the daily stand-up, recorded in `tracking/STATUS.md`):
1. If WS-UI-P1 is not merged by end of D2, **transfer the whole WS-SEN sequence to Dev A** before WS-SEN-P1 starts (Dev A has D5–D7 slack; WS-SEN is not on Dev A's own critical path). A sequence moves as a unit; numbering does not change.
2. **Tier checkpoint at the end of D5** (D-PLAN-9): if gate G3 closed more than 1 day late, cut the Tier 3 items in `roadmap.md` §5 immediately. If WS-AGT-P2 still slips past D8, John keeps using the deterministic Atlas/Iris fallbacks.
3. A developer who finishes early takes **review** work first, then bug-fix tickets; they do not start another developer's plan.
4. A producer more than **half a day** late on a dependency publishes a contract-matching stub (D-PLAN-7, `cross-workstream-dependencies.md` §4).

### 2.4 Why this split
- **Dev B internalises the riskiest shared file.** `platform/action-service.js` is edited by WS-PLT-P1 and WS-CAT-P3; the profile interface consumed by WS-CAT-P2 is defined by WS-PLT-P2. One owner removes the merge race.
- **Dev C owns both sides of the specialist contract** (`invoke()` → `SpecialistResponse@1`), the grounding binder used by the runner and John, and one fake-LLM fixture convention.
- **Dev D owns both sides of the workspace read contract** (Sentinel view routes + HTTP schemas ↔ React workspaces).
- **Dev A** carries the critical first three days (harness, schema, plumbing) and the final integration, with deliberate slack in the middle to review and integrate continuously.

## 3. Workstream inventory
| ID | Workstream | Developer | Subagent sequences | Local plans | Objective |
| --- | --- | --- | --- | --- | --- |
| WS-FND | Foundations, Tooling & Integration | Dev A | 1 | 6 | Test/CI baseline, route split, migrations, events, tool-result store, LLM adapter, demo data, legacy retirement, E2E and acceptance |
| WS-CAT | Item Categorizer & Ingestion | Dev B | 1 | 3 | Prove and fix the categorizer against its spec; canonical ingestion; corrections only via the Action Service |
| WS-SEN | Sentinel Engine & Workspace Views | Dev D | 1 | 2 | Golden-test all 17 functions; one rule library; workspace view contracts |
| WS-PLT | Action Service, Profile & Budget Monitor | Dev B | 1 | 2 | Consent-safe execution; event-driven monitor; profile/balance conformance |
| WS-AGT | Specialist Runner & LLM Specialists | Dev C | 1 | 3 | Runner (ADR-07) and real LLM specialists with deterministic fallback |
| WS-JON | John Orchestrator & Chat | Dev C | 1 | 2 | LLM router fallback, synthesis + grounding gate, streaming, consent; proposal/correction flows |
| WS-UI | Frontend Workspaces & Desktop Shell | Dev D | 1 | 3 | Five workspaces, no mocks, chat UX, desktop verification |

## 4. Owned files (existing = [E], to create = [C], to delete = [D])
| Workstream | Owns |
| --- | --- |
| WS-FND | `backend/src/index.js` [E], `backend/src/db.js` [E], `backend/src/db/migrations/0xx_*` + `backend/src/db/migrate.js` + `backend/src/db/TABLES.md` [C], `backend/package.json` + `backend/package-lock.json` [E], root `package.json` + `package-lock.json` [E], `backend/src/shared/ids.js` [E], `backend/src/shared/money.js` [E], `backend/src/shared/time.js` [C], `backend/src/shared/contracts/validator.js` [E], `backend/src/shared/contracts/schemas/index.js` and the SC envelope schemas listed in WS-FND-P3 [C], `backend/src/platform/snapshot.js` [E], `backend/src/platform/gateway.js` [E], `backend/src/platform/events/**` [C], `backend/src/platform/llm/**` [C], `backend/src/shared/trace.js` [C], `backend/src/routes/v1/index.js` (wiring only) [E], `backend/src/routes/v1/{system,_shared}.js` [C], `backend/src/routes/{auth,users}.js` [E → moved in WS-FND-P5], `backend/test/helpers/**` [C], `backend/test/{db,platform,seed,routes,security,reliability,e2e}/**` [C], `backend/test/routes-inventory.test.js`, `backend/test/legacy-v1-specs.test.js` [C], `backend/test-v1-specs.js` [E → D in P5], `backend/src/seed/**`, `backend/src/seed.js` [E/C], `backend/scripts/{llm-smoke,backup-dev-db}.js` [C], `.github/workflows/*`, `.github/CODEOWNERS` [C], `.gitignore` [E], `electron/**` [E], `launch.bat` [E], `tests/verifyApp.js` [E], `docs/implementation-plan/**` except files listed for others below; legacy server code under `src/` and `backend/src/routes/{goals,transactions,budget,insights,coach,subscriptions}.js` [D] |
| WS-CAT | `backend/src/engines/categorizer/**` [E], `backend/src/shared/finance/movement.js` and `coverage.js` [E] (WS-SEN approves), `backend/src/platform/ingestion/**` [C], `backend/src/routes/v1/{categorizer,ingest}.js` [C by WS-FND-P1 split, then CAT], schemas `CanonicalBatch@1.json`, `MappingProfile@1.json` and `schemas/actions/<categorizer actions>.json` [C], `backend/scripts/golden-eval.js` [C], `backend/test/{categorizer,ingestion}/**`, `backend/test/fixtures/{categorizer,ingestion}/**` [C], migrations `1xx_*` |
| WS-SEN | `backend/src/engines/sentinel/**` [E], `backend/src/routes/v1/workspaces-{atlas,nova,iris,sentinel}.js` [C → SEN], `backend/src/shared/contracts/schemas/http/workspaces-*.json` [C], `backend/test/sentinel/**`, `backend/test/fixtures/sentinel/**`, `backend/test/contracts/http-workspaces.test.js` [C], migrations `2xx_*` |
| WS-PLT | `backend/src/platform/{action-service,profile,budget-monitor}.js` [E], `backend/src/platform/{plan-store,tokens}.js` [C], `backend/src/shared/contracts/{action-registry,constraint-messages}.js` [E], `backend/src/shared/contracts/action-aliases.js` [C, temporary; deleted in WS-FND-P5 with PLT approval], schemas `schemas/actions/<plan, profile, alert actions>.json` [C], `backend/src/routes/v1/{actions,settings,alerts}.js` [C → PLT], `backend/test/{actions,monitor,profile}/**` [C], migrations `3xx_*` |
| WS-AGT | `backend/src/agents/{atlas,nova,iris}/**` [E], `backend/src/agents/shared/**` [C], schemas `SpecialistDraft.json`, `{Atlas,Nova,Iris}Domain@1.json`, `PeerHint@1.json` [C], `backend/test/agents/**`, `backend/test/fixtures/llm/specialists/**` [C], `backend/test/live/**` (shared with WS-JON for chat cases), `backend/scripts/live-eval-report.js` [C], migrations `4xx_*` (none expected) |
| WS-JON | `backend/src/agents/john/**` [E], `backend/src/shared/contracts/grounding.js` [E], schemas `ChatRequest@1.json`, `ChatResponse@1.json`, `RouterOutput@1.json` [C], `backend/src/routes/v1/chat.js` [C → JON], `backend/test/john/**`, `backend/test/integration/chat-*.test.js`, `backend/test/fixtures/llm/john/**` [C], migrations `5xx_*` |
| WS-UI | `src/**` React code (`App.jsx`, `components/**`, `services/**`, views under `src/agents/**/*.jsx`, `src/tools/**/*.jsx`) [E], `src/workspaces/**`, `src/lib/**`, `src/services/api/**` [C], `index.html`, `vite.config.js` [E], `.oxlintrc.json` [C, WS-FND reviews]; deletes `src/data/mock*.js`, `src/services/{geminiService,goalService,profileService,subscriptionService,transactionService,conversationService,workspaceService}.js` [D] |

`src/agents/*/*.js` and `src/tools/*/*.js` (non-JSX) and `src/{index.js,db,routes,contracts}` are legacy Backend B: **WS-FND deletes them in `WS-FND-P5`** after `WS-UI-P1` has moved every view out of those folders.

**Shared-folder rule.** In folders used by several workstreams (`backend/src/shared/contracts/schemas/**`, `backend/test/contracts/**`, `backend/test/integration/**`, `backend/test/live/**`, `backend/scripts/**`, `docs/implementation-plan/reports/**`), **the workstream that creates a file owns that file**; folder-level loaders and configuration (`schemas/index.js`, CI) belong to WS-FND.

## 5. Shared-file rules
| Shared file or area | Rule |
| --- | --- |
| `backend/src/routes/v1/index.js` | After `WS-FND-P1` it contains only `router.use(require('./<domain>'))` lines. Adding a router = one-line PR reviewed by WS-FND. No handler code here |
| `backend/test/routes-inventory.test.js` | Every PR that adds, removes or renames a route updates the expected list **in the same PR**; WS-FND reviews |
| `backend/src/db.js`, migrations | After `WS-FND-P2` `db.js` only opens the DB and runs migrations. Schema changes = new migration in the owner's range (`0xx` FND, `1xx` CAT, `2xx` SEN, `3xx` PLT, `4xx` AGT, `5xx` JON). Never edit a merged migration. Reserved numbers: `000`, `010`–`012`, `090` FND; `100` (constraints) and `110` (ingestion fallback) CAT; `300` (intent-token fallback) and `310` PLT; `500` JON. Fallback migrations use `CREATE TABLE IF NOT EXISTS` |
| `backend/package.json`, root `package.json`, both lockfiles | WS-FND only. New dependencies need a PR approved by WS-FND and must be in SC §3 (Ajv, decimal.js) or justified in the PR. Test scripts: `npm --prefix backend test` runs `test/**/*.test.js`; live tests are `test/live/**/*.live.js` |
| `backend/src/shared/contracts/**` | Contract files: owner per §4; any change ships as its own PR referencing the spec section it implements; dependants review |
| `backend/src/shared/finance/*.js` | WS-CAT owns (Dev B), WS-SEN must approve (Dev D) (single spend definition, SC §6) |
| `backend/src/platform/action-service.js` | WS-PLT owns. WS-CAT-P3 removes categorization case bodies **after** WS-PLT-P1 merges (both Dev B) |
| `backend/src/platform/profile.js`, `engines/categorizer/index.js` (legacy sync removal) | WS-FND-P5 edits only with the owner's approval (Dev B) |
| `backend/src/routes/v1/workspaces-nova.js` | WS-SEN owns; WS-PLT-P1/P2 edits (rebalance proposal, remove GET-time scan) need Dev D approval |
| `backend/.env.example` | WS-FND; others request keys via PR comment |
| `backend/src/seed/**`, `backend/test/helpers/**` | WS-FND; others add fixtures under `backend/test/fixtures/<area>/` which they own |
| `src/App.jsx`, `src/components/Sidebar.jsx` | WS-UI only |
| `electron/main.js`, `launch.bat` | WS-FND only |

`.github/CODEOWNERS` (created in `WS-FND-P1`) encodes §4–§5 so reviews are requested automatically. Map workstreams to the developers' GitHub handles there.

## 6. Shared-ownership risk register
| Shared file / interface | Developers who need it | Primary owner | Protocol |
| --- | --- | --- | --- |
| Envelope schemas (`Event@1`, `Proposal@1`, `ActionRequest/Result@1`, `SentinelResult@1`, `TaskPacket@1`, `SpecialistResponse@1`) | All | Dev A (WS-FND-P3) | Copied from SC verbatim; schema commit approved in WS-FND-P3's Draft PR before consumers rely on it; consumers approve |
| Action registry + canonical names + aliases | B, C, D | Dev B (WS-PLT-P1) | Contract commit first in WS-PLT-P1's Draft PR on D2; Dev C and Dev D approve; UI and John switch to SC names; aliases removed in WS-FND-P5 |
| `ActionCtx` / `registerExecutor` | B (both sequences) | Dev B | Defined in WS-PLT-P1 §5; WS-CAT-P3 implements |
| `ChatRequest@1` / `ChatResponse@1` (SSE blocks) | C, D | Dev C (WS-JON-P1) | Contract commit first in WS-JON-P1's Draft PR on D1; Dev D approves |
| HTTP view schemas `/workspaces/*` | B (Nova route edits), D | Dev D (WS-SEN-P2) | WS-UI-P1 is built against current responses + Doc 2 §6; WS-SEN-P2 (D4–D5) publishes the schemas (Dev B approves the Nova one); WS-UI-P2 adopts them |
| `CanonicalBatch@1` / `MappingProfile@1` | A (seed), B | Dev B (WS-CAT-P2) | WS-FND-P4 (D4) builds the seed files against SC §17.7; WS-CAT-P2 (D5) adds the schemas and validates those files, reporting mismatches to Dev A |
| Profile `upsertAccounts`/`recordBalances` | B | Dev B | Signatures fixed in WS-PLT-P2 §5 |
| `llm.complete`, fake fixture format | A, C | Dev A (WS-FND-P3) | Format documented in `backend/test/fixtures/llm/README.md`; Dev C approves |
| `grounding.js` | C (runner + John) | Dev C | Same developer; no cross-dev edits |
| Migrations | All | per range | §5 numbering; never edit merged files |
| Test harness + route inventory | All | Dev A | Helpers frozen after WS-FND-P1 except additive changes reviewed by Dev A |
| `.oxlintrc.json`, CI workflow | A, D | Dev A (CI), Dev D (lint rules for `src/`) | Lint rule changes reviewed by Dev A |

## 7. Branching, review and integration workflow (decided 2026-10-13)
**Repository (D-PLAN-3):** the team builds in a new repository owned by the team lead — `https://github.com/Kathir-M-03/FINNMIN-JFK-John` —  starting from `AryanTechie-007/JFK` `main` @ `fc0981d`. The old repository's long-lived module branches (`atlas`, `iris`, `john`, `nova`, `sentinel`, `tally`, `sentinel_web`) are not carried over. **Check branch protection:** on a free GitHub account it has generally required a public repository or a paid plan for private ones (Settings → Branches). If it is not available, rules 1–3 are enforced by team agreement and Dev A's review.

The beginner-friendly, step-by-step version of these rules, with commands, is [`../development-workflow.md`](../development-workflow.md).

1. `main` is protected: PR + owner review + green CI; no direct pushes.
2. **One plan = one branch = one PR (D-PLAN-4).** Branch `ws-<id>/p<n>-<slug>` (e.g. `ws-cat/p2-canonical-ingestion`); rebase on `main` at least daily; commits in plan-step order, titled `WS-<ID>-P<n>: <what>`. Large PRs are reviewed **commit by commit**, with `git diff --color-moved=dimmed-zebra main...HEAD` so moved code is greyed out. Merge with a **merge commit (not squash)** so a single bad commit can be reverted alone.
3. **Contracts first, inside the plan's PR:** contract files are the first commit; open the PR as a Draft and get every consumer listed in §6 to approve that commit before the rest is reviewed.
4. CI (from `WS-FND-P1`): `npm ci` (root with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`, backend), `npm --prefix backend test`, `npm run build`, `npx oxlint`. Live-LLM tests excluded; a manual workflow runs them with the API key stored as a GitHub Actions secret (D-PLAN-11).
5. **Merge windows twice a day** (midday and end of day). Dev A runs the integration build after the evening window: `npm run reset-demo` (once WS-FND-P4 exists) + full test suite + skeleton smoke (`/api/v1/health`, login, workspace GETs) — later the E2E journey.
6. Incompatible change detected → the merge that broke `main` is reverted the same day (or only the offending commit); the two owners agree the contract fix (Template F) before re-merging.
7. A late workstream does not block unrelated work: dependants proceed against the agreed interfaces in `cross-workstream-dependencies.md`; only "implementation" dependencies wait. A producer more than half a day late publishes a contract-matching stub (D-PLAN-7).
