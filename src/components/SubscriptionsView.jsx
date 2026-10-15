import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  Plus, 
  Trash2, 
  Calendar, 
  AlertCircle, 
  Sparkles, 
  Loader2,
  RefreshCw,
  Clock
} from 'lucide-react';
import { subscriptionService } from '../services/subscriptionService';

export default function SubscriptionsView({ userProfile }) {
  const currency = userProfile?.currency || '₹';
  const [subscriptions, setSubscriptions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // New subscription modal / form state
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [category, setCategory] = useState('Entertainment');
  const [nextBillingDate, setNextBillingDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchSubscriptions = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await subscriptionService.getSubscriptions();
      if (res && Array.isArray(res.subscriptions)) {
        setSubscriptions(res.subscriptions);
      } else {
        setSubscriptions([]);
      }
    } catch (err) {
      console.warn('Failed to load subscriptions:', err);
      setError('Could not connect to subscriptions database.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  const handleAddSubscription = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) return;

    setIsSubmitting(true);
    try {
      const res = await subscriptionService.addSubscription({
        name: name.trim(),
        amount: numAmount,
        billingCycle,
        category,
        nextBillingDate: nextBillingDate || null
      });

      if (res && res.subscription) {
        setSubscriptions(prev => [res.subscription, ...prev]);
      } else {
        await fetchSubscriptions();
      }

      setName('');
      setAmount('');
      setNextBillingDate('');
      setShowAddModal(false);
    } catch (err) {
      console.error('Error adding subscription:', err);
      alert('Failed to save subscription: ' + (err.message || 'Server error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this subscription?')) return;
    try {
      await subscriptionService.deleteSubscription(id);
      setSubscriptions(prev => prev.filter(sub => sub.id !== id));
    } catch (err) {
      console.error('Failed to delete subscription:', err);
      alert('Could not delete subscription.');
    }
  };

  // Calculations
  const monthlyTotal = subscriptions.reduce((sum, sub) => {
    const amt = Number(sub.amount) || 0;
    if (sub.billing_cycle === 'yearly') return sum + amt / 12;
    if (sub.billing_cycle === 'weekly') return sum + amt * 4.33;
    return sum + amt;
  }, 0);

  const yearlyTotal = monthlyTotal * 12;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Title & Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.02em', fontFamily: 'var(--font-serif)' }}>
            Subscriptions
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginTop: '4px', fontFamily: 'var(--font-sans)' }}>
            Manage recurring memberships, SaaS tools, and media streaming services entered by you.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="btn btn-emerald"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', fontWeight: '700' }}
        >
          <Plus size={16} />
          <span>Add Subscription</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Active Services
          </div>
          <div className="mono" style={{ fontSize: '28px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '6px' }}>
            {subscriptions.length}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            User-configured subscriptions
          </div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Monthly Outlay
          </div>
          <div className="mono" style={{ fontSize: '28px', fontWeight: '800', color: '#dc2626', marginTop: '6px' }}>
            {currency}{Math.round(monthlyTotal).toLocaleString()}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Estimated per month
          </div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Annual Run Rate
          </div>
          <div className="mono" style={{ fontSize: '28px', fontWeight: '800', color: '#005f41', marginTop: '6px' }}>
            {currency}{Math.round(yearlyTotal).toLocaleString()}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Total 12-month recurring load
          </div>
        </div>
      </div>

      {/* Subscription List */}
      <div className="card" style={{ padding: '24px' }}>
        <div className="card-title" style={{ justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CreditCard size={18} color="#005f41" />
            <span>Active Subscriptions</span>
          </div>
          <button 
            onClick={fetchSubscriptions} 
            title="Refresh"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
          >
            <RefreshCw size={15} />
          </button>
        </div>

        {isLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 10px auto' }} />
            <span>Loading subscriptions...</span>
          </div>
        ) : subscriptions.length === 0 ? (
          <div style={{
            padding: '48px 24px',
            textAlign: 'center',
            backgroundColor: 'var(--bg-card-subtle)',
            borderRadius: '12px',
            border: '1px dashed var(--border-color)'
          }}>
            <CreditCard size={36} color="#94a3b8" style={{ margin: '0 auto 12px auto' }} />
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)' }}>
              No subscriptions added yet
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '420px', margin: '6px auto 16px auto', lineHeight: '1.5' }}>
              You haven't listed any subscriptions. Add streaming services, utilities, or SaaS software you pay for to monitor your monthly commitments.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="btn btn-emerald btn-sm"
            >
              <Plus size={14} />
              <span>Add Your First Subscription</span>
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {subscriptions.map((sub) => (
              <div
                key={sub.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  transition: 'border-color 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--bg-surface-hover)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#005f41'
                  }}>
                    <CreditCard size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)' }}>
                      {sub.name}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '8px', marginTop: '2px' }}>
                      <span>{sub.category || 'General'}</span>
                      <span>•</span>
                      <span style={{ textTransform: 'capitalize' }}>{sub.billing_cycle || 'monthly'}</span>
                      {sub.next_billing_date && (
                        <>
                          <span>•</span>
                          <span>Next: {sub.next_billing_date}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div className="mono" style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-primary)' }}>
                    {currency}{Number(sub.amount).toLocaleString()}
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500' }}>/{sub.billing_cycle === 'yearly' ? 'yr' : 'mo'}</span>
                  </div>

                  <button
                    onClick={() => handleDelete(sub.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '6px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                    title="Remove Subscription"
                    onMouseEnter={(e) => e.currentTarget.style.color = '#dc2626'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Subscription Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(3px)'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-card)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '480px',
            padding: '28px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
              Add a Subscription
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
              Enter recurring service details so John and Nova can monitor commitments.
            </p>

            <form onSubmit={handleAddSubscription} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                  Service Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Netflix, Spotify, AWS, Gym"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                    Amount ({currency}) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="e.g. 649"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                    Billing Cycle
                  </label>
                  <select
                    value={billingCycle}
                    onChange={(e) => setBillingCycle(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '14px',
                      backgroundColor: 'var(--bg-card)',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '14px',
                      backgroundColor: 'var(--bg-card)',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value="Entertainment">Entertainment</option>
                    <option value="Software & Tools">Software & Tools</option>
                    <option value="Utilities">Utilities</option>
                    <option value="Fitness & Health">Fitness & Health</option>
                    <option value="Work & Education">Work & Education</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                    Next Billing Date
                  </label>
                  <input
                    type="date"
                    value={nextBillingDate}
                    onChange={(e) => setNextBillingDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn btn-secondary"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-emerald"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Add Subscription'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
