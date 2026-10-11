import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Calendar, 
  PieChart, 
  Sparkles, 
  ArrowUpRight, 
  ArrowDownRight, 
  Filter,
  DollarSign,
  Layers,
  Activity,
  Upload,
  Plus,
  Loader2,
  RefreshCw,
  Clock
} from 'lucide-react';
import { transactionService } from '../../services/transactionService';

export default function SpendingAnalyserView({ userProfile, onOpenImportModal }) {
  const currency = userProfile?.currency || '₹';
  const [viewMode, setViewMode] = useState('month'); // 'month' | 'year'
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Add History modal state
  const [showAddHistoryModal, setShowAddHistoryModal] = useState(false);
  const [historyDesc, setHistoryDesc] = useState('');
  const [historyAmount, setHistoryAmount] = useState('');
  const [historyCategory, setHistoryCategory] = useState('Food & Dining');
  const [historyDate, setHistoryDate] = useState(new Date().toISOString().slice(0, 10));
  const [isSubmittingHistory, setIsSubmittingHistory] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await transactionService.getTransactions();
      if (res.success && Array.isArray(res.transactions)) {
        setTransactions(res.transactions);
      } else {
        setTransactions([]);
      }
    } catch (err) {
      console.warn('Failed to load transaction history:', err);
      setTransactions([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddHistory = async (e) => {
    e.preventDefault();
    if (!historyDesc.trim()) return;
    const amt = Number(historyAmount);
    if (isNaN(amt) || amt <= 0) return;

    setIsSubmittingHistory(true);
    try {
      await transactionService.createTransaction({
        rawDescription: historyDesc.trim(),
        amount: amt,
        category: historyCategory,
        txnDate: historyDate ? `${historyDate} 12:00:00` : null
      });

      setHistoryDesc('');
      setHistoryAmount('');
      setShowAddHistoryModal(false);
      await loadData();
    } catch (err) {
      alert('Failed to add transaction: ' + err.message);
    } finally {
      setIsSubmittingHistory(false);
    }
  };

  // Derive monthly groupings from real transactions
  const monthlyMap = {};
  const categoryMap = {};
  let totalHistoricSpend = 0;

  transactions.forEach((tx) => {
    const amt = Number(tx.amount) || 0;
    totalHistoricSpend += amt;

    const rawDate = tx.txn_date || tx.created_at || '';
    const dateObj = rawDate ? new Date(rawDate) : new Date();
    const monthKey = !isNaN(dateObj.getTime())
      ? dateObj.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      : 'Current';
    const yearKey = !isNaN(dateObj.getTime())
      ? dateObj.getFullYear().toString()
      : 'Current Year';

    const groupKey = viewMode === 'month' ? monthKey : yearKey;
    monthlyMap[groupKey] = (monthlyMap[groupKey] || 0) + amt;

    const cat = tx.category || 'General';
    categoryMap[cat] = (categoryMap[cat] || 0) + amt;
  });

  const chartData = Object.entries(monthlyMap).map(([label, total]) => ({
    label,
    total
  }));

  const maxVal = chartData.length > 0 ? Math.max(...chartData.map(d => d.total), 1) : 1;

  const categoryBreakdown = Object.entries(categoryMap).map(([category, spent]) => {
    const share = totalHistoricSpend > 0 ? Math.round((spent / totalHistoricSpend) * 100) : 0;
    return {
      category,
      spent,
      share
    };
  }).sort((a, b) => b.spent - a.spent);

  const topCategory = categoryBreakdown[0] || null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Title Header & Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.02em', fontFamily: 'var(--font-serif)' }}>
            Spending & Trend Analyser
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
            Analyze genuine historical transactions, categorize expense velocity, and track category shifts.
          </p>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Timeframe selector if data exists */}
          {chartData.length > 0 && (
            <div style={{
              display: 'flex',
              backgroundColor: '#e2e8f0',
              padding: '3px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid #cbd5e1'
            }}>
              <button
                onClick={() => setViewMode('month')}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  backgroundColor: viewMode === 'month' ? '#ffffff' : 'transparent',
                  color: viewMode === 'month' ? '#0f172a' : '#64748b',
                  fontWeight: viewMode === 'month' ? '700' : '500',
                  fontSize: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Calendar size={13} /> Month
              </button>
              <button
                onClick={() => setViewMode('year')}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  backgroundColor: viewMode === 'year' ? '#ffffff' : 'transparent',
                  color: viewMode === 'year' ? '#0f172a' : '#64748b',
                  fontWeight: viewMode === 'year' ? '700' : '500',
                  fontSize: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                Year
              </button>
            </div>
          )}

          <button
            onClick={() => setShowAddHistoryModal(true)}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontWeight: '700', color: '#005f41' }}
          >
            <Plus size={15} />
            <span>Add History</span>
          </button>

          {onOpenImportModal && (
            <button
              onClick={onOpenImportModal}
              className="btn btn-emerald"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontWeight: '700' }}
            >
              <Upload size={15} />
              <span>Import Statement CSV</span>
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Loader2 size={28} className="animate-spin" style={{ margin: '0 auto 12px auto' }} />
          <span>Loading historical transactions...</span>
        </div>
      ) : transactions.length === 0 ? (
        /* Empty State when no user transactions exist */
        <div className="card" style={{
          padding: '64px 32px',
          textAlign: 'center',
          backgroundColor: 'var(--bg-card-subtle)',
          borderRadius: '16px',
          border: '1px dashed var(--border-color)'
        }}>
          <BarChart3 size={44} color="#94a3b8" style={{ margin: '0 auto 16px auto' }} />
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>
            No spending history available
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', maxWidth: '480px', margin: '8px auto 24px auto', lineHeight: '1.5' }}>
            The Spending Analyser starts completely empty. Enter previous expenses or import a bank statement CSV to generate real spending trends and category insights.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowAddHistoryModal(true)}
              className="btn btn-emerald"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', fontWeight: '700' }}
            >
              <Plus size={16} />
              <span>Add History</span>
            </button>
            {onOpenImportModal && (
              <button
                onClick={onOpenImportModal}
                className="btn btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', fontWeight: '700' }}
              >
                <Upload size={16} />
                <span>Import Statement CSV</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Real Data Visualization */
        <>
          {/* KPI Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div className="card" style={{ padding: '18px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Total Recorded Outlay
              </div>
              <div className="mono" style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '6px' }}>
                {currency}{totalHistoricSpend.toLocaleString()}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Across {transactions.length} logged transaction{transactions.length === 1 ? '' : 's'}
              </div>
            </div>

            <div className="card" style={{ padding: '18px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Top Outlay Category
              </div>
              <div style={{ fontSize: '20px', fontWeight: '800', color: '#005f41', marginTop: '6px' }}>
                {topCategory ? topCategory.category : 'N/A'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {topCategory ? `${topCategory.share}% (${currency}${topCategory.spent.toLocaleString()}) of overall spend` : 'No category data'}
              </div>
            </div>

            <div className="card" style={{ padding: '18px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Logged Timeline
              </div>
              <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '6px' }}>
                {chartData.length} active period{chartData.length === 1 ? '' : 's'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Grouped by {viewMode}
              </div>
            </div>
          </div>

          {/* Main Grid: Real Trend Chart + Category Breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px' }}>
            
            {/* Real Chart Container */}
            <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="card-title" style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <TrendingUp size={18} color="#005f41" />
                  <span>Expenditure Trend ({viewMode === 'month' ? 'Monthly' : 'Yearly'})</span>
                </div>
                <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)', backgroundColor: 'var(--bg-surface-hover)', padding: '4px 8px', borderRadius: '4px' }}>
                  {chartData.length} Periods
                </span>
              </div>

              <div style={{
                height: '280px',
                width: '100%',
                backgroundColor: 'var(--bg-card-subtle)',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: '200px', gap: '12px' }}>
                  {chartData.map((item, idx) => {
                    const heightPct = Math.max(12, Math.round((item.total / maxVal) * 100));
                    return (
                      <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flex: 1, height: '100%', justifyContent: 'flex-end' }}>
                        <span className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '600' }}>
                          {currency}{item.total >= 1000 ? `${(item.total / 1000).toFixed(1)}k` : item.total}
                        </span>
                        <div style={{
                          width: '80%',
                          maxWidth: '42px',
                          height: `${heightPct}%`,
                          backgroundColor: idx === chartData.length - 1 ? '#005f41' : '#64748b',
                          borderRadius: '6px 6px 0 0',
                          transition: 'height 0.4s ease'
                        }} />
                        <span style={{ fontSize: '11px', color: 'var(--text-primary)', fontWeight: '700' }}>
                          {item.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ height: '1px', backgroundColor: '#cbd5e1', width: '100%' }} />
              </div>
            </div>

            {/* Category Breakdown from Real Data */}
            <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="card-title">
                <PieChart size={18} color="#005f41" />
                <span>Category Breakdown</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '8px' }}>
                {categoryBreakdown.map((cat, idx) => (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                      <span style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{cat.category}</span>
                      <span className="mono" style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                        {currency}{cat.spent.toLocaleString()} ({cat.share}%)
                      </span>
                    </div>
                    <div className="progress-track" style={{ height: '6px' }}>
                      <div className="progress-fill" style={{ width: `${cat.share}%`, backgroundColor: '#005f41' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </>
      )}

      {/* Add History Modal */}
      {showAddHistoryModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(3px)'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '480px',
            padding: '28px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
              Add Spending History
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
              Enter past expenses to populate real historical spending curves and trends.
            </p>

            <form onSubmit={handleAddHistory} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                  Description / Payee *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Whole Foods, Electricity Bill, Flight Ticket"
                  value={historyDesc}
                  onChange={(e) => setHistoryDesc(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                    Amount ({currency}) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="e.g. 1500"
                    value={historyAmount}
                    onChange={(e) => setHistoryAmount(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                    Category
                  </label>
                  <select
                    value={historyCategory}
                    onChange={(e) => setHistoryCategory(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '14px',
                      backgroundColor: 'var(--bg-card)',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="Food & Dining">Food & Dining</option>
                    <option value="Shopping & Lifestyle">Shopping & Lifestyle</option>
                    <option value="Bills & Utilities">Bills & Utilities</option>
                    <option value="Transport">Transport</option>
                    <option value="Subscriptions">Subscriptions</option>
                    <option value="General">General</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                  Date of Expense
                </label>
                <input
                  type="date"
                  value={historyDate}
                  onChange={(e) => setHistoryDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddHistoryModal(false)}
                  className="btn btn-secondary"
                  disabled={isSubmittingHistory}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-emerald"
                  disabled={isSubmittingHistory}
                >
                  {isSubmittingHistory ? 'Saving...' : 'Add Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
