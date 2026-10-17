import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, AlertTriangle, ShieldCheck, Zap } from 'lucide-react';
import { api } from '../../services/api/v1';
import { formatMinorInr, formatDate } from '../../lib/format';

export default function ForecastSection() {
  const [horizonDays, setHorizonDays] = useState(30);
  const [forecastData, setForecastData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadForecast = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.getSentinelForecast({ horizon_days: horizonDays });
      setForecastData(res);
    } catch (err) {
      console.warn('Forecast load error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [horizonDays]);

  useEffect(() => {
    loadForecast();
  }, [loadForecast]);

  const billsForecast = forecastData?.bills_forecast?.data || {};
  const outlays = billsForecast.outlays || [];
  const totalOutlaysMinor = billsForecast.total_outlays_minor ?? 0;

  const cashflowRisk = forecastData?.cashflow_risk?.data || {};
  const riskLevel = cashflowRisk.risk_level || 'LOW';
  const startingAvailable = cashflowRisk.starting_available_minor ?? 0;
  const projectedLowest = cashflowRisk.projected_lowest_balance_signed_minor ?? 0;

  const anomalies = forecastData?.anomalies?.data?.anomalies || forecastData?.anomalies || [];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px' }}>
      {/* 30-Day Bill Outlays Forecast */}
      <div className="card" style={{ padding: '22px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              {horizonDays}-Day Bill Outlay Forecast
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
              Detected + declared recurring bills (`sentinel_forecast_bill_outlays`)
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {[30, 60, 90].map((d) => (
              <button
                key={d}
                onClick={() => setHorizonDays(d)}
                className={horizonDays === d ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                style={{ fontSize: '11px', padding: '4px 8px' }}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        <div
          style={{
            padding: '12px 14px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            marginBottom: '14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Projected Outlays in {horizonDays}d Window:
          </span>
          <span className="mono" style={{ fontSize: '16px', fontWeight: '800', color: 'var(--accent-emerald)' }}>
            {formatMinorInr(totalOutlaysMinor)}
          </span>
        </div>

        {isLoading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Calculating bill projections...
          </div>
        ) : outlays.length === 0 ? (
          <div style={{ padding: '28px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            No bills or subscription outlays projected in this window. Declare bills in the Declared Bills tab.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
            {outlays.map((o, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div>
                  <div style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '13px' }}>
                    {o.label}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Due {formatDate(o.due_date)} • {o.cadence || 'MONTHLY'} • {o.display_name || o.category_id}
                  </div>
                </div>
                <div className="mono" style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '13px' }}>
                  {formatMinorInr(o.amount_minor)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cashflow Risk Radar & Anomalies */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div className="card" style={{ padding: '22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              Cash-Flow Risk Radar
            </h3>
            <span
              className="badge"
              style={{
                backgroundColor:
                  riskLevel === 'HIGH'
                    ? 'rgba(220, 38, 38, 0.15)'
                    : riskLevel === 'MEDIUM'
                    ? 'rgba(217, 119, 6, 0.15)'
                    : 'rgba(5, 150, 105, 0.15)',
                color:
                  riskLevel === 'HIGH'
                    ? '#dc2626'
                    : riskLevel === 'MEDIUM'
                    ? '#d97706'
                    : '#059669',
                fontWeight: '700',
              }}
            >
              Risk: {riskLevel}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
              <span>Starting Available Balance:</span>
              <strong className="mono" style={{ color: 'var(--text-primary)' }}>
                {formatMinorInr(startingAvailable)}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
              <span>Upcoming Outlays ({horizonDays}d):</span>
              <strong className="mono" style={{ color: 'var(--text-primary)' }}>
                {formatMinorInr(totalOutlaysMinor)}
              </strong>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: '8px',
                borderTop: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
              }}
            >
              <span>Projected Lowest Balance:</span>
              <strong
                className="mono"
                style={{
                  color: projectedLowest < 0 ? '#dc2626' : 'var(--accent-emerald)',
                }}
              >
                {formatMinorInr(projectedLowest)}
              </strong>
            </div>
          </div>
        </div>

        {/* Statistical Anomalies */}
        <div className="card" style={{ padding: '22px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
            Detected Spending Anomalies
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
            Flagged via non-parametric 3x Median Absolute Deviation (`sentinel_detect_anomalies`).
          </p>

          {anomalies.length === 0 ? (
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '12px 0' }}>
              No statistical spending spikes detected in the last 90 days.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {anomalies.map((a, idx) => (
                <div
                  key={a.txn_id || idx}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-primary)',
                    borderLeft: '3px solid #d97706',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600' }}>
                    <span style={{ color: 'var(--text-primary)' }}>{a.merchant_display_name || a.merchant_name || 'Spike'}</span>
                    <span className="mono" style={{ color: '#d97706' }}>{formatMinorInr(a.amount_minor)}</span>
                  </div>
                  <div style={{ color: 'var(--text-muted)', marginTop: '2px', fontSize: '11px' }}>
                    {formatDate(a.txn_date)} • Median: {formatMinorInr(a.baseline_median_minor)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
