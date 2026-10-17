import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bot,
  Zap,
  Calendar,
  AlertTriangle,
  RefreshCw,
  Compass,
  Sparkles,
} from 'lucide-react';
import { api } from '../../services/api/v1';
import { streamChat } from '../../services/api/sse';
import { formatMinorInr } from '../../lib/format';
import MessageList from './MessageList';
import ThreadList from './ThreadList';
import Composer from './Composer';

export default function JohnWorkspace({
  userProfile,
  onNavigateToWorkspace,
  explainAlertId,
}) {
  const [healthStrip, setHealthStrip] = useState(null);
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [partialBlocks, setPartialBlocks] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');

  const abortControllerRef = useRef(null);

  // Load John authoritative health strip (GET /api/v1/workspaces/john)
  const loadHealthStrip = useCallback(async () => {
    try {
      const res = await api.getJohnHealthStrip();
      setHealthStrip(res);
    } catch (err) {
      console.warn('Could not load John health strip:', err);
    }
  }, []);

  useEffect(() => {
    loadHealthStrip();
  }, [loadHealthStrip]);

  // Initial welcome message (clean, no synthetic figures)
  useEffect(() => {
    const userName = userProfile?.name || userProfile?.display_name || 'Account Holder';
    setMessages([
      {
        id: 'init-turn',
        sender: 'john',
        specialist: 'John — Star Orchestrator',
        blocks: [
          {
            kind: 'TEXT',
            text: `Hello ${userName}! I am **John**, your Star-Topology Financial Coach.\n\nI orchestrate **Sentinel** (verified deterministic arithmetic), **Atlas** (savings targets & SIP), **Nova** (budget caps & rebalancing), and **Iris** (forward spending plans).\n\nHow can our specialist team help guide your finances today?`,
          },
        ],
      },
    ]);
  }, [userProfile]);

  // Trigger alert explain if explainAlertId is passed
  useEffect(() => {
    if (explainAlertId) {
      handleSendAlertExplain(explainAlertId);
    }
  }, [explainAlertId]);

  const handleSendAlertExplain = (alertId) => {
    handleSend('Explain this alert', {
      trigger: { kind: 'ALERT_OPEN', alert_id: alertId },
      ui_context: { workspace: 'NOVA', selected_alert_id: alertId },
    });
  };

  const handleSend = async (messageText, customPayload = {}) => {
    if (isStreaming) return;
    setErrorMsg('');

    const userMessageId = `msg_${Date.now()}`;
    const userTurn = {
      id: userMessageId,
      sender: 'user',
      text: messageText,
    };
    setMessages((prev) => [...prev, userTurn]);
    setIsStreaming(true);
    setPartialBlocks([]);

    const clientMsgId = `cln_${Date.now()}`;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const requestBody = {
      thread_id: activeThreadId,
      message: messageText,
      client_message_id: clientMsgId,
      trigger: customPayload.trigger || { kind: 'USER_MESSAGE' },
      ui_context: customPayload.ui_context || { workspace: 'JOHN' },
      ...customPayload,
    };

    const currentBlocks = [];

    try {
      await streamChat({
        body: requestBody,
        signal: controller.signal,
        onBlock: (block) => {
          currentBlocks.push(block);
          setPartialBlocks([...currentBlocks]);
        },
        onDone: (doneEvent) => {
          setIsStreaming(false);
          const assistantTurn = {
            id: doneEvent.turn_id || `turn_${Date.now()}`,
            sender: 'john',
            specialist: 'John (Star Orchestrator)',
            blocks: currentBlocks.length > 0 ? currentBlocks : [{ kind: 'TEXT', text: doneEvent.raw?.reply || 'Done.' }],
          };
          setMessages((prev) => [...prev, assistantTurn]);
          setPartialBlocks([]);
          loadHealthStrip();
        },
        onError: (err) => {
          setIsStreaming(false);
          setErrorMsg(err.message || 'Stream error occurred.');
          if (currentBlocks.length > 0) {
            setMessages((prev) => [
              ...prev,
              {
                id: `turn_err_${Date.now()}`,
                sender: 'john',
                blocks: [
                  ...currentBlocks,
                  { kind: 'NOTICE', severity: 'WARNING', text: 'Response interrupted.' },
                ],
              },
            ]);
          }
        },
      });
    } catch (err) {
      setIsStreaming(false);
      if (err.name !== 'AbortError') {
        setErrorMsg(err.message || 'Communication error.');
      }
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  };

  const handleAnswerQuestion = (questionId, optionId, label) => {
    handleSend(label, {
      answer_to: { question_id: questionId, option_id: optionId },
    });
  };

  // Health strip fields
  const surplusMinor = healthStrip?.surplus?.data?.expected_surplus_signed_minor ?? 0;
  const conservativeSurplusMinor = healthStrip?.surplus?.data?.conservative_surplus_signed_minor ?? 0;
  const upcomingBillsTotal = healthStrip?.bills?.data?.total_outlays_minor ?? 0;
  const cashflowRisk = healthStrip?.cashflow?.data?.risk_level || 'LOW';

  const consentEnabled = userProfile?.llm_processing_consent !== false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Authoritative Health Strip (S-04) */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '600' }}>
                Monthly Expected Surplus
              </div>
              <div className="mono" style={{ fontSize: '18px', fontWeight: '800', color: 'var(--accent-emerald)', marginTop: '2px' }}>
                {formatMinorInr(surplusMinor)}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Conservative: {formatMinorInr(conservativeSurplusMinor)}
              </div>
            </div>

            <div style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '24px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '600' }}>
                Upcoming 30-Day Bills
              </div>
              <div className="mono" style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '2px' }}>
                {formatMinorInr(upcomingBillsTotal)}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                Detected & declared recurring outlays
              </div>
            </div>

            <div style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '24px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '600' }}>
                Cash-Flow Risk Level
              </div>
              <div style={{ marginTop: '4px' }}>
                <span
                  className="badge"
                  style={{
                    backgroundColor:
                      cashflowRisk === 'HIGH'
                        ? 'rgba(220, 38, 38, 0.15)'
                        : cashflowRisk === 'MEDIUM'
                        ? 'rgba(217, 119, 6, 0.15)'
                        : 'rgba(5, 150, 105, 0.15)',
                    color:
                      cashflowRisk === 'HIGH'
                        ? '#dc2626'
                        : cashflowRisk === 'MEDIUM'
                        ? '#d97706'
                        : '#059669',
                    fontWeight: '700',
                    fontSize: '11px',
                  }}
                >
                  {cashflowRisk} Risk
                </span>
              </div>
            </div>
          </div>

          <button onClick={loadHealthStrip} className="btn btn-ghost btn-sm" title="Refresh Health Strip">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {errorMsg && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'rgba(220, 38, 38, 0.1)',
            border: '1px solid #dc2626',
            color: '#dc2626',
            fontSize: '12px',
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Main Chat Grid (Thread List & Message Area) */}
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '16px', minHeight: '520px' }}>
        {/* Threads Sidebar */}
        <div className="card" style={{ padding: '16px' }}>
          <ThreadList
            threads={threads}
            activeThreadId={activeThreadId}
            onSelectThread={(id) => setActiveThreadId(id)}
            onNewThread={() => {
              setActiveThreadId(null);
              setMessages([]);
            }}
          />
        </div>

        {/* Chat Thread Panel */}
        <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          {/* Scrollable message turns */}
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: '480px' }}>
            <MessageList
              messages={messages}
              isStreaming={isStreaming}
              partialBlocks={partialBlocks}
              onNavigateToWorkspace={onNavigateToWorkspace}
              onAnswerQuestion={handleAnswerQuestion}
              onActionExecuted={loadHealthStrip}
            />
          </div>

          {/* Quick Prompts Strip (Zero synthetic figures per P-AC-01) */}
          <div
            style={{
              display: 'flex',
              gap: '6px',
              padding: '8px 0',
              overflowX: 'auto',
              borderTop: '1px solid var(--border-color)',
              marginBottom: '10px',
            }}
          >
            {[
              'How healthy are my finances?',
              'What are my upcoming bills?',
              'Show me my active savings goals',
              'Can I afford a new purchase this month?',
            ].map((p, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(p)}
                disabled={isStreaming || !consentEnabled}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '11px', whiteSpace: 'nowrap' }}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Composer */}
          <Composer
            onSend={(text) => handleSend(text)}
            onStop={handleStop}
            isStreaming={isStreaming}
            consentEnabled={consentEnabled}
            onOpenSettings={() => {
              if (onNavigateToWorkspace) onNavigateToWorkspace('settings');
            }}
          />
        </div>
      </div>
    </div>
  );
}
