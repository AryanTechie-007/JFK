import React, { useState } from 'react';
import { Send, CheckCircle2, RotateCcw, AlertCircle, MessageSquare } from 'lucide-react';
import { workspaceService } from '../services/workspaceService';
import FormattedText from './FormattedText';

export default function WorkspaceChatPanel({
  workspace = 'JOHN',
  title = 'Ask John in this Workspace',
  placeholder = 'Ask a question about this view...',
  onActionExecuted,
}) {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [executingProposalId, setExecutingProposalId] = useState(null);
  const [lastUndoActionId, setLastUndoActionId] = useState(null);

  const handleSend = async (customText) => {
    const query = (customText ?? input).trim();
    if (!query || isLoading) return;
    if (!customText) setInput('');

    setMessages((prev) => [...prev, { role: 'user', text: query }]);
    setIsLoading(true);

    try {
      const res = await workspaceService.sendChat(query, workspace);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: res.reply || res.text || '',
          blocks: res.blocks || [],
          proposals: res.proposals || [],
          snapshot_id: res.snapshot_id,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `Could not reach backend: ${err.message}`,
          blocks: [],
          proposals: [],
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmProposal = async (proposal) => {
    setExecutingProposalId(proposal.proposal_id);
    try {
      const res = await workspaceService.executeAction({
        proposal_id: proposal.proposal_id,
        confirmation_token: proposal.confirmation_token,
        action_type: proposal.action_type,
        params: proposal.params,
        acknowledged_warnings: true,
      });

      if (res.status === 'EXECUTED' || res.status === 'DUPLICATE') {
        if (res.undo_available && res.action_id) {
          setLastUndoActionId(res.action_id);
        }
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: `Confirmed and executed **${proposal.action_type}**.`,
            blocks: [],
            proposals: [],
          },
        ]);
        if (onActionExecuted) onActionExecuted(res);
      } else {
        const reason =
          res.rejection_reasons?.[0]?.message ||
          res.message_data?.reason ||
          res.status;
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: `Action could not be executed: ${reason}`,
            blocks: [],
            proposals: [],
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `Execution failed: ${err.message}`,
          blocks: [],
          proposals: [],
        },
      ]);
    } finally {
      setExecutingProposalId(null);
    }
  };

  const handleUndo = async () => {
    if (!lastUndoActionId) return;
    try {
      const res = await workspaceService.undoAction(lastUndoActionId);
      if (res.ok) {
        setLastUndoActionId(null);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: 'Previous action has been undone and state restored.',
            blocks: [],
            proposals: [],
          },
        ]);
        if (onActionExecuted) onActionExecuted(res);
      }
    } catch (_) {}
  };

  return (
    <div
      className="card"
      style={{
        marginTop: '24px',
        padding: '20px',
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <MessageSquare size={18} color="var(--accent-emerald)" />
          <span
            style={{
              fontSize: '15px',
              fontWeight: '700',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-serif)',
            }}
          >
            {title}
          </span>
          <span
            className="badge"
            style={{
              fontSize: '10px',
              padding: '2px 8px',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)',
            }}
          >
            Context: {workspace}
          </span>
        </div>

        {lastUndoActionId && (
          <button
            onClick={handleUndo}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
          >
            <RotateCcw size={13} />
            Undo Last Change
          </button>
        )}
      </div>

      {messages.length > 0 && (
        <div
          style={{
            maxHeight: '280px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            marginBottom: '14px',
            padding: '12px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
          }}
        >
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '88%',
                padding: '10px 14px',
                borderRadius: '10px',
                backgroundColor:
                  msg.role === 'user' ? 'var(--accent-emerald)' : 'var(--bg-card)',
                color: msg.role === 'user' ? '#ffffff' : 'var(--text-primary)',
                border:
                  msg.role === 'user' ? 'none' : '1px solid var(--border-color)',
                fontSize: '13px',
                lineHeight: '1.5',
              }}
            >
              <FormattedText text={msg.text} />

              {/* Render Question Options if present */}
              {Array.isArray(msg.blocks) &&
                msg.blocks
                  .filter((b) => b.kind === 'QUESTION')
                  .map((q, qi) => (
                    <div key={qi} style={{ marginTop: '10px' }}>
                      <div style={{ fontWeight: '600', marginBottom: '6px' }}>
                        {q.prompt}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {(q.options || []).map((opt) => (
                          <button
                            key={opt.option_id}
                            onClick={() => handleSend(opt.label)}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '12px' }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}

              {/* Render Confirmation Cards / Chips */}
              {Array.isArray(msg.proposals) &&
                msg.proposals.map((prop) => (
                  <div
                    key={prop.proposal_id}
                    style={{
                      marginTop: '10px',
                      padding: '12px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--accent-emerald)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '6px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: '700',
                          color: 'var(--accent-emerald)',
                        }}
                      >
                        {prop.tier} PROPOSAL — {prop.action_type}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        From {prop.proposer}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: '12px',
                        color: 'var(--text-secondary)',
                        marginBottom: '10px',
                      }}
                    >
                      {prop.rationale?.text || prop.rationale}
                    </div>
                    <button
                      onClick={() => handleConfirmProposal(prop)}
                      disabled={executingProposalId === prop.proposal_id}
                      className="btn btn-primary btn-sm"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12px',
                      }}
                    >
                      <CheckCircle2 size={14} />
                      {executingProposalId === prop.proposal_id
                        ? 'Confirming...'
                        : prop.tier === 'T3'
                        ? 'Acknowledge & Confirm Delete'
                        : 'Confirm & Apply'}
                    </button>
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px' }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={placeholder}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontSize: '13px',
          }}
        />
        <button
          onClick={() => handleSend()}
          disabled={isLoading || !input.trim()}
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Send size={15} />
          {isLoading ? 'Thinking...' : 'Ask'}
        </button>
      </div>
    </div>
  );
}
