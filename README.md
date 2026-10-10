# 🖥️ FinMate AI & Nova V4 — Multi-Agent Desktop Application (Electron) & Parallel Branch Architecture

> **"Financial discipline through deterministic enforcement, not probabilistic guesswork."**
> **"Test in `web-testing/` first — promote to the Electron Desktop Application only when 100% of tests succeed."**

**FinMate AI** is a native **Electron Desktop Application** powered by a multi-agent financial architecture built in full compliance with **Nova: Agent Specification (V4)**.

To maximize velocity for our **4-person engineering team working on 6+ parallel modules**, every agent and tool lives in its own **isolated directory** (`src/agents/*`, `src/tools/*`) AND its own **dedicated Git branch**, with `main` integrating all branches into the unified Electron Desktop Application.

---

## 📑 Table of Contents
1. [Quick Start: Running the Electron App vs. Web-Testing Sandbox](#-1-quick-start-running-the-electron-app-vs-web-testing-sandbox)
2. [Mandatory Testing-to-Application Promotion Workflow](#-2-mandatory-testing-to-application-promotion-workflow)
3. [Parallel Team Branch Architecture (4 Developers / 6+ Branches)](#-3-parallel-team-branch-architecture-4-developers--6-branches)
4. [Modular Repository Structure](#-4-modular-repository-structure)
5. [Nova V4 Architecture, Contracts & Deterministic Tools](#-5-nova-v4-architecture-contracts--deterministic-tools)
6. [API Specification](#-6-api-specification)

---

## 🚀 1. Quick Start: Running the Electron App vs. Web-Testing Sandbox

### 🖥️ A. Primary Product: Run the Electron Desktop Application (`run-app.bat`)
From the repository root, double-click or run:
```bat
run-app.bat
```
**What `run-app.bat` does:**
1. Runs the automated **Pre-Flight Verification Gate** (`web-testing/verify-web-readiness.js`) across all agents, tools, and the 14-suite V4 compliance test suite.
2. Ensures the production UI bundle (`dist/index.html`) is built.
3. Launches the native **FinMate AI Electron Desktop Application** (`electron/main.js`) with the embedded Nova V4 Express API server (`http://localhost:4001`) running automatically in the background.

---

### 🌐 B. Website Testing Sandbox (`web-testing\run-web-test.bat`)
All website hosting and browser-testing logic resides inside the [`web-testing/`](./web-testing) folder. To test changes in the website before adding them to the Electron application, run:
```bat
web-testing\run-web-test.bat
```
**What `web-testing\run-web-test.bat` does:**
1. Runs all 8 standalone module tests (`nova`, `john`, `iris`, `atlas`, `sentinel`, `tally`, `threshold-job`, `action-service`) plus the 14-suite V4 compliance suite (`tests/novaEngine.test.js`).
2. **If any test fails**, it halts with a red `[GATE BLOCKED]` screen and warns you **NOT** to merge or add your changes to the Electron Desktop Application.
3. **If all tests pass**, it starts the Nova V4 API server (`:4001`) and opens the interactive Website Testing Sandbox (`http://localhost:5173`) in your browser.

---

## 🧪 2. Mandatory Testing-to-Application Promotion Workflow

> [!IMPORTANT]
> **Golden Rule for All 4 Team Members:**
> Never add or merge changes directly into the Electron Desktop Application (`main`) without first running the `web-testing` suite. **Only when 100% of automated and browser tests succeed in `web-testing` should changes be added to the Electron Application.**

```
┌────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: Checkout Your Assigned Agent/Tool Branch                           │
│   git checkout nova   (or john / iris / atlas / sentinel / tally)          │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ STEP 2: Develop in Your Isolated Module Folder & Run Unit Tests            │
│   npm run test:nova   (or test:john / test:iris / test:atlas / etc.)       │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ STEP 3: Run the Website Testing Sandbox & Pre-Promotion Gate               │
│   web-testing\run-web-test.bat                                             │
│   • Runs all 8 module tests + all 12 V4 Acceptance Criteria                │
│   • Launches http://localhost:5173 for live browser verification           │
└──────────────────┬──────────────────────────────────────┬──────────────────┘
                   │                                      │
        ❌ IF TESTS FAIL                        ✅ IF TESTS SUCCEED (100%)
                   │                                      │
                   ▼                                      ▼
┌─────────────────────────────────────┐  ┌───────────────────────────────────┐
│ 🛑 STOP — DO NOT ADD TO APPLICATION │  │ 🚀 PROMOTE TO ELECTRON APP (main) │
│ Fix regressions on your branch and  │  │ 1. git checkout main              │
│ re-run web-testing\run-web-test.bat │  │ 2. git merge <your-branch>        │
└─────────────────────────────────────┘  │ 3. npm run build                  │
                                         │ 4. run-app.bat (Launch Desktop)   │
                                         └───────────────────────────────────┘
```

### Individual Module Test Commands
You can also run targeted tests for your specific branch at any time:
```bash
npm run test:gate            # Full Pre-Promotion Gate (All 8 modules + 14 V4 test suites)
npm run test:nova            # Test Nova Agent only
npm run test:john            # Test John Orchestrator only
npm run test:iris            # Test Iris Subscription Specialist only
npm run test:atlas           # Test Atlas Goal Strategist only
npm run test:sentinel        # Test Sentinel Deterministic Calculator only
npm run test:tally           # Test Tally Categorizer & Taxonomy only
npm run test:threshold-job   # Test Threshold Job Alerting Engine only
npm run test:action-service  # Test Action Service T1/T2/T3 Governance only
```

---

## 🌿 3. Parallel Team Branch Architecture (4 Developers / 6+ Branches)

To enable **4 developers to work on 6 different workstreams in parallel** without merge conflicts, every agent and tool has its own Git branch and isolated folder. **Every branch is a complete, runnable build of the product**, and **`main` merges and uses all branches together**.

| Git Branch | Module Type | Isolated Folder | Standalone Test | Primary Responsibility |
|---|---|---|---|---|
| **`main`** | **Integrated App** | Root + All Folders | `npm run test:gate` | **Primary Electron Desktop App (`run-app.bat`) integrating all branches** |
| **`nova`** (`agent/nova`) | Agent (V4) | `src/agents/nova/` | `npm run test:nova` | Real-Time Budget Guardian, lifecycle runner, placeholder binder, Nova UI |
| **`john`** (`agent/john`) | Agent (V4) | `src/agents/john/` | `npm run test:john` | Master Orchestrator, Section 10 signal routing table, John Coach UI |
| **`iris`** (`agent/iris`) | Agent (V4) | `src/agents/iris/` | `npm run test:iris` | Recurring subscription audit, `RECURRING_ANOMALY` handler, Iris UI |
| **`atlas`** (`agent/atlas`) | Agent (V4) | `src/agents/atlas/` | `npm run test:atlas` | Goal trajectory strategist, `GOAL_FUNDING_PRESSURE` handler, Atlas UI |
| **`sentinel`** (`tool/sentinel`) | Tool (V4) | `src/tools/sentinel/` | `npm run test:sentinel` | 6 deterministic read-only calculators, snapshot manager, `ToolGateway`, Sentinel UI |
| **`tally`** (`tool/tally`) | Tool (V4) | `src/tools/tally/` | `npm run test:tally` | 3-state categorizer (`SETTLED`/`NEEDS_REVIEW`/`UNCATEGORIZED`), taxonomy, Spending Analyser UI |
| **`threshold-job`** (`tool/threshold-job`) | Tool (V4) | `src/tools/threshold-job/` | `npm run test:threshold-job` | Deterministic `<60s` tier alerting & alert hygiene store |
| **`action-service`** (`tool/action-service`) | Tool (V4) | `src/tools/action-service/` | `npm run test:action-service` | Sole state mutator enforcing T1/T2/T3 confirmation tokens |

---

## 📂 4. Modular Repository Structure

```
finmate-nova-desktop/
├── run-app.bat                                       # 🖥️ PRIMARY LAUNCHER: Verifies & launches Electron Desktop App
├── branch-manifest.json                              # Branch & parallel workstream metadata
├── README.md                                         # Documentation & Testing-to-Application workflow
├── Nova_V4_Specification_Compliance_Summary.pdf      # V4 Audit & Compliance Summary PDF
├── electron/                                         # 🖥️ Electron Desktop Application Wrapper
│   ├── main.js                                       # Electron Main Process + Embedded Nova V4 Server + Native Menu
│   └── preload.js                                    # Context-isolated desktop bridge (window.finmateDesktop)
├── web-testing/                                      # 🌐 Website Testing Sandbox & Pre-Promotion Gate
│   ├── run-web-test.bat                              # 🌐 WEB TEST LAUNCHER: Runs gate tests & opens browser sandbox
│   ├── verify-web-readiness.js                       # Automated 8-module + 14-suite V4 promotion gate
│   ├── web-server.js                                 # Website dev server + API launcher
│   ├── vite.web.config.js                            # Vite config for browser sandbox
│   └── README.md                                     # Web-testing instructions
├── src/
│   ├── App.jsx                                       # Unified UI shell importing from src/agents/* and src/tools/*
│   ├── index.js                                      # Express V4 Server Entrypoint
│   ├── contracts/                                    # Shared V4 Schemas & Platform Rules
│   │   ├── PlatformRules.js                          # Tier rules (<80%, 80-100%, >100%), cap rules, T1/T2/T3
│   │   ├── TaskPacketV1.js                           # TaskPacket@1 validator & factory (zero PII)
│   │   └── SpecialistResponseV1.js                   # SpecialistResponse@1 validator & builder
│   ├── agents/                                       # 🤖 Isolated Agent Modules (1 Folder per Agent)
│   │   ├── nova/                                     # 🛡️ Nova — Real-Time Budget Guardian + nova.test.js
│   │   ├── john/                                     # 🎯 John — Master Orchestrator & Coach + john.test.js
│   │   ├── iris/                                     # 🔄 Iris — Subscription Specialist + iris.test.js
│   │   └── atlas/                                    # 🗺️ Atlas — Goal Strategist + atlas.test.js
│   ├── tools/                                        # 🛠️ Isolated Deterministic Tool Modules (1 Folder per Tool)
│   │   ├── sentinel/                                 # 📐 Sentinel — 6 Read-Only Calculators + sentinel.test.js
│   │   ├── tally/                                    # 🏷️ Tally — Categorizer & Spending Analyser + tally.test.js
│   │   ├── threshold-job/                            # 🚨 Threshold Job — Deterministic Alerting + threshold-job.test.js
│   │   └── action-service/                           # 🔐 Action Service — T1/T2/T3 Governance + action-service.test.js
│   ├── components/                                   # Shared App Shell UI (Sidebar, Header, Auth, Settings)
│   ├── db/                                           # SQLite / In-Memory V4 Database & Seeder
│   └── routes/                                       # Express REST Endpoints (/api/budget, /api/transactions, /api/actions)
└── tests/
    └── novaEngine.test.js                            # Full 14-Suite Nova V4 Specification Test Suite
```

---

## ⚙️ 5. Nova V4 Architecture, Contracts & Deterministic Tools

### Key V4 Architectural Guarantees
1. **Strict Separation of Arithmetic and Narrative**: Nova never computes or guesses numbers. Nova binds `{{placeholders}}` directly to verified Sentinel `tool_result_id` outputs via `PlaceholderBinder`.
2. **Read-Only Tool Gateway**: Nova can only invoke the 6 allowlisted `sentinel_*` read-only functions (`sentinel_get_ledger_summary`, `sentinel_run_category_utilization`, `sentinel_run_velocity_projection`, `sentinel_detect_anomalies`, `sentinel_run_rebalance_simulation`, `sentinel_validate_cap_change`). Any write attempt throws `GATEWAY_WRITE_ATTEMPT_BLOCKED`.
3. **Zero PII Leakage (`TaskPacket@1`)**: Orchestrator requests strip `user_id` and raw ledger rows; specialists operate on pinned `snapshot_id`.
4. **Tier Thresholds (Section 10.1)**:
   - 🟢 **`healthy`**: Utilization `< 80%`
   - 🟡 **`warning`**: Utilization `80% – 100%` (inclusive)
   - 🔴 **`exceeded`**: Utilization `> 100%`
5. **Action Governance (T1 / T2 / T3)**: All state mutations require a scoped confirmation token verified by `ActionService` and re-validated by `Sentinel`.

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
| `POST` | `/api/nova/telemetry/task-packet` | Executes a V4 `TaskPacket@1` directly on Nova and returns `SpecialistResponse@1` |
| `GET` | `/api/nova/telemetry` | Multi-agent telemetry & reasoning trace |
| `GET` | `/api/nova/telemetry/cycle` | Full Cognitive OODA cycle & burn envelopes |
