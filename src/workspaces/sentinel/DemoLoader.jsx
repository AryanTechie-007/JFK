import React, { useState, useEffect } from 'react';
import { Upload, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../../services/api/v1';

export default function DemoLoader({ onImportSuccess }) {
  const [demoControlsEnabled, setDemoControlsEnabled] = useState(false);
  const [isLoadingHealth, setIsLoadingHealth] = useState(true);
  const [fileContent, setFileContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileFormat, setFileFormat] = useState('CSV');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function checkDemoControls() {
      try {
        const health = await api.getHealth();
        // Visible only when backend reports demo_controls: true
        setDemoControlsEnabled(Boolean(health?.demo_controls));
      } catch {
        setDemoControlsEnabled(false);
      } finally {
        setIsLoadingHealth(false);
      }
    }
    checkDemoControls();
  }, []);

  if (isLoadingHealth) {
    return null;
  }

  // Gated: completely hidden when demo_controls: false
  if (!demoControlsEnabled) {
    return null;
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const isJson = file.name.endsWith('.json');
    setFileFormat(isJson ? 'JSON' : 'CSV');

    const reader = new FileReader();
    reader.onload = (event) => {
      setFileContent(event.target?.result || '');
    };
    reader.readAsText(file);
  };

  const handleIngest = async (e) => {
    e.preventDefault();
    if (!fileContent.trim()) return;

    setIsSubmitting(true);
    setErrorMsg('');
    setResult(null);

    try {
      let items = [];
      if (fileFormat === 'JSON') {
        const parsed = JSON.parse(fileContent);
        items = Array.isArray(parsed) ? parsed : parsed.transactions || [];
      } else {
        // Parse CSV lines: date,description,amount,movement_type,category
        const lines = fileContent.trim().split('\n').filter(Boolean);
        const header = lines[0].toLowerCase();
        const startIdx = header.includes('date') || header.includes('amount') ? 1 : 0;

        for (let i = startIdx; i < lines.length; i++) {
          const parts = lines[i].split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''));
          if (parts.length >= 2) {
            const date = parts[0] || new Date().toISOString().slice(0, 10);
            const desc = parts[1] || 'Ingested Transaction';
            const amt = Math.round(Math.abs(parseFloat(parts[2] || '0')) * 100);
            items.push({
              raw_description: desc,
              amount_minor: amt,
              txn_date: date,
              source: 'DEMO_SIMULATOR',
            });
          }
        }
      }

      const res = await api.ingestBatch({
        format: fileFormat,
        source: 'DEMO_BANK_FEED',
        transactions: items,
      });

      setResult({
        success: true,
        batch_id: res?.batch_id || `batch_${Date.now()}`,
        count: items.length,
      });

      if (onImportSuccess) onImportSuccess(items, items.length);
    } catch (err) {
      setErrorMsg(`Demo feed ingestion failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="card" style={{ padding: '22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
          Demo: Bank Feed Simulator
        </h3>
        <span
          className="badge"
          style={{ backgroundColor: 'rgba(217, 119, 6, 0.15)', color: '#d97706', fontSize: '11px', fontWeight: '700' }}
        >
          Synthetic Data
        </span>
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
        Enabled only under `DEMO_CONTROLS=true`. Simulates ingestion of live Open Banking transaction feeds for evaluation.
      </p>

      {errorMsg && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'rgba(220, 38, 38, 0.1)',
            border: '1px solid #dc2626',
            color: '#dc2626',
            fontSize: '12px',
            marginBottom: '14px',
          }}
        >
          {errorMsg}
        </div>
      )}

      {result && (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'rgba(5, 150, 105, 0.1)',
            border: '1px solid var(--accent-emerald)',
            color: 'var(--text-primary)',
            fontSize: '12px',
            marginBottom: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700', color: 'var(--accent-emerald)' }}>
            <CheckCircle2 size={16} />
            <span>Feed Ingestion Completed</span>
          </div>
          <div style={{ marginTop: '2px' }}>
            Batch ID: <span className="mono">{result.batch_id}</span> • {result.count} transactions ingested.
          </div>
        </div>
      )}

      <form onSubmit={handleIngest} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div
          style={{
            border: '2px dashed var(--border-color)',
            borderRadius: 'var(--radius-md)',
            padding: '24px',
            textAlign: 'center',
            backgroundColor: 'var(--bg-primary)',
            cursor: 'pointer',
          }}
          onClick={() => document.getElementById('demo-feed-file-input')?.click()}
        >
          <Upload size={24} color="var(--text-muted)" style={{ margin: '0 auto 8px auto' }} />
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
            {fileName ? fileName : 'Choose CSV or JSON statement file'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Format: Date, Description, Amount (₹)
          </div>
          <input
            id="demo-feed-file-input"
            type="file"
            accept=".csv,.json"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !fileContent.trim()}
          className="btn btn-primary"
          style={{ alignSelf: 'flex-start' }}
        >
          <span>{isSubmitting ? 'Simulating Feed Ingest...' : 'Ingest Demo Statement'}</span>
        </button>
      </form>
    </div>
  );
}
