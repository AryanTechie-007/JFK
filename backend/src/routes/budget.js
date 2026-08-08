const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function statusFor(pct) {
  if (pct >= 100) return 'exceeded';
  if (pct >= 85) return 'warning';
  return 'healthy';
}

// GET /api/budget?month=2026-08 — Nova's guardian view
router.get('/', (req, res) => {
  const month = req.query.month || currentMonth();

  const caps = db
    .prepare('SELECT category, monthly_cap FROM budget_categories WHERE user_id = ?')
    .all(req.userId);

  const spendRows = db
    .prepare(
      `SELECT category, SUM(amount) AS spent FROM transactions
       WHERE user_id = ? AND strftime('%Y-%m', txn_date) = ?
       GROUP BY category`
    )
    .all(req.userId, month);

  const spendMap = Object.fromEntries(spendRows.map((r) => [r.category, r.spent]));

  const categories = caps.map((c) => {
    const spent = spendMap[c.category] || 0;
    const pct = c.monthly_cap > 0 ? Math.round((spent / c.monthly_cap) * 100) : 0;
    return {
      category: c.category,
      monthly_cap: c.monthly_cap,
      spent,
      remaining: c.monthly_cap - spent,
      used_pct: pct,
      status: statusFor(pct),
    };
  });

  // Uncapped categories still count against cash flow, so surface them.
  const uncapped = spendRows
    .filter((r) => !caps.some((c) => c.category === r.category))
    .map((r) => ({
      category: r.category,
      monthly_cap: null,
      spent: r.spent,
      remaining: null,
      used_pct: null,
      status: 'uncapped',
    }));

  const user = db
    .prepare('SELECT monthly_income, fixed_housing_expense FROM users WHERE id = ?')
    .get(req.userId);

  const totalSpent = spendRows.reduce((sum, r) => sum + r.spent, 0);
  const allocatedToGoals = db
    .prepare(
      `SELECT COALESCE(SUM(monthly_allocation), 0) AS total FROM goals
       WHERE user_id = ? AND status = 'active'`
    )
    .get(req.userId).total;

  res.json({
    month,
    categories: [...categories, ...uncapped],
    cashflow: {
      monthly_income: user.monthly_income,
      fixed_housing_expense: user.fixed_housing_expense,
      variable_spend: totalSpent,
      goal_allocations: allocatedToGoals,
      surplus:
        user.monthly_income - user.fixed_housing_expense - totalSpent - allocatedToGoals,
    },
  });
});

// PUT /api/budget/:category — set or update a cap
router.put('/:category', (req, res) => {
  const cap = Number((req.body || {}).monthlyCap);
  if (!cap || cap < 0) {
    return res.status(400).json({ error: 'monthlyCap must be a positive number' });
  }

  db.prepare(
    `INSERT INTO budget_categories (user_id, category, monthly_cap) VALUES (?, ?, ?)
     ON CONFLICT(user_id, category) DO UPDATE SET monthly_cap = excluded.monthly_cap`
  ).run(req.userId, req.params.category, cap);

  res.json({ category: req.params.category, monthly_cap: cap });
});

// DELETE /api/budget/:category
router.delete('/:category', (req, res) => {
  db.prepare('DELETE FROM budget_categories WHERE user_id = ? AND category = ?').run(
    req.userId,
    req.params.category
  );
  res.json({ deleted: true });
});

module.exports = router;
