import React from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Sparkles, 
  ShieldCheck, 
  AlertTriangle, 
  Calendar, 
  Target, 
  ArrowUpRight, 
  ArrowRight, 
  Upload, 
  PlusCircle, 
  Bot, 
  CheckCircle2, 
  PieChart, 
  Clock,
  Zap,
  CreditCard
} from 'lucide-react';
import { USER_PROFILE, SENTINEL_FORECAST, TRANSACTIONS } from '../data/mockFinancialData';

export default function HomeDashboardView({ 
  userProfile, 
  budgets, 
  goals, 
  setActiveTab, 
  onOpenImportModal 
}) {
  const profile = userProfile || USER_PROFILE;
  const currency = profile.currency || '₹';
  const income = profile.monthlyIncome || 75000;
  const fixed = profile.fixedExpenses || profile.fixed_housing_expense || 20000;
  
  // Calculate total spent from budgets or mock
  const activeBudgets = budgets && budgets.length > 0 ? budgets : [
    { category: 'Food & Dining', spent: 9200, limit: 10000, percent: 92, status: 'warning', color: '#d97706' },
    { category: 'Shopping & Lifestyle', spent: 8400, limit: 10000, percent: 84, status: 'normal', color: '#2563eb' },
    { category: 'Subscriptions', spent: 3500, limit: 3000, percent: 116, status: 'exceeded', color: '#dc2626' },
    { category: 'Bills & Utilities', spent: 5000, limit: 5000, percent: 100, status: 'limit', color: '#7c3aed' },
    { category: 'Transport', spent: 3100, limit: 5000, percent: 62, status: 'normal', color: '#059669' }
  ];

  const totalSpent = activeBudgets.reduce((sum, b) => sum + (b.spent || 0), 0);
  const totalLimit = activeBudgets.reduce((sum, b) => sum + (b.limit || 0), 0);
  const netSurplus = Math.max(0, income - fixed - totalSpent);
  const budgetUtilization = totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 100) : 78;

  const activeGoals = goals && goals.length > 0 ? goals : [
    { id: 'g1', name: 'Emergency Fund', current: 50000, target: 100000, category: 'Safety', monthlyAdd: 10000 },
    { id: 'g2', name: 'Laptop Purchase', current: 40000, target: 80000, category: 'Asset', monthlyAdd: 7500 },
    { id: 'g3', name: 'Vacation Fund', current: 20000, target: 50000, category: 'Lifestyle', monthlyAdd: 5000 }
  ];

  // Top overspent/warning categories
  const warningBudgets = activeBudgets.filter(b => (b.percent || (b.spent / b.limit) * 100) >= 80);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Welcome & Quick Action Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.02em', fontFamily: 'var(--font-serif)' }}>
              Good morning, {profile.name || 'User'}
            </h1>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              borderRadius: '20px',
              backgroundColor: '#ecfdf5',
              color: '#059669',
              fontSize: '11px',
              fontWeight: '700'
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#059669' }}></span>
              FinMate Synced
            </span>
          </div>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
            Here is your live financial snapshot, budget alerts, and AI coaching insights for August 2026.
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={onOpenImportModal}
            className="btn btn-secondary"
            style={{
              padding: '9px 16px',
              fontSize: '13px',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Upload size={15} color="#005f41" />
            <span>Import Statement / CSV</span>
          </button>

          <button
            onClick={() => setActiveTab('nova')}
            className="btn btn-secondary"
            style={{
              padding: '9px 16px',
              fontSize: '13px',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <PlusCircle size={15} color="#dc2626" />
            <span>Log Expense</span>
          </button>

          <button
            onClick={() => setActiveTab('john')}
            className="btn btn-emerald"
            style={{
              padding: '9px 18px',
              fontSize: '13px',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Bot size={16} />
            <span>Chat with John AI</span>
          </button>
        </div>
      </div>

      {/* KPI Stat Cards Banner */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px'
      }}>
        {/* Card 1: Monthly Income */}
        <div className="card" style={{ padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Monthly Net Income
            </span>
            <div style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
              <TrendingUp size={16} />
            </div>
          </div>
          <div className="mono" style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', marginTop: '6px' }}>
            {currency}{income.toLocaleString()}
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
            Fixed bills: <span style={{ fontWeight: '600', color: '#0f172a' }}>{currency}{fixed.toLocaleString()}</span>
          </div>
        </div>

        {/* Card 2: Variable Spend */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              August Variable Spent
            </span>
            <div style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
              <CreditCard size={16} />
            </div>
          </div>
          <div className="mono" style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', marginTop: '6px' }}>
            {currency}{totalSpent.toLocaleString()}
          </div>
          <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '600' }}>
            <span>{budgetUtilization}% of monthly cap used</span>
          </div>
        </div>

        {/* Card 3: Free Cashflow Surplus */}
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Unallocated Surplus
            </span>
            <div style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
              <Zap size={16} />
            </div>
          </div>
          <div className="mono" style={{ fontSize: '24px', fontWeight: '800', color: '#005f41', marginTop: '6px' }}>
            {currency}{netSurplus.toLocaleString()}
          </div>
          <div style={{ fontSize: '11px', color: '#059669', marginTop: '4px', fontWeight: '600' }}>
            Ready for Atlas Goal Allocation
          </div>
        </div>

        {/* Card 4: Financial Health Score */}
        <div className="card" style={{ padding: '18px 20px', cursor: 'pointer' }} onClick={() => setActiveTab('health')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Health Diagnostic
            </span>
            <div style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
              <ShieldCheck size={16} />
            </div>
          </div>
          <div className="mono" style={{ fontSize: '24px', fontWeight: '800', color: '#059669', marginTop: '6px' }}>
            {profile.healthScore || 84}/100
          </div>
          <div style={{ fontSize: '11px', color: '#059669', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '600' }}>
            <span>Solid Financial Health</span>
            <ArrowRight size={12} />
          </div>
        </div>
      </div>

      {/* Proactive John AI Coach Spotlight Banner */}
      <div style={{
        padding: '20px 24px',
        backgroundColor: '#f0fdf4',
        border: '1px solid #bbf7d0',
        borderRadius: '14px',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        boxShadow: '0 4px 12px -2px rgba(0, 95, 65, 0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', maxWidth: '750px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '10px',
            backgroundColor: '#005f41',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            flexShrink: 0
          }}>
            <Bot size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#065f46', fontFamily: 'var(--font-serif)' }}>
                John Master AI Coach — Live Advice Feed
              </h3>
              <span className="badge badge-john" style={{ fontSize: '10px' }}>Active Synthesis</span>
            </div>
            <p style={{ fontSize: '13px', color: '#047857', marginTop: '4px', lineHeight: '1.5' }}>
              <strong>Sentinel Risk Detected:</strong> ₹12,000 Car Insurance premium is due on Sep 15th. 
              <strong> Iris advises:</strong> Trim Swiggy/Zomato orders from 18 to 6 orders this month to free up ₹3,800/mo and preserve your emergency fund.
            </p>
          </div>
        </div>

        <button
          onClick={() => setActiveTab('john')}
          className="btn btn-emerald"
          style={{ padding: '8px 16px', fontSize: '12px', fontWeight: '700', alignSelf: 'center' }}
        >
          <span>Ask John to Elaborate</span>
          <ArrowRight size={14} />
        </button>
      </div>

      {/* Main 2-Column Content Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
        
        {/* LEFT COLUMN: Recent Activity & Sentinel Upcoming Outlays */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Sentinel Upcoming Obligations Banner */}
          <div className="card" style={{ padding: '20px' }}>
            <div className="card-title" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={18} color="#7c3aed" />
                <span>Upcoming Obligations & Sentinel Radar</span>
              </div>
              <span className="mono" style={{ fontSize: '11px', color: '#7c3aed', backgroundColor: '#f5f3ff', padding: '3px 8px', borderRadius: '4px', fontWeight: '700' }}>
                Next 30 Days
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
              <div style={{
                padding: '12px 14px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <AlertTriangle size={18} color="#dc2626" />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#991b1b' }}>
                      Annual Car Insurance Renewal
                    </div>
                    <div style={{ fontSize: '11px', color: '#b91c1c' }}>
                      Due on September 15, 2026 (27 days remaining)
                    </div>
                  </div>
                </div>
                <div className="mono" style={{ fontSize: '14px', fontWeight: '800', color: '#991b1b' }}>
                  ₹12,000
                </div>
              </div>

              <div style={{
                padding: '12px 14px',
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>
                    Apartment Maintenance & Water Bill
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                    Due on September 1, 2026
                  </div>
                </div>
                <div className="mono" style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>
                  ₹3,200
                </div>
              </div>
            </div>
          </div>

          {/* Recent Ingested Transactions */}
          <div className="card" style={{ padding: '20px' }}>
            <div className="card-title" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CreditCard size={18} color="#005f41" />
                <span>Recent Transactions</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={onOpenImportModal}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#005f41',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Upload size={13} /> Import CSV
                </button>
                <span style={{ color: '#cbd5e1' }}>•</span>
                <button
                  onClick={() => setActiveTab('analyser')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748b',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  View All
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
              {TRANSACTIONS.slice(0, 5).map((tx) => (
                <div 
                  key={tx.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #f1f5f9'
                  }}
                >
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>
                      {tx.description}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', display: 'flex', gap: '6px' }}>
                      <span className="mono">{tx.date}</span>
                      <span>•</span>
                      <span style={{ color: '#005f41', fontWeight: '600' }}>{tx.category}</span>
                    </div>
                  </div>

                  <div className="mono" style={{
                    fontSize: '13px',
                    fontWeight: '700',
                    color: tx.type === 'credit' ? '#059669' : '#0f172a'
                  }}>
                    {tx.type === 'credit' ? '+' : '-'}{currency}{tx.amount.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: Nova Budget Progress & Atlas Wealth Goals */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Nova Category Caps Watchlist */}
          <div className="card" style={{ padding: '20px' }}>
            <div className="card-title" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={18} color="#dc2626" />
                <span>Nova Budget Guardian</span>
              </div>
              <button
                onClick={() => setActiveTab('nova')}
                style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
              >
                Manage Limits
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
              {activeBudgets.slice(0, 4).map((b, idx) => {
                const pct = b.percent || Math.round((b.spent / b.limit) * 100);
                const isOver = pct > 100;
                const isWarn = pct >= 80 && pct <= 100;
                return (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span style={{ fontWeight: '700', color: '#0f172a' }}>{b.category}</span>
                      <span className="mono" style={{ fontWeight: '700', color: isOver ? '#dc2626' : (isWarn ? '#d97706' : '#64748b') }}>
                        {currency}{b.spent.toLocaleString()} / {currency}{b.limit.toLocaleString()} ({pct}%)
                      </span>
                    </div>

                    <div className="progress-track" style={{ height: '6px' }}>
                      <div 
                        className="progress-fill" 
                        style={{ 
                          width: `${Math.min(100, pct)}%`,
                          backgroundColor: isOver ? '#dc2626' : (isWarn ? '#d97706' : '#059669')
                        }} 
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Atlas Wealth Goals Summary */}
          <div className="card" style={{ padding: '20px' }}>
            <div className="card-title" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Target size={18} color="#059669" />
                <span>Atlas Wealth Goals</span>
              </div>
              <button
                onClick={() => setActiveTab('atlas')}
                style={{ background: 'none', border: 'none', color: '#059669', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
              >
                + Add / Edit
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
              {activeGoals.map((g) => {
                const cur = g.current || g.saved_amount || 0;
                const tgt = g.target || g.target_amount || 100000;
                const pct = Math.min(100, Math.round((cur / tgt) * 100));

                return (
                  <div 
                    key={g.id || g.name}
                    style={{
                      padding: '12px',
                      backgroundColor: '#f8fafc',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>{g.name}</span>
                      <span className="mono" style={{ fontSize: '11px', fontWeight: '700', color: '#059669' }}>
                        {pct}% Completed
                      </span>
                    </div>

                    <div className="progress-track" style={{ height: '6px', marginTop: '8px' }}>
                      <div className="progress-fill" style={{ width: `${pct}%`, backgroundColor: '#059669' }} />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
                      <span className="mono">{currency}{cur.toLocaleString()} saved</span>
                      <span className="mono">Target: {currency}{tgt.toLocaleString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
