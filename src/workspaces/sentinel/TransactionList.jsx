import React, { useState, useMemo } from 'react';
import { Search, Filter, X, ChevronRight, AlertCircle, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { api } from '../../services/api/v1';
import { formatMinorInr, formatDate } from '../../lib/format';
import UndoBar from '../../components/ui/UndoBar';
import ProposalCard from '../../components/ui/ProposalCard';
import DisabledControl from '../../components/ui/DisabledControl';

export default function TransactionList({
  transactions = [],
  taxonomy = [],
  onRefresh,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedMovement, setSelectedMovement] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Inline correction & UndoBar state
  const [activeUndo, setActiveUndo] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [merchantProposal, setMerchantProposal] = useState(null);

  // Detail drawer (S-09)
  const [drawerTxn, setDrawerTxn] = useState(null);

  // Taxonomy leaf filtering by movement type (SC §13.2, WS-UI-P2 §3)
  const getCategoriesForMovement = (movementType) => {
    if (!movementType) return taxonomy;
    if (movementType === 'INCOME') {
      return taxonomy.filter((c) => c.category_id.startsWith('INCOME'));
    }
    if (movementType === 'TRANSFER') {
      return taxonomy.filter((c) => c.category_id.startsWith('TRANSFER'));
    }
    // EXPENSE
    return taxonomy.filter((c) => !c.category_id.startsWith('INCOME') && !c.category_id.startsWith('TRANSFER'));
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter((txn) => {
      const desc = (txn.raw_description || txn.description || '').toLowerCase();
      const merchant = (txn.merchant_name || txn.merchant || '').toLowerCase();
      const matchesSearch = !searchTerm || desc.includes(searchTerm.toLowerCase()) || merchant.includes(searchTerm.toLowerCase());
      const matchesCat = !selectedCategory || txn.category_id === selectedCategory || txn.category === selectedCategory;
      const matchesMovement = !selectedMovement || txn.movement_type === selectedMovement;
      return matchesSearch && matchesCat && matchesMovement;
    });
  }, [transactions, searchTerm, selectedCategory, selectedMovement]);

  const totalPages = Math.ceil(filteredTransactions.length / pageSize) || 1;
  const paginatedTransactions = filteredTransactions.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleCorrectCategory = async (txn, newCategoryId, applyToMerchant = false) => {
    setIsProcessing(true);
    setStatusMsg('');
    try {
      if (applyToMerchant && (txn.merchant_name || txn.merchant_id)) {
        // T2 Proposal: Apply to all from this merchant
        const propRes = await api.submitProposal({
          action: 'CORRECT_TRANSACTION_CATEGORY',
          params: {
            txn_id: txn.txn_id || txn.id,
            category_id: newCategoryId,
            scope: 'MERCHANT',
            merchant_id: txn.merchant_id,
            merchant_name: txn.merchant_name,
            row_version: txn.row_version || 1,
          },
        });
        setMerchantProposal(propRes?.proposal || propRes);
        setStatusMsg('Merchant-scope proposal prepared for confirmation.');
      } else {
        // T1 Action: Single transaction inline recategorization
        const res = await api.executeAction({
          action: 'CORRECT_TRANSACTION_CATEGORY',
          params: {
            txn_id: txn.txn_id || txn.id,
            category_id: newCategoryId,
            scope: 'TRANSACTION',
            row_version: txn.row_version || 1,
          },
        });

        setStatusMsg(`Updated category for "${txn.raw_description || 'Transaction'}".`);
        if (res?.action_id || res?.executed_action?.action_id) {
          setActiveUndo({
            actionId: res.action_id || res.executed_action.action_id,
            label: `Recategorized to ${newCategoryId}`,
            expiresAt: Date.now() + 86400000,
          });
        }
        if (onRefresh) onRefresh();
      }
    } catch (err) {
      if (err.message && err.message.includes('changed')) {
        setStatusMsg('This transaction changed; refresh the ledger.');
      } else {
        setStatusMsg(`Correction failed: ${err.message}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUndo = async () => {
    if (!activeUndo?.actionId) return;
    try {
      await api.undoAction(activeUndo.actionId);
      setStatusMsg('Category correction undone.');
      setActiveUndo(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      setStatusMsg(`Undo failed: ${err.message}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Search & Filter Header */}
      <div className="card" style={{ padding: '18px 22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
              Transaction Ledger & Category Correction
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
              Deterministic versioned entries under SC §13.2. Inline corrections emit reversible T1 actions.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Search descriptions..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                className="input"
                style={{ width: '200px', padding: '6px 10px 6px 30px', fontSize: '12px' }}
              />
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '9px', color: 'var(--text-muted)' }} />
            </div>

            <select
              value={selectedMovement}
              onChange={(e) => { setSelectedMovement(e.target.value); setCurrentPage(1); }}
              className="input"
              style={{ fontSize: '12px', padding: '6px 10px' }}
            >
              <option value="">All Movements</option>
              <option value="EXPENSE">Expense (Debit)</option>
              <option value="INCOME">Income (Credit)</option>
              <option value="TRANSFER">Transfer</option>
            </select>

            <select
              value={selectedCategory}
              onChange={(e) => { setSelectedCategory(e.target.value); setCurrentPage(1); }}
              className="input"
              style={{ fontSize: '12px', padding: '6px 10px', maxWidth: '180px' }}
            >
              <option value="">All Categories</option>
              {taxonomy.map((c) => (
                <option key={c.category_id} value={c.category_id}>
                  {c.display_name}
                </option>
              ))}
            </select>
          </div>
        </div>
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
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            fontSize: '12px',
          }}
        >
          {statusMsg}
        </div>
      )}

      {merchantProposal && (
        <ProposalCard
          proposal={merchantProposal}
          onConfirmed={() => { setMerchantProposal(null); if (onRefresh) onRefresh(); }}
          onDeclined={() => setMerchantProposal(null)}
        />
      )}

      {/* Ledger Table */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-muted)',
                  textAlign: 'left',
                  fontSize: '11px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                <th style={{ padding: '12px 16px' }}>Date</th>
                <th style={{ padding: '12px 16px' }}>Description / Merchant</th>
                <th style={{ padding: '12px 16px' }}>Account</th>
                <th style={{ padding: '12px 16px' }}>Movement</th>
                <th style={{ padding: '12px 16px' }}>Category (Inline Edit)</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '12px 16px', width: '40px' }}></th>
              </tr>
            </thead>
            <tbody>
              {paginatedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No transactions matched your query or filters.
                  </td>
                </tr>
              ) : (
                paginatedTransactions.map((txn) => {
                  const isDebit = txn.movement_type === 'EXPENSE' || (Number(txn.amount_minor) > 0 && !txn.movement_type);
                  const isCredit = txn.movement_type === 'INCOME';
                  const availableCats = getCategoriesForMovement(txn.movement_type);

                  return (
                    <tr
                      key={txn.txn_id || txn.id}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                        {formatDate(txn.txn_date || txn.date)}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                          {txn.raw_description || txn.description}
                        </div>
                        {txn.merchant_name && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            Merchant: {txn.merchant_name}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                        {txn.account_mask ? `•••${txn.account_mask}` : txn.account_id || 'Primary'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          className="badge"
                          style={{
                            fontSize: '10px',
                            backgroundColor: isCredit ? 'rgba(5, 150, 105, 0.15)' : 'var(--bg-tertiary)',
                            color: isCredit ? 'var(--accent-emerald)' : 'var(--text-secondary)',
                          }}
                        >
                          {txn.movement_type || (isDebit ? 'EXPENSE' : 'INCOME')}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <select
                            value={txn.category_id || txn.category || 'MISC.OTHER'}
                            onChange={(e) => handleCorrectCategory(txn, e.target.value)}
                            disabled={isProcessing}
                            className="input"
                            style={{
                              padding: '4px 8px',
                              fontSize: '12px',
                              maxWidth: '190px',
                              border: '1px solid var(--border-color)',
                            }}
                          >
                            {availableCats.map((cat) => (
                              <option key={cat.category_id} value={cat.category_id}>
                                {cat.display_name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <span
                          className="mono"
                          style={{
                            fontWeight: '700',
                            color: isCredit ? 'var(--accent-emerald)' : 'var(--text-primary)',
                          }}
                        >
                          {isCredit ? '+' : '-'}{formatMinorInr(txn.amount_minor || (Math.round(txn.amount * 100)))}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <button
                          onClick={() => setDrawerTxn(txn)}
                          className="btn btn-ghost btn-sm"
                          title="Open Details Drawer"
                          style={{ padding: '4px 6px' }}
                        >
                          <ChevronRight size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paging Bar */}
        {totalPages > 1 && (
          <div
            style={{
              padding: '12px 16px',
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '12px',
              color: 'var(--text-muted)',
            }}
          >
            <span>
              Showing {((currentPage - 1) * pageSize) + 1}–{Math.min(currentPage * pageSize, filteredTransactions.length)} of {filteredTransactions.length}
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '11px', padding: '4px 8px' }}
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '11px', padding: '4px 8px' }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* S-09 Transaction Detail Drawer */}
      {drawerTxn && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '420px',
            backgroundColor: 'var(--bg-card)',
            borderLeft: '1px solid var(--border-color)',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.2)',
            zIndex: 100,
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                Transaction Details (S-09)
              </h3>
              <button onClick={() => setDrawerTxn(null)} className="btn btn-ghost btn-sm">
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Description</span>
                <div style={{ fontWeight: '600', color: 'var(--text-primary)', marginTop: '2px' }}>
                  {drawerTxn.raw_description || drawerTxn.description}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Amount</span>
                  <div className="mono" style={{ fontWeight: '700', fontSize: '16px', color: 'var(--text-primary)', marginTop: '2px' }}>
                    {formatMinorInr(drawerTxn.amount_minor || (Math.round(drawerTxn.amount * 100)))}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Date</span>
                  <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {formatDate(drawerTxn.txn_date || drawerTxn.date)}
                  </div>
                </div>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Movement Type</span>
                <div style={{ marginTop: '2px' }}>
                  <span className="badge" style={{ backgroundColor: 'var(--bg-tertiary)', fontSize: '11px' }}>
                    {drawerTxn.movement_type || 'EXPENSE'}
                  </span>
                </div>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Assigned Category</span>
                <div style={{ fontWeight: '600', color: 'var(--text-primary)', marginTop: '2px' }}>
                  {drawerTxn.category_id || drawerTxn.category || 'Uncategorized'}
                </div>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Classification Evidence / Status</span>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', backgroundColor: 'var(--bg-primary)', padding: '10px', borderRadius: 'var(--radius-sm)' }}>
                  Status: <strong>{drawerTxn.classification_status || 'CONFIRMED'}</strong>
                  {drawerTxn.method && <div>Method: {drawerTxn.method}</div>}
                  {drawerTxn.evidence && <div>Evidence: {drawerTxn.evidence}</div>}
                </div>
              </div>

              {/* Deferred Actions (Doc 0 §3.2, Doc 7 §8) */}
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <DisabledControl tooltip="Deleting manual transactions is not in prototype">
                  <button className="btn btn-secondary btn-sm" disabled style={{ width: '100%' }}>
                    Delete Manual Transaction
                  </button>
                </DisabledControl>
                <DisabledControl tooltip="Own-account counterparty marking is not in prototype">
                  <button className="btn btn-secondary btn-sm" disabled style={{ width: '100%' }}>
                    Mark Counterparty As Own Account
                  </button>
                </DisabledControl>
              </div>
            </div>
          </div>

          <button onClick={() => setDrawerTxn(null)} className="btn btn-secondary" style={{ width: '100%' }}>
            Close Drawer
          </button>
        </div>
      )}
    </div>
  );
}
