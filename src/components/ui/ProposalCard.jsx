import React, { useState } from 'react';

/**
 * ProposalCard — UI Card for reviewing and executing proposals (Doc 2 §6, SC §13.3).
 *
 * @param {object} props
 * @param {object} props.proposal - Proposal@1 object
 * @param {function} [props.onConfirm] - Callback on confirm ({ proposal_id, params_hash, ack })
 * @param {function} [props.onDecline] - Callback on decline ({ proposal_id })
 * @param {boolean} [props.isSubmitting]
 */
export default function ProposalCard({
  proposal,
  onConfirm,
  onDecline,
  isSubmitting = false,
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  if (!proposal) return null;

  const {
    proposal_id,
    action,
    params = {},
    params_hash,
    tier = 'T2',
    state = 'PENDING',
    proposer = 'USER',
    warnings = [],
    requires_ack = false,
  } = proposal;

  const isExecuted = state === 'EXECUTED' || state === 'CONFIRMED';
  const isDeclined = state === 'DECLINED';
  const isExpired = state === 'EXPIRED';
  const isTerminal = isExecuted || isDeclined || isExpired;

  const handleConfirm = async () => {
    if (requires_ack && !acknowledged) {
      setErrorMsg('Please acknowledge the warnings before confirming.');
      return;
    }
    setErrorMsg(null);
    if (onConfirm) {
      try {
        await onConfirm({
          proposal_id,
          params_hash,
          ack: acknowledged,
        });
      } catch (err) {
        setErrorMsg(err.message || 'Execution failed');
      }
    }
  };

  return (
    <div className="border border-slate-200 rounded-xl bg-white shadow-sm p-4 my-3 text-sm">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-800 text-xs uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-700">
            {tier} Proposal
          </span>
          <span className="font-medium text-slate-600">{action}</span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          isExecuted ? 'bg-emerald-100 text-emerald-800' :
          isDeclined ? 'bg-slate-100 text-slate-600' :
          isExpired ? 'bg-amber-100 text-amber-800' :
          'bg-blue-100 text-blue-800'
        }`}>
          {state}
        </span>
      </div>

      <div className="space-y-2 mb-4">
        {Object.entries(params).map(([key, val]) => (
          <div key={key} className="flex justify-between text-xs py-1 border-b border-slate-50 last:border-0">
            <span className="text-slate-500 font-mono">{key}</span>
            <span className="text-slate-800 font-medium">{String(val)}</span>
          </div>
        ))}
      </div>

      {warnings && warnings.length > 0 && (
        <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 mb-3 text-xs text-amber-900 space-y-1">
          {warnings.map((w, idx) => (
            <div key={idx} className="flex gap-1.5 items-start">
              <span>⚠️</span>
              <span>{typeof w === 'string' ? w : w.message || JSON.stringify(w)}</span>
            </div>
          ))}
        </div>
      )}

      {errorMsg && (
        <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 mb-3 text-xs text-rose-800">
          {errorMsg}
        </div>
      )}

      {requires_ack && !isTerminal && (
        <label className="flex items-center gap-2 mb-3 cursor-pointer text-xs text-slate-700">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span>I understand and accept the potential impact of this change</span>
        </label>
      )}

      {!isTerminal ? (
        <div className="flex gap-2 justify-end pt-1">
          {onDecline && (
            <button
              type="button"
              onClick={() => onDecline({ proposal_id })}
              disabled={isSubmitting}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Decline
            </button>
          )}
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting || (requires_ack && !acknowledged)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 shadow-sm"
          >
            {isSubmitting ? 'Confirming…' : 'Confirm & Apply'}
          </button>
        </div>
      ) : (
        <div className="text-right text-xs text-slate-500 italic pt-1">
          {isExecuted ? '✓ Action applied successfully' : isDeclined ? 'Proposal declined' : 'Proposal expired'}
        </div>
      )}
    </div>
  );
}
