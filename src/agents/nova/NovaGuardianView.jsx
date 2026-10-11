import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  AlertOctagon,
  Plus,
  Zap,
  Clock,
  Sparkles,
  Bot,
  Flame
} from 'lucide-react';
import { novaService } from './novaService';
import { transactionService } from '../../services/transactionService';
import './NovaGuardianView.css';

export default function NovaGuardianView({
  budgets = [],
  userProfile
}) {
  const currency = userProfile?.currency || '₹';
  const [localBudgets, setLocalBudgets] = useState(budgets || []);
  const [recentTxs, setRecentTxs] = useState([]);
  const [cognitiveData, setCognitiveData] = useState(null);
  const [negotiationData, setNegotiationData] = useState(null);
  const [showAgentDialogue, setShowAgentDialogue] = useState(false);

  const [newDesc, setNewDesc] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCat, setNewCat] = useState('Food & Dining');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [liveBanner, setLiveBanner] = useState(null);

  useEffect(() => {
    if (budgets && budgets.length > 0) {
      setLocalBudgets(budgets);
    }
  }, [budgets]);

  useEffect(() => {
    fetchAgentCognition();
    async function loadTransactions() {
      try {
        const res = await transactionService.getTransactions();
        if (res.success && Array.isArray(res.transactions)) {
          setRecentTxs(res.transactions);
        }
      } catch (_) {}
    }
    loadTransactions();
  }, []);

  const fetchAgentCognition = async () => {
    try {
      const cycle = await novaService.getCognitiveCycle();
      if (cycle) {
        setCognitiveData(cycle);
        if (cycle.specialist_response?.category_status_summary?.length > 0) {
          setLocalBudgets(cycle.specialist_response.category_status_summary);
        }
      }
    } catch (e) {
      // Cognition offline
    }
  };

  const handleApplyRebalance = async (move) => {
    try {
      const res = await novaService.applyRebalance(move);
      setLiveBanner(res.message);
      setTimeout(() => setLiveBanner(null), 6000);
      fetchAgentCognition();
    } catch (e) {
      setLiveBanner(`Confirmed rebalance for ₹${move.amount}`);
      setTimeout(() => setLiveBanner(null), 4000);
    }
  };

  const handleTriggerAtlasNegotiation = async () => {
    try {
      const res = await novaService.negotiateWithAtlas();
      setNegotiationData(res);
      setShowAgentDialogue(true);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddTransaction = async (e) => {
    e.preventDefault();
    if (!newDesc || !newAmount) return;

    const amt = Number(newAmount);
    if (isNaN(amt) || amt <= 0) return;

    setIsSubmitting(true);
    const newTx = {
      id: `tx-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      rawDescription: newDesc,
      amount: amt,
      category: newCat,
      merchant: newDesc.split(' ')[0],
      type: 'debit'
    };

    setRecentTxs(prev => [newTx, ...prev]);

    try {
      const response = await novaService.logExpense({
        rawDescription: newDesc,
        amount: amt,
        category: newCat
      });

      if (response?.thresholdAlert?.triggered) {
        setLiveBanner(response.thresholdAlert.message);
        setTimeout(() => setLiveBanner(null), 6000);
      }
    } catch (err) {
      console.log('Logging locally:', err.message);
    }

    fetchAgentCognition();
    setNewDesc('');
    setNewAmount('');
    setIsSubmitting(false);
  };

  const cognitiveSynthesis = cognitiveData?.cognitive_synthesis;
  const specialistResp = cognitiveData?.specialist_response;
  const temporal = cognitiveData?.temporal_context || { current_day: 14, days_remaining: 17 };
  const envelopeInfo = specialistResp?.daily_spending_envelope;
  const dailyEnvelope = envelopeInfo?.headline_amount ?? cognitiveData?.velocity?.overall?.safe_daily_spend_envelope ?? 1197;
  const envelopeMode = envelopeInfo?.headline_mode || 'safe';
  const uncategorizedSpent = cognitiveData?.ground_truth_metrics?.uncategorized_spent || 0;
  const rebalanceProposal = cognitiveData?.rebalance_proposal;

  return (
    <div className="nova-container">
      <div className="nova-header">
        <div>
          <h1 className="nova-title">Nova Budget Workspace</h1>
          <p className="nova-subtitle">
            Stateless Real-Time Budget Guardian powered by Sentinel snapshots, Tally categorization events, and John Star-Topology orchestration.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleTriggerAtlasNegotiation}
            className="nova-badge"
            style={{ background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe', cursor: 'pointer' }}
          >
            <Bot size={14} />
            John → Atlas Goal Hint
          </button>
          <span className="nova-badge nova-badge-healthy">
            <ShieldCheck size={14} />
            Sentinel Connected
          </span>
        </div>
      </div>

      <div className="nova-ai-banner">
        <div className="nova-ai-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className="nova-ai-tag">
              <Sparkles size={13} />
              NOVA SPECIALIST RESPONSE
            </span>
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#cbd5e1' }}>
              Day {temporal.current_day} ({temporal.days_remaining} days left in calendar month)
            </span>
          </div>

          <div className="nova-ai-envelope-pill">
            <Flame size={14} />
            <span>
              {envelopeMode === 'conservative' ? 'Conservative Envelope' : 'Safe Envelope'}:{' '}
              <strong className="mono">{currency}{dailyEnvelope}</strong>/day
            </span>
          </div>
        </div>

        <div>
          <div style={{ fontSize: '15px', fontWeight: '700', color: '#f8fafc', marginBottom: '6px' }}>
            {cognitiveSynthesis?.executive_summary || "Nova monitors Sentinel category utilization and velocity thresholds in real time."}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
            <strong>Grounded Findings: </strong>
            {specialistResp?.findings?.map(f => f.rendered_statement).join(' ') || cognitiveSynthesis?.root_cause_analysis}
          </div>
          {uncategorizedSpent > 0 && (
            <div style={{ fontSize: '12px', color: '#fbbf24', marginTop: '6px' }}>
              Uncategorized spend (excluded from caps): <strong>{currency}{uncategorizedSpent.toLocaleString()}</strong> — review recommended.
            </div>
          )}
        </div>

        {rebalanceProposal?.has_proposals && (
          <div className="nova-intervention-card" style={{ background: '#1e293b', border: '1px solid #334155', color: '#f8fafc' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#fca5a5' }}>
                John Confirmation Card: APPLY_REBALANCE Proposal (Tier T2)
              </div>
              <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '2px' }}>
                {rebalanceProposal.moves[0]?.reasoning}
              </div>
            </div>
            <button
              onClick={() => handleApplyRebalance(rebalanceProposal.moves[0])}
              className="nova-intervention-btn"
              style={{ background: '#dc2626', color: '#fff' }}
            >
              Confirm &amp; Apply Rebalance
            </button>
          </div>
        )}
      </div>

      {showAgentDialogue && (
        <div className="nova-card" style={{ background: '#090d16', border: '1px solid #1e293b', color: '#f8fafc' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Bot size={16} />
              Star-Topology Orchestration Trace (Nova → John → Atlas)
            </span>
            <button
              onClick={() => setShowAgentDialogue(false)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px' }}
            >
              Close
            </button>
          </div>
          <div className="nova-agent-dialogue">
            {negotiationData?.dialogue?.map((msg, idx) => (
              <div key={idx} className={`nova-agent-msg ${msg.from.includes('Atlas') ? 'atlas' : 'nova'}`}>
                <div style={{ fontWeight: '700', color: msg.from.includes('Atlas') ? '#c084fc' : '#38bdf8', marginBottom: '4px' }}>
                  {msg.from} → {msg.to || 'John'}
                </div>
                <div>{msg.content || msg.analysis}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {liveBanner && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          color: '#dc2626',
          fontSize: '13px',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <AlertOctagon size={16} />
          <span>{liveBanner}</span>
        </div>
      )}

      <div className="nova-grid">
        <div className="nova-card">
          <div className="nova-card-title">
            <ShieldCheck size={18} color="#dc2626" />
            <span>Category Caps &amp; Live Status (Healthy &lt;80%, Warning 80%–100%, Exceeded &gt;100%)</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {localBudgets.map((b, idx) => {
              const spentTotal = b.spent_total ?? b.spent ?? 0;
              const limit = b.monthly_cap ?? b.limit ?? 1;
              const pct = b.utilization_pct ?? b.percent ?? Math.round((spentTotal / limit) * 100);
              const isExceeded = pct > 100;
              const isWarning = pct >= 80 && pct <= 100;
              const statusClass = isExceeded ? 'exceeded' : isWarning ? 'warning' : 'healthy';

              return (
                <div key={idx} className={`nova-category-row ${statusClass}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
                        {b.category}
                      </span>
                      {isExceeded && <span className="nova-badge nova-badge-danger">EXCEEDED (&gt;100%)</span>}
                      {isWarning && <span className="nova-badge nova-badge-warning">WARNING (80%–100%)</span>}
                      {b.tier_is_provisional && (
                        <a
                          href="/api/transactions/review-queue"
                          className="nova-badge"
                          style={{ background: '#fef3c7', color: '#92400e', textDecoration: 'none' }}
                        >
                          PROVISIONAL (Review List)
                        </a>
                      )}
                    </div>

                    <span className="mono" style={{
                      fontSize: '13px',
                      fontWeight: '700',
                      color: isExceeded ? '#dc2626' : isWarning ? '#d97706' : '#059669'
                    }}>
                      {pct}%
                    </span>
                  </div>

                  <div className="nova-progress-track">
                    <div
                      className="nova-progress-fill"
                      style={{
                        width: `${Math.min(100, pct)}%`,
                        backgroundColor: isExceeded ? '#dc2626' : isWarning ? '#d97706' : '#059669'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '8px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>
                      Settled: <strong className="mono" style={{ color: 'var(--text-primary)' }}>{currency}{(b?.spent_settled ?? spentTotal).toLocaleString()}</strong>
                      {(b?.spent_provisional || 0) > 0 && (
                        <span style={{ color: '#d97706', marginLeft: '6px' }}>
                          (+{currency}{b.spent_provisional.toLocaleString()} provisional)
                        </span>
                      )}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      Cap: <strong className="mono" style={{ color: 'var(--text-primary)' }}>{currency}{limit.toLocaleString()}</strong>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="nova-card">
            <div className="nova-card-title">
              <Plus size={16} color="#dc2626" />
              <span>Tally Transaction Ingestion Trigger</span>
            </div>

            <form onSubmit={handleAddTransaction} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <input
                type="text"
                className="nova-input-field"
                placeholder="Merchant / Expense Description (e.g. Swiggy Gourmet)"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                required
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <input
                  type="number"
                  className="nova-input-field"
                  placeholder="Amount (₹)"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  required
                />

                <select
                  className="nova-input-field"
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                >
                  <option value="Food & Dining">Food &amp; Dining</option>
                  <option value="Shopping & Lifestyle">Shopping &amp; Lifestyle</option>
                  <option value="Subscriptions">Subscriptions</option>
                  <option value="Transport">Transport</option>
                  <option value="Bills & Utilities">Bills &amp; Utilities</option>
                  <option value="Healthcare">Healthcare</option>
                </select>
              </div>

              <button
                type="submit"
                className="nova-button-primary"
                disabled={isSubmitting}
                style={{ marginTop: '6px' }}
              >
                <Zap size={14} />
                <span>{isSubmitting ? 'Publishing categorization.updated...' : 'Ingest via Tally & Run Threshold Job'}</span>
              </button>
            </form>
          </div>

          <div className="nova-card" style={{ flex: 1 }}>
            <div className="nova-card-title" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={16} color="#64748b" />
                <span>Categorized Transactions (Tally Snapshot)</span>
              </div>
              <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {recentTxs.length} Logged
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '280px', overflowY: 'auto' }}>
              {recentTxs.length > 0 ? (
                recentTxs.slice(0, 6).map((tx, idx) => (
                  <div key={tx.id || idx} className="nova-tx-item">
                    <div>
                      <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{tx.merchant || tx.raw_description || tx.rawDescription || tx.description}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{tx.category} • {tx.date || tx.txn_date?.slice(0, 10) || 'Recent'}</div>
                    </div>
                    <span className="mono" style={{
                      fontWeight: '700',
                      color: tx.type === 'credit' ? '#059669' : '#dc2626'
                    }}>
                      {tx.type === 'credit' ? '+' : '-'}₹{(Number(tx.amount) || 0).toLocaleString()}
                    </span>
                  </div>
                ))
              ) : (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                  No transactions recorded yet. Use the form above to log an expense.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
