import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Target,
  Tv,
  CheckCircle2,
  XCircle,
  Plus,
  RotateCcw,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import { AGENTS } from '../../data/mockFinancialData';
import { askGeminiJohn } from '../../services/geminiService';
import { conversationService } from '../../services/conversationService';
import { workspaceService, formatMinorInr } from '../../services/workspaceService';
import FormattedText from '../../components/FormattedText';

export default function JohnCoachDashboard({ userProfile, goals, onAcceptGoal, setActiveTab }) {
  const userName = userProfile?.name || 'User';
  const surplus = userProfile?.currentSavings || (userProfile?.monthlyIncome - userProfile?.fixedExpenses) || 0;
  const currency = userProfile?.currency || '₹';

  const [activeConversationId, setActiveConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);

  const [messages, setMessages] = useState([
    {
      id: 'init-1',
      sender: 'john',
      text: `Hello ${userName}! I am **John (v2.0)**, your Star-Topology Financial Orchestrator.\n\nI coordinate **Sentinel v5.0** (deterministic financial truth), **Atlas v5.0** (savings goals & SIP), **Nova v5.0** (budget caps & rebalancing), and **Iris v5.0** (forward spending & bill forecasts):\n\n- **Monthly Net Income**: ${currency}${(userProfile?.monthlyIncome || 0).toLocaleString('en-IN')}\n- **Monthly Net Surplus**: ${currency}${(surplus || 0).toLocaleString('en-IN')}\n- **Financial Health Score**: **${userProfile?.healthScore || 75}/100**\n\nHow can our specialist team assist with your finances today?`,
      hasIntervenerCard: false,
      timestamp: 'Just now'
    }
  ]);

  const [inputQuery, setInputQuery] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [expandedTraceId, setExpandedTraceId] = useState(null);
  const [acceptedGoals, setAcceptedGoals] = useState({});
  const [declinedGoals, setDeclinedGoals] = useState({});
  const [executedProposals, setExecutedProposals] = useState({});
  const [declinedProposals, setDeclinedProposals] = useState({});
  const [lastUndoableAction, setLastUndoableAction] = useState(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await conversationService.getConversations();
        if (res.success && res.conversations.length > 0) {
          setConversations(res.conversations);
          const latestId = res.conversations[0].id;
          setActiveConversationId(latestId);

          const convRes = await conversationService.getConversation(latestId);
          if (convRes.success && convRes.conversation?.messages) {
            setMessages(convRes.conversation.messages);
          }
        }
      } catch (err) {
        console.warn('Failed to load conversations from backend:', err);
      }
    }
    loadHistory();
  }, []);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking]);

  const handleSend = async (textToSend) => {
    if (isThinking) return;
    const rawVal = textToSend || inputQuery;
    const queryText = typeof rawVal === 'string' ? rawVal : (rawVal?.query || rawVal?.label || '');
    if (!queryText || !queryText.trim()) return;

    const userMsg = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: queryText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputQuery('');
    setIsThinking(true);

    try {
      // Primary: Call John v2.0 Orchestrator via /api/v1/chat
      const v1Res = await workspaceService.sendChat({
        message: queryText,
        thread_id: activeConversationId,
        workspace: 'JOHN'
      });

      const johnMsg = {
        id: `john-${Date.now()}`,
        sender: 'john',
        text: v1Res.reply || v1Res.text || 'Processed your request.',
        traces: v1Res.traces || [],
        proposals: v1Res.proposals || [],
        questions: v1Res.questions || [],
        blocks: v1Res.blocks || [],
        snapshot_id: v1Res.snapshot_id,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      if (v1Res.thread_id) {
        setActiveConversationId(v1Res.thread_id);
      }

      setMessages((prev) => [...prev, johnMsg]);
      setExpandedTraceId(johnMsg.id);
    } catch (_) {
      // Fallback to legacy coach endpoint
      const geminiResult = await askGeminiJohn(queryText, userProfile, goals, activeConversationId);
      const johnMsg = {
        id: `john-${Date.now()}`,
        sender: 'john',
        text: geminiResult.text,
        traces: geminiResult.traces?.length > 0 ? geminiResult.traces : undefined,
        proposedGoal: geminiResult.proposedGoal || undefined,
        proposals: geminiResult.proposals || [],
        questions: geminiResult.questions || [],
        snapshot_id: geminiResult.snapshot_id,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      if (geminiResult.conversationId) {
        setActiveConversationId(geminiResult.conversationId);
      }
      setMessages((prev) => [...prev, johnMsg]);
      setExpandedTraceId(johnMsg.id);
    } finally {
      setIsThinking(false);
    }
  };

  const handleConfirmProposal = async (proposal, snapshotId) => {
    try {
      const res = await workspaceService.executeAction({
        proposal_id: proposal.proposal_id,
        confirmation_token: proposal.confirmation_token,
        action_type: proposal.action_type,
        params: proposal.params,
        snapshot_id: snapshotId,
        acknowledgment: proposal.tier === 'T3'
      });

      if (res.status === 'EXECUTED') {
        setExecutedProposals((prev) => ({
          ...prev,
          [proposal.proposal_id || proposal.action_ref]: res
        }));
        if (res.undo_expires_at) {
          setLastUndoableAction({
            action_id: res.action_id,
            action_type: proposal.action_type
          });
        }
      }
    } catch (err) {
      console.error('Failed to confirm proposal:', err);
    }
  };

  const handleUndo = async () => {
    if (!lastUndoableAction) return;
    try {
      await workspaceService.undoAction(lastUndoableAction.action_id);
      const undoneType = lastUndoableAction.action_type;
      setLastUndoableAction(null);
      setMessages((prev) => [
        ...prev,
        {
          id: `undo-${Date.now()}`,
          sender: 'john',
          text: `Reverted action **${undoneType}** within the undo window.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (err) {
      console.error('Undo failed:', err);
    }
  };

  const handleAcceptProposal = (msgId, proposedGoal) => {
    const newGoalObj = {
      id: `goal-${Date.now()}`,
      name: proposedGoal.name,
      priority: proposedGoal.priority || 'MEDIUM PRIORITY',
      current: 0,
      target: proposedGoal.target,
      targetDate: 'Expected in 12 months',
      category: proposedGoal.category || 'Asset',
      iconType: proposedGoal.iconType || 'target',
      monthlyAdd: proposedGoal.monthlyAdd || 5000
    };

    onAcceptGoal(newGoalObj);
    setAcceptedGoals((prev) => ({ ...prev, [msgId]: true }));
  };

  const handleDeclineProposal = (msgId) => {
    setDeclinedGoals((prev) => ({ ...prev, [msgId]: true }));
  };

  const handleNewConversation = async () => {
    try {
      const res = await conversationService.createConversation('New Financial Session');
      if (res.success && res.conversation) {
        setActiveConversationId(res.conversation.id);
        setConversations((prev) => [res.conversation, ...prev]);
      }
    } catch (_) {}
    setMessages([
      {
        id: `init-${Date.now()}`,
        sender: 'john',
        text: `Hello ${userName}! New coaching session started. How can John and the specialist team assist you?`,
        timestamp: 'Just now'
      }
    ]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '720px', padding: 0 }}>
        {/* Header */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: 'var(--accent-emerald)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff'
            }}>
              <Bot size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'var(--font-serif)' }}>
                John v2.0 — Star-Topology Financial Orchestrator
              </h3>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={11} color="#059669" /> Sentinel v5.0 • Atlas v5.0 • Nova v5.0 • Iris v5.0
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {lastUndoableAction && (
              <button
                onClick={handleUndo}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #d97706',
                  backgroundColor: 'rgba(217, 119, 6, 0.12)',
                  color: '#d97706',
                  fontSize: '11px',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                <RotateCcw size={12} />
                Undo {lastUndoableAction.action_type}
              </button>
            )}
            <button
              onClick={handleNewConversation}
              className="btn btn-secondary"
              style={{ fontSize: '12px', padding: '6px 12px' }}
              title="Start new conversation"
            >
              <Plus size={14} /> New Chat
            </button>
            <span className="badge badge-emerald">ACTIVE SESSION</span>
          </div>
        </div>

        {/* Chat Messages Body */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          backgroundColor: 'var(--bg-card-subtle)'
        }}>
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isUser ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  alignSelf: isUser ? 'flex-end' : 'flex-start'
                }}
              >
                {/* Sender Label */}
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {!isUser && <Bot size={12} color="#059669" />}
                  <span>{isUser ? 'You' : 'John (Orchestrator)'}</span>
                  <span>•</span>
                  <span>{msg.timestamp}</span>
                </div>

                {/* Message Bubble */}
                <div style={{
                  padding: '16px 20px',
                  borderRadius: isUser ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                  backgroundColor: isUser ? 'var(--accent-emerald)' : 'var(--bg-card)',
                  color: isUser ? '#ffffff' : 'var(--text-primary)',
                  boxShadow: isUser ? 'none' : '0 2px 8px rgba(0, 0, 0, 0.04)',
                  border: isUser ? 'none' : '1px solid var(--border-color)',
                  fontSize: '14px',
                  lineHeight: '1.6',
                  fontFamily: 'var(--font-sans)'
                }}>
                  <FormattedText text={msg.text} />

                  {/* ChatResponse@1 Action Proposal Confirmation Cards */}
                  {msg.proposals && msg.proposals.length > 0 && (
                    <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {msg.proposals.map((prop, pIdx) => {
                        const key = prop.proposal_id || prop.action_ref || pIdx;
                        const isExecuted = Boolean(executedProposals[key]);
                        const isDeclined = Boolean(declinedProposals[key]);

                        return (
                          <div
                            key={key}
                            style={{
                              padding: '12px 14px',
                              borderRadius: '10px',
                              backgroundColor: 'var(--bg-card-subtle)',
                              border: '1px solid var(--border-focus)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <ShieldCheck size={15} color="#059669" />
                                <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>
                                  Confirmation Card ({prop.tier || 'T2'}): {prop.action_type}
                                </span>
                              </div>
                              <span style={{
                                fontSize: '10px',
                                fontWeight: '700',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                backgroundColor: 'var(--bg-secondary)',
                                color: 'var(--text-secondary)'
                              }}>
                                Sentinel Verified
                              </span>
                            </div>

                            {prop.preview && (
                              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                                <strong>{prop.preview.title}</strong>
                                {prop.preview.Impact && <div>{prop.preview.Impact}</div>}
                              </div>
                            )}

                            {isExecuted ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#059669', fontSize: '12px', fontWeight: '700' }}>
                                <CheckCircle2 size={15} />
                                <span>Confirmed &amp; Executed via Action Service</span>
                              </div>
                            ) : isDeclined ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '12px' }}>
                                <XCircle size={15} />
                                <span>Proposal Declined</span>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                <button
                                  onClick={() => handleConfirmProposal(prop, msg.snapshot_id)}
                                  style={{
                                    padding: '6px 14px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    backgroundColor: '#059669',
                                    color: '#ffffff',
                                    fontSize: '12px',
                                    fontWeight: '700',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Confirm &amp; Execute
                                </button>
                                <button
                                  onClick={() => setDeclinedProposals((prev) => ({ ...prev, [key]: true }))}
                                  style={{
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border-color)',
                                    backgroundColor: 'transparent',
                                    color: 'var(--text-secondary)',
                                    fontSize: '12px',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Clarifying Questions (NEEDS_INPUT Question@1) */}
                  {msg.questions && msg.questions.length > 0 && (
                    <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {msg.questions.map((q, qIdx) => (
                        <div key={qIdx} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                            {q.prompt}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {(q.options || []).map((opt, oIdx) => (
                              <button
                                key={oIdx}
                                onClick={() => handleSend(opt.label)}
                                style={{
                                  padding: '5px 12px',
                                  borderRadius: '999px',
                                  border: '1px solid var(--border-focus)',
                                  backgroundColor: 'var(--bg-secondary)',
                                  color: 'var(--text-primary)',
                                  fontSize: '11px',
                                  fontWeight: '600',
                                  cursor: 'pointer'
                                }}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Reasoning Trace Accordion */}
                  {msg.traces && msg.traces.length > 0 && (
                    <div style={{ marginTop: '16px', borderTop: '1px dashed var(--border-color)', paddingTop: '12px' }}>
                      <button
                        onClick={() => setExpandedTraceId(expandedTraceId === msg.id ? null : msg.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#059669',
                          fontSize: '12px',
                          fontWeight: '700',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: 0
                        }}
                      >
                        <Sparkles size={13} />
                        <span>Star-Topology Specialist Trace ({msg.traces.length} Invocations)</span>
                        {expandedTraceId === msg.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>

                      {expandedTraceId === msg.id && (
                        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {msg.traces.map((trace, idx) => {
                            const agentStr = typeof trace.agent === 'string' ? trace.agent : (trace.agent?.id || trace.agent?.name || 'john');
                            const agentKey = agentStr.toLowerCase();
                            const agentDisplay = agentStr.toUpperCase();
                            const agentColor = AGENTS[agentKey]?.color || '#059669';
                            return (
                              <div
                                key={idx}
                                style={{
                                  padding: '10px 12px',
                                  backgroundColor: 'var(--bg-card-subtle)',
                                  borderRadius: 'var(--radius-sm)',
                                  borderLeft: `3px solid ${agentColor}`,
                                  fontSize: '12px'
                                }}
                              >
                                <div style={{ fontWeight: '700', color: agentColor, marginBottom: '2px' }}>
                                  {agentDisplay} ({trace.role || 'Specialist'})
                                </div>
                                <div style={{ color: 'var(--text-secondary)' }}>{trace.thought}</div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Legacy Proposed Goal Fallback */}
                  {msg.proposedGoal && (!msg.proposals || msg.proposals.length === 0) && (
                    <div style={{
                      marginTop: '16px',
                      padding: '16px',
                      backgroundColor: 'var(--bg-card-subtle)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-secondary)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <Target size={18} color="#059669" />
                        <span style={{ fontWeight: '700', fontSize: '13px', color: 'var(--text-primary)' }}>
                          John Proposes a New Savings Objective
                        </span>
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>
                        {msg.proposedGoal.name}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Target Amount: <strong>{currency}{msg.proposedGoal.target.toLocaleString('en-IN')}</strong> • Priority: {msg.proposedGoal.priority || 'MEDIUM'}
                      </div>

                      <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                        {acceptedGoals[msg.id] ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#059669', fontWeight: '700' }}>
                            <CheckCircle2 size={16} /> Goal Added to Atlas Strategist!
                          </div>
                        ) : declinedGoals[msg.id] ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
                            <XCircle size={16} /> Proposal Declined
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => handleAcceptProposal(msg.id, msg.proposedGoal)}
                              className="btn btn-emerald"
                              style={{ fontSize: '12px', padding: '6px 12px' }}
                            >
                              Accept &amp; Create Goal
                            </button>
                            <button
                              onClick={() => handleDeclineProposal(msg.id)}
                              className="btn btn-secondary"
                              style={{ fontSize: '12px', padding: '6px 12px' }}
                            >
                              Decline
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {isThinking && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px' }}>
              <Bot size={18} color="#059669" />
              <span className="spin"></span>
              <span>John is orchestrating Sentinel, Atlas, Nova, and Iris...</span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Chat Input Bar */}
        <div style={{ padding: '16px 24px', backgroundColor: 'var(--bg-card)', borderTop: '1px solid var(--border-color)' }}>
          <form
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            style={{ display: 'flex', gap: '10px' }}
          >
            <input
              type="text"
              className="input"
              placeholder="Ask John e.g. 'Create an Emergency Fund goal of ₹1,50,000 saving ₹10,000/month' or 'Can I afford a ₹40,000 trip next month?'"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              disabled={isThinking}
              style={{ flex: 1 }}
            />
            <button
              type="submit"
              className="btn btn-emerald"
              disabled={isThinking || !inputQuery.trim()}
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
