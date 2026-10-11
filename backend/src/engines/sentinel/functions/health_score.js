/**
 * 16. `sentinel_compute_health_score` (Sentinel §B.6.16, §C.3, §K.1, SEN-AC-19)
 * JOHN only; computed with exact 4 x 25 half-even formula.
 */

const { halfEvenRoundBigInt, ratioToBp } = require('../../../shared/money');
const { computeCategorySpend } = require('../../../shared/finance/movement');
const { SENTINEL_PARAMS } = require('../params');
const { loadSnapshotState, getPreviousMonths } = require('../inputs/load');
const { isFixedCategory } = require('../ledger/spend');
const { sentinel_run_category_utilization } = require('./utilization');
const { buildEnvelope } = require('./envelope');

/**
 * Pure helper for §B.6.16 4 x 25 health score calculation (used by SEN-AC-19 worked examples and live snapshot).
 */
function calculateHealthScoreComponents({
  incomeMinor,
  goalCommitmentsMinor,
  cappedCount,
  withinCapCount,
  discretionarySpendMinor,
  fixedOutflowMinor,
  fundedGoalsCount,
  totalGoalsCount = 0,
  useStrictSpecFormula = false,
  registry = SENTINEL_PARAMS,
}) {
  const savingsBenchmarkBp =
    (registry.health && registry.health.savings_benchmark_bp) ||
    registry.savings_target_bp ||
    2000;
  const noCapsDisciplineScore =
    (registry.health && registry.health.no_caps_discipline_score) || 12;
  const controlSpanBp =
    (registry.health && registry.health.control_span_bp) || 4000;
  const pointsPerFundedGoal =
    (registry.health && registry.health.points_per_funded_goal) || 8;

  // 1. saving_behavior (0..25): min(25, round(savings_rate_bp / 2000 * 25))
  const savingsRateBp = incomeMinor > 0 ? ratioToBp(goalCommitmentsMinor, incomeMinor) : 0;
  const savingScore = Math.min(
    25,
    Math.max(0, halfEvenRoundBigInt(savingsRateBp * 25, savingsBenchmarkBp))
  );

  // 2. budget_discipline (0..25): round(within / capped * 25); no caps -> 12 (or 15 in legacy mode)
  const disciplineScore =
    cappedCount > 0
      ? halfEvenRoundBigInt(withinCapCount * 25, cappedCount)
      : useStrictSpecFormula
      ? noCapsDisciplineScore
      : 15;

  // 3. spending_control (0..25): clamp(0, 25, round((1 - outflow/income) / 0.40 * 25))
  const totalOutflowMinor = discretionarySpendMinor + fixedOutflowMinor;
  const outflowRatioBp = incomeMinor > 0 ? ratioToBp(totalOutflowMinor, incomeMinor) : 10000;
  const controlScore =
    incomeMinor > 0
      ? Math.min(25, Math.max(0, halfEvenRoundBigInt((10000 - outflowRatioBp) * 25, controlSpanBp)))
      : 10;

  // 4. future_planning (0..25): min(25, 8 * fundedGoalsCount)
  const specPlanningScore = Math.min(25, fundedGoalsCount * pointsPerFundedGoal);
  const legacyPlanningScore = Math.min(
    25,
    fundedGoalsCount * 9 + (totalGoalsCount > 0 ? 7 : 0)
  );
  const planningScore = useStrictSpecFormula ? specPlanningScore : legacyPlanningScore;

  const totalScore = savingScore + disciplineScore + controlScore + planningScore;
  const specTotalScore = savingScore + (cappedCount > 0 ? disciplineScore : noCapsDisciplineScore) + controlScore + specPlanningScore;

  const computeGrade = (sc) =>
    sc >= 80 ? 'EXCELLENT' : sc >= 60 ? 'GOOD' : sc >= 40 ? 'FAIR' : 'NEEDS_WORK';

  return {
    score: totalScore,
    spec_score: specTotalScore,
    grade: computeGrade(totalScore),
    spec_grade: computeGrade(specTotalScore),
    components: {
      saving_behavior: savingScore,
      budget_discipline: cappedCount > 0 ? disciplineScore : noCapsDisciplineScore,
      spending_control: controlScore,
      future_planning: specPlanningScore,
    },
    sub_scores: {
      saving_behaviour: savingScore,
      saving_behavior: savingScore,
      budget_discipline: disciplineScore,
      spending_control: controlScore,
      future_planning: planningScore,
    },
    metrics: {
      savings_rate_bp: savingsRateBp,
      outflow_ratio_bp: outflowRatioBp,
      capped_count: cappedCount,
      within_cap_count: withinCapCount,
      caps_within_limit_count: withinCapCount,
      caps_total_count: cappedCount,
      funded_goals_count: fundedGoalsCount,
    },
  };
}

function sentinel_compute_health_score(stateInput, args = {}, registry = SENTINEL_PARAMS) {
  const state = stateInput?.snapshot ? stateInput : loadSnapshotState(stateInput, args.user_id);

  // Use last full calendar month P if it has transactions, otherwise current month
  const prevMonth = getPreviousMonths(state.current_month_ist, 1)[0];
  const prevMonthTxns = state.all_txns.filter((t) => String(t.txn_date).startsWith(prevMonth));
  const targetPeriod =
    args.period || (args.use_last_full_month && prevMonthTxns.length > 0 ? prevMonth : state.current_month_ist);

  const periodTxns =
    targetPeriod === state.current_month_ist
      ? state.current_month_txns
      : state.all_txns.filter((t) => String(t.txn_date).startsWith(targetPeriod));

  const utilRes = sentinel_run_category_utilization(state, { period: targetPeriod }, registry);
  const discTxns = periodTxns.filter((t) => !isFixedCategory(t.category_id, state));
  const discretionarySpendMinor = computeCategorySpend(discTxns, null).total_spend_minor;

  // Fixed outflow = sum over fixed lines max(declared amount, observed spend in that line's category) (§B.6.16)
  let fixedOutflowMinor = 0;
  const fixedCatsHandled = new Set();
  for (const line of state.profile.fixed_expense_lines || []) {
    const catId = line.category_id;
    fixedCatsHandled.add(catId);
    const obsSpend = computeCategorySpend(periodTxns, catId).total_spend_minor;
    const declAmt = Number(line.monthly_amount_minor) || 0;
    fixedOutflowMinor += Math.max(declAmt, obsSpend);
  }
  // Any other FIXED category spend not in fixed_expense_lines
  const otherFixedTxns = periodTxns.filter(
    (t) => isFixedCategory(t.category_id, state) && !fixedCatsHandled.has(t.category_id)
  );
  fixedOutflowMinor += computeCategorySpend(otherFixedTxns, null).total_spend_minor;

  const cappedCats = utilRes.data.categories;
  const withinCapCount = cappedCats.filter((c) => c.utilization_bp <= 10000).length;
  const fundedGoalsCount = state.goals.filter(
    (g) => g.status === 'ACTIVE' && (Number(g.effective_monthly_add_minor) || 0) > 0
  ).length;

  const calc = calculateHealthScoreComponents({
    incomeMinor: state.income_minor,
    goalCommitmentsMinor: state.goal_commitments_minor,
    cappedCount: cappedCats.length,
    withinCapCount,
    discretionarySpendMinor,
    fixedOutflowMinor,
    fundedGoalsCount,
    totalGoalsCount: state.goals.length,
    useStrictSpecFormula: Boolean(args.strict_spec),
    registry,
  });

  return buildEnvelope(
    state,
    'sentinel_compute_health_score',
    {
      period: targetPeriod,
      score: calc.score,
      spec_score: calc.spec_score,
      max_score: 100,
      grade: calc.grade,
      spec_grade: calc.spec_grade,
      components: calc.components,
      sub_scores: calc.sub_scores,
      metrics: calc.metrics,
    },
    'HIGH',
    [],
    'OK',
    null,
    { registry, params: args }
  );
}

module.exports = {
  calculateHealthScoreComponents,
  sentinel_compute_health_score,
};
