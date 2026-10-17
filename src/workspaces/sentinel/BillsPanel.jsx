import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../services/api/v1';
import { formatMinorInr, formatDate } from '../../lib/format';
import DisabledControl from '../../components/ui/DisabledControl';

export default function BillsPanel({ declaredBills = [], taxonomy = [], onRefresh }) {
  const [label, setLabel] = useState('');
  const [amountRupees, setAmountRupees] = useState('');
  const [categoryId, setCategoryId] = useState('SUBSCRIPTIONS.STREAMING');
  const [cadence, setCadence] = useState('MONTHLY');
  const [dueDate, setDueDate] = useState('');

  const [statusMsg, setStatusMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddBill = async (e) => {
    e.preventDefault();
    if (!label.trim() || !amountRupees) return;

    setIsSubmitting(true);
    setStatusMsg('');
    try {
      const amountMinor = Math.round(Number(amountRupees) * 100);
      await api.executeAction({
        action: 'CREATE_DECLARED_BILL',
        params: {
          label: label.trim(),
          category_id: categoryId,
          amount_minor: amountMinor,
          cadence,
          next_due_date: dueDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        },
      });

      setLabel('');
      setAmountRupees('');
      setDueDate('');
      setStatusMsg(`Declared recurring bill "${label.trim()}" added to forecast.`);
      if (onRefresh) onRefresh();
    } catch (err) {
      setStatusMsg(`Failed to add bill: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteBill = async (billId, billLabel) => {
    setStatusMsg('');
    try {
      await api.executeAction({
        action: 'DELETE_DECLARED_BILL',
        params: { bill_id: billId },
      });
      setStatusMsg(`Removed declared bill "${billLabel}".`);
      if (onRefresh) onRefresh();
    } catch (err) {
      setStatusMsg(`Failed to delete bill: ${err.message}`);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '20px' }}>
      {/* Existing Declared Bills List */}
      <div className="card" style={{ padding: '22px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
          Active Declared Recurring Bills
        </h3>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Declared obligations win on overlap with detected subscriptions in Sentinel forecasts.
        </p>

        {statusMsg && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              fontSize: '12px',
              marginBottom: '14px',
            }}
          >
            {statusMsg}
          </div>
        )}

        {declaredBills.length === 0 ? (
          <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            No declared recurring bills registered yet. Use the form on the right to declare recurring fixed expenses.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {declaredBills.map((bill) => (
              <div
                key={bill.bill_id || bill.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div>
                  <div style={{ fontWeight: '700', fontSize: '13px', color: 'var(--text-primary)' }}>
                    {bill.label}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Cadence: {bill.cadence || 'MONTHLY'} • Due: {formatDate(bill.next_due_date || bill.due_date)} • Category: {bill.category_id || 'SUBSCRIPTION'}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className="mono" style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)' }}>
                    {formatMinorInr(bill.amount_minor)}
                  </span>

                  <DisabledControl tooltip="Editing declared bills is not in prototype (Doc 0 §3.2)">
                    <button className="btn btn-ghost btn-sm" disabled style={{ fontSize: '11px' }}>
                      Edit
                    </button>
                  </DisabledControl>

                  <button
                    onClick={() => handleDeleteBill(bill.bill_id || bill.id, bill.label)}
                    className="btn btn-ghost btn-sm"
                    style={{ color: '#dc2626' }}
                    title="Delete Declared Bill"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Declared Bill Form */}
      <div className="card" style={{ padding: '22px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '14px' }}>
          Declare Recurring Bill
        </h3>
        <form onSubmit={handleAddBill} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
              Bill Label *
            </label>
            <input
              type="text"
              placeholder="e.g. Broadband, Rent, Society Fee"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="input"
              required
              maxLength={40}
            />
          </div>

          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
              Amount (₹) *
            </label>
            <input
              type="number"
              placeholder="e.g. 1500"
              value={amountRupees}
              onChange={(e) => setAmountRupees(e.target.value)}
              className="input"
              required
              min="1"
              step="any"
            />
          </div>

          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
              Category
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="input"
            >
              {taxonomy.map((c) => (
                <option key={c.category_id} value={c.category_id}>
                  {c.display_name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                Cadence
              </label>
              <select
                value={cadence}
                onChange={(e) => setCadence(e.target.value)}
                className="input"
              >
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="YEARLY">Yearly</option>
                <option value="NONE">One-off</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                Next Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="input"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !label.trim() || !amountRupees}
            className="btn btn-primary"
            style={{ marginTop: '8px' }}
          >
            <Plus size={15} />
            <span>{isSubmitting ? 'Registering...' : 'Add Declared Bill'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
