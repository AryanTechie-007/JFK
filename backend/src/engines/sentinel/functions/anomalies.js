/**
 * 7. `sentinel_detect_anomalies` (Sentinel §B.6.7, §C.3, §K.1)
 * Detects DUPLICATE_SWIPE, SPIKE (single txn spike), and PRICE_CREEP (recurring charge increase).
 */

const { halfEvenRoundBigInt, multiplyMinorByBp, ratioToBp } = require('../../../shared/money');
const { isActiveRow, isSpendDebit, isSettledStatus } = require('../../../shared/finance/movement');
const { getCategoryDisplayName, isFixedCategory } = require('../../categorizer/taxonomy');
const { SENTINEL_PARAMS } = require('../params');
const { loadSnapshotState } = require('../inputs/load');
const { isCountablePostedRow, getTxClassificationStatus } = require('../ledger/spend');
const { Decimal, toIntHalfEven } = require('../stats/math');
const { buildEnvelope } = require('./envelope');

function sentinel_detect_anomalies(stateInput, args = {}, registry = SENTINEL_PARAMS) {
  const state = stateInput?.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);
  const lookbackDays = Math.min(90, Math.max(1, Number(args.lookback_days) || 90));
  const cutoffDate = new Date(
    new Date(state.current_date_ist).getTime() - lookbackDays * 86400000
  )
    .toISOString()
    .slice(0, 10);

  const windowTxns = state.all_txns.filter(
    (t) => isCountablePostedRow(t) && isSpendDebit(t) && String(t.txn_date).slice(0, 10) >= cutoffDate
  );

  const items = [];

  // 1. DUPLICATE_SWIPE (§B.6.7): same merchant_id/name, same amount, same day (window dup_window_days=0), both POSTED
  const dupGroups = new Map();
  for (const t of windowTxns) {
    if (t.status !== 'POSTED' && t.status !== 'SETTLED') continue;
    const mKey = t.merchant_id || t.merchant_display_name || t.normalized_description;
    if (!mKey) continue;
    const dStr = String(t.txn_date).slice(0, 10);
    const key = `${mKey}::${t.amount_minor}::${dStr}`;
    if (!dupGroups.has(key)) dupGroups.set(key, []);
    dupGroups.get(key).push(t);
  }

  for (const [, grp] of dupGroups.entries()) {
    if (grp.length >= 2) {
      const sample = grp[0];
      const amt = Math.trunc(Number(sample.amount_minor) || 0);
      items.push({
        anomaly_type: 'DUPLICATE_SWIPE',
        kind: 'DUPLICATE_SWIPE',
        txn_id: grp[1].txn_id,
        txn_ids: grp.map((x) => x.txn_id),
        merchant_id: sample.merchant_id || sample.merchant_display_name || null,
        merchant_name: sample.merchant_display_name || sample.raw_description,
        merchant_display_name: sample.merchant_display_name || sample.raw_description,
        category_id: sample.category_id || 'UNCATEGORIZED',
        display_name: getCategoryDisplayName(sample.category_id),
        amount_minor: amt,
        baseline_minor: amt,
        baseline_median_minor: amt,
        excess_minor: amt,
        delta_bp: 10000,
        date: String(sample.txn_date).slice(0, 10),
        txn_date: String(sample.txn_date).slice(0, 10),
        recurring: false,
        provisional: false,
        confidence: 'HIGH',
      });
    }
  }

  // 2. SPIKE (§B.6.7): single EXPENSE above category baseline (supports both 3*SD with >=10 rows and 3*MAD with >=3 rows)
  const byCat = {};
  for (const t of windowTxns) {
    const cid = t.category_id || 'UNCATEGORIZED';
    if (!byCat[cid]) byCat[cid] = [];
    byCat[cid].push(t);
  }

  const spikeMadBp =
    (registry.anomaly && registry.anomaly.spike_k_bp) ||
    registry.spike_mad_multiplier_bp ||
    30000;
  const spikeMinExcessMinor =
    (registry.anomaly && registry.anomaly.spike_min_minor) ||
    registry.spike_min_excess_minor ||
    100000;
  const spikeK = (registry.anomaly && registry.anomaly.spike_k) || 3;

  for (const [cid, txns] of Object.entries(byCat)) {
    if (cid === 'UNCATEGORIZED' || isFixedCategory(cid)) continue;
    const amounts = txns.map((t) => Number(t.amount_minor) || 0).sort((a, b) => a - b);
    if (amounts.length < 3) continue;

    const mid = Math.floor(amounts.length / 2);
    const medianMinor =
      amounts.length % 2 !== 0
        ? amounts[mid]
        : halfEvenRoundBigInt(amounts[mid - 1] + amounts[mid], 2);

    const deviations = amounts.map((a) => Math.abs(a - medianMinor)).sort((a, b) => a - b);
    const madMinor =
      deviations.length % 2 !== 0
        ? deviations[mid]
        : halfEvenRoundBigInt(deviations[mid - 1] + deviations[mid], 2);

    const madThresholdMinor =
      medianMinor +
      Math.max(multiplyMinorByBp(madMinor, spikeMadBp), spikeMinExcessMinor);

    // Also compute population mean + spike_k * SD when >= 10 rows (§B.6.7)
    let sdThresholdMinor = Infinity;
    let meanMinor = medianMinor;
    if (amounts.length >= 10) {
      const n = new Decimal(amounts.length);
      const sum = amounts.reduce((acc, v) => acc.add(v), new Decimal(0));
      const meanDec = sum.div(n);
      meanMinor = toIntHalfEven(meanDec);
      const sqSum = amounts.reduce(
        (acc, v) => acc.add(new Decimal(v).sub(meanDec).pow(2)),
        new Decimal(0)
      );
      const sdDec = sqSum.div(n).sqrt();
      sdThresholdMinor = toIntHalfEven(meanDec.add(sdDec.mul(spikeK)));
    }

    for (const t of txns) {
      const amt = Number(t.amount_minor) || 0;
      const isMadSpike = amt > madThresholdMinor && amt >= medianMinor * 2;
      const isSdSpike = amounts.length >= 10 && amt > sdThresholdMinor;
      if (isMadSpike || isSdSpike) {
        const baseline = isMadSpike ? medianMinor : meanMinor;
        const excess = Math.max(0, amt - baseline);
        items.push({
          anomaly_type: 'SPIKE',
          kind: 'SINGLE_TXN_SPIKE',
          txn_id: t.txn_id,
          txn_ids: [t.txn_id],
          merchant_id: t.merchant_id || t.merchant_display_name || null,
          merchant_name: t.merchant_display_name || t.raw_description,
          merchant_display_name: t.merchant_display_name || t.raw_description,
          category_id: cid,
          display_name: getCategoryDisplayName(cid),
          amount_minor: amt,
          baseline_minor: baseline,
          baseline_median_minor: medianMinor,
          excess_minor: excess,
          delta_bp: baseline > 0 ? ratioToBp(excess, baseline) : 0,
          date: String(t.txn_date).slice(0, 10),
          txn_date: String(t.txn_date).slice(0, 10),
          recurring: false,
          provisional: !isSettledStatus(getTxClassificationStatus(t)),
          confidence: 'MEDIUM',
        });
      }
    }
  }

  // 3. PRICE_CREEP (§B.6.7): recurring merchant whose latest charge exceeds previous cycle's by > creep_bp (500 bp = 5%)
  const creepBp = (registry.anomaly && registry.anomaly.creep_bp) || 500;
  const byMerchant = new Map();
  for (const t of state.all_txns) {
    if (!isCountablePostedRow(t) || !isSpendDebit(t)) continue;
    const mKey = t.merchant_id || t.merchant_display_name;
    if (!mKey) continue;
    if (!byMerchant.has(mKey)) byMerchant.set(mKey, []);
    byMerchant.get(mKey).push(t);
  }

  for (const [mKey, list] of byMerchant.entries()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => String(a.txn_date).localeCompare(String(b.txn_date)));
    // Check if recurring (~monthly interval between last 2 charges)
    const prevTx = sorted[sorted.length - 2];
    const lastTx = sorted[sorted.length - 1];
    if (String(lastTx.txn_date).slice(0, 10) < cutoffDate) continue;
    const d1 = new Date(`${String(prevTx.txn_date).slice(0, 10)}T00:00:00Z`).getTime();
    const d2 = new Date(`${String(lastTx.txn_date).slice(0, 10)}T00:00:00Z`).getTime();
    const gapDays = Math.round((d2 - d1) / 86400000);
    if (gapDays < 24 || gapDays > 36) continue;

    const prevAmt = Math.trunc(Number(prevTx.amount_minor) || 0);
    const lastAmt = Math.trunc(Number(lastTx.amount_minor) || 0);
    if (prevAmt <= 0 || lastAmt <= prevAmt) continue;
    const deltaBp = ratioToBp(lastAmt - prevAmt, prevAmt);
    // Avoid flagging a huge spike already flagged as SPIKE as price creep if > 100%
    if (deltaBp > creepBp && deltaBp <= 5000) {
      items.push({
        anomaly_type: 'PRICE_CREEP',
        kind: 'PRICE_CREEP',
        txn_id: lastTx.txn_id,
        txn_ids: [prevTx.txn_id, lastTx.txn_id],
        merchant_id: lastTx.merchant_id || mKey,
        merchant_name: lastTx.merchant_display_name || mKey,
        merchant_display_name: lastTx.merchant_display_name || mKey,
        category_id: lastTx.category_id || 'UNCATEGORIZED',
        display_name: getCategoryDisplayName(lastTx.category_id),
        amount_minor: lastAmt,
        baseline_minor: prevAmt,
        baseline_median_minor: prevAmt,
        excess_minor: lastAmt - prevAmt,
        delta_bp: deltaBp,
        date: String(lastTx.txn_date).slice(0, 10),
        txn_date: String(lastTx.txn_date).slice(0, 10),
        recurring: true,
        provisional: !isSettledStatus(getTxClassificationStatus(lastTx)),
        confidence: 'MEDIUM',
      });
    }
  }

  items.sort((a, b) => b.excess_minor - a.excess_minor);
  const sliced = items.slice(0, 10);

  return buildEnvelope(
    state,
    'sentinel_detect_anomalies',
    {
      lookback_days: lookbackDays,
      // Canonical §C.3 `items` + legacy `anomalies`
      items: sliced,
      anomalies: sliced,
    },
    windowTxns.length >= 10 ? 'HIGH' : 'MEDIUM',
    [],
    'OK',
    null,
    { registry, params: args }
  );
}

module.exports = {
  sentinel_detect_anomalies,
};
