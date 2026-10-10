# 🛡️ Nova — Real-Time Budget Guardian & Expense Analytics Engine (V4 Specification)

> **"Financial discipline through deterministic enforcement, not probabilistic guesswork."**

**Nova** is the **Real-Time Budget Guardian** within the **FinMate AI** financial ecosystem, engineered in full compliance with **Nova: Agent Specification (V4)**.

In V4, **Nova is a read-only analytical specialist agent** that explains month-to-date spending, tracks budget-cap utilization, projects end-of-month pace, and recommends concrete adjustments. Every numerical fact originates from **Sentinel** (deterministic financial calculator), every transaction category originates from **Tally** (categorization service), every proactive alert is generated deterministically by the **Threshold Job**, and every state mutation flows through the **Action Service** after explicit user confirmation.

---

## 📑 Table of Contents
1. [V4 System Architecture & Core Principles](#-1-v4-system-architecture--core-principles)
2. [Modular Repository Structure (Agents & Tools)](#-2-modular-repository-structure-agents--tools)
3. [Contracts: `TaskPacket@1` & `SpecialistResponse@1`](#-3-contracts-taskpacket1--specialistresponse1)
4. [Deterministic Tools (`src/tools/`)](#-4-deterministic-tools-srctools)
   - [4.1 Tally (`src/tools/tally/`) — Categorization & Taxonomy](#41-tally-srctoolstally--categorization--taxonomy)
   - [4.2 Sentinel (`src/tools/sentinel/`) — Read-Only Calculator & Tool Gateway](#42-sentinel-srctoolssentinel--read-only-calculator--tool-gateway)
   - [4.3 Threshold Job (`src/tools/threshold-job/`) — Deterministic Alerting & Hygiene](#43-threshold-job-srctoolsthreshold-job--deterministic-alerting--hygiene)
   - [4.4 Action Service (`src/tools/action-service/`) — T1/T2/T3 Mutation Governance](#44-action-service-srctoolsaction-service--t1t2t3-mutation-governance)
5. [Specialist & Orchestrator Agents (`src/agents/`)](#-5-specialist--orchestrator-agents-srcagents)
   - [5.1 Nova (`src/agents/nova/`) — Real-Time Budget Guardian](#51-nova-srcagentsnova--real-time-budget-guardian)
   - [5.2 John (`src/agents/john/`) — Master Orchestrator & Coach](#52-john-srcagentsjohn--master-orchestrator--coach)
   - [5.3 Iris (`src/agents/iris/`) — Subscription & Recurring Bill Specialist](#53-iris-srcagentsiris--subscription--recurring-bill-specialist)
   - [5.4 Atlas (`src/agents/atlas/`) — Long-Term Goal & Savings Strategist](#54-atlas-srcagentsatlas--long-term-goal--savings-strategist)
6. [API Specification](#-6-api-specification)
7. [Running Tests, CLI Demo & Server](#-7-running-tests-cli-demo--server)

---

## 🌟 1. V4 System Architecture & Core Principles

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         USER / FRONTEND APPLICATION                          │
└───────────────┬──────────────────────────────────────────────▲───────────────┘
                │                                              │
                ▼                                              │
┌───────────────────────────────────────┐      ┌───────────────┴───────────────┐
│   JOHN ORCHESTRATOR (src/agents/john) │      │ ACTION SERVICE (action-service│
│  • Routes intents via RoutingTable    │      │  • Sole state mutator         │
│  • Dispatches TaskPacket@1 (no PII)   │      │  • T1 / T2 / T3 Confirmation  │
│  • Resolves cross-agent peer hints    │      │  • Re-validates via Sentinel  │
└───────┬───────────────┬───────────────┘      └───────────────▲───────────────┘
        │               │                                      │
        ▼               ▼                                      │
┌───────────────┐ ┌─────────────┐ ┌─────────────┐              │
│  NOVA AGENT   │ │ IRIS AGENT  │ │ ATLAS AGENT │              │
│ (Read-Only)   │ │ (Recurring) │ │  (Goals)    │              │
└───────┬───────┘ └─────────────┘ └─────────────┘              │
        │                                                      │
        ▼ (Allowlisted Read-Only ToolGateway)                  │
┌──────────────────────────────────────────────────────────────┴───────────────┐
│                    SENTINEL ENGINE (src/tools/sentinel)                      │
│  • Immutable snapshot_id & categorization_version pinning                    │
│  • 6 Deterministic Tools (Utilization, Velocity, Anomalies, Rebalance, Caps) │
└───────────────────────────────────────▲──────────────────────────────────────┘
                                        │
┌───────────────────────────────────────┴──────────────────────────────────────┐
│   TALLY SERVICE (src/tools/tally)  ───►  THRESHOLD JOB (threshold-job)       │
│  • SETTLED / NEEDS_REVIEW / UNCATEGORIZED • Fires on categorization.updated  │
│  • Taxonomy hierarchy & migration map     • Stores alerts BEFORE any LLM call│
└──────────────────────────────────────────────────────────────────────────────┘
```

### Key V4 Architectural Guarantees
1. **Strict Separation of Arithmetic and Narrative**: Nova never computes or guesses numbers. Nova emits placeholder tokens (e.g., `{{cat_dining_spent}}`) that `PlaceholderBinder` resolves directly against Sentinel `tool_result_id` outputs. Any unbound number or unprefixed citation (`tx_*` instead of `sentinel:*:tx_*`) is rejected before leaving Nova.
2. **Read-Only Tool Gateway**: Nova can only invoke the 6 allowlisted `sentinel_*` read-only functions via `ToolGateway`. Any write attempt throws `GATEWAY_WRITE_ATTEMPT_BLOCKED`.
3. **Zero PII Leakage (`TaskPacket@1`)**: Orchestrator requests strip `user_id` and raw ledger rows; specialists operate exclusively on pinned `snapshot_id` and `categorization_version`.
4. **Tier Thresholds (Section 10.1)**:
   - 🟢 **`healthy`**: Utilization `< 80%` (`spend < 0.80 × cap`)
   - 🟡 **`warning`**: Utilization `80% – 100%` (`0.80 × cap ≤ spend ≤ 1.00 × cap`, inclusive of `80%` and `100%`)
   - 🔴 **`exceeded`**: Utilization `> 100%` (`spend > 1.00 × cap`)
5. **LLM-Independent Alerting**: `ThresholdJob` consumes `categorization.updated` events from `Tally` and persists threshold alerts deterministically **even when the LLM or Nova is completely offline**.

---

## 📂 2. Modular Repository Structure (Agents & Tools)

Every agent and every tool lives in its own isolated directory under `src/agents/` and `src/tools/`:

```
nova-agent/
├── README.md                                         # V4 Architecture & API Documentation
├── Nova_V4_Specification_Compliance_Summary.pdf      # V4 Audit & Implementation Compliance Report
├── package.json                                      # Package Manifest & Scripts
├── demo.js                                           # End-to-End V4 Interactive CLI Demo
├── tests/
│   └── novaEngine.test.js                            # 14 Test Suites + All 12 V4 Acceptance Criteria
└── src/
    ├── index.js                                      # Express Server Entrypoint
    ├── contracts/                                    # Shared V4 Schemas & Platform Rules
    │   ├── PlatformRules.js                          # Tier rules, cap rules, T1/T2/T3 governance
    │   ├── TaskPacketV1.js                           # TaskPacket@1 validator & factory
    │   └── SpecialistResponseV1.js                   # SpecialistResponse@1 validator & builder
    ├── agents/                                       # Isolated Agent Modules
    │   ├── nova/                                     # 🛡️ Nova — Real-Time Budget Guardian
    │   │   ├── NovaAgent.js                          # V4 Specialist entrypoint (handleTaskPacket)
    │   │   ├── NovaLifecycleRunner.js                # Section 8 conditional 7-step lifecycle
    │   │   ├── PlaceholderBinder.js                  # Numeric binding & citation auditor
    │   │   ├── UntrustedTextSanitizer.js             # Prompt-injection & control-char sanitizer
    │   │   ├── NovaGuardianEngine.js                 # Dashboard adapter over Sentinel/Tally
    │   │   ├── NovaAgentBrain.js                     # OODA cognitive trace & briefing adapter
    │   │   ├── NovaGuardianView.jsx                  # Standalone React UI Component
    │   │   ├── NovaGuardianView.css                  # Responsive UI styling
    │   │   ├── novaService.js                        # Frontend REST API client
    │   │   └── index.js                              # Public module exports
    │   ├── john/                                     # 🎯 John — Master Orchestrator & Coach
    │   │   ├── JohnOrchestrator.js                   # Intent router, peer hint resolver, synth
    │   │   ├── RoutingTable.js                       # Deterministic Section 3.2 routing rules
    │   │   └── JohnCoachDashboard.jsx                # Master Coach React UI Component
    │   ├── iris/                                     # 🔄 Iris — Subscription & Recurring Specialist
    │   │   ├── IrisAgent.js                          # Recurring bill & subscription audit agent
    │   │   └── IrisAdvisorView.jsx                   # Iris Advisor React UI Component
    │   └── atlas/                                    # 🗺️ Atlas — Long-Term Goal & Savings Strategist
    │       ├── AtlasAgent.js                         # Goal trajectory & trade-off simulation agent
    │       └── AtlasStrategistView.jsx               # Atlas Strategist React UI Component
    ├── tools/                                        # Isolated Deterministic Tool Modules
    │   ├── sentinel/                                 # 📐 Sentinel — Deterministic Financial Calculator
    │   │   ├── SnapshotManager.js                    # Immutable snapshot_id & staleness pinning
    │   │   ├── ToolGateway.js                        # Enforces Nova's 6-tool read-only allowlist
    │   │   ├── getLedgerSummary.js                   # sentinel_get_ledger_summary
    │   │   ├── runCategoryUtilization.js             # sentinel_run_category_utilization
    │   │   ├── runVelocityProjection.js              # sentinel_run_velocity_projection
    │   │   ├── detectAnomalies.js                    # sentinel_detect_anomalies
    │   │   ├── runRebalanceSimulation.js             # sentinel_run_rebalance_simulation
    │   │   ├── validateCapChange.js                  # sentinel_validate_cap_change (5 cap rules)
    │   │   ├── SentinelPredictorView.jsx             # Sentinel React UI Component
    │   │   └── index.js                              # Tool registry & gateway factory
    │   ├── tally/                                    # 🏷️ Tally — Transaction Categorization Service
    │   │   ├── TaxonomyRegistry.js                   # Canonical IDs, hierarchy, migration map
    │   │   ├── TallyCategorizer.js                   # SETTLED / NEEDS_REVIEW / UNCATEGORIZED
    │   │   ├── TallyService.js                       # Ingestion, correction, categorization.updated
    │   │   └── SpendingAnalyserView.jsx              # Tally Spending Analyser React UI Component
    │   ├── threshold-job/                            # 🚨 Threshold Job — Deterministic Alerting
    │   │   ├── ThresholdJob.js                       # Event consumer & deterministic tier evaluator
    │   │   └── AlertHygieneStore.js                  # Deduplication, suppression & lifecycle store
    │   └── action-service/                           # 🔐 Action Service — Mutation Governance
    │       ├── ActionService.js                      # Sole state mutator (Caps, Rebalance, T1-T3)
    │       └── ConfirmationTokenManager.js           # Scoped single-use confirmation tokens
    ├── db/
    │   ├── schema.sql                                # V4 SQLite DDL (snapshots, alerts, tokens, etc.)
    │   ├── db.js                                     # Dual SQLite / In-Memory V4 database adapter
    │   └── seed.js                                   # V4 demo dataset seeder
    ├── routes/
    │   ├── budgetRoutes.js                           # /api/budget endpoints
    │   ├── transactionRoutes.js                      # /api/transactions endpoints
    │   ├── actionRoutes.js                           # /api/actions (T1/T2/T3 confirmation & apply)
    │   └── telemetryRoutes.js                        # /api/nova/telemetry & /api/nova/task-packet
    └── data/
        └── mockNovaData.js                           # Offline mock dataset for frontend development
```

---

## 📜 3. Contracts: `TaskPacket@1` & `SpecialistResponse@1`

### `TaskPacket@1` (`src/contracts/TaskPacketV1.js`)
Dispatched from **John** to **Nova**:
- Enforces `schema: "TaskPacket@1"` and `target_agent: "nova"`.
- Validates `task_type` against the 6 V4 task types:
  - `BUDGET_STATUS`
  - `PACE_PROJECTION`
  - `ANOMALY_EXPLANATION`
  - `REBALANCE_RECOMMENDATION`
  - `CAP_CHANGE_PROPOSAL`
  - `ALERT_EXPLANATION`
- **Privacy Invariant**: Rejects packets containing `user_id` or raw ledger rows.

### `SpecialistResponse@1` (`src/contracts/SpecialistResponseV1.js`)
Returned by **Nova** to **John**:
- Includes `status` (`OK` | `PARTIAL` | `BLOCKED`), `data_quality` (`settled_share`, `provisional_count`, `uncategorized_count`, `confidence`), `findings[]`, `proposed_actions[]`, `constraints[]`, `peer_hints[]`, and `telemetry`.
- **Headline Envelope Invariant**: When `data_quality.confidence !== 'high'`, Nova's headline finding uses the **conservative** projection envelope (`projected_total_conservative`).
- **Action Ownership Invariant**: Rejects `RECATEGORIZE_TRANSACTION` if proposed by Nova (owned by Tally/User).

---

## 🛠️ 4. Deterministic Tools (`src/tools/`)

### 4.1 Tally (`src/tools/tally/`) — Categorization & Taxonomy
- **Three-State Classification**:
  - `SETTLED` (`confidence >= 0.70`): Counts toward settled category spend.
  - `NEEDS_REVIEW` (`0.40 <= confidence < 0.70`): Counts toward `spent_provisional` (`tier_is_provisional: true`).
  - `UNCATEGORIZED` (`confidence < 0.40`): Excluded from category utilization; routed to user review queue.
- **Category Hierarchy & Migration**: Subcategories without an explicit cap roll up into their parent category cap (`cat_dining_delivery` → `cat_dining`). Deprecated or migrated categories map cleanly via `TaxonomyRegistry`.

### 4.2 Sentinel (`src/tools/sentinel/`) — Read-Only Calculator & Tool Gateway
Exposes exactly 6 deterministic, side-effect-free functions to Nova:
1. `sentinel_get_ledger_summary`
2. `sentinel_run_category_utilization`
3. `sentinel_run_velocity_projection`
4. `sentinel_detect_anomalies`
5. `sentinel_run_rebalance_simulation`
6. `sentinel_validate_cap_change` (enforces `CAP_NEGATIVE`, `CATEGORY_UNKNOWN`, `PROTECTED_CATEGORY`, `CAPS_EXCEED_SPENDABLE`, `CAP_ON_DEPRECATED_CATEGORY`)

### 4.3 Threshold Job (`src/tools/threshold-job/`) — Deterministic Alerting & Hygiene
- Triggered by `categorization.updated` events from Tally.
- Recomputes utilization on touched categories (and previous categories when a transaction is corrected).
- **Alert Hygiene**: Deduplicates identical events, updates existing alerts on `warning → exceeded` escalation, keeps `DISMISSED` alerts suppressed unless a worse tier is entered, and auto-resolves alerts when spend drops back to `healthy`.

### 4.4 Action Service (`src/tools/action-service/`) — T1/T2/T3 Mutation Governance
- **Sole State Mutator**: Neither Nova nor John writes to database caps or transactions directly.
- **T1 (`DISMISS_ALERT`, `ACK_ALERT`)**: Single click confirmation.
- **T2 (`APPLY_REBALANCE`, `UPDATE_CAP`, `CREATE_CAP`, `RECATEGORIZE_TRANSACTION`)**: Explicit confirmation token with before/after diff; re-validates via Sentinel on apply.
- **T3 (`DELETE_CAP`)**: Confirmation + explicit warning of lost threshold monitoring.

---

## 🤝 5. Specialist & Orchestrator Agents (`src/agents/`)

### 5.1 Nova (`src/agents/nova/`) — Real-Time Budget Guardian
Executes the Section 8 conditional lifecycle (`NovaLifecycleRunner.js`):
1. **Context Fetch**: `sentinel_get_ledger_summary` + `sentinel_run_category_utilization`
2. **Pace & Velocity**: `sentinel_run_velocity_projection` (on pace/rebalance/exceeded tasks)
3. **Anomaly Scan**: `sentinel_detect_anomalies` (on anomaly/alert/warning tasks)
4. **Candidate Action Generation**: `sentinel_run_rebalance_simulation` / `sentinel_validate_cap_change`
5. **Data-Quality & Constraint Check**: Emits `UNCATEGORIZED_TRANSACTIONS_PRESENT`, `PROVISIONAL_CLOSE_TO_CAP`, `MISCATEGORIZATION_SUSPECTED`, `NO_HISTORICAL_BASELINE`, etc.
6. **Placeholder Binding & Citation Audit**: `PlaceholderBinder` binds `{{placeholders}}` to verified Sentinel outputs and enforces `sentinel:<tool_result_id>:tx_<id>` citations.

### 5.2 John (`src/agents/john/`) — Master Orchestrator & Coach
- Routes intents via `RoutingTable.js` (e.g., *"Cancel Netflix"* → **Iris**; *"Buy ₹80k laptop vs emergency fund"* → **Nova + Atlas**; *"Fix the category of ₹2,500 Amazon charge"* → **Tally / Action Service**).
- Resolves `peer_hints` (`RECURRING_MERCHANT_SPIKE` → Iris, `SUSTAINED_SURPLUS_AVAILABLE` / `STRUCTURAL_DEFICIT_RISK` → Atlas) without direct specialist-to-specialist calls.

---

## 🔌 6. API Specification

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/budget` | Full budget status, V4 category tiers, data quality & active alerts |
| `PUT` | `/api/budget/:category` | Validates & updates a category cap via Sentinel + ActionService |
| `DELETE` | `/api/budget/:category` | Uncaps a category (enforces `PROTECTED_CATEGORY` check) |
| `POST` | `/api/transactions` | Ingests an expense via Tally → triggers ThresholdJob → returns live audit |
| `POST` | `/api/transactions/import` | Bulk statement batch ingestion via Tally (`categorization.updated`) |
| `POST` | `/api/transactions/:id/recategorize` | Corrects transaction category via Tally & recomputes both categories |
| `GET` | `/api/transactions/review-queue` | Lists `UNCATEGORIZED` and `NEEDS_REVIEW` transactions |
| `POST` | `/api/actions/propose` | Issues a scoped confirmation token (`T1` / `T2` / `T3`) for a proposed action |
| `POST` | `/api/actions/execute` | Executes a confirmed action via `ActionService` |
| `POST` | `/api/nova/task-packet` | Executes a V4 `TaskPacket@1` directly on Nova and returns `SpecialistResponse@1` |
| `POST` | `/api/nova/orchestrate` | Routes a user query through **John Orchestrator** across Nova, Iris, and Atlas |
| `GET` | `/api/nova/telemetry` | Multi-agent telemetry & reasoning trace |
| `GET` | `/api/nova/telemetry/cycle` | Full Cognitive OODA cycle & burn envelopes |

---

## 🚀 7. Running Tests, CLI Demo & Server

### 1. Run V4 Unit & Acceptance Test Suite
```bash
node tests/novaEngine.test.js
```
*Verifies all 14 test suites and all 12 V4 Acceptance Criteria (Section 17).*

### 2. Run Interactive CLI Demo
```bash
node demo.js
```
*Demonstrates Tally ingestion, deterministic ThresholdJob alerting, Sentinel read-only gateway enforcement, Nova `TaskPacket@1` → `SpecialistResponse@1` execution, John cross-agent orchestration, and ActionService T2 confirmation.*

### 3. Start Express Server
```bash
npm start
# Server listens at http://localhost:4001
```
