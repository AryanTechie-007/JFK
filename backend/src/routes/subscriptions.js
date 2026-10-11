const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function ownedSubscription(userId, id) {
  return db.prepare('SELECT * FROM subscriptions WHERE id = ? AND user_id = ?').get(id, userId);
}

// GET /api/subscriptions — list all subscriptions for current user
router.get('/', (req, res) => {
  const subscriptions = db
    .prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY amount DESC, created_at DESC')
    .all(req.userId);
  res.json({ subscriptions });
});

// POST /api/subscriptions — add a subscription
router.post('/', (req, res) => {
  const { name, amount, billingCycle = 'monthly', category = 'Entertainment', nextBillingDate } = req.body || {};
  if (!name || amount === undefined || amount === null || isNaN(Number(amount))) {
    return res.status(400).json({ error: 'name and a valid amount are required' });
  }

  const info = db
    .prepare(
      `INSERT INTO subscriptions (user_id, name, amount, billing_cycle, category, next_billing_date)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.userId,
      String(name).trim(),
      Number(amount),
      billingCycle,
      category || 'Other',
      nextBillingDate || null
    );

  const created = ownedSubscription(req.userId, info.lastInsertRowid);
  res.status(201).json({ subscription: created });
});

// DELETE /api/subscriptions/:id — cancel/remove a subscription
router.delete('/:id', (req, res) => {
  const existing = ownedSubscription(req.userId, req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Subscription not found' });
  }

  db.prepare('DELETE FROM subscriptions WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ ok: true, deletedId: Number(req.params.id) });
});

module.exports = router;
