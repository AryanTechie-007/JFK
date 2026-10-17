import React, { useState, useEffect, useCallback } from 'react';
import {
  ShoppingBag,
  Coffee,
  Tv,
  Sliders,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Plus,
  Trash2,
  RefreshCw,
  ShieldAlert,
  TrendingDown
} from 'lucide-react';
import { api } from '../../services/api/v1';
import { formatMinorInr } from '../../lib/format';
import WorkspaceChatPanel from '../../components/WorkspaceChatPanel';

const ADJUSTABLE_CATEGORIES = [
  { id: 'FOOD.DELIVERY', label: 'Food Delivery (Swiggy / Zomato)' },
  { id: 'FOOD.DINING', label: 'Dining Out & Cafes' },
  { id: 'SHOPPING', label: 'Shopping & E-Commerce' },
  { id: 'ENTERTAINMENT.SUBSCRIPTIONS', label: 'OTT & Subscriptions' },
  { id: 'TRANSPORT', label: 'Cabs, Fuel & Metro' }
];

function getNextMonthStr() {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getCurrentMonthStr() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default function IrisAdvisorView({ userProfile }) {
  const currency = userProfile?.currency || '₹';
  const [targetMonth, setTargetMonth] = useState(getNextMonthStr());
  const [workspaceData, setWorkspaceData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  // Per-category adjustments in INR (delta from baseline, e.g. -2000 means reduce by ₹2,000)
  const [categoryDeltasInr, setCategoryDeltasInr] = useState({
    'FOOD.DELIVERY': 0,
    'FOOD.DINING': 0,
    'SHOPPING': 0,
    'ENTERTAINMENT.SUBSCRIPTIONS': 0,
    'TRANSPORT': 0
  });

  // One-off outlays for What-If purchase planner
  const [oneOffOutlays, setOneOffOutlays] = useState([]);
  const [newOutlayLabel, setNewOutlayLabel] = useState('');
  const [newOutlayAmount, setNewOutlayAmount] = useState('');
  const [newOutlayDate, setNewOutlayDate] = useState(`${getNextMonthStr()}-15`);

  const [simulationResult, setSimulationResult] = useState(null);
  const [applyingPlan, setApplyingPlan] = useState(false);

  const loadWorkspace = useCallback(async (month = targetMonth) => {
    setLoading(true);
    try {
      const res = await api.getIrisWorkspace(month);
      if (res && res.success) {
        setWorkspaceData(res);
        setSimulationResult(res.simulation || null);
      }
    } catch (err) {
      console.error('Failed to load Iris workspace:', err);
    } finally {
      setLoading(false);
    }
  }, [targetMonth]);

  useEffect(() => {
    loadWorkspace(targetMonth);
  }, [targetMonth, loadWorkspace]);

  const runSimulation = async (deltas = categoryDeltasInr, outlays = oneOffOutlays) => {
    setSimulating(true);
    try {
      const category_adjustments = Object.entries(deltas)
        .filter(([, deltaInr]) => Number(deltaInr) !== 0)
        .map(([category_id, deltaInr]) => ({
          category_id,
          delta_minor: Math.round(Number(deltaInr) * 100)
        }));

      const one_off_outlays = outlays.map((o) => ({
        label: o.label,
        amount_minor: Math.round(Number(o.amountInr) * 100),
        date: o.date
      }));

      const res = await api.simulateSpendingPlan({
        target_month: targetMonth,
        category_adjustments,
        one_off_outlays
      });
      if (res?.simulation) {
        setSimulationResult(res.simulation);
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setSimulating(false);
    }
  };

  const handleSliderChange = (catId, deltaInr) => {
    const updated = { ...categoryDeltasInr, [catId]: Number(deltaInr) };
    setCategoryDeltasInr(updated);
  };

  const handleAddOutlay = (e) => {
    e.preventDefault();
    const amt = Number(newOutlayAmount);
    if (!newOutlayLabel.trim() || !Number.isFinite(amt) || amt <= 0) return;
    const nextOutlays = [
      ...oneOffOutlays,
      {
        id: `out_${Date.now()}`,
        label: newOutlayLabel.trim(),
        amountInr: amt,
        date: newOutlayDate || `${targetMonth}-15`
      }
    ];
    setOneOffOutlays(nextOutlays);
    setNewOutlayLabel('');
    setNewOutlayAmount('');
    runSimulation(categoryDeltasInr, nextOutlays);
  };

  const handleRemoveOutlay = (id) => {
    const nextOutlays = oneOffOutlays.filter((o) => o.id !== id);
    setOneOffOutlays(nextOutlays);
    runSimulation(categoryDeltasInr, nextOutlays);
  };

  const handleApplyMonthOverrides = async () => {
    if (!workspaceData?.snapshot_id) return;
    const activeAdjustments = Object.entries(categoryDeltasInr).filter(([, d]) => Number(d) !== 0);
    if (activeAdjustments.length === 0) {
      setStatusMessage({ type: 'error', text: 'Adjust at least one category slider before applying a month plan.' });
      return;
    }

    setApplyingPlan(true);
    try {
      const catBreakdown = workspaceData?.spending_summary?.value?.category_breakdown || [];
      for (const [catId, deltaInr] of activeAdjustments) {
        const existing = catBreakdown.find((c) => c.category_id === catId || c.parent_id === catId);
        const baseMinor = existing ? existing.net_spend_minor : 500000;
        const newCapMinor = Math.max(50000, baseMinor + Math.round(Number(deltaInr) * 100));

        await api.executeAction({
          action_type: 'ADJUST_BUDGET_CAP',
          snapshot_id: workspaceData.snapshot_id,
          params: {
            category_id: catId,
            cap_minor: newCapMinor,
            scope: 'MONTH',
            month: targetMonth
          }
        });
      }
      setStatusMessage({
        type: 'success',
        text: `Applied ${activeAdjustments.length} category cap override(s) for ${targetMonth}.`
      });
      await loadWorkspace(targetMonth);
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setApplyingPlan(false);
    }
  };

  const summaryVal = workspaceData?.spending_summary?.value || {};
  const categoryBreakdown = summaryVal.category_breakdown || [];
  const anomalies = workspaceData?.anomalies?.value?.anomalies || [];
  const billOutlays = workspaceData?.bill_forecast?.value?.outlays || [];
  const billTotalMinor = workspaceData?.bill_forecast?.value?.total_expected_minor || 0;
  const cashflowRiskVal = workspaceData?.cashflow_risk?.value || {};
  const simVal = simulationResult?.value || workspaceData?.simulation?.value || {};

  const totalDeltaInr = Object.values(categoryDeltasInr).reduce((acc, v) => acc + Number(v || 0), 0);
  const monthlySavingsInr = Math.max(0, -totalDeltaInr);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.02em', fontFamily: 'var(--font-serif)' }}>
              Smart Spending Advisor &amp; Next-Month Planner
            </h1>
            <span className="badge badge-iris">Iris v5.0 • Forward Planner</span>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Deterministic forward cash-flow simulation, category trade-offs, and one-off purchase feasibility grounded in Sentinel v5.0.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', borderRadius: '8px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
            <Calendar size={14} color="var(--text-muted)" />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600' }}>Target Month:</span>
            <select
              value={targetMonth}
              onChange={(e) => setTargetMonth(e.target.value)}
              style={{
                backgroundColor: 'transparent',
                color: 'var(--text-primary)',
                border: 'none',
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              <option value={getCurrentMonthStr()}>{getCurrentMonthStr()} (Current)</option>
              <option value={getNextMonthStr()}>{getNextMonthStr()} (Next Month)</option>
            </select>
          </div>

          <button
            onClick={() => loadWorkspace(targetMonth)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
      </div>

      {/* Status Notice */}
      {statusMessage && (
        <div style={{
          padding: '10px 14px',
          borderRadius: '8px',
          backgroundColor: statusMessage.type === 'error' ? 'rgba(220, 38, 38, 0.1)' : 'rgba(5, 150, 105, 0.1)',
          border: `1px solid ${statusMessage.type === 'error' ? '#dc2626' : '#059669'}`,
          color: statusMessage.type === 'error' ? '#dc2626' : '#059669',
          fontSize: '12px',
          fontWeight: '600',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{statusMessage.text}</span>
          <button onClick={() => setStatusMessage(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: '700' }}>✕</button>
        </div>
      )}

      {/* Top KPI Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        <div className="card" style={{ padding: '14px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>PROJECTED END BALANCE (EXPECTED)</div>
          <div className="mono" style={{ fontSize: '20px', fontWeight: '800', color: (simVal.expected_end_balance_minor ?? 0) < 0 ? '#dc2626' : 'var(--text-primary)', marginTop: '4px' }}>
            {formatMinorInr(simVal.expected_end_balance_minor ?? 0, currency)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Month {targetMonth}
          </div>
        </div>

        <div className="card" style={{ padding: '14px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>CONSERVATIVE END BALANCE (P80)</div>
          <div className="mono" style={{ fontSize: '20px', fontWeight: '800', color: (simVal.conservative_end_balance_minor ?? 0) < 0 ? '#dc2626' : '#d97706', marginTop: '4px' }}>
            {formatMinorInr(simVal.conservative_end_balance_minor ?? 0, currency)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Buffer Shortfall: {formatMinorInr(simVal.buffer_shortfall_minor ?? 0, currency)}
          </div>
        </div>

        <div className="card" style={{ padding: '14px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>UPCOMING BILL OUTLAYS</div>
          <div className="mono" style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '4px' }}>
            {formatMinorInr(billTotalMinor, currency)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {billOutlays.length} scheduled bill(s) in 30d
          </div>
        </div>

        <div className="card" style={{ padding: '14px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600' }}>PLAN RISK LEVEL</div>
          <div style={{ fontSize: '18px', fontWeight: '800', marginTop: '4px', color: simVal.risk_level === 'HIGH' ? '#dc2626' : simVal.risk_level === 'MODERATE' ? '#d97706' : '#059669' }}>
            {simVal.risk_level || cashflowRiskVal.risk_level || 'LOW'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Confidence: {simulationResult?.confidence?.level || 'MEDIUM'}
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '20px' }}>
        {/* Left Column: Next-Month Interactive Simulator */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="card-title" style={{ margin: 0 }}>
              <Sliders size={18} color="#d97706" />
              <span>Next-Month Category &amp; Purchase Planner ({targetMonth})</span>
            </div>
            <button
              onClick={() => runSimulation(categoryDeltasInr, oneOffOutlays)}
              disabled={simulating}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: '11px',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              {simulating ? 'Simulating...' : 'Run Sentinel Simulation'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {ADJUSTABLE_CATEGORIES.map((cat) => {
              const delta = categoryDeltasInr[cat.id] || 0;
              const currentCat = categoryBreakdown.find((c) => c.category_id === cat.id || c.parent_id === cat.id);
              const currentInr = currentCat ? Math.round(currentCat.net_spend_minor / 100) : 0;

              return (
                <div
                  key={cat.id}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--bg-card-subtle)',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{cat.label}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                        (Current 30d: {currency}{currentInr.toLocaleString('en-IN')})
                      </span>
                    </div>
                    <span className="mono" style={{
                      fontSize: '12px',
                      fontWeight: '700',
                      color: delta < 0 ? '#059669' : delta > 0 ? '#dc2626' : 'var(--text-muted)'
                    }}>
                      {delta > 0 ? `+${currency}${delta.toLocaleString('en-IN')}` : delta < 0 ? `-${currency}${Math.abs(delta).toLocaleString('en-IN')}` : 'No change'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-10000"
                    max="10000"
                    step="500"
                    value={delta}
                    onChange={(e) => handleSliderChange(cat.id, e.target.value)}
                    onMouseUp={() => runSimulation({ ...categoryDeltasInr, [cat.id]: Number(delta) }, oneOffOutlays)}
                    style={{ width: '100%', accentColor: '#d97706', cursor: 'pointer' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)' }}>
                    <span>Cut {currency}10,000/mo</span>
                    <span>Baseline (0)</span>
                    <span>Add +{currency}10,000/mo</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* One-off purchase what-if section */}
          <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'var(--bg-card-subtle)', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>
              One-Off Purchase What-If Test
            </div>
            <form onSubmit={handleAddOutlay} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr auto', gap: '8px' }}>
              <input
                type="text"
                placeholder="Item (e.g. Flight / Gadget)"
                value={newOutlayLabel}
                onChange={(e) => setNewOutlayLabel(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '12px' }}
              />
              <input
                type="number"
                placeholder="Amount (₹)"
                value={newOutlayAmount}
                onChange={(e) => setNewOutlayAmount(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '12px' }}
              />
              <input
                type="date"
                value={newOutlayDate}
                onChange={(e) => setNewOutlayDate(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '12px' }}
              />
              <button
                type="submit"
                style={{
                  padding: '7px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: 'var(--text-primary)',
                  color: 'var(--bg-primary)',
                  fontSize: '12px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                <Plus size={14} />
              </button>
            </form>

            {oneOffOutlays.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
                {oneOffOutlays.map((o) => (
                  <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', padding: '6px 8px', borderRadius: '6px', backgroundColor: 'var(--bg-card)' }}>
                    <span>
                      <strong>{o.label}</strong> • {o.date}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="mono" style={{ fontWeight: '700', color: '#dc2626' }}>
                        {currency}{Number(o.amountInr).toLocaleString('en-IN')}
                      </span>
                      <button
                        onClick={() => handleRemoveOutlay(o.id)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Unlocked Savings & Apply Plan CTA */}
          <div style={{
            padding: '14px',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-card-subtle)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>
                Planned Monthly Savings Delta: <span className="mono" style={{ color: '#059669' }}>+{currency}{monthlySavingsInr.toLocaleString('en-IN')}/mo</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Applies one-month category cap overrides (`scope = MONTH`) for {targetMonth} without altering standing caps.
              </div>
            </div>
            <button
              onClick={handleApplyMonthOverrides}
              disabled={applyingPlan}
              style={{
                padding: '9px 16px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#059669',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <CheckCircle2 size={14} />
              <span>{applyingPlan ? 'Applying...' : `Apply Plan for ${targetMonth}`}</span>
            </button>
          </div>
        </div>

        {/* Right Column: Live Behavioral Audit & Upcoming Bills Strip */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Behavioral Habit & Anomaly Audit */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="card-title" style={{ margin: 0 }}>
              <ShoppingBag size={18} color="#d97706" />
              <span>Live Spending Breakdown &amp; Detected Anomalies</span>
            </div>

            {categoryBreakdown.length === 0 ? (
              <div style={{ padding: '18px', borderRadius: '8px', backgroundColor: 'var(--bg-card-subtle)', border: '1px dashed var(--border-color)', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                No transaction history recorded yet. Upload your statement CSV or log expenses in the Spending Analyzer to unlock Iris habit diagnostics.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {categoryBreakdown.slice(0, 6).map((cat) => (
                  <div
                    key={cat.category_id}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--bg-card-subtle)',
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{cat.category_id}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Settled: {formatMinorInr(cat.settled_spend_minor, currency)}
                        {cat.provisional_spend_minor > 0 ? ` • Provisional: ${formatMinorInr(cat.provisional_spend_minor, currency)}` : ''}
                      </div>
                    </div>
                    <div className="mono" style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
                      {formatMinorInr(cat.net_spend_minor, currency)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {anomalies.length > 0 && (
              <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#d97706', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle size={14} />
                  <span>Sentinel Anomaly Signals ({anomalies.length})</span>
                </div>
                {anomalies.slice(0, 3).map((anom, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(217, 119, 6, 0.08)',
                      border: '1px solid rgba(217, 119, 6, 0.3)',
                      fontSize: '12px'
                    }}
                  >
                    <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                      {anom.type} • {anom.category_id || anom.merchant_id}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: '2px' }}>
                      Observed: {formatMinorInr(anom.observed_minor, currency)} (Baseline median: {formatMinorInr(anom.baseline_median_minor, currency)})
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Bills Strip */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div className="card-title" style={{ margin: 0 }}>
              <Tv size={18} color="#7c3aed" />
              <span>Upcoming 30-Day Bill &amp; Subscription Outlays</span>
            </div>

            {billOutlays.length === 0 ? (
              <div style={{ padding: '14px', fontSize: '12px', color: 'var(--text-muted)' }}>
                No upcoming bills or subscriptions detected in the next 30 days. Add subscriptions on the Subscriptions page or declare recurring bills in the Spending Analyzer.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {billOutlays.map((bill) => (
                  <div
                    key={bill.bill_id}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--bg-card-subtle)',
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>{bill.merchant_name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Due: {bill.due_date} • Source: {bill.source}
                      </div>
                    </div>
                    <span className="mono" style={{ fontSize: '13px', fontWeight: '700', color: '#dc2626' }}>
                      {formatMinorInr(bill.expected_minor, currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Embedded Iris Workspace Chat */}
      <WorkspaceChatPanel
        workspace="IRIS"
        title="Ask Iris (Spending & Next-Month Trade-Offs)"
        placeholder="Ask Iris e.g. 'Can I afford a ₹15,000 trip next month?' or 'Where can I cut ₹3,000?'"
        onActionExecuted={() => loadWorkspace(targetMonth)}
      />
    </div>
  );
}
