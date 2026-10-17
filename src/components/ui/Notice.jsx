import React from 'react';

/**
 * Notice — Banner matching ChatResponse and system notices (John §C.2, SC §15).
 *
 * @param {object} props
 * @param {string} [props.code] - e.g. "SERVICE_UNAVAILABLE", "LOW_COVERAGE", "INSUFFICIENT_DATA"
 * @param {string} props.text - Human-readable text
 * @param {'info'|'warning'|'error'|'success'} [props.severity]
 * @param {function} [props.onAction] - Optional retry or dismiss action
 * @param {string} [props.actionLabel]
 */
export default function Notice({
  code,
  text,
  severity = 'info',
  onAction,
  actionLabel = 'Retry',
}) {
  const styles = {
    info: 'bg-blue-50 text-blue-900 border-blue-200',
    warning: 'bg-amber-50 text-amber-900 border-amber-200',
    error: 'bg-rose-50 text-rose-900 border-rose-200',
    success: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  };

  const icons = {
    info: 'ℹ️',
    warning: '⚠️',
    error: '❌',
    success: '✅',
  };

  return (
    <div className={`flex items-start justify-between gap-3 p-3 rounded-xl border text-xs my-2 ${styles[severity] || styles.info}`}>
      <div className="flex gap-2 items-start">
        <span className="text-sm leading-none mt-0.5">{icons[severity] || icons.info}</span>
        <div>
          {code && <span className="font-semibold uppercase tracking-wider text-[10px] block opacity-75">{code}</span>}
          <span>{text}</span>
        </div>
      </div>
      {onAction && (
        <button
          type="button"
          onClick={onAction}
          className="font-medium underline hover:no-underline ml-auto flex-shrink-0"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
