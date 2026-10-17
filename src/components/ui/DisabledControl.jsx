import React from 'react';

/**
 * DisabledControl — Wraps deferred or out-of-scope controls with "Not in prototype" indicator (Doc 0 §3.2).
 *
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {string} [props.reason]
 */
export default function DisabledControl({ children, reason = "Not in prototype" }) {
  return (
    <div className="relative group inline-block w-full">
      <div className="opacity-45 pointer-events-none select-none">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/40 rounded backdrop-blur-[1px]">
        <span className="bg-slate-900 text-slate-100 text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded shadow">
          {reason}
        </span>
      </div>
    </div>
  );
}
