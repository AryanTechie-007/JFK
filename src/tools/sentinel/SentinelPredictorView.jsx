import React, { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  ListFilter,
  Calendar,
  Plus,
  Trash2,
  RefreshCw,
  FileSpreadsheet,
  Layers,
} from 'lucide-react';
import { workspaceService } from '../../services/workspaceService';
import WorkspaceChatPanel from '../../components/WorkspaceChatPanel';

function formatInrMinor(minor) {
  const rupees = Math.round((Number(minor) || 0) / 100);
  return `₹${rupees.toLocaleString('en-IN')}`;
}

export default function SentinelPredictorView({ userProfile, onOpenImportModal }) {
  const [activeSubTab, setActiveSubTab] = useState('analyzer'); // 'analyzer' | 'forecast' | 'review' | 'transactions'
  const [timeframeMonths, setTimeframeMonths] = useState(3);
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState('');

  // Declared bill form state
  const [billLabel, setBillLabel] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [billCategory, setBillCategory] = useState('SUBSCRIPTIONS.STREAMING');
  const [billCadence, setBillCadence] = useState('MONTHLY');
  const [billDueDate, setBillDueDate] = useState('');

  const loadWorkspace = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await workspaceService.getSentinelWorkspace({
        timeframe_months: timeframeMonths,
      });
      setData(res);
    } catch (err) {
      console.warn('Sentinel workspace load error:', err.message);
    } finally {
      setIsLoading(false);
    }
  }, [timeframeMonths]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const handleConfirmReviewItem = async (item, chosenCategoryId) => {
    try {
      const actionType = chosenCategoryId
        ? 'CORRECT_TRANSACTION_CATEGORY'
        : 'CONFIRM_PROVISIONAL_CATEGORY';
      await workspaceService.executeAction({
        action_type: actionType,
        params: {
          txn_id: item.txn_id,
          category_id: chosenCategoryId || item.suggested_category_id || 'MISC.OTHER',
        },
      });
      setStatusMsg('Transaction classification confirmed and ledger version updated.');
      setTimeout(() => setStatusMsg(''), 3000);
      loadWorkspace();
    } catch (err) {
      setStatusMsg(`Update failed: ${err.message}`);
    }
  };

  const handleCorrectTransactionCategory = async (txnId, newCategoryId) => {
    try {
      await workspaceService.executeAction({
        action_type: 'CORRECT_TRANSACTION_CATEGORY',
        params: {
          txn_id: txnId,
          category_id: newCategoryId,
        },
      });
      setStatusMsg('Category updated via Action Service.');
      setTimeout(() => setStatusMsg(''), 3000);
      loadWorkspace();
    } catch (err) {
      setStatusMsg(`Update failed: ${err.message}`);
    }
  };

  const handleCreateDeclaredBill = async (e) => {
    e.preventDefault();
    if (!billLabel || !billAmount) return;
    try {
      await workspaceService.executeAction({
        action_type: 'CREATE_DECLARED_BILL',
        params: {
          label: billLabel.trim(),
          category_id: billCategory,
          amount_minor: Math.round(Number(billAmount) * 100),
          cadence: billCadence,
          next_due_date:
            billDueDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        },
      });
      setBillLabel('');
      setBillAmount('');
      setBillDueDate('');
      setStatusMsg('Declared bill added to Sentinel forecast.');
      setTimeout(() => setStatusMsg(''), 3000);
      loadWorkspace();
    } catch (err) {
      setStatusMsg(`Could not add bill: ${err.message}`);
    }
  };

  const handleDeleteDeclaredBill = async (billId) => {
    try {
      await workspaceService.executeAction({
        action_type: 'DELETE_DECLARED_BILL',
        params: { bill_id: billId },
      });
      loadWorkspace();
    } catch (_) {}
  };

  const dq = data?.data_quality || {
    coverage_bp: 10000,
    provisional_share_bp: 0,
    needs_review_count: 0,
    uncategorized_amount_minor: 0,
    complete: true,
  };
  const summary = data?.ledger_summary || {
    total_spend_minor: 0,
    total_settled_spend_minor: 0,
    total_provisional_spend_minor: 0,
    categories: [],
    top_merchants: [],
  };
  const series = (data?.timeseries?.series || []).map((pt) => ({
    period: pt.period,
    Settled: Math.round((pt.settled_spend_minor || 0) / 100),
    Provisional: Math.round((pt.provisional_spend_minor || 0) / 100),
    Total: Math.round((pt.total_spend_minor || 0) / 100),
  }));
  const billForecast = data?.bill_forecast || { outlays: [], total_outlays_minor: 0 };
  const cashflowRisk = data?.cashflow_risk || {
    risk_level: 'LOW',
    projected_lowest_balance_signed_minor: 0,
    starting_available_minor: 0,
  };
  const anomalies = data?.anomalies || [];
  const reviewQueue = data?.review_queue || [];
  const transactions = data?.transactions || [];
  const declaredBills = data?.declared_bills || [];
  const taxonomy = data?.taxonomy || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Header & DataQuality@1 Status Strip */}
      <div className="card" style={{ padding: '22px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1
                style={{
                  fontSize: '24px',
                  fontWeight: '800',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-serif)',
                }}
              >
                Sentinel — Financial Observer & Spending Analyser
              </h1>
              <span
                className="badge"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--accent-emerald)',
                  fontWeight: '700',
                }}
              >
                Model v5.0.0
              </span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Deterministic ledger arithmetic, empirical P80 bands, cadence detection, and Item Categorizer v3.0 review queue.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div
              style={{
                padding: '8px 14px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                fontSize: '12px',
              }}
            >
              <span style={{ color: 'var(--text-muted)' }}>Coverage: </span>
              <strong style={{ color: 'var(--accent-emerald)' }}>
                {(dq.coverage_bp / 100).toFixed(1)}%
              </strong>
              {dq.needs_review_count > 0 && (
                <span style={{ marginLeft: '8px', color: '#d97706' }}>
                  ({dq.needs_review_count} need review)
                </span>
              )}
            </div>

            {onOpenImportModal && (
              <button onClick={onOpenImportModal} className="btn btn-primary btn-sm">
                <FileSpreadsheet size={15} />
                <span>Add History / Import Statement</span>
              </button>
            )}

            <button onClick={loadWorkspace} className="btn btn-secondary btn-sm">
              <RefreshCw size={14} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Sub-navigation Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            marginTop: '18px',
            borderTop: '1px solid var(--border-color)',
            paddingTop: '14px',
            flexWrap: 'wrap',
          }}
        >
          {[
            { id: 'analyzer', label: 'Spending Analyzer & Trends' },
            { id: 'forecast', label: 'Forecast & Risk Radar' },
            { id: 'review', label: `Needs Review (${reviewQueue.length})` },
            { id: 'transactions', label: `Transactions & Bills (${transactions.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={activeSubTab === tab.id ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {statusMsg && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--accent-emerald)',
            color: 'var(--text-primary)',
            fontSize: '13px',
          }}
        >
          {statusMsg}
        </div>
      )}

      {/* TAB 1: SPENDING ANALYZER & TRENDS */}
      {activeSubTab === 'analyzer' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="grid-3">
            <div className="card" style={{ padding: '20px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Total Window Spend ({timeframeMonths}m)
              </div>
              <div
                className="mono"
                style={{
                  fontSize: '26px',
                  fontWeight: '800',
                  color: 'var(--text-primary)',
                  marginTop: '6px',
                  fontFamily: 'var(--font-serif)',
                }}
              >
                {formatInrMinor(summary.total_spend_minor)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Settled: {formatInrMinor(summary.total_settled_spend_minor)} | Provisional:{' '}
                {formatInrMinor(summary.total_provisional_spend_minor)}
              </div>
            </div>

            <div className="card" style={{ padding: '20px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Expected Monthly Surplus Baseline
              </div>
              <div
                className="mono"
                style={{
                  fontSize: '26px',
                  fontWeight: '800',
                  color: 'var(--accent-emerald)',
                  marginTop: '6px',
                  fontFamily: 'var(--font-serif)',
                }}
              >
                {formatInrMinor(data?.surplus_baseline?.expected_surplus_signed_minor || 0)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Conservative P80 Surplus:{' '}
                {formatInrMinor(data?.surplus_baseline?.conservative_surplus_signed_minor || 0)}
              </div>
            </div>

            <div className="card" style={{ padding: '20px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Un-earmarked Liquid Balance
              </div>
              <div
                className="mono"
                style={{
                  fontSize: '26px',
                  fontWeight: '800',
                  color: 'var(--text-primary)',
                  marginTop: '6px',
                  fontFamily: 'var(--font-serif)',
                }}
              >
                {formatInrMinor(data?.available_balance?.available_minor || 0)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Earmarked in Goals: {formatInrMinor(data?.available_balance?.earmarked_minor || 0)}
              </div>
            </div>
          </div>

          {/* 6-Month Time Series Chart */}
          <div className="card" style={{ padding: '22px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
              }}
            >
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>
                  6-Month Spending Time Series (Settled vs. Provisional)
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Computed deterministically by `sentinel_get_spending_timeseries`
                </p>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {[1, 3, 6].map((m) => (
                  <button
                    key={m}
                    onClick={() => setTimeframeMonths(m)}
                    className={
                      timeframeMonths === m ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'
                    }
                  >
                    {m}M Summary
                  </button>
                ))}
              </div>
            </div>

            <div style={{ width: '100%', height: '280px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                  <XAxis dataKey="period" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                  <YAxis
                    tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                    tickFormatter={(v) => `₹${v.toLocaleString()}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--bg-card)',
                      borderColor: 'var(--border-color)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <Legend />
                  <Bar dataKey="Settled" stackId="a" fill="#059669" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Provisional" stackId="a" fill="#d97706" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="Total" stroke="#6366f1" strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Category Breakdown & Top Merchants */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '20px' }}>
            <div className="card" style={{ padding: '22px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '14px' }}>
                Category Breakdown ({timeframeMonths}M)
              </h3>
              {summary.categories.length === 0 ? (
                <div style={{ padding: '28px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  No categorized spending recorded in this window yet. Click "Add History / Import Statement" above to add transactions.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {summary.categories.map((cat) => (
                    <div
                      key={cat.category_id}
                      style={{
                        padding: '12px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '14px' }}>
                            {cat.display_name}
                          </span>
                          <span
                            className="mono"
                            style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--text-muted)' }}
                          >
                            {cat.category_id} ({cat.txn_count} txns)
                          </span>
                        </div>
                        <div className="mono" style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                          {formatInrMinor(cat.total_spend_minor)}{' '}
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            ({(cat.share_bp / 100).toFixed(1)}%)
                          </span>
                        </div>
                      </div>
                      {cat.provisional_spend_minor > 0 && (
                        <div style={{ fontSize: '11px', color: '#d97706', marginTop: '4px' }}>
                          Includes {formatInrMinor(cat.provisional_spend_minor)} provisional (needs review)
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card" style={{ padding: '22px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '14px' }}>
                Top Resolved Merchants
              </h3>
              {summary.top_merchants.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  No resolved merchants in settled transactions yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {summary.top_merchants.map((m) => (
                    <div
                      key={m.merchant_id}
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
                        <div style={{ fontWeight: '600', fontSize: '13px', color: 'var(--text-primary)' }}>
                          {m.merchant_display_name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {m.txn_count} transaction(s)
                        </div>
                      </div>
                      <div className="mono" style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                        {formatInrMinor(m.spend_minor)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: FORECAST & RISK RADAR */}
      {activeSubTab === 'forecast' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div className="card" style={{ padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>
                30-Day Bill Outlay Forecast (`sentinel_forecast_bill_outlays`)
              </h3>
              <span className="mono" style={{ fontWeight: '700', color: 'var(--accent-emerald)' }}>
                Total: {formatInrMinor(billForecast.total_outlays_minor)}
              </span>
            </div>

            {billForecast.outlays.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '20px 0' }}>
                No upcoming bills or subscriptions due in the next 30 days. You can declare recurring bills in the "Transactions & Bills" tab.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {billForecast.outlays.map((o, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px',
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
                        Due {o.due_date} • {o.display_name} ({o.cadence})
                      </div>
                    </div>
                    <div className="mono" style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                      {formatInrMinor(o.amount_minor)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="card" style={{ padding: '22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>
                  Cash-Flow Risk Radar (`sentinel_flag_cashflow_risk`)
                </h3>
                <span
                  className="badge"
                  style={{
                    backgroundColor:
                      cashflowRisk.risk_level === 'HIGH'
                        ? 'rgba(220, 38, 38, 0.15)'
                        : cashflowRisk.risk_level === 'MEDIUM'
                        ? 'rgba(217, 119, 6, 0.15)'
                        : 'rgba(5, 150, 105, 0.15)',
                    color:
                      cashflowRisk.risk_level === 'HIGH'
                        ? '#dc2626'
                        : cashflowRisk.risk_level === 'MEDIUM'
                        ? '#d97706'
                        : '#059669',
                  }}
                >
                  Risk: {cashflowRisk.risk_level}
                </span>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                <div>
                  Starting Available Balance:{' '}
                  <strong>{formatInrMinor(cashflowRisk.starting_available_minor)}</strong>
                </div>
                <div>
                  Upcoming 30-Day Outlays:{' '}
                  <strong>{formatInrMinor(cashflowRisk.total_upcoming_outlays_minor)}</strong>
                </div>
                <div>
                  Projected Lowest 30-Day Balance:{' '}
                  <strong>
                    {formatInrMinor(cashflowRisk.projected_lowest_balance_signed_minor)}
                  </strong>
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: '22px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
                Detected Spending Anomalies (`sentinel_detect_anomalies`)
              </h3>
              {anomalies.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  No statistical spending spikes (3x MAD) detected in the last 90 days.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {anomalies.map((a) => (
                    <div
                      key={a.txn_id}
                      style={{
                        padding: '12px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: 'var(--bg-primary)',
                        borderLeft: '3px solid #d97706',
                      }}
                    >
                      <div style={{ fontWeight: '600', fontSize: '13px', color: 'var(--text-primary)' }}>
                        {a.merchant_display_name} — {formatInrMinor(a.amount_minor)}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {a.display_name} on {a.txn_date} (Median: {formatInrMinor(a.baseline_median_minor)})
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: NEEDS REVIEW QUEUE */}
      {activeSubTab === 'review' && (
        <div className="card" style={{ padding: '22px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>
            Item Categorizer Review Queue (`review_items`)
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Transactions with MEDIUM or LOW confidence are held here so you can confirm or assign their exact leaf category.
          </p>

          {reviewQueue.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              <CheckCircle2 size={28} color="var(--accent-emerald)" style={{ margin: '0 auto 8px auto' }} />
              All transactions are confirmed or settled with high confidence.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {reviewQueue.map((item) => (
                <div
                  key={item.review_id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px',
                    padding: '14px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>
                      {item.raw_description}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {item.txn_date} • Reason: {item.reason} • Suggested:{' '}
                      <strong>{item.suggested_category_id || 'Uncategorized'}</strong>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="mono" style={{ fontWeight: '700', fontSize: '15px', color: 'var(--text-primary)' }}>
                      {formatInrMinor(item.amount_minor)}
                    </span>

                    <select
                      defaultValue={item.suggested_category_id || 'MISC.OTHER'}
                      onChange={(e) => handleConfirmReviewItem(item, e.target.value)}
                      className="input"
                      style={{ width: '210px', padding: '6px 10px', fontSize: '12px' }}
                    >
                      {taxonomy.map((cat) => (
                        <option key={cat.category_id} value={cat.category_id}>
                          {cat.display_name} ({cat.category_id})
                        </option>
                      ))}
                    </select>

                    {item.suggested_category_id && (
                      <button
                        onClick={() => handleConfirmReviewItem(item, null)}
                        className="btn btn-primary btn-sm"
                      >
                        Confirm
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: TRANSACTIONS & DECLARED BILLS */}
      {activeSubTab === 'transactions' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '20px' }}>
          <div className="card" style={{ padding: '22px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '14px' }}>
              Versioned Transaction Ledger (Inline Category Correction)
            </h3>
            {transactions.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '20px 0' }}>
                No transactions recorded yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '520px', overflowY: 'auto' }}>
                {transactions.map((txn) => (
                  <div
                    key={txn.txn_id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '13px', color: 'var(--text-primary)' }}>
                        {txn.raw_description}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {txn.txn_date} • {txn.movement_type} • Status: {txn.classification_status}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <select
                        value={txn.category_id || 'MISC.OTHER'}
                        onChange={(e) => handleCorrectTransactionCategory(txn.txn_id, e.target.value)}
                        className="input"
                        style={{ width: '190px', padding: '5px 8px', fontSize: '12px' }}
                      >
                        {taxonomy.map((cat) => (
                          <option key={cat.category_id} value={cat.category_id}>
                            {cat.display_name}
                          </option>
                        ))}
                      </select>

                      <span className="mono" style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)', minWidth: '80px', textAlign: 'right' }}>
                        {formatInrMinor(txn.amount_minor)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Declared Bills Panel */}
          <div className="card" style={{ padding: '22px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
              Declared Recurring Bills
            </h3>
            <form onSubmit={handleCreateDeclaredBill} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
              <input
                type="text"
                className="input"
                placeholder="Bill label (e.g. Broadband, Society Fee)"
                value={billLabel}
                onChange={(e) => setBillLabel(e.target.value)}
                required
              />
              <input
                type="number"
                className="input"
                placeholder="Amount (₹)"
                value={billAmount}
                onChange={(e) => setBillAmount(e.target.value)}
                required
              />
              <select
                className="input"
                value={billCategory}
                onChange={(e) => setBillCategory(e.target.value)}
              >
                {taxonomy.map((cat) => (
                  <option key={cat.category_id} value={cat.category_id}>
                    {cat.display_name}
                  </option>
                ))}
              </select>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <select
                  className="input"
                  value={billCadence}
                  onChange={(e) => setBillCadence(e.target.value)}
                >
                  <option value="MONTHLY">MONTHLY</option>
                  <option value="QUARTERLY">QUARTERLY</option>
                  <option value="ANNUAL">ANNUAL</option>
                  <option value="ONE_TIME">ONE_TIME</option>
                </select>
                <input
                  type="date"
                  className="input"
                  value={billDueDate}
                  onChange={(e) => setBillDueDate(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-primary btn-sm">
                <Plus size={14} />
                <span>Add Declared Bill</span>
              </button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {declaredBills.map((b) => (
                <div
                  key={b.bill_id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '13px', color: 'var(--text-primary)' }}>
                      {b.label}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {formatInrMinor(b.amount_minor)} • {b.cadence} • Next: {b.next_due_date}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteDeclaredBill(b.bill_id)}
                    className="btn btn-ghost btn-sm"
                    style={{ color: '#dc2626' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Embedded Workspace Chat Panel (`ui_context.workspace = SENTINEL`) */}
      <WorkspaceChatPanel
        workspace="SENTINEL"
        title="Ask John about Sentinel Observations & Categorization"
        placeholder="Ask about your spending trends, anomalies, or transaction categories..."
        onActionExecuted={loadWorkspace}
      />
    </div>
  );
}
