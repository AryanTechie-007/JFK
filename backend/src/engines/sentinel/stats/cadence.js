/**
 * Sentinel Recurring Cadence & Bill Merging Primitives (Sentinel §B.6.2, §B.6.13, §K.1)
 */

const { medianMinor, madMinor, p20Minor, p80Minor, mulBpHalfEven, ratioBpHalfEven } = require('./math');

const CADENCE_SPECS = [
  { name: 'WEEKLY', targetDays: 7, minOccurrences: 3 },
  { name: 'MONTHLY', targetDays: 30, minOccurrences: 2 },
  { name: 'QUARTERLY', targetDays: 91, minOccurrences: 2 },
  { name: 'YEARLY', targetDays: 365, minOccurrences: 2 },
];

function diffDaysStr(dateA, dateB) {
  const a = new Date(`${String(dateA).slice(0, 10)}T00:00:00Z`).getTime();
  const b = new Date(`${String(dateB).slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

function addDaysStr(dateStr, days) {
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Detects recurring merchant cadence from settled debit transactions.
 */
function detectRecurringSchedule(transactions, asOfDate, registry) {
  const toleranceDays = (registry && registry.bills && registry.bills.cadence_tolerance_days) || 5;
  const byMerchant = new Map();

  for (const t of transactions) {
    if (t.direction !== 'DEBIT') continue;
    if (t.status === 'PENDING' || t.is_duplicate) continue;
    if (t.movement_type !== 'EXPENSE') continue;
    const key = t.merchant_id || (t.merchant_name || '').toLowerCase().trim();
    if (!key) continue;
    if (!byMerchant.has(key)) {
      byMerchant.set(key, []);
    }
    byMerchant.get(key).push(t);
  }

  const schedule = [];

  for (const [key, list] of byMerchant.entries()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => String(a.txn_date).localeCompare(String(b.txn_date)));

    // Collapse same-day transactions at the same merchant when checking intervals
    const byDate = [];
    for (const tx of sorted) {
      const d = String(tx.txn_date).slice(0, 10);
      if (byDate.length === 0 || byDate[byDate.length - 1].date !== d) {
        byDate.push({ date: d, amount_minor: tx.amount_minor, tx });
      }
    }
    if (byDate.length < 2) continue;

    const gaps = [];
    for (let i = 1; i < byDate.length; i++) {
      gaps.push(diffDaysStr(byDate[i - 1].date, byDate[i].date));
    }
    const medGap = medianMinor(gaps);

    let matchedCadence = null;
    for (const spec of CADENCE_SPECS) {
      const tol = spec.name === 'WEEKLY' ? Math.min(2, toleranceDays) : toleranceDays + (spec.targetDays > 60 ? 5 : 0);
      if (byDate.length >= spec.minOccurrences && Math.abs(medGap - spec.targetDays) <= tol) {
        matchedCadence = spec;
        break;
      }
    }

    // Also include explicit is_recurring transactions with >=2 occurrences across distinct months
    if (!matchedCadence && sorted.some((t) => t.is_recurring) && byDate.length >= 2 && medGap >= 20 && medGap <= 40) {
      matchedCadence = CADENCE_SPECS[1]; // MONTHLY
    }

    if (!matchedCadence) continue;

    const amounts = byDate.map((x) => x.amount_minor);
    const typicalAmount = medianMinor(amounts);
    const amountMad = madMinor(amounts);
    const gapDeviations = gaps.map((g) => Math.abs(g - matchedCadence.targetDays));
    const maxGapDev = Math.max(...gapDeviations, 0);

    let confidence = 'MEDIUM';
    if (byDate.length >= 3 && maxGapDev <= 3 && ratioBpHalfEven(amountMad, Math.max(1, typicalAmount)) <= 1000) {
      confidence = 'HIGH';
    } else if (byDate.length < 2 || maxGapDev > toleranceDays) {
      confidence = 'LOW';
    }

    const lastDate = byDate[byDate.length - 1].date;
    let nextDate = addDaysStr(lastDate, matchedCadence.targetDays);
    // Advance until nextDate >= asOfDate if it's an active recurring cadence within 1 cycle
    if (nextDate < asOfDate && diffDaysStr(nextDate, asOfDate) <= matchedCadence.targetDays) {
      nextDate = addDaysStr(nextDate, matchedCadence.targetDays);
    }

    const sampleTx = sorted[sorted.length - 1];
    schedule.push({
      merchant_id: sampleTx.merchant_id || key,
      merchant_name: (sampleTx.merchant_name || key).slice(0, 40),
      category_id: sampleTx.category_id || 'OTHER',
      cadence: matchedCadence.name,
      typical_amount_minor: typicalAmount,
      next_expected_date: nextDate,
      confidence,
      variance_band: {
        low_minor: amounts.length >= 3 ? p20Minor(amounts) : typicalAmount - mulBpHalfEven(typicalAmount, 1000),
        high_minor: amounts.length >= 3 ? p80Minor(amounts) : typicalAmount + mulBpHalfEven(typicalAmount, 1000),
      },
      occurrences: byDate.length,
    });
  }

  schedule.sort((a, b) => a.next_expected_date.localeCompare(b.next_expected_date));
  return schedule;
}

module.exports = {
  CADENCE_SPECS,
  diffDaysStr,
  addDaysStr,
  detectRecurringSchedule,
};
