import React from 'react';
import { 
  LayoutGrid, 
  Bot, 
  Receipt, 
  Sparkles, 
  ShieldCheck, 
  Target, 
  Activity, 
  Plus, 
  Settings, 
  LogOut,
  ChevronRight
} from 'lucide-react';
import { AGENTS, USER_PROFILE } from '../data/mockFinancialData';

export default function Sidebar({ activeTab, setActiveTab, userProfile, onLogout }) {
  const profile = userProfile || USER_PROFILE;

  const navItems = [
    { id: 'john', label: 'John AI Coach', icon: Bot, color: '#059669' },
    { id: 'categorizer', label: 'Expense Categorizer', icon: Receipt, color: '#475569' },
    { id: 'iris', label: 'Spending Advisor', icon: Sparkles, color: '#d97706' },
    { id: 'nova', label: 'Budget Guardian', icon: ShieldCheck, color: '#dc2626' },
    { id: 'atlas', label: 'Saving Strategist', icon: Target, color: '#059669' },
    { id: 'health', label: 'Financial Health', icon: Activity, color: '#059669' },
    { id: 'settings', label: 'User Profile & Settings', icon: Settings, color: '#64748b' }
  ];

  return (
    <aside style={{
      width: '260px',
      backgroundColor: '#f8fafc',
      borderRight: '1px solid #e2e8f0',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      flexShrink: 0
    }}>
      {/* Brand Header */}
      <div style={{
        padding: '24px 20px 16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '10px',
          backgroundColor: '#005f41',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff'
        }}>
          <Sparkles size={20} />
        </div>
        <div>
          <div style={{ fontSize: '17px', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.02em', fontFamily: 'var(--font-serif)' }}>
            FinMate AI
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '500', fontFamily: 'var(--font-sans)' }}>
            FinHack Financial Mentor
          </div>
        </div>
      </div>

      {/* New Simulation Button */}
      <div style={{ padding: '0 20px 16px 20px' }}>
        <button 
          onClick={() => setActiveTab('john')}
          className="btn btn-emerald"
          style={{ width: '100%', justifyContent: 'center', padding: '10px 16px' }}
        >
          <Plus size={16} />
          <span>New Simulation</span>
        </button>
      </div>

      {/* Navigation Links */}
      <div style={{ padding: '0 12px', flex: 1, overflowY: 'auto' }}>
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
                  backgroundColor: isActive ? '#e2e8f0' : 'transparent',
                  border: '1px solid',
                  borderColor: isActive ? '#cbd5e1' : 'transparent',
                  color: isActive ? '#0f172a' : '#475569',
                  fontSize: '13px',
                  fontWeight: isActive ? '600' : '500',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all var(--transition-fast)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Icon size={18} color={isActive ? '#005f41' : '#64748b'} />
                  <span>{item.label}</span>
                </div>
                {isActive && (
                  <div style={{
                    width: '3px',
                    height: '16px',
                    borderRadius: '2px',
                    backgroundColor: '#005f41'
                  }} />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Profile Snippet & Logout */}
      <div style={{
        padding: '16px',
        borderTop: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#ffffff'
      }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', fontFamily: 'var(--font-serif)' }}>
            {profile.name}
          </div>
          <div className="mono" style={{ fontSize: '11px', color: '#64748b', fontFamily: 'var(--font-sans)' }}>
            Income: ₹{(profile?.monthlyIncome || 0).toLocaleString()}/mo
          </div>
        </div>

        <div style={{ display: 'flex', gap: '4px' }}>
          <button 
            onClick={() => setActiveTab('settings')}
            className="btn btn-ghost btn-sm"
            title="Edit Financial Inputs"
          >
            <Settings size={16} color="#64748b" />
          </button>
          
          <button 
            onClick={onLogout}
            className="btn btn-ghost btn-sm"
            title="Log Out & Return to FinHack Auth"
            style={{ color: '#dc2626' }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
