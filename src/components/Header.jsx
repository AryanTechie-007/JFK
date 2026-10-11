import React from 'react';
import { Bell, Sparkles, RefreshCw, Zap } from 'lucide-react';
import { AGENTS } from '../data/mockFinancialData';

export default function Header({ activeTab, onSync, onOpenImportModal, userProfile }) {
  const getTabInfo = () => {
    switch (activeTab) {
      case 'home':
        return { title: 'Home Overview' };
      case 'subscriptions':
        return { title: 'Subscriptions' };
      case 'john':
        return { title: 'Financial Coach' };
      case 'iris':
        return { title: 'Smart Spending Advisor' };
      case 'atlas':
        return { title: 'Saving Strategist' };
      case 'nova':
        return { title: 'Budget Guardian' };
      case 'analyser':
        return { title: 'Spending & Trend Analyser' };
      case 'health':
        return { title: 'Financial Health Scorecard' };
      case 'settings':
        return { title: 'Profile & Settings' };
      default:
        return { title: 'Command Center' };
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
        {onOpenImportModal && (
          <button 
            onClick={onOpenImportModal}
            className="btn btn-secondary btn-sm"
            style={{ color: 'var(--accent-emerald)', fontWeight: '700' }}
            title="Import Bank Statement or CSV"
          >
            <span>+ Import CSV</span>
          </button>
        )}

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
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-sm)'
        }}>
          <Zap size={14} color="var(--accent-emerald)" />
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}>Health Score:</span>
          <span className="mono" style={{ fontSize: '13px', fontWeight: '700', color: 'var(--accent-emerald)', fontFamily: 'var(--font-serif)' }}>
            {userProfile?.healthScore || 75}/100
          </span>
        </div>
      </div>
    </header>
  );
}
