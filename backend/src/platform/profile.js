/**
 * Profile Service & Plan Store Synchronization (SC §5.1, §5.2, §5.6, §5.7, §5.8, §17.6)
 * Keeps legacy SQLite tables (`users`, `goals`, `budget_categories`, `upcoming_bills`, `subscriptions`)
 * and canonical v1 tables (`user_profiles_v1`, `goals_v1`, `caps_v1`, `declared_bills_v1`, `accounts_v1`)
 * in bidirectional sync.
 */

const db = require('../db');
const { newId, deterministicId, toCanonicalUserId, toNumericUserId } = require('../shared/ids');
const { rupeesToMinor, minorToRupees } = require('../shared/money');
const { migrateLegacyCategory, getCategoryDisplayName } = require('../engines/categorizer/taxonomy');
const { ensureUserVersionsRow, ensureDefaultAccount } = require('../engines/categorizer');

const DEFAULT_PREFERENCES = Object.freeze({
  risk_comfort: 'BALANCED',
  protected_categories: ['HEALTH.MEDICAL', 'HEALTH.PHARMACY_FITNESS'],
  goal_priority_order: [],
  alert_cooldown_hours: 24,
  llm_processing_consent: true,
});

function syncUserStateFromLegacy(userId) {
  const numericId = toNumericUserId(userId);
  const canonicalId = toCanonicalUserId(numericId);
  ensureUserVersionsRow(canonicalId);
  ensureDefaultAccount(canonicalId);

  const legacyUser = db.prepare('SELECT * FROM users WHERE id = ?').get(numericId);
  let profile = db.prepare('SELECT * FROM user_profiles_v1 WHERE user_id = ?').get(canonicalId);

  if (!profile) {
    const displayName = legacyUser?.name || 'User';
    const declaredIncomeMinor =
      legacyUser?.monthly_income != null ? rupeesToMinor(legacyUser.monthly_income) : null;
    const fixedHousingMinor =
      legacyUser?.fixed_housing_expense > 0 ? rupeesToMinor(legacyUser.fixed_housing_expense) : 0;

    const fixedLines =
      fixedHousingMinor > 0
        ? [
            {
              line_id: 'fxl_housing_default',
              label: 'Housing & Rent',
              category_id: 'HOUSING.RENT',
              monthly_amount_minor: fixedHousingMinor,
            },
          ]
        : [];

    const riskMap = {
      conservative: 'CONSERVATIVE',
      balanced: 'BALANCED',
      aggressive: 'GROWTH',
    };
    const riskComfort =
      riskMap[String(legacyUser?.risk_strategy || 'balanced').toLowerCase()] || 'BALANCED';

    const prefs = {
      ...DEFAULT_PREFERENCES,
      risk_comfort: riskComfort,
    };

    db.prepare(
      `INSERT INTO user_profiles_v1 (
        user_id, numeric_user_id, display_name, declared_income_minor,
        fixed_expense_lines_json, preferences_json, version, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))`
    ).run(
      canonicalId,
      numericId,
      displayName,
      declaredIncomeMinor,
      JSON.stringify(fixedLines),
      JSON.stringify(prefs)
    );
    profile = db.prepare('SELECT * FROM user_profiles_v1 WHERE user_id = ?').get(canonicalId);
  } else if (legacyUser) {
    // Keep display_name & declared_income_minor synced if updated via legacy routes
    const incomeMinor = rupeesToMinor(legacyUser.monthly_income || 0);
    const fixedHousingMinor = rupeesToMinor(legacyUser.fixed_housing_expense || 0);
    let fixedLines = [];
    try {
      fixedLines = JSON.parse(profile.fixed_expense_lines_json || '[]');
    } catch (_) {
      fixedLines = [];
    }
    if (fixedLines.length === 0 && fixedHousingMinor > 0) {
      fixedLines = [
        {
          line_id: 'fxl_housing_default',
          label: 'Housing & Rent',
          category_id: 'HOUSING.RENT',
          monthly_amount_minor: fixedHousingMinor,
        },
      ];
    } else if (fixedLines.length === 1 && fixedLines[0].line_id === 'fxl_housing_default' && fixedHousingMinor > 0) {
      fixedLines[0].monthly_amount_minor = fixedHousingMinor;
    }
    db.prepare(
      `UPDATE user_profiles_v1
       SET display_name = ?, declared_income_minor = ?, fixed_expense_lines_json = ?
       WHERE user_id = ?`
    ).run(
      legacyUser.name || profile.display_name,
      incomeMinor,
      JSON.stringify(fixedLines),
      canonicalId
    );
    profile = db.prepare('SELECT * FROM user_profiles_v1 WHERE user_id = ?').get(canonicalId);
  }

  // Sync legacy goals -> goals_v1
  const legacyGoals = db.prepare('SELECT * FROM goals WHERE user_id = ?').all(numericId);
  const existingLegacyGoalIds = new Set(
    db
      .prepare('SELECT legacy_goal_id FROM goals_v1 WHERE user_id = ? AND legacy_goal_id IS NOT NULL')
      .all(canonicalId)
      .map((g) => g.legacy_goal_id)
  );

  for (const lg of legacyGoals) {
    if (existingLegacyGoalIds.has(lg.id)) {
      // Keep saved_minor, target_minor, monthly_add_minor synced
      db.prepare(
        `UPDATE goals_v1
         SET name = ?, target_minor = ?, saved_minor = ?, monthly_add_minor = ?
         WHERE user_id = ? AND legacy_goal_id = ?`
      ).run(
        lg.name,
        rupeesToMinor(lg.target_amount),
        rupeesToMinor(lg.saved_amount || 0),
        rupeesToMinor(lg.monthly_allocation || 0),
        canonicalId,
        lg.id
      );
      continue;
    }
    const goalId = deterministicId('g', `goal_${numericId}_${lg.id}`);
    const pRaw = String(lg.priority || 'MEDIUM').toUpperCase();
    const priorityTier = pRaw.includes('HIGH')
      ? 'HIGH'
      : pRaw.includes('LOW')
      ? 'LOW'
      : 'MEDIUM';
    const priorityRank = priorityTier === 'HIGH' ? 1 : priorityTier === 'MEDIUM' ? 2 : 3;
    const statusMap = {
      active: 'ACTIVE',
      completed: 'COMPLETED',
      paused: 'PAUSED',
      declined: 'ARCHIVED',
    };
    const status = statusMap[String(lg.status || 'active').toLowerCase()] || 'ACTIVE';

    db.prepare(
      `INSERT OR IGNORE INTO goals_v1 (
        goal_id, user_id, name, target_minor, saved_minor, monthly_add_minor,
        deadline, priority_tier, priority_rank, status, version, legacy_goal_id
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 1, ?)`
    ).run(
      goalId,
      canonicalId,
      lg.name,
      rupeesToMinor(lg.target_amount),
      rupeesToMinor(lg.saved_amount || 0),
      rupeesToMinor(lg.monthly_allocation || 0),
      priorityTier,
      priorityRank,
      status,
      lg.id
    );
  }

  // Sync legacy budget_categories -> caps_v1
  const legacyCaps = db
    .prepare('SELECT * FROM budget_categories WHERE user_id = ?')
    .all(numericId);
  for (const lc of legacyCaps) {
    const catId = migrateLegacyCategory(lc.category) || 'MISC.OTHER';
    const existingCap = db
      .prepare('SELECT * FROM caps_v1 WHERE user_id = ? AND category_id = ?')
      .get(canonicalId, catId);
    if (!existingCap) {
      db.prepare(
        `INSERT INTO caps_v1 (cap_id, user_id, category_id, amount_minor, scope, source, watching, version)
         VALUES (?, ?, ?, ?, 'STANDING', 'USER', 0, 1)`
      ).run(newId('cap'), canonicalId, catId, rupeesToMinor(lc.monthly_cap));
    }
  }

  // Sync legacy subscriptions & upcoming_bills -> declared_bills_v1
  const legacySubs = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').all(numericId);
  const existingSubIds = new Set(
    db
      .prepare('SELECT legacy_sub_id FROM declared_bills_v1 WHERE user_id = ? AND legacy_sub_id IS NOT NULL')
      .all(canonicalId)
      .map((b) => b.legacy_sub_id)
  );
  for (const sub of legacySubs) {
    if (existingSubIds.has(sub.id)) continue;
    const cadenceMap = {
      monthly: 'MONTHLY',
      yearly: 'ANNUAL',
      weekly: 'MONTHLY',
      quarterly: 'QUARTERLY',
    };
    const cadence = cadenceMap[String(sub.billing_cycle || 'monthly').toLowerCase()] || 'MONTHLY';
    const nextDue = sub.next_billing_date || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const dueDay = Math.min(28, Math.max(1, parseInt(nextDue.slice(8, 10), 10) || 1));
    db.prepare(
      `INSERT INTO declared_bills_v1 (
        bill_id, user_id, label, category_id, amount_minor, cadence, due_day, next_due_date, active, version, legacy_sub_id
      ) VALUES (?, ?, ?, 'SUBSCRIPTIONS.STREAMING', ?, ?, ?, ?, 1, 1, ?)`
    ).run(
      newId('bil'),
      canonicalId,
      sub.name,
      rupeesToMinor(sub.amount),
      cadence,
      dueDay,
      nextDue,
      sub.id
    );
  }

  const legacyBills = db
    .prepare('SELECT * FROM upcoming_bills WHERE user_id = ? AND is_paid = 0')
    .all(numericId);
  const existingBillIds = new Set(
    db
      .prepare('SELECT legacy_bill_id FROM declared_bills_v1 WHERE user_id = ? AND legacy_bill_id IS NOT NULL')
      .all(canonicalId)
      .map((b) => b.legacy_bill_id)
  );
  for (const lb of legacyBills) {
    if (existingBillIds.has(lb.id)) continue;
    const dueDate = lb.due_date || new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    const dueDay = Math.min(28, Math.max(1, parseInt(dueDate.slice(8, 10), 10) || 1));
    db.prepare(
      `INSERT INTO declared_bills_v1 (
        bill_id, user_id, label, category_id, amount_minor, cadence, due_day, next_due_date, active, version, legacy_bill_id
      ) VALUES (?, ?, ?, 'UTILITIES.ELECTRICITY', ?, 'ONE_TIME', ?, ?, 1, 1, ?)`
    ).run(
      newId('bil'),
      canonicalId,
      lb.label,
      rupeesToMinor(lb.amount),
      dueDay,
      dueDate,
      lb.id
    );
  }
  return canonicalId;
}

function getCanonicalProfile(userId) {
  syncUserStateFromLegacy(userId);
  const canonicalId = toCanonicalUserId(userId);
  const row = db.prepare('SELECT * FROM user_profiles_v1 WHERE user_id = ?').get(canonicalId);
  if (!row) {
    return {
      schema: 'UserProfile@1',
      user_id: canonicalId,
      display_name: 'Default User',
      currency: 'INR',
      locale: 'en-IN',
      timezone: 'Asia/Kolkata',
      declared_income_minor: 0,
      fixed_expense_lines: [],
      preferences: { ...DEFAULT_PREFERENCES },
      accounts: [],
      declared_bills: [],
      version: 1,
      updated_at: new Date().toISOString(),
    };
  }
  let fixedExpenseLines = [];
  let preferences = { ...DEFAULT_PREFERENCES };
  try {
    fixedExpenseLines = JSON.parse(row.fixed_expense_lines_json || '[]');
  } catch (_) {}
  try {
    preferences = { ...DEFAULT_PREFERENCES, ...JSON.parse(row.preferences_json || '{}') };
  } catch (_) {}

  const accounts = db
    .prepare('SELECT * FROM accounts_v1 WHERE user_id = ? ORDER BY created_at')
    .all(canonicalId)
    .map((a) => ({
      ...a,
      is_own_account: Boolean(a.is_own_account),
    }));

  const declaredBills = db
    .prepare('SELECT * FROM declared_bills_v1 WHERE user_id = ? AND active = 1 ORDER BY next_due_date')
    .all(canonicalId)
    .map((b) => ({
      ...b,
      active: Boolean(b.active),
    }));

  return {
    schema: 'UserProfile@1',
    user_id: canonicalId,
    display_name: row.display_name,
    currency: 'INR',
    locale: 'en-IN',
    timezone: 'Asia/Kolkata',
    declared_income_minor: row.declared_income_minor,
    fixed_expense_lines: fixedExpenseLines,
    preferences,
    accounts,
    declared_bills: declaredBills,
    version: row.version,
    updated_at: row.updated_at,
  };
}

function getGoalsForUser(userId, includeArchived = false, period = null) {
  syncUserStateFromLegacy(userId);
  const canonicalId = toCanonicalUserId(userId);
  const currentMonth = period || new Date().toISOString().slice(0, 7);

  const rows = db
    .prepare(
      includeArchived
        ? 'SELECT * FROM goals_v1 WHERE user_id = ? ORDER BY priority_rank ASC, created_at ASC'
        : "SELECT * FROM goals_v1 WHERE user_id = ? AND status != 'ARCHIVED' ORDER BY priority_rank ASC, created_at ASC"
    )
    .all(canonicalId);

  const overrides = db
    .prepare('SELECT * FROM goal_month_overrides WHERE user_id = ? AND period = ?')
    .all(canonicalId, currentMonth);
  const overrideMap = Object.fromEntries(overrides.map((o) => [o.goal_id, o.monthly_add_minor]));

  return rows.map((g) => ({
    schema: 'Goal@1',
    ...g,
    standing_monthly_add_minor: g.monthly_add_minor,
    effective_monthly_add_minor:
      overrideMap[g.goal_id] != null ? overrideMap[g.goal_id] : g.monthly_add_minor,
    has_month_override: overrideMap[g.goal_id] != null,
  }));
}

function getCapsForUser(userId, period = null) {
  syncUserStateFromLegacy(userId);
  const canonicalId = toCanonicalUserId(userId);
  const currentMonth = period || new Date().toISOString().slice(0, 7);

  const rows = db
    .prepare('SELECT * FROM caps_v1 WHERE user_id = ? ORDER BY category_id')
    .all(canonicalId);

  const overrides = db
    .prepare('SELECT * FROM cap_month_overrides WHERE user_id = ? AND period = ?')
    .all(canonicalId, currentMonth);
  const overrideMap = Object.fromEntries(overrides.map((o) => [o.category_id, o]));

  return rows.map((c) => {
    const ov = overrideMap[c.category_id];
    return {
      schema: 'Cap@1',
      ...c,
      watching: Boolean(c.watching),
      category_display_name: getCategoryDisplayName(c.category_id),
      standing_amount_minor: c.amount_minor,
      effective_amount_minor: ov ? ov.amount_minor : c.amount_minor,
      has_month_override: Boolean(ov),
      month_override_reason: ov ? ov.reason : null,
    };
  });
}

module.exports = {
  DEFAULT_PREFERENCES,
  syncUserStateFromLegacy,
  getCanonicalProfile,
  getGoalsForUser,
  getCapsForUser,
};
