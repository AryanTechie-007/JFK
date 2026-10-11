const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const DEFAULT_CAPS = {
  'Food & Dining': 10000,
  'Shopping & Lifestyle': 10000,
  'Subscriptions': 3000,
  'Transport': 5000,
  'Bills & Utilities': 5000,
};

function getProfile(userId) {
  const user = db
    .prepare(
      `SELECT id, name, email, occupation, monthly_income, fixed_housing_expense,
              risk_strategy, created_at
       FROM users WHERE id = ?`
    )
    .get(userId);

  if (!user) return null;

  const totalSpent = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) as spent FROM transactions
       WHERE user_id = ? AND strftime('%Y-%m', txn_date) = strftime('%Y-%m', 'now')`
    )
    .get(userId)?.spent || 0;

  const income = user.monthly_income || 0;
  const fixed = user.fixed_housing_expense || 0;
  const surplus = Math.max(0, income - totalSpent);
  const savingsRate = income > 0 ? Number(((surplus / income) * 100).toFixed(1)) : 0;

  return {
    ...user,
    monthlyIncome: user.monthly_income || 0,
    fixedExpenses: user.fixed_housing_expense || 0,
    currentSavings: surplus,
    savingsRate: savingsRate,
    totalSpentThisMonth: totalSpent,
    healthScore: savingsRate > 20 ? 84 : 70
  };
}

function handleGetProfile(req, res) {
  const profile = getProfile(req.userId);
  if (!profile) return res.status(404).json({ error: 'User not found' });
  res.json({ success: true, profile, user: profile, onboardingComplete: profile.monthly_income > 0 });
}

function handleOnboarding(req, res) {
  const {
    name,
    occupation,
    monthlyIncome,
    fixedExpenses,
    fixedHousingExpense,
    riskStrategy,
    initialGoal,
    primaryGoal,
  } = req.body || {};

  const numIncome = Number(monthlyIncome) || 0;
  const numFixed = Number(fixedExpenses != null ? fixedExpenses : fixedHousingExpense) || 0;

  const allowedRisk = ['conservative', 'balanced', 'aggressive'];
  const risk = allowedRisk.includes((riskStrategy || '').toLowerCase()) ? riskStrategy : 'balanced';

  db.prepare(
    `UPDATE users
     SET name = COALESCE(?, name), occupation = ?, monthly_income = ?, fixed_housing_expense = ?, risk_strategy = ?
     WHERE id = ?`
  ).run(
    name || null,
    occupation || null,
    numIncome,
    numFixed,
    risk,
    req.userId
  );

  const goal = initialGoal || primaryGoal;
  if (goal && goal.name && (goal.target || goal.targetAmount)) {
    db.prepare(
      `INSERT INTO goals (user_id, name, target_amount, monthly_allocation, priority)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      req.userId,
      goal.name,
      Number(goal.target || goal.targetAmount),
      Number(goal.monthlyAdd || goal.monthlyAllocation) || 0,
      goal.priority || 'HIGH PRIORITY'
    );
  }

  // Seed Nova's category caps
  const insertCap = db.prepare(
    `INSERT OR IGNORE INTO budget_categories (user_id, category, monthly_cap) VALUES (?, ?, ?)`
  );
  for (const [category, cap] of Object.entries(DEFAULT_CAPS)) {
    insertCap.run(req.userId, category, cap);
  }

  const profile = getProfile(req.userId);
  res.json({ success: true, profile, user: profile, onboardingComplete: true });
}

function handleUpdateProfile(req, res) {
  const current = getProfile(req.userId);
  if (!current) return res.status(404).json({ error: 'User not found' });

  const { name, occupation, monthlyIncome, fixedExpenses, fixedHousingExpense, riskStrategy } = req.body || {};

  db.prepare(
    `UPDATE users
     SET name = ?, occupation = ?, monthly_income = ?, fixed_housing_expense = ?, risk_strategy = ?
     WHERE id = ?`
  ).run(
    name ?? current.name,
    occupation ?? current.occupation,
    monthlyIncome != null ? Number(monthlyIncome) : current.monthly_income,
    fixedExpenses != null ? Number(fixedExpenses) : (fixedHousingExpense != null ? Number(fixedHousingExpense) : current.fixed_housing_expense),
    riskStrategy ?? current.risk_strategy,
    req.userId
  );

  const profile = getProfile(req.userId);
  res.json({ success: true, profile, user: profile });
}

// Routes
router.get('/', handleGetProfile);
router.get('/me', handleGetProfile);

router.post('/onboarding', handleOnboarding);
router.post('/me/onboarding', handleOnboarding);

router.put('/', handleUpdateProfile);
router.patch('/', handleUpdateProfile);
router.patch('/me', handleUpdateProfile);

module.exports = router;
