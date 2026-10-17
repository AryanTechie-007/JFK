import React from 'react';
import { 
  Bot, 
  Activity, 
  ShieldCheck, 
  Target, 
  Compass, 
  Settings, 
  LogOut,
  Sparkles,
  CreditCard
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, userProfile, onLogout }) {
  const profile = userProfile || {};

  // Five canonical workspaces per SC §18 / D-025
  const navItems = [
    { id: 'john', label: 'John (Coach)', role: 'Master Coach', icon: Bot, color: '#059669' },
    { id: 'sentinel', label: 'Sentinel', role: 'Observer', icon: Activity, color: '#2563EB' },
    { id: 'nova', label: 'Nova', role: 'Budget Guardian', icon: ShieldCheck, color: '#dc2626' },
    { id: 'atlas', label: 'Atlas', role: 'Savings Strategist', icon: Target, color: '#d97706' },
    { id: 'iris', label: 'Iris', role: 'Spending Advisor', icon: Compass, color: '#8b5cf6' },
  ];

  return (
    <aside style={{
      width: '260px',
      backgroundColor: 'var(--bg-sidebar)',
      borderRight: '1px solid var(--border-color)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      flexShrink: 0
    }}>
      {/* Brand Header */}
      <div style={{
        padding: '24px 20px 20px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '10px',
          backgroundColor: 'var(--accent-emerald)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff'
        }}>
          <Sparkles size={20} />
        </div>
        <div>
          <div style={{ fontSize: '17px', fontWeight: '700', color: 'var(--text-primary)', letterSpacing: '-0.02em', fontFamily: 'var(--font-serif)' }}>
            FinMate AI
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500', fontFamily: 'var(--font-sans)' }}>
            5 Autonomous Workspaces
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <div style={{ padding: '0 12px', flex: 1, overflowY: 'auto' }}>
        <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', padding: '0 10px 8px', fontWeight: '600' }}>
          Workspaces
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: isActive ? 'var(--bg-tertiary)' : 'transparent',
                  border: '1px solid',
                  borderColor: isActive ? 'var(--border-focus)' : 'transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontSize: '13px',
                  fontWeight: isActive ? '600' : '500',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all var(--transition-fast)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Icon size={18} color={isActive ? item.color : 'var(--text-muted)'} />
                  <div>
                    <div>{item.label}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 'normal' }}>{item.role}</div>
                  </div>
                </div>
                {isActive && (
                  <div style={{
                    width: '3px',
                    height: '16px',
                    borderRadius: '2px',
                    backgroundColor: item.color
                  }} />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Profile Snippet & Settings */}
      <div style={{
        padding: '16px',
        borderTop: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'var(--bg-card)'
      }}>
        <div 
          onClick={() => setActiveTab('settings')}
          style={{ cursor: 'pointer', flex: 1 }}
        >
          <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'var(--font-serif)' }}>
            {profile.name || profile.display_name || 'Account Holder'}
          </div>
          <div className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)' }}>
            {profile.declared_income_minor != null ? `Income: ₹${(profile.declared_income_minor / 100).toLocaleString()}/mo` : 'Settings & Preferences'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '4px' }}>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`btn btn-ghost btn-sm ${activeTab === 'settings' ? 'active' : ''}`}
            title="Profile & Settings"
          >
            <Settings size={16} color="var(--text-muted)" />
          </button>
          
          <button 
            onClick={onLogout}
            className="btn btn-ghost btn-sm"
            title="Sign Out"
            style={{ color: '#dc2626' }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
