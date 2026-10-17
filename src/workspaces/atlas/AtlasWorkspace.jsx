import React, { useState, useEffect, useCallback } from 'react';
import {
  Target,
  Plus,
  TrendingUp,
  Calendar,
  Edit,
  Trash2,
  Calculator,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import { api } from '../../services/api/v1';
import WorkspaceChatPanel from '../../components/WorkspaceChatPanel';

function formatInrMinor(minor) {
  const rupees = Math.round((Number(minor) || 0) / 100);
  return `₹${rupees.toLocaleString('en-IN')}`;
}

export default function AtlasStrategistView({ goals, setGoals, userProfile }) {
  const [atlasData, setAtlasData] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);

  // Create Goal inputs
  const [newGoalName, setNewGoalName] = useState('');
  const [newGoalTarget, setNewGoalTarget] = useState('');
  const [newGoalAdd, setNewGoalAdd] = useState('');
  const [newGoalDeadline, setNewGoalDeadline] = useState('');
  const [newGoalPriority, setNewGoalPriority] = useState('MEDIUM');

  // Edit / Fund / Release inputs
  const [editName, setEditName] = useState('');
  const [editTarget, setEditTarget] = useState('');
  const [editMonthlyAdd, setEditMonthlyAdd] = useState('');
  const [editPriority, setEditPriority] = useState('MEDIUM');
  const [fundDeltaAmount, setFundDeltaAmount] = useState('');
  const [fundDeltaMode, setFundDeltaMode] = useState('ADD'); // 'ADD' | 'RELEASE'
  const [errorMsg, setErrorMsg] = useState('');
  const [statusBanner, setStatusBanner] = useState('');

  // Deterministic SIP Calculator state (`sentinel_project_sip`, D-024)
  const [sipMonthlyRupees, setSipMonthlyRupees] = useState('5000');
  const [sipAnnualRatePct, setSipAnnualRatePct] = useState('12');
  const [sipYears, setSipYears] = useState('5');
  const [sipStepUpPct, setSipStepUpPct] = useState('0');
  const [sipResult, setSipResult] = useState(null);
  const [sipError, setSipError] = useState('');

  const loadAtlasWorkspace = useCallback(async () => {
    try {
      const res = await api.getAtlasWorkspace();
      setAtlasData(res);
    } catch (err) {
      console.warn('Atlas workspace fetch fallback:', err.message);
    }
  }, []);

  useEffect(() => {
    loadAtlasWorkspace();
  }, [loadAtlasWorkspace]);

  const handleRunSipProjection = async (e) => {
    e.preventDefault();
    setSipError('');
    const monthlyMinor = Math.round((Number(sipMonthlyRupees) || 0) * 100);
    const rateBp = Math.round((Number(sipAnnualRatePct) || 0) * 100);
    const months = Math.max(1, Math.round((Number(sipYears) || 1) * 12));
    const stepUpBp = Math.round((Number(sipStepUpPct) || 0) * 100);

    if (monthlyMinor < 10000) {
      setSipError('Monthly SIP amount must be at least ₹100.');
      return;
    }

    try {
      const res = await api.projectSip({
        monthly_amount_minor: monthlyMinor,
        annual_rate_bp: rateBp,
        months,
        annual_step_up_bp: stepUpBp,
      });
      setSipResult(res.result);
    } catch (err) {
      setSipError(err.message);
    }
  };

  const handleAddGoal = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!newGoalName || !newGoalTarget) return;

    const targetMinor = Math.round(Number(newGoalTarget) * 100);
    const monthlyMinor = Math.round((Number(newGoalAdd) || 0) * 100);

    try {
      const valRes = await api.validateGoalAction({
        operation: 'CREATE',
        name: newGoalName.trim(),
        target_minor: targetMinor,
        monthly_add_minor: monthlyMinor,
        deadline: newGoalDeadline || null,
        priority_tier: newGoalPriority,
      });

      if (valRes.validation?.data?.verdict !== 'PASS') {
        const msg =
          valRes.validation?.constraints_triggered?.[0]?.message ||
          'Goal validation failed.';
        setErrorMsg(msg);
        return;
      }
      if (valRes.feasibility?.data?.verdict === 'SHORTFALL') {
        const msg =
          valRes.feasibility?.constraints_triggered?.[0]?.message ||
          'Monthly contribution exceeds available surplus.';
        setErrorMsg(msg);
        return;
      }

      if (valRes.proposal) {
        await api.executeAction({
          proposal_id: valRes.proposal.proposal_id,
          confirmation_token: valRes.proposal.confirmation_token,
          action_type: 'CREATE_GOAL',
          params: valRes.proposal.params,
        });
      }

      await loadAtlasWorkspace();

      setNewGoalName('');
      setNewGoalTarget('');
      setNewGoalAdd('');
      setNewGoalDeadline('');
      setShowAddModal(false);
      setStatusBanner('Goal validated by Sentinel and created.');
      setTimeout(() => setStatusBanner(''), 3000);
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleOpenEdit = (cardItem) => {
    const g = cardItem.goal || cardItem;
    setEditingGoal(g);
    setEditName(g.name);
    setEditTarget(Math.round((g.target_minor ?? (g.target || g.target_amount || 0) * 100) / 100));
    setEditMonthlyAdd(
      Math.round((g.monthly_add_minor ?? (g.monthlyAdd || g.monthly_allocation || 0) * 100) / 100)
    );
    setEditPriority(g.priority_tier || 'MEDIUM');
    setFundDeltaAmount('');
    setFundDeltaMode('ADD');
    setErrorMsg('');
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!editingGoal) return;

    const goalId = editingGoal.goal_id || editingGoal.id;
    try {
      if (fundDeltaAmount && Number(fundDeltaAmount) > 0) {
        const amtMinor = Math.round(Number(fundDeltaAmount) * 100);
        const op = fundDeltaMode === 'RELEASE' ? 'RELEASE_FUNDS' : 'ADD_FUNDS';
        const valFund = await api.validateGoalAction({
          operation: op,
          goal_id: goalId,
          amount_minor: amtMinor,
        });
        if (valFund.validation?.data?.verdict !== 'PASS') {
          setErrorMsg(
            valFund.validation?.constraints_triggered?.[0]?.message ||
              'Fund operation rejected by Sentinel.'
          );
          return;
        }
        if (op === 'ADD_FUNDS' && valFund.balance_check && valFund.balance_check.data?.verdict !== 'OK') {
          setErrorMsg(
            valFund.balance_check.constraints_triggered?.[0]?.message ||
              'Insufficient un-earmarked liquid balance.'
          );
          return;
        }
        if (valFund.proposal) {
          await api.executeAction({
            proposal_id: valFund.proposal.proposal_id,
            confirmation_token: valFund.proposal.confirmation_token,
            action_type: op,
            params: valFund.proposal.params,
          });
        }
      }

      const valUpdate = await api.validateGoalAction({
        operation: 'UPDATE',
        goal_id: goalId,
        name: editName.trim(),
        target_minor: Math.round(Number(editTarget) * 100),
        monthly_add_minor: Math.round(Number(editMonthlyAdd) * 100),
        priority_tier: editPriority,
      });

      if (valUpdate.validation?.data?.verdict !== 'PASS') {
        setErrorMsg(
          valUpdate.validation?.constraints_triggered?.[0]?.message ||
            'Goal update rejected by Sentinel.'
        );
        return;
      }

      if (valUpdate.proposal) {
        await api.executeAction({
          proposal_id: valUpdate.proposal.proposal_id,
          confirmation_token: valUpdate.proposal.confirmation_token,
          action_type: 'UPDATE_GOAL',
          params: valUpdate.proposal.params,
        });
      }

      await loadAtlasWorkspace();
      setEditingGoal(null);
      setStatusBanner('Goal changes validated and saved.');
      setTimeout(() => setStatusBanner(''), 3000);
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleToggleGoalStatus = async (goalObj) => {
    const goalId = goalObj.goal_id;
    const nextStatus = goalObj.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED';
    try {
      await api.executeAction({
        action_type: 'SET_GOAL_STATUS',
        params: { goal_id: goalId, status: nextStatus },
      });
      await loadAtlasWorkspace();
    } catch (_) {}
  };

  const handleDeleteGoal = async (goalObj) => {
    const goalId = goalObj.goal_id || goalObj.id;
    try {
      await api.executeAction({
        action_type: 'DELETE_GOAL',
        params: { goal_id: goalId },
        acknowledged_warnings: true,
      });
      await loadAtlasWorkspace();
      setEditingGoal(null);
    } catch (_) {}
  };

  const handleRestoreGoal = async (goalId) => {
    try {
      await api.executeAction({
        action_type: 'RESTORE_GOAL',
        params: { goal_id: goalId },
      });
      await loadAtlasWorkspace();
    } catch (_) {}
  };

  const cards =
    atlasData?.goal_cards?.length > 0
      ? atlasData.goal_cards
      : (goals || []).map((g) => ({
          goal: {
            goal_id: g.goal_id || g.id,
            name: g.name,
            status: (g.status || 'ACTIVE').toUpperCase(),
            priority_tier: g.priority_tier || 'MEDIUM',
            target_minor: Math.round((g.target || g.target_amount || 0) * 100),
            saved_minor: Math.round((g.current || g.saved_amount || 0) * 100),
            monthly_add_minor: Math.round((g.monthlyAdd || g.monthly_allocation || 0) * 100),
          },
          progress: {
            target_minor: Math.round((g.target || g.target_amount || 0) * 100),
            saved_minor: Math.round((g.current || g.saved_amount || 0) * 100),
            progress_bp:
              (g.target || g.target_amount || 0) > 0
                ? Math.round(
                    ((g.current || g.saved_amount || 0) / (g.target || g.target_amount || 1)) *
                      10000
                  )
                : 0,
            monthly_add_minor: Math.round((g.monthlyAdd || g.monthly_allocation || 0) * 100),
            projected_date: null,
            conservative_date: null,
            trajectory: 'ON_TRACK',
          },
          confidence: 'HIGH',
        }));

  const surplus = atlasData?.surplus_baseline || {
    income_minor: Math.round((userProfile?.monthlyIncome || 0) * 100),
    fixed_commitments_minor: Math.round((userProfile?.fixedExpenses || 0) * 100),
    goal_commitments_minor: 0,
    expected_surplus_signed_minor: 0,
    conservative_surplus_signed_minor: 0,
  };
  const balanceInfo = atlasData?.available_balance || {
    total_liquid_minor: 0,
    earmarked_minor: 0,
    available_minor: 0,
  };
  const archivedGoals = atlasData?.archived_goals || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1
            style={{
              fontSize: '30px',
              fontWeight: '800',
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
              fontFamily: 'var(--font-serif)',
            }}
          >
            Atlas — Savings Strategist
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Virtual savings earmarks, Sentinel-verified feasibility, and illustrative SIP arithmetic.
          </p>
        </div>

        <button onClick={() => setShowAddModal(true)} className="btn btn-emerald">
          <Plus size={16} />
          <span>New Goal</span>
        </button>
      </div>

      {statusBanner && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--accent-emerald)',
            color: 'var(--text-primary)',
            fontSize: '13px',
          }}
        >
          {statusBanner}
        </div>
      )}

      {/* Top Surplus & Liquid Earmark Strip */}
      <div className="grid-3">
        <div className="card" style={{ padding: '18px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Active Monthly Goal Commitments
          </div>
          <div
            className="mono"
            style={{
              fontSize: '24px',
              fontWeight: '800',
              color: 'var(--accent-emerald)',
              marginTop: '4px',
              fontFamily: 'var(--font-serif)',
            }}
          >
            {formatInrMinor(surplus.goal_commitments_minor)}/mo
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Out of {formatInrMinor(surplus.income_minor)} monthly income
          </div>
        </div>

        <div className="card" style={{ padding: '18px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Remaining Unassigned Monthly Surplus
          </div>
          <div
            className="mono"
            style={{
              fontSize: '24px',
              fontWeight: '800',
              color: 'var(--text-primary)',
              marginTop: '4px',
              fontFamily: 'var(--font-serif)',
            }}
          >
            {formatInrMinor(surplus.expected_surplus_signed_minor)}/mo
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Conservative P80 Surplus: {formatInrMinor(surplus.conservative_surplus_signed_minor)}/mo
          </div>
        </div>

        <div className="card" style={{ padding: '18px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Un-earmarked Liquid Balance
          </div>
          <div
            className="mono"
            style={{
              fontSize: '24px',
              fontWeight: '800',
              color: 'var(--text-primary)',
              marginTop: '4px',
              fontFamily: 'var(--font-serif)',
            }}
          >
            {formatInrMinor(balanceInfo.available_minor)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Total Earmarked in Goals: {formatInrMinor(balanceInfo.earmarked_minor)}
          </div>
        </div>
      </div>

      {/* Main Grid: Goal Cards (Left) + Deterministic SIP Calculator (Right) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
              gap: '20px',
            }}
          >
            {cards.length === 0 && (
              <div
                className="card"
                style={{ padding: '36px', textAlign: 'center', gridColumn: '1 / -1' }}
              >
                <Target
                  size={36}
                  color="var(--accent-emerald)"
                  style={{ margin: '0 auto 12px auto' }}
                />
                <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>
                  No Goals Created Yet
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Click "+ New Goal" above to create your first savings goal or ask Atlas in the chat below.
                </p>
              </div>
            )}

            {cards.map((item) => {
              const g = item.goal;
              const p = item.progress || {};
              const pct = Math.min(100, Math.round((p.progress_bp || 0) / 100));
              const isPaused = g.status === 'PAUSED';
              const dateLabel =
                item.confidence !== 'HIGH'
                  ? p.conservative_date || p.projected_date
                  : p.projected_date;

              return (
                <div
                  key={g.goal_id}
                  className="card"
                  style={{
                    padding: '22px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    opacity: isPaused ? 0.78 : 1,
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: '700',
                          color: 'var(--text-muted)',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {g.priority_tier} PRIORITY • {g.status}
                      </span>
                      <span
                        className="badge"
                        style={{
                          fontSize: '10px',
                          backgroundColor: 'var(--bg-tertiary)',
                          color:
                            p.trajectory === 'AT_RISK'
                              ? '#d97706'
                              : 'var(--accent-emerald)',
                        }}
                      >
                        {p.trajectory || 'ON_TRACK'}
                      </span>
                    </div>

                    <div
                      style={{
                        fontSize: '20px',
                        fontWeight: '700',
                        color: 'var(--text-primary)',
                        marginTop: '10px',
                        fontFamily: 'var(--font-serif)',
                      }}
                    >
                      {g.name}
                    </div>

                    <div
                      style={{
                        marginTop: '12px',
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: '6px',
                      }}
                    >
                      <span
                        className="mono"
                        style={{
                          fontSize: '24px',
                          fontWeight: '700',
                          color: 'var(--text-primary)',
                          fontFamily: 'var(--font-serif)',
                        }}
                      >
                        {formatInrMinor(p.saved_minor)}
                      </span>
                      <span
                        className="mono"
                        style={{ fontSize: '12px', color: 'var(--text-muted)' }}
                      >
                        / {formatInrMinor(p.target_minor)} ({pct}%)
                      </span>
                    </div>

                    <div className="progress-track" style={{ height: '8px', marginTop: '10px' }}>
                      <div
                        className="progress-fill"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: isPaused
                            ? 'var(--text-muted)'
                            : 'var(--accent-emerald)',
                        }}
                      />
                    </div>

                    <div
                      style={{
                        marginTop: '10px',
                        fontSize: '12px',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      Monthly add: <strong>{formatInrMinor(p.monthly_add_minor)}/mo</strong>
                      {g.has_month_override && (
                        <span style={{ marginLeft: '6px', color: '#d97706' }}>
                          (This-month override)
                        </span>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: '16px',
                      paddingTop: '12px',
                      borderTop: '1px solid var(--border-color)',
                      gap: '8px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <Calendar size={13} />
                      <span>
                        {dateLabel ? `Projected: ${dateLabel.slice(0, 7)}` : 'No target date'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      {String(g.goal_id).startsWith('g_') && (
                        <button
                          onClick={() => handleToggleGoalStatus(g)}
                          className="btn btn-secondary btn-sm"
                          title={isPaused ? 'Resume Goal' : 'Pause Goal'}
                          style={{ padding: '4px 8px', fontSize: '11px' }}
                        >
                          {isPaused ? <PlayCircle size={13} /> : <PauseCircle size={13} />}
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenEdit(item)}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '4px 10px', fontSize: '11px' }}
                      >
                        <Edit size={12} />
                        <span>Manage</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Recently Deleted Goals (30-Day Restore Window) */}
          {archivedGoals.length > 0 && (
            <div className="card" style={{ padding: '18px' }}>
              <h3
                style={{
                  fontSize: '14px',
                  fontWeight: '700',
                  color: 'var(--text-primary)',
                  marginBottom: '10px',
                }}
              >
                Recently Deleted Goals (30-Day Restore Window)
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {archivedGoals.map((ag) => (
                  <div
                    key={ag.goal_id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                        {ag.name}
                      </strong>
                      <span
                        style={{
                          marginLeft: '8px',
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                        }}
                      >
                        Target: {formatInrMinor(ag.target_minor)}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRestoreGoal(ag.goal_id)}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '12px' }}
                    >
                      <RotateCcw size={13} />
                      <span>Restore Goal</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Deterministic SIP Calculator (`sentinel_project_sip`, D-024) */}
        <div className="card" style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calculator size={18} color="var(--accent-emerald)" />
            <h3
              style={{
                fontSize: '16px',
                fontWeight: '700',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-serif)',
              }}
            >
              Illustrative SIP Calculator
            </h3>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
            Pure arithmetic compounding via <code>sentinel_project_sip</code> using the return rate you choose to assume. Illustrative only — not investment advice.
          </p>

          <form
            onSubmit={handleRunSipProjection}
            style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Monthly Contribution (₹)
              </label>
              <input
                type="number"
                className="input"
                value={sipMonthlyRupees}
                onChange={(e) => setSipMonthlyRupees(e.target.value)}
                min="100"
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Assumed Annual Rate (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="30"
                  className="input"
                  value={sipAnnualRatePct}
                  onChange={(e) => setSipAnnualRatePct(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Duration (Years)
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  className="input"
                  value={sipYears}
                  onChange={(e) => setSipYears(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                Annual Step-Up (%) — Optional
              </label>
              <input
                type="number"
                step="1"
                min="0"
                max="50"
                className="input"
                value={sipStepUpPct}
                onChange={(e) => setSipStepUpPct(e.target.value)}
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
              Calculate Illustrative Projection
            </button>
          </form>

          {sipError && (
            <div style={{ fontSize: '12px', color: '#dc2626' }}>{sipError}</div>
          )}

          {sipResult && (
            <div
              style={{
                padding: '14px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Total Contributed:</span>
                <strong className="mono" style={{ color: 'var(--text-primary)' }}>
                  {formatInrMinor(sipResult.total_contributed_minor)}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Illustrative Gain:</span>
                <strong className="mono" style={{ color: 'var(--accent-emerald)' }}>
                  +{formatInrMinor(sipResult.projected_gain_minor)}
                </strong>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '14px',
                  paddingTop: '8px',
                  borderTop: '1px solid var(--border-color)',
                }}
              >
                <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                  Projected Corpus:
                </span>
                <strong className="mono" style={{ color: 'var(--accent-emerald)' }}>
                  {formatInrMinor(sipResult.projected_corpus_minor)}
                </strong>
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Illustrative arithmetic only ({sipResult.months} months at {(sipResult.annual_rate_bp / 100).toFixed(1)}% p.a.). Not financial advice.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Manage Goal / Add or Release Funds Modal */}
      {editingGoal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div className="card" style={{ width: '460px', backgroundColor: 'var(--bg-card)' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
              Manage Goal: {editingGoal.name}
            </h3>

            {errorMsg && (
              <div
                style={{
                  padding: '10px 12px',
                  marginBottom: '12px',
                  backgroundColor: 'rgba(220, 38, 38, 0.1)',
                  border: '1px solid #dc2626',
                  borderRadius: '6px',
                  color: '#dc2626',
                  fontSize: '12px',
                }}
              >
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
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

              <div
                style={{
                  padding: '14px',
                  backgroundColor: 'var(--bg-primary)',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setFundDeltaMode('ADD')}
                    className={fundDeltaMode === 'ADD' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                  >
                    <ArrowUpRight size={13} />
                    <span>Add Funds (Earmark)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFundDeltaMode('RELEASE')}
                    className={fundDeltaMode === 'RELEASE' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                  >
                    <ArrowDownLeft size={13} />
                    <span>Release Funds</span>
                  </button>
                </div>
                <input
                  type="number"
                  className="input"
                  placeholder={fundDeltaMode === 'ADD' ? 'Amount to add (₹)' : 'Amount to release (₹)'}
                  value={fundDeltaAmount}
                  onChange={(e) => setFundDeltaAmount(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
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
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                    Monthly Contribution (₹)
                  </label>
                  <input
                    type="number"
                    className="input"
                    value={editMonthlyAdd}
                    onChange={(e) => setEditMonthlyAdd(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Priority Tier
                </label>
                <select
                  className="input"
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value)}
                >
                  <option value="HIGH">HIGH</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="LOW">LOW</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => handleDeleteGoal(editingGoal)}
                  className="btn btn-ghost btn-sm"
                  style={{ color: '#dc2626' }}
                >
                  <Trash2 size={14} />
                  <span>Delete Goal (T3)</span>
                </button>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" onClick={() => setEditingGoal(null)} className="btn btn-secondary btn-sm">
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-emerald btn-sm">
                    Validate & Save
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create New Goal Modal */}
      {showAddModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div className="card" style={{ width: '430px', backgroundColor: 'var(--bg-card)' }}>
            <div className="card-title" style={{ justifyContent: 'space-between', marginBottom: '16px' }}>
              <span>Create New Savings Goal</span>
              <button onClick={() => { setShowAddModal(false); setErrorMsg(''); }} className="btn btn-ghost btn-sm">
                Close
              </button>
            </div>

            {errorMsg && (
              <div
                style={{
                  padding: '10px 12px',
                  marginBottom: '12px',
                  backgroundColor: 'rgba(220, 38, 38, 0.1)',
                  border: '1px solid #dc2626',
                  borderRadius: '6px',
                  color: '#dc2626',
                  fontSize: '12px',
                }}
              >
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleAddGoal} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Goal Name (max 40 chars)
                </label>
                <input
                  type="text"
                  maxLength={40}
                  className="input"
                  placeholder="e.g. Emergency Fund"
                  value={newGoalName}
                  onChange={(e) => setNewGoalName(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
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
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                    Monthly Contribution (₹)
                  </label>
                  <input
                    type="number"
                    className="input"
                    placeholder="e.g. 5000"
                    value={newGoalAdd}
                    onChange={(e) => setNewGoalAdd(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                    Target Deadline (Optional)
                  </label>
                  <input
                    type="date"
                    className="input"
                    value={newGoalDeadline}
                    onChange={(e) => setNewGoalDeadline(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                    Priority Tier
                  </label>
                  <select
                    className="input"
                    value={newGoalPriority}
                    onChange={(e) => setNewGoalPriority(e.target.value)}
                  >
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-emerald" style={{ flex: 1 }}>
                  Validate & Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Embedded Workspace Chat Panel (`ui_context.workspace = ATLAS`) */}
      <WorkspaceChatPanel
        workspace="ATLAS"
        title="Ask Atlas about Savings Goals & Feasibility"
        placeholder="Ask Atlas to review your goals, check feasibility, or run a SIP projection..."
        onActionExecuted={loadAtlasWorkspace}
      />
    </div>
  );
}
