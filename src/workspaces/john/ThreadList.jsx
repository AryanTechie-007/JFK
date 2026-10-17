import React from 'react';
import { Plus, MessageSquare, Clock } from 'lucide-react';
import { formatDate } from '../../lib/format';

export default function ThreadList({
  threads = [],
  activeThreadId,
  onSelectThread,
  onNewThread,
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        height: '100%',
      }}
    >
      <button
        onClick={onNewThread}
        className="btn btn-primary"
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
      >
        <Plus size={15} />
        <span>New Consultation</span>
      </button>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {threads.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
            No previous conversations.
          </div>
        ) : (
          threads.map((t) => {
            const isActive = t.thread_id === activeThreadId || t.id === activeThreadId;
            return (
              <button
                key={t.thread_id || t.id}
                onClick={() => onSelectThread(t.thread_id || t.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: isActive ? 'var(--bg-tertiary)' : 'transparent',
                  border: '1px solid',
                  borderColor: isActive ? 'var(--border-focus)' : 'var(--border-color)',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '12px',
                  width: '100%',
                }}
              >
                <MessageSquare size={14} color={isActive ? 'var(--accent-emerald)' : 'var(--text-muted)'} />
                <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <div style={{ fontWeight: isActive ? '700' : '500' }}>
                    {t.title || t.subject || 'Financial Turn'}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {formatDate(t.updated_at || t.created_at)}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
