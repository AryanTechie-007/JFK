# FinMate AI — Backend

Basic backend for the FinMate AI / John Financial Coach frontend. Node + Express + SQLite,
no external database server required.

## Requirements

**Node.js >= 22.5.0.** Works on the latest Current release as well as LTS.

This project has **zero native addons**. That is deliberate: native modules ship prebuilt
binaries for LTS versions first, so on a brand-new Node release they fall back to compiling
from source and require Python + a C++ toolchain. Everything here is either pure JavaScript or
built into Node itself:

| Need | Provided by | Native? |
|---|---|---|
| SQLite | `node:sqlite` (built into Node) | No |
| HTTP client | global `fetch` (built into Node) | No |
| Password hashing | `bcryptjs` (pure JS) | No |
| Server, CORS, JWT, env | `express`, `cors`, `jsonwebtoken`, `dotenv` | No |

So `npm install` needs no Python, no Visual Studio Build Tools, and no node-gyp — on Windows
or anywhere else.

## Setup

Windows (PowerShell or CMD):

```bash
npm install
copy .env.example .env     # then set JWT_SECRET and GEMINI_API_KEY
npm run seed               # optional: demo@finmate.ai / demopass123
npm run dev                # http://localhost:4000
```

macOS / Linux: same, but `cp .env.example .env`.

`finmate.db` is created on first run and persists between restarts. Add it (and `.env`) to
`.gitignore`. Set `DB_PATH` in `.env` to store it elsewhere.

Node may print `ExperimentalWarning: SQLite is an experimental feature`. That is expected and
harmless — `node:sqlite` is a stable, shipped part of Node 24; the warning reflects that the
API surface is still being finalised upstream.

## Data model

`src/db.js` is the only file that touches the SQLite driver. It wraps `node:sqlite` in a thin
adapter exposing `prepare()` / `exec()` / `pragma()` / `transaction()` and the statement methods
`run()` / `get()` / `all()`, so route files stay driver-agnostic. If you ever swap the driver
again, `src/db.js` is the only file that changes.

| Table | Feeds |
|---|---|
| `users` | Auth, OnboardingView, SettingsView |
| `goals` | Atlas — goals, allocations, John's accepted proposals |
| `budget_categories` | Nova — per-category monthly caps |
| `transactions` | Categorizer, Iris, Nova, Sentinel |
| `upcoming_bills` | Sentinel — risk radar |

## API

All routes except `/api/auth/*` and `/api/health` need `Authorization: Bearer <token>`.

### Auth
- `POST /api/auth/signup` — `{ name, email, password }` → `{ token, user, onboardingComplete }`
- `POST /api/auth/login` — `{ email, password }`

### Profile
- `GET /api/users/me`
- `POST /api/users/me/onboarding` — `{ occupation, monthlyIncome, fixedHousingExpense, riskStrategy, primaryGoal }`. Also seeds default Nova caps.
- `PATCH /api/users/me` — SettingsView edits

### Goals (Atlas)
- `GET /api/goals` — includes `progress_pct`, `remaining_amount`, `months_to_target`
- `POST /api/goals` — pass `source: "john_proposal"` when the user accepts a coach proposal
- `PATCH /api/goals/:id` — rename / retarget / reprioritize
- `POST /api/goals/:id/contribute` — `{ amount }` (the "+ Add Extra Money" button)
- `DELETE /api/goals/:id`

### Transactions
- `GET /api/transactions?month=YYYY-MM&category=&limit=`
- `POST /api/transactions` — `{ rawDescription, amount, txnDate? }`; category auto-derived if omitted
- `POST /api/transactions/import` — `{ lines: [...] }` bulk statement parse
- `GET /api/transactions/distribution?month=YYYY-MM` — share % per category
- `PATCH /api/transactions/:id` — correct a wrong auto-category
- `DELETE /api/transactions/:id`

### Budget (Nova)
- `GET /api/budget?month=YYYY-MM` — per-category `used_pct` + `status` (`healthy` / `warning` / `exceeded`), plus a cash-flow surplus block
- `PUT /api/budget/:category` — `{ monthlyCap }`
- `DELETE /api/budget/:category`

### Insights
- `GET /api/insights/sentinel` — 6-month history, linear-trend forecast, unpaid bills, risk flags
- `GET /api/insights/iris?month=&targetOrders=` — delivery/subscription audit; pass `targetOrders` to drive the savings simulator slider
- `GET /api/insights/health` — wellness score out of 100 across four dimensions
- `GET|POST /api/insights/bills`, `PATCH /api/insights/bills/:id`

### Coach (John)
- `POST /api/coach/chat` — `{ message, history }` → `{ reply, proposal, contextUsed }`
- `GET /api/coach/context` — the snapshot John reasons over, for rendering reasoning traces without an LLM call

The backend assembles the financial context, calls Gemini server-side, and extracts any goal
proposal into a `proposal` object so the UI can render the accept/decline card. Accepting =
`POST /api/goals` with `source: "john_proposal"`.

## Wiring up the frontend

In the Vite app, add `VITE_API_URL=http://localhost:4000` and a small fetch wrapper:

```js
const API = import.meta.env.VITE_API_URL;

export async function api(path, { method = 'GET', body } = {}) {
  const token = localStorage.getItem('finmate_token');
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json()).error || 'Request failed');
  return res.json();
}
```

Then replace the mock state in each view with the matching call — `JohnCoachDashboard` →
`/api/coach/chat`, `AtlasStrategistView` → `/api/goals`, `NovaGuardianView` → `/api/budget`,
`IrisAdvisorView` → `/api/insights/iris`, `SentinelPredictorView` → `/api/insights/sentinel`,
`FinancialHealthView` → `/api/insights/health`.

## Before this goes anywhere real

- Rotate the Gemini key currently in the repo README, and remove it from the README and git
  history. Keys in a public repo get scraped within hours.
- Swap SQLite for Postgres when you need concurrent writes.
- Add rate limiting on `/api/coach/chat` (each call costs tokens) and on `/api/auth/login`.
- Move the token from `localStorage` to an httpOnly cookie.
- The health score and forecast are deliberately simple, readable formulas — tune the weights
  against real behaviour rather than treating them as ground truth.
