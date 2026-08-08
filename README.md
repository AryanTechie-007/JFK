# FinMate AI — Personal Financial Coaching Platform (FinHack)

**FinMate AI** is an intelligent personal financial coaching platform built for **FinHack**. It combines a Master AI Financial Coach (**John**) with four specialized underlying AI agents (**Iris**, **Atlas**, **Nova**, and **Sentinel**).

---

## 🤖 Master Agent Architecture & Agent Roles

```
                         USER INTERACTION
                                |
                                v
                     JOHN (Master AI Coach)
                   [Master Orchestration Engine]
                                |
   +----------------------------+----------------------------+
   |                            |                            |
   v                            v                            v
SENTINEL (Predictor)  ---> IRIS (Advisor)    ---> ATLAS (Strategist) & NOVA (Guardian)
(Hidden background        (Spending habit         (Goal planning & budget discipline)
 forecasting engine)      optimization)
```

1. **John — Master Financial Coach (`JohnCoachDashboard.jsx`)**:
   - **Role**: Central AI orchestrator synthesizing insights into unified, actionable financial advice.
   - **AI Engine**: Integrated via Backend AI Orchestrator API (`/api/ai/chat`).
   - **Multi-Agent Reasoning Traces**: Shows step-by-step trace accordions (`Sentinel → Iris → Atlas → Nova`) for user clarity.
   - **User-Consent Goal Proposals**: When John suggests a savings objective (e.g. *iPhone 16 Purchase Reserve* or *September Insurance Fund*), an **Interactive Proposal Card** renders with options: `[ Accept & Create Goal ]` and `[ Decline ]`. Accepting appends the goal directly to Atlas.

2. **Iris — Smart Spending Advisor (`IrisAdvisorView.jsx`)**:
   - **Role**: Behavioral habit auditor isolating wasteful food delivery spikes (18 orders/mo = ₹9,200/mo) and subscription bloat.
   - **Interactive Feature**: "Before vs. After" Cost Savings Simulator with an adjustable delivery frequency slider calculating real-time monthly (+₹3,800/mo) and annual savings.

3. **Atlas — Personalized Saving Strategist (`AtlasStrategistView.jsx`)**:
   - **Role**: Goal-based wealth planner and SIP compound growth calculator.
   - **Interactive Feature**: Dynamic **Goal Editing & Adding Funds** modal allowing users to edit target amounts, rename goals, change priorities, or add money directly (`+ Add Extra Money`).

4. **Nova — Real-Time Budget Guardian (`NovaGuardianView.jsx`)**:
   - **Role**: Enforces category spending caps (Food 92% Warning, Subscriptions 116% Exceeded).
   - **Interactive Feature**: Live expense logger recalculating category percentages and cash flow surplus in real-time.

5. **Sentinel — Observer & Expense Predictor (Hidden Background Engine - `SentinelPredictorView.jsx`)**:
   - **Role**: Runs time-series forecasting models (Recharts timeline) and Risk Radar detecting upcoming bills (e.g. ₹12,000 car insurance due Sep 15th).
   - **Visibility**: Hidden from the sidebar navigation as requested; operates silently in the background, feeding predictive signals to John, Iris, Atlas, and Nova.

6. **Transaction Intelligence & Auto Categorizer (`TransactionCategorizerView.jsx`)**:
   - **Role**: Parses raw bank statement strings (`SWIGGY GOURMET BOWL`, `NETFLIX PAY`, `AMAZON CLOTHING`) into structured category tags and distribution share percentages.

7. **Financial Wellness Scorecard (`FinancialHealthView.jsx`)**:
   - **Role**: Comprehensive 84/100 score diagnostic across Saving Behavior, Budget Discipline, Spending Control, and Future Planning.

---

## 🎨 UI / UX & Design System

- **Palette**: Clean light/emerald theme (`#F4F6F8` background, `#FFFFFF` cards, `#005F41` emerald action buttons, `#0F172A` text, `#E2E8F0` borders).
- **Typography**:
  - **Body & UI Controls**: `'Arial', sans-serif`
  - **Headings & Financial Figures**: `'Times New Roman', serif`
- **Page Headers**: All sub-agent views (`Iris`, `Atlas`, `Nova`, `Categorizer`, `Health`, `Settings`) feature clean light-themed headers matching the main theme.

---

## 🔐 Auth & Onboarding Flow

- **Log In & Sign Up (`AuthView.jsx`)**: Styled in the exact light color scheme, allowing users to log in or create an account.
- **Financial Details Questionnaire (`OnboardingView.jsx`)**: Asks major user financial details upon account creation:
  - Name & Occupation / Role
  - Monthly Net Income (₹) & Fixed Housing Expenses (₹)
  - Primary Objective Name, Target Amount (₹), and Monthly Allocation (₹)
  - Financial Risk Strategy (Conservative, Balanced, Aggressive)
- **User Settings & Profile Manager (`SettingsView.jsx`)**: Edit salary, fixed bills, and category caps anytime.
- **Log Out**: Sidebar footer includes a `Log Out` button to return to the Auth screen.

---

## 📂 Codebase Directory & Key Files

```
c:\Users\Aryan\Projects\FINHACK\
├── src/
│   ├── components/
│   │   ├── AuthView.jsx                 # Log In & Sign Up pages
│   │   ├── OnboardingView.jsx           # Financial Details Setup Questionnaire
│   │   ├── JohnCoachDashboard.jsx       # Master Agent John Chat & Gemini AI Interface
│   │   ├── FormattedText.jsx            # Safe Markdown & Arrow Renderer (Fixes LaTeX glitches)
│   │   ├── IrisAdvisorView.jsx          # Iris Advisor & Cost Simulator
│   │   ├── AtlasStrategistView.jsx      # Atlas Strategist & Goal Edit / Add Money Modal
│   │   ├── NovaGuardianView.jsx         # Nova Budget Guardian & Live Expense Logger
│   │   ├── SentinelPredictorView.jsx    # Hidden Background Predictor & Risk Radar
│   │   ├── TransactionCategorizerView.jsx # NLP Bank Statement Classifier
│   │   ├── FinancialHealthView.jsx      # Wellness Scorecard & Timeline
│   │   ├── SettingsView.jsx             # User Financial Profile & Budget Limits Editor
│   │   ├── Sidebar.jsx                  # Navigation Sidebar with Logout Button
│   │   └── Header.jsx                   # Sticky Header Bar
│   ├── data/
│   │   └── mockFinancialData.js         # Initial Profile, Goals, Transactions & Engine Logic
│   ├── services/
│   │   └── geminiService.js             # Google Gemini 1.5 Flash API Service
│   ├── App.jsx                          # Main State Orchestrator & View Switcher
│   └── index.css                        # Arial & Times New Roman CSS Design System
├── index.html                           # Entry HTML
├── vite.config.js                       # Vite Configuration
└── package.json                         # Node Dependencies (lucide-react, recharts, vite)
```

---

## 🚀 How to Run Locally

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**:
   Create a `.env` file in the root directory (or copy from `.env.example`):
   ```bash
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

3. **Start Development Server**:
   ```bash
   npm run dev
   ```
   Open **[http://localhost:5173/](http://localhost:5173/)** in your browser.

4. **Production Build**:
   ```bash
   npm run build
   ```
