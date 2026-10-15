/**
 * Budget Monitor (SC §5.9, §17.5, Nova §A.3)
 * Deterministic service that monitors category utilization, anomalies, and cash-flow risk,
 * raising/updating Alert@1 rows with deduplication and cooldowns. Never invokes an LLM.
 */

const db = require('../db');
const { newId, toCanonicalUserId } = require('../shared/ids');
const { createSnapshot } = require('./snapshot');
const { createGatewaySession } = require('./gateway');

function scanUserBudgets(userId) {
  const canonicalUserId = toCanonicalUserId(userId);
  const snap = createSnapshot(canonicalUserId);
  const gateway = createGatewaySession({
    caller: 'BUDGET_MONITOR',
    snapshot_id: snap.snapshot_id,
    user_id: canonicalUserId,
    max_tool_calls: 10,
  });

  const utilRes = gateway.call('sentinel_run_category_utilization', {
    period: snap.current_month_ist,
  });
  const anomRes = gateway.call('sentinel_detect_anomalies', { lookback_days: 30 });
  const billsRes = gateway.call('sentinel_forecast_bill_outlays', { horizon_days: 30 });
  const riskRes = gateway.call('sentinel_flag_cashflow_risk', {
    horizon_days: 30,
    outlays: { $ref: `${billsRes.tool_result_id}:/data/outlays` },
  });

  const nowIso = new Date().toISOString();

  // 1. Cap Tier Alerts (WATCH >= 85%, BREACH >= 100%, SEVERE >= 110%)
  if (utilRes.status === 'OK' && utilRes.data?.categories) {
    for (const cat of utilRes.data.categories) {
      if (cat.tier === 'NORMAL' && !cat.watching) continue;
      const kind = cat.tier === 'NORMAL' && cat.watching ? 'WATCH' : 'CAP_TIER';
      const tier = cat.tier === 'NORMAL' ? 'WATCH' : cat.tier;
      const severity =
        tier === 'SEVERE' || tier === 'BREACH'
          ? 'HIGH'
          : tier === 'WATCH'
          ? 'MEDIUM'
          : 'LOW';

      const dedupeKey = `${canonicalUserId}:${kind}:${cat.category_id}:${snap.current_month_ist}:${tier}`;
      const existing = db
        .prepare('SELECT * FROM alerts_v1 WHERE dedupe_key = ?')
        .get(dedupeKey);

      const headlineData = {
        category_id: cat.category_id,
        display_name: cat.display_name,
        cap_minor: cat.cap_minor,
        settled_spend_minor: cat.settled_spend_minor,
        provisional_spend_minor: cat.provisional_spend_minor,
        total_spend_minor: cat.total_spend_minor,
        remaining_signed_minor: cat.remaining_signed_minor,
        excess_minor: cat.excess_minor,
        utilization_bp: cat.utilization_bp,
        safe_daily_minor: cat.safe_daily_minor,
      };

      if (!existing) {
        db.prepare(
          `INSERT INTO alerts_v1 (
            alert_id, user_id, kind, category_id, period, tier, severity,
            dedupe_key, headline_data_json, sentinel_result_ids_json, status, raised_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)`
        ).run(
          newId('alr'),
          canonicalUserId,
          kind,
          cat.category_id,
          snap.current_month_ist,
          tier,
          severity,
          dedupeKey,
          JSON.stringify(headlineData),
          JSON.stringify([utilRes.tool_result_id]),
          nowIso,
          nowIso
        );
      } else if (existing.status === 'OPEN') {
        db.prepare(
          `UPDATE alerts_v1
           SET headline_data_json = ?, sentinel_result_ids_json = ?, updated_at = ?
           WHERE alert_id = ?`
        ).run(
          JSON.stringify(headlineData),
          JSON.stringify([utilRes.tool_result_id]),
          nowIso,
          existing.alert_id
        );
      }
    }
  }

  // 2. Anomaly Alerts
  if (anomRes.status === 'OK' && anomRes.data?.anomalies) {
    for (const anom of anomRes.data.anomalies.slice(0, 3)) {
      const dedupeKey = `${canonicalUserId}:ANOMALY:${anom.category_id}:${snap.current_month_ist}:${anom.txn_id}`;
      const existing = db.prepare('SELECT * FROM alerts_v1 WHERE dedupe_key = ?').get(dedupeKey);
      if (!existing) {
        db.prepare(
          `INSERT INTO alerts_v1 (
            alert_id, user_id, kind, category_id, period, tier, severity,
            dedupe_key, headline_data_json, sentinel_result_ids_json, status, raised_at, updated_at
          ) VALUES (?, ?, 'ANOMALY', ?, ?, 'WATCH', 'MEDIUM', ?, ?, ?, 'OPEN', ?, ?)`
        ).run(
          newId('alr'),
          canonicalUserId,
          anom.category_id,
          snap.current_month_ist,
          dedupeKey,
          JSON.stringify(anom),
          JSON.stringify([anomRes.tool_result_id]),
          nowIso,
          nowIso
        );
      }
    }
  }

  // 3. Cash-Flow Risk Alerts
  if (riskRes.status === 'OK' && riskRes.data && riskRes.data.risk_level !== 'LOW') {
    const rLevel = riskRes.data.risk_level;
    const dedupeKey = `${canonicalUserId}:CASHFLOW_RISK:ALL:${snap.current_month_ist}:${rLevel}`;
    const existing = db.prepare('SELECT * FROM alerts_v1 WHERE dedupe_key = ?').get(dedupeKey);
    if (!existing) {
      db.prepare(
        `INSERT INTO alerts_v1 (
          alert_id, user_id, kind, category_id, period, tier, severity,
          dedupe_key, headline_data_json, sentinel_result_ids_json, status, raised_at, updated_at
        ) VALUES (?, ?, 'CASHFLOW_RISK', NULL, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)`
      ).run(
        newId('alr'),
        canonicalUserId,
        snap.current_month_ist,
        rLevel === 'HIGH' ? 'BREACH' : 'WATCH',
        rLevel === 'HIGH' ? 'HIGH' : 'MEDIUM',
        dedupeKey,
        JSON.stringify(riskRes.data),
        JSON.stringify([billsRes.tool_result_id, riskRes.tool_result_id]),
        nowIso,
        nowIso
      );
    }
  }

  return getOpenAlerts(canonicalUserId);
}

function getOpenAlerts(userId) {
  const canonicalUserId = toCanonicalUserId(userId);
  const rows = db
    .prepare(
      `SELECT * FROM alerts_v1
       WHERE user_id = ? AND status = 'OPEN'
       ORDER BY CASE severity WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, updated_at DESC`
    )
    .all(canonicalUserId);

  return rows.map((r) => ({
    schema: 'Alert@1',
    alert_id: r.alert_id,
    user_id: r.user_id,
    kind: r.kind,
    category_id: r.category_id,
    period: r.period,
    tier: r.tier,
    severity: r.severity,
    dedupe_key: r.dedupe_key,
    headline_data: JSON.parse(r.headline_data_json || '{}'),
    sentinel_result_ids: JSON.parse(r.sentinel_result_ids_json || '[]'),
    status: r.status,
    narrative_cache: r.narrative_cache_json ? JSON.parse(r.narrative_cache_json) : null,
    cooldown_until: r.cooldown_until,
    raised_at: r.raised_at,
    updated_at: r.updated_at,
  }));
}

module.exports = {
  scanUserBudgets,
  getOpenAlerts,
};
