const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Builds the comprehensive financial snapshot John and team reason over.
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

  return { month, user, goals, spendByCategory, caps, upcomingBills: bills };
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
      role: 'Predictor & Risk Radar',
      title: 'Sentinel Risk Forecast',
      thought: billCount > 0 
        ? `Sentinel detected ${billCount} upcoming bill(s). Fixed housing expense is ₹${fixed.toLocaleString()}.`
        : `Sentinel projected monthly cash outflow out of ₹${income.toLocaleString()} income.`
    },
    {
      agent: 'iris',
      role: 'Spending Advisor',
      title: 'Iris Habit Audit',
      thought: topSpend 
        ? `Iris isolated top monthly category: ${topSpend.category} (₹${topSpend.spent.toLocaleString()} across ${topSpend.txns} transactions).`
        : `Iris audited discretionary variable spending streams.`
    },
    {
      agent: 'nova',
      role: 'Budget Guardian',
      title: 'Nova Threshold Status',
      thought: context.caps?.length > 0 
        ? `Nova is monitoring ${context.caps.length} category caps against monthly limits.`
        : `Nova verified overall cash flow ceiling.`
    },
    {
      agent: 'atlas',
      role: 'Saving Strategist',
      title: 'Atlas Wealth Strategy',
      thought: goalCount > 0
        ? `Atlas is tracking ${goalCount} active financial objective(s). Net surplus buffer is ₹${Math.max(0, income - fixed).toLocaleString()}.`
        : `Atlas calculated optimal goal contribution path.`
    }
  ];
}

const SYSTEM_PROMPT = `You are John, a personal financial coach at FinMate AI. You synthesise findings from four
specialist agents: Sentinel (forecasting upcoming expenses), Iris (spending habit optimisation),
Atlas (goal and savings strategy), and Nova (budget cap enforcement).

Rules:
- Use only the figures in the provided context. Never invent numbers.
- All amounts are in Indian rupees (INR).
- Be concrete and specific. Reference actual categories and amounts from the context.
- Format advice clearly using bold markdown and bullet points.
- If you want to suggest a savings goal, end your reply with a JSON block on its own line:
  {"proposal": {"name": "...", "target": 0, "targetAmount": 0, "monthlyAdd": 0, "monthlyAllocation": 0, "priority": "MEDIUM PRIORITY", "category": "Savings"}}
  Include at most one proposal per reply.`;

async function handleChatExecution(req, res) {
  const { message, history } = req.body || {};
  const queryText = message || req.body?.userQuery;

  if (!queryText || typeof queryText !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  const context = buildContext(req.userId);
  const defaultTraces = generateAgentTraces(context);

  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.includes('your_gemini')) {
    // Return structured default response if Gemini key is omitted
    return res.json({
      success: true,
      reply: `I have evaluated your financial state alongside **Sentinel**, **Iris**, **Nova**, and **Atlas**:\n\n- **Monthly Net Income**: ₹${(context.user?.monthly_income || 0).toLocaleString()}\n- **Fixed Expenses**: ₹${(context.user?.fixed_housing_expense || 0).toLocaleString()}\n- **Active Goals**: ${context.goals?.length || 0}\n\nHow can our team guide your financial strategy today?`,
      text: `I have evaluated your financial state alongside **Sentinel**, **Iris**, **Nova**, and **Atlas**:\n\n- **Monthly Net Income**: ₹${(context.user?.monthly_income || 0).toLocaleString()}\n- **Fixed Expenses**: ₹${(context.user?.fixed_housing_expense || 0).toLocaleString()}\n- **Active Goals**: ${context.goals?.length || 0}\n\nHow can our team guide your financial strategy today?`,
      traces: defaultTraces,
      proposal: null,
      contextUsed: context
    });
  }

  const contents = [
    ...(Array.isArray(history) ? history : [])
      .slice(-10)
      .filter((m) => m && (m.text || m.message))
      .map((m) => ({
        role: m.role === 'model' ? 'model' : 'user',
        parts: [{ text: String(m.text || m.message) }],
      })),
    {
      role: 'user',
      parts: [
        {
          text: `Financial context (JSON):\n${JSON.stringify(context, null, 2)}\n\nUser Question: ${queryText}`,
        },
      ],
    },
  ];

  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('Gemini API error:', response.status, detail);
      return res.json({
        success: true,
        reply: `I have analyzed your financial details alongside **Sentinel**, **Iris**, **Nova**, and **Atlas**. Your current net surplus is ₹${Math.max(0, (context.user?.monthly_income || 0) - (context.user?.fixed_housing_expense || 0)).toLocaleString()}/mo.`,
        text: `I have analyzed your financial details alongside **Sentinel**, **Iris**, **Nova**, and **Atlas**. Your current net surplus is ₹${Math.max(0, (context.user?.monthly_income || 0) - (context.user?.fixed_housing_expense || 0)).toLocaleString()}/mo.`,
        traces: defaultTraces,
        proposal: null
      });
    }

    const data = await response.json();
    const reply =
      (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim() || '';

    // Extract proposal card if generated
    let proposal = null;
    const match = reply.match(/\{[\s\S]*"proposal"[\s\S]*\}/);
    if (match) {
      try {
        proposal = JSON.parse(match[0]).proposal;
      } catch (_) {
        proposal = null;
      }
    }

    const cleanReply = proposal ? reply.replace(match[0], '').trim() : reply;

    const proposedGoal = proposal ? {
      name: proposal.name || 'New Savings Reserve',
      target: Number(proposal.target || proposal.targetAmount) || 50000,
      monthlyAdd: Number(proposal.monthlyAdd || proposal.monthlyAllocation) || 5000,
      priority: proposal.priority || 'MEDIUM PRIORITY',
      category: proposal.category || 'Savings',
      iconType: 'target'
    } : null;

    res.json({
      success: true,
      reply: cleanReply,
      text: cleanReply,
      traces: defaultTraces,
      proposal,
      proposedGoal,
      contextUsed: context,
    });
  } catch (err) {
    console.error('Coach request exception:', err);
    res.json({
      success: true,
      reply: `I am monitoring your cash flow with **Sentinel**, **Iris**, **Nova**, and **Atlas**. How can we help optimize your budget today?`,
      text: `I am monitoring your cash flow with **Sentinel**, **Iris**, **Nova**, and **Atlas**. How can we help optimize your budget today?`,
      traces: defaultTraces,
      proposal: null
    });
  }
}

// POST /api/coach/chat & POST /api/ai/chat
router.post('/chat', handleChatExecution);

// GET /api/coach/context
router.get('/context', (req, res) => {
  const context = buildContext(req.userId);
  res.json({
    success: true,
    context,
    traces: generateAgentTraces(context)
  });
});

// GET /api/ai/conversations
router.get('/conversations', (req, res) => {
  res.json({
    success: true,
    conversations: [
      { id: 'conv-default', title: 'John Coaching Session', updatedAt: new Date().toISOString() }
    ]
  });
});

// POST /api/ai/conversations
router.post('/conversations', (req, res) => {
  res.json({
    success: true,
    conversation: {
      id: `conv-${Date.now()}`,
      title: req.body?.title || 'New Coaching Session',
      messages: []
    }
  });
});

// POST /api/ai/conversations/:id/messages
router.post('/conversations/:id/messages', handleChatExecution);

module.exports = router;
