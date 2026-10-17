import React from 'react';
import { formatBpPct } from '../../lib/format';

/**
 * DataQualityBadge — displays coverage and completeness according to DataQuality@1 (SC §8.1)
 *
 * @param {object} props
 * @param {object} props.dataQuality - DataQuality@1 object
 * @param {string} [props.asOfDate] - Date string for "As of"
 */
export default function DataQualityBadge({ dataQuality, asOfDate }) {
  if (!dataQuality) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
        <span>Awaiting Data</span>
      </div>
    );
  }

  const {
    coverage_by_amount_bp,
    needs_review_count = 0,
    uncategorized_count = 0,
    import_in_progress = false,
    complete = true,
  } = dataQuality;

  let badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  let dotColor = 'bg-emerald-500';
  let label = 'Clean Data';

  if (import_in_progress) {
    badgeColor = 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse';
    dotColor = 'bg-blue-500';
    label = 'Importing Feed…';
  } else if (!complete || needs_review_count > 0 || uncategorized_count > 0) {
    badgeColor = 'bg-amber-50 text-amber-700 border-amber-200';
    dotColor = 'bg-amber-500';
    label = `${needs_review_count + uncategorized_count} items need review`;
  } else if (coverage_by_amount_bp !== null && coverage_by_amount_bp < 8000) {
    badgeColor = 'bg-amber-50 text-amber-700 border-amber-200';
    dotColor = 'bg-amber-500';
    label = `Coverage ${formatBpPct(coverage_by_amount_bp)}`;
  }

  return (
    <div className="inline-flex items-center gap-2">
      {asOfDate && (
        <span className="text-xs text-slate-500 font-medium">
          As of {asOfDate}
        </span>
      )}
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${badgeColor}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></span>
        <span>{label}</span>
      </div>
    </div>
  );
}
