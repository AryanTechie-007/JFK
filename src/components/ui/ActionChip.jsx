import React from 'react';

/**
 * ActionChip — Fast T1 action trigger button with idempotency key (Doc 2 §6).
 *
 * @param {object} props
 * @param {string} props.label
 * @param {function} props.onClick
 * @param {boolean} [props.disabled]
 * @param {string} [props.variant] - 'primary' | 'secondary' | 'danger'
 */
export default function ActionChip({
  label,
  onClick,
  disabled = false,
  variant = 'secondary',
  icon = null,
}) {
  const variantStyles = {
    primary: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100',
    secondary: 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100',
    danger: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variantStyles[variant] || variantStyles.secondary}`}
    >
      {icon && <span>{icon}</span>}
      <span>{label}</span>
    </button>
  );
}
