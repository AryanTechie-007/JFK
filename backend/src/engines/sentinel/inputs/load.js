/**
 * Sentinel Snapshot Input Loader & Shared Derived Quantities (Sentinel §B.3, §B.4, §F, §K.1)
 * Enforces read-only DB role `sentinel_ro` (SEN-AC-05) and strict user scope (SEN-AC-10).
 */

const db = require('../../../db');
const { toCanonicalUserId } = require('../../../shared/ids');
const { getTransactionsAsOf, getStatus } = require('../../categorizer');
const {
  CATEGORIES,
  isFixedCategory: taxonomyIsFixed,
} = require('../../categorizer/taxonomy');
const {
  getCanonicalProfile,
  getGoalsForUser,
  getCapsForUser,
} = require('../../../platform/profile');
const { getSnapshot, createSnapshot } = require('../../../platform/snapshot');
const { computeCategorySpend, isActiveRow, isSettledStatus } = require('../../../shared/finance/movement');
const {
  medianMinor,
  percentileMinor,
  coefficientOfVariationBp,
  mulBpHalfEven,
} = require('../stats/math');
const {
  isFixedCategory,
  getEffectiveCapMap,
  getCoveredLeafIds,
  computeSpendForCategories,
  isCountablePostedRow,
  getTxClassificationStatus,
} = require('../ledger/spend');

const WRITE_SQL_REGEX = /^\s*(INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE|TRUNCATE|ATTACH|DETACH|BEGIN|COMMIT|ROLLBACK)/i;

/**
 * Wraps the SQLite DB instance into a strict read-only `sentinel_ro` handle (Sentinel §F, SEN-AC-05).
 * Any attempt to execute a mutating statement throws a PERMISSION_DENIED error.
 */
function createSentinelReadOnlyDb(rawDb = db) {
  return Object.freeze({
    role: 'sentinel_ro',
    exec() {
      const err = new Error('PERMISSION_DENIED: sentinel_ro role cannot call exec() or mutate state');
      err.code = 'PERMISSION_DENIED';
      throw err;
    },
    transaction() {
      const err = new Error('PERMISSION_DENIED: sentinel_ro role cannot open a write transaction');
      err.code = 'PERMISSION_DENIED';
      throw err;
    },
    prepare(sql) {
      if (WRITE_SQL_REGEX.test(String(sql || ''))) {
        const err = new Error(`PERMISSION_DENIED: sentinel_ro role cannot prepare write SQL: ${sql}`);
        err.code = 'PERMISSION_DENIED';
        throw err;
      }
      const stmt = rawDb.prepare(sql);
      return Object.freeze({
        get: (...args) => stmt.get(...args),
        all: (...args) => stmt.all(...args),
        run() {
          const err = new Error('PERMISSION_DENIED: sentinel_ro role cannot call stmt.run()');
          err.code = 'PERMISSION_DENIED';
          throw err;
        },
      });
    },
  });
}

function getPreviousMonths(currentMonthStr, count = 3) {
  const [y, m] = String(currentMonthStr || '2026-10').split('-').map(Number);
  const result = [];
  for (let i = count; i >= 1; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    result.push(d.toISOString().slice(0, 7));
  }
  return result;
}

function getPreviousMonthsInclusive(currentMonthStr, count = 3) {
  const [y, m] = String(currentMonthStr || '2026-10').split('-').map(Number);
  const result = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    result.push(d.toISOString().slice(0, 7));
  }
  return result;
}

function addMonthsToYearMonth(yearMonthStr, monthsToAdd) {
  const [y, m] = String(yearMonthStr || '2026-10').split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + monthsToAdd, 1));
  return d.toISOString().slice(0, 7);
}

function getMonthDays(periodStr) {
  const [y, m] = String(periodStr || '2026-10').split('-').map(Number);
  return new Date(Date.UTC(y || 2026, m || 10, 0)).getUTCDate();
}

/**
 * Loads pinned state for a snapshot (supports both `(snapshotOrId, userIdFallback, options)`
 * and `(tenantId, userId, snapshotId, options)` calling conventions).
 */
function loadSnapshotState(arg1, arg2 = null, arg3 = null) {
  let snapshotOrId = arg1;
  let userIdFallback = arg2;
  let options = (arg3 && typeof arg3 === 'object' ? arg3 : {}) || {};

  // Detect if called as loadSnapshotState(tenantId, userId, snapshotId)
  if (typeof arg1 === 'string' && typeof arg2 === 'string' && typeof arg3 === 'string') {
    userIdFallback = arg2;
    snapshotOrId = arg3;
  } else if (arg2 && typeof arg2 === 'object' && !Array.isArray(arg2)) {
    options = arg2;
    userIdFallback = options.user_id || options.userId || null;
  }

  const roDb = createSentinelReadOnlyDb(options.db || db);

  let snap =
    typeof snapshotOrId === 'object' && snapshotOrId?.snapshot_id
      ? snapshotOrId
      : snapshotOrId
      ? getSnapshot(snapshotOrId)
      : null;

  if (!snap && snapshotOrId && options.strictSnapshot) {
    const err = new Error(`Snapshot not found: ${snapshotOrId}`);
    err.code = 'SNAPSHOT_NOT_FOUND';
    throw err;
  }

  if (snap && options.expectedUserId) {
    const expectedUid = toCanonicalUserId(options.expectedUserId);
    if (snap.user_id !== expectedUid) {
      const err = new Error('CROSS_USER_FORBIDDEN: Snapshot belongs to a different user');
      err.code = 'SNAPSHOT_NOT_FOUND';
      throw err;
    }
  }

  if (snap && options.enforceFreshSnapshot && snap.created_at) {
    const ageMs = (options.nowMs || Date.now()) - new Date(snap.created_at).getTime();
    if (Number.isFinite(ageMs) && ageMs > 24 * 3600 * 1000) {
      const err = new Error(`Snapshot expired (> 24h): ${snap.snapshot_id}`);
      err.code = 'SNAPSHOT_NOT_FOUND';
      throw err;
    }
  }

  if (!snap) {
    const uid = toCanonicalUserId(userIdFallback || 'usr_00000000000000000000000001');
    snap = createSnapshot(uid);
  }

  const userId = snap.user_id;
  const profile = getCanonicalProfile(userId);
  const allGoals = getGoalsForUser(userId, true, snap.current_month_ist);
  const activeOrPausedGoals = allGoals.filter((g) => g.status !== 'ARCHIVED');
  const caps = getCapsForUser(userId, snap.current_month_ist);
  const capOverrides = roDb
    .prepare('SELECT * FROM cap_month_overrides WHERE user_id = ?')
    .all(userId);
  const goalOverrides = roDb
    .prepare('SELECT * FROM goal_month_overrides WHERE user_id = ?')
    .all(userId);

  const rawTxns = getTransactionsAsOf(userId, snap.ledger_version);
  // Filter to transactions on or before snapshot's current_date_ist when pinned
  const allTxns = rawTxns.filter((t) => {
    if (snap.current_date_ist && String(t.txn_date).slice(0, 10) > snap.current_date_ist) {
      return false;
    }
    return true;
  });

  const currentMonthTxns = allTxns.filter((t) =>
    String(t.txn_date).startsWith(snap.current_month_ist)
  );
  const dataQuality = getStatus(userId, snap.ledger_version);

  const fixedCategoryIds = new Set(
    CATEGORIES.filter((c) => c.nature === 'FIXED').map((c) => c.category_id)
  );
  for (const line of profile.fixed_expense_lines || []) {
    if (line && line.category_id) fixedCategoryIds.add(line.category_id);
  }

  const statePartial = {
    roDb,
    snapshot: snap,
    user_id: userId,
    current_date_ist: snap.current_date_ist,
    current_month_ist: snap.current_month_ist,
    asOfDate: snap.current_date_ist,
    currentPeriod: snap.current_month_ist,
    profile,
    preferences: profile.preferences || { protected_categories: [] },
    accounts: profile.accounts || [],
    declared_bills: profile.declared_bills || [],
    goals: activeOrPausedGoals,
    all_goals_including_archived: allGoals,
    goalOverrides,
    caps,
    capOverrides,
    all_txns: allTxns,
    transactions: allTxns,
    current_month_txns: currentMonthTxns,
    fixedCategoryIds,
    data_quality: dataQuality,
    dataQuality,
  };

  // Compute spend by category for current month using exclusive cap partition for capped parents
  const spendByCategory = {};
  const capMap = getEffectiveCapMap(statePartial, snap.current_month_ist);
  for (const cat of CATEGORIES) {
    const s = computeCategorySpend(currentMonthTxns, cat.category_id);
    if (s.total_spend_minor > 0) {
      spendByCategory[cat.category_id] = s;
    }
  }
  for (const cap of caps) {
    const covered = getCoveredLeafIds(cap.category_id, statePartial, snap.current_month_ist, capMap);
    const sp = computeSpendForCategories(
      currentMonthTxns,
      covered,
      snap.current_month_ist,
      null,
      cap.category_id
    );
    spendByCategory[cap.category_id] = sp;
  }

  // Compute income_minor & income_basis (§B.4 & §B.6.1)
  const prevMonths = getPreviousMonths(snap.current_month_ist, 3);
  const observedMonthlyIncomes = prevMonths.map((pm) =>
    allTxns
      .filter(
        (t) =>
          isCountablePostedRow(t) &&
          String(t.txn_date).startsWith(pm) &&
          t.direction === 'CREDIT' &&
          t.movement_type === 'INCOME' &&
          isSettledStatus(getTxClassificationStatus(t))
      )
      .reduce((sum, t) => sum + (Number(t.amount_minor) || 0), 0)
  );
  let nonZeroObservedIncomes = observedMonthlyIncomes.filter((v) => v > 0);
  if (nonZeroObservedIncomes.length === 0) {
    const curMonthIncome = currentMonthTxns
      .filter(
        (t) =>
          isCountablePostedRow(t) &&
          t.direction === 'CREDIT' &&
          t.movement_type === 'INCOME' &&
          isSettledStatus(getTxClassificationStatus(t))
      )
      .reduce((sum, t) => sum + (Number(t.amount_minor) || 0), 0);
    if (curMonthIncome > 0) nonZeroObservedIncomes = [curMonthIncome];
  }

  const hasDeclaredIncome =
    profile.declared_income_minor !== null &&
    profile.declared_income_minor !== undefined &&
    Number(profile.declared_income_minor) > 0;

  let incomeMinor = hasDeclaredIncome ? Math.trunc(Number(profile.declared_income_minor)) : 0;
  let incomeBasis = hasDeclaredIncome ? 'DECLARED' : 'OBSERVED';
  let incomeSource = hasDeclaredIncome ? 'DECLARED' : 'OBSERVED_CREDITS';
  let conservativeIncomeMinor = incomeMinor;

  if (!hasDeclaredIncome && nonZeroObservedIncomes.length > 0) {
    incomeMinor = medianMinor(nonZeroObservedIncomes);
    conservativeIncomeMinor =
      nonZeroObservedIncomes.length >= 2
        ? percentileMinor(nonZeroObservedIncomes, 25)
        : mulBpHalfEven(incomeMinor, 8500);
  }

  const fixedLines = (profile.fixed_expense_lines || []).map((l, idx) => ({
    line_id: l.line_id || `fxl_${idx + 1}`,
    label: l.label || l.category_id || 'Fixed Expense',
    category_id: l.category_id || 'HOUSING.RENT',
    amount_minor: Math.trunc(Number(l.monthly_amount_minor ?? l.amount_minor) || 0),
    monthly_amount_minor: Math.trunc(Number(l.monthly_amount_minor ?? l.amount_minor) || 0),
  }));
  const fixedCommitmentsMinor = fixedLines.reduce((sum, l) => sum + l.amount_minor, 0);

  const goalCommitmentsMinor = activeOrPausedGoals
    .filter((g) => g.status === 'ACTIVE')
    .reduce(
      (sum, g) => sum + Math.trunc(Number(g.effective_monthly_add_minor ?? g.monthly_add_minor) || 0),
      0
    );

  // Days in month, days_elapsed, days_remaining (§B.4)
  const daysInMonth = getMonthDays(snap.current_month_ist);
  const dayOfMonth = Math.max(1, parseInt(String(snap.current_date_ist).slice(8, 10), 10) || 1);
  const daysElapsed = Math.max(0, dayOfMonth - 1);
  const daysRemaining = Math.max(1, daysInMonth - dayOfMonth + 1);

  // Liquid accounts & spendable balance (§B.4 & SC §5.2)
  const liquidAccounts = (profile.accounts || []).filter(
    (a) =>
      (a.is_own_account === undefined || Boolean(a.is_own_account)) &&
      ['CHECKING', 'SAVINGS', 'CURRENT', 'SALARY', 'WALLET'].includes(a.type) &&
      a.balance_minor !== null &&
      a.balance_minor !== undefined
  );
  const spendableBalanceSignedMinor =
    liquidAccounts.length > 0
      ? liquidAccounts.reduce((s, a) => s + Math.trunc(Number(a.balance_minor) || 0), 0)
      : null;

  let newestBalanceAsOf = null;
  for (const a of liquidAccounts) {
    if (a.balance_as_of && (!newestBalanceAsOf || a.balance_as_of > newestBalanceAsOf)) {
      newestBalanceAsOf = a.balance_as_of;
    }
  }
  const balanceStaleHours = 48;
  const nowRefMs = snap.as_of ? new Date(snap.as_of).getTime() : Date.now();
  const balanceStale =
    newestBalanceAsOf != null &&
    nowRefMs - new Date(newestBalanceAsOf).getTime() > balanceStaleHours * 3600 * 1000;

  // Earmarked total (§B.4: ACTIVE, PAUSED, COMPLETED)
  const earmarkedTotalMinor = allGoals
    .filter((g) => ['ACTIVE', 'PAUSED', 'COMPLETED'].includes(g.status))
    .reduce((s, g) => s + Math.trunc(Number(g.saved_minor) || 0), 0);

  const availableSignedMinor =
    spendableBalanceSignedMinor !== null
      ? spendableBalanceSignedMinor - earmarkedTotalMinor
      : null;

  return {
    ...statePartial,
    spendByCategory,
    income_minor: incomeMinor,
    conservative_income_minor: conservativeIncomeMinor,
    income_basis: incomeBasis,
    income_source: incomeSource,
    observed_income_months_count: nonZeroObservedIncomes.length,
    observed_monthly_incomes: observedMonthlyIncomes,
    fixed_lines: fixedLines,
    fixed_commitments_minor: fixedCommitmentsMinor,
    fixed_total_minor: fixedCommitmentsMinor,
    goal_commitments_minor: goalCommitmentsMinor,
    days_in_month: daysInMonth,
    day_of_month: dayOfMonth,
    days_elapsed: daysElapsed,
    days_remaining: daysRemaining,
    liquid_accounts: liquidAccounts,
    spendable_balance_signed_minor: spendableBalanceSignedMinor,
    newest_balance_as_of: newestBalanceAsOf,
    balance_stale: balanceStale,
    earmarked_total_minor: earmarkedTotalMinor,
    available_signed_minor: availableSignedMinor,
  };
}

module.exports = {
  createSentinelReadOnlyDb,
  getPreviousMonths,
  getPreviousMonthsInclusive,
  addMonthsToYearMonth,
  getMonthDays,
  loadSnapshotState,
};
