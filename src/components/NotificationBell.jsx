import React, { useState, useEffect, useRef } from 'react';
import { Bell, AlertTriangle, ShieldAlert, Check, ExternalLink } from 'lucide-react';
import { api } from '../services/api/v1';
import { formatDate } from '../lib/format';

export default function NotificationBell({ onNavigateToWorkspace, onExplainAlert }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef(null);

  const fetchFeed = async () => {
    try {
      const res = await api.getNotifications();
      const items = res?.notifications || res?.data || [];
      setNotifications(items);
      setUnreadCount(items.filter((n) => !n.read).length);
    } catch {
      // Fail closed, empty feed
    }
  };

  useEffect(() => {
    fetchFeed();

    // Poll every 5 seconds while window is focused (Doc 7 S-11)
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hasFocus()) {
        fetchFeed();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="btn btn-ghost btn-sm"
        title="Notifications Feed"
        style={{ position: 'relative', padding: '6px 8px' }}
      >
        <Bell size={16} color="var(--text-secondary)" />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '2px',
              right: '2px',
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              backgroundColor: '#dc2626',
              color: '#ffffff',
              fontSize: '9px',
              fontWeight: '800',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '38px',
            right: 0,
            width: '320px',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            zIndex: 1000,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '12px 14px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'var(--bg-primary)',
            }}
          >
            <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>
              Alerts & Notifications
            </span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '11px',
                  color: 'var(--accent-emerald)',
                  cursor: 'pointer',
                  fontWeight: '600',
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                No active notifications or alerts.
              </div>
            ) : (
              notifications.map((item, idx) => (
                <div
                  key={item.id || idx}
                  style={{
                    padding: '12px 14px',
                    borderBottom: '1px solid var(--border-color)',
                    backgroundColor: item.read ? 'transparent' : 'var(--bg-tertiary)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: '600', fontSize: '12px', color: 'var(--text-primary)' }}>
                      {item.title || item.summary || 'Budget Alert'}
                    </div>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      {formatDate(item.created_at || item.timestamp)}
                    </span>
                  </div>

                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                    {item.message || item.text || item.description || 'Alert status changed.'}
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <button
                      onClick={() => {
                        if (onExplainAlert) onExplainAlert(item.alert_id || item.id);
                        else if (onNavigateToWorkspace) onNavigateToWorkspace('john');
                        setIsOpen(false);
                      }}
                      className="btn btn-primary btn-sm"
                      style={{ fontSize: '10px', padding: '3px 8px' }}
                    >
                      Explain
                    </button>
                    <button
                      onClick={() => {
                        if (onNavigateToWorkspace) onNavigateToWorkspace('nova');
                        setIsOpen(false);
                      }}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '10px', padding: '3px 6px' }}
                    >
                      <ExternalLink size={11} />
                      <span>Open in Nova</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
