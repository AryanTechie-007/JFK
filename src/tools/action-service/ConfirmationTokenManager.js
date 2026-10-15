/**
 * ConfirmationTokenManager — Issues & Verifies User Confirmation Tokens for State Mutations
 *
 * Implements Section 9, Section 13 #6 ("No cap change or rebalance is executed without a confirmation token"),
 * and Section 14 Rule 2 ("Proposals, not writes. Only the Action Service changes state, after user
 * confirmation and independent re-validation.").
 */

const crypto = require('crypto');

const tokenStore = new Map();
let tokenCounter = 1;

class ConfirmationTokenManager {
  /**
   * Issues a confirmation token for a proposed action card presented by John.
   */
  static issueToken({ userId = 'user_demo_nova', actionType, payload = {}, ttlMs = 15 * 60 * 1000 } = {}) {
    const nonce = crypto.randomBytes(6).toString('hex');
    const token = `tok_conf_${tokenCounter++}_${nonce}`;
    const record = {
      token,
      user_id: userId,
      action_type: actionType,
      payload,
      issued_at: Date.now(),
      expires_at: Date.now() + ttlMs,
      consumed: false
    };
    tokenStore.set(token, record);
    return record;
  }

  /**
   * Verifies a confirmation token for a specific action type.
   */
  static verifyAndConsume(token, expectedActionType = null) {
    if (!token || typeof token !== 'string') {
      const err = new Error('Missing confirmation_token. State-mutating T2/T3 actions require user confirmation.');
      err.code = 'CONFIRMATION_TOKEN_REQUIRED';
      throw err;
    }

    const record = tokenStore.get(token);
    if (!record) {
      const err = new Error(`Invalid or unknown confirmation_token "${token}".`);
      err.code = 'CONFIRMATION_TOKEN_INVALID';
      throw err;
    }

    if (record.consumed) {
      const err = new Error(`Confirmation token "${token}" has already been consumed.`);
      err.code = 'CONFIRMATION_TOKEN_ALREADY_USED';
      throw err;
    }

    if (Date.now() > record.expires_at) {
      const err = new Error(`Confirmation token "${token}" has expired.`);
      err.code = 'CONFIRMATION_TOKEN_EXPIRED';
      throw err;
    }

    if (expectedActionType && record.action_type && record.action_type !== expectedActionType) {
      const err = new Error(
        `Confirmation token "${token}" was issued for "${record.action_type}", not "${expectedActionType}".`
      );
      err.code = 'CONFIRMATION_TOKEN_MISMATCH';
      throw err;
    }

    record.consumed = true;
    record.consumed_at = Date.now();
    return record;
  }

  static reset() {
    tokenStore.clear();
  }
}

module.exports = ConfirmationTokenManager;
