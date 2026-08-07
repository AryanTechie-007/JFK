import React, { useState } from 'react';
import { 
  Target, 
  ShieldCheck, 
  Plus, 
  TrendingUp, 
  Calendar, 
  Sparkles,
  ArrowRight,
  Laptop,
  Plane,
  Shield,
  Edit,
  DollarSign,
  Trash2
} from 'lucide-react';
import { USER_PROFILE, AGENTS } from '../data/mockFinancialData';

export default function AtlasStrategistView({ goals, setGoals }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);

  // New goal inputs
  const [newGoalName, setNewGoalName] = useState('');
  const [newGoalTarget, setNewGoalTarget] = useState('');
  const [newGoalAdd, setNewGoalAdd] = useState('');

  // Edit goal inputs
  const [editName, setEditName] = useState('');
  const [editCurrent, setEditCurrent] = useState('');
  const [editTarget, setEditTarget] = useState('');
  const [addFundsAmount, setAddFundsAmount] = useState('');
  const [editPriority, setEditPriority] = useState('MEDIUM PRIORITY');

  const [isCommitted, setIsCommitted] = useState(false);

  const getIcon = (type) => {
    switch (type) {
      case 'shield': return <Shield size={18} />;
      case 'laptop': return <Laptop size={18} />;
      case 'plane': return <Plane size={18} />;
      default: return <Target size={18} />;
    }
  };

  const handleOpenEdit = (goal) => {
    setEditingGoal(goal);
    setEditName(goal.name);
    setEditCurrent(goal.current);
    setEditTarget(goal.target);
    setEditPriority(goal.priority || 'MEDIUM PRIORITY');
    setAddFundsAmount('');
  };

  const handleSaveEdit = (e) => {
    e.preventDefault();
    if (!editingGoal) return;

    const extraMoney = Number(addFundsAmount) || 0;
    const finalCurrent = Number(editCurrent) + extraMoney;

    setGoals(prev => prev.map(g => {
      if (g.id === editingGoal.id) {
        return {
          ...g,
          name: editName,
          current: finalCurrent,
          target: Number(editTarget),
          priority: editPriority
        };
      }
      return g;
    }));

    setEditingGoal(null);
  };

  const handleDeleteGoal = (goalId) => {
    setGoals(prev => prev.filter(g => g.id !== goalId));
    setEditingGoal(null);
  };

  const handleAddGoal = (e) => {
    e.preventDefault();
    if (!newGoalName || !newGoalTarget) return;

    const newGoal = {
      id: `goal-${Date.now()}`,
      name: newGoalName,
      priority: 'MEDIUM PRIORITY',
      current: 0,
      target: Number(newGoalTarget),
      targetDate: 'Expected by Dec 2026',
      iconType: 'target',
      monthlyAdd: Number(newGoalAdd) || 3000
    };

    setGoals([newGoal, ...goals]);
    setNewGoalName('');
    setNewGoalTarget('');
    setNewGoalAdd('');
    setShowAddModal(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Title Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.02em', fontFamily: 'var(--font-serif)' }}>
            Goal Planning
          </h1>
          <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
            Your AI mentor has structured a plan to achieve your financial objectives efficiently. Add money or edit goals anytime.
          </p>
        </div>

        <button 
          onClick={() => setShowAddModal(true)}
          className="btn btn-emerald"
        >
          <Plus size={16} />
          <span>New Goal</span>
        </button>
      </div>

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px' }}>
        
        {/* Left Column: All Goals with Edit / Add Funds Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
            {goals.map((g) => {
              const pct = Math.min(100, Math.round((g.current / g.target) * 100));
              const isHigh = g.priority === 'HIGH PRIORITY';
              return (
                <div key={g.id} className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', fontFamily: 'var(--font-sans)', letterSpacing: '0.05em' }}>
                        {g.priority || 'SAVINGS GOAL'}
                      </span>
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        backgroundColor: isHigh ? '#d1fae5' : '#f1f5f9',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isHigh ? '#059669' : '#475569'
                      }}>
                        {getIcon(g.iconType)}
                      </div>
                    </div>

                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', marginTop: '10px', fontFamily: 'var(--font-serif)' }}>
                      {g.name}
                    </div>

                    <div style={{ marginTop: '14px', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                      <span className="mono" style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', fontFamily: 'var(--font-serif)' }}>
                        ₹{g.current.toLocaleString()}
                      </span>
                      <span className="mono" style={{ fontSize: '12px', color: '#64748b', fontFamily: 'var(--font-serif)' }}>
                        / ₹{g.target.toLocaleString()}
                      </span>
                    </div>

                    <div className="progress-track" style={{ height: '8px', marginTop: '10px' }}>
                      <div 
                        className="progress-fill" 
                        style={{ 
                          width: `${pct}%`, 
                          backgroundColor: isHigh ? '#059669' : '#475569' 
                        }} 
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: isHigh ? '#059669' : '#64748b', fontWeight: '600', fontFamily: 'var(--font-sans)' }}>
                      {isHigh ? <TrendingUp size={14} /> : <Calendar size={14} />}
                      <span>{g.targetDate}</span>
                    </div>

                    <button 
                      onClick={() => handleOpenEdit(g)}
                      className="btn btn-secondary btn-sm"
                      style={{ padding: '4px 10px', fontSize: '11px' }}
                    >
                      <Edit size={12} />
                      <span>Edit & Add Money</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

        </div>

        {/* Right Column: AI GENERATED PLAN Panel */}
        <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={16} color="#059669" />
            <span style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-sans)' }}>
              AI GENERATED PLAN
            </span>
          </div>

          <div>
            <div style={{ fontSize: '13px', color: '#64748b', fontFamily: 'var(--font-sans)' }}>Monthly Recommendation</div>
            <div style={{
              marginTop: '10px',
              padding: '16px',
              backgroundColor: '#f8fafc',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: '#475569' }}>Save</span>
                <span className="mono" style={{ fontSize: '18px', fontWeight: '700', color: '#059669', fontFamily: 'var(--font-serif)' }}>₹15,000</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
                <span style={{ fontSize: '13px', color: '#475569' }}>Invest</span>
                <span className="mono" style={{ fontSize: '18px', fontWeight: '700', color: '#059669', fontFamily: 'var(--font-serif)' }}>₹5,000</span>
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '8px', fontFamily: 'var(--font-sans)' }}>Goal Completion Forecast</div>
            
            <div style={{
              padding: '16px',
              backgroundColor: '#d1fae5',
              borderRadius: '12px',
              border: '1px solid #a7f3d0'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#065f46', fontWeight: '700', fontSize: '14px', fontFamily: 'var(--font-serif)' }}>
                <Sparkles size={16} />
                <span>8 months earlier</span>
              </div>
              <p style={{ fontSize: '12px', color: '#047857', marginTop: '6px', lineHeight: '1.5', fontFamily: 'var(--font-sans)' }}>
                By following this plan, you will reach your Emergency Fund goal ahead of schedule.
              </p>
            </div>
          </div>

          <button 
            onClick={() => setIsCommitted(true)}
            className="btn btn-black"
            style={{ width: '100%', padding: '12px', marginTop: 'auto', justifyContent: 'center' }}
          >
            {isCommitted ? '✓ Plan Committed' : 'Commit to Plan'}
          </button>
        </div>

      </div>

      {/* Edit Goal / Add Funds Modal */}
      {editingGoal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100
        }}>
          <div className="card" style={{ width: '440px', backgroundColor: '#ffffff' }}>
            <div className="card-title" style={{ justifyContent: 'space-between', marginBottom: '16px' }}>
              <span>Edit Goal & Add Money</span>
              <button onClick={() => setEditingGoal(null)} className="btn btn-ghost btn-sm">✕</button>
            </div>

            <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              <div>
                <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', marginBottom: '4px', display: 'block' }}>
                  Goal Name
                </label>
                <input
                  type="text"
                  className="input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>

              {/* Add Money Input */}
              <div style={{
                padding: '14px',
                backgroundColor: '#d1fae5',
                borderRadius: '8px',
                border: '1px solid #a7f3d0'
              }}>
                <label style={{ fontSize: '12px', color: '#065f46', fontWeight: '700', marginBottom: '4px', display: 'block' }}>
                  + Add Extra Money to Goal (₹)
                </label>
                <input
                  type="number"
                  className="input"
                  placeholder="e.g. 5000"
                  value={addFundsAmount}
                  onChange={(e) => setAddFundsAmount(e.target.value)}
                />
                <div style={{ fontSize: '11px', color: '#047857', marginTop: '4px' }}>
                  Current Saved: <strong>₹{Number(editCurrent).toLocaleString()}</strong> → New Total: <strong>₹{(Number(editCurrent) + (Number(addFundsAmount) || 0)).toLocaleString()}</strong>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', display: 'block' }}>
                    Direct Saved Base (₹)
                  </label>
                  <input
                    type="number"
                    className="input"
                    value={editCurrent}
                    onChange={(e) => setEditCurrent(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', display: 'block' }}>
                    Target Amount (₹)
                  </label>
                  <input
                    type="number"
                    className="input"
                    value={editTarget}
                    onChange={(e) => setEditTarget(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', display: 'block' }}>
                  Priority Level
                </label>
                <select
                  className="input"
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value)}
                >
                  <option value="HIGH PRIORITY">HIGH PRIORITY</option>
                  <option value="MEDIUM PRIORITY">MEDIUM PRIORITY</option>
                  <option value="LOW PRIORITY">LOW PRIORITY</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                <button 
                  type="button" 
                  onClick={() => handleDeleteGoal(editingGoal.id)}
                  className="btn btn-ghost btn-sm"
                  style={{ color: '#dc2626' }}
                >
                  <Trash2 size={14} />
                  <span>Delete Goal</span>
                </button>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" onClick={() => setEditingGoal(null)} className="btn btn-secondary btn-sm">
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-emerald btn-sm">
                    Save Changes
                  </button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Add New Goal Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100
        }}>
          <div className="card" style={{ width: '420px', backgroundColor: '#ffffff' }}>
            <div className="card-title" style={{ justifyContent: 'space-between', marginBottom: '16px' }}>
              <span>Create New Saving Objective</span>
              <button onClick={() => setShowAddModal(false)} className="btn btn-ghost btn-sm">✕</button>
            </div>

            <form onSubmit={handleAddGoal} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', display: 'block' }}>
                  Goal Name
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Home Deposit, Bike Purchase"
                  value={newGoalName}
                  onChange={(e) => setNewGoalName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', display: 'block' }}>
                  Target Amount (₹)
                </label>
                <input
                  type="number"
                  className="input"
                  placeholder="e.g. 150000"
                  value={newGoalTarget}
                  onChange={(e) => setNewGoalTarget(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px', display: 'block' }}>
                  Monthly Contribution (₹)
                </label>
                <input
                  type="number"
                  className="input"
                  placeholder="e.g. 6000"
                  value={newGoalAdd}
                  onChange={(e) => setNewGoalAdd(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-emerald" style={{ flex: 1 }}>
                  Save Goal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
