// FinMate AI Mock Financial Dataset & Multi-Agent Orchestrator Logic

export const USER_PROFILE = {
  name: "Aryan",
  currency: "₹",
  monthlyIncome: 75000,
  fixedExpenses: 25000,
  variableExpenses: 29200,
  totalSpentThisMonth: 54200,
  currentSavings: 20800,
  savingsRate: 27.7,
  healthScore: 84,
  scoreBreakdown: {
    savingBehavior: 88,
    budgetDiscipline: 78,
    spendingControl: 82,
    futurePlanning: 88
  }
};

export const AGENTS = {
  john: {
    id: "john",
    name: "John",
    role: "Master Financial Coach",
    description: "Central AI orchestrator that synthesizes team insights into unified, wise advice.",
    badgeClass: "badge-john",
    color: "#059669",
    avatar: "🤖",
    status: "Active & Listening"
  },
  iris: {
    id: "iris",
    name: "Iris",
    role: "Spending Advisor",
    description: "Analyzes spending habits, flags wasteful patterns, and suggests cost reductions.",
    badgeClass: "badge-iris",
    color: "#d97706",
    avatar: "💡",
    status: "Analyzing Habits"
  },
  atlas: {
    id: "atlas",
    name: "Atlas",
    role: "Saving Strategist",
    description: "Creates goal-based wealth plans, SIP calculators, and growth pathways.",
    badgeClass: "badge-atlas",
    color: "#059669",
    avatar: "🎯",
    status: "Optimizing Goals"
  },
  nova: {
    id: "nova",
    name: "Nova",
    role: "Budget Guardian",
    description: "Monitors category limits in real-time, alerts on overspending, and enforces discipline.",
    badgeClass: "badge-nova",
    color: "#dc2626",
    avatar: "🔔",
    status: "Monitoring Streams"
  },
  sentinel: {
    id: "sentinel",
    name: "Sentinel",
    role: "Observer & Predictor (Hidden)",
    description: "Runs continuous predictive ML models on time-series data to forecast risks.",
    badgeClass: "badge-sentinel",
    color: "#7c3aed",
    avatar: "🔮",
    status: "Forecasting Trends"
  }
};

export const INITIAL_SAVINGS_GOALS = [
  { 
    id: "goal-1", 
    name: "Emergency Fund", 
    priority: "HIGH PRIORITY", 
    current: 50000, 
    target: 100000, 
    targetDate: "On track for Oct 2026", 
    category: "Safety", 
    iconType: "shield",
    monthlyAdd: 10000 
  },
  { 
    id: "goal-2", 
    name: "Laptop Purchase", 
    priority: "MEDIUM PRIORITY", 
    current: 40000, 
    target: 80000, 
    targetDate: "Expected by Dec 2026", 
    category: "Asset", 
    iconType: "laptop",
    monthlyAdd: 7500 
  },
  { 
    id: "goal-3", 
    name: "Vacation Fund", 
    priority: "LOW PRIORITY", 
    current: 20000, 
    target: 50000, 
    targetDate: "Expected by Mar 2027", 
    category: "Lifestyle", 
    iconType: "plane",
    monthlyAdd: 5000 
  }
];

export const TRANSACTIONS = [
  { id: "tx-101", date: "2026-08-07", description: "SWIGGY * GOURMET BOWL", amount: 680, category: "Food & Dining", merchant: "Swiggy", type: "debit" },
  { id: "tx-102", date: "2026-08-06", description: "AMAZON PAY * ELECTRONICS", amount: 3499, category: "Shopping & Lifestyle", merchant: "Amazon", type: "debit" },
  { id: "tx-103", date: "2026-08-05", description: "NETFLIX MONTHLY SUB", amount: 649, category: "Subscriptions", merchant: "Netflix", type: "debit" },
  { id: "tx-104", date: "2026-08-04", description: "UBER RIDE TO OFFICE", amount: 420, category: "Transport", merchant: "Uber", type: "debit" },
  { id: "tx-105", date: "2026-08-03", description: "D-MART SUPERMARKET GROCERIES", amount: 4850, category: "Groceries", merchant: "D-Mart", type: "debit" },
  { id: "tx-106", date: "2026-08-01", description: "SALARY CREDIT - TECH CORP", amount: 75000, category: "Income", merchant: "Employer", type: "credit" },
  { id: "tx-107", date: "2026-08-01", description: "APARTMENT RENT TRANSFER", amount: 20000, category: "Housing", merchant: "Landlord", type: "debit" },
  { id: "tx-108", date: "2026-07-29", description: "ZOMATO DINING OUT", amount: 1450, category: "Food & Dining", merchant: "Zomato", type: "debit" },
  { id: "tx-109", date: "2026-07-28", description: "SPOTIFY PREMIUM", amount: 119, category: "Subscriptions", merchant: "Spotify", type: "debit" },
  { id: "tx-110", date: "2026-07-25", description: "ZARA APPAREL SHOPPING", amount: 4900, category: "Shopping & Lifestyle", merchant: "Zara", type: "debit" },
  { id: "tx-111", date: "2026-07-22", description: "ELECTRICITY BILL PAYMENT", amount: 2800, category: "Bills & Utilities", merchant: "State Power Board", type: "debit" }
];

export const SENTINEL_FORECAST = {
  historical: [
    { month: "May", actual: 48500, food: 7200, shopping: 6500, utilities: 4800 },
    { month: "Jun", actual: 51200, food: 8100, shopping: 7800, utilities: 5000 },
    { month: "Jul", actual: 53800, food: 8900, shopping: 8200, utilities: 4900 },
    { month: "Aug (Current)", actual: 54200, food: 9200, shopping: 8400, utilities: 5000 }
  ],
  predictions: [
    { month: "Sep (Forecast)", predicted: 58400, food: 10100, shopping: 9500, confidence: "92%", note: "Annual Car Insurance Renewal due (₹12,000)" },
    { month: "Oct (Forecast)", predicted: 56100, food: 9800, shopping: 11200, confidence: "89%", note: "Festive Season Shopping spike detected" },
    { month: "Nov (Forecast)", predicted: 52900, food: 8900, shopping: 7500, confidence: "94%", note: "Stabilized spending trajectory" }
  ],
  riskRadar: [
    { id: "risk-1", title: "Upcoming Bill Spike", severity: "High", detail: "Sentinel detected annual car insurance of ₹12,000 due on Sep 15th.", recommendation: "Allocate ₹4,000 from August savings to absorb impact." },
    { id: "risk-2", title: "Food Delivery Inflation", severity: "Medium", detail: "Food delivery ordering frequency increased by 38% over the last 60 days.", recommendation: "Iris recommends cap of 2 orders/week." }
  ]
};

export const BUDGET_BUDGETS = [
  { category: "Food & Dining", spent: 9200, limit: 10000, percent: 92, status: "warning", color: "#d97706" },
  { category: "Shopping & Lifestyle", spent: 8400, limit: 10000, percent: 84, status: "normal", color: "#2563eb" },
  { category: "Transport", spent: 3100, limit: 5000, percent: 62, status: "normal", color: "#059669" },
  { category: "Bills & Utilities", spent: 5000, limit: 5000, percent: 100, status: "limit", color: "#7c3aed" },
  { category: "Subscriptions", spent: 3500, limit: 3000, percent: 116, status: "exceeded", color: "#dc2626" }
];

export const SAMPLE_QUERIES = [
  { label: "Can I buy an iPhone 16 (₹80,000)?", query: "Can I afford buying an iPhone 16 on EMI or upfront this month?" },
  { label: "Why am I struggling to save?", query: "Why am I unable to save more than ₹20k out of my ₹75k income?" },
  { label: "Optimize my Food Delivery spending", query: "Iris, analyze my food delivery expenses and tell me how much I can save." },
  { label: "How fast can I reach my Emergency Fund?", query: "Atlas, how can I reach my ₹1L Emergency Fund goal 2 months earlier?" }
];

// Orchestrator Simulation Engine
export function runOrchestratorQuery(queryText) {
  const q = queryText.toLowerCase();

  if (q.includes("iphone") || q.includes("afford") || q.includes("buy") || q.includes("phone")) {
    return {
      query: queryText,
      traces: [
        {
          agent: AGENTS.sentinel,
          title: "Sentinel Risk & Trend Forecast",
          insight: "Sentinel detected an upcoming mandatory insurance premium of ₹12,000 in September. Total forecasted September outlay is ₹58,400 out of ₹75,000 income."
        },
        {
          agent: AGENTS.nova,
          title: "Nova Budget Monitoring Check",
          insight: "Nova flags that your Subscriptions limit is already exceeded (116%), and Food & Dining is at 92%. Monthly discretionary buffer remaining is only ₹20,800."
        },
        {
          agent: AGENTS.atlas,
          title: "Atlas Saving Goal Impact",
          insight: "Atlas notes that an upfront ₹80,000 purchase would wipe out 80% of your Emergency Reserve. An EMI of ₹6,800/mo can be absorbed if food orders are reduced."
        },
        {
          agent: AGENTS.iris,
          title: "Iris Spending Optimization",
          insight: "Iris identifies ₹3,800/mo in excess dining out that can be recovered immediately."
        }
      ],
      johnResponse: `Based on team synthesis, **you should NOT buy the iPhone upfront today**, but **you CAN safely afford it via a 6-month zero-cost EMI (₹6,800/mo)** provided you adopt two adjustments:\n\n1. **Sentinel Risk Warning**: You have a ₹12,000 car insurance bill due on Sep 15th.\n2. **Iris Optimization**: Trim Swiggy/Zomato orders from 18/mo to 6/mo to recover ₹3,800/mo immediately.\n3. **Atlas Plan**: Allocate ₹3,800 from Iris savings + ₹3,000 from discretionary income.`,
      proposedGoal: {
        name: "iPhone 16 Purchase Reserve",
        target: 80000,
        monthlyAdd: 6800,
        priority: "MEDIUM PRIORITY",
        category: "Asset",
        iconType: "laptop"
      }
    };
  }

  if (q.includes("food") || q.includes("swiggy") || q.includes("zomato") || q.includes("iris")) {
    return {
      query: queryText,
      traces: [
        {
          agent: AGENTS.sentinel,
          title: "Sentinel Historical Trend",
          insight: "Sentinel analyzed your last 90 days: Food spending jumped from ₹7,200 in May to ₹9,200 in August (+27.7% inflation)."
        },
        {
          agent: AGENTS.iris,
          title: "Iris Deep Habit Audit",
          insight: "Iris isolated 18 food delivery orders in August, averaging ₹510 per order."
        },
        {
          agent: AGENTS.nova,
          title: "Nova Threshold Status",
          insight: "Food & Dining is at ₹9,200 / ₹10,000 limit (92%)."
        },
        {
          agent: AGENTS.atlas,
          title: "Atlas Strategy Projection",
          insight: "Redirecting ₹3,800 saved from food ordering into Atlas's SIP engine yields ₹2.4 Lakhs over 4 years."
        }
      ],
      johnResponse: `Iris and Sentinel completed a joint audit of your food spending:\n\n- **The Issue**: You spent ₹9,200 this month across 18 delivery orders. Delivery taxes & surge fees totaled ₹1,620.\n- **The Fix**: Cap delivery to weekend treat nights (max 6 orders/mo).\n- **The Gain**: You will save **₹3,800 every month**.`,
      proposedGoal: {
        name: "Food Savings Vault",
        target: 45000,
        monthlyAdd: 3800,
        priority: "LOW PRIORITY",
        category: "Savings",
        iconType: "shield"
      }
    };
  }

  return {
    query: queryText,
    traces: [
      {
        agent: AGENTS.sentinel,
        title: "Sentinel Diagnostic Scan",
        insight: "Sentinel analyzed active recurring subscriptions and forecasted ₹58.4k spending for next month."
      },
      {
        agent: AGENTS.iris,
        title: "Iris Behavioral Profiling",
        insight: "Iris observed elevated convenience spending on food delivery."
      },
      {
        agent: AGENTS.nova,
        title: "Nova Real-Time Guard",
        insight: "Nova confirmed 4 out of 5 category budgets are in healthy zones."
      },
      {
        agent: AGENTS.atlas,
        title: "Atlas Capital Optimization",
        insight: "Atlas verified your current net surplus is ₹20,800/mo."
      }
    ],
    johnResponse: `I've evaluated your financial state alongside Iris, Atlas, Nova, and Sentinel:\n\n- **Current Snapshot**: Income: ₹75,000 | Spent: ₹54,200 | Net Surplus: ₹20,800.\n- **Primary Recommendation**: Focus on controlling variable food delivery costs (currently ₹9,200) to prepare for Sentinel's predicted ₹12,000 insurance bill next month.\n\nWould you like me to create a dedicated goal to save for this upcoming bill?`,
    proposedGoal: {
      name: "September Insurance Fund",
      target: 12000,
      monthlyAdd: 4000,
      priority: "HIGH PRIORITY",
      category: "Safety",
      iconType: "shield"
    }
  };
}
