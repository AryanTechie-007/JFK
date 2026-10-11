/**
 * Sentinel Available Balance Rule Library (`rules/balance.js` — Sentinel §B.6.15, §E, §K.1, SEN-AC-06)
 */

const { makeConstraint } = require('./goal');
const { SENTINEL_PARAMS } = require('../params');

/**
 * Checks whether `amount_minor` is covered by un-earmarked liquid balance (`sentinel_check_available_balance`).
 */
function checkAvailableBalance(state, params = {}, registry = SENTINEL_PARAMS) {
  const rawAmt = typeof params === 'number' ? params : params.amount_minor;
  const requestedMinor = Math.trunc(Number(rawAmt) || 0);
  const constraints = [];
  const ruleCodes = [];
  const warnings = [];

  const liquidTypes = new Set(['CHECKING', 'SAVINGS', 'CURRENT', 'SALARY', 'WALLET']);
  const liquidAccounts = (state.accounts || []).filter(
    (a) =>
      (a.is_own_account === undefined || Boolean(a.is_own_account)) &&
      liquidTypes.has(a.type) &&
      a.balance_minor !== null &&
      a.balance_minor !== undefined
  );

  // §B.4: Earmarked total = sum of saved_minor of ACTIVE, PAUSED, COMPLETED goals
  const allGoals = state.all_goals_including_archived || state.goals || [];
  const earmarkedTotalMinor = allGoals
    .filter((g) => ['ACTIVE', 'PAUSED', 'COMPLETED'].includes(g.status))
    .reduce((sum, g) => sum + Math.trunc(Number(g.saved_minor) || 0), 0);

  if (liquidAccounts.length === 0) {
    ruleCodes.push('BALANCE_UNKNOWN');
    constraints.push(makeConstraint('BALANCE_UNKNOWN', {}, 'MANDATORY'));
    return {
      verdict: 'INSUFFICIENT',
      legacy_verdict: 'BALANCE_UNKNOWN',
      spendable_balance_signed_minor: null,
      earmarked_total_minor: earmarkedTotalMinor,
      available_signed_minor: null,
      balance_as_of: null,
      stale: false,
      rule_codes: ruleCodes,
      warnings,
      // Legacy compatibility fields
      total_liquid_minor: 0,
      earmarked_minor: earmarkedTotalMinor,
      available_minor: 0,
      requested_minor: requestedMinor,
      constraints,
    };
  }

  const spendableBalanceSignedMinor = liquidAccounts.reduce(
    (sum, a) => sum + Math.trunc(Number(a.balance_minor) || 0),
    0
  );

  let balanceAsOf = null;
  let newestMs = 0;
  for (const a of liquidAccounts) {
    if (a.balance_as_of) {
      const ms = new Date(a.balance_as_of).getTime();
      if (ms > newestMs) {
        newestMs = ms;
        balanceAsOf = a.balance_as_of;
      }
    }
  }

  const staleAfterHours =
    (registry && registry.balance && registry.balance.stale_after_hours) || 48;
  const nowMs =
    state.snapshot && state.snapshot.as_of
      ? new Date(state.snapshot.as_of).getTime()
      : Date.now();
  // Flag stale if older than 24h (legacy SC §12) or stale_after_hours (48h)
  const stale = newestMs > 0 && nowMs - newestMs > Math.min(24, staleAfterHours) * 3600 * 1000;
  if (stale) {
    warnings.push('STALE_BALANCE');
    constraints.push(makeConstraint('STALE_BALANCE', { balance_as_of: balanceAsOf }, 'WARNING'));
  }

  const availableSignedMinor = spendableBalanceSignedMinor - earmarkedTotalMinor;

  if (availableSignedMinor < 0) {
    warnings.push('OVER_EARMARKED');
    constraints.push(
      makeConstraint(
        'OVER_EARMARKED',
        {
          earmarked_minor: earmarkedTotalMinor,
          total_liquid_minor: spendableBalanceSignedMinor,
        },
        'WARNING'
      )
    );
  }

  const availableNonNegMinor = Math.max(0, availableSignedMinor);
  if (requestedMinor > availableSignedMinor) {
    ruleCodes.push('INSUFFICIENT_BALANCE');
    constraints.push(
      makeConstraint(
        'INSUFFICIENT_BALANCE',
        {
          available_minor: availableNonNegMinor,
          requested_minor: requestedMinor,
        },
        'MANDATORY'
      )
    );
    return {
      verdict: 'INSUFFICIENT',
      legacy_verdict: 'INSUFFICIENT_BALANCE',
      spendable_balance_signed_minor: spendableBalanceSignedMinor,
      earmarked_total_minor: earmarkedTotalMinor,
      available_signed_minor: availableSignedMinor,
      balance_as_of: balanceAsOf,
      stale,
      rule_codes: ruleCodes,
      warnings,
      // Legacy compatibility fields
      total_liquid_minor: spendableBalanceSignedMinor,
      earmarked_minor: earmarkedTotalMinor,
      available_minor: availableNonNegMinor,
      requested_minor: requestedMinor,
      constraints,
    };
  }

  return {
    verdict: 'OK',
    legacy_verdict: 'OK',
    spendable_balance_signed_minor: spendableBalanceSignedMinor,
    earmarked_total_minor: earmarkedTotalMinor,
    available_signed_minor: availableSignedMinor,
    balance_as_of: balanceAsOf,
    stale,
    rule_codes: ruleCodes,
    warnings,
    // Legacy compatibility fields
    total_liquid_minor: spendableBalanceSignedMinor,
    earmarked_minor: earmarkedTotalMinor,
    available_minor: availableNonNegMinor,
    requested_minor: requestedMinor,
    constraints,
  };
}

module.exports = {
  checkAvailableBalance,
  checkAvailableBalanceRule: checkAvailableBalance,
};
