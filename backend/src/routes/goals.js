const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function ownedGoal(userId, goalId) {
  return db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(goalId, userId);
}

function withProgress(goal) {
  const remaining = Math.max(goal.target_amount - goal.saved_amount, 0);
  const monthsToTarget =
    goal.monthly_allocation > 0 ? Math.ceil(remaining / goal.monthly_allocation) : null;
  return {
    ...goal,
    progress_pct: goal.target_amount > 0
      ? Math.round((goal.saved_amount / goal.target_amount) * 100)
      : 0,
    remaining_amount: remaining,
    months_to_target: monthsToTarget,
  };
}

// GET /api/goals — Atlas dashboard
router.get('/', (req, res) => {
  const goals = db
    .prepare(`SELECT * FROM goals WHERE user_id = ? AND status != 'declined' ORDER BY
              CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at`)
    .all(req.userId);
  res.json({ goals: goals.map(withProgress) });
});

// POST /api/goals — manual add, or accepting one of John's proposals (source: 'john_proposal')
router.post('/', (req, res) => {
  const { name, targetAmount, monthlyAllocation, priority, source } = req.body || {};
  if (!name || !targetAmount) {
    return res.status(400).json({ error: 'name and targetAmount are required' });
  }

  const info = db
    .prepare(
      `INSERT INTO goals (user_id, name, target_amount, monthly_allocation, priority, source)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.userId,
      name,
      Number(targetAmount),
      Number(monthlyAllocation) || 0,
      priority || 'medium',
      source === 'john_proposal' ? 'john_proposal' : 'user'
    );

  res.status(201).json({ goal: withProgress(ownedGoal(req.userId, info.lastInsertRowid)) });
});

// PATCH /api/goals/:id — rename, retarget, reprioritize
router.patch('/:id', (req, res) => {
  const goal = ownedGoal(req.userId, req.params.id);
  if (!goal) return res.status(404).json({ error: 'Goal not found' });

  const { name, targetAmount, monthlyAllocation, priority, status } = req.body || {};

  db.prepare(
    `UPDATE goals SET name = ?, target_amount = ?, monthly_allocation = ?, priority = ?, status = ?
     WHERE id = ?`
  ).run(
    name ?? goal.name,
    targetAmount != null ? Number(targetAmount) : goal.target_amount,
    monthlyAllocation != null ? Number(monthlyAllocation) : goal.monthly_allocation,
    priority ?? goal.priority,
    status ?? goal.status,
    goal.id
  );

  res.json({ goal: withProgress(ownedGoal(req.userId, goal.id)) });
});

// POST /api/goals/:id/contribute — the "+ Add Extra Money" action
router.post('/:id/contribute', (req, res) => {
  const goal = ownedGoal(req.userId, req.params.id);
  if (!goal) return res.status(404).json({ error: 'Goal not found' });

  const amount = Number((req.body || {}).amount);
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'A positive amount is required' });
  }

  const newSaved = goal.saved_amount + amount;
  const status = newSaved >= goal.target_amount ? 'completed' : goal.status;
  db.prepare('UPDATE goals SET saved_amount = ?, status = ? WHERE id = ?').run(
    newSaved,
    status,
    goal.id
  );

  res.json({ goal: withProgress(ownedGoal(req.userId, goal.id)) });
});

// DELETE /api/goals/:id
router.delete('/:id', (req, res) => {
  const goal = ownedGoal(req.userId, req.params.id);
  if (!goal) return res.status(404).json({ error: 'Goal not found' });
  db.prepare('DELETE FROM goals WHERE id = ?').run(goal.id);
  res.json({ deleted: true });
});

module.exports = router;
