/**
 * TallyService — Background Categorization Service & Event Publisher
 *
 * Implements Nova V4 Changes from V3 & Section 4 Step 1:
 * - Categorizes transactions (settled, provisional NEEDS_REVIEW, or UNCATEGORIZED)
 * - Handles category corrections (moving a transaction from old category to new category)
 * - Publishes `categorization.updated` with changed transaction IDs, touched categories,
 *   and previous categories of any corrected transactions.
 * - Computes `data_quality` metrics for TaskPacket@1.
 */

const EventEmitter = require('events');
const TaxonomyRegistry = require('./TaxonomyRegistry');
const TallyCategorizer = require('./TallyCategorizer');
const SnapshotManager = require('../sentinel/SnapshotManager');

class TallyService extends EventEmitter {
  constructor() {
    super();
    this.categorizationVersion = 1;
    this.importInProgressMap = new Map();
  }

  getVersionString() {
    return `v4.0.${this.categorizationVersion}`;
  }

  setImportInProgress(userId, inProgress) {
    this.importInProgressMap.set(userId, Boolean(inProgress));
  }

  isImportInProgress(userId) {
    return Boolean(this.importInProgressMap.get(userId));
  }

  /**
   * Ingests and categorizes one or more transactions, updates snapshot, and emits `categorization.updated`.
   */
  ingestBatch(userId, items = [], db, options = {}) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('items must be a non-empty array');
    }

    this.categorizationVersion++;
    const insertedIds = [];
    const touchedCategories = new Set();
    const suspectedMiscategorizations = [];

    const insertStmt = db.prepare(`
      INSERT INTO transactions (user_id, raw_description, amount, category, category_id, categorization_status, txn_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of items) {
      const rawDesc = item.rawDescription || item.raw_description;
      const amount = Number(item.amount);
      if (!rawDesc || isNaN(amount) || amount <= 0) {
        throw new Error('Valid rawDescription and positive numeric amount are required.');
      }

      const explicitCat = item.category || item.category_id || null;
      const classification = TallyCategorizer.classifyTransaction({
        rawDescription: rawDesc,
        explicitCategory: explicitCat,
        categorizationStatus: item.categorization_status || item.status || null
      });

      const txnDate = item.txnDate || item.txn_date || new Date().toISOString();

      let info;
      try {
        info = insertStmt.run(
          userId,
          rawDesc,
          amount,
          classification.category,
          classification.category_id,
          classification.status,
          txnDate
        );
      } catch (e) {
        // Fallback if using legacy 5-column insert
        info = db.prepare(`
          INSERT INTO transactions (user_id, raw_description, amount, category, txn_date)
          VALUES (?, ?, ?, ?, ?)
        `).run(userId, rawDesc, amount, classification.category, txnDate);
      }

      const txId = info.lastInsertRowid;
      insertedIds.push(txId);
      touchedCategories.add(classification.category);
      if (classification.category_id) {
        touchedCategories.add(classification.category_id);
      }

      if (classification.miscategorization_suspected) {
        suspectedMiscategorizations.push({
          transaction_id: txId,
          raw_description: rawDesc,
          amount,
          assigned_category: classification.category,
          suspected_category: classification.suspected_category
        });
      }
    }

    const snapshot = SnapshotManager.createSnapshot(userId, db, {
      categorization_version: this.getVersionString(),
      import_in_progress: Boolean(options.import_in_progress || this.isImportInProgress(userId))
    });

    const eventPayload = {
      event_type: 'categorization.updated',
      event_id: options.event_id || `evt-tally-${this.categorizationVersion}-${Date.now()}`,
      user_id: userId,
      snapshot_id: snapshot.snapshot_id,
      categorization_version: snapshot.categorization_version,
      transaction_ids: insertedIds,
      touched_categories: Array.from(touchedCategories),
      previous_categories: [],
      corrections: [],
      suspected_miscategorizations: suspectedMiscategorizations,
      timestamp: new Date().toISOString()
    };

    this.emit('categorization.updated', eventPayload);
    return {
      event: eventPayload,
      snapshot
    };
  }

  /**
   * Pattern D (Page 7, 8, 9, 10 #10): Category correction moves a transaction between categories.
   * Publishes `categorization.updated` with both the previous category and the new category.
   */
  correctTransactionCategory(userId, transactionId, newCategoryInput, db, options = {}) {
    const tx = db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(Number(transactionId));
    if (!tx) {
      throw new Error(`Transaction ${transactionId} not found.`);
    }

    const oldCategory = tx.category;
    const oldCategoryId = tx.category_id || TaxonomyRegistry.resolve(oldCategory)?.category_id || oldCategory;

    const resolvedNew = TaxonomyRegistry.resolve(newCategoryInput);
    const topNew = resolvedNew && resolvedNew.parent_id
      ? TaxonomyRegistry.resolve(resolvedNew.parent_id)
      : resolvedNew;

    const newCategoryName = topNew ? topNew.name : newCategoryInput;
    const newCategoryId = resolvedNew ? resolvedNew.category_id : newCategoryInput;

    this.categorizationVersion++;

    db.prepare(`
      UPDATE transactions
      SET category = ?, category_id = ?, categorization_status = 'SETTLED'
      WHERE id = ?
    `).run(newCategoryName, newCategoryId, Number(transactionId));

    const snapshot = SnapshotManager.createSnapshot(userId, db, {
      categorization_version: this.getVersionString()
    });

    const touched = Array.from(new Set([oldCategory, newCategoryName]));
    const eventPayload = {
      event_type: 'categorization.updated',
      event_id: options.event_id || `evt-corr-${this.categorizationVersion}-${Date.now()}`,
      user_id: userId,
      snapshot_id: snapshot.snapshot_id,
      categorization_version: snapshot.categorization_version,
      transaction_ids: [Number(transactionId)],
      touched_categories: touched,
      previous_categories: [oldCategory],
      corrections: [
        {
          transaction_id: Number(transactionId),
          amount: Number(tx.amount),
          raw_description: tx.raw_description,
          previous_category: oldCategory,
          previous_category_id: oldCategoryId,
          new_category: newCategoryName,
          new_category_id: newCategoryId
        }
      ],
      timestamp: new Date().toISOString()
    };

    this.emit('categorization.updated', eventPayload);
    return {
      event: eventPayload,
      snapshot
    };
  }

  /**
   * Computes `data_quality` object required in TaskPacket@1 (Section 5.1)
   */
  computeDataQuality(userId, month = null, db, options = {}) {
    const targetMonth = month || new Date().toISOString().slice(0, 7);
    const allTxns = db.prepare(`SELECT * FROM transactions WHERE user_id = ?`).all(userId)
      .filter(t => !targetMonth || (t.txn_date || '').startsWith(targetMonth));

    let totalAmount = 0;
    let uncategorizedAmount = 0;
    let needsReviewCount = 0;

    for (const tx of allTxns) {
      const amt = Number(tx.amount) || 0;
      totalAmount += amt;
      const status = tx.categorization_status || 'SETTLED';
      if (
        status === 'UNCATEGORIZED' ||
        tx.category === 'UNCATEGORIZED' ||
        tx.category_id === 'cat_uncategorized'
      ) {
        uncategorizedAmount += amt;
      } else if (status === 'NEEDS_REVIEW') {
        needsReviewCount++;
      }
    }

    const categorizedAmount = Math.max(0, totalAmount - uncategorizedAmount);
    const coverageByAmount = totalAmount > 0
      ? Number((categorizedAmount / totalAmount).toFixed(4))
      : 1.0;

    return {
      categorization_version: options.categorization_version || this.getVersionString(),
      coverage_by_amount: coverageByAmount,
      uncategorized_amount_minor: Math.round(uncategorizedAmount * 100),
      uncategorized_amount: uncategorizedAmount,
      needs_review_count: needsReviewCount,
      import_in_progress: Boolean(options.import_in_progress ?? this.isImportInProgress(userId)),
      data_stale: Boolean(options.data_stale),
      snapshot_age_seconds: options.snapshot_age_seconds ?? 0
    };
  }
}

const defaultTallyService = new TallyService();

module.exports = {
  TallyService,
  defaultTallyService,
  TaxonomyRegistry,
  TallyCategorizer
};
