import React, { useState } from 'react';
import { Send, Square, AlertCircle, Settings } from 'lucide-react';

export default function Composer({
  onSend,
  onStop,
  isStreaming,
  consentEnabled = true,
  onOpenSettings,
}) {
  const [text, setText] = useState('');

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (!text.trim() || isStreaming || !consentEnabled) return;
    onSend(text.trim());
    setText('');
  };

  if (!consentEnabled) {
    return (
      <div
        style={{
          padding: '16px 20px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'rgba(217, 119, 6, 0.08)',
          border: '1px solid rgba(217, 119, 6, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertCircle size={18} color="#d97706" />
          <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
            AI chat is disabled per your consent preferences. Workspaces continue to operate with 100% deterministic rules.
          </span>
        </div>
        <button
          onClick={onOpenSettings}
          className="btn btn-secondary btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Settings size={13} />
          <span>Enable in Settings</span>
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: '10px',
        backgroundColor: 'var(--bg-primary)',
        padding: '10px 14px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-color)',
      }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isStreaming ? 'John is responding...' : 'Ask John about your finances, budget, or goals...'}
        disabled={isStreaming}
        rows={1}
        maxLength={2000}
        style={{
          flex: 1,
          backgroundColor: 'transparent',
          border: 'none',
          outline: 'none',
          resize: 'none',
          color: 'var(--text-primary)',
          fontSize: '13px',
          lineHeight: '1.5',
          fontFamily: 'inherit',
          maxHeight: '120px',
          overflowY: 'auto',
        }}
      />

      {isStreaming ? (
        <button
          onClick={onStop}
          className="btn btn-secondary btn-sm"
          title="Stop streaming response"
          style={{ padding: '6px 10px', color: '#dc2626' }}
        >
          <Square size={14} />
          <span>Stop</span>
        </button>
      ) : (
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          className="btn btn-primary btn-sm"
          style={{ padding: '6px 12px' }}
        >
          <Send size={14} />
          <span>Send</span>
        </button>
      )}
    </div>
  );
}
