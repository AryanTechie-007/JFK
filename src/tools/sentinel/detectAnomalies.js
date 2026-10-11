/**
 * sentinel_detect_anomalies — Section 6 Sentinel Function #4
 *
 * Purpose: Duplicate swipes, single-transaction spikes, subscription price creep
 * Inputs: lookback_days, snapshot_id
 * Returns: Flagged items with type, delta, impact_amount, and tool_result_id
 */

const SnapshotManager = require('./SnapshotManager');
const UntrustedTextSanitizer = require('../../agents/nova/UntrustedTextSanitizer');

let anomSeq = 1;

function auditTransactionsList(transactions = [], merchantProfiles = [], categoryCaps = [], options = {}) {
  const batchToolResultId = options.tool_result_id || `res_anom_batch_${anomSeq++}`;
  const anomalies = [];
  const capsMap = Object.fromEntries(categoryCaps.map(c => [c.category, Number(c.monthly_cap)]));
  const profileMap = Object.fromEntries(
    merchantProfiles.map(m => [(m.merchant_name || '').toLowerCase(), m])
  );

  // Filter by lookback_days if provided and transactions have dates
  let filteredTxns = transactions;
  if (options.lookback_days && Number(options.lookback_days) > 0 && options.referenceDate) {
    const cutoff = new Date(options.referenceDate).getTime() - Number(options.lookback_days) * 24 * 60 * 60 * 1000;
    filteredTxns = transactions.filter(t => {
      const ts = new Date(t.txn_date || t.date).getTime();
      return isNaN(ts) || ts >= cutoff;
    });
  }

  // 1. Check for Duplicate Transactions (same amount, same category within 30 minutes)
  for (let i = 0; i < filteredTxns.length; i++) {
    const txA = filteredTxns[i];
    const timeA = new Date(txA.txn_date || txA.date).getTime();
    const descA = UntrustedTextSanitizer.sanitizeText(txA.raw_description || txA.description || '').sanitized;

    for (let j = i + 1; j < filteredTxns.length; j++) {
      const txB = filteredTxns[j];
      const timeB = new Date(txB.txn_date || txB.date).getTime();
      const diffMinutes = Math.abs(timeA - timeB) / (1000 * 60);

      if (diffMinutes <= 30 && Number(txA.amount) === Number(txB.amount) && txA.category === txB.category) {
        const descB = UntrustedTextSanitizer.sanitizeText(txB.raw_description || txB.description || '').sanitized;
        const itemId = `${batchToolResultId}_dup_${txA.id || i}_${txB.id || j}`;
        anomalies.push({
          tool_result_id: itemId,
          type: 'POTENTIAL_DUPLICATE',
          severity: 'HIGH',
          category: txA.category,
          title: `Possible Duplicate Charge: ₹${Number(txA.amount).toLocaleString()}`,
          description: `Identical charge of ₹${Number(txA.amount).toLocaleString()} detected twice within ${Math.round(diffMinutes)} mins ("${descA}" & "${descB}").`,
          transactions: [txA.id, txB.id],
          delta: Number(txA.amount),
          impact_amount: Number(txA.amount),
          actionable_solution: 'Verify with bank/merchant if this was an accidental double debit.'
        });
      }
    }
  }

  // 2. Single-Transaction Whale Spikes (>= 45% of entire category cap in one swipe)
  for (const tx of filteredTxns) {
    const cap = capsMap[tx.category];
    if (cap && cap > 0) {
      const amt = Number(tx.amount);
      const pctOfCap = Math.round((amt / cap) * 100);
      if (pctOfCap >= 45) {
        const cleanDesc = UntrustedTextSanitizer.sanitizeText(tx.raw_description || tx.description || '').sanitized;
        const itemId = `${batchToolResultId}_spike_${tx.id || Math.round(amt)}`;
        anomalies.push({
          tool_result_id: itemId,
          type: 'CATEGORY_WHALE_SPIKE',
          severity: 'MEDIUM',
          category: tx.category,
          title: `Large Single Expense in ${tx.category}`,
          description: `"${cleanDesc}" (₹${amt.toLocaleString()}) consumed ${pctOfCap}% of the entire monthly ${tx.category} budget in one purchase.`,
          transaction_id: tx.id,
          delta: amt,
          pct_of_cap: pctOfCap,
          impact_amount: amt,
          actionable_solution: 'Review if this purchase can be amortized or balanced by reducing discretionary spending.'
        });
      }
    }
  }

  // 3. Subscription Price Creep
  for (const tx of filteredTxns) {
    const cleanDesc = UntrustedTextSanitizer.sanitizeText(tx.raw_description || tx.description || '').sanitized;
    const descLower = cleanDesc.toLowerCase();
    for (const [mKey, profile] of Object.entries(profileMap)) {
      if (mKey && descLower.includes(mKey) && Number(profile.is_subscription) === 1) {
        const historicalAmt = Number(profile.typical_amount);
        const currentAmt = Number(tx.amount);
        if (historicalAmt > 0 && currentAmt > historicalAmt * 1.15) {
          const delta = Number((currentAmt - historicalAmt).toFixed(2));
          const increasePct = Math.round((delta / historicalAmt) * 100);
          const itemId = `${batchToolResultId}_creep_${profile.merchant_name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${tx.id || currentAmt}`;
          anomalies.push({
            tool_result_id: itemId,
            type: 'SUBSCRIPTION_PRICE_CREEP',
            severity: 'MEDIUM',
            category: tx.category || profile.category || 'Subscriptions',
            merchant: profile.merchant_name,
            title: `Subscription Price Hike: ${profile.merchant_name}`,
            description: `${profile.merchant_name} charged ₹${currentAmt.toLocaleString()} vs historical ₹${historicalAmt.toLocaleString()} (+${increasePct}% increase).`,
            historical_amount: historicalAmt,
            current_amount: currentAmt,
            increase_pct: increasePct,
            delta,
            impact_amount: delta,
            actionable_solution: 'Check for tier changes, unannounced price hikes, or convert to an annual discounted plan.'
          });
        }
      }
    }
  }

  return {
    tool_result_id: batchToolResultId,
    lookback_days: options.lookback_days || 30,
    anomaly_count: anomalies.length,
    flagged_items: anomalies,
    anomalies
  };
}

function sentinel_detect_anomalies({
  snapshot_id = null,
  lookback_days = 30,
  transactions = null,
  merchant_profiles = null,
  category_caps = null
} = {}) {
  if (snapshot_id) {
    const snapshot = SnapshotManager.getSnapshot(snapshot_id);
    if (!snapshot) {
      const err = new Error(`Sentinel snapshot "${snapshot_id}" not found.`);
      err.code = 'SNAPSHOT_NOT_FOUND';
      throw err;
    }
    if (snapshot.simulate_timeout) {
      const err = new Error('Sentinel timeout while detecting anomalies.');
      err.code = 'SENTINEL_TIMEOUT';
      throw err;
    }

    const toolResultId = `res_anom_${snapshot.snapshot_id}_${anomSeq++}`;
    return auditTransactionsList(
      snapshot.transactions,
      snapshot.merchant_profiles,
      snapshot.caps,
      { lookback_days, tool_result_id: toolResultId }
    );
  }

  return auditTransactionsList(
    transactions || [],
    merchant_profiles || [],
    category_caps || [],
    { lookback_days }
  );
}

class AnomalyDetector {
  static auditTransactions(transactions = [], merchantProfiles = [], categoryCaps = [], options = {}) {
    return auditTransactionsList(transactions, merchantProfiles, categoryCaps, options);
  }
}

module.exports = {
  sentinel_detect_anomalies,
  AnomalyDetector
};
