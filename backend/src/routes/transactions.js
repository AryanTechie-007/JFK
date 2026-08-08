const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { categorizeTransaction } = require('../utils/categorize');

const router = express.Router();
router.use(requireAuth);

// GET /api/transactions?month=2026-08&category=Food%20Delivery
router.get('/', (req, res) => {
  const { month, category, limit } = req.query;
  const clauses = ['user_id = ?'];
  const params = [req.userId];

  if (month) {
    clauses.push("strftime('%Y-%m', txn_date) = ?");
    params.push(month);
  }
  if (category) {
    clauses.push('category = ?');
    params.push(category);
  }

  const rows = db
    .prepare(
      `SELECT * FROM transactions WHERE ${clauses.join(' AND ')}
       ORDER BY txn_date DESC LIMIT ?`
    )
    .all(...params, Number(limit) || 200);

  const total = rows.reduce((sum, t) => sum + t.amount, 0);
  res.json({ transactions: rows, count: rows.length, total });
});

// POST /api/transactions — Nova's live expense logger. Category is auto-derived if omitted.
router.post('/', (req, res) => {
  const { rawDescription, amount, category, txnDate } = req.body || {};
  if (!rawDescription || amount == null) {
    return res.status(400).json({ error: 'rawDescription and amount are required' });
  }

  const resolvedCategory = category || categorizeTransaction(rawDescription);
  const info = db
    .prepare(
      `INSERT INTO transactions (user_id, raw_description, amount, category, txn_date)
       VALUES (?, ?, ?, ?, COALESCE(?, datetime('now')))`
    )
    .run(req.userId, rawDescription, Number(amount), resolvedCategory, txnDate || null);

  const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ transaction: txn });
});

// POST /api/transactions/import — bulk parse of raw bank statement lines
// Body: { lines: [{ rawDescription, amount, txnDate }] }
router.post('/import', (req, res) => {
  const lines = (req.body || {}).lines;
  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: 'lines must be a non-empty array' });
  }

  const insert = db.prepare(
    `INSERT INTO transactions (user_id, raw_description, amount, category, txn_date)
     VALUES (?, ?, ?, ?, COALESCE(?, datetime('now')))`
  );

  const importAll = db.transaction((rows) => {
    const results = [];
    for (const row of rows) {
      if (!row.rawDescription || row.amount == null) continue;
      const category = row.category || categorizeTransaction(row.rawDescription);
      const info = insert.run(
        req.userId,
        row.rawDescription,
        Number(row.amount),
        category,
        row.txnDate || null
      );
      results.push({ id: info.lastInsertRowid, category });
    }
    return results;
  });

  const imported = importAll(lines);
  res.status(201).json({ imported: imported.length, results: imported });
});

// GET /api/transactions/distribution?month=2026-08 — TransactionCategorizerView share %
router.get('/distribution', (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const rows = db
    .prepare(
      `SELECT category, SUM(amount) AS total, COUNT(*) AS txn_count
       FROM transactions
       WHERE user_id = ? AND strftime('%Y-%m', txn_date) = ?
       GROUP BY category ORDER BY total DESC`
    )
    .all(req.userId, month);

  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);
  res.json({
    month,
    total: grandTotal,
    breakdown: rows.map((r) => ({
      ...r,
      share_pct: grandTotal > 0 ? Math.round((r.total / grandTotal) * 1000) / 10 : 0,
    })),
  });
});

// PATCH /api/transactions/:id — user corrects a wrong auto-category
router.patch('/:id', (req, res) => {
  const txn = db
    .prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!txn) return res.status(404).json({ error: 'Transaction not found' });

  const { category, amount, rawDescription } = req.body || {};
  db.prepare(
    'UPDATE transactions SET category = ?, amount = ?, raw_description = ? WHERE id = ?'
  ).run(
    category ?? txn.category,
    amount != null ? Number(amount) : txn.amount,
    rawDescription ?? txn.raw_description,
    txn.id
  );

  res.json({
    transaction: db.prepare('SELECT * FROM transactions WHERE id = ?').get(txn.id),
  });
});

// DELETE /api/transactions/:id
router.delete('/:id', (req, res) => {
  const info = db
    .prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.userId);
  if (info.changes === 0) return res.status(404).json({ error: 'Transaction not found' });
  res.json({ deleted: true });
});

module.exports = router;
