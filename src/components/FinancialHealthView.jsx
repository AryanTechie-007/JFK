import React, { useEffect, useState } from 'react';
import { 
  Activity, 
  ShieldCheck, 
  Award, 
  Sparkles, 
  TrendingUp, 
  CheckCircle2, 
  ArrowUpRight 
} from 'lucide-react';
import { AGENTS } from '../data/mockFinancialData';
import { profileService } from '../services/profileService';

export default function FinancialHealthView({ userProfile }) {
  const [healthData, setHealthData] = useState(null);

  useEffect(() => {
    async function fetchHealth() {
      try {
        const res = await profileService.getFinancialHealth();
        if (res.success && res.health) {
          setHealthData(res.health);
        }
      } catch (err) {
        console.warn('Backend health API offline, using profile state.');
      }
    }
    fetchHealth();
  }, []);

  const healthScore = healthData?.score || userProfile?.healthScore || 80;
  const breakdown = healthData?.scoreBreakdown || userProfile?.scoreBreakdown || { 
    savingBehavior: 80, 
    budgetDiscipline: 78, 
    spendingControl: 82, 
    futurePlanning: 85 
  };

  const timelineSteps = [
    { title: 'Account Onboarding & Setup', date: 'Recent', status: 'Completed', detail: `Registered user ${userProfile?.name || ''}. Initialized John AI Master Coach.` },
    { title: 'Habit & Budget Auditing', date: 'Active', status: 'Completed', detail: 'Iris and Nova actively auditing spending streams.' },
    { title: 'Goal & Strategy Setup', date: 'Active', status: 'Completed', detail: 'Atlas configured goal tracking pathways.' },
    { title: 'Current Wellness Status', date: 'Now', status: 'Active', detail: `Current Health Score: ${healthScore}/100.` },
    { title: 'Full Reserve Target', date: 'Upcoming', status: 'Target', detail: 'On track to reach primary financial goal target.' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Light Header Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '32px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.02em', fontFamily: 'var(--font-serif)' }}>
              Financial Health Scorecard
            </h1>
            <span className="badge badge-atlas">Audited by John & Atlas</span>
          </div>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
            Comprehensive multi-dimensional health audit across cash flow liquidity, habit control, and risk reserves.
          </p>
        </div>

        <div style={{
          padding: '12px 24px',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)'
        }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '600', fontFamily: 'var(--font-sans)' }}>Overall Health Score</div>
          <div className="mono" style={{ fontSize: '28px', fontWeight: '700', color: '#059669', fontFamily: 'var(--font-serif)' }}>
            {healthScore} <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>/ 100</span>
          </div>
        </div>
      </div>

      {/* How Health Score is Calculated Explanation Banner */}
      <div className="card" style={{ padding: '24px', backgroundColor: 'var(--agent-john-glow)', border: '1px solid var(--border-color)' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '800', color: 'var(--accent-emerald)', marginBottom: '8px' }}>
          What is Your Financial Health Score & How is it Calculated?
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '14px' }}>
          Your Financial Health Score is an automated 0–100 index that measures your fiscal resilience, liquidity buffer, and monthly cash flow sustainability. It combines 4 weighted financial pillars derived directly from your numbers:
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          <div style={{ padding: '12px', backgroundColor: 'var(--bg-card)', borderRadius: '8px', border: '1px solid #dcfce7' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>1. Saving Behavior (35%)</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Measures percentage of gross income retained after fixed and variable outlays (Target: &ge;25%).
            </div>
          </div>

          <div style={{ padding: '12px', backgroundColor: 'var(--bg-card)', borderRadius: '8px', border: '1px solid #dcfce7' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>2. Budget Discipline (25%)</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Tracks adherence to category caps set in Nova Budget Guardian, penalizing recurring overages.
            </div>
          </div>

          <div style={{ padding: '12px', backgroundColor: 'var(--bg-card)', borderRadius: '8px', border: '1px solid #dcfce7' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>3. Spending Control (20%)</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Evaluates discretionary spending velocity and subscription commitments relative to earnings.
            </div>
          </div>

          <div style={{ padding: '12px', backgroundColor: 'var(--bg-card)', borderRadius: '8px', border: '1px solid #dcfce7' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>4. Future Planning (20%)</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              Monitors progress towards your Atlas savings goals and readiness for upcoming obligations.
            </div>
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
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
              Saving {userProfile?.savingsRate || 27.7}% of gross income (₹{(userProfile?.currentSavings || 20800).toLocaleString()}/mo). Atlas benchmark recommendation is 30%.
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
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
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
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
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
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
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
                  {step.status === 'Completed' ? '✓' : step.status === 'Active' ? '' : ''}
                </div>

                <div style={{ flex: 1, paddingBottom: idx === timelineSteps.length - 1 ? 0 : '16px', borderBottom: idx === timelineSteps.length - 1 ? 'none' : '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'var(--font-serif)' }}>
                      {step.title}
                    </span>
                    <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>
                      {step.date}
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
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
