import React from 'react';
import { Bell, Sparkles, RefreshCw, Zap } from 'lucide-react';
import { USER_PROFILE, AGENTS } from '../data/mockFinancialData';

export default function Header({ activeTab, onSync }) {
  const getTabInfo = () => {
    switch (activeTab) {
      case 'john':
        return { title: 'John — AI Financial Coach', subtitle: 'Master orchestrator synthesizing predictions, spending habits, budgets, and savings goals', agent: AGENTS.john };
      case 'iris':
        return { title: 'Iris — Smart Spending Advisor', subtitle: 'Behavioral spending analyst isolating wasteful habits and food/subscription inflation', agent: AGENTS.iris };
      case 'atlas':
        return { title: 'Atlas — Saving Strategist', subtitle: 'Wealth planner managing liquidity goals, SIP investment engines, and asset timelines', agent: AGENTS.atlas };
      case 'nova':
        return { title: 'Nova — Real-Time Budget Guardian', subtitle: 'Active security sentinel enforcing spending caps, alerting on limit breaches', agent: AGENTS.nova };
      case 'analyser':
        return { title: 'Spending & Trend Analyser', subtitle: 'Interactive monthly and annual spending trend analysis fed into John Master Agent', agent: null };
      case 'health':
        return { title: 'Financial Health Scorecard', subtitle: 'Comprehensive financial wellness diagnostic across saving, spending, and planning', agent: null };
      case 'settings':
        return { title: 'Financial Profile & Settings', subtitle: 'User custom income, housing bills, and monthly category budget caps', agent: null };
      default:
        return { title: 'FinMate AI Dashboard', subtitle: 'Personalized AI financial command center', agent: AGENTS.john };
    }
  };

  const info = getTabInfo();

  return (
    <header className="content-header" style={{
      height: '64px',
      padding: '0 32px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottom: '1px solid #e2e8f0',
      backgroundColor: '#ffffff',
      position: 'sticky',
      top: 0,
      zIndex: 20
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h1 style={{ fontSize: '18px', fontWeight: '700', color: '#0f172a', fontFamily: 'var(--font-serif)' }}>
            {info.title}
          </h1>
          {info.agent && (
            <span className={`badge ${info.agent.badgeClass}`}>
              {info.agent.avatar} {info.agent.name}
            </span>
          )}
        </div>
        <p style={{ fontSize: '12px', color: '#64748b', marginTop: '2px', fontFamily: 'var(--font-sans)' }}>
          {info.subtitle}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button 
          onClick={onSync}
          className="btn btn-secondary btn-sm"
          title="Resync AI Agents"
        >
          <RefreshCw size={13} />
          <span>Resync Agents</span>
        </button>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 'var(--radius-sm)'
        }}>
          <Zap size={14} color="#059669" />
          <span style={{ fontSize: '12px', color: '#475569', fontFamily: 'var(--font-sans)' }}>Health Score:</span>
          <span className="mono" style={{ fontSize: '13px', fontWeight: '700', color: '#059669', fontFamily: 'var(--font-serif)' }}>
            {USER_PROFILE.healthScore}/100
          </span>
        </div>
      </div>
    </header>
  );
}
