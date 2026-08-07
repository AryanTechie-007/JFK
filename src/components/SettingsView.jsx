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

export default function SettingsView({ userProfile, setUserProfile, budgets, setBudgets, showNotification }) {
  const [name, setName] = useState(userProfile.name);
  const [income, setIncome] = useState(userProfile.monthlyIncome);
  const [fixedExpenses, setFixedExpenses] = useState(userProfile.fixedExpenses);
  
  // Custom budget limits per category
  const [foodLimit, setFoodLimit] = useState(budgets.find(b => b.category === "Food & Dining")?.limit || 10000);
  const [shoppingLimit, setShoppingLimit] = useState(budgets.find(b => b.category === "Shopping & Lifestyle")?.limit || 10000);
  const [subLimit, setSubLimit] = useState(budgets.find(b => b.category === "Subscriptions")?.limit || 3000);
  const [transportLimit, setTransportLimit] = useState(budgets.find(b => b.category === "Transport")?.limit || 5000);
  const [utilitiesLimit, setUtilitiesLimit] = useState(budgets.find(b => b.category === "Bills & Utilities")?.limit || 5000);

  const handleSave = (e) => {
    e.preventDefault();

    const numIncome = Number(income);
    const numFixed = Number(fixedExpenses);

    // Recalculate net surplus
    const newNetSurplus = numIncome - userProfile.totalSpentThisMonth;
    const newSavingsRate = Number(((newNetSurplus / numIncome) * 100).toFixed(1));

    // Update user profile
    setUserProfile(prev => ({
      ...prev,
      name,
      monthlyIncome: numIncome,
      fixedExpenses: numFixed,
      currentSavings: newNetSurplus,
      savingsRate: newSavingsRate
    }));

    // Update budgets
    setBudgets(prev => prev.map(b => {
      if (b.category === "Food & Dining") {
        return { ...b, limit: Number(foodLimit), percent: Math.round((b.spent / Number(foodLimit)) * 100) };
      }
      if (b.category === "Shopping & Lifestyle") {
        return { ...b, limit: Number(shoppingLimit), percent: Math.round((b.spent / Number(shoppingLimit)) * 100) };
      }
      if (b.category === "Subscriptions") {
        return { ...b, limit: Number(subLimit), percent: Math.round((b.spent / Number(subLimit)) * 100) };
      }
      if (b.category === "Transport") {
        return { ...b, limit: Number(transportLimit), percent: Math.round((b.spent / Number(transportLimit)) * 100) };
      }
      if (b.category === "Bills & Utilities") {
        return { ...b, limit: Number(utilitiesLimit), percent: Math.round((b.spent / Number(utilitiesLimit)) * 100) };
      }
      return b;
    }));

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
          Customize your income, fixed housing bills, and monthly category caps. John (Gemini AI) and all agents use these live inputs.
        </p>
      </div>

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
                ₹{(Number(income) - userProfile.totalSpentThisMonth).toLocaleString()}/mo
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
