import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Activity, Layers, ListFilter } from 'lucide-react';
import { api } from '../../services/api/v1';
import BalancesSection from './BalancesSection';
import SpendingSection from './SpendingSection';
import ForecastSection from './ForecastSection';
import TransactionList from './TransactionList';
import ReviewList from './ReviewList';
import BillsPanel from './BillsPanel';
import DemoLoader from './DemoLoader';
import DataQualityBadge from '../../components/ui/DataQualityBadge';
import WorkspaceChatPanel from '../../components/WorkspaceChatPanel';

export default function SentinelWorkspace({ userProfile }) {
  const [activeTab, setActiveTab] = useState('overview'); // overview | spending | forecast | transactions | review | bills
  const [overviewData, setOverviewData] = useState(null);
  const [aggregateData, setAggregateData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const [ov, agg] = await Promise.all([
        api.getSentinelOverview(),
        api.getWorkspace('sentinel'),
      ]);
      setOverviewData(ov);
      setAggregateData(agg);
    } catch (err) {
      console.warn('Sentinel workspace load error:', err);
      setErrorMsg(err.message || 'Failed to load Sentinel workspace data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const dq = overviewData?.data_quality || aggregateData?.data_quality || null;
  const reviewQueue = aggregateData?.review_queue || [];
  const transactions = aggregateData?.transactions || [];
  const taxonomy = aggregateData?.categories || aggregateData?.taxonomy || [];
  const declaredBills = aggregateData?.declared_bills || overviewData?.upcoming_bills?.data?.outlays || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Workspace Header Strip */}
      <div className="card" style={{ padding: '22px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(37, 99, 235, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#2563EB',
                }}
              >
                <Activity size={18} />
              </div>
              <h1
                style={{
                  fontSize: '22px',
                  fontWeight: '800',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-serif)',
                  margin: 0,
                }}
              >
                Sentinel — Financial Observer
              </h1>
              <span
                className="badge"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--accent-emerald)',
                  fontWeight: '700',
                }}
              >
                Model v5.0.0
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
              Deterministic ledger arithmetic, empirical P80 bands, bill cadence detection, and Item Categorizer review.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {dq && <DataQualityBadge quality={dq} />}

            <button onClick={loadData} className="btn btn-secondary btn-sm" disabled={isLoading}>
              <RefreshCw size={13} className={isLoading ? 'spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Workspace Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            marginTop: '16px',
            borderTop: '1px solid var(--border-color)',
            paddingTop: '14px',
            flexWrap: 'wrap',
          }}
        >
          {[
            { id: 'overview', label: 'Overview & Balances' },
            { id: 'spending', label: 'Spending & Trends' },
            { id: 'forecast', label: 'Forecast & Risk Radar' },
            { id: 'transactions', label: `Transactions (${transactions.length})` },
            { id: 'review', label: `Needs Review (${reviewQueue.length})` },
            { id: 'bills', label: `Declared Bills (${declaredBills.length})` },
            { id: 'demo', label: 'Demo Simulator' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={activeTab === tab.id ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {errorMsg && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'rgba(220, 38, 38, 0.1)',
            border: '1px solid #dc2626',
            color: '#dc2626',
            fontSize: '13px',
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Main Tab Panels */}
      {activeTab === 'overview' && (
        <BalancesSection overview={overviewData} onRefresh={loadData} />
      )}

      {activeTab === 'spending' && <SpendingSection />}

      {activeTab === 'forecast' && <ForecastSection />}

      {activeTab === 'transactions' && (
        <TransactionList
          transactions={transactions}
          taxonomy={taxonomy}
          onRefresh={loadData}
        />
      )}

      {activeTab === 'review' && (
        <ReviewList
          reviewQueue={reviewQueue}
          taxonomy={taxonomy}
          onRefresh={loadData}
        />
      )}

      {activeTab === 'bills' && (
        <BillsPanel
          declaredBills={declaredBills}
          taxonomy={taxonomy}
          onRefresh={loadData}
        />
      )}

      {activeTab === 'demo' && (
        <DemoLoader onImportSuccess={loadData} />
      )}

      {/* Embedded Sentinel Chat Panel */}
      <div className="card" style={{ padding: '22px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '8px' }}>
          Ask Sentinel (Financial Observer Specialist)
        </h3>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
          Sentinel answers questions using deterministic queries over your live ledger snapshots.
        </p>
        <WorkspaceChatPanel workspace="SENTINEL" userProfile={userProfile} />
      </div>
    </div>
  );
}
