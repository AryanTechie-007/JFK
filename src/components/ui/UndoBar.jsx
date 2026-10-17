import React, { useEffect, useState } from 'react';

/**
 * UndoBar — Countdown action bar rendered when an action is undoable (Doc 2 §6).
 *
 * @param {object} props
 * @param {string} props.message
 * @param {string} props.undoAvailableUntil - ISO date-time string
 * @param {function} props.onUndo
 * @param {function} [props.onExpire]
 */
export default function UndoBar({
  message,
  undoAvailableUntil,
  onUndo,
  onExpire,
}) {
  const [secondsLeft, setSecondsLeft] = useState(() => {
    if (!undoAvailableUntil) return 0;
    const diff = (new Date(undoAvailableUntil).getTime() - Date.now()) / 1000;
    return Math.max(0, Math.ceil(diff));
  });

  useEffect(() => {
    if (!undoAvailableUntil) return;

    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((new Date(undoAvailableUntil).getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        if (onExpire) onExpire();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [undoAvailableUntil, onExpire]);

  if (secondsLeft <= 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg border border-slate-700 text-xs animate-slide-up">
      <span>{message}</span>
      <span className="text-slate-400 font-mono text-[10px]">({secondsLeft}s)</span>
      <button
        type="button"
        onClick={onUndo}
        className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded text-xs transition-colors"
      >
        Undo
      </button>
    </div>
  );
}
