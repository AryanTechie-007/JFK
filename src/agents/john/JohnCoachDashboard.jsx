import React, { useState, useRef, useEffect } from 'react';
import { 
  Bot, 
  Send, 
  Sparkles, 
  ChevronDown, 
  ChevronUp, 
  TrendingUp, 
  Lightbulb, 
  Target, 
  ShieldAlert,
  ArrowRight,
  Tv,
  Utensils,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Plus,
  History
} from 'lucide-react';
import { 
  AGENTS, 
  SAMPLE_QUERIES, 
  runOrchestratorQuery 
} from '../../data/mockFinancialData';
import { askGeminiJohn } from '../../services/geminiService';
import { conversationService } from '../../services/conversationService';
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
      text: `Hello ${userName}! I am **John**, your Master AI Financial Coach.\n\nI have evaluated your financial state alongside **Sentinel**, **Iris**, **Atlas**, and **Nova**:\n\n- **Monthly Net Income**: ${currency}${(userProfile?.monthlyIncome || 0).toLocaleString()}\n- **Monthly Net Surplus**: ${currency}${(surplus || 0).toLocaleString()}\n- **Financial Health Score**: **${userProfile?.healthScore || 75}/100**\n\nHow can our team help guide your money decisions today?`,
      hasIntervenerCard: false,
      timestamp: 'Just now'
    }
  ]);

  const [inputQuery, setInputQuery] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [expandedTraceId, setExpandedTraceId] = useState(null);
  const [acceptedGoals, setAcceptedGoals] = useState({});
  const [declinedGoals, setDeclinedGoals] = useState({});
  const chatEndRef = useRef(null);

  // Load conversation history on mount
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

    setMessages(prev => [...prev, userMsg]);
    if (!textToSend) setInputQuery('');
    setIsThinking(true);

    // Send through API service layer (which proxies to backend AI orchestrator)
    const geminiResult = await askGeminiJohn(queryText, userProfile, goals, activeConversationId);

    const johnText = geminiResult.text;
    const traces = geminiResult.traces || [];
    const proposedGoal = geminiResult.proposedGoal;

    const johnMsg = {
      id: `john-${Date.now()}`,
      sender: 'john',
      text: johnText,
      traces: traces.length > 0 ? traces : undefined,
      proposedGoal: proposedGoal || undefined,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    if (geminiResult.conversationId) {
      setActiveConversationId(geminiResult.conversationId);
    }

    setMessages(prev => [...prev, johnMsg]);
    setIsThinking(false);
    setExpandedTraceId(johnMsg.id);
  };

  const handleAcceptProposal = (msgId, proposedGoal) => {
    const newGoalObj = {
      id: `goal-${Date.now()}`,
      name: proposedGoal.name,
      priority: proposedGoal.priority || "MEDIUM PRIORITY",
      current: 0,
      target: proposedGoal.target,
      targetDate: "Expected in 12 months",
      category: proposedGoal.category || "Asset",
      iconType: proposedGoal.iconType || "target",
      monthlyAdd: proposedGoal.monthlyAdd || 5000
    };

    onAcceptGoal(newGoalObj);
    setAcceptedGoals(prev => ({ ...prev, [msgId]: true }));
  };

  const handleDeclineProposal = (msgId) => {
    setDeclinedGoals(prev => ({ ...prev, [msgId]: true }));
  };

  const handleNewConversation = async () => {
    try {
      const res = await conversationService.createConversation('New Financial Session');
      if (res.success && res.conversation) {
        setActiveConversationId(res.conversation.id);
        setConversations(prev => [res.conversation, ...prev]);
      }
    } catch (err) {
      // Fallback
    }
    setMessages([
      {
        id: `init-${Date.now()}`,
        sender: 'john',
        text: `Hello ${userName}! New coaching session started. How can John and the agent team assist you?`,
        timestamp: 'Just now'
      }
    ]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Coach AI Session */}
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
                backgroundColor: '#005f41',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff'
              }}>
                <Bot size={18} />
              </div>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'var(--font-serif)' }}>
                  John — Master AI Coach
                </h3>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={11} color="#059669" /> Backend Multi-Agent System Active
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                    <span>{isUser ? 'You' : 'John (Master Coach)'}</span>
                    <span>•</span>
                    <span>{msg.timestamp}</span>
                  </div>

                  {/* Message Bubble */}
                  <div style={{
                    padding: '16px 20px',
                    borderRadius: isUser ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                    backgroundColor: isUser ? '#005f41' : '#ffffff',
                    color: isUser ? '#ffffff' : '#1e293b',
                    boxShadow: isUser ? 'none' : '0 2px 8px rgba(0, 0, 0, 0.04)',
                    border: isUser ? 'none' : '1px solid #e2e8f0',
                    fontSize: '14px',
                    lineHeight: '1.6',
                    fontFamily: 'var(--font-sans)'
                  }}>
                    <FormattedText text={msg.text} />

                    {/* Intervener Card */}
                    {msg.hasIntervenerCard && msg.intervenerData && (
                      <div style={{
                        marginTop: '14px',
                        padding: '12px 16px',
                        backgroundColor: '#fffbeb',
                        border: '1px solid #fef3c7',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        color: '#92400e',
                        fontSize: '12px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Tv size={16} color="#d97706" />
                          <div>
                            <div style={{ fontWeight: '700', fontSize: '11px', letterSpacing: '0.05em', color: '#b45309' }}>
                              {msg.intervenerData.agent}
                            </div>
                            <div style={{ fontWeight: '600' }}>{msg.intervenerData.title}</div>
                            <div style={{ color: '#b45309' }}>{msg.intervenerData.detail}</div>
                          </div>
                        </div>
                        <button 
                          onClick={() => setActiveTab('iris')}
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#d97706',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: 'var(--radius-sm)',
                            fontWeight: '600',
                            cursor: 'pointer',
                            fontSize: '11px'
                          }}
                        >
                          {msg.intervenerData.action}
                        </button>
                      </div>
                    )}

                    {/* Reasoning Trace Accordion */}
                    {msg.traces && msg.traces.length > 0 && (
                      <div style={{ marginTop: '16px', borderTop: '1px dashed #cbd5e1', paddingTop: '12px' }}>
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
                          <span>Multi-Agent Reasoning Trace ({msg.traces.length} Agents)</span>
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
                                    backgroundColor: 'var(--bg-surface-hover)',
                                    borderRadius: 'var(--radius-sm)',
                                    borderLeft: `3px solid ${agentColor}`,
                                    fontSize: '12px'
                                  }}
                                >
                                  <div style={{ fontWeight: '700', color: agentColor, marginBottom: '2px' }}>
                                    {agentDisplay} ({trace.role || 'Specialist'})
                                  </div>
                                  <div style={{ color: '#334155' }}>{trace.thought}</div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Proposed Savings Goal Card */}
                    {msg.proposedGoal && (
                      <div style={{
                        marginTop: '16px',
                        padding: '16px',
                        backgroundColor: 'var(--agent-john-glow)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                        color: 'var(--text-secondary)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <Target size={18} color="#059669" />
                          <span style={{ fontWeight: '700', fontSize: '13px' }}>John Proposes a New Savings Objective</span>
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>
                          {msg.proposedGoal.name}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          Target Amount: <strong>{currency}{msg.proposedGoal.target.toLocaleString()}</strong> • Priority: {msg.proposedGoal.priority || 'MEDIUM'}
                        </div>

                        {/* Proposal Actions */}
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
                                Accept & Create Goal
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

            {/* Thinking Indicator */}
            {isThinking && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px' }}>
                <Bot size={18} color="#059669" />
                <span className="spin"></span>
                <span>John (Master Coach) is synthesizing agent intelligence via backend API...</span>
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
                placeholder="Ask John about your spending, budget, or savings goals..."
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
