import React, { useState } from 'react';
import { 
  Lightbulb, 
  ShoppingBag, 
  Coffee, 
  Tv, 
  ArrowRight, 
  Sparkles, 
  TrendingDown, 
  Sliders,
  DollarSign
} from 'lucide-react';
import { USER_PROFILE, AGENTS } from '../data/mockFinancialData';

export default function IrisAdvisorView() {
  const [foodOrderSlider, setFoodOrderSlider] = useState(6);

  const initialOrders = 18;
  const avgCostPerOrder = 510;
  const currentFoodSpend = initialOrders * avgCostPerOrder;
  const simulatedFoodSpend = foodOrderSlider * avgCostPerOrder;
  const monthlySavings = currentFoodSpend - simulatedFoodSpend;
  const annualSavings = monthlySavings * 12;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Light Clean Header Title */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '32px', fontWeight: '800', color: '#0f172a', letterSpacing: '-0.02em', fontFamily: 'var(--font-serif)' }}>
              Smart Spending Advisor
            </h1>
            <span className="badge badge-iris">Iris • Habit Analyst</span>
          </div>
          <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
            Iris audits transaction behavioral footprints to uncover hidden leakage, impulse buying, and subscription bloat.
          </p>
        </div>

        <div style={{
          padding: '12px 20px',
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 'var(--radius-md)'
        }}>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', fontFamily: 'var(--font-sans)' }}>Identified Monthly Leakage</div>
          <div className="mono" style={{ fontSize: '20px', fontWeight: '700', color: '#d97706', fontFamily: 'var(--font-serif)' }}>
            ₹4,850 / month
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        
        {/* Left Column: Detected Habit Vulnerabilities */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card-title">
            <ShoppingBag size={18} color="#d97706" />
            <span>Behavioral Habit Audit</span>
          </div>

          <div style={{
            padding: '16px',
            backgroundColor: '#f8fafc',
            borderRadius: 'var(--radius-md)',
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Coffee size={16} color="#d97706" />
                <span style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>
                  High-Frequency Food Delivery
                </span>
              </div>
              <span className="badge badge-iris">18 Orders/mo</span>
            </div>
            <p style={{ fontSize: '12px', color: '#475569', lineHeight: '1.5', fontFamily: 'var(--font-sans)' }}>
              Swiggy & Zomato orders grew by 38% since June. Small impulse orders under ₹400 carry ₹1,620 in delivery taxes & surge charges.
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '4px' }}>
              <span style={{ color: '#64748b' }}>Current Monthly Spend:</span>
              <span className="mono" style={{ color: '#dc2626', fontWeight: '700', fontFamily: 'var(--font-serif)' }}>₹9,200</span>
            </div>
          </div>

          <div style={{
            padding: '16px',
            backgroundColor: '#f8fafc',
            borderRadius: 'var(--radius-md)',
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Tv size={16} color="#7c3aed" />
                <span style={{ fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>
                  Subscription Bloat & Duplicate Tiering
                </span>
              </div>
              <span className="badge badge-sentinel">3 Active OTTs</span>
            </div>
            <p style={{ fontSize: '12px', color: '#475569', lineHeight: '1.5', fontFamily: 'var(--font-sans)' }}>
              Netflix Premium (₹649) + Spotify Premium (₹119) + Cloud Storage (₹299) exceed Nova's ₹3,000 threshold by 16%.
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '4px' }}>
              <span style={{ color: '#64748b' }}>Current Subscription Spend:</span>
              <span className="mono" style={{ color: '#dc2626', fontWeight: '700', fontFamily: 'var(--font-serif)' }}>₹3,500</span>
            </div>
          </div>
        </div>

        {/* Right Column: Cost Savings Simulator */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card-title">
            <Sliders size={18} color="#d97706" />
            <span>Interactive Cost Savings Simulator</span>
          </div>

          <div style={{
            padding: '16px',
            backgroundColor: '#f8fafc',
            borderRadius: 'var(--radius-md)',
            border: '1px solid #e2e8f0'
          }}>
            <label style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', display: 'block', marginBottom: '8px', fontFamily: 'var(--font-serif)' }}>
              Adjust Food Delivery Target: {foodOrderSlider} Orders / Month
            </label>
            
            <input
              type="range"
              min="2"
              max="18"
              step="1"
              value={foodOrderSlider}
              onChange={(e) => setFoodOrderSlider(Number(e.target.value))}
              style={{
                width: '100%',
                accentColor: '#d97706',
                cursor: 'pointer'
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
              <span>Strict (2/mo)</span>
              <span>Balanced (6/mo)</span>
              <span>Current (18/mo)</span>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            padding: '16px',
            backgroundColor: '#ffffff',
            borderRadius: 'var(--radius-md)',
            border: '1px solid #e2e8f0'
          }}>
            <div>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', fontFamily: 'var(--font-sans)' }}>BEFORE (Current Habit)</div>
              <div className="mono" style={{ fontSize: '20px', fontWeight: '700', color: '#dc2626', marginTop: '4px', fontFamily: 'var(--font-serif)' }}>
                ₹{currentFoodSpend.toLocaleString()} / mo
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>18 orders / month</div>
            </div>

            <div>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', fontFamily: 'var(--font-sans)' }}>AFTER (Iris Optimized)</div>
              <div className="mono" style={{ fontSize: '20px', fontWeight: '700', color: '#059669', marginTop: '4px', fontFamily: 'var(--font-serif)' }}>
                ₹{simulatedFoodSpend.toLocaleString()} / mo
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{foodOrderSlider} orders / month</div>
            </div>
          </div>

          <div style={{
            padding: '16px',
            backgroundColor: '#d1fae5',
            borderRadius: 'var(--radius-md)',
            border: '1px solid #a7f3d0'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#065f46', fontFamily: 'var(--font-sans)' }}>
                Unlocked Monthly Surplus
              </span>
              <span className="mono" style={{ fontSize: '20px', fontWeight: '700', color: '#059669', fontFamily: 'var(--font-serif)' }}>
                +₹{monthlySavings.toLocaleString()}/mo
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#047857', marginTop: '6px', fontFamily: 'var(--font-sans)' }}>
              Annual compound savings: <strong>₹{annualSavings.toLocaleString()} / year</strong>.
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
