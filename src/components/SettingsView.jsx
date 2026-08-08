import React, { useState } from 'react';
import { 
  Settings, 
  DollarSign, 
  ShieldCheck, 
  User, 
  Save, 
  CheckCircle2, 
  Sparkles,
  Sliders,
  Wallet
} from 'lucide-react';

import { profileService } from '../services/profileService';
import { transactionService } from '../services/transactionService';

export default function SettingsView({ userProfile, setUserProfile, budgets, setBudgets, showNotification }) {
  const [name, setName] = useState(userProfile?.name || '');
  const [income, setIncome] = useState(userProfile?.monthlyIncome || 0);
  const [fixedExpenses, setFixedExpenses] = useState(userProfile?.fixedExpenses || 0);
  
  // Custom budget limits per category
  const [foodLimit, setFoodLimit] = useState(budgets.find(b => b.category === "Food & Dining")?.limit || 10000);
  const [shoppingLimit, setShoppingLimit] = useState(budgets.find(b => b.category === "Shopping & Lifestyle")?.limit || 10000);
  const [subLimit, setSubLimit] = useState(budgets.find(b => b.category === "Subscriptions")?.limit || 3000);
  const [transportLimit, setTransportLimit] = useState(budgets.find(b => b.category === "Transport")?.limit || 5000);
  const [utilitiesLimit, setUtilitiesLimit] = useState(budgets.find(b => b.category === "Bills & Utilities")?.limit || 5000);
  
  const [errorMsg, setErrorMsg] = useState('');

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
      setErrorMsg(`Fixed Monthly Expenses (₹${numFixed.toLocaleString()}) cannot exceed total Monthly Earnings (₹${numIncome.toLocaleString()}). Please set a valid expense threshold.`);
      return;
    }

    const totalCategoryLimits = Number(foodLimit) + Number(shoppingLimit) + Number(subLimit) + Number(transportLimit) + Number(utilitiesLimit);
    if (totalCategoryLimits > numIncome) {
      setErrorMsg(`Combined Category Budget Caps (₹${totalCategoryLimits.toLocaleString()}) cannot exceed total Monthly Earnings (₹${numIncome.toLocaleString()}).`);
      return;
    }

    const totalSpent = userProfile?.totalSpentThisMonth || 0;

    // Recalculate net surplus
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

    // Update user profile locally and send to backend
    setUserProfile(updatedProfile);
    await profileService.updateProfile(updatedProfile);

    // Update budgets
    const updatedBudgets = budgets.map(b => {
      let newLimit = b.limit;
      if (b.category === "Food & Dining") newLimit = Number(foodLimit);
      if (b.category === "Shopping & Lifestyle") newLimit = Number(shoppingLimit);
      if (b.category === "Subscriptions") newLimit = Number(subLimit);
      if (b.category === "Transport") newLimit = Number(transportLimit);
      if (b.category === "Bills & Utilities") newLimit = Number(utilitiesLimit);

      return {
        ...b,
        limit: newLimit,
        percentage: Math.round((b.spent / newLimit) * 100)
      };
    });

    setBudgets(updatedBudgets);
    await transactionService.updateBudgets(updatedBudgets);

    if (showNotification) {
      showNotification("Profile Updated!", "John and all specialist agents have synced to your custom financial inputs.");
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Title Header */}
      <div>
        <h1 style={{ fontSize: '32px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.02em' }}>
          Financial Profile & Settings
        </h1>
        <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>
          Customize your income, fixed housing bills, and monthly category caps. John and all agents use these live inputs.
        </p>
      </div>

      {/* Validation Error Alert */}
      {errorMsg && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 'var(--radius-md)',
          color: '#dc2626',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>⚠️ {errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        
        {/* Left Column: Personal Cash Flow Inputs */}
        <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#d1fae5', display: 'flex', alignItems: 'center', justifyCenter: 'center', color: '#059669' }}>
              <User size={18} />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>Income & Fixed Outlay Inputs</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Primary cash flow parameters</div>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', marginBottom: '6px', display: 'block' }}>
              Your Name
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
            <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', marginBottom: '6px', display: 'block' }}>
              Monthly Net Income / Salary (₹)
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
            <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', marginBottom: '6px', display: 'block' }}>
              Fixed Monthly Expenses (Rent, Utilities, Insurance) (₹)
            </label>
            <input
              type="number"
              className="input"
              value={fixedExpenses}
              onChange={(e) => setFixedExpenses(e.target.value)}
              required
            />
          </div>

          <div style={{
            padding: '16px',
            backgroundColor: '#f8fafc',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            marginTop: 'auto'
          }}>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
              CALCULATED SURPLUS PREVIEW
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
              <span style={{ fontSize: '13px', color: '#475569' }}>Calculated Net Surplus:</span>
              <span className="mono" style={{ fontSize: '18px', fontWeight: '700', color: '#059669' }}>
                ₹{(Number(income) - (userProfile?.totalSpentThisMonth || 0)).toLocaleString()}/mo
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Custom Category Budget Caps (Nova Guardian) */}
        <div className="card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#fef3c7', display: 'flex', alignItems: 'center', justifyCenter: 'center', color: '#d97706' }}>
              <Sliders size={18} />
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>Nova Category Budget Thresholds</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Custom category spending limits</div>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', marginBottom: '6px', display: 'block' }}>
              Food & Dining Budget Limit (₹)
            </label>
            <input
              type="number"
              className="input"
              value={foodLimit}
              onChange={(e) => setFoodLimit(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', marginBottom: '6px', display: 'block' }}>
              Shopping & Lifestyle Budget Limit (₹)
            </label>
            <input
              type="number"
              className="input"
              value={shoppingLimit}
              onChange={(e) => setShoppingLimit(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', marginBottom: '6px', display: 'block' }}>
              Subscriptions Budget Limit (₹)
            </label>
            <input
              type="number"
              className="input"
              value={subLimit}
              onChange={(e) => setSubLimit(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', marginBottom: '6px', display: 'block' }}>
              Transport Budget Limit (₹)
            </label>
            <input
              type="number"
              className="input"
              value={transportLimit}
              onChange={(e) => setTransportLimit(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', marginBottom: '6px', display: 'block' }}>
              Bills & Utilities Budget Limit (₹)
            </label>
            <input
              type="number"
              className="input"
              value={utilitiesLimit}
              onChange={(e) => setUtilitiesLimit(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-emerald" style={{ padding: '12px', marginTop: '10px', justifyContent: 'center' }}>
            <Save size={16} />
            <span>Save Inputs & Sync Agents</span>
          </button>
        </div>

      </form>
    </div>
  );
}
