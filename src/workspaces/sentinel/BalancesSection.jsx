import React from 'react';
import { CreditCard, Wallet, Landmark, ShieldCheck } from 'lucide-react';
import { formatMinorInr } from '../../lib/format';
import DataQualityBadge from '../../components/ui/DataQualityBadge';

export default function BalancesSection({ overview }) {
  if (!overview) {
    return (
      <div className="card" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading account balances...
      </div>
    );
  }

  const { balances = [], available_balance, surplus, health_score, data_quality } = overview;
  const availableMinor = available_balance?.data?.available_minor ?? available_balance?.available_minor ?? 0;
  const earmarkedMinor = available_balance?.data?.earmarked_minor ?? available_balance?.earmarked_minor ?? 0;
  const expectedSurplusMinor = surplus?.data?.expected_surplus_signed_minor ?? surplus?.expected_surplus_signed_minor ?? 0;
  const conservativeSurplusMinor = surplus?.data?.conservative_surplus_signed_minor ?? surplus?.conservative_surplus_signed_minor ?? 0;
  const healthPillarScore = health_score?.data?.overall_score ?? health_score?.overall_score ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top 3 KPI Cards */}
      <div className="grid-3">
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>
              Un-earmarked Liquid Balance
            </span>
            <Wallet size={16} color="var(--accent-emerald)" />
          </div>
          <div
            className="mono"
            style={{
              fontSize: '24px',
              fontWeight: '800',
              color: 'var(--text-primary)',
              marginTop: '8px',
              fontFamily: 'var(--font-serif)',
            }}
          >
            {formatMinorInr(availableMinor)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Earmarked in active goals: {formatMinorInr(earmarkedMinor)}
          </div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>
              Monthly Expected Surplus
            </span>
            <Landmark size={16} color="var(--accent-emerald)" />
          </div>
          <div
            className="mono"
            style={{
              fontSize: '24px',
              fontWeight: '800',
              color: 'var(--accent-emerald)',
              marginTop: '8px',
              fontFamily: 'var(--font-serif)',
            }}
          >
            {formatMinorInr(expectedSurplusMinor)}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Conservative P80 estimate: {formatMinorInr(conservativeSurplusMinor)}
          </div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', textTransform: 'uppercase' }}>
              Financial Health Index
            </span>
            <ShieldCheck size={16} color={healthPillarScore >= 70 ? 'var(--accent-emerald)' : '#d97706'} />
          </div>
          <div
            className="mono"
            style={{
              fontSize: '24px',
              fontWeight: '800',
              color: healthPillarScore >= 70 ? 'var(--accent-emerald)' : 'var(--text-primary)',
              marginTop: '8px',
              fontFamily: 'var(--font-serif)',
            }}
          >
            {healthPillarScore !== null ? `${healthPillarScore}/100` : '—'}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Derived deterministically across 4 financial pillars
          </div>
        </div>
      </div>

      {/* Account Balances List */}
      <div className="card" style={{ padding: '22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              Live Connected Accounts & Liabilities
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
              Real-time balance feeds verified under SC §5.2. Credit card balances are presented as liabilities.
            </p>
          </div>
          {data_quality && <DataQualityBadge quality={data_quality} />}
        </div>

        {balances.length === 0 ? (
          <div style={{ padding: '28px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            No connected accounts on file. Seeded demo accounts will appear once ingested.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {balances.map((acc, idx) => {
              const isCreditCard = acc.account_type === 'CREDIT_CARD';
              const isStale = Boolean(acc.is_stale);
              return (
                <div
                  key={acc.account_id || idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        backgroundColor: isCreditCard ? 'rgba(220, 38, 38, 0.1)' : 'var(--bg-card)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isCreditCard ? '#dc2626' : 'var(--accent-emerald)',
                      }}
                    >
                      {isCreditCard ? <CreditCard size={18} /> : <Landmark size={18} />}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>
                          {acc.institution_name || 'Bank Account'}
                        </span>
                        {acc.mask && (
                          <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            •••{acc.mask}
                          </span>
                        )}
                        {isCreditCard && (
                          <span
                            className="badge"
                            style={{ backgroundColor: 'rgba(220, 38, 38, 0.15)', color: '#dc2626', fontSize: '10px' }}
                          >
                            Liability
                          </span>
                        )}
                        {isStale && (
                          <span
                            className="badge"
                            style={{ backgroundColor: 'rgba(217, 119, 6, 0.15)', color: '#d97706', fontSize: '10px' }}
                          >
                            Stale Feed
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Type: {acc.account_type || 'CHECKING'} • Currency: {acc.currency || 'INR'}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div
                      className="mono"
                      style={{
                        fontSize: '15px',
                        fontWeight: '700',
                        color: isCreditCard ? '#dc2626' : 'var(--text-primary)',
                      }}
                    >
                      {isCreditCard ? `-${formatMinorInr(acc.current_balance_minor)}` : formatMinorInr(acc.current_balance_minor)}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Available: {formatMinorInr(acc.available_balance_minor ?? acc.current_balance_minor)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
