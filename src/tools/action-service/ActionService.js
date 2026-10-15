/**
 * ActionService — The ONLY Backend Component Permitted to Change State
 *
 * Implements Section 3, Section 9, Section 13 (#6, #12), and Section 14 (Rule 2 & Page 11 Governance Table):
 * - Enforces initiator permissions (e.g., Nova cannot initiate RECATEGORIZE_TRANSACTION).
 * - Enforces T1 / T2 / T3 confirmation requirements (T2/T3 require a valid confirmation token).
 * - Performs independent Sentinel re-validation (`sentinel_validate_cap_change`) before mutating caps.
 */

const ConfirmationTokenManager = require('./ConfirmationTokenManager');
const SnapshotManager = require('../sentinel/SnapshotManager');
const sentinel_validate_cap_change = require('../sentinel/validateCapChange');
const TaxonomyRegistry = require('../tally/TaxonomyRegistry');
const { defaultTallyService } = require('../tally/TallyService');
const { defaultAlertStore } = require('../threshold-job/AlertHygieneStore');
const { ACTION_GOVERNANCE_TABLE } = require('../../contracts/PlatformRules');

const actionAuditLog = [];

class ActionService {
  /**
   * Creates a confirmation card + token for a proposed action so John can show it in the UI.
   */
  static createProposalConfirmation({ userId = 'user_demo_nova', actionType, payload, initiatedBy = 'Nova' }) {
    if (initiatedBy === 'Nova' && actionType.startsWith('RECATEGORIZE_TRANSACTION')) {
      const err = new Error('Governance Violation: Nova is not permitted to propose RECATEGORIZE_TRANSACTION.');
      err.code = 'FORBIDDEN_NOVA_ACTION';
      throw err;
    }

    const tokenRecord = ConfirmationTokenManager.issueToken({
      userId,
      actionType,
      payload
    });

    return {
      confirmation_token: tokenRecord.token,
      action_type: actionType,
      initiated_by: initiatedBy,
      tier: ACTION_GOVERNANCE_TABLE[actionType]?.tier || 'T2',
      requires_confirmation: true,
      payload,
      expires_at: new Date(tokenRecord.expires_at).toISOString()
    };
  }

  /**
   * Executes a state mutation after checking initiator rules, confirmation tokens, and Sentinel re-validation.
   */
  static execute({
    userId = 'user_demo_nova',
    actionType,
    payload = {},
    confirmationToken = null,
    initiatedBy = 'Nova',
    explicitUserOverride = false,
    db
  }) {
    if (initiatedBy === 'Nova' && (actionType === 'RECATEGORIZE_TRANSACTION' || actionType.startsWith('RECATEGORIZE_TRANSACTION'))) {
      const err = new Error('Governance Violation: Nova cannot initiate RECATEGORIZE_TRANSACTION.');
      err.code = 'FORBIDDEN_NOVA_ACTION';
      throw err;
    }

    // Determine governance rule
    let govKey = actionType;
    if (actionType === 'RECATEGORIZE_TRANSACTION') {
      const isBatch = Array.isArray(payload.transaction_ids) && payload.transaction_ids.length > 1;
      govKey = isBatch || payload.merchant_scope
        ? 'RECATEGORIZE_TRANSACTION_BATCH'
        : 'RECATEGORIZE_TRANSACTION_SINGLE';
    }

    const governance = ACTION_GOVERNANCE_TABLE[govKey];
    if (!governance) {
      const err = new Error(`Unsupported ActionService actionType: "${actionType}"`);
      err.code = 'UNSUPPORTED_ACTION_TYPE';
      throw err;
    }

    // Verify initiator permission
    if (!governance.allowedInitiators.includes(initiatedBy) && initiatedBy !== 'User' && initiatedBy !== 'John') {
      const err = new Error(
        `Initiator "${initiatedBy}" is not permitted to propose or initiate "${actionType}". Allowed: ${governance.allowedInitiators.join(', ')}`
      );
      err.code = 'UNAUTHORIZED_INITIATOR';
      throw err;
    }

    // Enforce confirmation token for T2 / T3 actions (Section 13 #6)
    if (governance.requiresConfirmationToken) {
      ConfirmationTokenManager.verifyAndConsume(confirmationToken, actionType);
    }

    const snapshot = SnapshotManager.getLatestSnapshot(userId, db);

    switch (actionType) {
      case 'ADJUST_BUDGET_CAP': {
        const { category, new_cap, monthlyCap } = payload;
        const targetCap = new_cap !== undefined ? new_cap : monthlyCap;

        // Independent re-validation via Sentinel
        const validation = sentinel_validate_cap_change({
          snapshot_id: snapshot.snapshot_id,
          category,
          new_cap: targetCap,
          explicit_user_request: explicitUserOverride
        });

        if (validation.status === 'REJECTED') {
          const err = new Error(validation.message);
          err.code = validation.rule_code;
          err.validation = validation;
          throw err;
        }

        const canonicalCategory = validation.category || category;
        db.prepare(`
          INSERT INTO budget_categories (user_id, category, monthly_cap)
          VALUES (?, ?, ?)
          ON CONFLICT(user_id, category) DO UPDATE SET monthly_cap = excluded.monthly_cap
        `).run(userId, canonicalCategory, Number(targetCap));

        const newSnapshot = SnapshotManager.createSnapshot(userId, db);
        const logEntry = this.logAction({
          userId,
          actionType,
          tier: governance.tier,
          initiatedBy,
          payload: { category: canonicalCategory, new_cap: Number(targetCap) },
          validation
        });

        return {
          success: true,
          action_type: 'ADJUST_BUDGET_CAP',
          category: canonicalCategory,
          category_id: validation.category_id,
          monthly_cap: Number(targetCap),
          validation,
          snapshot_id: newSnapshot.snapshot_id,
          audit_id: logEntry.audit_id,
          message: `Nova cap for "${canonicalCategory}" updated to ₹${Number(targetCap).toLocaleString()} via Action Service.`
        };
      }

      case 'APPLY_REBALANCE': {
        const move = payload.move || payload;
        if (!move || !move.from_category || !move.to_category || !move.amount) {
          throw new Error('Invalid rebalance move payload');
        }

        const fromNode = TaxonomyRegistry.resolve(move.from_category);
        const toNode = TaxonomyRegistry.resolve(move.to_category);
        const fromCatName = fromNode ? fromNode.name : move.from_category;
        const toCatName = toNode ? toNode.name : move.to_category;

        const donorCap = db.prepare(`SELECT monthly_cap FROM budget_categories WHERE user_id = ? AND category = ?`).get(userId, fromCatName);
        const recipientCap = db.prepare(`SELECT monthly_cap FROM budget_categories WHERE user_id = ? AND category = ?`).get(userId, toCatName);

        if (!donorCap || !recipientCap) {
          throw new Error('Specified categories not found for user');
        }

        const transferAmt = Number(move.amount);
        if (isNaN(transferAmt) || transferAmt <= 0) {
          const err = new Error('Rebalance transfer amount must be positive.');
          err.code = 'ZERO_SUM_VIOLATION';
          throw err;
        }

        const newDonorCap = donorCap.monthly_cap - transferAmt;
        const newRecipientCap = recipientCap.monthly_cap + transferAmt;

        // Independent re-validation via Sentinel (checks PROTECTED_CATEGORY, CAP_NEGATIVE, etc.)
        const donorValidation = sentinel_validate_cap_change({
          snapshot_id: snapshot.snapshot_id,
          category: fromCatName,
          new_cap: newDonorCap,
          explicit_user_request: explicitUserOverride
        });

        if (donorValidation.status === 'REJECTED') {
          const err = new Error(donorValidation.message);
          err.code = donorValidation.rule_code;
          err.validation = donorValidation;
          throw err;
        }

        const recipientValidation = sentinel_validate_cap_change({
          snapshot_id: snapshot.snapshot_id,
          category: toCatName,
          new_cap: newRecipientCap,
          explicit_user_request: true
        });

        if (recipientValidation.status === 'REJECTED') {
          const err = new Error(recipientValidation.message);
          err.code = recipientValidation.rule_code;
          err.validation = recipientValidation;
          throw err;
        }

        db.prepare(`UPDATE budget_categories SET monthly_cap = ? WHERE user_id = ? AND category = ?`).run(newDonorCap, userId, fromCatName);
        db.prepare(`UPDATE budget_categories SET monthly_cap = ? WHERE user_id = ? AND category = ?`).run(newRecipientCap, userId, toCatName);

        const newSnapshot = SnapshotManager.createSnapshot(userId, db);
        const logEntry = this.logAction({
          userId,
          actionType,
          tier: governance.tier,
          initiatedBy,
          payload: { from_category: fromCatName, to_category: toCatName, amount: transferAmt }
        });

        return {
          success: true,
          action_type: 'APPLY_REBALANCE',
          message: `Rebalanced ₹${transferAmt.toLocaleString()}: "${fromCatName}" cap is now ₹${newDonorCap.toLocaleString()}, "${toCatName}" cap is now ₹${newRecipientCap.toLocaleString()}.`,
          donor: { category: fromCatName, old_cap: donorCap.monthly_cap, new_cap: newDonorCap },
          recipient: { category: toCatName, old_cap: recipientCap.monthly_cap, new_cap: newRecipientCap },
          snapshot_id: newSnapshot.snapshot_id,
          audit_id: logEntry.audit_id
        };
      }

      case 'DISMISS_ALERT': {
        const dismissed = defaultAlertStore.dismissAlert(payload.alert_id);
        const logEntry = this.logAction({
          userId,
          actionType,
          tier: 'T1',
          initiatedBy,
          payload
        });
        return {
          success: Boolean(dismissed),
          action_type: 'DISMISS_ALERT',
          alert: dismissed,
          audit_id: logEntry.audit_id
        };
      }

      case 'CREATE_ALERT': {
        const created = defaultAlertStore.createCustomAlert(userId, payload);
        const logEntry = this.logAction({
          userId,
          actionType,
          tier: 'T1',
          initiatedBy,
          payload
        });
        return {
          success: true,
          action_type: 'CREATE_ALERT',
          alert: created,
          audit_id: logEntry.audit_id
        };
      }

      case 'RECATEGORIZE_TRANSACTION': {
        const txId = payload.transaction_id;
        const newCat = payload.new_category;
        const corrResult = defaultTallyService.correctTransactionCategory(userId, txId, newCat, db);
        const logEntry = this.logAction({
          userId,
          actionType,
          tier: governance.tier,
          initiatedBy,
          payload
        });
        return {
          success: true,
          action_type: 'RECATEGORIZE_TRANSACTION',
          event: corrResult.event,
          snapshot_id: corrResult.snapshot.snapshot_id,
          audit_id: logEntry.audit_id
        };
      }

      case 'CONFIRM_CATEGORY': {
        const txId = Number(payload.transaction_id);
        db.prepare(`UPDATE transactions SET categorization_status = 'SETTLED' WHERE id = ?`).run(txId);
        const newSnapshot = SnapshotManager.createSnapshot(userId, db);
        const logEntry = this.logAction({
          userId,
          actionType,
          tier: 'T1',
          initiatedBy: 'User',
          payload
        });
        return {
          success: true,
          action_type: 'CONFIRM_CATEGORY',
          transaction_id: txId,
          snapshot_id: newSnapshot.snapshot_id,
          audit_id: logEntry.audit_id
        };
      }

      case 'UPDATE_PREFERENCE': {
        if (!payload.explicit_user_statement) {
          const err = new Error('UPDATE_PREFERENCE requires an explicit user statement.');
          err.code = 'EXPLICIT_STATEMENT_REQUIRED';
          throw err;
        }
        const protectedCats = JSON.stringify(payload.protected_categories || ['Housing', 'Healthcare', 'Bills & Utilities']);
        const flexibleCats = JSON.stringify(payload.flexible_categories || ['Shopping & Lifestyle', 'Food & Dining']);
        db.prepare(`
          INSERT OR REPLACE INTO user_personas (user_id, lifestyle_flexibility, priority_categories, flexible_categories, target_savings_rate)
          VALUES (?, ?, ?, ?, ?)
        `).run(userId, payload.lifestyle_flexibility || 'moderate', protectedCats, flexibleCats, payload.target_savings_rate || 25.0);

        const newSnapshot = SnapshotManager.createSnapshot(userId, db);
        const logEntry = this.logAction({
          userId,
          actionType,
          tier: 'T1',
          initiatedBy: 'John',
          payload
        });
        return {
          success: true,
          action_type: 'UPDATE_PREFERENCE',
          snapshot_id: newSnapshot.snapshot_id,
          audit_id: logEntry.audit_id
        };
      }

      default: {
        const logEntry = this.logAction({
          userId,
          actionType,
          tier: governance.tier,
          initiatedBy,
          payload
        });
        return {
          success: true,
          action_type: actionType,
          audit_id: logEntry.audit_id
        };
      }
    }
  }

  static logAction(entry) {
    const record = {
      audit_id: `audit_${actionAuditLog.length + 1}_${Date.now()}`,
      timestamp: new Date().toISOString(),
      ...entry
    };
    actionAuditLog.push(record);
    return record;
  }

  static getAuditLog() {
    return [...actionAuditLog];
  }
}

module.exports = {
  ActionService,
  ConfirmationTokenManager
};
