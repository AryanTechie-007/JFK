import React, { useState } from 'react';
import { 
  Receipt, 
  UploadCloud, 
  CheckCircle2, 
  FileText, 
  Sparkles, 
  Tag, 
  ArrowRight,
  Filter
} from 'lucide-react';
import { TRANSACTIONS } from '../data/mockFinancialData';

export default function TransactionCategorizerView() {
  const [statementText, setStatementText] = useState('');
  const [categorizedList, setCategorizedList] = useState(TRANSACTIONS);
  const [isProcessing, setIsProcessing] = useState(false);

  const classifyTransaction = (rawText) => {
    const text = rawText.toUpperCase();
    if (text.includes('SWIGGY') || text.includes('ZOMATO') || text.includes('FOOD') || text.includes('RESTAURANT') || text.includes('DINING')) {
      return { category: 'Food & Dining', tagColor: '#d97706' };
    }
    if (text.includes('AMAZON') || text.includes('ZARA') || text.includes('SHOPPING') || text.includes('CLOTHES')) {
      return { category: 'Shopping & Lifestyle', tagColor: '#2563eb' };
    }
    if (text.includes('NETFLIX') || text.includes('SPOTIFY') || text.includes('PRIME') || text.includes('SUB')) {
      return { category: 'Subscriptions', tagColor: '#7c3aed' };
    }
    if (text.includes('UBER') || text.includes('OLA') || text.includes('PETROL') || text.includes('FUEL') || text.includes('TRAVEL')) {
      return { category: 'Transport', tagColor: '#059669' };
    }
    if (text.includes('DMART') || text.includes('GROCERY') || text.includes('SUPERMARKET') || text.includes('BLINKIT')) {
      return { category: 'Groceries', tagColor: '#0891b2' };
    }
    if (text.includes('ELECTRICITY') || text.includes('RENT') || text.includes('BILL') || text.includes('POWER')) {
      return { category: 'Bills & Utilities', tagColor: '#db2777' };
    }
    return { category: 'General / Unclassified', tagColor: '#64748b' };
  };

  const handleSimulatedUpload = (e) => {
    e.preventDefault();
    if (!statementText.trim()) return;

    setIsProcessing(true);

    setTimeout(() => {
      const lines = statementText.split('\n').filter(l => l.trim().length > 0);
      const newItems = lines.map((line, idx) => {
        const parts = line.split(',');
        const desc = parts[0] || line;
        const amt = parts[1] ? Number(parts[1]) : 1250;
        const cls = classifyTransaction(desc);
        return {
          id: `nlp-tx-${Date.now()}-${idx}`,
          date: new Date().toISOString().split('T')[0],
          description: desc,
          merchant: desc.split(' ')[0],
          amount: Math.abs(amt),
          category: cls.category,
          tagColor: cls.tagColor,
          type: 'debit'
        };
      });

      setCategorizedList([...newItems, ...categorizedList]);
      setStatementText('');
      setIsProcessing(false);
    }, 800);
  };

  const categoryTotals = categorizedList.reduce((acc, tx) => {
    acc[tx.category] = (acc[tx.category] || 0) + tx.amount;
    return acc;
  }, {});

  const totalSpentAll = Object.values(categoryTotals).reduce((a, b) => a + b, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Light Clean Header */}
      <div>
        <h1 style={{ fontSize: '32px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.02em', fontFamily: 'var(--font-serif)' }}>
          Transaction Intelligence & Auto Categorizer
        </h1>
        <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
          Converts raw bank statement strings (e.g. "SWIGGY 4589", "AMAZON PAY") into structured financial taxonomies automatically.
        </p>
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '24px' }}>
        
        {/* Left Column: Bank Statement Importer */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card-title">
            <UploadCloud size={18} color="#059669" />
            <span>Upload or Paste Bank Statements</span>
          </div>

          <form onSubmit={handleSimulatedUpload} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px', display: 'block', fontFamily: 'var(--font-sans)' }}>
                Paste Transactions (One per line: Description, Amount)
              </label>
              <textarea
                className="input"
                rows="5"
                placeholder={`ZOMATO ORDER 894, 750\nBLINKIT GROCERY, 1420\nPETROL PUMP HPCL, 2000\nAMAZON CLOTHING, 3400`}
                value={statementText}
                onChange={(e) => setStatementText(e.target.value)}
              />
            </div>

            <button type="submit" className="btn btn-emerald" disabled={isProcessing || !statementText.trim()}>
              {isProcessing ? 'Processing NLP Model...' : 'Run Auto Categorization'}
            </button>
          </form>

          <div style={{ marginTop: '10px' }}>
            <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '6px', fontFamily: 'var(--font-sans)' }}>Try Sample Presets:</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button 
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setStatementText("SWIGGY GOURMET MEAL, 850\nUBER RIDE CITY, 320\nNETFLIX COM, 649")}
              >
                Sample Statement #1
              </button>
              <button 
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setStatementText("DMART SUPERMARKET, 4900\nZARA FASHION, 6800\nSPOTIFY SUB, 119")}
              >
                Sample Statement #2
              </button>
            </div>
          </div>

          <div style={{
            padding: '14px',
            backgroundColor: '#f8fafc',
            borderRadius: 'var(--radius-md)',
            border: '1px solid #e2e8f0',
            marginTop: '10px'
          }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a', marginBottom: '8px', fontFamily: 'var(--font-serif)' }}>
              Category Volume Share
            </div>
            {Object.entries(categoryTotals).map(([cat, total], idx) => {
              const pct = totalSpentAll ? Math.round((total / totalSpentAll) * 100) : 0;
              return (
                <div key={idx} style={{ marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontFamily: 'var(--font-sans)' }}>
                    <span style={{ color: '#475569' }}>{cat}</span>
                    <span className="mono" style={{ color: '#0f172a' }}>{pct}% (₹{total.toLocaleString()})</span>
                  </div>
                  <div className="progress-track" style={{ height: '4px' }}>
                    <div className="progress-fill" style={{ width: `${pct}%`, backgroundColor: '#059669' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Categorized Transactions Table */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card-title" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Tag size={18} color="#059669" />
              <span>Categorized Transaction Feed</span>
            </div>
            <span className="mono" style={{ fontSize: '12px', color: '#64748b' }}>
              {categorizedList.length} Items Tagged
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left', fontFamily: 'var(--font-sans)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px' }}>Date</th>
                  <th style={{ padding: '10px' }}>Raw Transaction Description</th>
                  <th style={{ padding: '10px' }}>AI Classified Category</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {categorizedList.map((tx) => (
                  <tr key={tx.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td className="mono" style={{ padding: '12px 10px', color: '#64748b', fontSize: '12px' }}>
                      {tx.date}
                    </td>
                    <td style={{ padding: '12px 10px', fontWeight: '600', color: '#0f172a' }}>
                      {tx.description}
                    </td>
                    <td style={{ padding: '12px 10px' }}>
                      <span className="badge" style={{
                        backgroundColor: '#f8fafc',
                        color: tx.tagColor || '#059669',
                        border: `1px solid ${tx.tagColor || '#cbd5e1'}`
                      }}>
                        {tx.category}
                      </span>
                    </td>
                    <td className="mono" style={{ padding: '12px 10px', textAlign: 'right', fontWeight: '700', color: tx.type === 'credit' ? '#059669' : '#0f172a' }}>
                      {tx.type === 'credit' ? '+' : ''}₹{tx.amount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
