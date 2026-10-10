/**
 * Mock Financial Dataset for Nova Agent Standalone Environment
 */

export const NOVA_AGENT_PROFILE = {
  id: "nova",
  name: "Nova",
  role: "Real-Time Budget Guardian",
  badgeClass: "badge-nova",
  color: "#dc2626",
  glowColor: "rgba(220, 38, 38, 0.12)",
  description: "Streams transactions live and enforces category thresholds to protect cash flow surplus."
};

export const DEFAULT_BUDGET_CAPS = [
  { category: "Food & Dining", limit: 10000, spent: 9200, percent: 92, status: "warning" },
  { category: "Shopping & Lifestyle", limit: 8000, spent: 7300, percent: 91, status: "warning" },
  { category: "Subscriptions", limit: 3000, spent: 3487, percent: 116, status: "exceeded" },
  { category: "Transport", limit: 5000, spent: 3500, percent: 70, status: "healthy" },
  { category: "Bills & Utilities", limit: 6000, spent: 3649, percent: 61, status: "healthy" }
];

export const RECENT_TRANSACTIONS = [
  { id: "tx-1", date: "2026-08-15", description: "Zara Weekend Casuals", amount: 4100, category: "Shopping & Lifestyle", merchant: "Zara", type: "debit" },
  { id: "tx-2", date: "2026-08-14", description: "Fine Dining Bistro", amount: 6250, category: "Food & Dining", merchant: "Fine Dining", type: "debit" },
  { id: "tx-3", date: "2026-08-12", description: "Apple iCloud Plus", amount: 490, category: "Subscriptions", merchant: "Apple", type: "debit" },
  { id: "tx-4", date: "2026-08-11", description: "Shell Petrol Top-up", amount: 2500, category: "Transport", merchant: "Shell", type: "debit" },
  { id: "tx-5", date: "2026-08-10", description: "Google One Cloud 2TB", amount: 650, category: "Subscriptions", merchant: "Google", type: "debit" },
  { id: "tx-6", date: "2026-08-09", description: "Amazon Electronics", amount: 3200, category: "Shopping & Lifestyle", merchant: "Amazon", type: "debit" }
];

export const DEMO_USER_PROFILE = {
  name: "Aryan",
  currency: "₹",
  monthlyIncome: 75000,
  fixedHousingExpense: 25000,
  totalSpentThisMonth: 27286,
  currentSavings: 22714,
  savingsRate: 30.3
};
