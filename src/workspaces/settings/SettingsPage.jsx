import React, { useState, useEffect } from 'react';
import {
  User,
  Save,
  Sliders,
  Shield,
  Brain,
  Trash2,
  Sun,
  Moon,
  Laptop,
  AlertTriangle,
  Plus,
  CheckCircle2,
} from 'lucide-react';
import { api } from '../../services/api/v1';
import { formatMinorInr } from '../../lib/format';
import DisabledControl from '../../components/ui/DisabledControl';
import UndoBar from '../../components/ui/UndoBar';

const PROTECTABLE_CATEGORIES = [
  { id: 'HEALTH', label: 'Healthcare & Pharmacy (HEALTH)' },
  { id: 'UTILITIES', label: 'Utilities & Bills (UTILITIES)' },
  { id: 'FOOD.GROCERIES', label: 'Essential Groceries (FOOD.GROCERIES)' },
  { id: 'EDUCATION', label: 'Education & Tuition (EDUCATION)' },
  { id: 'TRANSPORT', label: 'Daily Commute (TRANSPORT)' },
];

export default function SettingsPage({
  userProfile,
  setUserProfile,
  showNotification,
  themeMode,
  setThemeMode,
}) {
  const [name, setName] = useState(userProfile?.name || userProfile?.display_name || '');
  const [incomeRupees, setIncomeRupees] = useState(
    userProfile?.declared_income_minor != null
      ? String(Math.round(userProfile.declared_income_minor / 100))
      : userProfile?.monthlyIncome != null
      ? String(userProfile.monthlyIncome)
      : ''
  );

  // Preferences
  const [riskComfort, setRiskComfort] = useState('BALANCED');
  const [emergencyBufferMonths, setEmergencyBufferMonths] = useState(3);
  const [protectedCategories, setProtectedCategories] = useState(['HEALTH', 'UTILITIES']);
  const [llmConsent, setLlmConsent] = useState(true);

  // Rules and Memory
  const [categoryRules, setCategoryRules] = useState([]);
  const [memoryFacts, setMemoryFacts] = useState([]);
  const [newFactText, setNewFactText] = useState('');

  // Status & UndoBar
  const [activeUndo, setActiveUndo] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      try {
        const settingsRes = await api.getSettings();
        if (settingsRes?.profile) {
          const prof = settingsRes.profile;
          if (prof.name || prof.display_name) setName(prof.name || prof.display_name);
          if (prof.declared_income_minor != null) {
            setIncomeRupees(String(Math.round(prof.declared_income_minor / 100)));
          }
          if (prof.risk_comfort) setRiskComfort(prof.risk_comfort);
          if (prof.emergency_buffer_months != null) setEmergencyBufferMonths(prof.emergency_buffer_months);
          if (Array.isArray(prof.protected_categories)) setProtectedCategories(prof.protected_categories);
          if (prof.llm_processing_consent !== undefined) setLlmConsent(Boolean(prof.llm_processing_consent));
        }
        if (Array.isArray(settingsRes?.category_rules)) {
          setCategoryRules(settingsRes.category_rules);
        }
        if (Array.isArray(settingsRes?.memory_facts)) {
          setMemoryFacts(settingsRes.memory_facts);
        }
      } catch (err) {
        console.warn('Could not load settings:', err);
      }
    }
    loadSettings();
  }, []);

  const handleToggleProtectedCategory = (catId) => {
    setProtectedCategories((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId]
    );
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setStatusMsg('');

    try {
      const declaredIncomeMinor = incomeRupees ? Math.round(Number(incomeRupees) * 100) : null;
      await api.executeAction({
        action: 'UPDATE_USER_PROFILE',
        params: {
          display_name: name.trim(),
          declared_income_minor: declaredIncomeMinor,
        },
      });

      // Update preferences
      const prefRes = await api.executeAction({
        action: 'UPDATE_USER_PREFERENCES',
        params: {
          risk_comfort: riskComfort,
          emergency_buffer_months: Number(emergencyBufferMonths),
          protected_categories: protectedCategories,
          llm_processing_consent: llmConsent,
        },
      });

      setStatusMsg('Profile and financial preferences saved.');
      if (prefRes?.action_id || prefRes?.executed_action?.action_id) {
        setActiveUndo({
          actionId: prefRes.action_id || prefRes.executed_action.action_id,
          label: 'Updated settings & risk comfort',
          expiresAt: Date.now() + 300000,
        });
      }

      if (setUserProfile) {
        setUserProfile((prev) => ({
          ...prev,
          name: name.trim(),
          display_name: name.trim(),
          declared_income_minor: declaredIncomeMinor,
          monthlyIncome: incomeRupees ? Number(incomeRupees) : prev?.monthlyIncome,
        }));
      }

      if (showNotification) {
        showNotification('Settings Saved', 'Profile, consent, and risk comfort preferences updated.');
      }
    } catch (err) {
      setStatusMsg(`Save failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUndo = async () => {
    if (!activeUndo?.actionId) return;
    try {
      await api.undoAction(activeUndo.actionId);
      setStatusMsg('Preferences change undone.');
      setActiveUndo(null);
    } catch (err) {
      setStatusMsg(`Undo failed: ${err.message}`);
    }
  };

  const handleAddMemoryFact = async (e) => {
    e.preventDefault();
    if (!newFactText.trim()) return;
    try {
      const res = await api.addMemoryFact(newFactText.trim());
      if (res?.fact) {
        setMemoryFacts((prev) => [res.fact, ...prev]);
      }
      setNewFactText('');
      setStatusMsg('Memory fact recorded in John context store.');
    } catch (err) {
      setStatusMsg(`Could not add memory fact: ${err.message}`);
    }
  };

  const handleDeleteMemoryFact = async (factId) => {
    try {
      await api.deleteMemoryFact(factId);
      setMemoryFacts((prev) => prev.filter((f) => f.fact_id !== factId));
      setStatusMsg('Memory fact removed.');
    } catch (err) {
      setStatusMsg(`Could not delete fact: ${err.message}`);
    }
  };

  return (
    <div style={{ maxWidth: '920px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Title */}
      <div>
        <h1
          style={{
            fontSize: '24px',
            fontWeight: '800',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-serif)',
            margin: 0,
          }}
        >
          Profile & System Settings
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
          Configure user identity, declared baseline income, AI processing consent, and risk parameters.
        </p>
      </div>

      {activeUndo && (
        <UndoBar
          label={activeUndo.label}
          onUndo={handleUndo}
          undoAvailableUntil={activeUndo.expiresAt}
        />
      )}

      {statusMsg && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            fontSize: '13px',
          }}
        >
          {statusMsg}
        </div>
      )}

      {/* Profile & Income Form */}
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <User size={18} color="var(--accent-emerald)" />
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
            Identity & Declared Income
          </h2>
        </div>

        <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                required
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Declared Monthly Income (₹)
              </label>
              <input
                type="number"
                placeholder="e.g. 150000"
                value={incomeRupees}
                onChange={(e) => setIncomeRupees(e.target.value)}
                className="input"
                min="0"
                step="any"
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '4px' }}>
                If empty, Sentinel derives observed monthly income from recurring salary inflows.
              </span>
            </div>
          </div>

          {/* Preferences: Risk & Protected Categories */}
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '18px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '12px' }}>
              Financial Risk Comfort (SC §5.4)
            </h3>
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
              {['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE'].map((level) => (
                <label
                  key={level}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 14px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: riskComfort === level ? 'var(--bg-tertiary)' : 'var(--bg-primary)',
                    border: '1px solid',
                    borderColor: riskComfort === level ? 'var(--border-focus)' : 'var(--border-color)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: riskComfort === level ? '700' : '500',
                  }}
                >
                  <input
                    type="radio"
                    name="riskComfort"
                    value={level}
                    checked={riskComfort === level}
                    onChange={(e) => setRiskComfort(e.target.value)}
                  />
                  <span>{level.charAt(0) + level.slice(1).toLowerCase()}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Protected Categories */}
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '18px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '6px' }}>
              Protected Essential Categories (D-016)
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Autonomous rebalance and cap reduction proposals will not trim these categories without explicit user override.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {PROTECTABLE_CATEGORIES.map((cat) => (
                <label
                  key={cat.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={protectedCategories.includes(cat.id)}
                    onChange={() => handleToggleProtectedCategory(cat.id)}
                  />
                  <span>{cat.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* AI Processing Consent Toggle */}
          <div
            style={{
              borderTop: '1px solid var(--border-color)',
              paddingTop: '18px',
              backgroundColor: !llmConsent ? 'rgba(217, 119, 6, 0.08)' : 'transparent',
              padding: '14px',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
                  AI Processing & LLM Consent (SC §16.6, D-PLAN-6)
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Allow FinMate to transmit redacted financial summaries to AI models to power interactive chat.
                </div>
              </div>
              <input
                type="checkbox"
                checked={llmConsent}
                onChange={(e) => setLlmConsent(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
            </div>

            {!llmConsent && (
              <div style={{ marginTop: '10px', fontSize: '12px', color: '#d97706', fontWeight: '600' }}>
                John chat is disabled; workspaces still work with 100% deterministic rules.
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="btn btn-primary"
            style={{ alignSelf: 'flex-start', marginTop: '10px' }}
          >
            <Save size={15} />
            <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </form>
      </div>

      {/* Category Rules (Read-Only per WS-UI-P2 §12) */}
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              Deterministic Category Rules
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
              Item Categorizer rule engine priority rules (Read-only; editing deferred in prototype).
            </p>
          </div>
          <DisabledControl tooltip="Category rule authoring is not in prototype (Doc 7 §8)">
            <button className="btn btn-secondary btn-sm" disabled style={{ fontSize: '11px' }}>
              + Add Rule
            </button>
          </DisabledControl>
        </div>

        {categoryRules.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
            No user category rules defined. Default deterministic patterns apply.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {categoryRules.map((rule) => (
              <div
                key={rule.rule_id || rule.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  fontSize: '12px',
                }}
              >
                <div>
                  <span style={{ fontWeight: '700', color: 'var(--text-primary)' }}>
                    {rule.merchant_pattern || rule.pattern}
                  </span>
                  <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>
                    → {rule.target_category_id || rule.category_id}
                  </span>
                </div>
                <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Priority: {rule.priority ?? 100}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* John Memory Facts (Store Routes) */}
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <Brain size={18} color="var(--accent-emerald)" />
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              John Assistant Memory Facts
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
              Persistent contextual facts provided by the user to ground financial advice turns.
            </p>
          </div>
        </div>

        <form onSubmit={handleAddMemoryFact} style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          <input
            type="text"
            placeholder="e.g. Planning a wedding in November 2026; vegetarian household"
            value={newFactText}
            onChange={(e) => setNewFactText(e.target.value)}
            className="input"
            maxLength={200}
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={!newFactText.trim()} className="btn btn-primary btn-sm">
            <Plus size={14} />
            <span>Add Fact</span>
          </button>
        </form>

        {memoryFacts.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
            No memory facts stored yet. Add facts to give John personalized life context.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {memoryFacts.map((fact) => (
              <div
                key={fact.fact_id || fact.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  fontSize: '13px',
                }}
              >
                <span style={{ color: 'var(--text-primary)' }}>{fact.text}</span>
                <button
                  onClick={() => handleDeleteMemoryFact(fact.fact_id || fact.id)}
                  className="btn btn-ghost btn-sm"
                  style={{ color: '#dc2626' }}
                  title="Delete Fact"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Theme Toggle */}
      <div className="card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '14px' }}>
          Interface Theme
        </h3>
        <div style={{ display: 'flex', gap: '10px' }}>
          {[
            { id: 'system', label: 'System Default', icon: Laptop },
            { id: 'light', label: 'Light', icon: Sun },
            { id: 'dark', label: 'Dark', icon: Moon },
          ].map((mode) => {
            const Icon = mode.icon;
            const isActive = themeMode === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => setThemeMode(mode.id)}
                className={isActive ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <Icon size={14} />
                <span>{mode.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
