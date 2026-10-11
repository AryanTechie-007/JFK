/**
 * SnapshotManager — Immutable Snapshot Store for Sentinel (Section 4, 5, 12, 14 #4)
 *
 * Each request reads one `snapshot_id`, which pins a `categorization_version`.
 * Tracks staleness and retains the last known good snapshot for fallback on Sentinel timeout/error.
 */

const TaxonomyRegistry = require('../tally/TaxonomyRegistry');
const UntrustedTextSanitizer = require('../../agents/nova/UntrustedTextSanitizer');

const snapshotStore = new Map();
const latestSnapshotByUser = new Map();
const lastGoodSnapshotByUser = new Map();
let snapshotCounter = 1;

class SnapshotManager {
  /**
   * Captures a pinned point-in-time snapshot of a user's ledger, caps, and preferences.
   */
  static createSnapshot(userId = 'user_demo_nova', db, options = {}) {
    const targetMonth = options.month || new Date().toISOString().slice(0, 7);
    const snapshotId = options.snapshot_id || `snap-${targetMonth}-${snapshotCounter++}`;
    const categorizationVersion = options.categorization_version || `v4.0.${snapshotCounter}`;
    const createdAt = options.created_at || new Date().toISOString();

    const user = db.prepare(`
      SELECT monthly_income, fixed_housing_expense, currency
      FROM users WHERE id = ?
    `).get(userId) || {
      monthly_income: 75000,
      fixed_housing_expense: 25000,
      currency: '₹'
    };

    const rawCaps = db.prepare(`
      SELECT category, monthly_cap
      FROM budget_categories
      WHERE user_id = ?
      ORDER BY monthly_cap DESC
    `).all(userId);

    // Apply taxonomy migrations & category_id resolution to caps
    const migratedCaps = [];
    for (const c of rawCaps) {
      const migratedList = TaxonomyRegistry.migrateCapRecord(c);
      migratedCaps.push(...migratedList);
    }

    const allTxns = db.prepare(`
      SELECT * FROM transactions WHERE user_id = ?
      ORDER BY txn_date DESC
    `).all(userId);

    // Sanitize merchant and description strings as untrusted data fields (Section 5.2 & 9)
    const sanitizedTxns = allTxns.map(tx => {
      const sanitized = UntrustedTextSanitizer.sanitizeTransaction(tx);
      const resolvedNode = TaxonomyRegistry.resolve(tx.category_id || tx.category);
      const status = tx.categorization_status || (
        tx.category === 'UNCATEGORIZED' ? 'UNCATEGORIZED' : 'SETTLED'
      );
      return {
        ...tx,
        raw_description: sanitized.sanitized_description,
        merchant_sanitized: sanitized.sanitized_merchant,
        injection_detected: sanitized.injection_detected,
        category_id: tx.category_id || (resolvedNode ? resolvedNode.category_id : 'cat_uncategorized'),
        categorization_status: status
      };
    });

    const userPersona = db.prepare(`
      SELECT * FROM user_personas WHERE user_id = ?
    `).get(userId) || {
      user_id: userId,
      lifestyle_flexibility: 'moderate',
      priority_categories: '["Housing", "Healthcare", "Bills & Utilities"]',
      flexible_categories: '["Shopping & Lifestyle", "Food & Dining"]',
      target_savings_rate: 25.0
    };

    const merchantProfiles = db.prepare(`
      SELECT * FROM merchant_profiles WHERE user_id = ?
    `).all(userId).map(m => ({
      ...m,
      merchant_name: UntrustedTextSanitizer.sanitizeText(m.merchant_name).sanitized
    }));

    // Committed goal contributions (for CAPS_EXCEED_SPENDABLE rule)
    const committedGoalContributions = options.committed_goal_contributions ??
      Math.round((user.monthly_income || 75000) * ((userPersona.target_savings_rate || 20) / 100) * 0.5);

    const snapshot = {
      snapshot_id: snapshotId,
      categorization_version: categorizationVersion,
      user_id: userId,
      month: targetMonth,
      created_at: createdAt,
      created_at_ms: Date.now(),
      is_stale: Boolean(options.is_stale),
      import_in_progress: Boolean(options.import_in_progress),
      confidence_override: options.confidence_override || null,
      simulate_timeout: Boolean(options.simulate_timeout),
      user: {
        monthly_income: Number(user.monthly_income) || 75000,
        fixed_housing_expense: Number(user.fixed_housing_expense) || 25000,
        committed_goal_contributions: committedGoalContributions,
        currency: user.currency || '₹'
      },
      caps: migratedCaps,
      raw_caps: rawCaps,
      transactions: sanitizedTxns,
      user_persona: userPersona,
      merchant_profiles: merchantProfiles
    };

    // Mark previous latest snapshot for this user as superseded
    const prevId = latestSnapshotByUser.get(userId);
    if (prevId && prevId !== snapshotId && snapshotStore.has(prevId)) {
      const prevSnap = snapshotStore.get(prevId);
      prevSnap.superseded_by = snapshotId;
    }

    snapshotStore.set(snapshotId, snapshot);
    if (!snapshot.is_stale && !snapshot.simulate_timeout) {
      latestSnapshotByUser.set(userId, snapshotId);
      lastGoodSnapshotByUser.set(userId, snapshot);
    }

    return snapshot;
  }

  static getSnapshot(snapshotId) {
    return snapshotStore.get(snapshotId) || null;
  }

  static getLatestSnapshot(userId = 'user_demo_nova', db = null) {
    const latestId = latestSnapshotByUser.get(userId);
    if (latestId && snapshotStore.has(latestId)) {
      return snapshotStore.get(latestId);
    }
    if (db) {
      return this.createSnapshot(userId, db);
    }
    return null;
  }

  static getLastGoodSnapshot(userId = 'user_demo_nova') {
    const snap = lastGoodSnapshotByUser.get(userId);
    if (!snap) return null;
    const ageSeconds = Math.max(0, Math.round((Date.now() - snap.created_at_ms) / 1000));
    return {
      ...snap,
      age_seconds: ageSeconds,
      age_label: `${ageSeconds}s old`
    };
  }

  static markStale(snapshotId, replacementSnapshotId = null) {
    const snap = snapshotStore.get(snapshotId);
    if (snap) {
      snap.is_stale = true;
      if (replacementSnapshotId) {
        snap.superseded_by = replacementSnapshotId;
      }
    }
  }

  static isStale(snapshotId) {
    const snap = snapshotStore.get(snapshotId);
    if (!snap) return false;
    return Boolean(snap.is_stale || snap.superseded_by);
  }
}

module.exports = SnapshotManager;
