const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function lastNMonths(n) {
  const months = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    months.push(m.toISOString().slice(0, 7));
  }
  return months;
}

// GET /api/insights/sentinel — forecast + risk radar
router.get('/sentinel', (req, res) => {
  const months = lastNMonths(6);

  const history = months.map((month) => {
    const row = db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
         WHERE user_id = ? AND strftime('%Y-%m', txn_date) = ?`
      )
      .get(req.userId, month);
    return { month, total: row.total };
  });

  // Simple linear trend over observed months — deliberately transparent so you can
  // swap in a proper time-series model later without changing the response shape.
  const observed = history.filter((h) => h.total > 0);
  let forecast = 0;
  if (observed.length >= 2) {
    const n = observed.length;
    const meanX = (n - 1) / 2;
    const meanY = observed.reduce((s, h) => s + h.total, 0) / n;
    let num = 0;
    let den = 0;
    observed.forEach((h, i) => {
      num += (i - meanX) * (h.total - meanY);
      den += (i - meanX) ** 2;
    });
    const slope = den === 0 ? 0 : num / den;
    forecast = Math.max(meanY + slope * (n - meanX), 0);
  } else if (observed.length === 1) {
    forecast = observed[0].total;
  }

  const bills = db
    .prepare(
      `SELECT * FROM upcoming_bills WHERE user_id = ? AND is_paid = 0
       ORDER BY due_date LIMIT 10`
    )
    .all(req.userId);

  const user = db
    .prepare('SELECT monthly_income, fixed_housing_expense FROM users WHERE id = ?')
    .get(req.userId);

  const riskFlags = [];
  const billTotal = bills.reduce((s, b) => s + b.amount, 0);
  const projectedOutflow = forecast + user.fixed_housing_expense + billTotal;
  if (projectedOutflow > user.monthly_income && user.monthly_income > 0) {
    riskFlags.push({
      severity: 'high',
      message: 'Projected outflow next month exceeds income.',
      shortfall: Math.round(projectedOutflow - user.monthly_income),
    });
  }
  for (const bill of bills) {
    if (bill.amount > user.monthly_income * 0.25 && user.monthly_income > 0) {
      riskFlags.push({
        severity: 'medium',
        message: `Large upcoming bill: ${bill.label} due ${bill.due_date}`,
        amount: bill.amount,
      });
    }
  }

  res.json({
    history,
    forecast_next_month: Math.round(forecast),
    upcoming_bills: bills,
    risk_flags: riskFlags,
  });
});

// GET /api/insights/iris — habit audit + savings simulator inputs
router.get('/iris', (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);

  const delivery = db
    .prepare(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(amount), 0) AS total, COALESCE(AVG(amount), 0) AS avg_order
       FROM transactions
       WHERE user_id = ? AND category = 'Food Delivery' AND strftime('%Y-%m', txn_date) = ?`
    )
    .get(req.userId, month);

  const subscriptions = db
    .prepare(
      `SELECT raw_description, SUM(amount) AS total, COUNT(*) AS charges
       FROM transactions
       WHERE user_id = ? AND category = 'Subscriptions' AND strftime('%Y-%m', txn_date) = ?
       GROUP BY raw_description ORDER BY total DESC`
    )
    .all(req.userId, month);

  // Simulator: what if delivery orders drop to `targetOrders` per month?
  const targetOrders = req.query.targetOrders != null ? Number(req.query.targetOrders) : null;
  let simulation = null;
  if (targetOrders != null && delivery.avg_order > 0) {
    const projected = targetOrders * delivery.avg_order;
    simulation = {
      current_orders: delivery.orders,
      target_orders: targetOrders,
      current_monthly_spend: Math.round(delivery.total),
      projected_monthly_spend: Math.round(projected),
      monthly_saving: Math.round(delivery.total - projected),
      annual_saving: Math.round((delivery.total - projected) * 12),
    };
  }

  res.json({
    month,
    food_delivery: {
      orders: delivery.orders,
      total: Math.round(delivery.total),
      avg_order: Math.round(delivery.avg_order),
    },
    subscriptions: {
      items: subscriptions,
      total: Math.round(subscriptions.reduce((s, r) => s + r.total, 0)),
    },
    simulation,
  });
});

// GET /api/insights/health — Financial Wellness Scorecard
router.get('/health', (req, res) => {
  const month = new Date().toISOString().slice(0, 7);
  const user = db
    .prepare('SELECT monthly_income, fixed_housing_expense FROM users WHERE id = ?')
    .get(req.userId);

  const spentRow = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS spent FROM transactions
       WHERE user_id = ? AND strftime('%Y-%m', txn_date) = ?`
    )
    .get(req.userId, month);

  const goals = db
    .prepare("SELECT * FROM goals WHERE user_id = ? AND status = 'active'").all(req.userId);
  const caps = db
    .prepare('SELECT category, monthly_cap FROM budget_categories WHERE user_id = ?')
    .all(req.userId);

  const income = user.monthly_income || 0;
  const allocations = goals.reduce((s, g) => s + g.monthly_allocation, 0);

  // Saving behaviour — savings rate vs a 20% benchmark
  const savingsRate = income > 0 ? allocations / income : 0;
  const savingScore = Math.min(Math.round((savingsRate / 0.2) * 25), 25);

  // Budget discipline — share of capped categories still within cap
  let withinCap = 0;
  for (const c of caps) {
    const s = db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS spent FROM transactions
         WHERE user_id = ? AND category = ? AND strftime('%Y-%m', txn_date) = ?`
      )
      .get(req.userId, c.category, month).spent;
    if (s <= c.monthly_cap) withinCap++;
  }
  const disciplineScore = caps.length ? Math.round((withinCap / caps.length) * 25) : 12;

  // Spending control — total outflow vs income
  const outflow = spentRow.spent + user.fixed_housing_expense;
  const outflowRatio = income > 0 ? outflow / income : 1;
  const controlScore = Math.max(Math.min(Math.round((1 - outflowRatio) / 0.4 * 25), 25), 0);

  // Future planning — goals defined and funded
  const fundedGoals = goals.filter((g) => g.monthly_allocation > 0).length;
  const planningScore = Math.min(fundedGoals * 8, 25);

  const total = savingScore + disciplineScore + controlScore + planningScore;

  res.json({
    score: total,
    grade: total >= 80 ? 'Excellent' : total >= 60 ? 'Good' : total >= 40 ? 'Fair' : 'Needs work',
    breakdown: {
      saving_behavior: savingScore,
      budget_discipline: disciplineScore,
      spending_control: controlScore,
      future_planning: planningScore,
    },
    metrics: {
      savings_rate_pct: Math.round(savingsRate * 100),
      outflow_ratio_pct: Math.round(outflowRatio * 100),
      capped_categories_within_limit: `${withinCap}/${caps.length}`,
    },
  });
});

// Upcoming bills — feeds Sentinel's risk radar
router.get('/bills', (req, res) => {
  const bills = db
    .prepare('SELECT * FROM upcoming_bills WHERE user_id = ? ORDER BY due_date')
    .all(req.userId);
  res.json({ bills });
});

router.post('/bills', (req, res) => {
  const { label, amount, dueDate } = req.body || {};
  if (!label || amount == null || !dueDate) {
    return res.status(400).json({ error: 'label, amount and dueDate are required' });
  }
  const info = db
    .prepare('INSERT INTO upcoming_bills (user_id, label, amount, due_date) VALUES (?, ?, ?, ?)')
    .run(req.userId, label, Number(amount), dueDate);
  res.status(201).json({
    bill: db.prepare('SELECT * FROM upcoming_bills WHERE id = ?').get(info.lastInsertRowid),
  });
});

router.patch('/bills/:id', (req, res) => {
  const info = db
    .prepare('UPDATE upcoming_bills SET is_paid = ? WHERE id = ? AND user_id = ?')
    .run((req.body || {}).isPaid ? 1 : 0, req.params.id, req.userId);
  if (info.changes === 0) return res.status(404).json({ error: 'Bill not found' });
  res.json({ updated: true });
});

module.exports = router;
