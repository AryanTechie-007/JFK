import React from 'react';
import { 
  Activity, 
  ShieldCheck, 
  Award, 
  Sparkles, 
  TrendingUp, 
  CheckCircle2, 
  ArrowUpRight 
} from 'lucide-react';
import { USER_PROFILE, AGENTS } from '../data/mockFinancialData';

export default function FinancialHealthView({ userProfile }) {
  const profile = userProfile || USER_PROFILE;
  const breakdown = profile.scoreBreakdown || { savingBehavior: 88, budgetDiscipline: 78, spendingControl: 82, futurePlanning: 88 };

  const timelineSteps = [
    { title: 'Started Financial Journey', date: 'Jan 2026', status: 'Completed', detail: 'Connected bank feeds & initialized John AI Master Agent.' },
    { title: 'Habit Leak Identified', date: 'Mar 2026', status: 'Completed', detail: 'Iris detected ₹5,000/mo spike in Swiggy food delivery.' },
    { title: 'Emergency Liquidity Vault Created', date: 'May 2026', status: 'Completed', detail: 'Atlas configured automatic ₹10,000 SIP into liquid funds.' },
    { title: 'Current Status (Aug 2026)', date: 'Aug 2026', status: 'Active', detail: 'Score at 84/100. Preparing for Sentinel Sep Insurance bill.' },
    { title: 'Full Safety Reserve Milestone', date: 'Dec 2026', status: 'Target', detail: 'On track to reach ₹1,20,000 Emergency Reserve Target.' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Light Header Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '32px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.02em', fontFamily: 'var(--font-serif)' }}>
              Financial Wellness Scorecard
            </h1>
            <span className="badge badge-atlas">Audited by John & Atlas</span>
          </div>
          <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
            Comprehensive multi-dimensional health audit across cash flow liquidity, habit control, and risk reserves.
          </p>
        </div>

        <div style={{
          padding: '12px 24px',
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 'var(--radius-md)'
        }}>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', fontFamily: 'var(--font-sans)' }}>Overall Health Rating</div>
          <div className="mono" style={{ fontSize: '28px', fontWeight: '700', color: '#059669', fontFamily: 'var(--font-serif)' }}>
            {profile.healthScore || 84} <span style={{ fontSize: '14px', color: '#64748b' }}>/ 100</span>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        
        {/* Metric Diagnostics */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <div className="card">
            <div className="card-title" style={{ justifyContent: 'space-between' }}>
              <span>Saving Behavior (Atlas)</span>
              <span className="mono" style={{ fontSize: '16px', color: '#059669', fontWeight: '700' }}>
                {breakdown.savingBehavior}/100
              </span>
            </div>
            <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
              Saving {profile.savingsRate || 27.7}% of gross income (₹{(profile.currentSavings || 20800).toLocaleString()}/mo). Atlas benchmark recommendation is 30%.
            </p>
            <div className="progress-track" style={{ height: '8px', marginTop: '10px' }}>
              <div className="progress-fill" style={{ width: `${breakdown.savingBehavior}%`, backgroundColor: '#059669' }} />
            </div>
          </div>

          <div className="card">
            <div className="card-title" style={{ justifyContent: 'space-between' }}>
              <span>Budget Discipline (Nova)</span>
              <span className="mono" style={{ fontSize: '16px', color: '#d97706', fontWeight: '700' }}>
                {breakdown.budgetDiscipline}/100
              </span>
            </div>
            <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
              4 out of 5 category limits respected. Subscriptions limit breached by 16%.
            </p>
            <div className="progress-track" style={{ height: '8px', marginTop: '10px' }}>
              <div className="progress-fill" style={{ width: `${breakdown.budgetDiscipline}%`, backgroundColor: '#d97706' }} />
            </div>
          </div>

          <div className="card">
            <div className="card-title" style={{ justifyContent: 'space-between' }}>
              <span>Spending Control (Iris)</span>
              <span className="mono" style={{ fontSize: '16px', color: '#2563eb', fontWeight: '700' }}>
                {breakdown.spendingControl}/100
              </span>
            </div>
            <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
              Iris isolated ₹3,800/mo potential savings in food ordering. Trimming will boost score to 90+.
            </p>
            <div className="progress-track" style={{ height: '8px', marginTop: '10px' }}>
              <div className="progress-fill" style={{ width: `${breakdown.spendingControl}%`, backgroundColor: '#2563eb' }} />
            </div>
          </div>

          <div className="card">
            <div className="card-title" style={{ justifyContent: 'space-between' }}>
              <span>Future Planning (Sentinel)</span>
              <span className="mono" style={{ fontSize: '16px', color: '#7c3aed', fontWeight: '700' }}>
                {breakdown.futurePlanning}/100
              </span>
            </div>
            <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
              Sentinel time-series forecasting active. Upcoming September insurance risk flagged in advance.
            </p>
            <div className="progress-track" style={{ height: '8px', marginTop: '10px' }}>
              <div className="progress-fill" style={{ width: `${breakdown.futurePlanning}%`, backgroundColor: '#7c3aed' }} />
            </div>
          </div>

        </div>

        {/* Financial Evolution Timeline */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card-title">
            <Award size={18} color="#059669" />
            <span>Your Financial Evolution Timeline</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '10px' }}>
            {timelineSteps.map((step, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '14px', position: 'relative' }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  backgroundColor: step.status === 'Completed' ? '#d1fae5' : step.status === 'Active' ? '#f1f5f9' : '#ffffff',
                  border: `2px solid ${step.status === 'Completed' ? '#059669' : step.status === 'Active' ? '#2563eb' : '#cbd5e1'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  flexShrink: 0
                }}>
                  {step.status === 'Completed' ? '✓' : step.status === 'Active' ? '⚡' : '🎯'}
                </div>

                <div style={{ flex: 1, paddingBottom: idx === timelineSteps.length - 1 ? 0 : '16px', borderBottom: idx === timelineSteps.length - 1 ? 'none' : '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', fontFamily: 'var(--font-serif)' }}>
                      {step.title}
                    </span>
                    <span className="mono" style={{ fontSize: '11px', color: '#64748b', fontFamily: 'var(--font-sans)' }}>
                      {step.date}
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: '#475569', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
                    {step.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
