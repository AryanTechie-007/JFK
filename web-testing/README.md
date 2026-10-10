# 🌐 FinMate AI — Web-Testing Sandbox (`web-testing/`)

This folder contains the **Website Testing Sandbox & Pre-Promotion Verification Gate** for the 4-person parallel engineering team working across our 6 primary workstreams (`nova`, `john`, `iris`, `atlas`, `sentinel`, `tally`) and 2 core governance tools (`threshold-job`, `action-service`).

## 🚀 How to Run Web Testing

Double-click or run from a terminal:
```bat
web-testing\run-web-test.bat
```

### What `run-web-test.bat` Does:
1. **Runs the Automated Pre-Promotion Gate (`verify-web-readiness.js`)**:
   - Executes all standalone branch tests (`nova.test.js`, `john.test.js`, `iris.test.js`, `atlas.test.js`, `sentinel.test.js`, `tally.test.js`, `threshold-job.test.js`, `action-service.test.js`).
   - Executes the full 14-suite **Nova: Agent Specification (V4)** compliance test suite (`tests/novaEngine.test.js`).
2. **Blocks Promotion on Failure**:
   - If any test fails, execution stops with a red `[GATE BLOCKED]` banner. **Do NOT merge or add failing changes to the Electron Desktop Application.**
3. **Launches the Website Sandbox on Success**:
   - Starts the Nova V4 API Server (`http://localhost:4001`) and opens the Vite Web Sandbox (`http://localhost:5173`) in your browser so you can visually verify your agent or tool UI before merging to `main` and running `run-app.bat` (the Electron Desktop App).
