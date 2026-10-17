import React from 'react';
import { RefreshCw, Zap } from 'lucide-react';
import NotificationBell from './NotificationBell';

export default function Header({ activeTab, onSync, onNavigateToWorkspace, onExplainAlert, userProfile }) {
  const getTabInfo = () => {
    switch (activeTab) {
      case 'john':
        return { title: 'John — Financial Coach' };
      case 'sentinel':
        return { title: 'Sentinel — Financial Observer' };
      case 'nova':
        return { title: 'Nova — Budget Guardian' };
      case 'atlas':
        return { title: 'Atlas — Savings Strategist' };
      case 'iris':
        return { title: 'Iris — Spending Advisor' };
      case 'settings':
        return { title: 'Profile & Settings' };
      default:
        return { title: 'FinMate AI Workspaces' };
    }
  };

  const info = getTabInfo();

  return (
    <header className="content-header" style={{
      height: '56px',
      padding: '0 28px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottom: '1px solid var(--border-color)',
      backgroundColor: 'var(--bg-card)',
      position: 'sticky',
      top: 0,
      zIndex: 20
    }}>
      <div>
        <h1 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'var(--font-serif)', margin: 0 }}>
          {info.title}
        </h1>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <NotificationBell onNavigateToWorkspace={onNavigateToWorkspace} onExplainAlert={onExplainAlert} />

        {onSync && (
          <button 
            onClick={onSync}
            className="btn btn-secondary btn-sm"
            title="Refresh Workspaces"
          >
            <RefreshCw size={13} />
            <span>Refresh</span>
          </button>
        )}

        {userProfile?.healthScore != null && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-sm)'
          }}>
            <Zap size={14} color="var(--accent-emerald)" />
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}>Health:</span>
            <span className="mono" style={{ fontSize: '13px', fontWeight: '700', color: 'var(--accent-emerald)', fontFamily: 'var(--font-serif)' }}>
              {userProfile.healthScore}/100
            </span>
          </div>
        )}
      </div>
    </header>
  );
}

