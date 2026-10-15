import React, { useState, useRef } from 'react';
import { 
  Upload, 
  FileText, 
  Check, 
  AlertCircle, 
  X, 
  Trash2, 
  Sparkles, 
  Download,
  CheckCircle2
} from 'lucide-react';
import { transactionService } from '../services/transactionService';

const CATEGORIES = [
  'Food & Dining',
  'Shopping & Lifestyle',
  'Transport',
  'Bills & Utilities',
  'Subscriptions',
  'Groceries',
  'Health & Medical',
  'Entertainment',
  'Other'
];

export function categorizeStatementString(str = '') {
  const text = str.toLowerCase();
  
  if (/swiggy|zomato|starbucks|mcdonald|kfc|burger|pizza|cafe|restaurant|gourmet|eats|dine|bakery|subway|domino/i.test(text)) {
    return 'Food & Dining';
  }
  if (/amazon|flipkart|myntra|zara|h&m|shopping|clothing|mall|retail|ajio|meesho|nykaa|uniqlo/i.test(text)) {
    return 'Shopping & Lifestyle';
  }
  if (/uber|ola|rapido|metro|fuel|petrol|shell|hpcl|bpcl|indianoil|flight|indigo|air india|irctc|cab|taxi|fastag/i.test(text)) {
    return 'Transport';
  }
  if (/netflix|spotify|prime|hotstar|youtube|disney|apple\.com|subscription|medium|audible|patreon/i.test(text)) {
    return 'Subscriptions';
  }
  if (/bescom|mseb|electricity|water|gas|broadband|airtel|jio|act |tata sky|rent|maintenance|bill pay|insurance|lic/i.test(text)) {
    return 'Bills & Utilities';
  }
  if (/d-mart|dmart|blinkit|instamart|zepto|bigbasket|nature's basket|spencer|supermarket|kirana|grocery/i.test(text)) {
    return 'Groceries';
  }
  if (/apollo|netmeds|pharmacy|hospital|doctor|clinic|1mg|medplus|pharmeasy|diagnostic|dental/i.test(text)) {
    return 'Health & Medical';
  }
  if (/pvr|inox|cinema|movie|bookmyshow|gaming|steam|playstation/i.test(text)) {
    return 'Entertainment';
  }
  return 'Other';
}

const SAMPLE_CSV_RAW = `Date,Description,Amount
2026-08-18,SWIGGY * GOURMET BOWL BANGALORE,540.00
2026-08-17,AMAZON PAY * WIRELESS EARBUDS,2899.00
2026-08-16,UBER INDIA * AUTO RIDE INDIRANAGAR,185.00
2026-08-15,NETFLIX INDIA MONTHLY PREMIUM,649.00
2026-08-14,ZEPTO INSTANT GROCERIES,730.00
2026-08-13,STARBUCKS COFFEE ROASTERY,450.00
2026-08-12,BESCOM ELECTRICITY BILL AUG,2450.00
2026-08-10,APOLLO PHARMACY VITAMINS,890.00
2026-08-08,ZOMATO DINING OUT KORAMANGALA,1280.00
2026-08-05,AIRTEL POSTPAID BILL PAYMENT,999.00`;

export default function StatementImportModal({ isOpen, onClose, onImportSuccess, userProfile }) {
  const currency = userProfile?.currency || '₹';
  const fileInputRef = useRef(null);
  
  const [activeInputTab, setActiveInputTab] = useState('file'); // 'file' | 'text'
  const [rawText, setRawText] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  
  const [parsedRows, setParsedRows] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  if (!isOpen) return null;

  // Intelligent line / CSV parser
  const parseStatementContent = (content) => {
    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const cleanContent = content.trim();
      if (!cleanContent) {
        throw new Error('Provided statement is empty.');
      }

      const lines = cleanContent.split(/\r?\n/).filter(line => line.trim().length > 0);
      const extracted = [];

      lines.forEach((line, idx) => {
        // Skip obvious header lines
        if (idx === 0 && /date|txn|description|narration|amount|debit|particulars/i.test(line)) {
          return;
        }

        // 1. Try comma/tab/semicolon/pipe splitting
        let parts = [];
        if (line.includes(',')) parts = line.split(',');
        else if (line.includes('\t')) parts = line.split('\t');
        else if (line.includes(';')) parts = line.split(';');
        else if (line.includes('|')) parts = line.split('|');

        let rawDescription = '';
        let amount = 0;
        let dateStr = new Date().toISOString().slice(0, 10);
        let category = 'Other';

        if (parts.length >= 2) {
          let amountIndex = -1;
          let dateIndex = -1;
          let descIndex = -1;

          parts.forEach((p, pIdx) => {
            const clean = p.trim().replace(/['"]/g, '');
            if (/\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(clean) && dateIndex === -1) {
              dateIndex = pIdx;
            } else if (/^-?₹?\$?\s*[\d,]+(\.\d+)?\s*(dr|cr)?$/i.test(clean) && amountIndex === -1) {
              amountIndex = pIdx;
            } else if (clean.length > 2 && descIndex === -1) {
              descIndex = pIdx;
            }
          });

          if (dateIndex !== -1) {
            dateStr = parts[dateIndex].trim().replace(/['"]/g, '');
          }

          if (amountIndex !== -1) {
            const rawA = parts[amountIndex].trim().replace(/['"₹$,\s]/g, '').replace(/dr|cr/gi, '');
            amount = Math.abs(parseFloat(rawA) || 0);
          }

          if (descIndex !== -1) {
            rawDescription = parts[descIndex].trim().replace(/['"]/g, '');
          } else {
            const textParts = parts.filter((_, i) => i !== amountIndex && i !== dateIndex);
            rawDescription = textParts.join(' ').trim().replace(/['"]/g, '');
          }
        } else {
          const amountMatch = line.match(/(?:₹|INR|\$)?\s*([\d,]+(?:\.\d{1,2})?)/i);
          if (amountMatch) {
            amount = parseFloat(amountMatch[1].replace(/,/g, '')) || 0;
          }
          const dateMatch = line.match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/);
          if (dateMatch) {
            dateStr = dateMatch[0];
          }
          rawDescription = line
            .replace(amountMatch ? amountMatch[0] : '', '')
            .replace(dateMatch ? dateMatch[0] : '', '')
            .replace(/[-–|:,\t]/g, ' ')
            .trim();
        }

        if (amount > 0 && rawDescription.length > 0) {
          category = categorizeStatementString(rawDescription);
          extracted.push({
            id: `temp-${Date.now()}-${idx}`,
            selected: true,
            txnDate: dateStr,
            rawDescription: rawDescription.toUpperCase(),
            amount: amount,
            category: category
          });
        }
      });

      if (extracted.length === 0) {
        throw new Error('Could not identify valid date/amount transactions in this statement.');
      }

      setParsedRows(extracted);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to parse statement format.');
      setParsedRows([]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        parseStatementContent(content);
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result;
        if (typeof content === 'string') {
          parseStatementContent(content);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleLoadSample = () => {
    setFileName('sample_august_statement.csv');
    setRawText(SAMPLE_CSV_RAW);
    parseStatementContent(SAMPLE_CSV_RAW);
  };

  const handleDownloadSample = () => {
    const blob = new Blob([SAMPLE_CSV_RAW], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'finmate_sample_statement.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRowCategoryChange = (id, newCat) => {
    setParsedRows(prev => prev.map(r => r.id === id ? { ...r, category: newCat } : r));
  };

  const handleRowToggle = (id) => {
    setParsedRows(prev => prev.map(r => r.id === id ? { ...r, selected: !r.selected } : r));
  };

  const handleRowDelete = (id) => {
    setParsedRows(prev => prev.filter(r => r.id !== id));
  };

  const handleToggleSelectAll = () => {
    const allSelected = parsedRows.every(r => r.selected);
    setParsedRows(prev => prev.map(r => ({ ...r, selected: !allSelected })));
  };

  const selectedRows = parsedRows.filter(r => r.selected);
  const totalSelectedAmount = selectedRows.reduce((sum, r) => sum + (r.amount || 0), 0);

  const handleConfirmImport = async () => {
    if (selectedRows.length === 0) return;
    setIsSubmitting(true);
    setErrorMsg(null);

    const payloadLines = selectedRows.map(r => ({
      rawDescription: r.rawDescription,
      amount: r.amount,
      category: r.category,
      txnDate: r.txnDate
    }));

    try {
      const res = await transactionService.importTransactions(payloadLines);
      if (res.success) {
        if (onImportSuccess) {
          onImportSuccess(payloadLines, res.imported || payloadLines.length);
        }
        onClose();
      } else {
        setErrorMsg(res.error || 'Failed to import transactions to database.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Import error.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-card)',
        borderRadius: '16px',
        maxWidth: '900px',
        width: '100%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        border: '1px solid var(--border-color)',
        overflow: 'hidden'
      }}>
        
        {/* Header Bar */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--bg-card-subtle)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: '#d1fae5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#005f41'
            }}>
              <Upload size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', fontFamily: 'var(--font-serif)' }}>
                Import Bank Statement & CSV
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'var(--font-sans)' }}>
                Automatically extract, parse, and categorize raw bank feeds with Iris NLP intelligence.
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: '6px',
              borderRadius: '6px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body Container */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Quick Selection Options / Source Choice */}
          {parsedRows.length === 0 ? (
            <div>
              {/* Input Type Selector Tabs */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setActiveInputTab('file')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid',
                    borderColor: activeInputTab === 'file' ? '#005f41' : '#e2e8f0',
                    backgroundColor: activeInputTab === 'file' ? '#f0fdf4' : '#ffffff',
                    color: activeInputTab === 'file' ? '#005f41' : '#64748b',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Upload size={14} /> Upload CSV File
                </button>
                <button
                  onClick={() => setActiveInputTab('text')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid',
                    borderColor: activeInputTab === 'text' ? '#005f41' : '#e2e8f0',
                    backgroundColor: activeInputTab === 'text' ? '#f0fdf4' : '#ffffff',
                    color: activeInputTab === 'text' ? '#005f41' : '#64748b',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <FileText size={14} /> Paste Raw Text / SMS
                </button>
                <div style={{ flex: 1 }} />
                <button
                  onClick={handleLoadSample}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: 'var(--bg-card-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Sparkles size={13} color="#059669" /> Load Demo Bank Feed
                </button>
                <button
                  onClick={handleDownloadSample}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: 'var(--bg-card)',
                    color: 'var(--text-muted)',
                    fontSize: '12px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                  title="Download CSV template"
                >
                  <Download size={13} /> Template
                </button>
              </div>

              {/* Drag & Drop Area */}
              {activeInputTab === 'file' ? (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: '2px dashed',
                    borderColor: dragOver ? '#005f41' : '#cbd5e1',
                    backgroundColor: dragOver ? '#f0fdf4' : '#f8fafc',
                    borderRadius: '12px',
                    padding: '48px 24px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileUpload} 
                    accept=".csv,.txt,.tsv" 
                    style={{ display: 'none' }} 
                  />
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    backgroundColor: '#e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px auto',
                    color: 'var(--text-muted)'
                  }}>
                    <Upload size={24} />
                  </div>
                  <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>
                    Click to browse or drag & drop bank statement
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '400px', margin: '0 auto' }}>
                    Supports HDFC, ICICI, SBI, Axis, or generic CSV/TXT statement exports.
                  </p>
                </div>
              ) : (
                /* Raw Textarea Input */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <textarea
                    rows={8}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="Paste CSV rows or transaction narration strings here (e.g. 2026-08-18 SWIGGY GOURMET 540.00)..."
                    style={{
                      width: '100%',
                      padding: '14px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      fontFamily: 'monospace',
                      resize: 'vertical'
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => parseStatementContent(rawText)}
                      className="btn btn-emerald"
                      disabled={!rawText.trim()}
                      style={{ padding: '8px 18px', fontSize: '13px' }}
                    >
                      <Sparkles size={14} /> Parse & Categorize Text
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Parsed Review Table & Categorization Editor */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Top Banner Overview */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                padding: '14px 18px',
                backgroundColor: 'var(--agent-john-glow)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <CheckCircle2 size={20} color="#059669" />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--accent-emerald)' }}>
                      {parsedRows.length} Transactions Detected from {fileName || 'Statement'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {selectedRows.length} selected for import • Auto-categorized via NLP classifier
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase' }}>
                      Total Selected Sum
                    </div>
                    <div className="mono" style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)' }}>
                      {currency}{totalSelectedAmount.toLocaleString()}
                    </div>
                  </div>
                  <button
                    onClick={() => { setParsedRows([]); setFileName(''); setRawText(''); }}
                    className="btn btn-secondary btn-sm"
                  >
                    Reset / Re-upload
                  </button>
                </div>
              </div>

              {/* Table of Parsed Transactions */}
              <div style={{
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                overflow: 'hidden',
                maxHeight: '340px',
                overflowY: 'auto'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                  <thead style={{ backgroundColor: 'var(--bg-card-subtle)', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 10 }}>
                    <tr>
                      <th style={{ padding: '10px 14px', width: '40px' }}>
                        <input 
                          type="checkbox" 
                          checked={parsedRows.length > 0 && parsedRows.every(r => r.selected)}
                          onChange={handleToggleSelectAll}
                        />
                      </th>
                      <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: '700' }}>Date</th>
                      <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: '700' }}>Narration / Description</th>
                      <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: '700' }}>Category</th>
                      <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: '700', textAlign: 'right' }}>Amount</th>
                      <th style={{ padding: '10px 14px', width: '40px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((row) => (
                      <tr 
                        key={row.id} 
                        style={{ 
                          borderBottom: '1px solid #f1f5f9',
                          backgroundColor: row.selected ? '#ffffff' : '#f8fafc',
                          opacity: row.selected ? 1 : 0.6
                        }}
                      >
                        <td style={{ padding: '10px 14px' }}>
                          <input 
                            type="checkbox" 
                            checked={row.selected}
                            onChange={() => handleRowToggle(row.id)}
                          />
                        </td>
                        <td className="mono" style={{ padding: '10px 14px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {row.txnDate}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: '600', color: 'var(--text-primary)' }}>
                          {row.rawDescription}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <select
                            value={row.category}
                            onChange={(e) => handleRowCategoryChange(row.id, e.target.value)}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              border: '1px solid #cbd5e1',
                              fontSize: '11px',
                              fontWeight: '600',
                              backgroundColor: 'var(--bg-card)',
                              color: 'var(--text-primary)'
                            }}
                          >
                            {CATEGORIES.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </td>
                        <td className="mono" style={{ padding: '10px 14px', textAlign: 'right', fontWeight: '700', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                          {currency}{row.amount.toLocaleString()}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <button
                            onClick={() => handleRowDelete(row.id)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
                            title="Remove row"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorMsg && (
            <div style={{
              padding: '12px 16px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              color: '#dc2626',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--bg-card-subtle)'
        }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {parsedRows.length > 0 ? (
              <span>Ready to ingest {selectedRows.length} records into your live financial record.</span>
            ) : (
              <span>Supported files: CSV, TSV, TXT statement logs.</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={onClose}
              className="btn btn-secondary"
              disabled={isSubmitting}
            >
              Cancel
            </button>

            {parsedRows.length > 0 && (
              <button
                onClick={handleConfirmImport}
                className="btn btn-emerald"
                disabled={isSubmitting || selectedRows.length === 0}
                style={{ padding: '10px 20px', fontWeight: '700' }}
              >
                {isSubmitting ? (
                  <span>Importing...</span>
                ) : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Check size={16} /> Import {selectedRows.length} Transactions ({currency}{totalSelectedAmount.toLocaleString()})
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
