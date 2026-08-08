import React from 'react';
import { 
  ResponsiveContainer, 
  ComposedChart, 
  Line, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  Legend 
} from 'recharts';
import { 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  Cpu, 
  Eye, 
  ShieldAlert,
  ArrowUpRight
} from 'lucide-react';
import { SENTINEL_FORECAST, AGENTS } from '../data/mockFinancialData';

export default function SentinelPredictorView({ userProfile }) {
  const currency = userProfile?.currency || '₹';
  // Combine historical and prediction data for chart
  const combinedChartData = [
    ...SENTINEL_FORECAST.historical.map(item => ({
      month: item.month,
      Actual: item.actual,
      Predicted: null,
      Food: item.food,
      Shopping: item.shopping,
      type: 'historical'
    })),
    ...SENTINEL_FORECAST.predictions.map(item => ({
      month: item.month,
      Actual: null,
      Predicted: item.predicted,
      Food: item.food,
      Shopping: item.shopping,
      type: 'predicted'
    }))
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Agent Identity Header */}
      <div className="card" style={{
        background: 'linear-gradient(135deg, rgba(30, 24, 52, 0.7) 0%, rgba(17, 21, 32, 0.95) 100%)',
        borderColor: 'rgba(139, 92, 246, 0.3)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: 'var(--agent-sentinel-glow)',
              border: '1px solid rgba(139, 92, 246, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px'
            }}>
              🔮
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)' }}>
                  Sentinel — Observer & Expense Predictor
                </h2>
                <span className="badge badge-sentinel">Hidden ML Engine</span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Sentinel works silently in the background, forecasting upcoming expenses and alerting John, Iris, Atlas & Nova.
              </p>
            </div>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '8px 16px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-sm)'
          }}>
            <Cpu size={16} color="var(--agent-sentinel)" />
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Model Accuracy</div>
              <div className="mono" style={{ fontSize: '14px', fontWeight: '700', color: '#a78bfa' }}>
                91.4% Confidence
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Time Series Chart & Risk Radar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '20px' }}>
        
        {/* Left Column: Recharts Predictive Timeline */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card-header">
            <div>
              <div className="card-title">
                <TrendingUp size={16} color="var(--agent-sentinel)" />
                <span>Time-Series Expense Forecasting (Past 4 Months vs. Next 3 Months)</span>
              </div>
              <div className="card-description">
                Prophet / LSTM ML model extrapolation based on historical cash flow vectors
              </div>
            </div>
          </div>

          {/* Recharts Canvas */}
          <div style={{ width: '100%', height: '340px', marginTop: '10px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={combinedChartData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2638" vertical={false} />
                <XAxis dataKey="month" stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <YAxis stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 12 }} tickFormatter={(v) => `₹${v/1000}k`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#121620', borderColor: '#1e2638', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                  formatter={(value) => value ? [`₹${value.toLocaleString()}`, 'Amount'] : ['--', 'Amount']}
                />
                <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />
                <Bar dataKey="Food" name="Food & Dining" fill="#f59e0b" radius={[4, 4, 0, 0]} opacity={0.6} />
                <Bar dataKey="Shopping" name="Shopping" fill="#3b82f6" radius={[4, 4, 0, 0]} opacity={0.6} />
                <Line type="monotone" dataKey="Actual" name="Actual Total Spent" stroke="#10b981" strokeWidth={3} dot={{ r: 5, fill: '#10b981' }} />
                <Line type="monotone" dataKey="Predicted" name="Sentinel Forecasted" stroke="#8b5cf6" strokeWidth={3} strokeDasharray="5 5" dot={{ r: 6, fill: '#8b5cf6' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Forecast Note Cards */}
          <div className="grid-3">
            {SENTINEL_FORECAST.predictions.map((pred, i) => (
              <div key={i} style={{
                padding: '12px',
                backgroundColor: 'var(--bg-surface)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>
                    {pred.month}
                  </span>
                  <span className="mono" style={{ fontSize: '11px', color: 'var(--agent-sentinel)' }}>
                    {pred.confidence} Confidence
                  </span>
                </div>
                <div className="mono" style={{ fontSize: '18px', fontWeight: '700', color: '#a78bfa', marginTop: '6px' }}>
                  {USER_PROFILE.currency}{pred.predicted.toLocaleString()}
                </div>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {pred.note}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Sentinel Risk Radar & Feed Signals */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Risk Detection Radar */}
          <div className="card">
            <div className="card-title" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldAlert size={16} color="#f87171" />
                <span>Risk Radar Alerts</span>
              </div>
              <span className="badge badge-nova">2 Detected</span>
            </div>

            <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {SENTINEL_FORECAST.riskRadar.map((risk) => (
                <div key={risk.id} style={{
                  padding: '14px',
                  backgroundColor: 'var(--bg-surface)',
                  borderRadius: 'var(--radius-sm)',
                  borderLeft: risk.severity === 'High' ? '3px solid #ef4444' : '3px solid #f59e0b'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
                      {risk.title}
                    </span>
                    <span className="mono" style={{
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: risk.severity === 'High' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                      color: risk.severity === 'High' ? '#f87171' : '#fbbf24'
                    }}>
                      {risk.severity} Risk
                    </span>
                  </div>

                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: '1.5' }}>
                    {risk.detail}
                  </p>

                  <div style={{ 
                    marginTop: '8px', 
                    paddingTop: '8px', 
                    borderTop: '1px solid var(--border-color)', 
                    fontSize: '11px', 
                    color: '#a78bfa',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <ArrowUpRight size={12} />
                    <span>Directive: {risk.recommendation}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Direct Agent Communication Pipeline */}
          <div className="card">
            <div className="card-title">
              <Eye size={16} color="var(--agent-sentinel)" />
              <span>Sentinel Outbound Signals</span>
            </div>

            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="status-dot active"></span>
                <span>Signal sent to <strong>Iris</strong>: Food ordering trend +27.7%</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="status-dot active"></span>
                <span>Signal sent to <strong>Nova</strong>: Prepare Sep budget cap for Insurance</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="status-dot active"></span>
                <span>Signal sent to <strong>Atlas</strong>: Maintain ₹4k liquidity buffer</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
