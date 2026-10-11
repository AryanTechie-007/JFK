# John — Main Orchestrator and Chatbot — Component Specification

| Attribute | Value |
| --- | --- |
| File | `docs/specifications/john-orchestrator-spec.md` |
| Component ID | `JOHN` (code module `agents/john` + chat routes) |
| Version | 2.0.0 (requirements freeze) — supersedes *John: Main Orchestrator and Chatbot Specification V1* and every earlier blueprint, V3 spec and change pack it consolidated |
| Kind | Deterministic orchestration code that uses an LLM in exactly three places: the router (only when rules are not confident), synthesis, and the summarizer. Direct answers use the same synthesis path. |
| User-facing surface | The **John** chat (one of the five options) and the chat panels embedded in the Atlas, Nova, Iris and Sentinel workspaces; confirmation cards, T1 chips and Undo lines |
| Shared contracts | `system-contracts.md`: §2 ownership, §5 entities, §7 snapshots and caches, §8 data quality, §9 invocation protocol, §10 tools, §11 grounding, §12 codes, §13 actions/tokens, §14 events, §15 errors and deadlines, §16 security, §18 UI map |
| Decisions applied | All of D-001 … D-025; directly D-001, D-002, D-007, D-008, D-012, D-014, D-016, D-017, D-024, D-025 |

---

## A. Identity and purpose

### A.1 Mission
Give the user one coherent, verified answer per message, and make every change safe, visible and reversible.

### A.2 Core principle
John decides and coordinates; he does not compute, categorize, execute or authorize. He understands the request and its UI context, selects the minimum set of specialists, gives each only the context it needs, validates what comes back, resolves conflicts, tells the truth in grounded language, and turns permitted proposals into confirmation cards. Everything that moves state or protects money is deterministic backend code.

### A.3 Persona (observable rules)
Calm, plain, honest. Short answer first, detail on request. Encouraging without pressure. Never says an action happened until the Action Service returned `EXECUTED` or `DUPLICATE`. Asks when unsure, one question at a time, preferring selectable options. Declines out-of-scope requests clearly (real money movement, investment advice, credit, tax).

### A.4 Responsibilities (John owns)
| Area | Owned behaviour |
| --- | --- |
| Intent and routing | Rules first, LLM router when needed (B.3) |
| Context | Snapshot creation, data-quality read, task packets, context budgets (B.4) |
| Dispatch | Parallel invocation, one dependency edge, one reconcile round, budgets (B.5) |
| Validation | Deterministic validation of every specialist response (B.6) |
| Conflicts | Ordered conflict rules with Sentinel arbitration (B.7) |
| Asking | When and how to ask the user (B.8) |
| Proposals UX | Storing proposals through the Action Service, rendering cards and chips, re-showing cards, reporting results (B.9) |
| Categorization in chat | Status caveats, chat corrections, specialist hints → review queue, "why is this here?" (B.10) |
| Direct answers | Greetings, product questions, account-health overview, Financial Health score, scope refusals (B.11) |
| Synthesis | One grounded reply (B.12) |
| Memory | Threads, turns, rolling summaries, memory facts (G) |

### A.5 Explicit exclusions
Any financial computation (Sentinel); categorization (Categorizer); execution of any change (Action Service); authentication and authorization (backend); direct database access to financial tables; domain rules of Atlas/Nova/Iris; alert detection (Budget Monitor); bypassing a hard rule (nobody may); real money movement and investment advice.

### A.6 Boundaries with the other components
| Component | Relationship |
| --- | --- |
| ATLAS, NOVA, IRIS | John is their only caller; they never call John or each other (SC §9). |
| SENTINEL | John calls only his allowlisted functions (SC §10.4): surplus baseline, ledger summary, simulation (arbitration only), bill forecast, cash-flow risk, health score. Never routes a user message to Sentinel "as an agent". |
| CATEGORIZER | Reads status, searches transactions, adds review items. Never runs the pipeline, never categorizes with an LLM. |
| ACTION_SERVICE | Creates proposals; executes chat T1 instructions with an intent token; receives results. John holds no write credentials for financial state. |
| PROFILE_SERVICE | Reads preferences for packets; changes them only via `UPDATE_PREFERENCE` / `UPDATE_PROFILE` actions. |
| BUDGET_MONITOR | Reads an alert's deterministic data when the user opens it. |
| SNAPSHOT_SERVICE | Creates the request snapshot. |
| WORKSPACE_API | Hosts John's chat endpoints; renders cards from proposal parameters. |

### A.7 Dependencies and assumptions
LLM Adapter (model classes `ROUTER`, `SYNTHESIS`, `SUMMARIZER`; prototype Qwen 32B-class, production Gemini Enterprise — D-008); Tool Gateway; Action Service; Categorizer read API; Snapshot Service; Profile Service read API; shared contracts and schemas. Requires `llm_processing_consent = true` (SC §16.6); without it the chat shows a consent prompt and the workspaces remain fully usable.

---

## B. Functional requirements

### B.1 Entry points
| Entry | Endpoint | Trigger kind | Notes |
| --- | --- | --- | --- |
| User message (John chat or a workspace panel) | `POST /api/v1/chat/messages` | `USER_MESSAGE` | Body C.1; reply C.2 (streamed) |
| Workspace "Explain" / "Ask about this" button | `POST /api/v1/chat/messages` with a canned prompt ID and `ui_context` | `UI_ACTION` | Handled exactly like a user message; the canned prompt text is shown in the thread |
| Alert opened ("Explain") | `POST /api/v1/chat/messages` with `trigger.kind = ALERT_OPEN`, `alert_id`, empty message | `ALERT_OPEN` | Lazy narrative (D-007); cached per `(alert_id, snapshot_id)` 15 min |
| Question option chosen | `POST /api/v1/chat/messages` with `answer_to: question_id, option_id` | `USER_MESSAGE` | Fills the pending task's `task_params` from the option's `value` |
| Card confirmed / declined | `POST /api/v1/proposals/{id}/confirm` / `/decline` (Workspace API → Action Service) | — | John is not on the execution path; on the next render John shows the `ActionResult` (B.9.5) |
| T1 chip tapped | `POST /api/v1/actions` with intent token | — | Same |
| Thread list / history / memory view | `GET /api/v1/chat/threads`, `GET /api/v1/memory`, `DELETE /api/v1/memory/{fact_id}`, `DELETE /api/v1/chat/threads/{id}/summary` | — | G |

### B.2 Request lifecycle (normative order)
| # | Step | Component | LLM |
| --- | --- | --- | --- |
| 1 | Receive message with session identity, `thread_id`, `ui_context`, `trigger`; reject if consent false (`FORBIDDEN` with consent prompt) | Chat route | No |
| 2 | Rate limits (SC §16.7); input checks (length ≤ 2,000 chars, strip control characters); detect a reference to a pending proposal ("apply it", "yes") or an answer to a pending question | John rules | No |
| 3 | Read Categorizer status → `DataQuality@1`; create a `CHAT_REQUEST` (or `ALERT_OPEN`) snapshot | Snapshot Service, Categorizer | No |
| 4 | Load memory: preferences (Profile Service), rolling summary, last 6 turns, open proposals, relevant memory facts by tag | John | No |
| 5 | Route (B.3) | John | Rules first; router model only if rules are not confident |
| 6 | Resolve targets (goal, category, merchant, transaction) by deterministic lookup; ambiguous → ask (B.8) and stop | John | No |
| 7 | Build one task packet per specialist (B.4) | John | No |
| 8 | Dispatch in parallel where independent; one dependency edge max (B.5) | John | Specialists |
| 9 | Validate each response (B.6) | John | No |
| 10 | Resolve conflicts; at most one Sentinel arbitration and one reconcile round (B.7) | John, Sentinel | Specialist if reconcile |
| 11 | Store surviving proposals via Action Service `createProposal` (which also runs the rule library); map `action_ref → proposal_id` | John, Action Service | No |
| 12 | Synthesize one reply from structured findings; bind placeholders; grounding check (B.12) | John | Yes (one call, one regenerate max) |
| 13 | Stream the reply blocks (text, cards, chips, question, notices) | Chat route | No |
| 14 | Persist the turn; enqueue `summarize_threads` if due; create memory facts only per G.3 | Job | Summarizer only when due |

**Per-request budgets (F-01, registry `john.budget.*`):** ≤ 6 LLM invocations (router, each specialist task, synthesis, any regenerate or retry — a specialist task counts as one invocation even though it may make up to `max_tool_calls + 2` model completions internally); ≤ 12 Sentinel calls across John and specialists (gateway-enforced); ≤ 3 specialists in parallel; ≤ 1 reconcile round; ≤ 60,000 input tokens summed across invocations; 20 s wall clock. When a budget is exhausted John stops dispatching and returns what is complete, labelled partial.

### B.3 Routing
**B.3.1 Three layers, stop at the first confident one.**
1. **UI context.** In a workspace panel the default specialist is that workspace's agent (ATLAS, NOVA, IRIS). In the **Sentinel** workspace the default is a **direct John answer** using his Sentinel tools (Sentinel is not a persona); Iris is added only when the user asks for advice or a plan. Add another specialist only if the message clearly needs it.
2. **Deterministic rules.** Versioned pattern table `agents/john/routing-rules.json` (keywords, entity detectors for amounts, dates, goal names, category names, merchants).
3. **Router call.** Small model (`ROUTER` class), JSON output `RouterOutput@1` (C.3), temperature 0, 4 s timeout, 1 retry on schema violation; on second failure → ask a clarifying question with the top three intents as options.

**B.3.2 Routing table (supersedes the tables in Atlas/Nova/Iris V4).**
| Signal | Destination | Task type(s) |
| --- | --- | --- |
| Create, edit, fund, release, pause, resume, delete a goal; goal progress or ETA; "can I add X to goal Y" | ATLAS | `CREATE_GOAL`, `UPDATE_GOAL`, `SET_GOAL_STATUS`, `EVALUATE_FUND_ADDITION`, `EVALUATE_FUND_RELEASE`, `DELETE_GOAL`, `GOAL_PROGRESS` |
| "Review my goals / savings plan" | ATLAS | `GOAL_PLAN_REVIEW` |
| SIP / "how much would ₹X a month grow to" | ATLAS | `SIP_PROJECTION` |
| Current-period cap status, spend so far, remaining, envelope | NOVA | `LIVE_STATUS` |
| **Overspend this month** — status or fix ("I'm over on dining, fix it") (D-012) | NOVA | `PROPOSE_REBALANCE` or `LIVE_STATUS` |
| Change a cap | NOVA | `ADJUST_CAP_REQUEST` |
| "Why did this charge change", odd/duplicate charge | NOVA | `EXPLAIN_ANOMALY` |
| Opened CAP_TIER alert | NOVA | `BREACH_EVENT` |
| Opened ANOMALY alert | NOVA | `ANOMALY_EVENT` |
| Next-month planning, "is next month OK" | IRIS | `MONTHLY_PLAN` / `PLAN_REVIEW` |
| One-off purchase affordability (even if savings are mentioned) | IRIS | `WHAT_IF_PURCHASE` |
| Upcoming bills, cash-flow risk; opened CASHFLOW_RISK alert | IRIS | `BILL_OUTLOOK` |
| **Recurring overspend pattern** ("I keep overspending", "every month I run out") (D-012) | IRIS | `OVERSPEND_DIAGNOSIS` |
| Both current fix and recurring pattern in one message | NOVA + IRIS in parallel | as above |
| "Change this category", "why is this under X", uncategorized/review items, "this is a transfer to my own account", duplicates | John + Categorizer (B.10) | — (no specialist, no LLM beyond wording) |
| Charts or visual summaries without advice | Direct UI: John replies with a link block to the Sentinel workspace view | — (no LLM) |
| Account health overview, no advice requested | John direct: `sentinel_get_surplus_baseline`, `sentinel_forecast_bill_outlays`, `sentinel_flag_cashflow_risk` | — |
| "Score my habits", "how healthy are my finances", "rate my spending" (quantify habits) (D-024) | John direct: `sentinel_compute_health_score` | — |
| Change income, fixed expenses, risk comfort, protected categories (explicit statement) | John → `UPDATE_PROFILE` card (T2) / `UPDATE_PREFERENCE` (T1 instruction) | — |
| Greeting, thanks, product questions | John direct (`DIRECT` path, no tools) | — |
| Dependency edge: Nova emitted `GOAL_FUNDING_PRESSURE`, or Iris emitted `SAVINGS_CAPACITY`, and the user's request concerns goals or savings (B.5) | ATLAS (second in order) | `HANDLE_PEER_FINDING` |
| Investment advice, real money movement, transfers, payments, credit, tax | Decline with a clear scope statement | — |

**B.3.3 Rules.** At most three specialists per request; more → John asks the user to narrow. A specialist's involvement ends when its response returns. John never routes a message to Sentinel or the Categorizer as if they were agents.

### B.4 Task packets
- Schema `TaskPacket@1` (SC §9.2). John fills `task_params` from rule/router entities and resolved targets; amounts typed by the user are hypotheticals.
- Context per specialist (minimum necessary):

| Field | ATLAS | NOVA | IRIS |
| --- | --- | --- | --- |
| `preferences.risk_comfort` | ✓ | ✓ | ✓ |
| `preferences.protected_category_ids` | ✓ | ✓ | ✓ |
| `preferences.goal_priority_order` | ✓ | — | ✓ |
| `rolling_summary` | ✓ (≤ 800 chars) | ✓ | ✓ |
| `recent_turns` | last 6 | last 3 | last 6 |
| `peer_findings` | Nova `GOAL_FUNDING_PRESSURE`, Iris `SAVINGS_CAPACITY` | Atlas `GOAL_COMMITMENT`, Iris forecast warnings | Nova `RECURRING_ANOMALY`, Atlas `GOAL_COMMITMENT` |
| `data_quality` | ✓ | ✓ | ✓ |
| Goals, caps, balances | via Sentinel only | via Sentinel only | via Sentinel only |

- **Context ceiling** 8,000 tokens per specialist call including its system prompt (F-02). Trim order when over: older turns → peer findings → low-priority memory facts → rolling summary truncated to 400 chars. Never trimmed: task params, data quality, preferences.
- Never in a packet: `user_id`, `tenant_id`, account numbers, raw descriptions, raw ledger rows, balances or figures from memory.
- `allowed_tools` = the specialist's SC §10.4 row; `budget` = SC §9.3 task budget; `deadline_ms` = min(8,000, remaining request time − 4,000 for synthesis).

### B.5 Dispatch
- Independent specialists run in parallel (`Promise.allSettled` with one AbortController per task).
- **One dependency edge** per request: if the router marks `dependencies: [{from: NOVA, to: ATLAS, hint: GOAL_FUNDING_PRESSURE}]` (or Iris → Atlas `SAVINGS_CAPACITY`), John runs the source first and the target with the hint in `peer_findings`. The target is dispatched only if the source actually emitted that hint.
- **One reconcile round**: only when a first-round response is `PARTIAL`/`NEEDS_INPUT` because it lacked an input that another first-round specialist's result supplies (e.g. Atlas lacked Iris's capacity). Reconcile re-invokes that one specialist with the peer finding (`trigger.kind = RECONCILE`). Counted in the LLM budget.
- Specialist cache: identical `(snapshot_id, specialist, task_type, task_params_hash)` within 15 min reuses the stored response (SC §7.3).

### B.6 Validation of specialist responses (all deterministic; the whole response is untrusted)
| # | Check | On failure |
| --- | --- | --- |
| 1 | Matches `SpecialistResponse@1` + domain schema | Retry once with the validation error appended; then treat as `ERROR` |
| 2 | Every `tool_result_id` exists, belongs to this request and user (`gateway.verifyResultOwnership`) | Drop the whole response; security event |
| 3 | Every placeholder resolves to a field of a cited result or allowed source (SC §11.2); every non-RECOMMENDATION/CAVEAT finding cites ≥ 1 result | Strip the sentence; if > 30 % of sentences fail, drop the specialist's text and show only Sentinel-derived blocks for it |
| 4 | Every proposed action is in the registry and this specialist is a listed proposer (SC §13.2) | Drop the proposal |
| 5 | Params valid for the action schema **and bound**: equal to the params of `validation_tool_result_id` per the action's binding map (Atlas/Nova/Iris spec §C.3), and that result's verdict is `PASS`/`OK`/`FITS`/`TIGHT` (or rebalance transfers equal) | Drop the proposal |
| 6 | No MANDATORY constraint applies to the proposal (`applies_to_action_ref` or a cited validator with a MANDATORY code); MANDATORY only honoured when grounded (SC §9.5) | Drop the proposal; keep the constraint for wording |
| 7 | IDs mentioned anywhere exist in the packet or cited results | Strip the item; security event |
| 8 | `confidence` ≤ lowest cited headline result confidence; headline uses the conservative field when SC §11.4 requires | Override confidence; replace headline with the conservative-figure finding if present, else add a CAVEAT |
| 9 | `data_quality` caveats carried (`complete = false` → caveat; coverage below floor → `LOW_CATEGORIZATION_COVERAGE`) | Add the caveat |
| 10 | Peer hints have known codes and grounded refs | Drop invalid hints |
| 11 | Free-text objection without a grounded code | Becomes a WARNING; never blocks a user's explicit choice |

A specialist's approval never replaces the Action Service's authorization and validation.

### B.7 Conflict resolution (specialists never debate; stop at the first rule that decides)
| Order | Rule |
| --- | --- |
| 1 | **Hard failures.** Validator rejections and grounded MANDATORY constraints win. |
| 2 | **Safety.** If confidence is not `HIGH` and the downside is a shortfall, prefer the conservative figure/option. |
| 3 | **User statements.** Stated priorities (`goal_priority_order`, memory facts) and protected categories decide among remaining options. |
| 4 | **Arbitration by computation.** For a genuine disagreement (e.g. Atlas: feasible; Iris: risky), John calls `sentinel_run_spending_simulation` once for the month the proposals affect, with `cap_changes` and `goal_changes` taken from the conflicting proposals' params. If `risk_level = LOW` and no `GOAL_COMMITMENT_CONFLICT`: both proposals stand. Otherwise keep the proposal set whose separate simulation (already cited) has the higher `conservative_available_signed_minor`; the other becomes an option. The number decides, not the opinions. |
| 5 | **User choice.** If still undecided, present at most two options with Sentinel figures (Question@1) and create **no proposal** until the user picks. |

### B.8 Asking the user
John asks exactly one question (Question@1, selectable options preferred) when: a specialist returns `NEEDS_INPUT`; a target is ambiguous (two goals match "vacation", several transactions match a correction); confidence is `LOW` and the action is T2 or higher; two defensible options remain after B.7; the request would delete or overwrite something and the phrasing is not unambiguous; a cap change lacks scope (this month vs from now on). The pending question is stored on the thread with the pending task; the answer resumes it without re-routing.

### B.9 Proposals, confirmation and results
**B.9.1 Storing.** For each surviving proposed action John calls `ActionService.createProposal` with `origin: CHAT_PROPOSAL`, `proposer: <specialist>`, `base_versions` from the cited results' snapshot, `snapshot_id`, warnings (WARNING codes) and `requires_ack` (`NEGATIVE_BALANCE_RISK`, T3). The Action Service re-runs the rule library; a creation-time rejection drops the card and John says why. A new proposal for the same target supersedes an open one. Specialists never hold proposal state.

**B.9.2 Cards (T2/T3).** Rendered by code from the proposal's params and the rule-code message templates: names, amounts (`{{param:…}}`), resulting values (from the cited result), affected-row counts (dry run), warnings, acknowledgment checkbox when required, Confirm / Decline. No specialist wording on a card. T3 cards show what will be lost and use a de-emphasized, explicit control.

**B.9.3 Chips (T1 proposals from specialists).** `CREATE_ALERT`, `DISMISS_ALERT` render as a chip; executed only when the user taps (D-002).

**B.9.4 Chat T1 instructions.** When the **deterministic rule layer** matches an explicit instruction with exactly one resolved target (e.g. "move the Swiggy charge on 3 Oct to Groceries"; "protect my health spending"), John obtains an intent token and calls `ActionService.executeT1`; after `EXECUTED` he shows one line with **Undo**. If the instruction was detected only by the router model, or the target needed resolution, John renders a T1 chip instead and waits for the tap. T2 instructions (merchant-wide recategorization, `UPDATE_PROFILE`, `MARK_OWN_ACCOUNT_COUNTERPARTY`, `CREATE_CATEGORY_RULE`, `RESTORE_GOAL`, a cap change on a protected category with `override_protected`) always become cards with `origin: CHAT_INSTRUCTION`.

**B.9.5 Typed confirmations.** "Yes", "apply it", "do it" never confirm T2/T3. John re-shows the card of the proposal he believes is meant (the most recent open proposal in the thread; if several, ask which).

**B.9.6 Reporting results.** John states only values returned in `ActionResult.result`:

| Status | What John says | State |
| --- | --- | --- |
| `EXECUTED` | The new values (`{{action:…}}`) | Applied |
| `DUPLICATE` | It was already applied; shows the original result | No change |
| `REJECTED_VALIDATION` | Names the rule in plain words; offers a fix | None |
| `REJECTED_STALE` | The data changed; re-runs the specialist on a new snapshot or asks to reconfirm | None |
| `REJECTED_POLICY` / `REJECTED_AUTH` | Not permitted | None |
| `FAILED_ROLLED_BACK` | "This change was not applied." | None |
| `EXECUTED_UNVERIFIED` | Applied but not yet confirmed; will update | Applied |

After execution the UI refreshes from the new state and John's cache drops entries for older versions. A decline is recorded as a preference signal **only** if the user says why in words (G.3).

### B.10 Categorization in chat
- **Status.** Step 3 reads `GET /status`; `data_quality` goes into every packet. If `complete = false`, John adds a caveat; he never waits on an import inside a turn.
- **Ingestion problems.** Rejected rows in a bank batch are an operator concern (ingestion dashboards), not a user message; there is no user upload to retry (D-023). John only reflects their effect through `data_quality` caveats (`complete = false`, low coverage).
- **Chat corrections.** (1) Detect intent by rules or router. (2) Find the target with `listTransactions` filtered by merchant, date and amount. (3) Several matches → one question listing candidates (date, merchant, amount from the rows). (4) For merchant scope call `dryRun` through `ActionService.createProposal` (the card shows rows affected and confirmed rows skipped). (5) Single-row + rule-detected instruction → T1 with Undo (B.9.4); merchant-wide → T2 card. (6) Report only values returned.
- **Type, link, duplicate, own-account fixes** (D-014): same flow with `SET_TRANSACTION_TYPE`, `CONFIRM_LINK`/`BREAK_LINK`, `RESOLVE_DUPLICATE` (T1) and `MARK_OWN_ACCOUNT_COUNTERPARTY` (T2).
- **Specialist hints.** `MISCATEGORIZATION_SUSPECTED` → `addReviewItem(reason: SPECIALIST_HINT)`; John may mention that the item is in the Needs-review list. John never changes a category on a hint.
- **"Why is this here?"** Answered from the stored `prediction.evidence` and `method` on the transaction, in John's words; amounts bound to the transaction fields returned by the Categorizer read (an allowed groundable source for that answer, SC §11.2 extended to `{{txn:<id>:…}}` — see C.6).

### B.11 Direct answers
| Case | Behaviour |
| --- | --- |
| Greeting, thanks, product question | Synthesis with no tools, short, no figures |
| Account health overview | Calls surplus baseline, bill forecast, cash-flow risk; synthesizes facts and predictions; adds Iris only if advice is asked |
| Health score (D-024) | Calls `sentinel_compute_health_score`; presents score, grade and the four components with what each measures; offers which specialist could help with the weakest component (no proposals) |
| Sentinel workspace "explain this chart" | Calls ledger summary for the shown window; describes it |
| Scope refusal | One sentence naming what is not supported and what John can do instead |

### B.12 Synthesis and grounding
- One `SYNTHESIS` call receives: the user message, the routing decision, the validated findings (with placeholders, not values), constraint messages (templates), data-quality caveats, question (if any), and card summaries. It never receives raw tool results beyond the placeholder catalogue (name, kind, format).
- Output: plain text with placeholders, ≤ 180 words by default (≤ 400 when the user asked for detail), headline first.
- Code binds placeholders (SC §11.1), then runs the grounding check (SC §11.3). One regenerate on violation; if it fails again, John shows a deterministic fallback composed of the headline findings' templates and the cards.
- Required content rules: label partial answers; carry every WARNING on proposals as text; conservative headline per SC §11.4; never state a figure from memory.

### B.13 Acceptance criteria
| ID | Requirement | Criterion |
| --- | --- | --- |
| JON-AC-01 | F | John has no write credentials for financial tables; a test that writes directly fails |
| JON-AC-02 | B.12 | Zero ungrounded numbers in the synthesis eval set |
| JON-AC-03 | B.3 | Routing evals on a labelled set (incl. goal vs purchase affordability, current vs recurring overspend, Sentinel-workspace questions, health-score questions) reach the agreed baseline; no routing to Sentinel/Categorizer as agents |
| JON-AC-04 | B.9.5 | A typed confirmation never executes T2/T3 |
| JON-AC-05 | B.2 | Budgets hold under load; exhaustion yields a labelled partial answer |
| JON-AC-06 | I | Each failure row in I behaves as specified under failure injection |
| JON-AC-07 | H | Injection strings in merchant names, goal names and user text cause no unauthorized tool call and no state change |
| JON-AC-08 | B.7 | Conflict cases follow B.7 in every scripted scenario |
| JON-AC-09 | SC §7.3 | After a correction or plan change, the next request uses the new versions; cached results for old versions are not served |
| JON-AC-10 | B.10 | A chat correction affecting several rows shows a card with correct affected and skipped counts |
| JON-AC-11 | G.3 | Memory facts are created only from user statements or executed actions (tested with hostile tool output) |
| JON-AC-12 | SC §16.3 | Cross-user access tests return no data |
| JON-AC-13 | B.6 #5 | A proposal whose params differ from its cited validator's params never becomes a card |
| JON-AC-14 | B.9.4 | Router-only-detected T1 instructions render a chip and never auto-execute |
| JON-AC-15 | B.1, D-007 | Opening an alert produces at most one specialist invocation per `(alert_id, snapshot_id)` within 15 min |
| JON-AC-16 | SC §16.6 | With consent false, no LLM call is made for that user |
| JON-AC-17 | B.11 | Health-score answers contain only bound figures and appear only on request |

---

## C. Data contracts

### C.1 ChatRequest@1
```json
{"$id": "ChatRequest@1", "type": "object", "additionalProperties": false,
 "required": ["message", "ui_context", "trigger"],
 "properties": {
  "thread_id": {"type": ["string", "null"], "description": "null → new thread"},
  "message": {"type": "string", "maxLength": 2000},
  "ui_context": {"$ref": "TaskPacket@1#/properties/ui_context"},
  "trigger": {"type": "object", "required": ["kind"], "properties": {"kind": {"enum": ["USER_MESSAGE", "UI_ACTION", "ALERT_OPEN"]}, "alert_id": {"type": "string"}, "prompt_id": {"type": "string"}}},
  "answer_to": {"type": "object", "properties": {"question_id": {"type": "string"}, "option_id": {"type": "string"}, "free_text": {"type": "string", "maxLength": 200}}},
  "client_message_id": {"type": "string", "description": "Idempotency for retries of the same send"}
 }}
```

### C.2 ChatResponse@1 (streamed as Server-Sent Events: `block` events then one `done`)
```json
{"$id": "ChatResponse@1", "required": ["request_id", "thread_id", "turn_id", "status", "snapshot", "blocks"],
 "properties": {
  "request_id": {"type": "string"}, "thread_id": {"type": "string"}, "turn_id": {"type": "string"},
  "status": {"enum": ["COMPLETE", "PARTIAL", "DEGRADED", "REFUSED"]},
  "snapshot": {"type": "object", "properties": {"snapshot_id": {"type": "string"}, "as_of_date": {"type": "string"}, "data_quality": {"$ref": "DataQuality@1"}}},
  "blocks": {"type": "array", "items": {"oneOf": [
    {"type": "object", "required": ["type", "text"], "properties": {"type": {"const": "TEXT"}, "text": {"type": "string"}}},
    {"type": "object", "required": ["type", "proposal_id"], "properties": {"type": {"const": "CARD"}, "proposal_id": {"type": "string"}, "card": {"type": "object", "description": "Rendered fields from params, warnings, requires_ack, tier"}}},
    {"type": "object", "required": ["type", "proposal_id", "label"], "properties": {"type": {"const": "CHIP"}, "proposal_id": {"type": "string"}, "label": {"type": "string", "maxLength": 40}}},
    {"type": "object", "required": ["type", "question"], "properties": {"type": {"const": "QUESTION"}, "question": {"$ref": "Question@1"}}},
    {"type": "object", "required": ["type", "action_id"], "properties": {"type": {"const": "UNDO"}, "action_id": {"type": "string"}, "until": {"type": "string", "format": "date-time"}}},
    {"type": "object", "required": ["type", "code"], "properties": {"type": {"const": "NOTICE"}, "code": {"enum": ["PARTIAL", "IMPORT_IN_PROGRESS", "LOW_COVERAGE", "STALE_DATA", "LIVE_FIGURES_UNAVAILABLE", "DEGRADED_MODE", "OUT_OF_SCOPE"]}, "text": {"type": "string"}}},
    {"type": "object", "required": ["type", "workspace"], "properties": {"type": {"const": "LINK"}, "workspace": {"enum": ["ATLAS", "NOVA", "IRIS", "SENTINEL"]}, "view": {"type": "string"}}}
  ]}}
 }}
```

### C.3 RouterOutput@1
```json
{"$id": "RouterOutput@1", "type": "object", "additionalProperties": false,
 "required": ["route", "specialists", "task_types", "entities", "dependencies", "needs_clarification", "reason"],
 "properties": {
  "route": {"enum": ["SPECIALISTS", "DIRECT", "CATEGORIZATION", "PROFILE_CHANGE", "OUT_OF_SCOPE", "UI_LINK"]},
  "specialists": {"type": "array", "maxItems": 3, "items": {"enum": ["ATLAS", "NOVA", "IRIS"]}},
  "task_types": {"type": "object", "additionalProperties": {"type": "string"}},
  "direct_kind": {"enum": ["GREETING", "PRODUCT_QUESTION", "HEALTH_OVERVIEW", "HEALTH_SCORE", "CHART_EXPLAIN", null]},
  "entities": {"type": "object", "properties": {
     "amounts_minor": {"type": "array", "items": {"type": "integer"}}, "dates": {"type": "array", "items": {"type": "string", "format": "date"}},
     "target_month": {"type": "string"}, "goal_names": {"type": "array", "items": {"type": "string"}},
     "category_terms": {"type": "array", "items": {"type": "string"}}, "merchant_terms": {"type": "array", "items": {"type": "string"}},
     "instruction": {"type": ["object", "null"], "description": "{action, params} when the user gave an explicit T1/T2 instruction"}}},
  "dependencies": {"type": "array", "maxItems": 1, "items": {"type": "object", "required": ["from", "to", "hint_code"], "properties": {"from": {"enum": ["NOVA", "IRIS"]}, "to": {"const": "ATLAS"}, "hint_code": {"enum": ["GOAL_FUNDING_PRESSURE", "SAVINGS_CAPACITY"]}}}},
  "needs_clarification": {"type": "boolean"},
  "clarifying_question": {"$ref": "Question@1"},
  "reason": {"type": "string", "maxLength": 200}
 }}
```
Entities are resolved to IDs by deterministic lookup (goal names → `goal_id` by case-insensitive match among non-archived goals; category terms → taxonomy IDs via a synonym table; merchant terms → `merchant_id` via the Categorizer). The router never outputs IDs.

### C.4 John's persistent stores (sole owner)
| Table | Fields | Notes |
| --- | --- | --- |
| `chat_threads` | `thread_id`, `user_id`, `tenant_id`, `workspace` (where started), `created_at`, `last_turn_at`, `pending_question_json?` | Multiple threads per user; a workspace panel opens the latest thread for that workspace or a new one |
| `chat_turns` | `turn_id`, `thread_id`, `role` (`USER`/`JOHN`), `text` (rendered, with bound values), `blocks_json`, `request_id`, `snapshot_id`, `created_at` | Values are rendered text for display; never re-used as facts |
| `rolling_summaries` | `thread_id`, `summary` (≤ 800 chars), `through_turn_id`, `updated_at` | No amounts, no account data |
| `memory_facts` | `fact_id`, `user_id`, `text` (≤ 200), `tag` (`GOAL_PRIORITY`, `PREFERENCE`, `CONTEXT`, `DECLINE_REASON`), `source` (`USER_STATEMENT`/`EXECUTED_ACTION`), `source_ref` (turn_id/action_id), `deleted_at?`, `created_at` | G.3 |
| `alert_narratives` | `(alert_id, snapshot_id)`, `response_json`, `expires_at` | 15-min cache |
| `specialist_cache` | key per SC §7.3 | 15-min cache |

### C.5 Shared contracts used
`TaskPacket@1`, `SpecialistResponse@1`, domain schemas, `PeerFinding@1`, `Question@1`, `Proposal@1`, `ActionResult@1`, `SentinelResult@1`, `DataQuality@1`, `Snapshot@1`, `Alert@1`, `ErrorBody@1` (SC).

### C.6 Additional groundable source for transaction answers
`{{txn:<txn_id>:<json-pointer>|<format>}}` binds to fields of a transaction John read from the Categorizer in this request (date, amount, merchant name). Used only in B.10 answers. Added to SC §11.2's list by this spec.

### C.7 Validation of inputs
`message` > 2,000 chars → `INVALID_INPUT`. Unknown `thread_id` (or another user's) → 404. `answer_to` for a question that is no longer pending → treated as a new message. `trigger.kind = ALERT_OPEN` with an alert not owned or not `OPEN`/`DISMISSED` → 404.

---

## D. Agent reasoning and workflow
1. **Interpretation.** Rules → router (C.3). The router classifies and extracts; it never decides validity, amounts or IDs.
2. **Decisions John owns:** route, task types, dependency edge, reconcile, which proposals survive (B.6–B.7), which question to ask, wording.
3. **Order:** status/snapshot → memory → route → resolve targets → packets → dispatch → validate → conflicts → store proposals → synthesize → stream → persist.
4. **When to call Sentinel directly:** only direct answers (B.11) and arbitration (B.7 rule 4).
5. **When to ask / refuse / report insufficient evidence:** B.8; scope refusals B.3.2; when every specialist returned `ERROR` or Sentinel is down, John says live figures are unavailable and shows no figures (I).
6. **Limits:** budgets in B.2; router 1 retry; synthesis 1 regenerate; one reconcile; one arbitration; no loops (a request never re-enters routing except to resume a pending question in a new request).
7. **Fact vs recommendation in the reply:** synthesis keeps finding kinds; predictions are introduced as forecasts with their confidence; recommendations are phrased as suggestions; facts are stated plainly.
8. **No hidden reasoning disclosure:** traces store structured decisions (route, reason ≤ 200 chars, validation outcomes), not model chain-of-thought.

---

## E. Communication and integration
| Counterpart | Direction | Interface | Mode | Timeout / retry |
| --- | --- | --- | --- | --- |
| Web app | In/out | `ChatRequest@1` → SSE `ChatResponse@1` | Async stream | 20 s request; client may resend with same `client_message_id` (idempotent) |
| ATLAS / NOVA / IRIS | Out | `invoke(TaskPacket) → SpecialistResponse` | Parallel, AbortSignal | `deadline_ms`; one retry with smaller packet |
| Tool Gateway → Sentinel | Out | `ToolCall@1` → `SentinelResult@1` | Sync | SC §15.3 |
| Categorizer | Out | `getStatus`, `listTransactions`, `getTransaction`, `addReviewItem` | Sync | 2 s; 1 retry for reads |
| Action Service | Out | `createProposal`, `executeT1`, `getProposal` | Sync | 5 s; same idempotency key on retry |
| Snapshot Service | Out | `createSnapshot` | Sync | 1 s |
| Profile Service | Out | `getPreferences` | Sync | 1 s |
| Budget Monitor | Out | `getAlert` | Sync | 1 s |
| LLM Adapter | Out | `complete` | Sync | SC §15.3 |
| Event bus | In | `categorization.updated`, `plan.changed`, `balances.updated` | Async | Drop caches for older versions |

Correlation: `request_id` per message, `trace_id` per request, `task_id` per packet; all propagate to gateway calls and proposals. Status tracking: each task has `PENDING → RUNNING → DONE|FAILED|CANCELLED` in the trace. Cancellation: user "stop" or request deadline aborts all tasks; already-stored proposals remain valid until expiry.

---

## F. Tools and permissions
- DB role `john_rw` on C.4 tables only. No access to financial tables.
- Gateway allowlist (SC §10.4, JOHN column): `sentinel_get_surplus_baseline`, `sentinel_get_ledger_summary`, `sentinel_run_spending_simulation` (arbitration only — the gateway rejects it outside a request flagged `arbitration: true`), `sentinel_forecast_bill_outlays`, `sentinel_flag_cashflow_risk`, `sentinel_compute_health_score`.
- Action Service: `createProposal` (any registry action John or a specialist may originate per SC §13.2), `executeT1` (only with an intent token from the rule layer or a user tap), `getProposal`. John cannot confirm T2/T3; only the user's tap through the Workspace API can.
- Categorizer: read API + `addReviewItem`.
- Specialists' outputs never grant permissions. John's LLM output is parsed only into `RouterOutput@1` and synthesis text; it cannot reach a write API.
- Duplicate protection: `client_message_id` per send; idempotency keys on proposals and T1 executions (`<request_id>:<action_ref>`).

---

## G. State, memory and persistence

### G.1 Working state (request-scoped)
Snapshot, data quality, routing decision, packets, responses, validation outcomes, proposals created. Discarded after the turn except what is persisted below.

### G.2 Durable state
Tables in C.4. Preferences and profile are **not** John's (Profile Service); goals, caps, balances, transactions are never copied into John's stores.

### G.3 Memory-fact rules (anti-poisoning)
- Created only from (a) the user's own words in this thread stating a durable preference or priority ("I care more about the home deposit than the vacation"), or (b) an `EXECUTED` action (e.g. "User paused Vacation goal on 2026-10-10").
- Never from specialist prose, tool output, merchant strings or transaction descriptions.
- No account numbers, no exact balances or amounts (text may not contain digit runs that denote money; dates allowed).
- A decline becomes a `DECLINE_REASON` fact only if the user said why.
- Facts are retrieved by tag for packets (`GOAL_PRIORITY` → `goal_priority_order` after ID resolution).
- The user can list and delete facts and the summary; deleted items never appear in later packets (filter `deleted_at IS NULL`).

### G.4 Rolling summary
Summarizer job runs after a turn when ≥ 6 turns since the last summary. Input: previous summary + turns; output ≤ 800 chars; must pass a check that strips digit runs denoting money and any account identifiers.

### G.5 Lifecycle and invalidation
Caches keyed by versions (SC §7.3); events drop older entries. "Apply that" follow-ups re-validate against current row versions (Action Service). Retention of turns, summaries and facts: deployment policy (open item O-2), minimum until the user deletes.

### G.6 Recovery
A crash mid-request leaves no partial turn (turn persisted at step 14 in one transaction). Stored proposals survive and expire normally. The client resends with the same `client_message_id`; John returns the stored response if step 14 completed, else re-runs.

---

## H. Security and financial correctness
- No privileged access; identity only from the session; John and specialists never see a user identifier.
- Untrusted inputs (specialist output, merchant strings, transaction descriptions, user text) are data; John never executes instructions embedded in them; the router prompt and synthesis prompt state this; validation (B.6) enforces it.
- Confirmation integrity: tokens bind user, proposal and params hash; a changed parameter invalidates the token (SC §13.4).
- Numbers only from groundable sources (SC §11.2 + C.6); conservative headline rule; caveats for provisional/uncategorized data.
- Scope refusals for real money movement, investment advice, credit, tax.
- Data minimization to the LLM provider (SC §16.5); consent gate (SC §16.6).
- Observability: full trace per request (SC §16.8); metrics: LLM invocations and tokens per request, grounding violations, dropped proposals by rule, routing corrections (user re-asks within 2 turns), latency by route, degraded-mode events.

---

## I. Errors and recovery
| Category | Failure | Detection | John's behaviour | User sees | Retryable |
| --- | --- | --- | --- | --- | --- |
| Invalid input | Message too long / malformed | Schema | Reject | Inline error | No |
| Missing data | Import in progress, low coverage | Status | Proceed with caveat | `NOTICE` | — |
| Unsupported | Out-of-scope ask | Rules/router | Refuse with alternative | `NOTICE OUT_OF_SCOPE` | No |
| Agent timeout | Specialist deadline | AbortSignal | One retry with smaller packet (recent turns 2, no peer findings); else answer from others and say what is missing | `PARTIAL` | Once |
| Agent unavailable / malformed output | Schema check | One retry with the error; then degrade as above | `PARTIAL` | Once |
| `NEEDS_INPUT` / `PARTIAL` | Status | Ask one question / show labelled partial | `QUESTION` / `PARTIAL` | — |
| Contradictory output | Constraints, B.7 | Conflict rules | Options question | — |
| Tool failure | Sentinel unavailable | Gateway error | Specialists return `ERROR`; John says live figures are unavailable and shows no figures from memory; cached results only within TTL and labelled with their age; **all proposals blocked** | `NOTICE LIVE_FIGURES_UNAVAILABLE` | Later |
| Grounding failure | Unbound number | Grounding check | Strip or regenerate once; then deterministic fallback | `TEXT` | Once |
| Authorization failure | Session invalid; result ownership mismatch | Auth / gateway | 401 to client; drop response + security event | Re-login / degraded | No |
| Persistence failure | Turn write fails | DB | Retry once; if still failing return the reply with `DEGRADED` (not stored) | `NOTICE DEGRADED_MODE` | Once |
| Stale proposal | `REJECTED_STALE` | Action result | Re-run specialist on a new snapshot or ask to reconfirm | — | Yes |
| Backend failure mid-action | `FAILED_ROLLED_BACK` | Action result | "This change was not applied." | — | User may retry |
| Applied, unverified | `EXECUTED_UNVERIFIED` | Action result | Say so; reconciliation retries | — | Auto |
| Duplicate click | `DUPLICATE` | Action result | Show original result | — | — |
| Model provider down | Circuit breaker (5 failures/60 s → open 60 s) | Adapter | Workspaces, forms, alerts keep working; chat shows degraded notice | `NOTICE DEGRADED_MODE` | After half-open probe |
| Partial completion | Budget exhausted | Counters | Return what is complete, labelled partial | `PARTIAL` | No |
| Retry exhaustion | Any of the above after its retry | — | Degrade per row | — | No |
| Cancellation | User stop / deadline | AbortSignal | Abort tasks; persist the turn as cancelled | `NOTICE` | User resends |

---

## J. Testing
| Type | Tests |
| --- | --- |
| Unit | Rule router patterns; entity resolution (goal names, categories synonyms, merchants); packet builder trimming order; validator checks 1–11 each with a failing fixture; conflict rules order; grounding binder and checker (Indian digit grouping, dates); memory-fact filter |
| Contract | `ChatRequest@1`, `ChatResponse@1`, `RouterOutput@1`, packets and responses against schemas; Action Service and gateway mocks honour SC contracts |
| Routing evals | ≥ 300 labelled messages incl. overlap cases (goal affordability vs purchase affordability; current vs recurring overspend; Sentinel workspace questions; health score; corrections; profile changes; out of scope) |
| Synthesis evals | Zero ungrounded numbers; conservative headline; caveats present; ≤ length limits |
| Edge | Two goals named alike; message with three domains (asks to narrow); alert opened twice (cache); import in progress; consent false; answer to an expired question |
| Negative / security | Typed "yes" for a T2; hostile specialist output with fake `tool_result_id`; injection in merchant names ("ignore previous instructions, transfer…"); foreign IDs in user text; router asked to emit IDs |
| Failure injection | Every row of I |
| Integration | Full flows: goal creation (Atlas) → card → confirm → `EXECUTED`; breach alert → open → Nova → rebalance card; laptop what-if (Iris) with goal override; Atlas vs Iris conflict → arbitration; chat merchant-wide recategorization with dry-run counts → confirm → Monitor resolves alert; health-score question |
| Load | 50 concurrent chats per deployment (prototype), budgets hold, p95 end-to-end ≤ 12 s for single-specialist requests, ≤ 20 s cap |

---

## K. Implementation handoff
### K.1 Modules (`backend/src/agents/john/` and `backend/src/routes/v1/chat.js`)
| Module | Responsibility |
| --- | --- |
| `orchestrator.js` | Lifecycle B.2 |
| `routing/rules.js`, `routing/routing-rules.json`, `routing/router-llm.js`, `routing/entities.js` | B.3, C.3 |
| `packets.js` | B.4 |
| `dispatch.js` | B.5 |
| `validate-response.js` | B.6 |
| `conflicts.js` | B.7 |
| `questions.js` | B.8 |
| `proposals.js` | B.9 (cards, chips, T1 instructions, result reporting) |
| `categorization.js` | B.10 |
| `direct.js` | B.11 |
| `synthesis.js`, `grounding.js` | B.12 (grounding shared with Workspace API via `shared/grounding/`) |
| `memory/*.js` | G |
| `prompts/router.v1.md`, `prompts/synthesis.v1.md`, `prompts/summarizer.v1.md`, `prompts/CHANGELOG.md` | Versioned prompts |
| `evals/` | Routing, synthesis, scenario evals |

The existing `backend/src/routes/coach.js` (direct Gemini call with `buildContext()` SQL) is replaced by these modules; its proposal-card behaviour is preserved and generalized by B.9.

### K.2 Public interface
```js
/** @param {ChatRequest} req @param {Session} session @param {(block:object)=>void} emit @returns {Promise<ChatResponse>} */
async function handleMessage(req, session, emit) {}
/** Event handler for cache invalidation */
function onVersionEvent(event) {}
```

### K.3 Configuration
`john.budget.llm_invocations=6`, `john.budget.sentinel_calls=12`, `john.budget.parallel=3`, `john.budget.reconcile_rounds=1`, `john.budget.input_tokens=60000`, `john.deadline_ms=20000`, `john.packet_token_ceiling=8000`, `john.recent_turns=6`, `john.cache_ttl_s=900`, `john.proposal_ttl_s=1800`, `john.reply_max_words=180`, `LLM_MODEL_ROUTER`, `LLM_MODEL_SYNTHESIS`, `LLM_MODEL_SUMMARIZER`, prompt versions.

### K.4 Definition of done
JON-AC-01…17 pass; routing and synthesis eval baselines recorded; failure-injection suite green; old `/api/coach/*` routes removed from the frontend.

### K.5 Must be complete before integration
Shared schemas; specialist runner; gateway with allowlist, ResultRef and ownership verification; Action Service `createProposal`/`executeT1`/tokens; Categorizer status and search; Snapshot Service; Profile Service preferences read; LLM Adapter with both providers.
