# Item Categorizer — Component Specification

| Attribute | Value |
| --- | --- |
| File | `docs/specifications/item-categorizer-spec.md` |
| Component ID | `CATEGORIZER` (working name *Tally*; code module `categorizer`) |
| Version | 3.0.0 (requirements freeze) — supersedes *Tally: Expense Categorization Agent Specification V2* |
| Kind | Deterministic-first background pipeline. Not conversational. No workspace. No LLM in v1. |
| Shared contracts | `system-contracts.md` (cited as `SC §n`) — identifiers, money, Transaction@1, movement types and spend definition (SC §6), DataQuality@1 (SC §8), events (SC §14), errors (SC §15), action registry (SC §13) |
| Decisions applied | D-001, D-002, D-008 (LLM stage stays off), D-009/D-023 (canonical bank batches), D-013, D-014, D-015, D-024 (manual entries) |

---

## A. Identity and purpose

### A.1 Mission
Turn every transaction the bank delivers (and every manual entry the user logs) into one reliable, typed, categorized, versioned record, so that Sentinel — and through it Atlas, Nova and Iris — compute from the same truth, and so that a user's correction propagates everywhere exactly once.

### A.2 Responsibilities
1. Accept canonical batches (SC §17.7) and manual entries; validate rows; store raw rows immutably.
2. Normalize descriptions; parse rails, VPAs and counterparty text.
3. Detect re-deliveries and supersessions (pending → posted, manual → bank).
4. Classify the **movement type** of every row (SC §6.1) and link pairs (transfers, card payments, refunds/reversals/chargebacks, duplicates).
5. Resolve merchants only from evidence (alias, VPA, merchant ID).
6. Assign a leaf category to category-bearing rows with evidence and an evidence-based confidence band, or abstain.
7. Route uncertain items to the review queue.
8. Store and version every result; serve versioned reads (`categorized_as_of`) for pinned snapshots.
9. Apply user corrections, confirmations, type/link/duplicate fixes, own-account marks, rules and undo — **only when invoked by the Action Service** (D-001).
10. Maintain the taxonomy and run migrations.
11. Publish `GET /status` (DataQuality@1) and `categorization.updated` events.

### A.3 Explicit exclusions
Spending analysis, budgets, savings plans, forecasts, anomaly or recurring-payment detection (Sentinel), behavioural duplicate detection (Sentinel), recommendations, any write outside its own tables, parsing bank file formats (Ingestion Gateway adapters do that), account and balance storage (Profile Service), real money movement, any LLM call (T5 stays off in v1).

### A.4 Boundaries with the other components
| Component | Relationship |
| --- | --- |
| JOHN | Reads `GET /status` at the start of every request; searches transactions (`listTransactions`) for chat corrections; turns specialist `MISCATEGORIZATION_SUSPECTED` hints into review items through `addReviewItem`. Never runs the pipeline; never categorizes. |
| SENTINEL | Reads typed, categorized rows only through `categorized_as_of(user, N)` with a read-only role. Never writes, never corrects. |
| ATLAS, NOVA, IRIS | No access at all. They see results only through Sentinel results. |
| ACTION_SERVICE | The only caller of write operations (corrections, confirmations, type/link/duplicate fixes, rules, undo, manual entries, review dismissals, migrations). |
| BUDGET_MONITOR, JOHN cache | Subscribe to `categorization.updated`. (The Snapshot Service needs no subscription: a snapshot reads the current version counter when it is created.) |
| INGESTION_GATEWAY | Delivers CanonicalBatch@1; the Categorizer acknowledges per batch. |
| PROFILE_SERVICE | Source of the user's account list (needed for own-account transfer pairing and card-payment matching). Read only. |
| WORKSPACE_API | Reads transactions, evidence, history, review queue, rules and status for the Sentinel workspace and Settings. |

### A.5 Dependencies and assumptions
- Shared library `shared/finance/` (movement-type rules, spend predicate, coverage formula — also linked by Sentinel).
- Taxonomy tables, merchant dictionary and global rules shipped as versioned seed data.
- Event outbox and job runner (SC §14).
- Assumption A-4 (SC §21.2): only the deploying bank's accounts are visible.

---

## B. Functional requirements

### B.1 Triggers
| Trigger | Entry point | Mode | Result |
| --- | --- | --- | --- |
| Bank batch received | `ingestBatch(batch, ctx)` called by Ingestion Gateway | Async job; commits in chunks of ≤ 500 rows (F-17) | One `categorization_version` + event per chunk |
| Manual entry (`ADD_MANUAL_TRANSACTION`) | `ingestManual(entry, ctx)` called by Action Service executor | Sync (≤ 5 s) | Row stored, typed, categorized; event `cause: MANUAL_ENTRY` |
| Manual delete | `deleteManual(txnId, ctx)` | Sync | Tombstone (row superseded), event |
| User correction / confirmation / type / link / duplicate / own-account / rule / undo / review dismissal | `applyChange(change, ctx)` called by Action Service executor | Sync (≤ 5 s); merchant/rule scopes in one DB transaction | Event with the matching `cause` |
| Dry run | `dryRun(change, ctx)` called by Action Service when creating a T2 proposal | Sync | Affected counts; no writes |
| Retryable rows | `reprocess_retryable` job every 30 min | Async | Re-run failed stages |
| Taxonomy release / rule change | `reprocess(scope, ctx)` | Async, idempotent | Re-run rows whose input hash or pipeline version changed; never overwrites `CONFIRMED` |
| Specialist hint | `addReviewItem({txn_id, reason: SPECIALIST_HINT}, ctx)` called by John | Sync | Review item (deduplicated); **no category change** |

A specialist needing categorized data never triggers categorization; it reads through Sentinel.

### B.2 Pipeline (order is normative)
Rationale kept from V2: duplicates are removed before pair matching so a duplicate row cannot create a false transfer; movement type is decided before any category so transfers never become spending.

| Step | Decision rules | Failure path |
| --- | --- | --- |
| **1. Validate and store raw** | Required: `bank_txn_ref`, `booking_date`, `amount_minor ≥ 1`, `direction`, `description_raw`, `posting_status`; account must map to an `account_id` of this user (Profile Service lookup by `bank_account_ref`). Compute `row_hash = SHA-256(account_id, booking_date, amount_minor, direction, normalized description, balance_after_minor)`. `date = value_date ?? booking_date`. | Row rejected with a code (B.2.1); batch continues. Batch status `COMPLETED`, `COMPLETED_WITH_ERRORS` or `FAILED` (unreadable/unsigned — rejected by the gateway). |
| **2. Normalize** | Unicode NFKC, lower-case, collapse whitespace; strip reference numbers and digit runs ≥ 6; parse rail from `channel` or descriptor patterns into `rail ∈ {UPI, NEFT, IMPS, RTGS, NACH, POS, ECOM, ATM, CARD, CHEQUE, OTHER}`, `counterparty_text`, `vpa`, `reference`. `description_raw` untouched. | Unparsed rail → `OTHER`; later steps use cleaned text only. |
| **3. Re-delivery and supersession** | (a) Same `(account_id, bank_txn_ref)` already stored → skip (re-delivery, counted `skipped_duplicates`). (b) Same `(account_id, row_hash)` → skip. (c) A `POSTED` row whose `bank_txn_ref` or `(account, amount, direction, date ±3 days, normalized description)` matches a stored `PENDING` row → new row links `SUPERSEDES` the pending row. (d) A bank row matching a `MANUAL` row of the same user (same amount and direction, date ±2 days, account = manual entry's chosen account or any account if `MANUAL_CASH` was not chosen) → bank row links `SUPERSEDES` the manual row **only if exactly one candidate**; otherwise review `POSSIBLE_DUPLICATE`. (e) Two different refs with identical amount, day and normalized text on one account → keep both, flag the later `POSSIBLE_DUPLICATE`. Never delete on a guess. | Behavioural duplicates (double swipe) are Sentinel's anomaly job. |
| **4. Type the movement** | In order, first match wins: (a) **own-account transfer**: equal amount, opposite direction, two accounts owned by the user, within 3 days (F-11), exactly one best match → both `TRANSFER_INTERNAL` + `TRANSFER_PAIR`; or debit/credit whose counterparty key (VPA or masked account + IFSC) is in the user's own-account counterparty list (from `MARK_OWN_ACCOUNT_COUNTERPARTY`) → `TRANSFER_INTERNAL` without pair. (b) **card payment**: debit from SAVINGS/CURRENT matched with a credit on the user's CREDIT_CARD account (same amount, ±3 days) → both `CARD_PAYMENT` + `CARD_PAYMENT_PAIR`; or a payment descriptor to a card (BBPS/credit-card patterns, `bank_tx_code`) with no card account of the user → `CARD_PAYMENT`, `counterpart_missing = true`. (c) **refund / reversal / chargeback** (credit): `original_txn_ref` supplied → link `REFUND_OF` to it and type by `bank_tx_code` (reversal/chargeback codes) else `REFUND`; else reversal descriptors ("REV", "REVERSAL", failed UPI) → `REVERSAL` linked to the debit with same amount within 7 days; else refund keywords or a merchant match to an earlier debit within 90 days (F-11), amount ≤ original → `REFUND` + `REFUND_OF`; no original found → `REFUND` unmatched, review `UNMATCHED_REFUND`. (d) **cash**: rail `ATM` or ATM codes → `CASH_WITHDRAWAL`. (e) **fees and interest** by `bank_tx_code`/descriptor: debit charges → `FEE`; debit interest → `INTEREST`; credit interest → `INCOME` (leaf `INCOME.INTEREST_RECEIVED`) (D-013). (f) **loan EMI**: NACH/ECS to a lender pattern or EMI descriptors → `LOAN_REPAYMENT`. (g) **person-to-person debit**: UPI/IMPS/NEFT debit whose counterparty has no merchant match and whose VPA/name is not in the merchant dictionary and carries a P2P indicator → `TRANSFER_EXTERNAL`. (h) remaining debit → `EXPENSE`. (i) remaining credit → `INCOME`. Multiple candidates at (a)–(c) → `UNKNOWN`, review `AMBIGUOUS`; never guess a pair. Pairing re-runs when a later batch brings the missing side. | — |
| **5. Merchant match** | Only for `EXPENSE`, `FEE`, `TRANSFER_EXTERNAL`, `REFUND` rows. Order: user alias, global alias (exact), VPA, merchant ID, fuzzy candidate. A fuzzy hit is a candidate only and never reaches `HIGH` alone. | No match → `merchant_match: NONE`. Nothing is invented. |
| **6. Rules** | For category-bearing rows (SC §6.1). Precedence: confirmed user history for this merchant/counterparty key (E1) → user rules (E1, newest wins) → global merchant rules / exact alias (E2) → global keyword, MCC and `bank_tx_code` rules (E3) → fuzzy (E4). Highest tier wins; conflicting rules at the same tier → `MEDIUM`. `LOAN_REPAYMENT` → `FINANCE.LOAN_EMI`, `CASH_WITHDRAWAL` → `CASH.ATM_WITHDRAWAL`, `TRANSFER_EXTERNAL` → `TRANSFERS.PERSONAL_PAYMENT` by default (F-12), `FEE` → `FEES.*` leaf by descriptor, `INTEREST` → `FINANCE.INTEREST`. | No rule → abstain (step 9). |
| **7. Classifier** | Optional, **off in v1**. Interface reserved: `classify(rows) → {category_id, calibrated_probability}`. | — |
| **8. LLM fallback** | **Off in v1** (D-008: raw descriptions must not reach an LLM until counsel approves T5). | — |
| **9. Confidence and routing** | Section B.4. | — |
| **10. Persist and publish** | In **one DB transaction per chunk**: insert raw rows; upsert `txn_classification`; close/open `txn_classification_history` rows; insert `classification_events`; upsert `txn_links`; open/close `review_items`; increment `categorization_version`; update `user_categorization_state`; write `categorization.updated` to the outbox. | Transaction fails → rollback → chunk retried up to 3 times with backoff 2 s/10 s/60 s (F-17); then rows of that chunk are left in staging with `retryable: true` and counted in `pending_pipeline_count`. |

#### B.2.1 Row rejection codes
`MISSING_FIELD`, `INVALID_DATE`, `FUTURE_DATE` (> today + 1 day), `INVALID_AMOUNT` (not a positive integer), `INVALID_DIRECTION`, `UNKNOWN_ACCOUNT`, `CURRENCY_NOT_SUPPORTED`, `DESCRIPTION_TOO_LONG` (> 500, truncated, not rejected — logged only). Rejected rows are recorded in `ingestion_errors` with `row_index`, `code`, `field`; `retryable: false`.

### B.3 Category-bearing rows
Only rows whose type carries a category (SC §6.1) get `prediction` and `effective_category_id`; all others get `effective_status = NOT_APPLICABLE` except `INCOME`, which MAY carry an `INCOME.*` leaf (status `AUTO`/`CONFIRMED`) and `UNKNOWN`, which is `UNCATEGORIZED` with review `AMBIGUOUS`.

### B.4 Confidence bands and effective status
| Band | Evidence | Action | `effective_status` | Consumers treat it as |
| --- | --- | --- | --- | --- |
| `HIGH` | E1 user-confirmed pattern; E2 exact alias / VPA / merchant ID; (later) calibrated classifier above threshold | Assign | `AUTO` | Settled (if `POSTED`) |
| `MEDIUM` | E3 keyword/MCC/bank_tx_code rule; E4 fuzzy; conflicting same-tier rules | Assign provisionally, ask | `NEEDS_REVIEW` | Provisional in its category |
| `LOW` | No match | Abstain | `UNCATEGORIZED` | Uncategorized bucket, never a category |
| User | Confirmed or corrected | Always wins | `CONFIRMED` | Settled |

`provisional = (effective_status = NEEDS_REVIEW) OR (posting_status = PENDING)`. Confidence is evidence-based; no model's self-reported confidence is ever used as a probability.

### B.5 Corrections and confirmations (all executed via Action Service; SC §13.2)
| Action | Tier | Effect |
| --- | --- | --- |
| `CONFIRM_CATEGORY` | T1 | Row → `CONFIRMED` with its current effective category. A `PENDING` row is recorded as confirmed-intent and becomes `CONFIRMED` only when its posted successor arrives (the confirmation transfers to the successor). |
| `RECATEGORIZE_TRANSACTION` scope `TRANSACTION` | T1 | Row → `CONFIRMED` with new leaf. Stored prediction untouched. |
| `RECATEGORIZE_TRANSACTION` scope `MERCHANT` | T2 | Creates a user rule keyed on the **matching key** and applies it to past rows that are not `CONFIRMED` (unless `include_confirmed: true` was ticked). Matching key: `merchant_id` if present, else `vpa`, else exact normalized `counterparty_text` (≥ 4 chars). If none exists the UI and John offer only scope `TRANSACTION` (fixes X-31). Preview via dry run. |
| `CREATE_CATEGORY_RULE` | T2 | Rule with conditions `{merchant_id?, vpa?, text_contains?, amount_min_minor?, amount_max_minor?, direction?, account_id?}` → leaf; dry run first; applies to non-confirmed rows. |
| `DELETE_CATEGORY_RULE` | T1 | Disables rule; affected `AUTO` rows are reprocessed. |
| `SET_TRANSACTION_TYPE` | T1 | Allowed transitions below; recomputes category-bearing status; removes links invalid for the new type. |
| `CONFIRM_LINK` / `BREAK_LINK` | T1 | Creates or removes `TRANSFER_PAIR`, `CARD_PAYMENT_PAIR`, `REFUND_OF`, `DUPLICATE_OF` between two rows of the same user; re-types both sides as needed. |
| `RESOLVE_DUPLICATE` | T1 | `IS_DUPLICATE` → link `DUPLICATE_OF` (row excluded from spend); `NOT_DUPLICATE` → closes the review item and suppresses re-flagging for that pair. |
| `MARK_OWN_ACCOUNT_COUNTERPARTY` | T2 | Adds the counterparty key to the user's own-account list; re-types matching past rows to `TRANSFER_INTERNAL` (dry-run counts on the card). |
| `UNDO_CLASSIFICATION_CHANGE` | T1 | Reverts the rows changed by one `correlation_id` if their `row_version` is unchanged since; else `VERSION_CONFLICT` listing rows. Within 24 h. |
| `DISMISS_REVIEW_ITEM` | T1 | Closes the item; the row keeps its current status. |

**Allowed type transitions for `SET_TRANSACTION_TYPE`** (by direction):
- DEBIT rows: any of `EXPENSE`, `TRANSFER_EXTERNAL`, `TRANSFER_INTERNAL`, `CARD_PAYMENT`, `LOAN_REPAYMENT`, `FEE`, `CASH_WITHDRAWAL`, `INTEREST`.
- CREDIT rows: any of `INCOME`, `REFUND`, `REVERSAL`, `CHARGEBACK`, `TRANSFER_INTERNAL`, `CARD_PAYMENT` (card-side credit).
- `UNKNOWN` may become any type allowed for its direction. Nothing may become `UNKNOWN` by user action.
- Setting `REFUND`/`REVERSAL`/`CHARGEBACK` without a `CONFIRM_LINK` leaves the row unmatched (reported separately, never income).

Every change: audit event (actor `USER`, `correlation_id` = action_id), new `categorization_version`, `categorization.updated` with `previous_category_id` for every changed row, and corrections update user rules/aliases/history only — never global data. Global dictionary changes happen only through a reviewed, de-identified curation release (process does not exist yet; out of scope).

### B.6 Taxonomy migrations
| Change | Rule | Effect on existing results |
| --- | --- | --- |
| Add | New `taxonomy_version` | None; optional reprocess of `UNCATEGORIZED` rows |
| Rename | Label only, ID unchanged | None |
| Merge A → B | Migration entry | All rows with A, including `CONFIRMED`, re-pointed to B in one audited migration; caps, protected categories and fixed-expense lines re-mapped via SYSTEM action `APPLY_TAXONOMY_MIGRATION` (SC §13.2); user sees a summary in the notification feed |
| Split A → B, C | A deprecated with successors | Predicted rows re-run; `CONFIRMED` rows keep A as legacy label and get review item `TAXONOMY_MIGRATION`; caps on A get `CAP_ON_DEPRECATED_CATEGORY` warning (user chooses) |
| Deprecate | `replaced_by` required; IDs never deleted or reused | Consumers resolve through the migration map |

### B.7 Review queue
Reasons: `LOW_CONFIDENCE`, `NEW_MERCHANT`, `AMBIGUOUS`, `POSSIBLE_DUPLICATE`, `UNMATCHED_REFUND`, `CARD_COUNTERPART_MISSING`, `TAXONOMY_MIGRATION`, `SPECIALIST_HINT`. One open item per `(user, txn_id, reason)`. An item closes automatically when the row becomes `CONFIRMED`, its type/link is fixed, or it is dismissed. The list is shown in the Sentinel workspace; each item offers exactly the T1 actions relevant to its reason.

### B.8 Status
`getStatus(session) → DataQuality@1 + {taxonomy_version, last_event_at}` computed from `user_categorization_state` (maintained in step 10; O(1) read; p95 < 50 ms).

### B.9 Acceptance criteria (requirement-tied)
| ID | Requirement | Criterion |
| --- | --- | --- |
| CAT-AC-01 | B.2 step 4, SC §6 | Zero transfers or card payments counted as spend on the golden set (Sentinel spend over golden rows equals expected) |
| CAT-AC-02 | B.2 step 4(c), D-013 | Matched refunds, reversals and chargebacks link `REFUND_OF`; none typed `INCOME` |
| CAT-AC-03 | B.2 step 3 | Re-delivering the same batch creates no rows, no events, no new `categorization_version`; a genuine repeat purchase (different `bank_txn_ref`) is never removed |
| CAT-AC-04 | B.2 step 3(c)(d) | A posted row supersedes its pending twin and a matching manual entry; spend counts it once |
| CAT-AC-05 | B.2 step 5 | Zero merchants set without alias, VPA or ID evidence |
| CAT-AC-06 | B.5 | Merchant-scope correction changes only non-confirmed rows unless `include_confirmed`; each change has an audit event; undo restores prior state |
| CAT-AC-07 | B.5, X-31 | A row with no matching key is never offered merchant scope |
| CAT-AC-08 | C.5 | A snapshot pinned to version N returns identical categories after later corrections |
| CAT-AC-09 | B.2 step 10 | A forced failure inside the chunk transaction leaves neither the change nor its event |
| CAT-AC-10 | SC §14 | Consumers fed duplicate and out-of-order events do not double-process |
| CAT-AC-11 | SC §8.2 | `coverage_by_amount_bp` from status equals Sentinel's for the same version on the test set |
| CAT-AC-12 | B.6 | Merge re-points rows and triggers cap/preference/fixed-line migration; split creates review items; old IDs resolve |
| CAT-AC-13 | B.2.1 | Invalid rows are reported with codes; valid rows processed; an interrupted job resumes without duplicates |
| CAT-AC-14 | SC §16.3 | Cross-user reads of results, rules, aliases and review items return 404/no data |
| CAT-AC-15 | B.5 | Parallel corrections on one row: exactly one succeeds, the other gets `VERSION_CONFLICT` |
| CAT-AC-16 | A.3, D-008 | Static check: no LLM or model-provider client imported in `categorizer/` |
| CAT-AC-17 | B.5 | `SET_TRANSACTION_TYPE` rejects transitions outside the allowed table with `CATEGORY_NOT_APPLICABLE_TO_TYPE`/`INVALID_INPUT` |
| CAT-AC-18 | B.1 | A specialist hint never changes a category; it creates at most one open review item |
| CAT-AC-19 | Quality (measured, not pass/fail) | Per-category precision/recall, auto-assigned precision, review share, uncategorized share, merchant-normalization accuracy reported per release; targets set after baseline (O-3) |

---

## C. Data contracts

### C.1 Input: CanonicalBatch@1 / CanonicalTransaction@1
Defined in SC §17.7. The Categorizer accepts nothing else from banks. `ctx = {tenant_id, batch_id, idempotency_key, trace_id}` (internal call; never from an LLM).

### C.2 Input: ManualEntry@1 (from `ADD_MANUAL_TRANSACTION`)
```json
{"$id": "ManualEntry@1", "type": "object", "additionalProperties": false,
 "required": ["date", "amount_minor", "direction", "description", "account_id"],
 "properties": {
  "date": {"type": "string", "format": "date", "description": "≤ today (Asia/Kolkata), ≥ today − 90 days"},
  "amount_minor": {"type": "integer", "minimum": 1, "maximum": 100000000},
  "direction": {"enum": ["DEBIT", "CREDIT"]},
  "description": {"type": "string", "minLength": 1, "maxLength": 80},
  "account_id": {"type": "string", "description": "The user's MANUAL_CASH account or one of their bank accounts (for an entry the bank has not delivered yet)"},
  "category_id": {"type": ["string", "null"], "description": "Optional leaf chosen by the user → row CONFIRMED immediately"}
 }}
```
Manual rows: `source = MANUAL`, `bank_txn_ref = "man_<ULID>"`, `posting_status = POSTED`, pipeline steps 2–10 apply.

### C.3 Output: ClassificationResult@1 (stored per row; `GET /transactions/{id}`)
```json
{"$id": "ClassificationResult@1",
 "required": ["txn_id", "description_clean", "rail", "merchant", "type", "links", "counterpart_missing", "prediction", "confirmed", "effective", "review", "taxonomy_version", "pipeline_version", "categorization_version", "row_version"],
 "properties": {
  "txn_id": {"type": "string"},
  "description_clean": {"type": "string", "maxLength": 200},
  "rail": {"enum": ["UPI", "NEFT", "IMPS", "RTGS", "NACH", "POS", "ECOM", "ATM", "CARD", "CHEQUE", "OTHER"]},
  "counterparty_text": {"type": ["string", "null"], "maxLength": 140, "description": "Never sent to an LLM"},
  "merchant": {"type": "object", "required": ["merchant_match"], "properties": {
     "merchant_id": {"type": ["string", "null"]}, "merchant_name": {"type": ["string", "null"], "maxLength": 40},
     "merchant_match": {"enum": ["EXACT_ALIAS", "USER_ALIAS", "VPA", "MERCHANT_ID", "FUZZY_CANDIDATE", "NONE"]}}},
  "type": {"$ref": "SC#/Transaction@1/$defs/MovementType"},
  "links": {"type": "array", "items": {"$ref": "SC#/Transaction@1/$defs/Link"}},
  "counterpart_missing": {"type": "boolean"},
  "prediction": {"type": "object", "required": ["method", "confidence_band", "evidence"], "properties": {
     "category_id": {"type": ["string", "null"], "description": "Leaf ID; null when abstained or non-category type"},
     "method": {"enum": ["USER_RULE", "USER_HISTORY", "MERCHANT_ALIAS", "GLOBAL_RULE", "TYPE_DEFAULT", "CLASSIFIER", "NONE"]},
     "evidence_tier": {"enum": ["E1", "E2", "E3", "E4", "E5", null]},
     "confidence_band": {"enum": ["HIGH", "MEDIUM", "LOW"]},
     "score": {"type": ["integer", "null"], "description": "Calibrated probability in bp; classifier only; never from an LLM"},
     "evidence": {"type": "array", "items": {"type": "string", "maxLength": 160}, "maxItems": 5},
     "rule_id": {"type": ["string", "null"]}, "model_version": {"type": ["string", "null"]}}},
  "confirmed": {"type": ["object", "null"], "properties": {"category_id": {"type": "string"}, "confirmed_by": {"const": "USER"}, "confirmed_at": {"type": "string", "format": "date-time"}, "scope": {"enum": ["TRANSACTION", "MERCHANT", "RULE"]}}},
  "effective": {"type": "object", "required": ["status", "provisional"], "properties": {
     "category_id": {"type": ["string", "null"]},
     "status": {"enum": ["CONFIRMED", "AUTO", "NEEDS_REVIEW", "UNCATEGORIZED", "NOT_APPLICABLE"]},
     "provisional": {"type": "boolean"}}},
  "review": {"type": "object", "required": ["required"], "properties": {"required": {"type": "boolean"}, "reasons": {"type": "array", "items": {"enum": ["LOW_CONFIDENCE", "NEW_MERCHANT", "AMBIGUOUS", "POSSIBLE_DUPLICATE", "UNMATCHED_REFUND", "CARD_COUNTERPART_MISSING", "TAXONOMY_MIGRATION", "SPECIALIST_HINT"]}}}},
  "taxonomy_version": {"type": "integer"}, "pipeline_version": {"type": "string"},
  "categorization_version": {"type": "integer"}, "row_version": {"type": "integer"}
 }}
```
The V2 `subcategory_id` field is removed: `category_id` is always a leaf (SC §6.3).

### C.4 Output: status
`GET /status` → `DataQuality@1` (SC §8.1) plus `taxonomy_version`, `last_event_at`.

### C.5 Output: versioned read view (consumed by Sentinel only)
`categorized_as_of(user_id, N)` returns `Transaction@1` rows (SC §5.3) from `raw_transactions ⨝ txn_classification_history` where `valid_from_version ≤ N AND (valid_to_version IS NULL OR valid_to_version > N)`, plus links valid at N. Superseded and tombstoned rows are returned with their `SUPERSEDES` link so Sentinel can exclude them deterministically.

### C.6 Taxonomy version 1 (normative list)
| Parent | Leaves |
| --- | --- |
| `HOUSING` | `RENT`, `MAINTENANCE_SOCIETY`, `REPAIRS`, `PROPERTY_TAX` |
| `UTILITIES` | `ELECTRICITY`, `WATER`, `GAS`, `INTERNET`, `MOBILE`, `TV_DTH` |
| `FOOD` | `GROCERIES`, `DINING`, `DELIVERY`, `COFFEE_SNACKS` |
| `TRANSPORT` | `FUEL`, `PUBLIC_TRANSIT`, `CAB_AUTO`, `VEHICLE_SERVICE`, `PARKING_TOLLS` |
| `TRAVEL` | `FLIGHTS`, `TRAINS_BUSES`, `LODGING`, `OTHER_TRAVEL` |
| `HEALTH` | `PHARMACY`, `DOCTOR_HOSPITAL`, `DIAGNOSTICS`, `FITNESS` |
| `SHOPPING` | `ONLINE`, `CLOTHING`, `ELECTRONICS`, `HOME_GOODS` |
| `ENTERTAINMENT` | `MOVIES_EVENTS`, `GAMES`, `HOBBIES` |
| `SUBSCRIPTIONS` | `STREAMING`, `SOFTWARE`, `NEWS_MEDIA`, `MEMBERSHIPS` |
| `EDUCATION` | `TUITION`, `COURSES`, `BOOKS` |
| `INSURANCE` | `HEALTH`, `LIFE`, `VEHICLE`, `OTHER_INSURANCE` |
| `FINANCE` | `LOAN_EMI`, `INTEREST` |
| `FEES` | `BANK_CHARGES`, `LATE_PAYMENT`, `ATM_FEE`, `TAXES_ON_FEES` |
| `PERSONAL` | `CARE`, `GIFTS`, `DONATIONS`, `PETS`, `CHILDCARE` |
| `CASH` | `ATM_WITHDRAWAL` |
| `TRANSFERS` | `PERSONAL_PAYMENT` |
| `OTHER` | `UNCLASSIFIED` |
| `INCOME` (income only) | `SALARY`, `BUSINESS`, `INTEREST_RECEIVED`, `GIFTS_RECEIVED`, `OTHER_INCOME` |

Leaf IDs are written `PARENT.LEAF`. `SUBSCRIPTIONS` is a topic category; whether a payment recurs is Sentinel's cadence detection. Region packs may add leaves and aliases, never change top-level IDs.

### C.7 Storage (tables owned; all user tables carry `tenant_id`, `user_id`)
| Table | Key fields | Constraints |
| --- | --- | --- |
| `raw_transactions` (immutable) | `txn_id`, `account_id`, `batch_id`, `bank_txn_ref`, `row_hash`, `booking_date`, `value_date?`, `date`, `description_raw` (encrypted at rest), `amount_minor`, `currency`, `direction`, `posting_status`, `source`, `channel?`, `bank_tx_code?`, `mcc?`, `counterparty_json?` (encrypted), `balance_after_minor?`, `original_txn_ref?` | Unique `(user_id, account_id, bank_txn_ref)`; unique `(user_id, account_id, row_hash)`; `amount_minor > 0`; no UPDATE/DELETE (manual delete = tombstone event + `SUPERSEDES` from a tombstone marker) |
| `txn_classification` | One row per txn: all fields of C.3 flattened, `row_version` | `effective_status = CONFIRMED ⇒ confirmed_category_id NOT NULL`; indexes `(user_id, effective_status)`, `(user_id, merchant_id)`, `(user_id, effective_category_id)` |
| `txn_classification_history` | `txn_id`, `type`, `effective_category_id?`, `effective_status`, `posting_status`, `merchant_id?`, `counterpart_missing`, `superseded_by?`, `valid_from_version`, `valid_to_version?` | One open row per txn; ranges never overlap |
| `txn_links` (+ `valid_from_version`, `valid_to_version`) | `from_txn_id`, `to_txn_id`, `kind` | Both rows same user; unique open `(from, to, kind)` |
| `classification_events` (append-only) | `event_id`, `txn_id`, `event_type` (`PREDICTED`, `AUTO_ASSIGNED`, `CONFIRMED`, `CORRECTED`, `TYPE_CHANGED`, `LINKED`, `UNLINKED`, `MIGRATED`, `REPROCESSED`, `SUPERSEDED`, `UNDONE`), `before`, `after`, `actor`, `pipeline_version`, `categorization_version`, `correlation_id`, `created_at` | No UPDATE/DELETE |
| `merchants`, `merchant_aliases` (`GLOBAL`/`USER`), `global_rules` | as V2 | Global rows read-only to the app role |
| `user_category_rules` | `rule_id`, `conditions_json`, `category_id`, `priority`, `enabled`, `created_from_action_id`, `version` | Index `(user_id, enabled, priority)` |
| `own_account_counterparties` | `user_id`, `key_kind` (`VPA`/`ACCOUNT_IFSC`), `key_hash`, `created_from_action_id` | Unique `(user_id, key_kind, key_hash)` |
| `categories`, `taxonomy_versions`, `category_migrations` | ID, version, parent, label, status, `replaced_by`; `from_id`, `to_ids`, `kind` | IDs never reused or deleted |
| `ingestion_batches`, `ingestion_errors` | `batch_id`, `idempotency_key`, `status`, counts; per-row errors | Unique `(tenant_id, idempotency_key)` |
| `review_items` | `item_id`, `txn_id`, `reason`, `status` (`OPEN`, `RESOLVED`, `DISMISSED`) | Unique open `(user_id, txn_id, reason)` |
| `user_categorization_state` | `categorization_version`, DataQuality@1 fields, `updated_at` | PK `user_id` |

### C.8 Data-quality behaviour on bad input
| Situation | Behaviour |
| --- | --- |
| Missing required field / invalid value | Row rejected with code (B.2.1) |
| Unknown account | `UNKNOWN_ACCOUNT`; batch continues; OPERATOR metric |
| Stale/out-of-order batch (older booking dates) | Accepted; history versions keep snapshots stable; monitor recomputes affected periods from `periods[]` in the event |
| Conflicting re-delivery (same `bank_txn_ref`, different amount) | Keep the stored row; reject the new one with `CONFLICTING_REDELIVERY`; OPERATOR alert |
| Two equally good pair candidates | `UNKNOWN` + `AMBIGUOUS` review |

### C.9 Legacy migration (prototype repository)
Existing `transactions` rows are re-ingested once as a `MANUAL`-format canonical batch (rupees × 100 → paise, rounded half-even) and run through the full pipeline; their old category strings are **not** trusted. Existing `budget_categories` caps are migrated by the Plan Store with this map:

| Legacy category | Taxonomy ID |
| --- | --- |
| Food Delivery | `FOOD.DELIVERY` |
| Subscriptions | `SUBSCRIPTIONS` |
| Shopping | `SHOPPING` |
| Groceries | `FOOD.GROCERIES` |
| Transport | `TRANSPORT` |
| Utilities | `UTILITIES` |
| Insurance | `INSURANCE` |
| Housing | `HOUSING` (covers only non-FIXED leaves once the onboarding rent becomes a fixed line on `HOUSING.RENT`) |
| Uncategorized | dropped (uncategorized spend is never capped) |

### C.10 Schema versioning
`ClassificationResult@1`, `ManualEntry@1` follow SC §19. `pipeline_version` (semver) is stamped on every row; a change to step 4 or 6 logic bumps the minor version and triggers `reprocess` of non-confirmed rows only when the team opts in.

---

## D. Processing logic and decision workflow
The Categorizer has no LLM reasoning. Its "decisions" are the ordered, deterministic rules of B.2 and B.4. Observable outputs: `prediction.method`, `evidence_tier`, `evidence[]` (human-readable reasons such as `alias 'SWIGGY' matched merchant mer_…`), `review.reasons`. The "Why is this here?" answer John gives is built only from these stored fields.

Limits: a chunk ≤ 500 rows; a batch job ≤ 15 min before it checkpoints and yields; a synchronous change ≤ 5 s; a merchant-scope change ≤ 5,000 rows per action (larger → `UNSUPPORTED_OPERATION`, suggest a rule with narrower conditions).

Facts vs estimates: categories are labels with an evidence band, never probabilities; nothing the Categorizer emits is a forecast.

---

## E. Communication and integration

### E.1 Callers and operations
| Caller | Operation | Sync/async | Correlation |
| --- | --- | --- | --- |
| INGESTION_GATEWAY | `ingestBatch(batch, ctx)` | Async job; returns `{batch_id, status: ACCEPTED}` | `batch_id`, `trace_id` |
| ACTION_SERVICE | `ingestManual`, `deleteManual`, `applyChange`, `dryRun` | Sync | `action_id` as `correlation_id`, `idempotency_key` |
| JOHN | `getStatus`, `listTransactions`, `getTransaction`, `addReviewItem` | Sync | `request_id`, `trace_id` |
| WORKSPACE_API | `getStatus`, `listTransactions`, `getTransaction` (with evidence and history), `listReviewItems`, `listRules`, `getTaxonomy` | Sync | `request_id` |
| SENTINEL | `categorized_as_of(user, N)` (SQL view, read-only role) | Sync | `snapshot_id` |
| Jobs | `reprocess`, `reprocess_retryable`, `applyMigration` | Async | `job_id` |

The Categorizer calls: PROFILE_SERVICE `listAccounts(user)` (read), EVENT_BUS outbox (write in its transaction). Nothing else.

### E.2 HTTP surface (exposed by WORKSPACE_API; reads only)
`GET /api/v1/transactions` (filters `status`, `type`, `category_id`, `merchant_id`, `review_required`, `date_from`, `date_to`, `amount_min_minor`, `amount_max_minor`, `account_id`; cursor pagination, page ≤ 100), `GET /api/v1/transactions/{txn_id}` (result + evidence + history), `GET /api/v1/review-queue`, `GET /api/v1/rules`, `GET /api/v1/taxonomy?version=`, `GET /api/v1/categorization/status`. **All writes go through `/api/v1/actions` and `/api/v1/proposals`** (Action Service). Foreign IDs → 404.

### E.3 Event published
`categorization.updated` (SC §14.1) with `cause`, `changed_txn_ids` (omitted above 500, F-17), `affected_categories[] {category_id, previous_category_id}` (null, not `UNCATEGORIZED`, for none), `periods[]` (distinct `YYYY-MM` of changed rows). Delivered at least once.

### E.4 Failure behaviour toward callers
| Situation | Caller receives | Retry |
| --- | --- | --- |
| Validation error on a change | `INVALID_INPUT` / `CATEGORY_NOT_APPLICABLE_TO_TYPE` (422) / `UNKNOWN_CATEGORY` (422) | No |
| Version conflict | `VERSION_CONFLICT` with current `row_version`s | After re-read |
| Same idempotency key, same body | Original response | — |
| Same key, different body | `IDEMPOTENCY_KEY_REUSED` | No |
| DB transaction failure | `PERSISTENCE_FAILED` | Once, same key |
| Timeout | `TIMEOUT` (no partial writes: single transaction) | Once, same key |
| Batch partially invalid | `COMPLETED_WITH_ERRORS` with per-row codes | Re-send corrected rows only |

---

## F. Tools and permissions
- DB role `categorizer_rw`: read/write its tables (C.7); read `accounts` via Profile Service API; no access to plan, profile, alert or chat tables.
- Sentinel's role `sentinel_ro` gets SELECT on the `categorized_as_of` view only.
- Write operations require a `ctx` produced by the Action Service (contains `action_id`, `actor`, verified `user_id`); a call without it is rejected (`FORBIDDEN`). Bank batches require the Ingestion Gateway's internal credential. **Single exception:** `addReviewItem` with reason `SPECIALIST_HINT` accepts John's session context, because it changes no classification (it only opens a review item).
- No LLM client, no network egress other than the database.
- Duplicate-execution protection: idempotency keys on batches and actions; `row_version` checks; unique constraints in C.7.
- Result verification: after each change the executor re-reads affected rows and returns their new `row_version`s and effective values; mismatch → Action Service marks `EXECUTED_UNVERIFIED`.

---

## G. State, memory and persistence
- Durable: tables in C.7 (sole owner). Raw immutable; classification current + temporal history; append-only events.
- Working state: per-chunk in-memory buffers; nothing survives a crash except committed chunks and staging rows.
- Recovery: a restarted batch job resumes from the first uncommitted chunk (chunk boundaries are recorded in `ingestion_batches.progress_json`); idempotency prevents duplicates.
- Invalidation: every committed change increments `categorization_version` and emits the event; consumers drop caches for older versions (SC §7.3).
- Retention: history ≥ 30 days and ≥ the longest snapshot/proposal horizon (F-16); compaction merges closed history rows older than retention that no live snapshot references.
- Must not persist: decrypted descriptions in logs; full account numbers (masked last 4 only); any LLM output (none exists in v1).

---

## H. Security and financial correctness
- Raw descriptions and counterparty JSON encrypted at rest (AES-256-GCM, key from the deployment's KMS); never logged; never sent to an LLM.
- Row-level scoping on every table (SC §16.3); 404 for foreign IDs so IDs cannot be probed.
- Untrusted text: descriptions and merchant strings are data; `merchant_name` leaves the module sanitized and ≤ 40 chars.
- Money: integer paise end-to-end; no floating-point in pairing tolerances (amount equality is exact).
- Uncertainty: never assign a category without evidence; abstain (`UNCATEGORIZED`) rather than guess; `MEDIUM` is always provisional and labelled downstream.
- Auditability: every change is an event with actor, versions and correlation ID; undo uses those events.

---

## I. Errors and recovery
| Category | Condition | Handling | Caller gets | Retryable |
| --- | --- | --- | --- | --- |
| Invalid input | Bad row / bad change params | Reject row or change | Row code / `INVALID_INPUT` | No |
| Missing data | Account unknown, original txn not yet delivered | Reject row (`UNKNOWN_ACCOUNT`); keep refund unmatched and re-run pairing when later batches arrive | Code / review item | Auto (pairing) |
| Unsupported operation | Merchant scope without key; > 5,000 rows; type transition not allowed; LLM stage requested | Refuse | `UNSUPPORTED_OPERATION` / 422 | No |
| Timeout | Sync change > 5 s | Abort transaction | `TIMEOUT` | Yes, same key |
| Tool/dependency failure | Profile Service unavailable during ingestion | Pause batch job; retry with backoff (10 s, 60 s, 300 s) | Batch status `PROCESSING` | Auto |
| Contradictory output | Pair matching finds conflicting links | `UNKNOWN` + `AMBIGUOUS` | Review item | — |
| Authorization failure | Missing/invalid ctx | Refuse; security log | `FORBIDDEN` | No |
| Persistence failure | Transaction error | Rollback; chunk retry ×3 | `PERSISTENCE_FAILED` | Yes |
| Partial completion | Some rows rejected | `COMPLETED_WITH_ERRORS` | Counts + codes | Corrected rows |
| Retry exhaustion | Chunk fails 3× | Rows stay in staging (`retryable: true`), counted in `pending_pipeline_count`; OPERATOR alert | Status | Next `reprocess_retryable` |
| Cancellation | Job stop requested | Finish current chunk transaction, checkpoint, stop | Batch `PAUSED` | Resume |

---

## J. Testing
| Type | Tests |
| --- | --- |
| Unit | Normalizer (rails, VPA, digit stripping); each type rule (a)–(i) with positive and negative cases; merchant precedence; rule precedence and same-tier conflict → MEDIUM; confidence routing table; coverage formula (shared lib) incl. denominator 0 → null |
| Contract | `CanonicalBatch@1`, `ManualEntry@1`, `ClassificationResult@1`, `DataQuality@1`, `categorization.updated` payload validated against JSON Schemas; `categorized_as_of` returns `Transaction@1` |
| Edge cases | Pending→posted with changed amount (no supersede; both kept, review); refund larger than original (not linked); refund across months; reversal same day; card payment with no card account; transfer to own account at another bank (external until marked); manual entry later delivered by bank; duplicate manual entries; leap-day dates; month boundary at IST midnight |
| Negative | Category on a transfer (`CATEGORY_NOT_APPLICABLE_TO_TYPE`); write without Action Service ctx; idempotency key reuse with different body; foreign txn ID → 404; type transition CREDIT → `FEE` rejected |
| Security | Injection strings in descriptions never alter control flow; cross-user reads; static import check for LLM clients; descriptions absent from logs |
| Failure/recovery | Kill job mid-batch → resume without duplicates; DB failure inside chunk → no event; event redelivery idempotent |
| Integration | Batch → event → Budget Monitor recomputes previous and new categories; correction → new snapshot → Sentinel spend changes; old snapshot unchanged (CAT-AC-08) |
| Golden set | Frozen labelled set of consented, de-identified rows plus synthetic refunds/card payments/transfers; regression runs on every rule, taxonomy or pipeline change and blocks if a measured metric drops below baseline minus tolerance (O-3) |

---

## K. Implementation handoff
### K.1 Modules (`backend/src/engines/categorizer/`)
| Module | Responsibility |
| --- | --- |
| `index.js` | Public interface (K.2) |
| `ingest/validate.js`, `ingest/store-raw.js` | Step 1 |
| `pipeline/normalize.js`, `pipeline/supersede.js`, `pipeline/type-movement.js`, `pipeline/merchant-match.js`, `pipeline/rules.js`, `pipeline/confidence.js`, `pipeline/persist.js` | Steps 2–10 |
| `changes/*.js` | One file per action in B.5 (+ `dry-run.js`, `undo.js`) |
| `taxonomy/migrate.js` | B.6 |
| `review/queue.js`, `status/state.js` | B.7, B.8 |
| `repo/*.js` | SQL for C.7 (SQLite now, Postgres later) |
| `seed/taxonomy-v1.json`, `seed/merchants.json`, `seed/global-rules.json` | Versioned seed data |

Shared: `shared/finance/movement.js` (type predicates, spend predicate), `shared/finance/coverage.js`, `shared/ids.js`, `shared/money.js`, `shared/errors.js`, `shared/contracts/schemas/*`.

### K.2 Public interface (JSDoc)
```js
/** @param {CanonicalBatch} batch @param {{tenantId:string, idempotencyKey:string, traceId:string}} ctx @returns {Promise<{batchId:string,status:'ACCEPTED'}>} */
async function ingestBatch(batch, ctx) {}
/** @param {ManualEntry} entry @param {ActionCtx} ctx @returns {Promise<{txnId:string, categorizationVersion:number, result:ClassificationResult}>} */
async function ingestManual(entry, ctx) {}
/** @param {{action:string, params:object}} change @param {ActionCtx} ctx @returns {Promise<{changedTxnIds:string[], categorizationVersion:number, rowVersions:Object<string,number>}>} */
async function applyChange(change, ctx) {}
/** @returns {Promise<{affected:{updated:number, skippedConfirmed:number, skippedChanged:number}}>} */
async function dryRun(change, ctx) {}
/** @returns {Promise<DataQuality & {taxonomyVersion:number, lastEventAt:string}>} */
async function getStatus(session) {}
async function listTransactions(filters, page, session) {}
async function getTransaction(txnId, session) {}
async function addReviewItem({ txnId, reason }, session) {}
async function reprocess({ scope, idempotencyKey }, ctx) {}
```
`ActionCtx = {actionId, actor:'USER'|'SYSTEM'|'MIGRATION', userId, tenantId, idempotencyKey, traceId}` — constructed only by the Action Service.

### K.3 Configuration
`categorizer.chunk_size=500`, `categorizer.transfer_window_days=3`, `categorizer.refund_lookback_days=90`, `categorizer.reversal_window_days=7`, `categorizer.manual_match_window_days=2`, `categorizer.pending_match_window_days=3`, `categorizer.merchant_scope_max_rows=5000`, `categorizer.retry_backoff_s=[2,10,60]`, `categorizer.event_ids_max=500`, `categorizer.enable_classifier=false`, `categorizer.enable_llm=false` (must stay false; startup fails if true while `T5_APPROVED` is unset).

### K.4 Definition of done
1. CAT-AC-01…18 pass in CI; CAT-AC-19 baseline report produced.
2. JSON Schemas for C.2, C.3, events and status committed and contract-tested.
3. Legacy migration (C.9) script run on the prototype DB with a reconciliation report (row counts, paise totals equal).
4. `categorized_as_of` view proven against Sentinel's read-only role.
5. No write path reachable without an Action Service ctx (test).

### K.5 Must be complete before integration
Taxonomy v1 seed; shared `movement.js` and `coverage.js` (co-owned with Sentinel); outbox writer; Profile Service `listAccounts`; Action Service ctx type.
