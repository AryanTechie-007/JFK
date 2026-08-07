import React, { useState } from 'react';
import { 
  ShieldAlert, 
  AlertOctagon, 
  CheckCircle2, 
  BellRing, 
  Plus, 
  Zap, 
  Clock,
  ShieldCheck
} from 'lucide-react';
import { TRANSACTIONS, AGENTS } from '../data/mockFinancialData';

export default function NovaGuardianView({ budgets, setBudgets, userProfile, setUserProfile }) {
  const [recentTxs, setRecentTxs] = useState(TRANSACTIONS);

  // New Quick Transaction logger state
  const [newDesc, setNewDesc] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCat, setNewCat] = useState('Food & Dining');

  const handleAddTransaction = (e) => {
    e.preventDefault();
    if (!newDesc || !newAmount) return;

    const amt = Number(newAmount);
    const newTx = {
      id: `tx-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      description: newDesc,
      amount: amt,
      category: newCat,
      merchant: newDesc.split(' ')[0],
      type: 'debit'
    };

    setRecentTxs([newTx, ...recentTxs]);

    // Update total spent & surplus in user profile dynamically
    if (setUserProfile) {
      setUserProfile(prev => {
        const newSpent = prev.totalSpentThisMonth + amt;
        const newSurplus = prev.monthlyIncome - newSpent;
        const newRate = Number(((newSurplus / prev.monthlyIncome) * 100).toFixed(1));
        return {
          ...prev,
          totalSpentThisMonth: newSpent,
          currentSavings: newSurplus,
          savingsRate: newRate
        };
      });
    }

    // Update budget category progress dynamically
    setBudgets(prev => prev.map(b => {
      if (b.category === newCat) {
        const newSpent = b.spent + amt;
        const newPct = Math.round((newSpent / b.limit) * 100);
        let newStatus = 'normal';
        if (newPct >= 100) newStatus = 'exceeded';
        else if (newPct >= 85) newStatus = 'warning';
        return { ...b, spent: newSpent, percent: newPct, status: newStatus };
      }
      return b;
    }));

    setNewDesc('');
    setNewAmount('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Title Header */}
      <div>
        <h1 style={{ fontSize: '32px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.02em' }}>
          Real-Time Budget Guardian
        </h1>
        <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>
          Nova streams transaction logs live and enforces category thresholds to protect cash flow surplus.
        </p>
      </div>

      {/* Grid: Category Limit Gauges + Transaction Stream & Alert System */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '24px' }}>
        
        {/* Left Column: Real-Time Budget Progress Meters */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card-title">
            <ShieldCheck size={18} color="#059669" />
            <span>Category Spending Thresholds & Limits</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {budgets.map((b, idx) => {
              const isExceeded = b.percent > 100;
              const isWarning = b.percent >= 85 && b.percent <= 100;
              return (
                <div 
                  key={idx}
                  style={{
                    padding: '16px',
                    backgroundColor: '#ffffff',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid',
                    borderColor: isExceeded ? '#fecaca' : isWarning ? '#fde68a' : '#e2e8f0'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>
                        {b.category}
                      </span>
                      {isExceeded && <span className="badge badge-nova">LIMIT EXCEEDED</span>}
                      {isWarning && <span className="badge badge-iris">APPROACHING LIMIT</span>}
                    </div>

                    <span className="mono" style={{
                      fontSize: '13px',
                      fontWeight: '700',
                      color: isExceeded ? '#dc2626' : isWarning ? '#d97706' : '#059669'
                    }}>
                      {b.percent}%
                    </span>
                  </div>

                  <div className="progress-track" style={{ height: '8px', marginTop: '10px' }}>
                    <div 
                      className="progress-fill" 
                      style={{ 
                        width: `${Math.min(100, b.percent)}%`, 
                        backgroundColor: isExceeded ? '#dc2626' : isWarning ? '#d97706' : '#059669' 
                      }} 
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '8px' }}>
                    <span style={{ color: '#64748b' }}>
                      Spent: <strong className="mono" style={{ color: '#0f172a' }}>₹{b.spent.toLocaleString()}</strong>
                    </span>
                    <span style={{ color: '#64748b' }}>
                      Limit: <strong className="mono" style={{ color: '#0f172a' }}>₹{b.limit.toLocaleString()}</strong>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Quick Expense Logger & Nova Stream */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Quick Expense Logger */}
          <div className="card">
            <div className="card-title">
              <Plus size={16} color="#059669" />
              <span>Log User Expense Input</span>
            </div>
            
            <form onSubmit={handleAddTransaction} style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input
                type="text"
                className="input"
                placeholder="Merchant / Expense Description (e.g. Swiggy Gourmet)"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                required
              />
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <input
                  type="number"
                  className="input"
                  placeholder="Amount (₹)"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  required
                />
                
                <select 
                  className="input" 
                  value={newCat} 
                  onChange={(e) => setNewCat(e.target.value)}
                >
                  <option value="Food & Dining">Food & Dining</option>
                  <option value="Shopping & Lifestyle">Shopping</option>
                  <option value="Subscriptions">Subscriptions</option>
                  <option value="Transport">Transport</option>
                  <option value="Bills & Utilities">Bills</option>
                </select>
              </div>

              <button type="submit" className="btn btn-emerald btn-sm" style={{ marginTop: '4px' }}>
                <Zap size={14} />
                <span>Log Expense & Check Nova</span>
              </button>
            </form>
          </div>

          {/* Streamed Log */}
          <div className="card" style={{ flex: 1 }}>
            <div className="card-title" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={16} color="#64748b" />
                <span>Streamed Transactions</span>
              </div>
              <span className="mono" style={{ fontSize: '11px', color: '#64748b' }}>
                {recentTxs.length} Logged
              </span>
            </div>

            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
              {recentTxs.slice(0, 6).map((tx) => (
                <div 
                  key={tx.id}
                  style={{
                    padding: '8px 10px',
                    backgroundColor: '#f8fafc',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '12px'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: '600', color: '#0f172a' }}>{tx.merchant}</div>
                    <div style={{ fontSize: '10px', color: '#64748b' }}>{tx.category} • {tx.date}</div>
                  </div>
                  <span className="mono" style={{ fontWeight: '600', color: tx.type === 'credit' ? '#059669' : '#dc2626' }}>
                    {tx.type === 'credit' ? '+' : '-'}₹{tx.amount.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
