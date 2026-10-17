import React, { useEffect, useRef } from 'react';
import { Bot, User, Sparkles, AlertCircle } from 'lucide-react';
import BlockRenderer from './BlockRenderer';

export default function MessageList({
  messages = [],
  isStreaming = false,
  partialBlocks = [],
  onNavigateToWorkspace,
  onAnswerQuestion,
  onActionExecuted,
}) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming, partialBlocks]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        padding: '16px 0',
        minHeight: '280px',
      }}
    >
      {messages.map((turn, turnIdx) => {
        const isUser = turn.sender === 'user' || turn.role === 'user';
        return (
          <div
            key={turn.id || turnIdx}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: isUser ? 'flex-end' : 'flex-start',
              gap: '6px',
            }}
          >
            {/* Header label with icon */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
              {isUser ? (
                <>
                  <span>You</span>
                  <User size={12} />
                </>
              ) : (
                <>
                  <Bot size={13} color="var(--accent-emerald)" />
                  <span style={{ fontWeight: '700', color: 'var(--text-secondary)' }}>
                    {turn.specialist || 'John (Star Orchestrator)'}
                  </span>
                </>
              )}
            </div>

            {/* Bubble */}
            <div
              style={{
                maxWidth: '85%',
                padding: '14px 18px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: isUser ? 'var(--bg-tertiary)' : 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                boxShadow: isUser ? 'none' : '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              {Array.isArray(turn.blocks) && turn.blocks.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {turn.blocks.map((block, blkIdx) => (
                    <BlockRenderer
                      key={blkIdx}
                      block={block}
                      onNavigateToWorkspace={onNavigateToWorkspace}
                      onAnswerQuestion={onAnswerQuestion}
                      onActionExecuted={onActionExecuted}
                    />
                  ))}
                </div>
              ) : (
                <BlockRenderer
                  block={{ kind: 'TEXT', text: turn.text || turn.message || turn.content || '' }}
                  onNavigateToWorkspace={onNavigateToWorkspace}
                  onAnswerQuestion={onAnswerQuestion}
                  onActionExecuted={onActionExecuted}
                />
              )}
            </div>
          </div>
        );
      })}

      {/* In-Flight Streaming Blocks */}
      {isStreaming && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--accent-emerald)' }}>
            <Sparkles size={13} className="spin" />
            <span style={{ fontWeight: '600' }}>John is analyzing snapshot...</span>
          </div>
          <div
            style={{
              maxWidth: '85%',
              padding: '14px 18px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              fontSize: '13px',
            }}
          >
            {partialBlocks.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {partialBlocks.map((block, idx) => (
                  <BlockRenderer
                    key={idx}
                    block={block}
                    onNavigateToWorkspace={onNavigateToWorkspace}
                    onAnswerQuestion={onAnswerQuestion}
                    onActionExecuted={onActionExecuted}
                  />
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic' }}>
                Formulating deterministic response across specialists...
              </div>
            )}
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
