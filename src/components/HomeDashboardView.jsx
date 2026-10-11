import React, { useState, useEffect } from 'react';
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
  CreditCard,
  Info
} from 'lucide-react';
import { api } from '../services/api';

export default function HomeDashboardView({ 
  userProfile, 
  budgets = [], 
  goals = [], 
  transactions = [],
  setActiveTab, 
  onOpenImportModal 
}) {
  const profile = userProfile || {};
  const currency = profile.currency || '₹';
  const income = Number(profile.monthlyIncome || profile.monthly_income || 0);
  const fixed = Number(profile.fixedExpenses || profile.fixed_housing_expense || 0);
  
  const [upcomingBills, setUpcomingBills] = useState([]);

  useEffect(() => {
    async function fetchInsights() {
      try {
        const res = await api.get('/insights/sentinel');
        if (res && Array.isArray(res.bills)) {
          setUpcomingBills(res.bills);
        }
      } catch (err) {
        // No bills or offline
      }
    }
    fetchInsights();
  }, []);

  const activeBudgets = Array.isArray(budgets) ? budgets : [];
  const activeGoals = Array.isArray(goals) ? goals : [];
  const recentTransactions = Array.isArray(transactions) ? transactions : [];

  const totalSpent = activeBudgets.reduce((sum, b) => sum + (Number(b.spent) || 0), 0);
  const totalLimit = activeBudgets.reduce((sum, b) => sum + (Number(b.limit || b.monthly_cap) || 0), 0);
  const netSurplus = Math.max(0, income - fixed - totalSpent);
  const budgetUtilization = totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 100) : 0;

  // Warning or exceeded categories
  const warningBudgets = activeBudgets.filter(b => {
    const pct = b.percent != null ? b.percent : (b.limit ? (b.spent / b.limit) * 100 : 0);
    return pct >= 80;
  });

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
              FinMate Live
            </span>
          </div>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
            Here is your live financial snapshot, budget guardian status, and AI coaching pulse.
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
            <span>Manage Budgets</span>
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
              Category Spends
            </span>
            <div style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
              <CreditCard size={16} />
            </div>
          </div>
          <div className="mono" style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', marginTop: '6px' }}>
            {currency}{totalSpent.toLocaleString()}
          </div>
          <div style={{ fontSize: '11px', color: totalLimit > 0 ? (budgetUtilization > 100 ? '#dc2626' : (budgetUtilization >= 80 ? '#d97706' : '#059669')) : '#64748b', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '600' }}>
            <span>{totalLimit > 0 ? `${budgetUtilization}% of monthly cap used` : 'No category limits set'}</span>
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
            Available for Goal Funding & SIP
          </div>
        </div>

        {/* Card 4: Financial Health Score */}
        <div className="card" style={{ padding: '18px 20px', cursor: 'pointer' }} onClick={() => setActiveTab('health')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Health Score
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTab('health');
                }}
                title="Learn more about Health Score"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#059669'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#64748b'}
              >
                <Info size={14} />
              </button>
            </div>
            <div style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
              <ShieldCheck size={16} />
            </div>
          </div>
          <div className="mono" style={{ fontSize: '24px', fontWeight: '800', color: '#059669', marginTop: '6px' }}>
            {profile.healthScore || (income > 0 ? (netSurplus / income > 0.2 ? 84 : 72) : 75)}/100
          </div>
          <div style={{ fontSize: '11px', color: '#059669', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '600' }}>
            <span>Learn more about Health Score</span>
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
              {warningBudgets.length > 0 ? (
                <span>
                  <strong>Threshold Alert:</strong> <strong>{warningBudgets[0].category}</strong> has utilized {warningBudgets[0].percent || Math.round(((warningBudgets[0].spent || 0) / (warningBudgets[0].limit || 1)) * 100)}% of its allocated monthly cap. Click below to consult John for dynamic rebalancing.
                </span>
              ) : activeGoals.length > 0 ? (
                <span>
                  <strong>Goal Strategy Active:</strong> John and Atlas are monitoring {activeGoals.length} savings goal(s). With an unallocated cash surplus of {currency}{netSurplus.toLocaleString()}, your trajectory is on track.
                </span>
              ) : (
                <span>
                  <strong>Welcome to FinMate AI!</strong> Your deterministic tools and AI coach are standing by. Import a statement or set budget limits to receive real-time financial protection and coaching advice.
                </span>
              )}
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
              {upcomingBills.length > 0 ? (
                upcomingBills.map((bill, idx) => (
                  <div key={bill.id || idx} style={{
                    padding: '12px 14px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <AlertTriangle size={18} color="#7c3aed" />
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>
                          {bill.label}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>
                          Due date: {bill.due_date || 'Upcoming'}
                        </div>
                      </div>
                    </div>
                    <div className="mono" style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a' }}>
                      {currency}{Number(bill.amount || 0).toLocaleString()}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{
                  padding: '24px',
                  textAlign: 'center',
                  backgroundColor: '#f8fafc',
                  borderRadius: '8px',
                  border: '1px dashed #e2e8f0'
                }}>
                  <CheckCircle2 size={24} color="#059669" style={{ margin: '0 auto 8px auto' }} />
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>
                    No upcoming bill spikes detected
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    Sentinel monitors upcoming recurring outlays and flags cash flow risks before they occur.
                  </div>
                </div>
              )}
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
              {recentTransactions.length > 0 ? (
                recentTransactions.slice(0, 5).map((tx) => (
                  <div 
                    key={tx.id || `${tx.raw_description}-${tx.amount}`}
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
                        {tx.description || tx.raw_description}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', display: 'flex', gap: '6px' }}>
                        <span className="mono">{tx.date || tx.txn_date || 'Today'}</span>
                        <span>•</span>
                        <span style={{ color: '#005f41', fontWeight: '600' }}>{tx.category || 'General'}</span>
                      </div>
                    </div>

                    <div className="mono" style={{
                      fontSize: '13px',
                      fontWeight: '700',
                      color: tx.type === 'credit' ? '#059669' : '#0f172a'
                    }}>
                      {tx.type === 'credit' ? '+' : '-'}{currency}{Number(tx.amount || 0).toLocaleString()}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{
                  padding: '28px',
                  textAlign: 'center',
                  backgroundColor: '#f8fafc',
                  borderRadius: '8px',
                  border: '1px dashed #cbd5e1'
                }}>
                  <CreditCard size={28} color="#94a3b8" style={{ margin: '0 auto 8px auto' }} />
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>
                    No transactions recorded yet
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    Import a bank statement CSV or log an expense to begin automated categorization and budget tracking.
                  </div>
                  <button onClick={onOpenImportModal} className="btn btn-emerald btn-sm" style={{ marginTop: '12px' }}>
                    <Upload size={13} /> Import Statement CSV
                  </button>
                </div>
              )}
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
              {activeBudgets.length > 0 ? (
                activeBudgets.slice(0, 4).map((b, idx) => {
                  const spent = Number(b.spent || 0);
                  const limit = Number(b.limit || b.monthly_cap || 1);
                  const pct = b.percent != null ? b.percent : Math.round((spent / limit) * 100);
                  const isOver = pct > 100;
                  const isWarn = pct >= 80 && pct <= 100;
                  return (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span style={{ fontWeight: '700', color: '#0f172a' }}>{b.category}</span>
                        <span className="mono" style={{ fontWeight: '700', color: isOver ? '#dc2626' : (isWarn ? '#d97706' : '#64748b') }}>
                          {currency}{spent.toLocaleString()} / {currency}{limit.toLocaleString()} ({pct}%)
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
                })
              ) : (
                <div style={{
                  padding: '24px',
                  textAlign: 'center',
                  backgroundColor: '#f8fafc',
                  borderRadius: '8px',
                  border: '1px dashed #cbd5e1'
                }}>
                  <ShieldCheck size={28} color="#94a3b8" style={{ margin: '0 auto 8px auto' }} />
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>
                    No budget caps configured
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    Set category spending limits in Nova Budget Guardian to activate real-time threshold monitoring.
                  </div>
                  <button onClick={() => setActiveTab('nova')} className="btn btn-secondary btn-sm" style={{ marginTop: '12px' }}>
                    Configure Caps
                  </button>
                </div>
              )}
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
              {activeGoals.length > 0 ? (
                activeGoals.slice(0, 3).map((g) => {
                  const cur = Number(g.current || g.saved_amount || 0);
                  const tgt = Number(g.target || g.target_amount || 1);
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
                })
              ) : (
                <div style={{
                  padding: '24px',
                  textAlign: 'center',
                  backgroundColor: '#f8fafc',
                  borderRadius: '8px',
                  border: '1px dashed #cbd5e1'
                }}>
                  <Target size={28} color="#94a3b8" style={{ margin: '0 auto 8px auto' }} />
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>
                    No savings goals created
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    Create your first wealth milestone in Atlas Strategist or ask John to propose a goal.
                  </div>
                  <button onClick={() => setActiveTab('atlas')} className="btn btn-emerald btn-sm" style={{ marginTop: '12px' }}>
                    + Create Goal
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
