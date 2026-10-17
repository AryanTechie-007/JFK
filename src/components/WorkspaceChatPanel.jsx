import React, { useState, useRef, useEffect } from 'react';
import { Send, MessageSquare, Sparkles, Square } from 'lucide-react';
import { streamChat } from '../services/api/sse';
import BlockRenderer from '../workspaces/john/BlockRenderer';

export default function WorkspaceChatPanel({
  workspace = 'SENTINEL',
  onActionExecuted,
  onNavigateToWorkspace,
}) {
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [messages, setMessages] = useState([]);
  const [partialBlocks, setPartialBlocks] = useState([]);
  const abortControllerRef = useRef(null);

  const handleSend = async (customText) => {
    const query = (customText ?? input).trim();
    if (!query || isStreaming) return;
    if (!customText) setInput('');

    setMessages((prev) => [...prev, { role: 'user', text: query }]);
    setIsStreaming(true);
    setPartialBlocks([]);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const currentBlocks = [];

    try {
      await streamChat({
        body: {
          message: query,
          ui_context: { workspace },
          trigger: { kind: 'USER_MESSAGE' },
        },
        signal: controller.signal,
        onBlock: (block) => {
          currentBlocks.push(block);
          setPartialBlocks([...currentBlocks]);
        },
        onDone: (doneEvent) => {
          setIsStreaming(false);
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              blocks: currentBlocks.length > 0 ? currentBlocks : [{ kind: 'TEXT', text: doneEvent.raw?.reply || 'Done.' }],
            },
          ]);
          setPartialBlocks([]);
          if (onActionExecuted) onActionExecuted();
        },
        onError: (err) => {
          setIsStreaming(false);
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              blocks: [
                ...currentBlocks,
                { kind: 'NOTICE', severity: 'WARNING', text: err.message || 'Stream interrupted.' },
              ],
            },
          ]);
        },
      });
    } catch {
      setIsStreaming(false);
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--bg-primary)',
        padding: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>
        <MessageSquare size={16} color="var(--accent-emerald)" />
        <span>Ask John about {workspace.charAt(0) + workspace.slice(1).toLowerCase()}</span>
      </div>

      {/* Messages */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
        {messages.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '12px', padding: '12px 0' }}>
            Ask a question about this workspace. Responses are grounded by {workspace.charAt(0) + workspace.slice(1).toLowerCase()} deterministic figures.
          </div>
        ) : (
          messages.map((m, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: m.role === 'user' ? 'flex-end' : 'flex-start',
                gap: '4px',
              }}
            >
              <div
                style={{
                  maxWidth: '90%',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: m.role === 'user' ? 'var(--bg-tertiary)' : 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  fontSize: '12px',
                }}
              >
                {Array.isArray(m.blocks) ? (
                  m.blocks.map((blk, bIdx) => (
                    <BlockRenderer
                      key={bIdx}
                      block={blk}
                      onNavigateToWorkspace={onNavigateToWorkspace}
                      onActionExecuted={onActionExecuted}
                    />
                  ))
                ) : (
                  <div>{m.text}</div>
                )}
              </div>
            </div>
          ))
        )}

        {isStreaming && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--accent-emerald)' }}>
            <Sparkles size={12} className="spin" />
            <span>Consulting {workspace}...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend();
          }}
          placeholder="Ask a question..."
          className="input"
          disabled={isStreaming}
          style={{ flex: 1, fontSize: '12px' }}
        />

        {isStreaming ? (
          <button onClick={handleStop} className="btn btn-secondary btn-sm" style={{ color: '#dc2626' }}>
            <Square size={13} />
          </button>
        ) : (
          <button onClick={() => handleSend()} disabled={!input.trim()} className="btn btn-primary btn-sm">
            <Send size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
