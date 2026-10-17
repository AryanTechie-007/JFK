import React, { useState } from 'react';
import { Sparkles, Target, DollarSign, User, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
import { api } from '../services/api/v1';
import InteractiveSpotsBackground from './InteractiveSpotsBackground';

export default function OnboardingView({ initialData, onCompleteOnboarding, isDarkMode = false }) {
  const [name, setName] = useState(initialData?.name || '');
  const [email, setEmail] = useState(initialData?.email || '');
  const [occupation, setOccupation] = useState('');
  const [monthlyIncome, setMonthlyIncome] = useState('');
  const [fixedExpenses, setFixedExpenses] = useState('');
  const [variableExpenses, setVariableExpenses] = useState('');
  
  // Subscriptions
  const [subscriptionsList, setSubscriptionsList] = useState([]);
  const [subName, setSubName] = useState('');
  const [subAmount, setSubAmount] = useState('');

  const handleAddSubscriptionItem = () => {
    if (!subName.trim()) return;
    const amt = Number(subAmount);
    if (isNaN(amt) || amt <= 0) return;
    setSubscriptionsList(prev => [...prev, { name: subName.trim(), amount: amt, billingCycle: 'monthly', category: 'Entertainment' }]);
    setSubName('');
    setSubAmount('');
  };

  const handleRemoveSubscriptionItem = (idx) => {
    setSubscriptionsList(prev => prev.filter((_, i) => i !== idx));
  };
  
  // Primary Goal Details
  const [primaryGoalName, setPrimaryGoalName] = useState('Emergency Reserve Vault');
  const [primaryGoalTarget, setPrimaryGoalTarget] = useState('');
  const [monthlyContribution, setMonthlyContribution] = useState('');
  const [financialObjective, setFinancialObjective] = useState('Build Emergency Fund & Financial Discipline');
  
  // Risk Strategy Profile
  const [riskProfile, setRiskProfile] = useState('Balanced');

  const [isLoading, setIsLoading] = useState(false);
  const [validationError, setValidationError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');

    // Input Validation
    if (!name.trim()) {
      setValidationError('Please enter your full name.');
      return;
    }
    if (!occupation.trim()) {
      setValidationError('Please enter your occupation / role.');
      return;
    }

    const numIncome = Number(monthlyIncome);
    const numFixed = Number(fixedExpenses);
    const numVar = variableExpenses ? Number(variableExpenses) : Math.round(numFixed * 0.4);
    const numTarget = Number(primaryGoalTarget);
    const numMonthlyAlloc = Number(monthlyContribution);

    if (isNaN(numIncome) || numIncome <= 0) {
      setValidationError('Monthly income must be a positive number.');
      return;
    }
    if (isNaN(numFixed) || numFixed < 0) {
      setValidationError('Fixed expenses must be a non-negative number.');
      return;
    }
    if (numFixed > numIncome) {
      setValidationError('Fixed expenses cannot exceed your total monthly income.');
      return;
    }
    if (numFixed + numVar > numIncome) {
      setValidationError(`Total monthly expenses (₹${(numFixed + numVar).toLocaleString()}) cannot exceed your total monthly income (₹${numIncome.toLocaleString()}).`);
      return;
    }
    if (isNaN(numTarget) || numTarget <= 0) {
      setValidationError('Target goal amount must be a positive number.');
      return;
    }
    if (isNaN(numMonthlyAlloc) || numMonthlyAlloc < 0) {
      setValidationError('Monthly goal allocation must be a non-negative number.');
      return;
    }
    if (numMonthlyAlloc > numTarget) {
      setValidationError(`Monthly goal allocation (₹${numMonthlyAlloc.toLocaleString()}) cannot exceed the target goal amount (₹${numTarget.toLocaleString()}).`);
      return;
    }

    setIsLoading(true);

    const totalSpent = numFixed + numVar;
    const netSurplus = Math.max(0, numIncome - totalSpent);
    const savingsRate = numIncome > 0 ? Number(((netSurplus / numIncome) * 100).toFixed(1)) : 0;

    const onboardingProfile = {
      name,
      email,
      occupation,
      currency: "₹",
      monthlyIncome: numIncome,
      fixedExpenses: numFixed,
      variableExpenses: numVar,
      totalSpentThisMonth: totalSpent,
      currentSavings: netSurplus,
      savingsRate: savingsRate,
      riskStrategy: riskProfile,
      financialObjective: financialObjective,
      healthScore: savingsRate > 20 ? 84 : 70,
      scoreBreakdown: {
        savingBehavior: Math.min(100, Math.round(savingsRate * 3)),
        budgetDiscipline: 80,
        spendingControl: 78,
        futurePlanning: 85
      }
    };

    const initialGoal = {
      id: `goal-${Date.now()}`,
      name: primaryGoalName,
      priority: "HIGH PRIORITY",
      current: Math.round(numTarget * 0.1),
      target: numTarget,
      targetDate: "Expected in 12 months",
      category: "Safety",
      iconType: "shield",
      monthlyAdd: numMonthlyAlloc
    };

    try {
      // 1. Update Profile via v1 Action Service (T1/T2)
      await api.executeAction({
        action: 'UPDATE_USER_PROFILE',
        params: {
          display_name: name,
          declared_income_minor: Math.round(numIncome * 100),
        },
      });

      // 2. Update Preferences
      await api.executeAction({
        action: 'UPDATE_USER_PREFERENCES',
        params: {
          risk_comfort: (riskProfile || 'BALANCED').toUpperCase(),
          llm_processing_consent: true,
        },
      });

      // 3. Create initial goal
      try {
        await api.executeAction({
          action: 'CREATE_GOAL',
          params: {
            name: primaryGoalName,
            target_minor: Math.round(numTarget * 100),
            monthly_add_minor: Math.round(numMonthlyAlloc * 100),
            priority: 'HIGH',
          },
        });
      } catch (_) {}

      // 4. Save declared recurring bills
      if (subscriptionsList.length > 0) {
        for (const sub of subscriptionsList) {
          try {
            await api.executeAction({
              action: 'CREATE_DECLARED_BILL',
              params: {
                label: sub.name,
                amount_minor: Math.round(sub.amount * 100),
                cadence: 'MONTHLY',
                next_due_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
              },
            });
          } catch (_) {}
        }
      }

      onCompleteOnboarding(onboardingProfile, initialGoal);
    } catch (err) {
      console.warn('Backend onboarding API exception:', err);
      onCompleteOnboarding(onboardingProfile, initialGoal);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <InteractiveSpotsBackground isDarkMode={isDarkMode}>
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '36px 24px'
      }}>
        <div className="card" style={{
          width: '100%',
          maxWidth: '680px',
          padding: '36px',
          backgroundColor: 'var(--bg-card)',
          boxShadow: isDarkMode 
            ? '0 20px 40px -10px rgba(0, 0, 0, 0.7), 0 0 30px rgba(36, 210, 154, 0.1)' 
            : '0 20px 40px -10px rgba(28, 48, 36, 0.15)',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          backdropFilter: 'blur(10px)'
        }}>
        
        {/* Onboarding Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '14px',
            backgroundColor: '#005f41',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            margin: '0 auto 12px auto'
          }}>
            <Sparkles size={26} />
          </div>

          <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a', fontFamily: 'var(--font-serif)', letterSpacing: '-0.02em' }}>
            FinHack Account Setup & Financial Profile
          </h1>
          <p style={{ fontSize: '14px', color: '#64748b', marginTop: '6px', fontFamily: 'var(--font-sans)' }}>
            Tell John about your financial details so your AI agents can tailor real cash-flow strategies.
          </p>
        </div>

        {/* Validation Error Alert */}
        {validationError && (
          <div style={{
            padding: '12px 16px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 'var(--radius-md)',
            color: '#dc2626',
            fontSize: '13px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertCircle size={16} />
            <span>{validationError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Section 1: Major Profile */}
          <div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', marginBottom: '12px', fontFamily: 'var(--font-serif)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={16} color="#059669" />
              <span>1. Profile & Professional Role</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', marginBottom: '4px', display: 'block', fontFamily: 'var(--font-sans)' }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Sarah Connor"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', marginBottom: '4px', display: 'block', fontFamily: 'var(--font-sans)' }}>
                  Occupation / Role *
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Software Engineer, Designer"
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          {/* Section 2: Cash Flow Details */}
          <div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', marginBottom: '12px', fontFamily: 'var(--font-serif)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <DollarSign size={16} color="#059669" />
              <span>2. Cash Flow & Monthly Income</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', marginBottom: '4px', display: 'block', fontFamily: 'var(--font-sans)' }}>
                  Monthly Net Income (₹) *
                </label>
                <input
                  type="number"
                  className="input"
                  placeholder="e.g. 85000"
                  value={monthlyIncome}
                  onChange={(e) => setMonthlyIncome(e.target.value)}
                  min="1"
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', marginBottom: '4px', display: 'block', fontFamily: 'var(--font-sans)' }}>
                  Fixed Expenses (Rent, EMI, Bills) (₹) *
                </label>
                <input
                  type="number"
                  className="input"
                  placeholder="e.g. 30000"
                  value={fixedExpenses}
                  onChange={(e) => setFixedExpenses(e.target.value)}
                  min="0"
                  required
                />
              </div>
            </div>

            <div style={{ marginTop: '12px' }}>
              <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', marginBottom: '4px', display: 'block', fontFamily: 'var(--font-sans)' }}>
                Estimated Variable Monthly Expenses (Food, Leisure, Shopping) (₹)
              </label>
              <input
                type="number"
                className="input"
                placeholder="e.g. 20000 (Optional, defaults to estimate)"
                value={variableExpenses}
                onChange={(e) => setVariableExpenses(e.target.value)}
                min="0"
              />
            </div>
          </div>

          {/* Section 3: Primary Financial Goal */}
          <div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', marginBottom: '12px', fontFamily: 'var(--font-serif)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Target size={16} color="#059669" />
              <span>3. Primary Financial Objective (Atlas Strategist)</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', marginBottom: '4px', display: 'block', fontFamily: 'var(--font-sans)' }}>
                  Goal Name *
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Emergency Fund, Laptop"
                  value={primaryGoalName}
                  onChange={(e) => setPrimaryGoalName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', marginBottom: '4px', display: 'block', fontFamily: 'var(--font-sans)' }}>
                  Target Goal Amount (₹) *
                </label>
                <input
                  type="number"
                  className="input"
                  placeholder="e.g. 150000"
                  value={primaryGoalTarget}
                  onChange={(e) => setPrimaryGoalTarget(e.target.value)}
                  min="1"
                  required
                />
              </div>
            </div>

            <div style={{ marginTop: '12px' }}>
              <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', marginBottom: '4px', display: 'block', fontFamily: 'var(--font-sans)' }}>
                Monthly Contribution Allocation (₹) *
              </label>
              <input
                type="number"
                className="input"
                placeholder="e.g. 10000"
                value={monthlyContribution}
                onChange={(e) => setMonthlyContribution(e.target.value)}
                min="0"
                required
              />
            </div>
          </div>

          {/* Section 4: Active Subscriptions */}
          <div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', marginBottom: '8px', fontFamily: 'var(--font-serif)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={16} color="#059669" />
              <span>4. Subscriptions You Pay For (Optional)</span>
            </div>
            <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
              Enter any services you currently subscribe to (e.g. Netflix, Spotify, Gym, Cloud Storage).
            </p>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="input"
                placeholder="Service name (e.g. Netflix)"
                value={subName}
                onChange={(e) => setSubName(e.target.value)}
                style={{ flex: 2, minWidth: '140px' }}
              />
              <input
                type="number"
                className="input"
                placeholder="₹/mo"
                value={subAmount}
                onChange={(e) => setSubAmount(e.target.value)}
                style={{ flex: 1, minWidth: '90px' }}
              />
              <button
                type="button"
                onClick={handleAddSubscriptionItem}
                className="btn btn-secondary"
                style={{ padding: '0 16px', fontWeight: '700' }}
              >
                + Add
              </button>
            </div>

            {subscriptionsList.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', backgroundColor: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                {subscriptionsList.map((sub, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                    <span style={{ fontWeight: '600', color: '#1e293b' }}>{sub.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span className="mono" style={{ color: '#059669', fontWeight: '700' }}>₹{sub.amount}/mo</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSubscriptionItem(idx)}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 5: Risk Profile */}
          <div>
            <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', marginBottom: '6px', display: 'block', fontFamily: 'var(--font-sans)' }}>
              Financial Risk & Planning Strategy
            </label>
            <select
              className="input"
              value={riskProfile}
              onChange={(e) => setRiskProfile(e.target.value)}
            >
              <option value="Conservative">Conservative — Safety & Emergency Cushion First</option>
              <option value="Balanced">Balanced — Optimized Savings + Moderate Growth</option>
              <option value="Aggressive">Aggressive — Maximum Wealth Accumulation & SIPs</option>
            </select>
          </div>

          {/* Submit */}
          <button 
            type="submit" 
            className="btn btn-emerald" 
            style={{ padding: '14px', marginTop: '8px', justifyContent: 'center' }}
            disabled={isLoading}
          >
            {isLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Loader2 size={18} className="spin" />
                <span>Saving Profile & Launching John AI Coach...</span>
              </div>
            ) : (
              <span>Complete Onboarding & Launch John AI Coach </span>
            )}
          </button>

        </form>

      </div>
    </div>
    </InteractiveSpotsBackground>
  );
}
