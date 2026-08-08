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
      const response = await api.get('/budgets');
      return {
        success: true,
        budgets: Array.isArray(response) ? response : (response.budgets || []),
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
