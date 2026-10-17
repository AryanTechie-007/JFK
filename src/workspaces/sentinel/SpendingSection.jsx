import React, { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { Table, BarChart2 } from 'lucide-react';
import { api } from '../../services/api/v1';
import { formatMinorInr } from '../../lib/format';

export default function SpendingSection() {
  const [months, setMonths] = useState(3);
  const [granularity, setGranularity] = useState('MONTH');
  const [spendingData, setSpendingData] = useState(null);
  const [timeseriesData, setTimeseriesData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showTable, setShowTable] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [spendingRes, timeseriesRes] = await Promise.all([
        api.getSentinelSpending({ months }),
        api.getSentinelTimeseries({ months, granularity }),
      ]);
      setSpendingData(spendingRes);
      setTimeseriesData(timeseriesRes);
    } catch (err) {
      console.warn('Error loading spending section:', err);
    } finally {
      setIsLoading(false);
    }
  }, [months, granularity]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const summary = spendingData?.summary?.data || {};
  const categories = spendingData?.categories || [];
  const topMerchants = spendingData?.top_merchants || [];
  const uncategorizedTotal = spendingData?.uncategorized_total_minor ?? 0;
  const unclassifiedTotal = spendingData?.unclassified_total_minor ?? 0;

  const buckets = (timeseriesData?.buckets || []).map((b) => ({
    period: b.bucket || b.period || '',
    Settled: Math.round((b.settled_signed_minor || b.settled_spend_minor || 0) / 100),
    Provisional: Math.round((b.provisional_signed_minor || b.provisional_spend_minor || 0) / 100),
    Total: Math.round((b.total_spend_minor || (b.settled_signed_minor || 0) + (b.provisional_signed_minor || 0)) / 100),
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Time Series & Trend Chart */}
      <div className="card" style={{ padding: '22px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              Deterministic Spending Timeseries
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
              Granular bucket rollups computed by `sentinel_get_spending_timeseries`
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '4px' }}>
              {['MONTH', 'WEEK'].map((g) => (
                <button
                  key={g}
                  onClick={() => setGranularity(g)}
                  className={granularity === g ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                  style={{ fontSize: '11px', padding: '4px 8px' }}
                >
                  {g}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '4px' }}>
              {[1, 3, 6].map((m) => (
                <button
                  key={m}
                  onClick={() => setMonths(m)}
                  className={months === m ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                  style={{ fontSize: '11px', padding: '4px 8px' }}
                >
                  {m}M
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowTable((prev) => !prev)}
              className="btn btn-secondary btn-sm"
              title="Accessible Table View"
              style={{ fontSize: '11px', padding: '4px 8px' }}
            >
              {showTable ? <BarChart2 size={13} /> : <Table size={13} />}
              <span>{showTable ? 'Chart' : 'Table'}</span>
            </button>
          </div>
        </div>

        {isLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading timeseries metrics...
          </div>
        ) : showTable ? (
          <div style={{ overflowX: 'auto', maxHeight: '280px' }}>
            <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '8px' }}>Period</th>
                  <th style={{ padding: '8px' }}>Settled (₹)</th>
                  <th style={{ padding: '8px' }}>Provisional (₹)</th>
                  <th style={{ padding: '8px' }}>Total (₹)</th>
                </tr>
              </thead>
              <tbody>
                {buckets.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No timeseries data recorded in this timeframe.
                    </td>
                  </tr>
                ) : (
                  buckets.map((b, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '8px', fontWeight: '600' }}>{b.period}</td>
                      <td className="mono" style={{ padding: '8px' }}>₹{b.Settled.toLocaleString('en-IN')}</td>
                      <td className="mono" style={{ padding: '8px' }}>₹{b.Provisional.toLocaleString('en-IN')}</td>
                      <td className="mono" style={{ padding: '8px', fontWeight: '700' }}>₹{b.Total.toLocaleString('en-IN')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ width: '100%', height: '260px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={buckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                <XAxis dataKey="period" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                <YAxis
                  tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                  tickFormatter={(v) => `₹${v.toLocaleString('en-IN')}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--border-color)',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="Settled" stackId="a" fill="#059669" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Provisional" stackId="a" fill="#d97706" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="Total" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Uncategorized and Unclassified Buckets */}
      {(uncategorizedTotal > 0 || unclassifiedTotal > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {uncategorizedTotal > 0 && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'rgba(217, 119, 6, 0.1)',
                border: '1px solid rgba(217, 119, 6, 0.3)',
                color: '#d97706',
                fontSize: '13px',
              }}
            >
              <strong>Uncategorized Outlays: </strong>
              <span className="mono">{formatMinorInr(uncategorizedTotal)}</span>
              <span style={{ fontSize: '11px', display: 'block', marginTop: '2px' }}>
                Assigned to generic bucket; review in Needs Review tab to classify.
              </span>
            </div>
          )}
          {unclassifiedTotal > 0 && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                color: '#6366f1',
                fontSize: '13px',
              }}
            >
              <strong>Unclassified Movements: </strong>
              <span className="mono">{formatMinorInr(unclassifiedTotal)}</span>
              <span style={{ fontSize: '11px', display: 'block', marginTop: '2px' }}>
                Pending movement-type classification under SC §7.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Category Breakdown & Top Merchants */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' }}>
        <div className="card" style={{ padding: '22px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '14px' }}>
            Category Totals & Taxonomy Roll-Ups ({months}M)
          </h3>
          {categories.filter((c) => c.total_minor > 0).length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No categorized spending recorded in this window. Ingest transactions to view breakdown.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {categories
                .filter((c) => c.total_minor > 0)
                .map((cat) => (
                  <div
                    key={cat.category_id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '13px' }}>
                        {cat.name}
                        {cat.is_parent && (
                          <span
                            className="badge"
                            style={{ marginLeft: '8px', fontSize: '10px', backgroundColor: 'var(--bg-tertiary)' }}
                          >
                            Parent Group
                          </span>
                        )}
                      </div>
                      <div className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {cat.category_id} • {cat.count} transactions
                      </div>
                    </div>
                    <div className="mono" style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '14px' }}>
                      {formatMinorInr(cat.total_minor)}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: '22px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '14px' }}>
            Top Resolved Merchants
          </h3>
          {topMerchants.length === 0 ? (
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '20px 0' }}>
              No resolved merchants found in settled transactions.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {topMerchants.slice(0, 10).map((m, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '13px', color: 'var(--text-primary)' }}>
                      {m.merchant_name || 'Unknown Merchant'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {m.count} transaction(s)
                    </div>
                  </div>
                  <div className="mono" style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '13px' }}>
                    {formatMinorInr(m.total_minor)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
