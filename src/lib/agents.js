/**
 * Agent UI Metadata & Configuration (SC §18)
 */

export const AGENTS = Object.freeze({
  john: {
    id: "john",
    name: "John",
    role: "Master Financial Coach",
    description: "Central AI orchestrator that synthesizes team insights into unified, wise advice.",
    badgeClass: "badge-john",
    color: "#059669",
    avatar: "🧑‍💼",
  },
  iris: {
    id: "iris",
    name: "Iris",
    role: "Spending Advisor",
    description: "Analyzes spending habits, flags wasteful patterns, and suggests cost reductions.",
    badgeClass: "badge-iris",
    color: "#8B5CF6",
    avatar: "👁️",
  },
  atlas: {
    id: "atlas",
    name: "Atlas",
    role: "Savings Strategist",
    description: "Designs structured savings goals and wealth accumulation roadmaps.",
    badgeClass: "badge-atlas",
    color: "#D97706",
    avatar: "🎯",
  },
  nova: {
    id: "nova",
    name: "Nova",
    role: "Budget Guardian",
    description: "Maintains budget allocations, enforces spending limits, and tracks category health.",
    badgeClass: "badge-nova",
    color: "#DC2626",
    avatar: "🛡️",
  },
  sentinel: {
    id: "sentinel",
    name: "Sentinel",
    role: "Financial Observer",
    description: "Monitors overall financial metrics, historical timelines, and cashflow risks.",
    badgeClass: "badge-sentinel",
    color: "#2563EB",
    avatar: "⚡",
  },
});

export const NAV_WORKSPACES = Object.freeze([
  { id: 'john', name: 'John', icon: 'Bot', role: 'Coach' },
  { id: 'sentinel', name: 'Sentinel', icon: 'Activity', role: 'Observer' },
  { id: 'nova', name: 'Nova', icon: 'Shield', role: 'Guardian' },
  { id: 'atlas', name: 'Atlas', icon: 'Target', role: 'Strategist' },
  { id: 'iris', name: 'Iris', icon: 'Compass', role: 'Advisor' },
]);
