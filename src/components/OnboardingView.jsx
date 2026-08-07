import React, { useState } from 'react';
import { Sparkles, ShieldCheck, Target, DollarSign, User, CheckCircle2, ArrowRight } from 'lucide-react';

export default function OnboardingView({ initialData, onCompleteOnboarding }) {
  const [name, setName] = useState(initialData?.name || 'Aryan');
  const [occupation, setOccupation] = useState('Software Engineer');
  const [monthlyIncome, setMonthlyIncome] = useState(75000);
  const [fixedExpenses, setFixedExpenses] = useState(25000);
  
  // Primary Goal Details
  const [primaryGoalName, setPrimaryGoalName] = useState('Emergency Reserve Vault');
  const [primaryGoalTarget, setPrimaryGoalTarget] = useState(100000);
  const [monthlyContribution, setMonthlyContribution] = useState(10000);
  
  // Habit estimates
  const [foodBudget, setFoodBudget] = useState(10000);
  const [shoppingBudget, setShoppingBudget] = useState(10000);
  const [riskProfile, setRiskProfile] = useState('Balanced');

  const handleSubmit = (e) => {
    e.preventDefault();

    const numIncome = Number(monthlyIncome);
    const numFixed = Number(fixedExpenses);

    const onboardingProfile = {
      name,
      occupation,
      currency: "₹",
      monthlyIncome: numIncome,
      fixedExpenses: numFixed,
      variableExpenses: 29200,
      totalSpentThisMonth: 54200,
      currentSavings: numIncome - 54200,
      savingsRate: Number((((numIncome - 54200) / numIncome) * 100).toFixed(1)),
      healthScore: 84,
      scoreBreakdown: {
        savingBehavior: 88,
        budgetDiscipline: 78,
        spendingControl: 82,
        futurePlanning: 88
      }
    };

    const initialGoal = {
      id: `goal-${Date.now()}`,
      name: primaryGoalName,
      priority: "HIGH PRIORITY",
      current: 50000,
      target: Number(primaryGoalTarget),
      targetDate: "Expected by Dec 2026",
      category: "Safety",
      iconType: "shield",
      monthlyAdd: Number(monthlyContribution)
    };

    onCompleteOnboarding(onboardingProfile, initialGoal);
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f4f6f8',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '36px 24px'
    }}>
      <div className="card" style={{
        width: '100%',
        maxWidth: '680px',
        padding: '36px',
        backgroundColor: '#ffffff',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)',
        borderRadius: '16px'
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
            FinHack Account Setup & Onboarding
          </h1>
          <p style={{ fontSize: '14px', color: '#64748b', marginTop: '6px', fontFamily: 'var(--font-sans)' }}>
            Tell John (Gemini AI) about your major financial details so your personal AI agents can tailor advice to your real cash flow.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Section 1: Major Details */}
          <div>
            <div style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a', marginBottom: '12px', fontFamily: 'var(--font-serif)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={16} color="#059669" />
              <span>1. Major Profile & Career Details</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', marginBottom: '4px', display: 'block', fontFamily: 'var(--font-sans)' }}>
                  Full Name
                </label>
                <input
                  type="text"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', marginBottom: '4px', display: 'block', fontFamily: 'var(--font-sans)' }}>
                  Occupation / Role
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Engineer, Founder, Student"
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
                  Monthly Salary / Net Income (₹)
                </label>
                <input
                  type="number"
                  className="input"
                  value={monthlyIncome}
                  onChange={(e) => setMonthlyIncome(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', marginBottom: '4px', display: 'block', fontFamily: 'var(--font-sans)' }}>
                  Fixed Expenses (Rent, Bills) (₹)
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
                  Goal Name
                </label>
                <input
                  type="text"
                  className="input"
                  value={primaryGoalName}
                  onChange={(e) => setPrimaryGoalName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', marginBottom: '4px', display: 'block', fontFamily: 'var(--font-sans)' }}>
                  Target Goal Amount (₹)
                </label>
                <input
                  type="number"
                  className="input"
                  value={primaryGoalTarget}
                  onChange={(e) => setPrimaryGoalTarget(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          {/* Section 4: Risk Profile */}
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
              <option value="Balanced">Balanced — Optimized Savings + Moderate Investment</option>
              <option value="Aggressive">Aggressive — Maximum Wealth Accumulation & SIPs</option>
            </select>
          </div>

          {/* Submit */}
          <button type="submit" className="btn btn-emerald" style={{ padding: '14px', marginTop: '8px', justifyContent: 'center' }}>
            <span>Complete Onboarding & Launch John AI Coach 🚀</span>
          </button>

        </form>

      </div>
    </div>
  );
}
