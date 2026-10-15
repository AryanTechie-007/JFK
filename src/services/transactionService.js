// Transactions & Budgets API Service for FinMate AI
import { api } from './api';

export const transactionService = {
  /**
   * Fetch user transactions
   * GET /api/transactions
   */
  async getTransactions() {
    try {
      const response = await api.get('/transactions');
      return {
        success: true,
        transactions: Array.isArray(response) ? response : (response.transactions || []),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        transactions: [],
      };
    }
  },

  /**
   * Add a new transaction
   * POST /api/transactions
   */
  async createTransaction(transactionData) {
    try {
      const response = await api.post('/transactions', transactionData);
      return {
        success: true,
        transaction: response.transaction || response,
      };
    } catch (error) {
      console.warn('Backend createTransaction error:', error.message);
      return {
        success: true,
        transaction: { ...transactionData, id: transactionData.id || `tx-${Date.now()}` },
        isFallback: true,
      };
    }
  },

  /**
   * Fetch category budgets
   * GET /api/budgets
   */
  async getBudgets() {
    try {
      const response = await api.get('/budget');
      const cats = Array.isArray(response)
        ? response
        : (response.budgets || response.categories || []);
      const formatted = cats.map(c => ({
        category: c.category,
        spent: c.spent || 0,
        limit: c.monthly_cap || c.limit || 0,
        monthly_cap: c.monthly_cap || c.limit || 0,
        percent: c.used_pct != null ? c.used_pct : (c.monthly_cap ? Math.round(((c.spent || 0) / c.monthly_cap) * 100) : (c.percent || 0)),
        status: c.status || 'healthy'
      }));
      return {
        success: true,
        budgets: formatted,
        cashflow: response.cashflow,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        budgets: [],
      };
    }
  },

  /**
   * Update category budgets
   * PUT /api/budgets
   */
  async updateBudgets(budgetsData) {
    try {
      const response = await api.put('/budgets', { budgets: budgetsData });
      return {
        success: true,
        budgets: response.budgets || response,
      };
    } catch (error) {
      console.warn('Backend updateBudgets error:', error.message);
      return {
        success: true,
        budgets: budgetsData,
        isFallback: true,
      };
    }
  },

  /**
   * Import multiple transactions in bulk from CSV / parsed text
   * POST /api/transactions/import
   */
  async importTransactions(lines) {
    try {
      const response = await api.post('/transactions/import', { lines });
      return {
        success: true,
        imported: response.imported || (response.results ? response.results.length : lines.length),
        results: response.results || [],
      };
    } catch (error) {
      console.warn('Backend importTransactions error:', error.message);
      return {
        success: true,
        imported: lines.length,
        results: lines.map((l, i) => ({ id: `imp-${Date.now()}-${i}`, ...l })),
        isFallback: true,
      };
    }
  },

  /**
   * Export transactions to CSV format
   * GET /api/transactions/export
   */
  async exportTransactions() {
    try {
      const response = await api.get('/transactions/export');
      return {
        success: true,
        downloadUrl: response.downloadUrl || response.url,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
};
