const express = require('express');
const NovaGuardianEngine = require('../agents/nova/NovaGuardianEngine');
const { defaultTallyService, TallyCategorizer } = require('../tools/tally/TallyService');
const { defaultJohnOrchestrator } = require('../agents/john/JohnOrchestrator');
const { ActionService } = require('../tools/action-service/ActionService');

function createTransactionRouter(getDb) {
  const router = express.Router();

  router.use((req, res, next) => {
    req.userId = req.headers['x-user-id'] || 'user_demo_nova';
    next();
  });

  // GET /api/transactions — List transactions
  router.get('/', (req, res) => {
    try {
      const db = getDb();
      const { month, category, limit } = req.query;
      let rows = db.prepare(`SELECT * FROM transactions WHERE user_id = ? ORDER BY txn_date DESC`).all(req.userId);

      if (month) {
        rows = rows.filter(r => (r.txn_date || '').startsWith(month));
      }
      if (category) {
        rows = rows.filter(r => r.category === category || r.category_id === category);
      }
      if (limit) {
        rows = rows.slice(0, Number(limit));
      }

      const total = rows.reduce((sum, t) => sum + Number(t.amount), 0);
      res.json({ transactions: rows, count: rows.length, total });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/transactions/review-queue — Provisional NEEDS_REVIEW & MISCATEGORIZATION_SUSPECTED items
  router.get('/review-queue', (req, res) => {
    try {
      const db = getDb();
      const allTxns = db.prepare(`SELECT * FROM transactions WHERE user_id = ?`).all(req.userId);
      const provisionalTxns = allTxns.filter(
        t => t.categorization_status === 'NEEDS_REVIEW' || t.categorization_status === 'UNCATEGORIZED'
      );
      const johnHints = defaultJohnOrchestrator.getReviewQueue(req.userId);

      res.json({
        provisional_transactions: provisionalTxns,
        suspected_miscategorizations: johnHints,
        total_review_items: provisionalTxns.length + johnHints.length
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/transactions — Ingest via Tally -> categorization.updated -> ThresholdJob
  router.post('/', (req, res) => {
    try {
      const db = getDb();
      const result = NovaGuardianEngine.processNewExpense(req.userId, req.body, db);
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // PATCH /api/transactions/:id/category — Pattern D: Category correction via ActionService & Tally
  router.patch('/:id/category', (req, res) => {
    try {
      const db = getDb();
      const newCategory = req.body?.new_category || req.body?.category;
      if (!newCategory) {
        return res.status(400).json({ error: 'new_category is required' });
      }

      const result = ActionService.execute({
        userId: req.userId,
        actionType: 'RECATEGORIZE_TRANSACTION',
        payload: {
          transaction_id: Number(req.params.id),
          new_category: newCategory
        },
        initiatedBy: 'User',
        db
      });

      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message, code: err.code });
    }
  });

  // POST /api/transactions/import — Bulk statement ingestion via Tally
  router.post('/import', (req, res) => {
    try {
      const db = getDb();
      const lines = (req.body || {}).lines;
      if (!Array.isArray(lines) || lines.length === 0) {
        return res.status(400).json({ error: 'lines must be a non-empty array' });
      }

      const validLines = lines
        .filter(r => r.rawDescription && r.amount != null)
        .map(r => ({
          rawDescription: r.rawDescription,
          amount: Number(r.amount),
          category: r.category || TallyCategorizer.categorize(r.rawDescription),
          categorization_status: r.categorization_status || 'SETTLED',
          txnDate: r.txnDate || new Date().toISOString()
        }));

      const batchResult = defaultTallyService.ingestBatch(req.userId, validLines, db, {
        import_in_progress: Boolean(req.body?.import_in_progress)
      });

      res.status(201).json({
        imported: batchResult.event.transaction_ids.length,
        event: batchResult.event,
        snapshot_id: batchResult.snapshot.snapshot_id
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/transactions/distribution — Spending share breakdown
  router.get('/distribution', (req, res) => {
    try {
      const db = getDb();
      const month = req.query.month || NovaGuardianEngine.getCurrentMonth();
      const rows = db.prepare(`
        SELECT category, SUM(amount) AS total, COUNT(*) AS txn_count
        FROM transactions
        WHERE user_id = ? AND strftime('%Y-%m', txn_date) = ?
        GROUP BY category ORDER BY total DESC
      `).all(req.userId, month);

      const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);
      res.json({
        month,
        total: grandTotal,
        breakdown: rows.map(r => ({
          ...r,
          share_pct: grandTotal > 0 ? Math.round((r.total / grandTotal) * 1000) / 10 : 0
        }))
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

module.exports = createTransactionRouter;
