# FinMate AI — Backend Architecture & Decision Record

Companion to `README.md`. The README tells you how to run the backend; this document explains
what it does, why it's built this way, and how the pieces fit together. Written to be usable as
presentation notes.

---

## 1. What this backend is

The FinMate AI frontend (React + Vite) originally ran entirely on mock data, with a Gemini API
call made directly from the browser. This backend replaces the mocks with real persistence and
moves the AI call server-side.

It provides:

- Authentication (signup, login, JWT-protected routes)
- User profiles and the onboarding questionnaire
- Goals (Atlas)
- Transactions with automatic categorization
- Budget caps and enforcement (Nova)
- Spending habit analysis (Iris)
- Forecasting and risk detection (Sentinel)
- Financial wellness scoring
- The John coach endpoint, which is the only component that calls Gemini

---

## 2. The most important architectural point

**The four "sub-agents" are not AI agents, and they do not communicate with each other.**

Sentinel, Iris, Atlas and Nova are deterministic analytics endpoints — SQL queries plus
arithmetic. No language model is involved in any of them. Only **John** calls Gemini.

This is a deliberate design decision, not a shortcut:

- Financial figures must be reproducible. The same data must always produce the same
  percentage, the same forecast, the same score. An LLM cannot guarantee that.
- It is faster and cheaper. Four of the five "agents" cost nothing to run and return instantly.
- It removes a failure mode. If the Gemini API is down or the key is missing, every view except
  John's chat still works perfectly.

### How they actually relate

They are **siblings**, not a chain. All five read from the same SQLite database independently:

```
                  ┌─→ Nova      (computes budget percentages)
                  ├─→ Iris      (computes savings simulation)
   finmate.db ────┼─→ Sentinel  (computes forecast + risk flags)
                  ├─→ Atlas     (computes goal progress)
                  └─→ John ────→ Gemini ──→ advice + optional proposal
```

A common misreading is that the four endpoints feed their results to John, who then calls
Gemini. That is not what happens. `buildContext()` in `src/routes/coach.js` runs its own SQL
queries directly against the same tables.

Why this matters:

- John is independent. He doesn't break when another endpoint does, and he doesn't wait on four
  HTTP round-trips before answering.
- Consistency is guaranteed. John quotes the same 144% that Nova displays, because both read
  the same rows at the same moment.

### What Gemini does and does not do

| | Produced by | Gemini involved? |
|---|---|---|
| Budget percentages (144% exceeded) | SQL + arithmetic | No |
| Savings simulation (₹80,034/yr) | SQL + arithmetic | No |
| Forecast (₹29,017 next month) | Linear trend over 6 months | No |
| Wellness score (84/100) | Weighted formula, 4 dimensions | No |
| Goal progress and months-to-target | Arithmetic | No |
| Coaching narrative and explanation | Gemini 1.5 Flash | Yes |
| Goal proposals | Gemini suggests, user accepts | Yes (suggestion only) |

**Gemini never decides anything and never writes to the database.** It can only propose. A
proposal is returned as a separate JSON object, the UI renders an accept/decline card, and only
an explicit `POST /api/goals` creates a goal.

### The one-line summary for a pitch

> Deterministic SQL engines compute the financial analytics. John passes that real data to
> Gemini for interpretation and coaching. Any action Gemini suggests requires explicit user
> consent before it is written.

This pre-answers the obvious question — *"how do you stop the AI hallucinating financial
advice?"* — because it cannot invent numbers and cannot act on its own.

---

## 3. Request lifecycle

Every request follows the same path:

```
React view
    │  fetch with Authorization: Bearer <token>
    ▼
Express + CORS          checks origin, parses JSON body
    ▼
requireAuth             verifies JWT signature, sets req.userId
    ▼
Route handler           runs the business logic
    ▼
db.js adapter           prepared SQL statements
    ▼
finmate.db              SQLite file on disk
```

Every route except `/api/auth/*` and `/api/health` passes through `requireAuth`.

### The security model

`requireAuth` attaches `req.userId` from the verified token, and **every SQL query filters on
`user_id`**. One user can never read or modify another's data. This is verified by test: a
second user's token receives a 404 when targeting the first user's goal — not the goal itself.

Passwords are hashed with bcrypt and the `password_hash` column is stripped from every API
response before it leaves the server.

---

## 4. The John coach flow

```
POST /api/coach/chat          message + recent history
    ▼
buildContext()                reads user, goals, spend-by-category, caps, unpaid bills
    ▼
Gemini 1.5 Flash              called server-side; API key never reaches the browser
    ▼
Parse the reply               splits prose from the proposal JSON block
    ▼
Frontend renders              proposal card with Accept / Decline
    ▼
POST /api/goals               only on Accept — this is the only write path
```

Three points worth demonstrating:

1. **The API key never reaches the browser.** Previously it shipped inside the frontend bundle
   and was readable in devtools. Now the browser only talks to your own server.
2. **John cannot invent numbers.** `buildContext` serializes real database rows, and the system
   prompt instructs the model to use only those figures. This is why John's advice agrees with
   Nova's percentages.
3. **Proposals require consent.** The model is instructed to append a JSON block if it wants to
   suggest a goal. The backend extracts it into a separate `proposal` field so the UI can render
   a consent card. Accepted goals are stored with `source: "john_proposal"`, so you can always
   show which goals the AI originated versus which the user created.

`GET /api/coach/context` returns the same snapshot without calling Gemini — useful for
rendering the multi-agent reasoning traces without spending tokens.

---

## 5. Data model

Five tables. `src/db.js` creates them on boot with `CREATE TABLE IF NOT EXISTS`, so a fresh
clone works with no migration step.

| Table | Feeds |
|---|---|
| `users` | Auth, OnboardingView, SettingsView |
| `goals` | Atlas — targets, allocations, accepted proposals |
| `budget_categories` | Nova — per-category monthly caps |
| `transactions` | Categorizer, Iris, Nova, Sentinel |
| `upcoming_bills` | Sentinel — risk radar |

All child tables reference `users(id)` with `ON DELETE CASCADE`, and `PRAGMA foreign_keys = ON`
is set, so deleting a user cleanly removes their data.

---

## 6. Where the numbers come from

Every figure the UI displays is computed here, not hardcoded. If a judge asks "is this real or
mocked?", this is the answer.

**Nova — budget status.** Sums this month's transactions per category, divides by the cap.
Under 85% is healthy, 85–99% warning, 100%+ exceeded. Categories with spend but no cap are
returned separately as `uncapped` so they still count against cash flow.

**Iris — savings simulator.** Counts Food Delivery transactions this month and computes the
average order value. Given a `targetOrders` query parameter, it projects
`targetOrders × avg_order` and returns the monthly and annual difference. The slider in the UI
just changes that parameter.

**Sentinel — forecast.** Fits a simple linear trend (least squares) across up to six months of
totals and projects the next month. Risk flags fire when projected outflow exceeds income, or
when a single upcoming bill exceeds 25% of monthly income.

The formula is deliberately simple and readable rather than clever — it can be explained in one
sentence during a demo, and swapped for a proper time-series model later without changing the
API response shape.

**Wellness score — 100 points across four dimensions**, 25 each:

| Dimension | Measure |
|---|---|
| Saving behaviour | Savings rate against a 20% benchmark |
| Budget discipline | Share of capped categories still within cap |
| Spending control | Total outflow as a proportion of income |
| Future planning | Number of goals with funding attached |

**Transaction categorizer.** Keyword matching in `src/utils/categorize.js` — `SWIGGY` and
`ZOMATO` map to Food Delivery, `NETFLIX` to Subscriptions, and so on. Unmatched strings become
`Uncategorized`. This is intentionally a swappable stub: replacing it with a trained classifier
or an LLM call requires no changes elsewhere, because every route calls the same function.

---

## 7. Technical decisions

### No native dependencies

The original build used `better-sqlite3`, which failed to install on Node v24.19.0 on Windows.
Native addons ship prebuilt binaries for LTS versions first, so on a new Node release npm falls
back to compiling from source — which requires Python and a C++ toolchain.

The fix was structural: **zero native addons**.

| Need | Provided by | Native? |
|---|---|---|
| SQLite | `node:sqlite` (built into Node) | No |
| HTTP client | global `fetch` (built into Node) | No |
| Password hashing | `bcryptjs` (pure JS) | No |
| Server, CORS, JWT, env | `express`, `cors`, `jsonwebtoken`, `dotenv` | No |

Nothing compiles, so nothing can fail to compile — on any Node version, LTS or current. This is
worth stating in a demo: the most common hackathon failure is a laptop that won't install on
stage.

### A driver-agnostic database layer

`src/db.js` is the only file that touches the SQLite driver. It wraps `node:sqlite` in a thin
adapter exposing `prepare()`, `exec()`, `pragma()` and `transaction()`, plus the statement
methods `run()`, `get()` and `all()`.

Because the adapter matches the interface the route files already used, swapping the driver
required changing exactly one file — all 23 `prepare()` calls and every SQL statement were
untouched. If you migrate to Postgres later, `src/db.js` is again the only file that changes.

The adapter also normalizes `undefined` to `NULL` and booleans to `1`/`0`, since `node:sqlite`
rejects both. This prevents a missing optional field from becoming a 500.

### Design choices worth defending

- **Server-side AI calls.** Keeps the API key out of the browser bundle.
- **Consent-gated writes.** The model proposes; the user disposes.
- **Computed fields returned by the API.** `progress_pct`, `months_to_target`, `used_pct`,
  `share_pct` are calculated server-side so the frontend renders rather than computes, and two
  views can never disagree.
- **Simple, legible formulas.** Every number can be explained aloud in one sentence.

---

## 8. End-to-end sequence once the frontend is wired

1. **Login** → `POST /api/auth/login` → frontend stores the token
2. **New user** → `POST /api/users/me/onboarding` → saves income and risk strategy, creates the
   primary goal, and seeds six default budget caps so Nova is populated on first load
3. **Each view mounts** → fires its own authenticated GET → renders real figures
4. **User logs an expense in Nova** → `POST /api/transactions` → categorized server-side →
   refetch `/api/budget` and the percentage moves
5. **User opens John** → `POST /api/coach/chat` → the flow in section 4
6. **User accepts a proposal** → `POST /api/goals` with `source: "john_proposal"` → Atlas shows
   it on next load

### View to endpoint mapping

| View | Endpoint |
|---|---|
| `AuthView` | `POST /api/auth/login`, `POST /api/auth/signup` |
| `OnboardingView` | `POST /api/users/me/onboarding` |
| `SettingsView` | `PATCH /api/users/me`, `PUT /api/budget/:category` |
| `JohnCoachDashboard` | `POST /api/coach/chat`, `GET /api/coach/context` |
| `AtlasStrategistView` | `GET /api/goals`, `POST /api/goals/:id/contribute` |
| `NovaGuardianView` | `GET /api/budget`, `POST /api/transactions` |
| `IrisAdvisorView` | `GET /api/insights/iris?targetOrders=` |
| `SentinelPredictorView` | `GET /api/insights/sentinel` |
| `TransactionCategorizerView` | `GET /api/transactions/distribution` |
| `FinancialHealthView` | `GET /api/insights/health` |

Wire these **one view at a time**. Get Atlas working end to end before touching the others — if
something breaks you will know exactly which change caused it.

---

## 9. Running both services

Two terminals, backend started first.

| Service | Folder | Command | Port |
|---|---|---|---|
| Backend | `finmate-backend` | `npm run dev` | 4000 |
| Frontend | `JFK` | `npm run dev` | 5173 |

The frontend needs `VITE_API_URL=http://localhost:4000` in its own `.env`.

CORS accepts `localhost:5173` (vite dev) and `localhost:4173` (vite preview, for the `dist`
build) by default. Both are configurable via a comma-separated `CORS_ORIGIN`.

**On Windows**, if PowerShell reports that running scripts is disabled, either use `npm.cmd`
instead of `npm`, or switch the VS Code terminal to Command Prompt
(`Ctrl+Shift+P` → `Terminal: Select Default Profile` → Command Prompt).

---

## 10. Before the demo

**Reset the database.** `finmate.db` persists across restarts by design, which means any
transactions you add while rehearsing are still there when you present. Delete `finmate.db` and
re-run `npm run seed` immediately before demoing for clean, predictable numbers.

The seed creates: demo user (`demo@finmate.ai` / `demopass123`), 2 goals, 5 budget caps, 60
transactions across 3 months with a deliberately rising food-delivery trend, and 2 upcoming
bills.

**Verify it's alive.** `http://localhost:4000/api/health` should return
`{"ok":true,"service":"finmate-backend"}`.

**Outstanding security item.** A Gemini API key is present in the public repository README. Keys
committed to public repositories are scraped by automated bots, and the billing is attached to
the owning Google account. Deleting the line from the README does not revoke the key and does
not remove it from git history — the key must be revoked at
`aistudio.google.com/apikey` and replaced. The backend reads its key from `.env`, which
`.gitignore` excludes, so no new key will be committed.

---

## 11. Verification performed

- 12/12 source files pass `node --check`
- 23/23 `require()` paths resolve; all 10 modules load from the packaged copy
- Full endpoint suite green across auth, users, onboarding, goals, transactions, categorizer,
  budget, insights and coach — including error paths (400, 401, 404, 409, 503) and cross-user
  access rejection
- Database layer: persistence across restart, WAL mode, transaction commit and rollback, nested
  savepoints, foreign-key cascade, numeric return types, string-to-integer primary key binding
- CORS: 5173 allowed, 4173 allowed, unknown origin blocked
- Cold start from an empty database creates all five tables and accepts a signup

---

## 12. Known limitations

These are honest gaps, not defects. Knowing them is better than being surprised by them.

- **SQLite is single-writer.** Fine for a demo and for moderate load; move to Postgres for
  concurrent production traffic. Only `src/db.js` would change.
- **Tokens are stored in `localStorage`** in the suggested frontend wiring, which is vulnerable
  to XSS. An httpOnly cookie is the production answer.
- **No rate limiting.** `/api/coach/chat` costs tokens per call and `/api/auth/login` is
  brute-forceable. Both should be limited before any public deployment.
- **The forecast is a linear trend**, not a seasonal model. It cannot see annual patterns.
- **The categorizer is keyword-based** and will miss unfamiliar merchants, returning
  `Uncategorized` rather than guessing.
- **Score weightings are unvalidated.** The four dimensions are reasonable but were not tuned
  against real behavioural data.
- **`ExperimentalWarning: SQLite`** appears on startup. Harmless — the module is shipped and
  stable in Node 24; the warning reflects that the API surface is still being finalised
  upstream. Suppress with `node --no-warnings src/index.js` if it is distracting during a demo.
