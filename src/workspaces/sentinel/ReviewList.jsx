import React, { useState } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../../services/api/v1';
import { formatMinorInr, formatDate } from '../../lib/format';
import DisabledControl from '../../components/ui/DisabledControl';
import UndoBar from '../../components/ui/UndoBar';

export default function ReviewList({ reviewQueue = [], taxonomy = [], onRefresh }) {
  const [activeUndo, setActiveUndo] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleConfirmItem = async (item, chosenCategoryId) => {
    setIsProcessing(true);
    setStatusMsg('');
    try {
      const actionType = chosenCategoryId
        ? 'CORRECT_TRANSACTION_CATEGORY'
        : 'CONFIRM_PROVISIONAL_CATEGORY';
      const categoryId = chosenCategoryId || item.suggested_category_id || 'MISC.OTHER';

      const res = await api.executeAction({
        action: actionType,
        params: {
          txn_id: item.txn_id,
          category_id: categoryId,
        },
      });

      setStatusMsg(`Confirmed classification for "${item.raw_description}".`);
      if (res?.action_id || res?.executed_action?.action_id) {
        setActiveUndo({
          actionId: res.action_id || res.executed_action.action_id,
          label: `Categorized as ${categoryId}`,
          expiresAt: Date.now() + 86400000,
        });
      }
      if (onRefresh) onRefresh();
    } catch (err) {
      setStatusMsg(`Confirmation failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUndo = async () => {
    if (!activeUndo?.actionId) return;
    try {
      await api.undoAction(activeUndo.actionId);
      setStatusMsg('Classification reverted successfully.');
      setActiveUndo(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      setStatusMsg(`Undo failed: ${err.message}`);
    }
  };

  return (
    <div className="card" style={{ padding: '22px' }}>
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
          Item Categorizer Needs-Review Queue
        </h3>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
          Transactions requiring user confirmation or exact leaf category selection (SC §8, Categorizer §B.7).
        </p>
      </div>

      {activeUndo && (
        <div style={{ marginBottom: '16px' }}>
          <UndoBar
            label={activeUndo.label}
            onUndo={handleUndo}
            undoAvailableUntil={activeUndo.expiresAt}
          />
        </div>
      )}

      {statusMsg && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            fontSize: '12px',
            marginBottom: '14px',
          }}
        >
          {statusMsg}
        </div>
      )}

      {reviewQueue.length === 0 ? (
        <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
          <CheckCircle2 size={28} color="var(--accent-emerald)" style={{ margin: '0 auto 8px auto' }} />
          <div>All transactions are settled or confirmed with high confidence.</div>
          <div style={{ fontSize: '11px', marginTop: '4px' }}>Zero items currently in review queue.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {reviewQueue.map((item) => {
            const isDuplicate = item.reason === 'POSSIBLE_DUPLICATE';
            const isLinkIssue = item.reason === 'UNMATCHED_REFUND' || item.reason === 'CARD_COUNTERPART_MISSING';

            return (
              <div
                key={item.review_id || item.txn_id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                  padding: '14px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div>
                  <div style={{ fontWeight: '700', fontSize: '13px', color: 'var(--text-primary)' }}>
                    {item.raw_description}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {formatDate(item.txn_date)} • Reason:{' '}
                    <span style={{ color: '#d97706', fontWeight: '600' }}>{item.reason}</span>
                    {item.suggested_category_id && (
                      <span> • Suggested: <strong>{item.suggested_category_id}</strong></span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="mono" style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>
                    {formatMinorInr(item.amount_minor)}
                  </span>

                  {isDuplicate ? (
                    <DisabledControl tooltip="Duplicate resolution not in prototype">
                      <button className="btn btn-secondary btn-sm" disabled style={{ fontSize: '11px' }}>
                        Resolve Duplicate
                      </button>
                    </DisabledControl>
                  ) : isLinkIssue ? (
                    <DisabledControl tooltip="Account counterpart linking not in prototype">
                      <button className="btn btn-secondary btn-sm" disabled style={{ fontSize: '11px' }}>
                        Link Account
                      </button>
                    </DisabledControl>
                  ) : (
                    <>
                      <select
                        defaultValue={item.suggested_category_id || 'MISC.OTHER'}
                        onChange={(e) => handleConfirmItem(item, e.target.value)}
                        className="input"
                        disabled={isProcessing}
                        style={{ width: '180px', padding: '5px 8px', fontSize: '12px' }}
                      >
                        {taxonomy.map((cat) => (
                          <option key={cat.category_id} value={cat.category_id}>
                            {cat.display_name}
                          </option>
                        ))}
                      </select>

                      {item.suggested_category_id && (
                        <button
                          onClick={() => handleConfirmItem(item, null)}
                          className="btn btn-primary btn-sm"
                          disabled={isProcessing}
                          style={{ fontSize: '11px', padding: '5px 10px' }}
                        >
                          Confirm
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
