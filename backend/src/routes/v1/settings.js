/**
 * FinMate AI — `/api/v1/*` Authoritative Workspace, Chat, Action, Categorizer & Settings API
 * (SC §17.4, §18, Atlas §B.4, Nova §B.4, Iris §B.4, Sentinel §B.8, John §K.1)
 *
 * Split out of routes/v1/index.js by WS-FND-P1. Handler bodies are moved
 * verbatim; only the file-local require block changes.
 */

const express = require('express');
const db = require('../../db');
const { newId } = require('../../shared/ids');
const { requireAuth } = require('./_shared');

const { toCanonicalUserId } = require('../../shared/ids');
const { getCanonicalProfile } = require('../../platform/profile');
const { CATEGORIES } = require('../../engines/categorizer');

const router = express.Router();
router.use(requireAuth);

router.get('/settings', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const profile = getCanonicalProfile(canonicalUserId);
  const rules = db
    .prepare('SELECT * FROM category_rules WHERE user_id = ? AND active = 1 ORDER BY priority ASC')
    .all(canonicalUserId);
  const memoryFacts = db
    .prepare('SELECT * FROM memory_facts WHERE user_id = ? ORDER BY created_at DESC')
    .all(canonicalUserId);

  res.json({
    success: true,
    profile,
    category_rules: rules,
    memory_facts: memoryFacts,
    taxonomy: CATEGORIES,
  });
});

router.get('/settings/category-rules', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const rules = db
    .prepare('SELECT * FROM category_rules WHERE user_id = ? AND active = 1 ORDER BY priority ASC')
    .all(canonicalUserId);
  res.json({ success: true, rules });
});

router.get('/settings/memory-facts', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const facts = db
    .prepare('SELECT * FROM memory_facts WHERE user_id = ? ORDER BY created_at DESC')
    .all(canonicalUserId);
  res.json({ success: true, facts });
});

router.post('/memory/facts', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'text is required' });
  const factId = newId('mf');
  db.prepare(
    `INSERT INTO memory_facts (fact_id, user_id, text, created_at) VALUES (?, ?, ?, datetime('now'))`
  ).run(factId, canonicalUserId, text.slice(0, 200));
  res.status(201).json({
    fact: db.prepare('SELECT * FROM memory_facts WHERE fact_id = ?').get(factId),
  });
});

router.delete('/memory/facts/:fact_id', (req, res) => {
  const canonicalUserId = toCanonicalUserId(req.userId);
  db.prepare('DELETE FROM memory_facts WHERE fact_id = ? AND user_id = ?').run(
    req.params.fact_id,
    canonicalUserId
  );
  res.json({ deleted: true });
});

module.exports = router;
