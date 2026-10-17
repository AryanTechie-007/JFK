import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  AlertOctagon,
  Plus,
  Zap,
  Clock,
  Sliders,
  RefreshCw,
  ArrowRightLeft,
  CheckCircle2,
  XCircle,
  Eye
} from 'lucide-react';
import { api } from '../../services/api/v1';
import { formatMinorInr } from '../../lib/format';
import WorkspaceChatPanel from '../../components/WorkspaceChatPanel';
import './NovaWorkspace.css';

const TAXONOMY_CAP_CATEGORIES = [
  { id: 'FOOD', label: 'Food & Dining (All)' },
  { id: 'FOOD.DELIVERY', label: 'Food Delivery (Swiggy / Zomato)' },
  { id: 'FOOD.GROCERIES', label: 'Groceries & Supermarkets' },
  { id: 'SHOPPING', label: 'Shopping & E-Commerce' },
  { id: 'TRANSPORT', label: 'Transport, Fuel & Cabs' },
  { id: 'ENTERTAINMENT', label: 'Entertainment & OTT' },
  { id: 'ENTERTAINMENT.SUBSCRIPTIONS', label: 'Subscriptions' },
  { id: 'UTILITIES', label: 'Bills & Utilities' },
  { id: 'HEALTH', label: 'Healthcare & Pharmacy' }
];

export default function NovaGuardianView({ budgets = [], userProfile }) {
  const currency = userProfile?.currency || '₹';
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [liveBanner, setLiveBanner] = useState(null);

  // Manual expense form
  const [newDesc, setNewDesc] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCat, setNewCat] = useState('FOOD');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Cap Editor form
  const [capCategory, setCapCategory] = useState('FOOD');
  const [capAmountInr, setCapAmountInr] = useState('');
  const [capScope, setCapScope] = useState('STANDING');
  const [capValidationMsg, setCapValidationMsg] = useState(null);

  const loadNovaWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getNovaWorkspace();
      if (res && res.success) {
        setWorkspace(res);
      }
    } catch (err) {
      console.error('Failed to load Nova workspace:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNovaWorkspace();
  }, [loadNovaWorkspace]);

  const handleAddTransaction = async (e) => {
    e.preventDefault();
    if (!newDesc.trim() || !newAmount) return;
    const amt = Number(newAmount);
    if (!Number.isFinite(amt) || amt <= 0) return;

    setIsSubmitting(true);
    try {
      const res = await api.ingestManualTransaction({
        rawDescription: newDesc.trim(),
        amount: amt,
        category: newCat,
        direction: 'DEBIT'
      });
      if (res?.alerts && res.alerts.length > 0) {
        setLiveBanner({
          type: 'warning',
          text: `Logged ₹${amt.toLocaleString('en-IN')} (${newDesc.trim()}). ${res.alerts.length} budget alert(s) active.`
        });
      } else {
        setLiveBanner({
          type: 'success',
          text: `Logged ₹${amt.toLocaleString('en-IN')} (${newDesc.trim()}) via Item Categorizer v3.0.`
        });
      }
      setNewDesc('');
      setNewAmount('');
      await loadNovaWorkspace();
    } catch (err) {
      setLiveBanner({ type: 'error', text: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveCap = async (e) => {
    e.preventDefault();
    const amtInr = Number(capAmountInr);
    if (!Number.isFinite(amtInr) || amtInr <= 0 || !workspace?.snapshot_id) return;
    const capMinor = Math.round(amtInr * 100);

    try {
      const valRes = await api.validateCapChange({
        category_id: capCategory,
        proposed_cap_minor: capMinor,
        scope: capScope
      });
      const validation = valRes?.validation?.value;
      if (validation && validation.allowed === false) {
        setCapValidationMsg({
          type: 'error',
          text: validation.violations?.[0]?.detail || 'Cap change rejected by Sentinel validation.'
        });
        return;
      }

      await api.executeAction({
        action_type: 'ADJUST_BUDGET_CAP',
        snapshot_id: workspace.snapshot_id,
        params: {
          category_id: capCategory,
          cap_minor: capMinor,
          scope: capScope
        }
      });

      setCapValidationMsg({
        type: 'success',
        text: `Updated ${capCategory} cap to ${currency}${amtInr.toLocaleString('en-IN')} (${capScope}).`
      });
      setCapAmountInr('');
      await loadNovaWorkspace();
    } catch (err) {
      setCapValidationMsg({ type: 'error', text: err.message });
    }
  };

  const handleConfirmRebalanceMove = async (move, targetCategoryId) => {
    if (!workspace?.snapshot_id) return;
    try {
      await api.executeAction({
        action_type: 'APPLY_REBALANCE',
        snapshot_id: workspace.snapshot_id,
        params: {
          month: workspace.month,
          moves: [
            {
              from_category_id: move.from_category_id,
              to_category_id: move.to_category_id || targetCategoryId,
              amount_minor: move.transfer_minor
            }
          ]
        }
      });
      setLiveBanner({
        type: 'success',
        text: `Applied one-month rebalance: moved ${formatMinorInr(move.transfer_minor, currency)} from ${move.from_category_id} to ${move.to_category_id || targetCategoryId}.`
      });
      await loadNovaWorkspace();
    } catch (err) {
      setLiveBanner({ type: 'error', text: err.message });
    }
  };

  const handleDismissAlert = async (alertId) => {
    if (!workspace?.snapshot_id) return;
    try {
      await api.executeAction({
        action_type: 'DISMISS_ALERT',
        snapshot_id: workspace.snapshot_id,
        params: { alert_id: alertId, reason: 'USER_DISMISSED' }
      });
      await loadNovaWorkspace();
    } catch (err) {
      setLiveBanner({ type: 'error', text: err.message });
    }
  };

  const utilizationCats = workspace?.utilization?.value?.categories || [];
  const velocityVal = workspace?.velocity?.value || {};
  const openAlerts = workspace?.alerts || [];
  const rebalancePlan = workspace?.rebalance?.value || null;
  const uncategorizedSpendMinor = workspace?.utilization?.value?.uncategorized_spend_minor || 0;

  return (
    <div className="nova-container">
      {/* Header */}
      <div className="nova-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h1 className="nova-title">Nova Budget Guardian</h1>
            <span className="nova-badge nova-badge-healthy">
              <ShieldCheck size={14} />
              Nova v5.0 • Sentinel Connected
            </span>
          </div>
          <p className="nova-subtitle">
            Real-time category cap utilization, settled vs. provisional spend tracking, velocity projections, and one-month rebalance plans.
          </p>
        </div>

        <button
          onClick={loadNovaWorkspace}
          style={{
            padding: '8px 14px',
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
          Refresh Snapshot
        </button>
      </div>

      {/* Live Banner */}
      {liveBanner && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: liveBanner.type === 'error' ? 'rgba(220, 38, 38, 0.1)' : liveBanner.type === 'warning' ? 'rgba(217, 119, 6, 0.1)' : 'rgba(5, 150, 105, 0.1)',
          border: `1px solid ${liveBanner.type === 'error' ? '#dc2626' : liveBanner.type === 'warning' ? '#d97706' : '#059669'}`,
          borderRadius: '8px',
          color: liveBanner.type === 'error' ? '#dc2626' : liveBanner.type === 'warning' ? '#d97706' : '#059669',
          fontSize: '12px',
          fontWeight: '600',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertOctagon size={15} />
            <span>{liveBanner.text}</span>
          </div>
          <button onClick={() => setLiveBanner(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: '700' }}>✕</button>
        </div>
      )}

      {/* Top Velocity & Rebalance Summary Card */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="badge badge-nova">MONTH {workspace?.month || 'CURRENT'}</span>
            <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>
              Day {velocityVal.days_elapsed || 1} ({velocityVal.days_remaining ?? 15} days remaining in month)
            </span>
          </div>
          {uncategorizedSpendMinor > 0 && (
            <span style={{ fontSize: '12px', color: '#d97706', fontWeight: '600' }}>
              Uncategorized spend (outside caps): {formatMinorInr(uncategorizedSpendMinor, currency)}
            </span>
          )}
        </div>

        {/* Open Alerts Strip */}
        {openAlerts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>
              Active Budget Alerts ({openAlerts.length})
            </div>
            {openAlerts.map((alr) => (
              <div
                key={alr.alert_id}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--bg-card-subtle)',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '10px'
                }}
              >
                <div>
                  <span style={{
                    fontSize: '10px',
                    fontWeight: '700',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    marginRight: '8px',
                    backgroundColor: alr.severity === 'CRITICAL' || alr.severity === 'WARN' ? 'rgba(220, 38, 38, 0.12)' : 'rgba(217, 119, 6, 0.12)',
                    color: alr.severity === 'CRITICAL' || alr.severity === 'WARN' ? '#dc2626' : '#d97706'
                  }}>
                    {alr.severity}
                  </span>
                  <strong style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{alr.title}</strong>
                </div>
                <button
                  onClick={() => handleDismissAlert(alr.alert_id)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-card)',
                    color: 'var(--text-muted)',
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                >
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Rebalance Proposal Card (if a category is in BREACH/SEVERE and Sentinel found donor headroom) */}
        {rebalancePlan?.moves?.length > 0 && (
          <div style={{
            padding: '14px',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-card-subtle)',
            border: '1px solid var(--border-focus)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ArrowRightLeft size={15} color="#d97706" />
                <span>Sentinel One-Month Rebalance Proposal (Tier T2)</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Shift <strong>{formatMinorInr(rebalancePlan.moves[0].transfer_minor, currency)}</strong> of unused headroom from{' '}
                <strong>{rebalancePlan.moves[0].from_category_id}</strong> to{' '}
                <strong>{rebalancePlan.moves[0].to_category_id}</strong> for {workspace?.month} only (standing caps unchanged).
              </div>
            </div>
            <button
              onClick={() => handleConfirmRebalanceMove(rebalancePlan.moves[0])}
              style={{
                padding: '8px 14px',
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
              <span>Confirm &amp; Apply Rebalance</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Grid */}
      <div className="nova-grid">
        {/* Left Column: Category Caps & Utilization */}
        <div className="nova-card">
          <div className="nova-card-title">
            <ShieldCheck size={18} color="#dc2626" />
            <span>Category Caps &amp; Live Utilization (NORMAL &lt;80%, WATCH 80–99%, BREACH ≥100%, SEVERE ≥120%)</span>
          </div>

          {utilizationCats.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', border: '1px dashed var(--border-color)', borderRadius: '8px' }}>
              No category caps configured yet. Use the Cap Configuration panel on the right to set your first monthly category cap.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {utilizationCats.map((cat) => {
                const pct = Math.round((cat.utilization_bp || 0) / 100);
                const isExceeded = cat.tier === 'BREACH' || cat.tier === 'SEVERE';
                const isWarning = cat.tier === 'WATCH';
                const statusClass = isExceeded ? 'exceeded' : isWarning ? 'warning' : 'healthy';
                const velProj = (velocityVal.projections || []).find((p) => p.category_id === cat.category_id);

                return (
                  <div key={cat.cap_id || cat.category_id} className={`nova-category-row ${statusClass}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
                          {cat.category_id}
                        </span>
                        <span className={`nova-badge ${isExceeded ? 'nova-badge-danger' : isWarning ? 'nova-badge-warning' : 'nova-badge-healthy'}`}>
                          {cat.tier}
                        </span>
                        {cat.is_override && (
                          <span className="nova-badge" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                            THIS-MONTH OVERRIDE
                          </span>
                        )}
                        {cat.tier_is_provisional && (
                          <span className="nova-badge" style={{ backgroundColor: 'rgba(217, 119, 6, 0.15)', color: '#d97706' }}>
                            PROVISIONAL (Review Queue)
                          </span>
                        )}
                      </div>

                      <span className="mono" style={{
                        fontSize: '13px',
                        fontWeight: '700',
                        color: isExceeded ? '#dc2626' : isWarning ? '#d97706' : '#059669'
                      }}>
                        {pct}%
                      </span>
                    </div>

                    <div className="nova-progress-track">
                      <div
                        className="nova-progress-fill"
                        style={{
                          width: `${Math.min(100, pct)}%`,
                          backgroundColor: isExceeded ? '#dc2626' : isWarning ? '#d97706' : '#059669'
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '8px', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>
                        Settled: <strong className="mono" style={{ color: 'var(--text-primary)' }}>{formatMinorInr(cat.settled_spend_minor, currency)}</strong>
                        {cat.provisional_spend_minor > 0 && (
                          <span style={{ color: '#d97706', marginLeft: '6px' }}>
                            (+{formatMinorInr(cat.provisional_spend_minor, currency)} provisional)
                          </span>
                        )}
                      </span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        Safe Daily: <strong className="mono" style={{ color: 'var(--text-primary)' }}>{formatMinorInr(velProj?.safe_daily_minor || 0, currency)}/day</strong>
                        {' • '}
                        Cap: <strong className="mono" style={{ color: 'var(--text-primary)' }}>{formatMinorInr(cat.effective_cap_minor, currency)}</strong>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Cap Editor + Manual Expense Logger */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Set / Adjust Cap Form */}
          <div className="nova-card">
            <div className="nova-card-title">
              <Sliders size={16} color="#dc2626" />
              <span>Set or Adjust Category Cap</span>
            </div>

            <form onSubmit={handleSaveCap} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <select
                className="nova-input-field"
                value={capCategory}
                onChange={(e) => setCapCategory(e.target.value)}
              >
                {TAXONOMY_CAP_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label} ({c.id})</option>
                ))}
              </select>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <input
                  type="number"
                  className="nova-input-field"
                  placeholder="Monthly Cap (₹)"
                  value={capAmountInr}
                  onChange={(e) => setCapAmountInr(e.target.value)}
                  required
                />
                <select
                  className="nova-input-field"
                  value={capScope}
                  onChange={(e) => setCapScope(e.target.value)}
                >
                  <option value="STANDING">Standing Cap (Every Month)</option>
                  <option value="MONTH">This Month Only ({workspace?.month || 'Override'})</option>
                </select>
              </div>

              <button type="submit" className="nova-button-primary">
                <ShieldCheck size={14} />
                <span>Validate with Sentinel &amp; Save Cap</span>
              </button>
            </form>

            {capValidationMsg && (
              <div style={{
                marginTop: '10px',
                padding: '8px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: '600',
                backgroundColor: capValidationMsg.type === 'error' ? 'rgba(220, 38, 38, 0.1)' : 'rgba(5, 150, 105, 0.1)',
                color: capValidationMsg.type === 'error' ? '#dc2626' : '#059669'
              }}>
                {capValidationMsg.text}
              </div>
            )}
          </div>

          {/* Manual Expense Ingestion */}
          <div className="nova-card">
            <div className="nova-card-title">
              <Plus size={16} color="#dc2626" />
              <span>Log Expense (Item Categorizer v3.0)</span>
            </div>

            <form onSubmit={handleAddTransaction} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input
                type="text"
                className="nova-input-field"
                placeholder="Merchant / Description (e.g. Swiggy Order)"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                required
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <input
                  type="number"
                  className="nova-input-field"
                  placeholder="Amount (₹)"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  required
                />

                <select
                  className="nova-input-field"
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                >
                  {TAXONOMY_CAP_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="nova-button-primary"
                disabled={isSubmitting}
              >
                <Zap size={14} />
                <span>{isSubmitting ? 'Categorizing & Scanning...' : 'Log Expense & Run Budget Scan'}</span>
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Embedded Nova Workspace Chat */}
      <WorkspaceChatPanel
        workspace="NOVA"
        title="Ask Nova (Budget Caps, Velocity & Rebalancing)"
        placeholder="Ask Nova e.g. 'How is my budget doing?' or 'Set my FOOD cap to ₹12,000'"
        onActionExecuted={loadNovaWorkspace}
      />
    </div>
  );
}
