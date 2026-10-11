import React, { useState, useEffect } from 'react';
import {
  User,
  Save,
  Sliders,
  Sun,
  Moon,
  Laptop,
  Shield,
  Brain,
  Trash2
} from 'lucide-react';

import { profileService } from '../services/profileService';
import { transactionService } from '../services/transactionService';
import { workspaceService } from '../services/workspaceService';

const PROTECTABLE_CATEGORIES = [
  { id: 'HEALTH', label: 'Healthcare & Pharmacy (HEALTH)' },
  { id: 'UTILITIES', label: 'Utilities & Bills (UTILITIES)' },
  { id: 'FOOD.GROCERIES', label: 'Essential Groceries (FOOD.GROCERIES)' },
  { id: 'EDUCATION', label: 'Education & Tuition (EDUCATION)' },
  { id: 'TRANSPORT', label: 'Daily Commute (TRANSPORT)' }
];

export default function SettingsView({
  userProfile,
  setUserProfile,
  budgets,
  setBudgets,
  showNotification,
  themeMode,
  setThemeMode,
  isDarkMode
}) {
  const [name, setName] = useState(userProfile?.name || '');
  const [income, setIncome] = useState(userProfile?.monthlyIncome || 0);
  const [fixedExpenses, setFixedExpenses] = useState(userProfile?.fixedExpenses || 0);

  // Canonical v1 profile preferences
  const [riskComfort, setRiskComfort] = useState('BALANCED');
  const [emergencyBufferMonths, setEmergencyBufferMonths] = useState(3);
  const [protectedCategories, setProtectedCategories] = useState(['HEALTH', 'UTILITIES']);
  const [llmConsent, setLlmConsent] = useState(true);
  const [memoryFacts, setMemoryFacts] = useState([]);
  const [snapshotId, setSnapshotId] = useState(null);

  // Custom budget limits per category
  const [foodLimit, setFoodLimit] = useState(budgets.find((b) => b.category === 'Food & Dining')?.limit || 10000);
  const [shoppingLimit, setShoppingLimit] = useState(budgets.find((b) => b.category === 'Shopping & Lifestyle')?.limit || 10000);
  const [subLimit, setSubLimit] = useState(budgets.find((b) => b.category === 'Subscriptions')?.limit || 3000);
  const [transportLimit, setTransportLimit] = useState(budgets.find((b) => b.category === 'Transport')?.limit || 5000);
  const [utilitiesLimit, setUtilitiesLimit] = useState(budgets.find((b) => b.category === 'Bills & Utilities')?.limit || 5000);

  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function loadCanonicalSettings() {
      try {
        const [sentinelWs, memRes] = await Promise.all([
          workspaceService.getSentinelWorkspace(),
          workspaceService.getMemoryFacts()
        ]);
        if (sentinelWs?.snapshot_id) {
          setSnapshotId(sentinelWs.snapshot_id);
        }
        if (sentinelWs?.profile) {
          setRiskComfort(sentinelWs.profile.risk_comfort || 'BALANCED');
          setEmergencyBufferMonths(sentinelWs.profile.emergency_buffer_months ?? 3);
          setProtectedCategories(sentinelWs.profile.protected_categories || ['HEALTH', 'UTILITIES']);
          setLlmConsent(Boolean(sentinelWs.profile.llm_processing_consent));
        }
        if (memRes?.facts) {
          setMemoryFacts(memRes.facts);
        }
      } catch (_) {}
    }
    loadCanonicalSettings();
  }, []);

  const toggleProtectedCategory = (catId) => {
    setProtectedCategories((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    );
  };

  const handleDeleteMemoryFact = async (factId) => {
    try {
      await workspaceService.executeAction({
        action_type: 'DELETE_MEMORY_FACT',
        snapshot_id: snapshotId,
        params: { fact_id: factId }
      });
      setMemoryFacts((prev) => prev.filter((f) => f.fact_id !== factId));
    } catch (_) {}
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const numIncome = Number(income);
    const numFixed = Number(fixedExpenses);

    if (isNaN(numIncome) || numIncome <= 0) {
      setErrorMsg('Monthly Income must be a positive number.');
      return;
    }

    if (numFixed > numIncome) {
      setErrorMsg(`Fixed Monthly Expenses (₹${numFixed.toLocaleString('en-IN')}) cannot exceed total Monthly Earnings (₹${numIncome.toLocaleString('en-IN')}).`);
      return;
    }

    const totalCategoryLimits =
      Number(foodLimit) +
      Number(shoppingLimit) +
      Number(subLimit) +
      Number(transportLimit) +
      Number(utilitiesLimit);
    if (totalCategoryLimits > numIncome) {
      setErrorMsg(`Combined Category Budget Caps (₹${totalCategoryLimits.toLocaleString('en-IN')}) cannot exceed total Monthly Earnings (₹${numIncome.toLocaleString('en-IN')}).`);
      return;
    }

    const totalSpent = userProfile?.totalSpentThisMonth || 0;
    const newNetSurplus = Math.max(0, numIncome - totalSpent);
    const newSavingsRate = numIncome > 0 ? Number(((newNetSurplus / numIncome) * 100).toFixed(1)) : 0;

    const updatedProfile = {
      ...userProfile,
      name,
      monthlyIncome: numIncome,
      fixedExpenses: numFixed,
      currentSavings: newNetSurplus,
      savingsRate: newSavingsRate
    };

    setUserProfile(updatedProfile);
    await profileService.updateProfile(updatedProfile);

    // Sync v1 UserProfile@1 via Action Service
    try {
      await workspaceService.executeAction({
        action_type: 'UPDATE_PROFILE',
        snapshot_id: snapshotId,
        params: {
          display_name: name,
          declared_income_minor: Math.round(numIncome * 100),
          fixed_outflow_minor: Math.round(numFixed * 100),
          emergency_buffer_months: Number(emergencyBufferMonths) || 3,
          risk_comfort: riskComfort,
          protected_categories: protectedCategories,
          llm_processing_consent: llmConsent
        }
      });
    } catch (_) {}

    const updatedBudgets = budgets.map((b) => {
      let newLimit = b.limit;
      if (b.category === 'Food & Dining') newLimit = Number(foodLimit);
      if (b.category === 'Shopping & Lifestyle') newLimit = Number(shoppingLimit);
      if (b.category === 'Subscriptions') newLimit = Number(subLimit);
      if (b.category === 'Transport') newLimit = Number(transportLimit);
      if (b.category === 'Bills & Utilities') newLimit = Number(utilitiesLimit);

      return {
        ...b,
        limit: newLimit,
        percentage: Math.round((b.spent / newLimit) * 100)
      };
    });

    setBudgets(updatedBudgets);
    await transactionService.updateBudgets(updatedBudgets);

    if (showNotification) {
      showNotification('Profile & Governance Saved!', 'Sentinel, John, Atlas, Nova, and Iris have synced to your updated profile.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Title Header */}
      <div>
        <h1 style={{ fontSize: '32px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.02em', fontFamily: 'var(--font-serif)' }}>
          Financial Profile, Governance &amp; Settings
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
          Configure your income, fixed obligations, protected categories, risk comfort, and privacy preferences.
        </p>
      </div>

      {/* Theme Appearance Mode Toggle */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', fontFamily: 'var(--font-serif)' }}>
              App Appearance &amp; Theme Mode
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'var(--font-sans)' }}>
              Choose between light mode (warm cream forest), dark mode (prismatic obsidian), or follow your system preference.
            </p>
          </div>

          <div style={{
            display: 'flex',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            padding: '4px',
            gap: '4px'
          }}>
            <button
              type="button"
              onClick={() => setThemeMode && setThemeMode('light')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: themeMode === 'light' ? 'var(--bg-card)' : 'transparent',
                color: themeMode === 'light' ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: themeMode === 'light' ? '700' : '500',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              <Sun size={15} color={themeMode === 'light' ? 'var(--accent-amber)' : 'currentColor'} />
              <span>Light</span>
            </button>

            <button
              type="button"
              onClick={() => setThemeMode && setThemeMode('dark')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: themeMode === 'dark' ? 'var(--bg-card)' : 'transparent',
                color: themeMode === 'dark' ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: themeMode === 'dark' ? '700' : '500',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              <Moon size={15} color={themeMode === 'dark' ? 'var(--accent-emerald)' : 'currentColor'} />
              <span>Dark</span>
            </button>

            <button
              type="button"
              onClick={() => setThemeMode && setThemeMode('system')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: themeMode === 'system' ? 'var(--bg-card)' : 'transparent',
                color: themeMode === 'system' ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: themeMode === 'system' ? '700' : '500',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              <Laptop size={15} />
              <span>System ({isDarkMode ? 'Dark' : 'Light'})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Validation Error Alert */}
      {errorMsg && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: 'rgba(220, 38, 38, 0.1)',
          border: '1px solid #dc2626',
          borderRadius: 'var(--radius-md)',
          color: '#dc2626',
          fontSize: '13px'
        }}>
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Left Column: Personal Cash Flow & Governance */}
        <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'rgba(5, 150, 105, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
              <User size={18} />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>Income, Risk Comfort &amp; Protected Categories</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Canonical UserProfile@1 parameters</div>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '6px', display: 'block' }}>
              Display Name
            </label>
            <input
              type="text"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '6px', display: 'block' }}>
                Declared Monthly Income (₹)
              </label>
              <input
                type="number"
                className="input"
                value={income}
                onChange={(e) => setIncome(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '6px', display: 'block' }}>
                Fixed Monthly Obligations (₹)
              </label>
              <input
                type="number"
                className="input"
                value={fixedExpenses}
                onChange={(e) => setFixedExpenses(e.target.value)}
                required
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '6px', display: 'block' }}>
                Risk Comfort (SC §5.2)
              </label>
              <select
                className="input"
                value={riskComfort}
                onChange={(e) => setRiskComfort(e.target.value)}
              >
                <option value="CONSERVATIVE">CONSERVATIVE (P80 Conservative Headline)</option>
                <option value="BALANCED">BALANCED</option>
                <option value="GROWTH">GROWTH</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '6px', display: 'block' }}>
                Emergency Buffer Target (Months)
              </label>
              <input
                type="number"
                min="1"
                max="24"
                className="input"
                value={emergencyBufferMonths}
                onChange={(e) => setEmergencyBufferMonths(e.target.value)}
              />
            </div>
          </div>

          {/* Protected Categories */}
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Shield size={13} color="#059669" />
              <span>Protected Categories (Iris &amp; Nova will never propose reducing these)</span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
              {PROTECTABLE_CATEGORIES.map((cat) => {
                const isProtected = protectedCategories.includes(cat.id);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => toggleProtectedCategory(cat.id)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: `1px solid ${isProtected ? '#059669' : 'var(--border-color)'}`,
                      backgroundColor: isProtected ? 'rgba(5, 150, 105, 0.12)' : 'var(--bg-card-subtle)',
                      color: isProtected ? '#059669' : 'var(--text-secondary)',
                      fontSize: '11px',
                      fontWeight: isProtected ? '700' : '500',
                      cursor: 'pointer'
                    }}
                  >
                    {isProtected ? '✓ ' : ''}{cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* LLM Processing Consent */}
          <div style={{
            padding: '12px',
            borderRadius: '8px',
            backgroundColor: 'var(--bg-card-subtle)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px'
          }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>
                LLM Processing Consent (SC §16.5)
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Allow redacted summaries to be processed by John and specialist agents. Deterministic workspaces always work even when disabled.
              </div>
            </div>
            <input
              type="checkbox"
              checked={llmConsent}
              onChange={(e) => setLlmConsent(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: '#059669', cursor: 'pointer' }}
            />
          </div>
        </div>

        {/* Right Column: Category Budget Caps & Memory Facts */}
        <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'rgba(217, 119, 6, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706' }}>
              <Sliders size={18} />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>Standing Category Budget Caps</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Synced with Nova Budget Guardian</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '6px', display: 'block' }}>
                Food &amp; Dining Cap (₹)
              </label>
              <input type="number" className="input" value={foodLimit} onChange={(e) => setFoodLimit(e.target.value)} required />
            </div>

            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '6px', display: 'block' }}>
                Shopping &amp; Lifestyle Cap (₹)
              </label>
              <input type="number" className="input" value={shoppingLimit} onChange={(e) => setShoppingLimit(e.target.value)} required />
            </div>

            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '6px', display: 'block' }}>
                Subscriptions Cap (₹)
              </label>
              <input type="number" className="input" value={subLimit} onChange={(e) => setSubLimit(e.target.value)} required />
            </div>

            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '6px', display: 'block' }}>
                Transport Cap (₹)
              </label>
              <input type="number" className="input" value={transportLimit} onChange={(e) => setTransportLimit(e.target.value)} required />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '6px', display: 'block' }}>
              Bills &amp; Utilities Cap (₹)
            </label>
            <input type="number" className="input" value={utilitiesLimit} onChange={(e) => setUtilitiesLimit(e.target.value)} required />
          </div>

          {/* John Memory Facts Viewer */}
          <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'var(--bg-card-subtle)', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
              <Brain size={14} color="#059669" />
              <span>John Decision Memory Facts ({memoryFacts.length})</span>
            </div>
            {memoryFacts.length === 0 ? (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                No durable decision facts stored yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '110px', overflowY: 'auto' }}>
                {memoryFacts.map((fact) => (
                  <div key={fact.fact_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', padding: '4px 8px', borderRadius: '4px', backgroundColor: 'var(--bg-card)' }}>
                    <span><strong>{fact.fact_type}</strong>: {fact.summary}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteMemoryFact(fact.fact_id)}
                      style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button type="submit" className="btn btn-emerald" style={{ padding: '12px', marginTop: 'auto', justifyContent: 'center' }}>
            <Save size={16} />
            <span>Save Profile, Governance &amp; Sync Agents</span>
          </button>
        </div>
      </form>
    </div>
  );
}
