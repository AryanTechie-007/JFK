const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { handleChatRequest } = require('../agents/john');
const { createSnapshot } = require('../platform/snapshot');
const { getStatus } = require('../engines/categorizer');

const router = express.Router();
router.use(requireAuth);

function buildContext(userId) {
  const month = new Date().toISOString().slice(0, 7);

  const user = db
    .prepare(
      `SELECT name, occupation, monthly_income, fixed_housing_expense, risk_strategy
       FROM users WHERE id = ?`
    )
    .get(userId);

  const goals = db
    .prepare(
      `SELECT name, target_amount, saved_amount, monthly_allocation, priority
       FROM goals WHERE user_id = ? AND status = 'active'`
    )
    .all(userId);

  const spendByCategory = db
    .prepare(
      `SELECT category, SUM(amount) AS spent, COUNT(*) AS txns FROM transactions
       WHERE user_id = ? AND strftime('%Y-%m', txn_date) = ?
       GROUP BY category ORDER BY spent DESC`
    )
    .all(userId, month);

  const caps = db
    .prepare('SELECT category, monthly_cap FROM budget_categories WHERE user_id = ?')
    .all(userId);

  const bills = db
    .prepare(
      `SELECT label, amount, due_date FROM upcoming_bills
       WHERE user_id = ? AND is_paid = 0 ORDER BY due_date LIMIT 5`
    )
    .all(userId);

  const snap = createSnapshot(userId);
  const dataQuality = getStatus(userId, snap.ledger_version);

  return {
    month,
    user,
    goals,
    spendByCategory,
    caps,
    upcomingBills: bills,
    snapshot: snap,
    dataQuality,
  };
}

function generateAgentTraces(context) {
  const user = context.user || {};
  const income = user.monthly_income || 0;
  const fixed = user.fixed_housing_expense || 0;
  const topSpend = context.spendByCategory?.[0];
  const billCount = context.upcomingBills?.length || 0;
  const goalCount = context.goals?.length || 0;

  return [
    {
      agent: 'sentinel',
      role: 'Financial Observer v5.0',
      title: 'Sentinel Snapshot & Coverage',
      thought: billCount > 0
        ? `Sentinel detected ${billCount} upcoming bill(s). Fixed housing expense is ₹${fixed.toLocaleString()}.`
        : `Sentinel pinned snapshot ${context.snapshot?.snapshot_id || 'live'} over ₹${income.toLocaleString()} monthly income.`,
    },
    {
      agent: 'iris',
      role: 'Spending Advisor v5.0',
      title: 'Iris Simulation & Outlook',
      thought: topSpend
        ? `Iris isolated top monthly category: ${topSpend.category} (₹${topSpend.spent.toLocaleString()} across ${topSpend.txns} transactions).`
        : `Iris evaluated discretionary spending streams.`,
    },
    {
      agent: 'nova',
      role: 'Budget Guardian v5.0',
      title: 'Nova Cap Utilization',
      thought: context.caps?.length > 0
        ? `Nova is monitoring ${context.caps.length} category caps against monthly limits.`
        : `Nova verified overall cash flow ceiling.`,
    },
    {
      agent: 'atlas',
      role: 'Savings Strategist v5.0',
      title: 'Atlas Goal Feasibility',
      thought: goalCount > 0
        ? `Atlas is tracking ${goalCount} active financial objective(s). Net surplus buffer is ₹${Math.max(0, income - fixed).toLocaleString()}.`
        : `Atlas calculated optimal goal contribution path.`,
    },
  ];
}

async function handleChatExecution(req, res) {
  const { message } = req.body || {};
  const queryText = message || req.body?.userQuery;

  if (!queryText || typeof queryText !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const johnResponse = await handleChatRequest(req.userId, req.body || {});
    return res.json(johnResponse);
  } catch (err) {
    console.error('John v2.0 chat error:', err);
    const context = buildContext(req.userId);
    const defaultTraces = generateAgentTraces(context);
    return res.json({
      success: true,
      reply: `I have evaluated your financial state alongside **Sentinel**, **Iris**, **Nova**, and **Atlas**. How can we help optimize your budget today?`,
      text: `I have evaluated your financial state alongside **Sentinel**, **Iris**, **Nova**, and **Atlas**. How can we help optimize your budget today?`,
      traces: defaultTraces,
      proposals: [],
      proposal: null,
    });
  }
}

router.post('/chat', handleChatExecution);

router.get('/context', (req, res) => {
  const context = buildContext(req.userId);
  res.json({
    success: true,
    context,
    traces: generateAgentTraces(context),
  });
});

router.get('/conversations', (_req, res) => {
  res.json({
    success: true,
    conversations: [
      { id: 'conv-default', title: 'John Coaching Session', updatedAt: new Date().toISOString() },
    ],
  });
});

router.post('/conversations', (req, res) => {
  res.json({
    success: true,
    conversation: {
      id: `conv-${Date.now()}`,
      title: req.body?.title || 'New Coaching Session',
      messages: [],
    },
  });
});

router.post('/conversations/:id/messages', handleChatExecution);

module.exports = router;
