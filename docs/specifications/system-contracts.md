# FinMate AI — System Contracts (shared by all six component specifications)

| Attribute | Value |
| --- | --- |
| Document | `docs/specifications/system-contracts.md` |
| Version | 1.0.0 (requirements freeze) |
| Date | 2026-10-10 |
| Status | Authoritative. The six component specifications reference this file and must not redefine anything in it. |
| Supersedes | The shared-rule sections and action-registry tables of Atlas V4, Nova V4, Iris V4, Sentinel V4, Tally V2 and John V1 |
| Component specs | `john-orchestrator-spec.md`, `iris-spending-advisor-spec.md`, `nova-budget-guardian-spec.md`, `sentinel-financial-observer-spec.md`, `atlas-savings-strategist-spec.md`, `item-categorizer-spec.md` |

**How to read this set.** This file defines everything two or more components must agree on: identifiers, money, entities, envelopes, registries, protocols, errors, permissions, state ownership and the platform services that every component depends on. A component specification defines only what is specific to that component and cites sections here as `SC §n`.

Normative words: **MUST**, **MUST NOT**, **SHOULD**, **MAY** as in RFC 2119.

---

## 0. Contents

1. Product, users and deployment
2. Components and ownership
3. Technology baseline
4. Conventions: identifiers, money, time, enums, text
5. Shared entities (canonical data model)
6. Movement types, spend definition and taxonomy rules
7. Snapshots, versions and caching
8. Data quality
9. Agent invocation protocol (TaskPacket, SpecialistResponse)
10. Tool protocol (Tool Gateway, Sentinel envelope, result references)
11. Numeric grounding and rendering
12. Constraint code registry
13. Action registry, tiers, proposals and execution
14. Events and jobs
15. Errors, timeouts, retries and cancellation
16. Security, privacy and permissions
17. Platform services contracts (no separate spec)
18. User interface map (five options)
19. Schema versioning and compatibility
20. Decision log
21. Adopted defaults, assumptions and open items
22. Consistency verification record

---

## 1. Product, users and deployment

### 1.1 Product
FinMate AI is a personal-finance assistant that a **bank licenses and offers to its own retail customers** (B2B2C, white-labelled). It observes the customer's transactions, keeps them categorized, tracks category budgets, plans upcoming months and helps build savings goals. It explains everything in plain language through John (chat) and four workspaces.

### 1.2 Hard scope boundaries (apply to every component)
| In scope | Out of scope (MUST be declined or never implemented) |
| --- | --- |
| Observing, categorizing and analysing the customer's transactions at the deploying bank | Moving real money: transfers, payments, auto-sweeps, recurring transfer rules (tier T4) |
| Category budgets (caps), alerts, rebalancing caps | Investment advice, product or fund recommendations |
| Savings goals as **virtual earmarks** | Credit, lending or eligibility decisions |
| Forecasts and simulations with stated uncertainty | Tax advice |
| Illustrative SIP projection with a user-supplied return rate (calculation only, never advice) | Any action on behalf of the user without confirmation (§13) |

### 1.3 Users and roles
| Role | Who | Access |
| --- | --- | --- |
| `CUSTOMER` | A retail customer of the deploying bank | Own data only, through the web app |
| `BANK_INTEGRATION` | The bank's ingestion system | Ingestion Gateway only (§17.7); no user-facing API |
| `OPERATOR` | FinMate/bank support engineer | Traces, job status and configuration; **never** customer financial data in clear text except through an audited break-glass procedure (§16.8) |

One login = one individual customer. Joint accounts, family sharing and staff advisor views are out of scope for v1.

### 1.4 Deployment and tenancy (D-021)
- **One deployment per bank** (bank's cloud or VPC). Every persisted row nevertheless carries `tenant_id` (the bank's code, constant within a deployment) so that a shared deployment remains possible later without schema change.
- Environments: `prototype` (team's own dataset, own login, Qwen-class model), `production` (bank SSO, bank feed, Gemini Enterprise).
- Market: India. Currency INR only. Timezone `Asia/Kolkata`. Budget period: calendar month.

---

## 2. Components and ownership

### 2.1 Component inventory
| ComponentId | Name | Kind | Specification |
| --- | --- | --- | --- |
| `JOHN` | John — Main Orchestrator and Chatbot | LLM router + synthesis inside deterministic orchestration code | `john-orchestrator-spec.md` |
| `IRIS` | Iris — Spending Advisor | Stateless LLM specialist | `iris-spending-advisor-spec.md` |
| `NOVA` | Nova — Budget Guardian | Stateless LLM specialist | `nova-budget-guardian-spec.md` |
| `ATLAS` | Atlas — Savings Strategist | Stateless LLM specialist | `atlas-savings-strategist-spec.md` |
| `SENTINEL` | Sentinel — Financial Observer and Predictor | Deterministic mathematical and statistical model. **No LLM, no persona.** Its user-facing surface is the Sentinel workspace, rendered by code. | `sentinel-financial-observer-spec.md` |
| `CATEGORIZER` | Item Categorizer (working name *Tally*) | Deterministic-first background pipeline. Not conversational, no workspace. | `item-categorizer-spec.md` |
| `ACTION_SERVICE` | Action Service (incl. Plan Store, proposals, action ledger) | Deterministic backend | §17.1 |
| `TOOL_GATEWAY` | Tool Gateway | Deterministic backend | §17.2 |
| `SNAPSHOT_SERVICE` | Snapshot Service | Deterministic backend | §17.3 |
| `WORKSPACE_API` | Workspace API (all HTTP endpoints used by the web app) | Deterministic backend | §17.4 |
| `BUDGET_MONITOR` | Budget Monitor job and alert store (was "Nova's threshold job") | Deterministic backend job | §17.5 |
| `PROFILE_SERVICE` | Profile, accounts, balances, preferences, declared bills | Deterministic backend | §17.6 |
| `INGESTION_GATEWAY` | Bank feed intake and format adapters | Deterministic backend | §17.7 |
| `LLM_ADAPTER` | Provider-neutral LLM client | Library | §17.8 |
| `EVENT_BUS` | Transactional outbox + database-backed job runner | Library + worker | §14 |

### 2.2 Who decides what
| Decision | Owner | Never decided by |
| --- | --- | --- |
| Which specialists to involve, what context they get, how conflicts resolve, final wording | JOHN | Specialists, Sentinel |
| Goal advice and goal proposals | ATLAS (IRIS may propose goals from a plan) | JOHN's LLM, NOVA |
| Budget-cap advice, rebalance proposals, alert narratives | NOVA (IRIS may propose caps from a plan) | ATLAS |
| Forward plans, purchase what-ifs, bill outlook, overspend diagnosis | IRIS | NOVA, ATLAS |
| Every number shown to a user | SENTINEL (plus the other groundable sources in §11.2) | Any LLM |
| Transaction type, category, merchant, links | CATEGORIZER (system), or the user via a confirmed action | Any LLM, SENTINEL |
| Whether a state change is valid, authorized and executed | ACTION_SERVICE using the shared rule library | Any LLM, including a specialist "approving" it |
| Whether a budget tier changed and an alert exists | BUDGET_MONITOR | NOVA |
| Whether the user consents | The user, by a UI gesture (§13.3) | Typed chat text for T2/T3 |

### 2.3 Persistent-state ownership (single writer per store)
"Writer" = the only module allowed to issue INSERT/UPDATE/DELETE on the store. All other components read through the listed path.

| Store | Single writer | Write trigger | Readers and path |
| --- | --- | --- | --- |
| `raw_transactions` (immutable) | CATEGORIZER | Ingestion batch, manual-entry action | SENTINEL via `categorized_as_of`; WORKSPACE_API via Categorizer API |
| `txn_classification`, `txn_classification_history`, `txn_links`, `classification_events`, `review_items`, `user_categorization_state`, `user_category_rules`, `merchant_aliases (USER)` | CATEGORIZER | Pipeline; user actions executed via ACTION_SERVICE | SENTINEL (read-only role), JOHN (status, search), WORKSPACE_API |
| `merchants`, `merchant_aliases (GLOBAL)`, `global_rules`, `categories`, `taxonomy_versions`, `category_migrations` | CATEGORIZER maintainers (release process) | Reviewed release | All (read-only) |
| `accounts`, `account_balances` (+history) | PROFILE_SERVICE | Ingestion (bank master data, balances) | SENTINEL via snapshot, WORKSPACE_API |
| `profiles`, `fixed_expense_lines`, `preferences`, `declared_bills` (+history) | PROFILE_SERVICE | ACTION_SERVICE executor calls | SENTINEL via snapshot, JOHN (preferences for packets), WORKSPACE_API |
| `goals`, `goal_month_overrides`, `caps`, `cap_month_overrides` (+history) | ACTION_SERVICE (Plan Store module) | Executed actions, SYSTEM actions | SENTINEL via snapshot, WORKSPACE_API, BUDGET_MONITOR |
| `proposals`, `action_ledger`, `undo_records`, `intent_tokens`, `confirmation_tokens` | ACTION_SERVICE | Proposal creation, confirmation, execution | JOHN, WORKSPACE_API |
| `alerts` | BUDGET_MONITOR | Monitor runs; DISMISS/CREATE executed via ACTION_SERVICE calling the monitor's alert API | JOHN, WORKSPACE_API |
| `snapshots` | SNAPSHOT_SERVICE | Snapshot creation | All backend components |
| `chat_threads`, `chat_turns`, `rolling_summaries`, `memory_facts` | JOHN | Chat turns, summarizer job, explicit user statements, executed actions | JOHN only (user may view/delete via WORKSPACE_API → JOHN memory API) |
| `tool_result_cache` | TOOL_GATEWAY | Each Sentinel call | Gateway, JOHN's validator |
| `traces` | Each component appends its own spans | Every request | OPERATOR (role-restricted) |
| `event_outbox`, `jobs` | Each writer appends in its own DB transaction; EVENT_BUS marks delivery | Every committed change | Subscribers listed in §14 |

**No component keeps its own copy of an authoritative financial record.** Specialists are stateless; John's memory stores user statements and executed-action summaries, never balances, transactions or computed figures (§16.5).

---

## 3. Technology baseline (preserves the existing repository)

| Layer | Prototype (now) | Production | Notes |
| --- | --- | --- | --- |
| Frontend | React 19 + Vite 8 + Recharts (existing `src/`) | Same, white-labelled per bank | Existing views map to the five options in §18 |
| Backend | Node.js ≥ 22.5, Express 4, CommonJS (existing `backend/`) | Same | New code under `backend/src/` as laid out in each spec's §K |
| Database | SQLite via built-in `node:sqlite` (existing `db.js`) | PostgreSQL 16 with row-level security | All SQL goes through repository modules so the switch is a driver change. Money columns are `INTEGER` (SQLite) / `BIGINT` (Postgres). |
| Jobs and events | Database-backed `jobs` + `event_outbox` tables, in-process worker | Same, separate worker process | No message broker (Tally V2 decision retained) |
| LLM | Qwen 32B-class model through an OpenAI-compatible API key (`LLM_PROVIDER=openai_compat`) | Gemini Enterprise for financial services (`LLM_PROVIDER=gemini_vertex`) | All calls go through `LLM_ADAPTER` (§17.8). The existing direct Gemini call in `routes/coach.js` is replaced. |
| Schema validation | JSON Schema 2020-12 with Ajv 8 | Same | Schemas live in `backend/src/shared/contracts/schemas/` |
| Decimal maths | `decimal.js` for any non-integer intermediate (rates, ratios) | Same | §4.2 |
| Tests | Node built-in test runner (`node --test`) | Same | No test framework exists yet; this keeps zero extra runtime |
| Auth | Existing email + bcrypt + JWT (`middleware/auth.js`) | Bank OIDC SSO → FinMate session JWT (D-022) | §16.2 |

The existing tables `goals`, `budget_categories`, `transactions`, `upcoming_bills` and `users` use `REAL` rupee amounts and free-text categories. They are **superseded** by the entities in §5; a one-time migration converts rupees to paise (`ROUND(amount*100)`) and maps old category strings to taxonomy IDs (mapping table in `item-categorizer-spec.md` §C.9).

---

## 4. Conventions

### 4.1 Identifiers
- Format: `<prefix>_<ULID>` (ULID = 26 Crockford base-32 characters). Regex: `^[a-z]{2,5}_[0-9A-HJKMNP-TV-Z]{26}$`.
- Generated by the owning store's writer. Never supplied by an LLM except when echoing an ID it received in its task packet or a tool result; the Tool Gateway and John's validator reject unknown IDs (§16.4).

| Prefix | Entity | Prefix | Entity |
| --- | --- | --- | --- |
| `usr` | user | `ten` | tenant (bank) — also a short code `tenant_code` |
| `acc` | account | `bal` | balance record |
| `txn` | transaction | `imp` | ingestion batch |
| `mer` | merchant | `rul` | user category rule |
| `rev` | review item | `g` | goal (`g_` + ULID) |
| `cap` | budget cap | `ovr` | month override (cap or goal) |
| `bil` | declared bill | `alr` | alert |
| `prp` | proposal | `act` | executed action (ledger entry) |
| `snap` | snapshot | `trs` | tool result (Sentinel result) |
| `req` | user request (one chat turn or UI call) | `trc` | trace |
| `tsk` | specialist task (one packet) | `evt` | event |
| `thr` | chat thread | `trn` | chat turn |
| `mf` | memory fact | `itk` / `cnf` | intent token / confirmation token |

### 4.2 Money and numbers
- Amounts are **integer paise** in fields suffixed `_minor` (`amount_minor: 1250000` = ₹12,500.00). Type: JSON integer, `minimum` as stated per field, maximum `9007199254740991`.
- Every amount travels with `currency` (ISO 4217). Only `"INR"` is valid in v1; any other value → `INVALID_INPUT`.
- Amounts are **unsigned**; direction is carried by `direction: DEBIT | CREDIT` on transactions, or by the field's name (`shortfall_minor`, `headroom_minor`). Fields that can be negative say so and use the suffix `_signed_minor` (e.g. `remaining_signed_minor`).
- Ratios and percentages are integers in **basis points** with suffix `_bp` (`utilization_bp: 9200` = 92.00%).
- Rates are basis points per year (`annual_rate_bp`).
- Non-integer intermediates (division, compounding, medians of even sets) use `decimal.js` with precision 34; final money values round **half-even** to whole paise; final ratios round half-even to whole basis points. Floating-point `Number` arithmetic on money is a defect.
- Counts are non-negative integers with suffix `_count`.

### 4.3 Time
- Timestamps: RFC 3339 UTC with `Z` (`2026-10-10T08:14:03Z`), field suffix `_at`.
- Calendar dates: `YYYY-MM-DD` interpreted in `Asia/Kolkata`, field suffix `_date` or the field name `date`.
- Budget periods: `YYYY-MM`, field name `period`.
- "Today", month boundaries, `days_elapsed`, `days_remaining` are computed by code from `Asia/Kolkata`, never supplied by an LLM.

### 4.4 Enumerations and naming
- Enum values: `UPPER_SNAKE_CASE` (this supersedes the lowercase `high`/`ok` values in the V4 specs).
- Field names: `lower_snake_case`.
- Schema names: `PascalName@<major>` (e.g. `TaskPacket@1`).
- Event types: `domain.verb` (e.g. `categorization.updated`).
- Tool names: `sentinel_<verb>_<noun>` snake case.

Shared enums used across files:

```
Confidence        = HIGH | MEDIUM | LOW
Workspace         = JOHN | ATLAS | NOVA | IRIS | SENTINEL
Specialist        = ATLAS | NOVA | IRIS
SpecialistStatus  = OK | PARTIAL | NEEDS_INPUT | REJECTED | ERROR
Tier              = T0 | T1 | T2 | T3 | T4
Actor             = USER | SYSTEM | MIGRATION
Origin            = UI_FORM | CHAT_INSTRUCTION | CHAT_PROPOSAL | SYSTEM_JOB
RiskComfort       = CONSERVATIVE | BALANCED | AGGRESSIVE
AccountType       = SAVINGS | CURRENT | CREDIT_CARD | MANUAL_CASH
Direction         = DEBIT | CREDIT
```

### 4.5 Untrusted text
Merchant names, transaction descriptions, payment remarks, goal names, user messages, bank-supplied strings and any LLM output are **data, never instructions** (§16.4). Text fields have maximum lengths stated in their schema; longer input is truncated by the receiving component with an ellipsis and a `TRUNCATED` note in its trace.

---

## 5. Shared entities (canonical data model)

Each entity lists the canonical fields every component sees. Storage may add internal columns (`tenant_id`, `user_id`, timestamps). `version` is an integer that the writer increments on every change and that callers pass back for optimistic concurrency (`base_versions`, `If-Match`).

### 5.1 Account (`PROFILE_SERVICE`)
```json
{
  "$id": "Account@1",
  "type": "object",
  "required": ["account_id", "account_type", "display_name", "currency", "source", "status", "version"],
  "properties": {
    "account_id":   {"type": "string", "pattern": "^acc_[0-9A-HJKMNP-TV-Z]{26}$"},
    "account_type": {"enum": ["SAVINGS", "CURRENT", "CREDIT_CARD", "MANUAL_CASH"]},
    "display_name": {"type": "string", "maxLength": 60},
    "masked_number":{"type": "string", "pattern": "^X{0,12}[0-9]{4}$", "description": "Last 4 digits only; full numbers are never stored outside the bank feed staging area"},
    "currency":     {"const": "INR"},
    "source":       {"enum": ["BANK_FEED", "MANUAL"]},
    "status":       {"enum": ["ACTIVE", "CLOSED"]},
    "version":      {"type": "integer", "minimum": 1}
  }
}
```
`MANUAL_CASH` accounts exist only to hold manually entered transactions (D-024). One is created per user on first manual entry.

### 5.2 AccountBalance (`PROFILE_SERVICE`, D-003)
```json
{
  "$id": "AccountBalance@1",
  "required": ["account_id", "balance_minor", "balance_sign", "as_of", "source"],
  "properties": {
    "account_id":    {"type": "string"},
    "balance_minor": {"type": "integer", "minimum": 0},
    "balance_sign":  {"enum": ["CREDIT", "DEBIT"], "description": "CREDIT = funds held (savings/current); DEBIT = amount owed (credit card outstanding, overdraft)"},
    "as_of":         {"type": "string", "format": "date-time"},
    "source":        {"enum": ["BANK_CLOSING_BALANCE", "BANK_AVAILABLE_BALANCE", "DERIVED_FROM_LAST_TRANSACTION", "MANUAL"]}
  }
}
```
Precedence when several exist for one account: `BANK_AVAILABLE_BALANCE` > `BANK_CLOSING_BALANCE` > `DERIVED_FROM_LAST_TRANSACTION` (from `balance_after_minor`), newest `as_of` first. `MANUAL` is used only for `MANUAL_CASH` accounts and is never included in spendable balance.

**Spendable balance** (used by available-balance and cash-flow risk) = Σ CREDIT balances of `SAVINGS` and `CURRENT` accounts − Σ DEBIT balances of `CREDIT_CARD` accounts (card outstanding treated as a liability). A balance older than `balance.stale_after_hours` (registry, default 48) makes dependent results `confidence ≤ MEDIUM` and adds constraint `STALE_BALANCE`. No balance at all → dependent functions return `INSUFFICIENT_HISTORY` and ADD_FUNDS is rejected with `BALANCE_UNKNOWN`.

### 5.3 Transaction (read model, `CATEGORIZER`)
The canonical read model that Sentinel and the Workspace API consume. Full storage schema: `item-categorizer-spec.md` §C.

```json
{
  "$id": "Transaction@1",
  "required": ["txn_id", "account_id", "date", "direction", "amount_minor", "currency", "source", "posting_status", "type", "effective_status", "categorization_version", "taxonomy_version"],
  "properties": {
    "txn_id":            {"type": "string"},
    "account_id":        {"type": "string"},
    "date":              {"type": "string", "format": "date", "description": "Value date if supplied, else booking date"},
    "direction":         {"enum": ["DEBIT", "CREDIT"]},
    "amount_minor":      {"type": "integer", "minimum": 1},
    "currency":          {"const": "INR"},
    "source":            {"enum": ["BANK_FEED", "MANUAL"]},
    "posting_status":    {"enum": ["PENDING", "POSTED"]},
    "type":              {"$ref": "#/$defs/MovementType"},
    "effective_category_id": {"type": ["string", "null"], "description": "Leaf taxonomy ID (§6.3); null when none"},
    "effective_status":  {"enum": ["CONFIRMED", "AUTO", "NEEDS_REVIEW", "UNCATEGORIZED", "NOT_APPLICABLE"]},
    "provisional":       {"type": "boolean", "description": "true when effective_status = NEEDS_REVIEW or posting_status = PENDING"},
    "merchant_id":       {"type": ["string", "null"]},
    "merchant_name":     {"type": ["string", "null"], "maxLength": 40, "description": "Sanitized; present only when merchant_id is present"},
    "links":             {"type": "array", "items": {"$ref": "#/$defs/Link"}},
    "counterpart_missing": {"type": "boolean"},
    "categorization_version": {"type": "integer"},
    "taxonomy_version":  {"type": "integer"}
  },
  "$defs": {
    "MovementType": {"enum": ["EXPENSE", "INCOME", "TRANSFER_INTERNAL", "TRANSFER_EXTERNAL", "CARD_PAYMENT", "REFUND", "REVERSAL", "CHARGEBACK", "CASH_WITHDRAWAL", "FEE", "INTEREST", "LOAN_REPAYMENT", "UNKNOWN"]},
    "Link": {"type": "object", "required": ["kind", "txn_id"], "properties": {"kind": {"enum": ["TRANSFER_PAIR", "CARD_PAYMENT_PAIR", "REFUND_OF", "DUPLICATE_OF", "SUPERSEDES"]}, "txn_id": {"type": "string"}}}
  }
}
```
`SUPERSEDES` links a bank-feed row to the manual entry or pending row it replaces (§6.2).

### 5.4 Profile and fixed expenses (`PROFILE_SERVICE`, D-006, D-017)
```json
{
  "$id": "Profile@1",
  "required": ["declared_income_minor", "fixed_expense_lines", "version"],
  "properties": {
    "declared_income_minor": {"type": ["integer", "null"], "minimum": 0, "description": "Monthly net income declared by the user; null = not declared → Sentinel derives OBSERVED income"},
    "fixed_expense_lines": {
      "type": "array", "maxItems": 20,
      "items": {
        "type": "object",
        "required": ["line_id", "label", "category_id", "amount_minor"],
        "properties": {
          "line_id":     {"type": "string", "pattern": "^fxl_[0-9A-HJKMNP-TV-Z]{26}$"},
          "label":       {"type": "string", "maxLength": 40},
          "category_id": {"type": "string", "description": "Leaf category ID. Must be unique across lines. That category becomes FIXED (§6.4)."},
          "amount_minor":{"type": "integer", "minimum": 1}
        }
      }
    },
    "version": {"type": "integer", "minimum": 1}
  }
}
```

### 5.5 Preferences (`PROFILE_SERVICE`)
```json
{
  "$id": "Preferences@1",
  "required": ["risk_comfort", "protected_category_ids", "language", "llm_processing_consent", "version"],
  "properties": {
    "risk_comfort":           {"enum": ["CONSERVATIVE", "BALANCED", "AGGRESSIVE"], "default": "BALANCED"},
    "protected_category_ids": {"type": "array", "items": {"type": "string"}, "maxItems": 30, "description": "Taxonomy IDs (parent or leaf). A parent protects all its leaves."},
    "language":               {"enum": ["en-IN"], "default": "en-IN"},
    "llm_processing_consent": {"type": "boolean", "description": "false → John chat and specialists are disabled; workspaces still work (§16.6)"},
    "version":                {"type": "integer", "minimum": 1}
  }
}
```
Effect of `risk_comfort` (deterministic, applied by Sentinel and by John's synthesis rules): `CONSERVATIVE` → conservative figures are always the headline, regardless of confidence; `BALANCED` and `AGGRESSIVE` → conservative figure leads only when confidence ≠ `HIGH` (shared rule §11.4). `AGGRESSIVE` never removes a MANDATORY constraint or a safety buffer.

### 5.6 Goal (`ACTION_SERVICE` Plan Store, D-004, D-018)
```json
{
  "$id": "Goal@1",
  "required": ["goal_id", "name", "target_minor", "saved_minor", "monthly_add_minor", "priority_tier", "status", "currency", "version"],
  "properties": {
    "goal_id":           {"type": "string", "pattern": "^g_[0-9A-HJKMNP-TV-Z]{26}$"},
    "name":              {"type": "string", "minLength": 1, "maxLength": 40},
    "target_minor":      {"type": "integer", "minimum": 1},
    "saved_minor":       {"type": "integer", "minimum": 0, "description": "Sum of earmarks. Changes only through ADD_FUNDS / RELEASE_FUNDS / DELETE_GOAL (release)."},
    "monthly_add_minor": {"type": "integer", "minimum": 0, "description": "Planned monthly earmark. A plan, not an automatic movement."},
    "deadline":          {"type": ["string", "null"], "format": "date"},
    "priority_tier":     {"enum": ["HIGH", "MEDIUM", "LOW"]},
    "status":            {"enum": ["ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"]},
    "archived_at":       {"type": ["string", "null"], "format": "date-time"},
    "restore_until":     {"type": ["string", "null"], "format": "date-time"},
    "currency":          {"const": "INR"},
    "version":           {"type": "integer", "minimum": 1}
  }
}
```
**Goal state machine (D-018).**

| From | Event | To | Rule |
| --- | --- | --- | --- |
| — | `CREATE_GOAL` executed | `ACTIVE` | |
| `ACTIVE` | `SET_GOAL_STATUS{PAUSED}` | `PAUSED` | Monthly add ignored in feasibility and surplus while paused |
| `PAUSED` | `SET_GOAL_STATUS{ACTIVE}` | `ACTIVE` | Re-validated (GOAL_LIMIT, NAME_INVALID) |
| `ACTIVE` | `ADD_FUNDS` makes `saved_minor == target_minor` | `COMPLETED` | Automatic, same transaction |
| `COMPLETED` | `RELEASE_FUNDS` or `UPDATE_GOAL` raising target | `ACTIVE` | |
| `ACTIVE`/`PAUSED`/`COMPLETED` | `DELETE_GOAL` executed | `ARCHIVED` | Soft delete; `saved_minor` is released to available balance (recorded in ledger); `restore_until = archived_at + 30 days` |
| `ARCHIVED` | `RESTORE_GOAL` before `restore_until` | prior status | Earmark is **not** restored automatically; user re-adds funds |
| `ARCHIVED` | `restore_until` passes | `ARCHIVED` (permanent) | Row kept for audit; no restore |

Name uniqueness and `GOAL_LIMIT` count goals in `ACTIVE`, `PAUSED` and `COMPLETED`.

**GoalMonthOverride@1** (D-019): `{override_id, goal_id, period, monthly_add_minor, version}` — replaces `monthly_add_minor` for one period only (a temporary reduction or pause). Expires at period end.

**Effective monthly add** for period P = override for P if present, else `monthly_add_minor` if status `ACTIVE`, else 0.

**Actual contribution** for period P = Σ `ADD_FUNDS.amount_minor` executed for that goal with execution date in P − Σ `RELEASE_FUNDS` in P (floor 0).

### 5.7 Cap (`ACTION_SERVICE` Plan Store, D-005, D-011)
```json
{
  "$id": "Cap@1",
  "required": ["cap_id", "category_id", "amount_minor", "status", "version"],
  "properties": {
    "cap_id":       {"type": "string", "pattern": "^cap_[0-9A-HJKMNP-TV-Z]{26}$"},
    "category_id":  {"type": "string", "description": "Taxonomy ID, parent or leaf; unique among ACTIVE caps"},
    "amount_minor": {"type": "integer", "minimum": 0, "description": "Standing monthly amount, repeats every period"},
    "status":       {"enum": ["ACTIVE", "REMOVED"]},
    "version":      {"type": "integer", "minimum": 1}
  }
}
```
**CapMonthOverride@1**: `{override_id, cap_id, period, amount_minor, origin: "REBALANCE"|"USER_EDIT"|"PLAN", version}` — replaces the standing amount for one period. A rebalance always writes overrides for the current period. A cap edit asks "this month only" (override) or "from now on" (standing). Iris's next-month plan writes overrides for its `target_month`. Overrides expire at period end and are never carried forward.

**Effective cap** for period P = override for P if present, else standing amount.

**Hierarchy (D-011, preserves Nova V4).** Caps partition spend exclusively: a cap on a parent category covers spend in every leaf of that parent **that has no ACTIVE cap of its own and is not FIXED** (§6.4). A leaf with its own cap is counted only against the leaf cap. Therefore Σ effective caps never double-counts spend.

**Cappable categories.** Every expense category (all parents and leaves except `INCOME` and its leaves), including `TRANSFERS.PERSONAL_PAYMENT` and `CASH.ATM_WITHDRAWAL`, **minus** the FIXED categories (§6.4): a fixed line on a leaf makes that leaf FIXED; a fixed line on a parent makes the parent and all its leaves FIXED. A cap on a parent whose leaves are partly FIXED is allowed and covers only its non-FIXED leaves. Violations → `CATEGORY_NOT_CAPPABLE`.

### 5.8 DeclaredBill (`PROFILE_SERVICE`, D-024)
```json
{
  "$id": "DeclaredBill@1",
  "required": ["bill_id", "label", "amount_minor", "due_date", "recurrence", "status", "version"],
  "properties": {
    "bill_id":      {"type": "string"},
    "label":        {"type": "string", "maxLength": 40},
    "category_id":  {"type": ["string", "null"]},
    "amount_minor": {"type": "integer", "minimum": 1},
    "due_date":     {"type": "string", "format": "date", "description": "Next due date"},
    "recurrence":   {"enum": ["NONE", "MONTHLY", "QUARTERLY", "YEARLY"]},
    "status":       {"enum": ["ACTIVE", "PAID", "CANCELLED"]},
    "version":      {"type": "integer", "minimum": 1}
  }
}
```
Declared bills feed Sentinel's bill forecast (merged with detected recurring bills, declared wins on overlap; `sentinel-financial-observer-spec.md` §B.6.12).

### 5.9 Alert (`BUDGET_MONITOR`, D-007)
```json
{
  "$id": "Alert@1",
  "required": ["alert_id", "kind", "state", "severity", "subject", "created_at", "snapshot_id", "provisional"],
  "properties": {
    "alert_id":   {"type": "string"},
    "kind":       {"enum": ["CAP_TIER", "ANOMALY", "CASHFLOW_RISK", "WATCH"]},
    "state":      {"enum": ["OPEN", "DISMISSED", "RESOLVED"]},
    "severity":   {"enum": ["WARNING", "EXCEEDED", "HIGH", "MEDIUM", "LOW", "INFO"]},
    "subject":    {"type": "object", "properties": {"category_id": {"type": "string"}, "merchant_id": {"type": "string"}, "period": {"type": "string"}, "anomaly_type": {"enum": ["DUPLICATE_SWIPE", "SPIKE", "PRICE_CREEP"]}}},
    "tier":       {"enum": ["HEALTHY", "WARNING", "EXCEEDED"], "description": "CAP_TIER only"},
    "provisional":{"type": "boolean"},
    "snapshot_id":{"type": "string", "description": "Snapshot the detection ran on"},
    "evidence_tool_result_id": {"type": "string"},
    "cause":      {"enum": ["SPEND", "CATEGORY_CHANGE", "CAP_CHANGE", "PERIOD_ROLLOVER", "SCAN"]},
    "created_at": {"type": "string", "format": "date-time"},
    "resolved_at":{"type": ["string", "null"], "format": "date-time"},
    "narrative":  {"type": ["object", "null"], "description": "Cached specialist explanation (JOHN-rendered) keyed by snapshot; never authoritative"}
  }
}
```
Rules: one `OPEN` `CAP_TIER` alert per (category, period); re-alert only on a worse tier; a `DISMISSED` alert stays dismissed until a worse tier; period rollover resolves all `CAP_TIER` alerts of the closed period (`cause: PERIOD_ROLLOVER`). `WATCH` alerts are created by the user through `CREATE_ALERT` (keep an anomaly visible) and are resolved only by `DISMISS_ALERT`.

### 5.10 Proposal and action ledger (`ACTION_SERVICE`)
See §13.

### 5.11 Snapshot (`SNAPSHOT_SERVICE`)
See §7.

### 5.12 Memory fact (`JOHN`)
`{fact_id, text (≤ 200 chars, no digits that denote money), tag, source: "USER_STATEMENT"|"EXECUTED_ACTION", source_ref, created_at}` — details in `john-orchestrator-spec.md` §G.

---

## 6. Movement types, spend definition and taxonomy rules

This section is the **single definition** used by CATEGORIZER (to type and categorize) and SENTINEL (to compute). Changing it requires changing both component specs in the same release and bumping `model_version` and `pipeline_version`.

### 6.1 Movement types
| Type | Meaning | Carries a category? | Counts as spend? | Counts as income? |
| --- | --- | --- | --- | --- |
| `EXPENSE` | Purchase or payment for goods/services | Expense category | Yes | No |
| `FEE` | Bank charges, late fees | `FEES.*` | Yes | No |
| `CASH_WITHDRAWAL` | ATM/cash | `CASH.ATM_WITHDRAWAL` (flagged untracked) | Yes | No |
| `LOAN_REPAYMENT` | EMI | `FINANCE.LOAN_EMI` | Yes | No |
| `TRANSFER_EXTERNAL` | Debit to another person | `TRANSFERS.PERSONAL_PAYMENT` by default | Yes (debit only) | Credit side → typed `INCOME` |
| `INTEREST` | **Debit** interest charged | `FINANCE.INTEREST` | Yes | No |
| `INCOME` | Salary, business, credit interest, gifts, other credits that are not refunds or transfers | `INCOME.*` leaf (optional) | No | Yes |
| `TRANSFER_INTERNAL` | Between two of the user's own accounts (matched pair, or counterparty marked as own account) | None (`NOT_APPLICABLE`) | No | No |
| `CARD_PAYMENT` | Payment towards the user's own credit card | None | No when the card account is present; **provisional bucket** `CARD_PAYMENT_UNMATCHED` when `counterpart_missing` | No |
| `REFUND` | Merchant refund | None; nets against original (§6.2) | Negative (netting) when linked | Never |
| `REVERSAL` | Failed/reversed debit credited back | None; nets against original | Negative (netting) when linked | Never |
| `CHARGEBACK` | Disputed charge credited back | None; nets against original | Negative (netting) when linked | Never |
| `UNKNOWN` | Typing ambiguous | None | No; reported in `unclassified_movement_amount_minor` | No |

Credit interest is typed `INCOME` with leaf `INCOME.INTEREST_RECEIVED` (D-013). Type `INTEREST` is debit-only.

### 6.2 Spend definition (D-013, D-015, D-024)
For a category set C and a period P (calendar month in `Asia/Kolkata`):

```
spend(C, P) =   Σ amount_minor of rows r where
                  r.type ∈ {EXPENSE, FEE, CASH_WITHDRAWAL, LOAN_REPAYMENT, INTEREST}
                  or (r.type = TRANSFER_EXTERNAL and r.direction = DEBIT)
                  and r.effective_category_id ∈ C
                  and r.date ∈ P
                  and r is not excluded (below)
              − Σ amount_minor of rows c where
                  c.type ∈ {REFUND, REVERSAL, CHARGEBACK}
                  and c has link REFUND_OF → original o with o.effective_category_id ∈ C
                  and c.date ∈ P            ← netting happens in the month the credit posts
```
Excluded rows: rows with a `DUPLICATE_OF` link (the duplicate side), rows superseded by a `SUPERSEDES` link (manual entries and pending rows replaced by a posted bank row), rows whose `effective_status = UNCATEGORIZED` (they count in the uncategorized bucket, never in a category).

- Category spend may go below zero in a month with large refunds; utilization floors at 0 for tiering, the signed value is reported as `spent_signed_minor`.
- `PENDING` rows count in `spent_provisional_minor` together with `NEEDS_REVIEW` rows (D-015).
- Unmatched refunds/reversals/chargebacks (no `REFUND_OF`) are reported separately as `unmatched_credits_minor`; never income, never netted.
- **Total spend** for P = spend over all categories + uncategorized bucket + `CARD_PAYMENT_UNMATCHED` bucket.
- `settled` = rows with `effective_status ∈ {CONFIRMED, AUTO}` and `posting_status = POSTED`.

### 6.3 Taxonomy rules
- Two levels. IDs are `PARENT` or `PARENT.LEAF` (e.g. `FOOD`, `FOOD.DELIVERY`). The full version-1 list is in `item-categorizer-spec.md` §C.6.
- **A transaction's category is always a single leaf ID** (`effective_category_id`), or null. The parent is derived (`split('.')[0]`). Caps, protected categories and fixed-expense lines may reference a parent or a leaf.
- `UNCATEGORIZED` is a **status**, never a category ID. `OTHER.UNCLASSIFIED` is a real leaf that a user may choose.
- IDs are never deleted or reused. Renames change labels only. Merges and splits go through migration entries; caps, protected categories and fixed-expense lines follow the migration map via the SYSTEM action `APPLY_TAXONOMY_MIGRATION` (§13.6).
- Only CATEGORIZER assigns categories. Specialists and Sentinel never infer, guess or modify a category. A specialist that suspects an error emits the peer hint `MISCATEGORIZATION_SUSPECTED` (§9.6).

### 6.4 Fixed and discretionary categories (D-006)
A category referenced by a fixed-expense line is **FIXED** for that user. FIXED categories cannot carry caps (`CATEGORY_NOT_CAPPABLE`). All other expense categories are **DISCRETIONARY**.

**The one budget equation** (used by surplus, feasibility, spendable-income warnings and the health score):
```
income                 = declared_income_minor, else OBSERVED trailing median of monthly INCOME (§ Sentinel B.6.1)
fixed_total            = Σ fixed_expense_lines.amount_minor
goal_commitments(P)    = Σ effective monthly add (P) over goals
caps_total(P)          = Σ effective caps (P) over ACTIVE caps
net_surplus            = income − fixed_total
unallocated_surplus(P) = net_surplus − goal_commitments(P) − caps_total(P)
```
Caps count against goal capacity (S1 = yes). Simulations use declared amounts for FIXED categories and observed history for DISCRETIONARY categories, so the surplus model and the simulation model agree by construction.

---

## 7. Snapshots, versions and caching

### 7.1 Version counters (per user)
| Counter | Incremented by | Meaning |
| --- | --- | --- |
| `categorization_version` | CATEGORIZER on every commit that changes any effective result (chunk commits each increment) | State of types, categories, links |
| `plan_version` | ACTION_SERVICE / PROFILE_SERVICE on every committed change to goals, caps, overrides, profile, preferences, declared bills | State of the user's plan |
| `balance_version` | PROFILE_SERVICE on every balance ingestion | State of balances |
| `taxonomy_version` | Taxonomy release (global) | Category list |
| `model_version` | Sentinel parameter-registry release (global) | Formulas and parameters |

All plan, profile and balance stores keep **temporal history** rows `(…, valid_from_version, valid_to_version)` keyed by the relevant counter, exactly like `txn_classification_history`. This is how a snapshot pins mutable state (X-14).

### 7.2 Snapshot@1
```json
{
  "$id": "Snapshot@1",
  "required": ["snapshot_id", "created_at", "as_of_date", "categorization_version", "plan_version", "balance_version", "taxonomy_version", "model_version", "reason"],
  "properties": {
    "snapshot_id": {"type": "string"},
    "created_at": {"type": "string", "format": "date-time"},
    "as_of_date": {"type": "string", "format": "date", "description": "'Today' in Asia/Kolkata for every computation on this snapshot"},
    "categorization_version": {"type": "integer"},
    "plan_version": {"type": "integer"},
    "balance_version": {"type": "integer"},
    "taxonomy_version": {"type": "integer"},
    "model_version": {"type": "string"},
    "reason": {"enum": ["CHAT_REQUEST", "WORKSPACE_VIEW", "MONITOR_RUN", "ACTION_VALIDATION", "ALERT_OPEN"]}
  }
}
```
- A snapshot is a version tuple; creating one costs one row. Every Sentinel call MUST carry a `snapshot_id`; there is no "latest" mode.
- Each chat request, workspace page load, monitor run and action validation creates or reuses a snapshot (reuse allowed only when all five counters and `as_of_date` match).
- Same `snapshot_id` + same params ⇒ identical Sentinel output (Sentinel AC).
- Snapshots are usable for 24 hours after creation; history rows are retained at least 30 days (F-16) and never less than the longest snapshot, cache or proposal horizon.

### 7.3 Caches and invalidation
| Cache | Key | TTL | Invalidated by |
| --- | --- | --- | --- |
| Sentinel result cache (optional, Sentinel-internal) | `(snapshot_id, function, params_hash)` | 24 h | Never needs invalidation (snapshot is immutable) |
| Gateway tool-result store | `tool_result_id` | 24 h (needed for grounding and audit replay) | — |
| John specialist-response cache | `(snapshot_id, specialist, task_type, task_params_hash)` | 15 min (F-02) | Any event that changes a counter of that snapshot's user → entries for older versions dropped |
| Alert narrative cache | `(alert_id, snapshot_id)` | 15 min | Same as above |

---

## 8. Data quality

### 8.1 DataQuality@1 (one shape everywhere)
```json
{
  "$id": "DataQuality@1",
  "required": ["categorization_version", "coverage_by_amount_bp", "uncategorized_amount_minor", "provisional_amount_minor", "unclassified_movement_amount_minor", "needs_review_count", "uncategorized_count", "pending_pipeline_count", "import_in_progress", "complete"],
  "properties": {
    "categorization_version":            {"type": "integer"},
    "coverage_by_amount_bp":             {"type": ["integer", "null"], "minimum": 0, "maximum": 10000},
    "uncategorized_amount_minor":        {"type": "integer", "minimum": 0},
    "provisional_amount_minor":          {"type": "integer", "minimum": 0},
    "unclassified_movement_amount_minor":{"type": "integer", "minimum": 0},
    "card_payment_unmatched_minor":      {"type": "integer", "minimum": 0},
    "needs_review_count":                {"type": "integer", "minimum": 0},
    "uncategorized_count":               {"type": "integer", "minimum": 0},
    "pending_pipeline_count":            {"type": "integer", "minimum": 0, "description": "Rows accepted but awaiting a retryable pipeline stage (replaces the undefined 'pending_count')"},
    "import_in_progress":                {"type": "boolean"},
    "complete":                          {"type": "boolean", "description": "import_in_progress = false AND pending_pipeline_count = 0"}
  }
}
```
Produced by CATEGORIZER `GET /status` (window per §8.2) and attached by SENTINEL to every result for the window that result used.

### 8.2 Coverage formula
Over the analysis window (trailing three full months plus the current month, F-18): numerator = Σ `amount_minor` of category-bearing debit rows (§6.1 "carries a category" and counts as spend) with `effective_status ∈ {CONFIRMED, AUTO}`; denominator = Σ of all such rows + `UNKNOWN` rows + `CARD_PAYMENT` rows with `counterpart_missing`. Denominator 0 → `null`. Expressed in basis points, rounded half-even. CATEGORIZER and SENTINEL implement the same function from the shared library `shared/finance/coverage.js` so the values are always equal.

### 8.3 Confidence cap rule (shared)
Sentinel caps confidence for any history-derived result: `≤ MEDIUM` when `complete = false` or `coverage_by_amount_bp < min_coverage_for_high_bp`; `LOW` when `coverage_by_amount_bp < min_coverage_for_medium_bp`. Floors are registry parameters set after baseline (F-09). John adds a caveat whenever `complete = false`.

---

## 9. Agent invocation protocol

Only JOHN invokes specialists. Specialists never invoke each other, never invoke JOHN, never call the Categorizer, the Action Service or the database. They call only Sentinel functions through the Tool Gateway (star topology).

### 9.1 Invocation mechanics
- In-process function call `invokeSpecialist(packet, {signal})` returning `Promise<SpecialistResponse@1>`; implemented by each specialist module (`agents/<name>/index.js`).
- One packet → one LLM tool-use session → one response. Inside the session the specialist may call its allowed Sentinel tools up to `budget.max_tool_calls`, then MUST produce exactly one final JSON object.
- The specialist's LLM session is driven by the shared **specialist runner** (`agents/shared/runner.js`): it enforces tool allowlist, budgets, deadline (AbortSignal), schema validation of the final output and one repair retry.

### 9.2 TaskPacket@1
```json
{
  "$id": "TaskPacket@1",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema", "request_id", "trace_id", "task_id", "specialist", "task_type", "snapshot_id", "trigger", "ui_context", "task_params", "data_quality", "context", "allowed_tools", "budget", "output_schema"],
  "properties": {
    "schema":      {"const": "TaskPacket@1"},
    "request_id":  {"type": "string"},
    "trace_id":    {"type": "string"},
    "task_id":     {"type": "string"},
    "specialist":  {"enum": ["ATLAS", "NOVA", "IRIS"]},
    "task_type":   {"type": "string", "description": "One of the task types of that specialist (§9.3)"},
    "snapshot_id": {"type": "string"},
    "trigger": {
      "type": "object", "required": ["kind"],
      "properties": {
        "kind": {"enum": ["USER_MESSAGE", "UI_ACTION", "ALERT_OPEN", "RECONCILE"], "description": "UI_ACTION = a workspace 'Explain'/'Ask about this' button sending a canned prompt; RECONCILE = John's reconcile round"},
        "alert_id": {"type": "string"}
      }
    },
    "user_message": {"type": ["string", "null"], "maxLength": 2000},
    "ui_context": {
      "type": "object", "required": ["workspace"],
      "properties": {
        "workspace": {"enum": ["JOHN", "ATLAS", "NOVA", "IRIS", "SENTINEL"]},
        "selected_goal_id": {"type": "string"},
        "selected_category_id": {"type": "string"},
        "selected_alert_id": {"type": "string"},
        "target_month": {"type": "string", "pattern": "^[0-9]{4}-(0[1-9]|1[0-2])$"}
      }
    },
    "task_params": {"type": "object", "description": "Structured entities extracted by JOHN's router or supplied by the UI; schema per task type in each specialist spec §C. Amounts here are user-supplied hypotheticals, not facts."},
    "data_quality": {"$ref": "DataQuality@1"},
    "context": {
      "type": "object", "required": ["preferences", "rolling_summary", "recent_turns", "peer_findings"],
      "properties": {
        "preferences": {
          "type": "object",
          "properties": {
            "risk_comfort": {"enum": ["CONSERVATIVE", "BALANCED", "AGGRESSIVE"]},
            "protected_category_ids": {"type": "array", "items": {"type": "string"}},
            "goal_priority_order": {"type": "array", "items": {"type": "string"}, "description": "goal_ids in the user's stated priority order, from memory facts; may be empty"}
          }
        },
        "rolling_summary": {"type": "string", "maxLength": 800},
        "recent_turns": {"type": "array", "maxItems": 6, "items": {"type": "object", "required": ["role", "text"], "properties": {"role": {"enum": ["USER", "JOHN"]}, "text": {"type": "string", "maxLength": 1000}}}},
        "peer_findings": {"type": "array", "maxItems": 5, "items": {"$ref": "PeerFinding@1"}}
      }
    },
    "allowed_tools": {"type": "array", "items": {"type": "string"}},
    "budget": {
      "type": "object", "required": ["max_tool_calls", "deadline_ms"],
      "properties": {"max_tool_calls": {"type": "integer", "minimum": 1, "maximum": 8}, "deadline_ms": {"type": "integer", "minimum": 1000, "maximum": 15000}}
    },
    "output_schema": {"const": "SpecialistResponse@1"}
  }
}
```
The packet MUST NOT contain `user_id`, `tenant_id`, account numbers, raw descriptions or raw ledger rows. The gateway binds identity from the session that created the request.

**PeerFinding@1** (what John forwards from one specialist to another): `{from: Specialist, hint_code, refs: {goal_id?, category_id?, merchant_id?}, tool_result_ids: [..], note: string ≤ 200}`. The receiving specialist may cite the referenced `tool_result_ids` (they belong to the same request and user).

### 9.3 Task-type registry
| Specialist | Task type | Default tool budget | Defined in |
| --- | --- | --- | --- |
| ATLAS | `CREATE_GOAL`, `UPDATE_GOAL`, `SET_GOAL_STATUS`, `EVALUATE_FUND_ADDITION`, `EVALUATE_FUND_RELEASE`, `DELETE_GOAL`, `GOAL_PROGRESS`, `GOAL_PLAN_REVIEW`, `HANDLE_PEER_FINDING`, `SIP_PROJECTION` | 4 (plan review: 2 + one progress per goal, max 8) | `atlas-savings-strategist-spec.md` §B |
| NOVA | `LIVE_STATUS`, `BREACH_EVENT`, `ANOMALY_EVENT`, `EXPLAIN_ANOMALY`, `PROPOSE_REBALANCE`, `ADJUST_CAP_REQUEST` | 4 (live status with 3 categories: 4) | `nova-budget-guardian-spec.md` §B |
| IRIS | `MONTHLY_PLAN`, `WHAT_IF_PURCHASE`, `BILL_OUTLOOK`, `OVERSPEND_DIAGNOSIS`, `PLAN_REVIEW` | Per task: 8 / 6 / 3 / 8 / 2 | `iris-spending-advisor-spec.md` §B |

### 9.4 SpecialistResponse@1
```json
{
  "$id": "SpecialistResponse@1",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema", "request_id", "task_id", "specialist", "status", "headline", "findings", "constraints", "proposed_actions", "questions_for_user", "peer_hints", "data_quality_notes", "confidence", "tool_result_ids", "domain"],
  "properties": {
    "schema":     {"const": "SpecialistResponse@1"},
    "request_id": {"type": "string"},
    "task_id":    {"type": "string"},
    "specialist": {"enum": ["ATLAS", "NOVA", "IRIS"]},
    "status":     {"enum": ["OK", "PARTIAL", "NEEDS_INPUT", "REJECTED", "ERROR"]},
    "headline":   {"$ref": "Finding@1"},
    "findings":   {"type": "array", "maxItems": 12, "items": {"$ref": "Finding@1"}},
    "constraints":{"type": "array", "maxItems": 10, "items": {"$ref": "Constraint@1"}},
    "proposed_actions": {"type": "array", "maxItems": 4, "items": {"$ref": "ProposedAction@1"}},
    "questions_for_user": {"type": "array", "maxItems": 1, "items": {"$ref": "Question@1"}},
    "peer_hints": {"type": "array", "maxItems": 3, "items": {"$ref": "PeerHint@1"}},
    "data_quality_notes": {"type": "array", "maxItems": 4, "items": {"$ref": "Finding@1"}},
    "confidence": {"enum": ["HIGH", "MEDIUM", "LOW"]},
    "tool_result_ids": {"type": "array", "items": {"type": "string"}},
    "error": {"$ref": "ErrorBody@1", "description": "Required when status = ERROR"},
    "domain": {"type": "object", "description": "Specialist extension: AtlasDomain@1 | NovaDomain@1 | IrisDomain@1, defined in each spec §C; its `kind` field equals the schema name. Its text fields follow Finding@1 rules."}
  }
}
```
**Status semantics.**
| Status | Meaning | John's handling |
| --- | --- | --- |
| `OK` | Task answered | Validate and use |
| `PARTIAL` | Answer usable but incomplete (insufficient history, budget hit, one tool failed) | Use, label partial, carry `data_quality_notes` |
| `NEEDS_INPUT` | Cannot proceed without one answer from the user | Ask `questions_for_user[0]` (§ John B.8) |
| `REJECTED` | The requested change violates a deterministic rule (validator returned REJECTED) | Explain the rule code in plain words; no proposal |
| `ERROR` | Could not answer (Sentinel unavailable, malformed tool output after retry) | Degrade per John §I; show no figures from this specialist |

`confidence` MUST equal the lowest `confidence` among the cited tool results that the headline depends on; John re-computes it and overrides a higher value.

### 9.5 Finding@1, Question@1, Constraint@1, ProposedAction@1
```json
{
  "$id": "Finding@1",
  "required": ["finding_id", "kind", "text"],
  "properties": {
    "finding_id": {"type": "string", "pattern": "^f[0-9]{1,2}$"},
    "kind": {"enum": ["FACT", "CALCULATION", "ESTIMATE", "PREDICTION", "RECOMMENDATION", "CAVEAT"]},
    "text": {"type": "string", "maxLength": 400, "description": "Plain language. Every number, date or amount MUST be a placeholder (§11.1). Literal digits are allowed only inside placeholders, in goal/category names copied from tool results, and in the user's own quoted numbers marked {{user:…}}."},
    "tool_result_ids": {"type": "array", "items": {"type": "string"}, "minItems": 0}
  }
}
```
Kinds: `FACT` = observed data (spend so far); `CALCULATION` = deterministic arithmetic on facts (utilization, surplus); `ESTIMATE` = statistic over history (trailing average); `PREDICTION` = forecast or simulation with uncertainty (must cite a result carrying `variance_band` and `confidence`); `RECOMMENDATION` = the specialist's advice (may cite results; must not contain unbound numbers); `CAVEAT` = data-quality or uncertainty statement. Every non-`RECOMMENDATION`/`CAVEAT` finding MUST cite ≥ 1 `tool_result_id`.

```json
{
  "$id": "Question@1",
  "required": ["question_id", "text", "options"],
  "properties": {
    "question_id": {"type": "string"},
    "text": {"type": "string", "maxLength": 200},
    "options": {"type": "array", "minItems": 2, "maxItems": 4, "items": {"type": "object", "required": ["option_id", "label"], "properties": {"option_id": {"type": "string"}, "label": {"type": "string", "maxLength": 60}, "value": {"type": "object", "description": "Structured value John puts into task_params when chosen, e.g. {\"goal_id\": \"g_…\"}"}}}},
    "allow_free_text": {"type": "boolean", "default": false}
  }
}
```

```json
{
  "$id": "Constraint@1",
  "required": ["code", "severity", "source", "message"],
  "properties": {
    "code": {"type": "string", "description": "From the registry in §12"},
    "severity": {"enum": ["MANDATORY", "WARNING", "INFO"]},
    "source": {"enum": ["VALIDATOR", "SENTINEL_RESULT", "SPECIALIST"]},
    "tool_result_id": {"type": "string", "description": "REQUIRED when source ≠ SPECIALIST; the cited result MUST contain this code"},
    "applies_to_action_ref": {"type": "string"},
    "message": {"$ref": "Finding@1"}
  }
}
```
John honours `MANDATORY` only when `source ∈ {VALIDATOR, SENTINEL_RESULT}` and the cited result actually contains the code; otherwise he downgrades it to `WARNING` and logs `CONSTRAINT_UNGROUNDED`. A specialist cannot block a user's explicit choice with prose.

```json
{
  "$id": "ProposedAction@1",
  "required": ["action_ref", "action", "params", "validation_tool_result_id", "rationale_finding_id"],
  "properties": {
    "action_ref": {"type": "string", "pattern": "^a[0-9]$", "description": "Local reference; JOHN maps it to a proposal_id after storing"},
    "action": {"type": "string", "description": "Action name from §13.2 that this specialist may propose"},
    "params": {"type": "object", "description": "Validated against the action's params schema (§13.2)"},
    "validation_tool_result_id": {"type": ["string", "null"], "description": "Result of the Sentinel validator/simulation that checked exactly these params; null only for actions with no validator: CREATE_ALERT, DISMISS_ALERT, DELETE_GOAL, REMOVE_CAP"},
    "rationale_finding_id": {"type": "string"},
    "expected_effect_finding_id": {"type": "string"},
    "depends_on_action_ref": {"type": "string", "description": "When two proposals must be confirmed in order"}
  }
}
```

### 9.6 PeerHint@1
| `hint_code` | Emitted by | Routed by John to | Meaning |
| --- | --- | --- | --- |
| `GOAL_FUNDING_PRESSURE` | NOVA | ATLAS (`HANDLE_PEER_FINDING`) | A deficit cannot be cleared by donors; a contribution pause/reduction may help |
| `RECURRING_ANOMALY` | NOVA | IRIS (next `MONTHLY_PLAN`/`BILL_OUTLOOK` in this or a later request) | A recurring charge changed |
| `SAVINGS_CAPACITY` | IRIS | ATLAS | Simulation found unallocated capacity (or a shortfall) |
| `GOAL_COMMITMENT` | ATLAS | IRIS, NOVA | Committed allocations that constrain caps |
| `MISCATEGORIZATION_SUSPECTED` | any specialist | JOHN → Categorizer review queue (`review_items`, reason `SPECIALIST_HINT`) | Never changes a category |

```json
{"$id": "PeerHint@1", "required": ["hint_code", "target", "refs", "tool_result_ids"],
 "properties": {"hint_code": {"enum": ["GOAL_FUNDING_PRESSURE", "RECURRING_ANOMALY", "SAVINGS_CAPACITY", "GOAL_COMMITMENT", "MISCATEGORIZATION_SUSPECTED"]},
  "target": {"enum": ["ATLAS", "NOVA", "IRIS", "JOHN"]},
  "refs": {"type": "object", "properties": {"goal_id": {"type": "string"}, "category_id": {"type": "string"}, "merchant_id": {"type": "string"}, "txn_id": {"type": "string"}}},
  "tool_result_ids": {"type": "array", "items": {"type": "string"}},
  "note": {"type": "string", "maxLength": 200}}}
```
Peer hints are advisory. John decides whether to act on them (`john-orchestrator-spec.md` §D.7). At most one dependency edge and one reconcile round per request.

---

## 10. Tool protocol

### 10.1 Tool Gateway request (from a specialist or John)
```json
{"$id": "ToolCall@1", "required": ["tool", "params"],
 "properties": {
  "tool": {"type": "string", "description": "Sentinel function name (§10.4)"},
  "params": {"type": "object", "description": "Function params; facts that come from an earlier result MUST be passed as ResultRef"}
 }}
```
The gateway adds `snapshot_id` (from the task), user scope, `trace_id`, `task_id` and a deadline. A caller-supplied `user_id`, `tenant_id` or `snapshot_id` is rejected with `INVALID_INPUT`.

**ResultRef@1** — `{"$ref": "trs_…:/data/<json-pointer>"}`. The gateway resolves it from the tool-result store and rejects refs to results of another request or user (`FORBIDDEN`, security event). Parameters whose value is a fact (balances, projected outlays, saved amounts, days remaining) are declared `fact: true` in the function schema and MUST be a ResultRef or omitted (Sentinel then reads them from the snapshot). Hypothetical inputs (a new cap, an outlay the user is considering) are literal values.

### 10.2 SentinelResult@1 (every Sentinel response)
```json
{
  "$id": "SentinelResult@1",
  "required": ["tool_result_id", "function", "status", "snapshot_id", "computed_at", "model_version", "categorization_version", "data_quality", "params_hash"],
  "properties": {
    "tool_result_id": {"type": "string"},
    "function": {"type": "string"},
    "status": {"enum": ["OK", "INVALID_INPUT", "SNAPSHOT_NOT_FOUND", "DATA_STALE", "INSUFFICIENT_HISTORY", "UNKNOWN_ENTITY", "TIMEOUT", "INTERNAL_ERROR"]},
    "data": {"type": ["object", "null"], "description": "Function-specific payload; schema per function in Sentinel spec §C"},
    "confidence": {"enum": ["HIGH", "MEDIUM", "LOW", null]},
    "variance_band": {"type": ["object", "null"], "description": "{low_minor, high_minor} or per-field bands for forecasts"},
    "data_as_of": {"type": ["string", "null"], "format": "date"},
    "snapshot_id": {"type": "string"},
    "categorization_version": {"type": "integer"},
    "data_quality": {"$ref": "DataQuality@1"},
    "constraint_codes": {"type": "array", "items": {"type": "string"}, "description": "Codes from §12 produced by this result (validators, feasibility, simulations)"},
    "computed_at": {"type": "string", "format": "date-time"},
    "model_version": {"type": "string"},
    "params_hash": {"type": "string"},
    "error": {"$ref": "ErrorBody@1"}
  }
}
```

### 10.3 Tool budgets and limits
- Per specialist task: `budget.max_tool_calls` (§9.3). The runner refuses further calls with `BUDGET_EXHAUSTED`; the specialist must then finish with what it has (`PARTIAL`).
- Per user request: ≤ 12 Sentinel calls in total (F-01), counted by the gateway across John and all specialists.
- LLM budget (F-01) counts **invocations**: the router call, each specialist task (which may internally make up to `max_tool_calls + 2` model completions), the synthesis call and any retry or regenerate; ≤ 6 per request and ≤ 60,000 input tokens summed.
- John's `sentinel_run_spending_simulation` calls are accepted only when the gateway context carries `arbitration: true` (set by John's conflict module).
- Identical calls (same function, params_hash, snapshot) within a request return the stored result without recomputation.

### 10.4 Caller × function allowlist (enforced by the gateway; supersedes all caller columns elsewhere)
| Function | ATLAS | NOVA | IRIS | JOHN | WORKSPACE_API | BUDGET_MONITOR |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| `sentinel_get_surplus_baseline` | ✓ | | ✓ | ✓ | ✓ | |
| `sentinel_get_ledger_summary` | | ✓ | ✓ | ✓ | ✓ | |
| `sentinel_get_spending_timeseries` | | | | | ✓ | |
| `sentinel_run_spending_simulation` | | | ✓ | ✓ (arbitration only) | ✓ | |
| `sentinel_run_category_utilization` | | ✓ | | | ✓ | ✓ |
| `sentinel_run_velocity_projection` | | ✓ | | | ✓ | |
| `sentinel_detect_anomalies` | | ✓ | ✓ | | ✓ | ✓ |
| `sentinel_run_rebalance_simulation` | | ✓ | ✓ | | ✓ | |
| `sentinel_validate_cap_change` | | ✓ | ✓ | | ✓ | |
| `sentinel_run_goal_progress` | ✓ | | | | ✓ | |
| `sentinel_run_goal_feasibility` | ✓ | | ✓ | | ✓ | |
| `sentinel_validate_goal_change` | ✓ | | ✓ | | ✓ | |
| `sentinel_check_available_balance` | ✓ | | | | ✓ | |
| `sentinel_forecast_bill_outlays` | | | ✓ | ✓ | ✓ | ✓ |
| `sentinel_flag_cashflow_risk` | | | ✓ | ✓ | ✓ | ✓ |
| `sentinel_compute_health_score` | | | | ✓ | | |
| `sentinel_project_sip` | ✓ | | | | ✓ | |

ACTION_SERVICE does not call Sentinel through the gateway; it links the shared **rule library** (`engines/sentinel/rules/`) directly (§17.1), so "validated" and "executed" cannot disagree.

No caller has a write tool. There is no tool that lets an LLM call the Categorizer, the Action Service, the Profile Service or the database.

---

## 11. Numeric grounding and rendering

### 11.1 Placeholder syntax
```
{{<tool_result_id>:<json-pointer>|<format>}}     e.g. {{trs_01J…:/data/net_surplus_minor|inr}}
{{status:<field>|<format>}}                       Categorizer status of this request, e.g. {{status:/needs_review_count|count}}
{{action:<action_id>:<json-pointer>|<format>}}    Action Service result
{{param:<action_ref>:<json-pointer>|<format>}}    Proposal parameter
{{user:<verbatim>}}                               A number the user typed in this turn, echoed verbatim
{{txn:<txn_id>:<json-pointer>|<format>}}          A transaction field John read from the Categorizer in this request (John's correction answers only)
```
Formats: `inr` (₹ with Indian digit grouping, no paise when zero: ₹1,20,000), `inr_paise` (₹1,20,000.50), `bp_pct` (92%; one decimal when < 10%), `date` (10 Oct 2026), `month` (Oct 2026), `count`, `days`, `months`.

### 11.2 Groundable sources (fixes X-15)
A figure may reach the user only if it is bound to one of: a `SentinelResult@1` of this request, the Categorizer status read at step 3 of this request, a transaction John read from the Categorizer in this request (`txn:`), an Action Service result, a stored proposal's parameters, or the user's own number in this turn (`user:` — rendered verbatim, never re-computed).

### 11.3 Rendering and the grounding check (owned by JOHN, also used by WORKSPACE_API)
1. Resolve every placeholder by code; an unresolvable placeholder removes its sentence.
2. After resolution, scan the final text; any digit sequence not produced by step 1 and not part of an allowed literal (goal/category/merchant names that came from tool results, ordinal list markers) is a grounding violation → strip the sentence (or regenerate once, §John D).
3. Confirmation cards are rendered from action parameters by code; no LLM wording appears on a card.

### 11.4 Headline rule (shared)
If the result's `confidence ≠ HIGH`, or `risk_comfort = CONSERVATIVE`, the headline figure is the conservative one (`conservative_balance_minor`, `conservative_date`, `conservative_daily_envelope_minor`), and the optimistic figure may follow second. Specialists and John MUST follow it; John's validator enforces it on `headline`.

---

## 12. Constraint code registry (fixes X-09)

| Code | Severity | Produced by (deterministic check) | Re-checked by Action Service | Meaning / user wording |
| --- | --- | --- | --- | --- |
| `TARGET_NOT_POSITIVE` | MANDATORY | `sentinel_validate_goal_change` | ✓ | Target must be greater than zero |
| `CONTRIBUTION_EXCEEDS_TARGET` | MANDATORY | goal validator | ✓ | Monthly add cannot exceed target |
| `FUNDS_EXCEED_TARGET` | MANDATORY | goal validator | ✓ | Saved + added cannot exceed target (replaces `GOAL_OVER_TARGET`) |
| `TARGET_BELOW_SAVED` | MANDATORY | goal validator | ✓ | New target below saved amount |
| `NAME_INVALID` | MANDATORY | goal validator | ✓ | Name missing or duplicate |
| `DEADLINE_IN_PAST` | MANDATORY | goal validator | ✓ | |
| `AMOUNT_PRECISION` | MANDATORY | all validators | ✓ | Not whole paise / not an integer |
| `GOAL_LIMIT` | MANDATORY | goal validator | ✓ | More than 20 non-archived goals (F-10) |
| `GOAL_NOT_ACTIVE` | MANDATORY | goal validator | ✓ | Funds operation on a paused/archived goal |
| `RELEASE_EXCEEDS_SAVED` | MANDATORY | goal validator | ✓ | |
| `RESTORE_WINDOW_EXPIRED` | MANDATORY | goal validator | ✓ | |
| `INSUFFICIENT_BALANCE` | MANDATORY | `sentinel_check_available_balance` | ✓ | Earmark exceeds spendable balance minus existing earmarks |
| `BALANCE_UNKNOWN` | MANDATORY | available-balance check | ✓ | No usable balance (§5.2) |
| `SURPLUS_SHORTFALL` | MANDATORY | `sentinel_run_goal_feasibility` verdict `SHORTFALL` | ✓ | New/higher monthly add exceeds net surplus after goals (D-006 (i)) |
| `CAP_NEGATIVE` | MANDATORY | `sentinel_validate_cap_change` | ✓ | |
| `CATEGORY_UNKNOWN` | MANDATORY | cap validator | ✓ | |
| `CATEGORY_NOT_CAPPABLE` | MANDATORY | cap validator | ✓ | FIXED, income or non-expense category |
| `PROTECTED_CATEGORY` | MANDATORY unless the action carries `override_protected: true` set by an allowed origin (§13.4) | cap validator, rebalance simulation | ✓ | Reduction of a protected category |
| `ZERO_SUM_VIOLATION` | MANDATORY | rebalance validator in rule library | ✓ | Rebalance transfers do not net to zero or exceed donor capacity |
| `CAPS_EXCEED_SPENDABLE` | WARNING | cap validator | ✓ (warning) | Σ caps > income − fixed − goal commitments |
| `CAP_ON_DEPRECATED_CATEGORY` | WARNING | cap validator | ✓ (warning) | Suggest replacement ID |
| `CAP_BELOW_SPEND` | WARNING | cap validator | ✓ (warning) | New cap below month-to-date spend → immediately Exceeded |
| `FEASIBILITY_TIGHT` | WARNING | feasibility verdict `TIGHT` | ✓ (warning) | Fits surplus but not after caps |
| `NEGATIVE_BALANCE_RISK` | WARNING, **requires acknowledgment on the card** | `sentinel_run_spending_simulation` risk `MEDIUM`/`HIGH`; cash-flow risk flag | — | Plan may leave the balance below zero |
| `GOAL_COMMITMENT_CONFLICT` | WARNING | simulation with caps + goal commitments | — | Caps and goal commitments cannot both hold |
| `OVER_EARMARKED` | WARNING | available-balance check (available < 0) | — | Earmarks exceed spendable balance |
| `STALE_BALANCE` | WARNING | any balance-dependent function | — | Balance older than registry limit |
| `INCOME_BASIS_UNCERTAIN` | WARNING | surplus baseline (`OBSERVED` and confidence ≠ HIGH, or income rows under review) | — | Lead with conservative surplus |
| `LOW_CATEGORIZATION_COVERAGE` | WARNING | any category-level function when coverage < floor | — | |
| `PROVISIONAL_DATA` | INFO | utilization (`tier_is_provisional`), any result with provisional amounts | — | |
| `IMPORT_IN_PROGRESS` | INFO | any result while `import_in_progress` | — | |

A specialist MAY attach codes only from this table. Unknown codes are dropped by John's validator. Each code has a fixed plain-language template in `shared/contracts/constraint-messages.js`, used by John and the UI; specialists do not invent rule wording.

---

## 13. Action registry, tiers, proposals and execution

### 13.1 Tiers and consent (D-002)
| Tier | Meaning | How the user consents | Token the Action Service checks |
| --- | --- | --- | --- |
| T0 | Read only | — | none |
| T1 | Low impact, reversible, logged | **UI:** the tap on the control itself. **Chat:** an explicit instruction matched by John's **deterministic rule layer** with exactly one resolved target (e.g. "move this Swiggy charge on 3 Oct to Groceries") executes, then John shows one line with **Undo**; an instruction detected only by the router model, or needing target resolution, is rendered as a chip and waits for a tap. **A specialist proposal of a T1 action is never executed without a user tap** on the chip John renders. | `intent_token` (§13.4) |
| T2 | Plan-state change | Tap **Confirm** on a confirmation card rendered by code from parameters | `confirmation_token` |
| T3 | Destructive | Explicit, de-emphasized confirmation card showing what is lost; required acknowledgment checkbox | `confirmation_token` with `ack: true` |
| T4 | Real money movement | Not available | — |

Typed text ("yes", "apply it") never confirms T2/T3 (John re-shows the card). Every T1 action has an Undo available for 24 hours if the affected rows' versions are unchanged.

### 13.2 Action registry (the single registry; supersedes the tables in Atlas/Nova/Iris V4)
"Proposers" = specialists allowed to put the action in `proposed_actions`. "Direct initiators" = paths that may create the action without a specialist. "Executor" = the module the Action Service calls inside its transaction.

| Action | Tier | Proposers | Direct initiators | Validator (rule library) | Executor | Undo |
| --- | --- | --- | --- | --- | --- | --- |
| `CREATE_GOAL` | T2 | ATLAS, IRIS | Atlas form | goal validator + feasibility | Plan Store | `DELETE_GOAL` (no T3 card when < 24 h and saved = 0) |
| `UPDATE_GOAL` | T2 | ATLAS, IRIS | Atlas form | goal validator + feasibility (if monthly add rises) | Plan Store | inverse update |
| `SET_GOAL_STATUS` (`ACTIVE`/`PAUSED`) | T2 | ATLAS | Atlas form | goal validator | Plan Store | inverse |
| `SET_GOAL_MONTH_OVERRIDE` | T2 | ATLAS, IRIS | Atlas form | goal validator + feasibility | Plan Store | delete override |
| `ADD_FUNDS` | T2 | ATLAS | Atlas form | goal validator + available balance | Plan Store | `RELEASE_FUNDS` |
| `RELEASE_FUNDS` | T2 | ATLAS | Atlas form | goal validator | Plan Store | `ADD_FUNDS` (re-validated) |
| `DELETE_GOAL` | T3 | ATLAS | Atlas form | none (state check) | Plan Store | `RESTORE_GOAL` |
| `RESTORE_GOAL` | T2 | — | Atlas "Recently deleted"; John on explicit instruction (as a card) | restore window, GOAL_LIMIT, NAME_INVALID | Plan Store | `DELETE_GOAL` |
| `ADJUST_BUDGET_CAP` (`scope: STANDING`/`MONTH`) | T2 | NOVA, IRIS | Nova form | cap validator | Plan Store | inverse |
| `REMOVE_CAP` | T2 | NOVA | Nova form | none | Plan Store | re-create |
| `APPLY_REBALANCE` | T2 | NOVA, IRIS | Nova workspace "Cover this overspend" (params = Sentinel rebalance result) | cap validator per leg + zero-sum | Plan Store (month overrides) | delete overrides |
| `CREATE_ALERT` (WATCH) | T1 | NOVA | Nova/Sentinel workspace "Watch" | subject exists | Budget Monitor | `DISMISS_ALERT` |
| `DISMISS_ALERT` | T1 | NOVA | Alert card | alert OPEN | Budget Monitor | reopen |
| `RECATEGORIZE_TRANSACTION` (`scope: TRANSACTION`) | T1 | — | Transaction list; John chat instruction | category exists, applicable to type | Categorizer | `UNDO_CLASSIFICATION_CHANGE` |
| `RECATEGORIZE_TRANSACTION` (`scope: MERCHANT`) | T2 | — | Transaction list (card with dry-run counts); John chat instruction (card) | same + dry run | Categorizer | `UNDO_CLASSIFICATION_CHANGE` |
| `CONFIRM_CATEGORY` | T1 | — | Review list, transaction chip | row NEEDS_REVIEW/AUTO | Categorizer | undo |
| `SET_TRANSACTION_TYPE` | T1 | — | Review list, transaction detail | allowed transitions (Categorizer §B.7) | Categorizer | undo |
| `CONFIRM_LINK` / `BREAK_LINK` | T1 | — | Review list | link candidates | Categorizer | undo |
| `RESOLVE_DUPLICATE` (`IS_DUPLICATE`/`NOT_DUPLICATE`) | T1 | — | Review list | row flagged | Categorizer | undo |
| `MARK_OWN_ACCOUNT_COUNTERPARTY` | T2 | — | Transaction detail (card with dry-run counts) | counterparty key resolvable | Categorizer | undo |
| `CREATE_CATEGORY_RULE` | T2 | — | Rules page; John chat instruction (card) | conditions valid, dry run | Categorizer | `DELETE_CATEGORY_RULE` |
| `DELETE_CATEGORY_RULE` | T1 | — | Rules page | rule exists | Categorizer | re-create |
| `UNDO_CLASSIFICATION_CHANGE` | T1 | — | Undo control | event within 24 h, rows unchanged | Categorizer | — |
| `DISMISS_REVIEW_ITEM` | T1 | — | Review list | item OPEN | Categorizer | reopen |
| `ADD_MANUAL_TRANSACTION` | T1 | — | Nova "Log expense" form | amount, date ≤ today, account MANUAL_CASH or own account | Categorizer (ingest source MANUAL) | `DELETE_MANUAL_TRANSACTION` |
| `DELETE_MANUAL_TRANSACTION` | T1 | — | Transaction detail | source MANUAL | Categorizer (tombstone + supersede) | re-add |
| `ADD_DECLARED_BILL` / `UPDATE_DECLARED_BILL` / `DELETE_DECLARED_BILL` | T1 | — | Sentinel workspace bills panel | amount, date, recurrence | Profile Service | inverse |
| `UPDATE_PROFILE` | T2 | — | Settings; John on explicit user statement (card) | income ≥ 0; fixed-line categories unique, expense-type, no parent/leaf overlap, not currently capped (else card lists the caps to remove first) | Profile Service | inverse |
| `UPDATE_PREFERENCE` | T1 | — | Settings; John on explicit user statement | enums valid, IDs exist | Profile Service | inverse |
| `APPLY_TAXONOMY_MIGRATION` | SYSTEM | — | Taxonomy release job | migration map valid | Plan Store + Profile Service + Categorizer | release rollback |
| `PERIOD_ROLLOVER` | SYSTEM | — | Monthly job at 00:05 IST on day 1 | — | Plan Store (expire overrides) + Budget Monitor (resolve alerts) | — |

An action not in this table does not exist. John's validator drops any proposal for an unlisted action, or from a specialist not listed as a proposer. Params schemas live in `shared/contracts/schemas/actions/<ACTION>.json`; the key fields are given in each proposing specialist's spec.

### 13.3 Proposal@1 lifecycle (stored by ACTION_SERVICE)
```json
{"$id": "Proposal@1", "required": ["proposal_id", "action", "params", "params_hash", "tier", "origin", "proposer", "base_versions", "snapshot_id", "state", "expires_at", "created_at"],
 "properties": {
  "proposal_id": {"type": "string"}, "action": {"type": "string"}, "params": {"type": "object"},
  "params_hash": {"type": "string", "description": "SHA-256 of canonical JSON of params"},
  "tier": {"enum": ["T1", "T2", "T3"]},
  "origin": {"enum": ["UI_FORM", "CHAT_INSTRUCTION", "CHAT_PROPOSAL"]},
  "proposer": {"enum": ["USER", "JOHN", "ATLAS", "NOVA", "IRIS"]},
  "base_versions": {"type": "object", "description": "e.g. {\"goal:g_…\": 7, \"plan\": 41, \"categorization\": 44}"},
  "snapshot_id": {"type": "string"},
  "warnings": {"type": "array", "items": {"type": "string"}, "description": "WARNING codes to show on the card"},
  "requires_ack": {"type": "boolean"},
  "state": {"enum": ["PROPOSED", "CONFIRMED", "EXECUTED", "EXECUTED_UNVERIFIED", "DUPLICATE", "REJECTED_VALIDATION", "REJECTED_STALE", "REJECTED_POLICY", "REJECTED_AUTH", "FAILED_ROLLED_BACK", "DECLINED", "EXPIRED", "SUPERSEDED"]},
  "expires_at": {"type": "string", "format": "date-time"}, "created_at": {"type": "string", "format": "date-time"},
  "trace_id": {"type": "string"}, "request_id": {"type": "string"}}}
```
Transitions: `PROPOSED → CONFIRMED | DECLINED | EXPIRED (30 min, F-02) | SUPERSEDED (new proposal for the same target)`; `CONFIRMED → EXECUTED | EXECUTED_UNVERIFIED | DUPLICATE | REJECTED_VALIDATION | REJECTED_STALE | REJECTED_POLICY | REJECTED_AUTH | FAILED_ROLLED_BACK`. "Same target" = same action family and same primary key (goal_id; category_id; txn_id; alert_id).

### 13.4 Tokens and the `override_protected` flag
- `intent_token` (T1): issued by WORKSPACE_API for a UI tap, or by JOHN's deterministic instruction detector for a chat T1. Binds `(user, action, params_hash, origin)`; TTL 2 minutes; single use.
- `confirmation_token` (T2/T3): issued by ACTION_SERVICE when the user taps Confirm on a card (`POST /api/v1/proposals/{id}/confirm` with the `params_hash` the card displayed). Binds `(user, proposal_id, params_hash)`; TTL 5 minutes; single use. A changed parameter invalidates it.
- `override_protected: true` on `ADJUST_BUDGET_CAP`/`APPLY_REBALANCE` is accepted only when `origin ∈ {UI_FORM, CHAT_INSTRUCTION}` **and** the card was shown with the protected-category acknowledgment checked. It is stripped from any `CHAT_PROPOSAL` origin (a specialist can never reduce a protected category) (D-016).

### 13.5 ActionRequest@1 and ActionResult@1
```json
{"$id": "ActionRequest@1", "required": ["proposal_id", "idempotency_key", "token"],
 "properties": {"proposal_id": {"type": "string"}, "idempotency_key": {"type": "string", "description": "<proposal_id>:<params_hash[0:12]>"},
  "token": {"type": "string"}, "ack": {"type": "boolean"}, "trace_id": {"type": "string"}}}
```
```json
{"$id": "ActionResult@1", "required": ["action_id", "proposal_id", "status", "executed_at"],
 "properties": {"action_id": {"type": "string"}, "proposal_id": {"type": "string"},
  "status": {"enum": ["EXECUTED", "EXECUTED_UNVERIFIED", "DUPLICATE", "REJECTED_VALIDATION", "REJECTED_STALE", "REJECTED_POLICY", "REJECTED_AUTH", "FAILED_ROLLED_BACK"]},
  "rule_codes": {"type": "array", "items": {"type": "string"}},
  "result": {"type": "object", "description": "New values re-read after commit (e.g. goal after ADD_FUNDS); groundable via {{action:…}}"},
  "new_versions": {"type": "object"}, "undo_available_until": {"type": ["string", "null"], "format": "date-time"},
  "executed_at": {"type": "string", "format": "date-time"}}}
```

### 13.6 Execution algorithm (ACTION_SERVICE, deterministic)
1. Authenticate session; derive `user_id`, `tenant_id`. 2. Load proposal; check ownership (else `REJECTED_AUTH`, 404 to caller). 3. Verify token binding and TTL. 4. Idempotency: a completed action with the same key → return its stored `ActionResult` as `DUPLICATE`. 5. Rate limit (§16.7). 6. Create an `ACTION_VALIDATION` snapshot; compare `base_versions` with current versions of the affected rows → mismatch → `REJECTED_STALE`. 7. Run the validator(s) from the rule library on current state → any MANDATORY code → `REJECTED_VALIDATION` with codes. 8. Check policy (tier allowed for origin, proposer allowed, `override_protected` rule, T4 never) → `REJECTED_POLICY`. 9. In **one DB transaction**: executor writes, ledger row, history rows, version counters, outbox event (`plan.changed` or the executor's own event). Failure → rollback → `FAILED_ROLLED_BACK`. 10. Re-read the affected rows; mismatch with expected → `EXECUTED_UNVERIFIED` and enqueue `reconcile_action` job (retries 3× with backoff 10 s/60 s/300 s, then OPERATOR alert). 11. Return `ActionResult`.

---

## 14. Events and jobs

### 14.1 Event envelope
```json
{"$id": "Event@1", "required": ["event_id", "type", "user_ref", "emitted_at", "payload"],
 "properties": {"event_id": {"type": "string"}, "type": {"type": "string"},
  "user_ref": {"type": "string", "description": "Internal user_id; events never leave the backend"},
  "emitted_at": {"type": "string", "format": "date-time"}, "payload": {"type": "object"}}}
```
Delivery: written to `event_outbox` in the same transaction as the change; delivered at least once by the EVENT_BUS worker; consumers de-duplicate by `event_id` and ignore versions not newer than the last processed.

| Event type | Emitted by | Payload (key fields) | Consumers |
| --- | --- | --- | --- |
| `categorization.updated` | CATEGORIZER | `categorization_version`, `previous_version`, `cause` (`IMPORT`, `MANUAL_ENTRY`, `CORRECTION`, `CONFIRMATION`, `TYPE_CHANGE`, `LINK_CHANGE`, `RULE_CHANGE`, `REPROCESS`, `MIGRATION`, `UNDO`), `changed_txn_ids` (≤ 500 else omitted), `affected_categories[] {category_id, previous_category_id}` (null for none), `periods[]` | BUDGET_MONITOR, JOHN cache |
| `plan.changed` | ACTION_SERVICE / PROFILE_SERVICE | `plan_version`, `action`, `entities[] {kind, id}`, `periods[]` | BUDGET_MONITOR (caps), JOHN cache |
| `balances.updated` | PROFILE_SERVICE | `balance_version`, `account_ids[]` | BUDGET_MONITOR (cash-flow scan), JOHN cache |
| `alert.changed` | BUDGET_MONITOR | `alert_id`, `state`, `kind`, `tier?` | WORKSPACE_API (in-app notification feed) |
| `ingestion.completed` | INGESTION_GATEWAY | `batch_id`, counts, status | OPERATOR dashboards; WORKSPACE_API ("new transactions" notice). The Categorizer is started by a direct `ingestBatch` call, not by this event. |
| `period.rolled` | Job | `period_closed`, `period_opened` | BUDGET_MONITOR, Plan Store |

### 14.2 Scheduled jobs
| Job | Schedule (Asia/Kolkata) | Owner | Effect |
| --- | --- | --- | --- |
| `period_rollover` | 00:05 on day 1 | ACTION_SERVICE (SYSTEM action `PERIOD_ROLLOVER`) | Expire overrides of closed period; emit `period.rolled` |
| `daily_scan` | 06:00 daily | BUDGET_MONITOR | Anomaly scan and cash-flow risk scan per active user; creates `ANOMALY` / `CASHFLOW_RISK` alerts (D-007 7b) |
| `reprocess_retryable` | every 30 min | CATEGORIZER | Retry rows left with retryable stage errors |
| `summarize_threads` | on demand, async after a turn | JOHN | Update rolling summary when > 6 turns since last summary |
| `reconcile_action` | on demand | ACTION_SERVICE | Verify `EXECUTED_UNVERIFIED` actions |
| `history_compaction` | 03:00 daily | each history owner | Compact history rows older than retention and unreferenced |

No job invokes an LLM (D-007 7a: narratives are generated lazily when the user opens an alert).

---

## 15. Errors, timeouts, retries and cancellation

### 15.1 ErrorBody@1
```json
{"$id": "ErrorBody@1", "required": ["code", "message", "retryable"],
 "properties": {"code": {"type": "string"}, "message": {"type": "string", "maxLength": 300},
  "retryable": {"type": "boolean"}, "details": {"type": "array", "items": {"type": "object"}}}}
```
HTTP responses: `{"error": ErrorBody@1, "trace_id": "trc_…"}`.

### 15.2 Common error codes
| Code | HTTP | Retryable | Meaning |
| --- | --- | --- | --- |
| `INVALID_INPUT` | 400 | No | Schema or semantic validation failed |
| `UNAUTHENTICATED` | 401 | No | No/expired session |
| `FORBIDDEN` | 403 | No | Authenticated but not permitted (never used to reveal another user's ID — that is 404) |
| `NOT_FOUND` | 404 | No | Unknown ID, or ID belonging to another user |
| `VERSION_CONFLICT` | 409 | Yes, after re-read | `If-Match` / base version mismatch |
| `IDEMPOTENCY_KEY_REUSED` | 409 | No | Same key, different body |
| `UNSUPPORTED_OPERATION` | 422 | No | Action/format/type not supported (e.g. T4) |
| `RATE_LIMITED` | 429 | Yes, after `Retry-After` | |
| `SNAPSHOT_NOT_FOUND` | 409 | Yes, with a new snapshot | |
| `DATA_STALE` | 409 | Yes, with a new snapshot | |
| `INSUFFICIENT_HISTORY` | 200 inside result | No | Not enough data; returned as a result status |
| `UNKNOWN_ENTITY` | 200 inside result / 404 | No | |
| `SCHEMA_VIOLATION` | 502 (internal) | Once | An LLM or component returned invalid output |
| `BUDGET_EXHAUSTED` | — (internal) | No | Tool/LLM budget used up |
| `TIMEOUT` | 504 | Yes, once | Deadline exceeded |
| `UNAVAILABLE` | 503 | Yes, with backoff | Dependency down (LLM provider, Sentinel) |
| `CANCELLED` | — (internal) | No | Caller aborted |
| `PERSISTENCE_FAILED` | 500 | Yes, once | Transaction rolled back |
| `INTERNAL_ERROR` | 500 | No | Bug; logged with trace |

Component-specific codes extend this list and are defined in the owning spec: Categorizer `UNKNOWN_CATEGORY` (422), `CATEGORY_NOT_APPLICABLE_TO_TYPE` (422), `CONFLICTING_REDELIVERY` (row-level), row rejection codes (`item-categorizer-spec.md` §B.2.1); Sentinel result statuses (§10.2); Action Service statuses (§13.5).

### 15.3 Deadlines (defaults F-01; registry `runtime.*`)
| Call | Deadline | Retries |
| --- | --- | --- |
| Whole chat request (John) | 20 s wall clock | — |
| Router LLM call | 4 s | 1 (on timeout or schema violation) |
| Specialist task | `budget.deadline_ms` (default 8 s) | 1 with a smaller packet (John §I) |
| One LLM completion inside a specialist | 6 s | 1 repair attempt for schema violation |
| Synthesis LLM call | 6 s | 1 regenerate on grounding failure |
| Sentinel function | 3× its p95 target (validators 0.9 s, mid 3 s, heavy 6 s) | 1 on `TIMEOUT`/`INTERNAL_ERROR`; none on deterministic errors |
| Action Service execute | 5 s | Client retries with same idempotency key |
| Categorizer correction (sync) | 5 s | Same idempotency key |

### 15.4 Cancellation
Every async call accepts an `AbortSignal`. When John's request deadline or the user's "stop" fires, John aborts outstanding specialist tasks; the specialist runner aborts its LLM call and in-flight gateway calls; late results are discarded and logged as `CANCELLED`. Cancellation never affects an Action Service transaction that has begun (it completes or rolls back atomically).

---

## 16. Security, privacy and permissions

### 16.1 Least privilege matrix
| Component | DB role | Can write | Can call |
| --- | --- | --- | --- |
| JOHN | `john_rw` on John's own tables only; no access to financial tables | chat, memory tables | Gateway (read tools in §10.4), Categorizer status + search (read), Action Service (create proposal, execute T1 with intent token), Snapshot Service, LLM Adapter |
| ATLAS / NOVA / IRIS | **none** | nothing | Gateway only, with their allowlist; LLM Adapter through the runner |
| SENTINEL | `sentinel_ro` (read-only, verified by test) | nothing (optional result cache in its own schema) | nothing |
| CATEGORIZER | `categorizer_rw` on its tables | its tables | LLM Adapter **disabled** (T5 stays off) |
| ACTION_SERVICE | `action_rw` on Plan Store + ledger; calls executors | via executors | Categorizer write API, Profile Service write API, Budget Monitor alert API, rule library |
| PROFILE_SERVICE | `profile_rw` on its tables | its tables | — |
| BUDGET_MONITOR | `monitor_rw` on `alerts` | alerts | Gateway (monitor allowlist) |
| WORKSPACE_API | none directly | — | All services' read APIs, Action Service, Gateway (workspace allowlist) |
| INGESTION_GATEWAY | `ingest_rw` on staging | staging tables | Categorizer ingest API, Profile Service accounts/balances API |

### 16.2 Identity
- Production: the bank's app performs OIDC (authorization code + PKCE) against the bank IdP; FinMate's `/api/v1/auth/oidc/callback` validates the ID token (issuer, audience, signature, nonce, expiry), maps `sub` to `user_id` (stores only a salted hash of the bank customer reference), and issues a FinMate session JWT (15 min access + rotating refresh, httpOnly cookie).
- Prototype: existing `/api/auth/signup|login` with bcrypt and JWT; same session claims.
- Session claims: `sub=user_id`, `ten=tenant_id`, `scope=customer`, `consent=<bool llm>`. The gateway and all services read identity **only** from the verified session; any identity parameter in a body is rejected.

### 16.3 Isolation
Every query filters on `tenant_id` and `user_id` (prototype: repository layer; production: Postgres RLS policies keyed on `current_setting('app.user_id')`). Cross-user access returns 404. Caches are keyed by user.

### 16.4 Untrusted input and prompt injection
- LLMs receive untrusted strings only inside clearly delimited data fields of JSON tool results or packets; system prompts state that such fields are data.
- Merchant names reaching an LLM are sanitized (`[A-Za-z0-9 &.'-]`, ≤ 40 chars) and come only from resolved merchants. Raw descriptions never reach an LLM.
- Any ID an LLM emits must already exist in its packet or a cited result; otherwise the output is rejected (`SCHEMA_VIOLATION`) and a security event is logged.
- An LLM cannot cause a write: specialists have no write tools; John's LLM output is parsed only into the router schema and synthesis text; proposals are validated against the registry and executed only with a user token.

### 16.5 Data minimization (what may go to an LLM)
Allowed: aggregates and results from Sentinel, goal names, category IDs/labels, sanitized resolved merchant names, the user's message, the rolling summary, memory facts, Categorizer status counts. Forbidden: account numbers (even masked), raw descriptions, VPAs, counterparty names of persons, bank customer IDs, balances in the rolling summary or memory facts.

### 16.6 LLM processing and consent (D-008)
- Prototype: `openai_compat` provider with a Qwen 32B-class model and API key in `backend/.env` (never in the frontend bundle; existing rule).
- Production: Gemini Enterprise for financial services, deployed per the bank's contract; no-training and retention terms are a contractual prerequisite (open item O-1 for counsel).
- `llm_processing_consent` is captured at onboarding. Without consent: John's chat and the specialists are unavailable; all workspaces, forms, alerts and Sentinel views work (they never need an LLM).

### 16.7 Rate limits (per user, registry `ratelimit.*`)
Chat messages 20/min and 300/day; LLM calls 120/hour; proposals 30/hour; action executions 60/hour; manual transactions 100/day; bank ingestion per tenant 10 batches/min.

### 16.8 Audit and observability
Every request has a `trace_id` linking: message, router decision, packets (hashed context), tool calls and result IDs, specialist responses, validation outcomes, proposals, confirmations, action requests and results, model and prompt versions, token counts, latencies. Traces are retained per the bank's policy (open item O-2) and readable only by `OPERATOR` with access logging. Action ledger and classification events are append-only.

---

## 17. Platform services contracts (no separate specification)

### 17.1 ACTION_SERVICE (module `backend/src/platform/action-service/`)
Responsibilities: proposal store and lifecycle (§13.3), tokens (§13.4), execution algorithm (§13.6), Plan Store (goals, caps, overrides with history), action ledger, undo, reconciliation, SYSTEM actions. `createProposal` runs the rule library on a fresh snapshot before storing: any MANDATORY code → the proposal is not stored (`REJECTED_VALIDATION` returned to the caller); WARNING codes are attached to the card; for T2 categorization scopes it calls the Categorizer `dryRun` and stores the affected counts on the proposal.
```js
/** @returns {Promise<Proposal>} */ createProposal({ action, params, tier, origin, proposer, baseVersions, snapshotId, warnings, requiresAck, requestId, traceId }, session)
/** @returns {Promise<{token:string, result:ActionResult}>} */ confirmAndExecute(proposalId, { paramsHash, ack }, session)
/** @returns {Promise<ActionResult>} */ executeT1({ action, params, intentToken, idempotencyKey }, session)
/** @returns {Promise<ActionResult>} */ undo(actionId, session)
declineProposal(proposalId, session); getProposal(proposalId, session)
```

### 17.2 TOOL_GATEWAY (`backend/src/platform/gateway/`)
`callTool({ tool, params }, { caller, taskId, requestId, traceId, snapshotId, deadlineMs, signal }, session) → SentinelResult@1`. Enforces allowlist (§10.4), identity injection, ResultRef resolution, per-request budget, deduplication, stores results by `tool_result_id`, and `verifyResultOwnership(toolResultIds, requestId, session)` used by John's validator.

### 17.3 SNAPSHOT_SERVICE (`backend/src/platform/snapshot/`)
`createSnapshot(reason, session) → Snapshot@1`; `getSnapshot(id, session)`; snapshot reads helpers used by Sentinel: `goalsAsOf(snap)`, `capsAsOf(snap, period)`, `profileAsOf(snap)`, `preferencesAsOf(snap)`, `balancesAsOf(snap)`, `declaredBillsAsOf(snap)`, and `categorizedAsOf(snap)` (delegates to the Categorizer's `categorized_as_of` view).

### 17.4 WORKSPACE_API (`backend/src/routes/v1/`)
Base `/api/v1`. Existing unversioned routes (`/api/goals`, `/api/budget`, `/api/insights/*`, `/api/coach/*`) are deprecated and removed once the frontend switches. Endpoint families: `/auth/*`, `/chat/*` (John), `/workspaces/{atlas|nova|iris|sentinel}/*` (views composed from Sentinel and stores), `/proposals/*`, `/actions/*` (T1 with intent token, undo), `/transactions/*` and `/review-queue/*` (Categorizer), `/alerts/*`, `/profile`, `/preferences`, `/bills`, `/memory/*`. Every view endpoint creates or reuses a `WORKSPACE_VIEW` snapshot and returns it with the data so the UI can show "as of" and the data-quality badge.

### 17.5 BUDGET_MONITOR (`backend/src/platform/budget-monitor/`)
Triggers: `categorization.updated` (recompute utilization for every affected category and previous category, per period in payload), `plan.changed` with cap entities, `period.rolled`, `balances.updated` (cash-flow risk re-scan for that user, debounced to at most once per hour), and `daily_scan`. For each (category with an effective cap, period): call `sentinel_run_category_utilization` on a `MONITOR_RUN` snapshot; compare tier with the stored tier; create/update/resolve `CAP_TIER` alerts on change only; set `provisional` from `tier_is_provisional`; set `cause`. Daily scan: `sentinel_detect_anomalies(lookback_days=35)` → `ANOMALY` alerts (dedupe on `(anomaly_type, merchant_id, period)`), `sentinel_forecast_bill_outlays` + `sentinel_flag_cashflow_risk` → `CASHFLOW_RISK` alerts (dedupe on `(period, severity)`). Latency target: alert stored within one categorization cycle, < 60 s after the event (F-06). Alert API used by Action Service: `createWatch`, `dismiss`, `reopen`.

### 17.6 PROFILE_SERVICE (`backend/src/platform/profile/`)
Stores accounts, balances, profile, fixed-expense lines, preferences and declared bills with history and `plan_version`/`balance_version` counters. Ingestion writes accounts and balances; all user changes arrive through Action Service executors. Onboarding (D-017): production pre-creates accounts and balances from the bank feed; the user is asked (all optional except consent) for declared income, fixed-expense lines, risk comfort, protected categories and LLM consent. Prototype keeps the existing questionnaire, mapping `fixed_housing_expense` to a fixed line on `HOUSING.RENT`, `risk_strategy` to `risk_comfort`, and the primary goal to a `CREATE_GOAL` executed with `origin: UI_FORM`.

### 17.7 INGESTION_GATEWAY (`backend/src/platform/ingestion/`, D-023)
- Inputs: `POST /ingest/v1/batches` (mTLS + HMAC-signed body, `Idempotency-Key`), or SFTP drop polled every 5 min. Accepted formats: ISO 20022 **camt.053** (statements with balances), **camt.054** (debit/credit notifications), **CSV** and **JSON** via a per-bank `MappingProfile@1` (column → canonical field, date formats, sign conventions).
- **MappingProfile@1** (one per bank and file layout, versioned, reviewed before activation): `{profile_id, tenant_code, source_format: CSV|JSON, version, encoding, delimiter?, header_row?, date_format, decimal_separator, amount_mode: SIGNED|DEBIT_CREDIT_COLUMNS|AMOUNT_PLUS_INDICATOR, field_map: {<canonical field>: <column or JSON path>}, indicator_values?: {debit: [..], credit: [..]}, status_values?: {pending: [..], posted: [..]}, channel_rules?: [{pattern, channel}]}`. Amounts are converted to paise exactly (string parsing, never float). camt adapters need no profile: they map `Ntry/Amt`, `CdtDbtInd`, `BookgDt`, `ValDt`, `Sts`, `AcctSvcrRef`, `BkTxCd`, `NtryDtls/TxDtls/RmtInf` and `RltdPties` to CanonicalTransaction@1 and `Bal` (`CLBD`, `CLAV`) to balances.
- Every format is converted by an adapter into **CanonicalBatch@1** before anything else sees it. The Categorizer only ever receives canonical batches; it never parses bank formats.
- Prototype: the team's own dataset is loaded through the same endpoint as canonical JSON or CSV (`scripts/load-dataset.js`).

```json
{"$id": "CanonicalBatch@1", "required": ["batch_id", "tenant_code", "source_format", "generated_at", "customers"],
 "properties": {
  "batch_id": {"type": "string"}, "tenant_code": {"type": "string"},
  "source_format": {"enum": ["CAMT053", "CAMT054", "CSV", "JSON", "MANUAL"]},
  "generated_at": {"type": "string", "format": "date-time"},
  "customers": {"type": "array", "items": {"type": "object", "required": ["customer_ref", "accounts"],
    "properties": {
     "customer_ref": {"type": "string", "description": "Bank's opaque customer reference; hashed on arrival"},
     "accounts": {"type": "array", "items": {"type": "object", "required": ["bank_account_ref", "account_type", "currency", "transactions"],
       "properties": {
        "bank_account_ref": {"type": "string"}, "masked_number": {"type": "string"},
        "account_type": {"enum": ["SAVINGS", "CURRENT", "CREDIT_CARD"]}, "currency": {"const": "INR"},
        "balances": {"type": "array", "items": {"type": "object", "required": ["kind", "amount_minor", "sign", "as_of"],
          "properties": {"kind": {"enum": ["CLOSING_BOOKED", "AVAILABLE"]}, "amount_minor": {"type": "integer", "minimum": 0}, "sign": {"enum": ["CREDIT", "DEBIT"]}, "as_of": {"type": "string", "format": "date-time"}}}},
        "transactions": {"type": "array", "items": {"$ref": "CanonicalTransaction@1"}}}}}}}}}}
```
```json
{"$id": "CanonicalTransaction@1", "required": ["bank_txn_ref", "booking_date", "amount_minor", "direction", "description_raw", "posting_status"],
 "properties": {
  "bank_txn_ref": {"type": "string", "description": "camt: AcctSvcrRef / NtryRef; unique per account"},
  "booking_date": {"type": "string", "format": "date"}, "value_date": {"type": "string", "format": "date"},
  "amount_minor": {"type": "integer", "minimum": 1}, "direction": {"enum": ["DEBIT", "CREDIT"]},
  "posting_status": {"enum": ["PENDING", "POSTED"]},
  "description_raw": {"type": "string", "maxLength": 500},
  "bank_tx_code": {"type": "string", "description": "ISO 20022 BkTxCd domain/family/subfamily when supplied"},
  "channel": {"enum": ["UPI", "NEFT", "IMPS", "RTGS", "NACH", "POS", "ECOM", "ATM", "CARD", "CHEQUE", "OTHER"]},
  "counterparty": {"type": "object", "properties": {"name": {"type": "string", "maxLength": 140}, "vpa": {"type": "string"}, "account_masked": {"type": "string"}, "ifsc": {"type": "string"}}},
  "mcc": {"type": "string", "pattern": "^[0-9]{4}$"},
  "balance_after_minor": {"type": "integer", "minimum": 0}, "balance_after_sign": {"enum": ["CREDIT", "DEBIT"]},
  "original_txn_ref": {"type": "string", "description": "Reversal/refund pointer when the bank provides one"}}}
```
Validation failures reject the row with a code (Categorizer §B.2.1); a malformed file or bad signature rejects the whole batch (`ingestion.completed` status `FAILED`).

### 17.8 LLM_ADAPTER (`backend/src/platform/llm/`)
```js
/** @returns {Promise<{ json?: object, text?: string, toolCalls?: Array, usage:{inputTokens:number, outputTokens:number}, model:string, provider:string }>} */
complete({ modelClass /* ROUTER|SPECIALIST|SYNTHESIS|SUMMARIZER|DIRECT */, system, messages, tools, jsonSchema, maxTokens, temperature, timeoutMs, signal, traceId })
```
Config: `LLM_PROVIDER` (`openai_compat` | `gemini_vertex` | `gemini_api` for local dev), `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL_ROUTER`, `LLM_MODEL_SPECIALIST`, `LLM_MODEL_SYNTHESIS`, `LLM_MODEL_SUMMARIZER`. Temperature ≤ 0.3. When the provider supports constrained JSON output it is used; the adapter still validates with Ajv. Prompts are versioned files under `backend/src/agents/<name>/prompts/` with a `CHANGELOG.md`; model and prompt versions are recorded in every trace. A model or prompt change ships only if its eval suite passes.

---

## 18. User interface map (five options, D-025)

| Option (nav item) | Purpose | Backed by | LLM involved? | Existing view to evolve |
| --- | --- | --- | --- | --- |
| **John** (chat) | Ask anything; one coherent, grounded answer; confirmation cards; Undo lines | JOHN → specialists → Sentinel; Action Service | Yes | `JohnCoachDashboard.jsx` |
| **Atlas** | Goal cards, progress and dates, create/edit/fund/release/pause/delete/restore modals, SIP calculator | WORKSPACE_API → Sentinel (`goal_progress`, `feasibility`, `available_balance`, `project_sip`, validators) and Action Service; embedded chat panel (`ui_context.workspace = ATLAS`) | Only in the chat panel | `AtlasStrategistView.jsx` |
| **Nova** | Caps per category with tier and settled/provisional split, daily envelope, alerts list, cap edit, rebalance cards, "Log expense" form | WORKSPACE_API → Sentinel (`utilization`, `velocity`, `rebalance`), Budget Monitor alerts, Action Service; chat panel (NOVA) | Only in chat panel and when an alert is opened | `NovaGuardianView.jsx` |
| **Iris** | Next-month planner: target month, per-category adjustment sliders, one-off outlay what-if, result with conservative balance and risk level; "Ask Iris" panel | WORKSPACE_API → `sentinel_run_spending_simulation` (deterministic, no LLM for the sliders); chat panel (IRIS) for advice | Only in chat panel | `IrisAdvisorView.jsx` |
| **Sentinel** | Financial observer: spending analyzer (category totals, trends, merchants), forecast and risk radar (bills incl. declared bills, cash-flow risk), balances and data-quality badge, **Needs review** list and transaction list with category chips and inline correction | WORKSPACE_API → Sentinel (`ledger_summary`, `spending_timeseries`, `forecast_bill_outlays`, `flag_cashflow_risk`), Categorizer (transactions, review queue), Profile (balances, bills); chat panel routes to JOHN (Sentinel is never a chat persona) | No (chat panel → John) | `SentinelPredictorView.jsx` + `SpendingAnalyserView.jsx` (merged; Sentinel is no longer hidden) |

Not navigation options: Settings (profile, preferences, rules, memory) — a page reached from the avatar menu; the Financial Health score — **no page**; computed on demand when the user asks John to quantify their habits (`sentinel_compute_health_score`, D-024). `FinancialHealthView.jsx` is retired. The Item Categorizer has no workspace; its surfaces are the category chip, inline correction, the Needs-review list (Sentinel workspace) and the rules page (Settings).

Embedded chat panels in workspaces post to the same `/api/v1/chat` endpoint with `ui_context.workspace` set; John routes with that workspace's specialist as default (John §B.3).

Notifications (D-007 7c): in-app only — a bell feed fed by `alert.changed`; no push, email or SMS in v1.

---

## 19. Schema versioning and compatibility
- Every schema has a name and major version (`TaskPacket@1`). Additive optional fields are minor changes and do not change the name; consumers MUST ignore unknown optional fields **except** where `additionalProperties: false` is declared (TaskPacket, SpecialistResponse, ActionRequest), which change major on any field change.
- Removing or renaming a field, changing a type, or adding an enum value that consumers must handle = new major (`@2`). Producers emit both majors for one release when consumers are deployed independently.
- `pipeline_version` (Categorizer), `model_version` (Sentinel), prompt versions (agents) and `taxonomy_version` are recorded on every result that depends on them.
- The JSON Schemas in `backend/src/shared/contracts/schemas/` are the machine-readable source; this document and the schemas must match (contract test `contracts.spec.js`).

---

## 20. Decision log

Source: **User** = answered by the team lead; **Delegated** = chosen by the spec author under the team lead's instruction "if you find something strictly better choose it" (recommendation from the audit, adopted; the team lead may veto any row).

| ID | Decision | Final requirement | Source | Specs affected |
| --- | --- | --- | --- | --- |
| D-001 | Single write path | ACTION_SERVICE is the only path for user/system changes to plan, profile, preferences, alerts and classifications; owning modules execute only when called by it. Bank ingestion is the one exception (data intake). | Delegated | All |
| D-002 | T1 semantics | §13.1: specialist T1 proposals need a tap; chat T1 executes on explicit instruction with Undo; intent tokens | Delegated | John, Nova, Categorizer |
| D-003 | Balances | Bank-feed balances (available > closing > derived); card outstanding is a liability; stale/unknown rules §5.2 | Delegated (refined by D-023) | Sentinel, Atlas, Iris |
| D-004 | Goal funding | Virtual earmarks; `ADD_FUNDS`/`RELEASE_FUNDS`; no auto-accrual; over-earmark warning; never auto-reduce | Delegated | Atlas, Sentinel |
| D-005 | Cap model | Standing caps + per-month overrides; rebalance = current-month overrides | Delegated | Nova, Iris, Sentinel |
| D-006 | Budget equation | §6.4; caps count against goal capacity; `SURPLUS_SHORTFALL` is MANDATORY | Delegated | Sentinel, Atlas, Nova, Iris |
| D-007 | Event-driven behaviour | Lazy narratives on alert open; deterministic daily scan; in-app notifications only | Delegated | Nova, Iris, John |
| D-008 | LLM deployment | Prototype: Qwen 32B-class via API key; production: Gemini Enterprise for financial services; Categorizer LLM stage off | **User** | All LLM components |
| D-009 / D-023 | Ingestion | Bank-delivered batches (API + files), ISO 20022 camt.053/054, CSV, JSON → adapters → CanonicalBatch@1; prototype loads own data the same way; no end-user statement upload in v1 | **User** (format choice delegated: "choose the wisest") | Categorizer, Sentinel, John |
| D-010 | Constraint registry | §12 | Delegated | All |
| D-011 | Cap hierarchy | Exclusive partition (Nova V4 wording kept; Sentinel aligned) | Delegated | Nova, Sentinel |
| D-012 | Overspend routing | Current-period status/fix → NOVA; recurring pattern or next-period plan → IRIS; both when both (John §B.3) | Delegated | John, Nova, Iris |
| D-013 | Refunds and interest | Net REFUND/REVERSAL/CHARGEBACK linked `REFUND_OF` in the month the credit posts; credit interest = INCOME | Delegated | Categorizer, Sentinel |
| D-014 | User corrections | Type, link, duplicate and own-account corrections in v1 (§13.2) | Delegated | Categorizer, John |
| D-015 | Pending rows | Counted as provisional; posted row supersedes | Delegated | Categorizer, Sentinel, Nova |
| D-016 | Protected override | Only user-originated (form or explicit chat instruction) with acknowledgment; never from a specialist proposal | Delegated | Nova, Iris, Action Service |
| D-017 | Onboarding | §17.6 | Delegated | Profile, John |
| D-018 | Goal state machine | §5.6 | Delegated | Atlas, Sentinel |
| D-019 | Temporary changes | Month overrides for caps and goal monthly adds; "split payment"/"move the date" are advice only | Delegated | Iris, Atlas |
| D-020 | End users | Bank's retail customers (B2B2C, white-label) | **User** | All |
| D-021 | Tenancy | One deployment per bank; `tenant_id` in every table | **User** | All |
| D-022 | Identity | Bank OIDC SSO in production; existing email+JWT in prototype | **User** | Workspace API, all |
| D-024 | Existing features kept | Manual transaction entry (Categorizer source MANUAL), manual upcoming bills (DeclaredBill), Financial Health score (Sentinel, on demand via John only, not shown as a page), SIP calculator (Sentinel projection, illustrative, Atlas workspace) | **User** | Categorizer, Sentinel, Atlas, John |
| D-025 | Five UI options | §18; Sentinel becomes a visible, LLM-free workspace | **User** | All |

---

## 21. Adopted defaults, assumptions and open items

### 21.1 Defaults adopted (from the audit table F-01…F-18; delegated)
Per-request budget 6 LLM calls / 12 tool calls / 20 s / 3 specialists / 1 reconcile round; proposal expiry 30 min; specialist cache 15 min; 6 recent turns; 8,000-token packet ceiling; tiers Healthy < 80 %, Warning 80–100 %, Exceeded > 100 %; calendar month; Asia/Kolkata; detection < 60 s, alert visible < 5 s after detection; Sentinel p95 0.3 s / 1 s / 2 s; 3 months minimum history for simulations and bill forecasts; trailing-median observed income; statistical methods any reproducible versioned method; numeric floors after baseline; priority tiers HIGH/MEDIUM/LOW; goal limit 20; transfer window 3 days; refund lookback 90 days; external transfers are spend; ATM withdrawals are spend; card payments excluded when card present; no cross-user merchant learning; history 30 days minimum; event payload 500 IDs; batch 500 rows; 3 retries; coverage window trailing 3 months + current.

### 21.2 Assumptions (stated, accepted unless vetoed)
| ID | Assumption |
| --- | --- |
| A-1 | One login = one individual customer; no joint/family accounts in v1 |
| A-2 | INR only, India only, `en-IN` only |
| A-3 | Web app only in v1 (white-labelled inside the bank's web/app shell) |
| A-4 | Each bank deployment sees only that bank's accounts for a customer; other-bank accounts are out of scope, so transfers to them are `TRANSFER_EXTERNAL` unless the user marks the counterparty as an own account |
| A-5 | Prototype runs on SQLite in a single process; production uses PostgreSQL |

### 21.3 Open items (do not block design or implementation)
| ID | Item | Owner | Blocks |
| --- | --- | --- | --- |
| O-1 | Regulatory classification, data-protection duties (DPDP Act), RBI data-localisation and outsourcing terms, LLM vendor terms | Counsel + bank | Production launch only |
| O-2 | Retention periods for chat, memory, traces and history beyond the 30-day minimum | Counsel + bank | Production launch only |
| O-3 | Numeric thresholds after baseline: coverage floors, confidence variance cut-offs, anomaly k and creep %, categorizer precision/review/uncategorized targets | Data owner + Sentinel owner | Tuning, not build |
| O-4 | Scale targets (customers per deployment, peak concurrent chats) for capacity planning | Product | Production sizing only |
| O-5 | Exact Qwen and Gemini model IDs per model class | Engineering after baseline eval | Nothing (adapter config) |

---

## 22. Consistency verification record

Run on 2026-10-10 against the seven files in `docs/specifications/`. "Script" = automated cross-document check (Python, kept with the review notes, not in the runtime); "Review" = manual comparison of the named sections.

| # | Check | Method | Result |
| --- | --- | --- | --- |
| 1 | Every responsibility has one owner | Review of §2.2, §2.3 against each spec §A | Pass. Previously unowned items now owned: balances (PROFILE_SERVICE), alerts (BUDGET_MONITOR), proposals/ledger/plan state (ACTION_SERVICE), snapshots (SNAPSHOT_SERVICE), bank formats (INGESTION_GATEWAY) |
| 2 | Every agent input has a source | Review: TaskPacket fields (John §B.4), Sentinel inputs (Sentinel §B.3 → Snapshot helpers), Categorizer inputs (§17.7, Action Service) | Pass |
| 3 | Every output has a consumer | Review of peer hints (§9.6), events (§14.1), DataQuality, alerts, ActionResult | Pass after fixes: `ingestion.completed` and `balances.updated` consumers corrected; Snapshot Service removed as a needless subscriber |
| 4 | Every cross-component call has an interface | Script: every `sentinel_*` name in all files exists in §10.4; Review: K.2 interfaces of each spec vs §17 | Pass (17 functions, 0 unknown) |
| 5 | Shared schemas match | Script: every `Name@n` referenced is defined; domain `kind` constants equal schema names | Pass after fixes (`MappingProfile@1` defined; `AtlasDomain@1`/`NovaDomain@1`/`IrisDomain@1` constants aligned) |
| 6 | No contradictory permissions | Script: each specialist's §F tool list and §B.2 workflow tools equal/within its §10.4 column; Review: §16.1 vs each §F | Pass |
| 7 | Data ownership unambiguous | Review §2.3 vs each spec §G | Pass |
| 8 | Tool execution and authorization boundaries consistent | Script: every proposal action in Atlas/Nova/Iris §C.3 exists in §13.2 and lists that specialist as proposer; tiers mentioned match the registry; Review: T1 chat rule identical in §13.1 and John §B.9.4 | Pass after fix (§13.1 aligned to "rule layer auto-executes, router-only → chip") |
| 9 | Error, timeout, retry, cancellation compatible | Review: §15 vs each spec §I and §E | Pass |
| 10 | Five UI options map to components | Script + Review: §18 vs Atlas §B.4, Nova §B.5, Iris §B.4, Sentinel §B.6.18, John §B.1 | Pass |
| 11 | Categorizer treated consistently as a shared capability | Review: no specialist calls it; John reads status/search and adds review items only; Sentinel reads the versioned view | Pass (one explicit exception documented: `addReviewItem` from John) |
| 12 | Parallelism and dependencies explicit | Script: every task type is routed by John (incl. `HANDLE_PEER_FINDING` via the dependency edge); Review §9, John §B.5 | Pass after fix (dependency-edge row added to John's routing table) |
| 13 | Context vs history vs durable memory distinguished | Review: John §B.4, §G; §7.3; §16.5 | Pass |
| 14 | Security and financial correctness enforceable | Review: each rule maps to a gateway, validator, Action Service or test acceptance criterion | Pass |
| 15 | Tests sufficient | Review: each spec §J covers unit, contract, edge, negative, security, failure, integration; acceptance IDs tie to requirement sections | Pass |
| 16 | Each component implementable independently | Review: each spec §K lists modules, interface, config, DoD and pre-integration dependencies | Pass |
| 17 | Integration needs no invented interfaces | Script: task types identical in §9.3, spec §A, §B.2 and §C.1; constraint codes used anywhere exist in §12; no lowercase legacy enums | Pass (0 issues on final run) |
