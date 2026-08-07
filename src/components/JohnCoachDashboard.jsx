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
  XCircle
} from 'lucide-react';
import { 
  USER_PROFILE, 
  AGENTS, 
  SAMPLE_QUERIES, 
  runOrchestratorQuery 
} from '../data/mockFinancialData';
import { askGeminiJohn } from '../services/geminiService';
import FormattedText from './FormattedText';

export default function JohnCoachDashboard({ goals, onAcceptGoal, setActiveTab }) {
  const [messages, setMessages] = useState([
    {
      id: 'init-1',
      sender: 'john',
      text: `Hello ${USER_PROFILE.name}! 👋 I am **John**, your Master AI Financial Coach powered by Gemini.\n\nI have analyzed your recent transactions alongside **Sentinel**, **Iris**, **Atlas**, and **Nova**:\n\n- **Monthly Net Surplus**: ₹20,800 (27.7% rate)\n- **Financial Health Score**: **84/100** (Excellent)\n- **Sentinel Alert**: Predicted car insurance bill of ₹12,000 due next month.\n\nHow can our team help guide your money decisions today?`,
      hasIntervenerCard: true,
      intervenerData: {
        agent: "INTERVENER AGENT",
        title: "Unused Subscriptions Detected",
        detail: "3 streaming services haven't been used in 45 days.",
        action: "Review & Cancel"
      },
      timestamp: 'Just now'
    }
  ]);

  const [inputQuery, setInputQuery] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [expandedTraceId, setExpandedTraceId] = useState(null);
  const [acceptedGoals, setAcceptedGoals] = useState({});
  const [declinedGoals, setDeclinedGoals] = useState({});
  const chatEndRef = useRef(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking]);

  const handleSend = async (textToSend) => {
    const queryText = textToSend || inputQuery;
    if (!queryText.trim()) return;

    const userMsg = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: queryText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    if (!textToSend) setInputQuery('');
    setIsThinking(true);

    // Run local orchestrator engine to generate agent traces & proposed goals
    const localResult = runOrchestratorQuery(queryText);

    // Call Gemini API powered by user key
    const geminiResult = await askGeminiJohn(queryText, USER_PROFILE, goals);

    const johnText = geminiResult.success ? geminiResult.text : localResult.johnResponse;

    const johnMsg = {
      id: `john-${Date.now()}`,
      sender: 'john',
      text: johnText,
      traces: localResult.traces,
      proposedGoal: localResult.proposedGoal,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

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
      targetDate: "Expected by Dec 2026",
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Main Layout Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px' }}>
        
        {/* Left Column: Coach AI Session */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '670px', padding: 0 }}>
          
          {/* Header */}
          <div style={{
            padding: '16px 24px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#ffffff',
            borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#d1fae5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#059669'
              }}>
                <Bot size={18} />
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', letterSpacing: '0.04em', fontFamily: 'var(--font-mono)' }}>
                  COACH AI (GEMINI POWERED)
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span className="status-dot active"></span> Active & Monitoring
                </div>
              </div>
            </div>

            <div style={{ fontSize: '11px', color: '#059669', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-mono)' }}>
              <Sparkles size={13} /> Gemini 1.5 Flash Active
            </div>
          </div>

          {/* Messages Container */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            backgroundColor: '#f8fafc'
          }}>
            {messages.map((msg) => (
              <div 
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start'
                }}
              >
                {/* Message Bubble with FormattedText component to fix LaTeX/bolding glitches */}
                <div style={{
                  maxWidth: '85%',
                  backgroundColor: msg.sender === 'user' ? '#005f41' : '#ffffff',
                  color: msg.sender === 'user' ? '#ffffff' : '#0f172a',
                  padding: '16px 20px',
                  borderRadius: msg.sender === 'user' ? '18px 18px 2px 18px' : '18px 18px 18px 2px',
                  border: msg.sender === 'user' ? 'none' : '1px solid #e2e8f0',
                  fontSize: '13px',
                  boxShadow: msg.sender === 'user' ? 'none' : '0 1px 3px rgba(0,0,0,0.04)'
                }}>
                  <FormattedText text={msg.text} />

                  {/* Inline Intervener Card */}
                  {msg.hasIntervenerCard && (
                    <div style={{
                      marginTop: '14px',
                      padding: '14px',
                      backgroundColor: '#f1f5f9',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
                          {msg.intervenerData.agent}
                        </span>
                        <TrendingUp size={14} color="#d97706" />
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>
                        {msg.intervenerData.title}
                      </div>
                      <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
                        {msg.intervenerData.detail}
                      </div>
                      <button 
                        onClick={() => handleSend("Show me the breakdown of those subscriptions.")}
                        className="btn btn-emerald btn-sm"
                        style={{ marginTop: '10px' }}
                      >
                        {msg.intervenerData.action}
                      </button>
                    </div>
                  )}

                  {/* Proposed Goal Option Card (Asking User Consent) */}
                  {msg.proposedGoal && (
                    <div style={{
                      marginTop: '14px',
                      padding: '16px',
                      backgroundColor: acceptedGoals[msg.id] ? '#d1fae5' : declinedGoals[msg.id] ? '#f1f5f9' : '#f8fafc',
                      borderRadius: '12px',
                      border: `1px solid ${acceptedGoals[msg.id] ? '#a7f3d0' : '#cbd5e1'}`
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                        <Target size={16} color="#059669" />
                        <span style={{ fontSize: '11px', fontWeight: '700', color: '#059669', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
                          JOHN PROPOSES A SAVINGS GOAL
                        </span>
                      </div>

                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>
                        {msg.proposedGoal.name}
                      </div>
                      
                      <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px', display: 'flex', gap: '12px' }}>
                        <span>Target: <strong className="mono" style={{ color: '#059669' }}>₹{msg.proposedGoal.target.toLocaleString()}</strong></span>
                        <span>Monthly: <strong className="mono" style={{ color: '#059669' }}>₹{msg.proposedGoal.monthlyAdd.toLocaleString()}/mo</strong></span>
                      </div>

                      {acceptedGoals[msg.id] ? (
                        <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px', color: '#065f46', fontWeight: '700', fontSize: '12px' }}>
                          <CheckCircle2 size={16} />
                          <span>Goal Accepted & Added to Saving Strategist!</span>
                          <button onClick={() => setActiveTab('atlas')} className="btn btn-emerald btn-sm" style={{ marginLeft: 'auto' }}>
                            View in Goals →
                          </button>
                        </div>
                      ) : declinedGoals[msg.id] ? (
                        <div style={{ marginTop: '10px', color: '#64748b', fontSize: '12px', fontStyle: 'italic' }}>
                          Goal Proposal Declined.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                          <button 
                            onClick={() => handleAcceptProposal(msg.id, msg.proposedGoal)}
                            className="btn btn-emerald btn-sm"
                          >
                            <CheckCircle2 size={14} />
                            <span>Accept & Create Goal</span>
                          </button>

                          <button 
                            onClick={() => handleDeclineProposal(msg.id)}
                            className="btn btn-secondary btn-sm"
                          >
                            <span>Decline</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Reasoning Trace Accordion with clean arrow symbols */}
                {msg.traces && (
                  <div style={{ maxWidth: '85%', marginTop: '8px', width: '100%' }}>
                    <button
                      onClick={() => setExpandedTraceId(expandedTraceId === msg.id ? null : msg.id)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        backgroundColor: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        fontSize: '12px',
                        color: '#475569'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Sparkles size={13} color="#059669" />
                        <span style={{ fontWeight: '600' }}>Multi-Agent Reasoning Trace (Sentinel → Iris → Atlas → Nova)</span>
                      </div>
                      {expandedTraceId === msg.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>

                    {expandedTraceId === msg.id && (
                      <div style={{
                        marginTop: '6px',
                        padding: '12px',
                        backgroundColor: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}>
                        {msg.traces.map((trace, idx) => (
                          <div 
                            key={idx}
                            style={{
                              padding: '8px 10px',
                              backgroundColor: '#f8fafc',
                              borderRadius: '6px',
                              borderLeft: `3px solid ${trace.agent.color}`
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '11px', fontWeight: '700', color: trace.agent.color }}>
                                {trace.agent.avatar} {trace.title}
                              </span>
                            </div>
                            <p style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>
                              {trace.insight}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {isThinking && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px' }}>
                <span className="status-dot active"></span>
                <span style={{ fontSize: '12px', color: '#64748b' }}>John (Gemini 1.5 Flash) is synthesizing agent intelligence...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick Prompts */}
          <div style={{
            padding: '10px 16px',
            backgroundColor: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            gap: '8px',
            overflowX: 'auto'
          }}>
            {SAMPLE_QUERIES.map((sq, i) => (
              <button
                key={i}
                onClick={() => handleSend(sq.query)}
                className="btn btn-secondary btn-sm"
                style={{ flexShrink: 0, fontSize: '11px' }}
              >
                <span>{sq.label}</span>
              </button>
            ))}
          </div>

          {/* Input Box */}
          <div style={{
            padding: '16px 20px',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            gap: '12px',
            backgroundColor: '#ffffff',
            borderRadius: '0 0 var(--radius-lg) var(--radius-lg)'
          }}>
            <input
              type="text"
              className="input"
              style={{ borderRadius: '24px', paddingLeft: '18px' }}
              placeholder="Ask John (Gemini AI) about your spending, budget, or savings..."
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            />
            <button 
              onClick={() => handleSend()}
              className="btn btn-emerald"
              style={{ borderRadius: '50%', width: '42px', height: '42px', padding: 0, flexShrink: 0 }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>

        {/* Right Column: Observer & Predictor Stat Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="card" style={{ padding: '16px', borderLeft: '3px solid #64748b' }}>
              <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                OBSERVER AGENT
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Monthly Income</div>
              <div className="mono" style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', marginTop: '4px' }}>
                ₹75,000
              </div>
            </div>

            <div className="card" style={{ padding: '16px', borderLeft: '3px solid #dc2626' }}>
              <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                OBSERVER AGENT
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Current Spending</div>
              <div className="mono" style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', marginTop: '4px' }}>
                ₹52,400
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                PREDICTOR AI (BACKGROUND)
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Savings Rate</div>
              <div className="mono" style={{ fontSize: '24px', fontWeight: '700', color: '#0f172a', marginTop: '4px' }}>
                30%
              </div>
            </div>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              backgroundColor: '#d1fae5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#059669'
            }}>
              <TrendingUp size={20} />
            </div>
          </div>

          <div className="card" style={{ padding: '18px' }}>
            <div style={{ fontSize: '10px', fontWeight: '700', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
              LEARNER AI
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Financial Health Score</div>
            <div className="mono" style={{ fontSize: '32px', fontWeight: '700', color: '#059669', marginTop: '6px' }}>
              82 <span style={{ fontSize: '14px', color: '#64748b' }}>/ 100</span>
            </div>
            <div className="progress-track" style={{ height: '8px', marginTop: '10px' }}>
              <div className="progress-fill" style={{ width: '82%', backgroundColor: '#059669' }} />
            </div>
          </div>

          <div className="card" style={{ padding: '18px' }}>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)' }}>
              JOHN'S RECOMMENDATIONS
            </div>

            <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              
              <div style={{
                padding: '12px',
                backgroundColor: '#f8fafc',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                display: 'flex',
                gap: '12px',
                alignItems: 'center'
              }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '6px', backgroundColor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Tv size={16} color="#475569" />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>Reduce Subscriptions</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Potential save: <strong style={{ color: '#059669' }}>₹1,200/mo</strong></div>
                </div>
              </div>

              <div style={{
                padding: '12px',
                backgroundColor: '#f8fafc',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                display: 'flex',
                gap: '12px',
                alignItems: 'center'
              }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '6px', backgroundColor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ShieldCheck size={16} color="#475569" />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>Increase Emergency Fund</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Shift ₹2,000 from discretionary</div>
                </div>
              </div>

              <div style={{
                padding: '12px',
                backgroundColor: '#f8fafc',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                display: 'flex',
                gap: '12px',
                alignItems: 'center'
              }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '6px', backgroundColor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Utensils size={16} color="#475569" />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>Optimize Food Spending</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Dining out is up 15% this week</div>
                </div>
              </div>

            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
