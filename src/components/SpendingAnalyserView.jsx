import React, { useState } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Calendar, 
  PieChart, 
  Sparkles, 
  ArrowUpRight, 
  ArrowDownRight, 
  Filter,
  DollarSign,
  Layers,
  Activity
} from 'lucide-react';

export default function SpendingAnalyserView({ userProfile }) {
  const currency = userProfile?.currency || '₹';
  const [viewMode, setViewMode] = useState('month'); // 'month' | 'year'
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisTimestamp, setAnalysisTimestamp] = useState('Aug 2026');

  // Sample data for monthly trend graphs (Jan - Aug 2026)
  const monthlyData = [
    { label: 'Jan', food: 7400, shopping: 6100, bills: 4800, transport: 3200, total: 21500 },
    { label: 'Feb', food: 7800, shopping: 5800, bills: 4900, transport: 3100, total: 21600 },
    { label: 'Mar', food: 8100, shopping: 7200, bills: 5100, transport: 3400, total: 23800 },
    { label: 'Apr', food: 8500, shopping: 6900, bills: 5000, transport: 3300, total: 23700 },
    { label: 'May', food: 7200, shopping: 6500, bills: 4800, transport: 3000, total: 21500 },
    { label: 'Jun', food: 8100, shopping: 7800, bills: 5000, transport: 3500, total: 24400 },
    { label: 'Jul', food: 8900, shopping: 8200, bills: 4900, transport: 3600, total: 25600 },
    { label: 'Aug', food: 9200, shopping: 8400, bills: 5000, transport: 3100, total: 25700 }
  ];

  // Sample data for yearly trend graphs (2023 - 2026)
  const yearlyData = [
    { label: '2023', total: 210000, food: 72000, shopping: 58000, bills: 48000, transport: 32000 },
    { label: '2024', total: 245000, food: 84000, shopping: 69000, bills: 54000, transport: 38000 },
    { label: '2025', total: 280000, food: 96000, shopping: 81000, bills: 60000, transport: 43000 },
    { label: '2026 (YTD)', total: 187800, food: 65200, shopping: 56900, bills: 39500, transport: 26200 }
  ];

  const categoryBreakdown = [
    { category: 'Food & Dining', spent: 9200, share: 36, color: '#d97706', trend: '+12% MoM' },
    { category: 'Shopping & Lifestyle', spent: 8400, share: 33, color: '#2563eb', trend: '+3% MoM' },
    { category: 'Bills & Utilities', spent: 5000, share: 19, color: '#7c3aed', trend: 'Stable' },
    { category: 'Transport', spent: 3100, share: 12, color: '#059669', trend: '-14% MoM' }
  ];

  const handleRunAnalyse = () => {
    setIsAnalyzing(true);
    setTimeout(() => {
      setIsAnalyzing(false);
      setAnalysisTimestamp(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 400);
  };

  const activeData = viewMode === 'month' ? monthlyData : yearlyData;
  const maxVal = Math.max(...activeData.map(d => d.total));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Title Header & Timeframe Selection Toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.02em', fontFamily: 'var(--font-serif)' }}>
            Spending & Trend Analyser
          </h1>
          <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
            Track historic spending behavior across time, isolate inflation spikes, and feed trend output to John Master Agent.
          </p>
        </div>

        {/* Controls: Timeframe Toggle & Run Analyse Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          
          {/* Month / Year Toggle */}
          <div style={{
            display: 'flex',
            backgroundColor: '#e2e8f0',
            padding: '3px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid #cbd5e1'
          }}>
            <button
              onClick={() => setViewMode('month')}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                backgroundColor: viewMode === 'month' ? '#ffffff' : 'transparent',
                color: viewMode === 'month' ? '#0f172a' : '#64748b',
                fontWeight: viewMode === 'month' ? '700' : '500',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Calendar size={14} />
              <span>By Month</span>
            </button>
            <button
              onClick={() => setViewMode('year')}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                backgroundColor: viewMode === 'year' ? '#ffffff' : 'transparent',
                color: viewMode === 'year' ? '#0f172a' : '#64748b',
                fontWeight: viewMode === 'year' ? '700' : '500',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <BarChart3 size={14} />
              <span>By Year</span>
            </button>
          </div>

          {/* Analyse Option Button */}
          <button
            onClick={handleRunAnalyse}
            className="btn btn-emerald"
            disabled={isAnalyzing}
            style={{ padding: '8px 16px', fontSize: '13px' }}
          >
            <Sparkles size={15} />
            <span>{isAnalyzing ? 'Analyzing Data...' : 'Analyse Spending'}</span>
          </button>

        </div>
      </div>

      {/* Overview Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div className="card" style={{ padding: '18px' }}>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {viewMode === 'month' ? 'August Total Spent' : '2026 YTD Spend'}
          </div>
          <div className="mono" style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', marginTop: '6px' }}>
            {currency}{viewMode === 'month' ? '25,700' : '187,800'}
          </div>
          <div style={{ fontSize: '11px', color: '#059669', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '600' }}>
            <ArrowUpRight size={13} />
            <span>+4.2% vs previous period</span>
          </div>
        </div>

        <div className="card" style={{ padding: '18px' }}>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Top Outlay Category
          </div>
          <div style={{ fontSize: '20px', fontWeight: '800', color: '#d97706', marginTop: '6px' }}>
            Food & Dining
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
            36% of overall expenditure
          </div>
        </div>

        <div className="card" style={{ padding: '18px' }}>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Analyser Feed Status
          </div>
          <div style={{ fontSize: '15px', fontWeight: '700', color: '#005f41', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={15} /> Synced to John Coach
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
            Last computed: {analysisTimestamp}
          </div>
        </div>
      </div>

      {/* Main Grid: Trend Graphs + Category Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px' }}>
        
        {/* Left Column: Visual Trend Chart (Placeholder Bar/Line Graph) */}
        <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="card-title" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={18} color="#005f41" />
              <span>{viewMode === 'month' ? 'Monthly Expenditure Trend (2026)' : 'Yearly Expenditure Trend (2023 - 2026)'}</span>
            </div>
            <span className="mono" style={{ fontSize: '11px', color: '#64748b', backgroundColor: '#f1f5f9', padding: '4px 8px', borderRadius: '4px' }}>
              Mode: {viewMode.toUpperCase()}
            </span>
          </div>

          {/* Interactive Chart Container */}
          <div style={{
            height: '280px',
            width: '100%',
            backgroundColor: '#f8fafc',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            gap: '12px'
          }}>
            {/* Chart Bars */}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: '200px', gap: '12px' }}>
              {activeData.map((item, idx) => {
                const heightPct = Math.round((item.total / maxVal) * 100);
                return (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flex: 1, height: '100%', justifyContent: 'flex-end' }}>
                    <span className="mono" style={{ fontSize: '10px', color: '#64748b', fontWeight: '600' }}>
                      ₹{(item.total / 1000).toFixed(1)}k
                    </span>
                    <div style={{
                      width: '80%',
                      maxWidth: '36px',
                      height: `${heightPct}%`,
                      backgroundColor: idx === activeData.length - 1 ? '#005f41' : '#64748b',
                      borderRadius: '6px 6px 0 0',
                      transition: 'height 0.4s ease',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                    }} />
                    <span style={{ fontSize: '11px', color: '#0f172a', fontWeight: '700' }}>
                      {item.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Baseline axis line */}
            <div style={{ height: '1px', backgroundColor: '#cbd5e1', width: '100%' }} />
          </div>

          {/* Key Findings Note */}
          <div style={{
            padding: '14px 16px',
            backgroundColor: '#f0fdf4',
            borderRadius: '8px',
            border: '1px solid #bbf7d0',
            color: '#166534',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px'
          }}>
            <Sparkles size={18} color="#059669" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontWeight: '700', fontSize: '13px', color: '#065f46' }}>
                Analyser Insight Output Fed to John Master Agent:
              </div>
              <div style={{ marginTop: '2px', color: '#047857', lineHeight: '1.4' }}>
                {viewMode === 'month' 
                  ? 'August spending peaked at ₹25,700, driven primarily by Food Delivery (+12% MoM). Transport dropped by 14% due to work-from-home days.'
                  : 'Annual spend trajectory increased 16.6% YoY from 2024 to 2025. 2026 YTD remains within projected safety margins.'}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Category Distribution & Trends */}
        <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card-title">
            <PieChart size={18} color="#005f41" />
            <span>Category Spending Shares</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {categoryBreakdown.map((cat, idx) => (
              <div 
                key={idx}
                style={{
                  padding: '12px',
                  backgroundColor: '#ffffff',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>
                    {cat.category}
                  </span>
                  <span className="mono" style={{ fontSize: '12px', fontWeight: '700', color: cat.color }}>
                    ₹{cat.spent.toLocaleString()}
                  </span>
                </div>

                <div className="progress-track" style={{ height: '6px', marginTop: '8px' }}>
                  <div className="progress-fill" style={{ width: `${cat.share}%`, backgroundColor: cat.color }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
                  <span>{cat.share}% of total</span>
                  <span style={{ color: cat.trend.includes('+') ? '#dc2626' : '#059669', fontWeight: '600' }}>{cat.trend}</span>
                </div>
              </div>
            ))}
          </div>

        </div>

      </div>
    </div>
  );
}
