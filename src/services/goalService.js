// Financial Goals API Service for FinMate AI
import { api } from './api';

export const goalService = {
  /**
   * Fetch user financial goals
   * GET /api/goals
   */
  async getGoals() {
    try {
      const response = await api.get('/goals');
      const list = Array.isArray(response) ? response : (response.goals || []);
      const formatted = list.map(g => ({
        id: g.id,
        name: g.name,
        target: Number(g.target_amount || g.target || 0),
        target_amount: Number(g.target_amount || g.target || 0),
        current: Number(g.saved_amount || g.current || 0),
        saved_amount: Number(g.saved_amount || g.current || 0),
        monthlyAdd: Number(g.monthly_allocation || g.monthlyAdd || 0),
        monthly_allocation: Number(g.monthly_allocation || g.monthlyAdd || 0),
        priority: (g.priority || 'medium').toUpperCase().includes('PRIORITY')
          ? g.priority
          : `${(g.priority || 'medium').toUpperCase()} PRIORITY`,
        category: g.category || 'Savings',
        status: g.status || 'active'
      }));
      return {
        success: true,
        goals: formatted,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        goals: [],
      };
    }
  },

  /**
   * Create a new savings goal
   * POST /api/goals
   */
  async createGoal(goalData) {
    try {
      const response = await api.post('/goals', goalData);
      return {
        success: true,
        goal: response.goal || response,
      };
    } catch (error) {
      console.warn('Backend createGoal error, using local fallback:', error.message);
      return {
        success: true,
        goal: { ...goalData, id: goalData.id || `goal-${Date.now()}` },
        isFallback: true,
      };
    }
  },

  /**
   * Update an existing goal / add money
   * PUT /api/goals/:id
   */
  async updateGoal(goalId, goalData) {
    try {
      const response = await api.put(`/goals/${goalId}`, goalData);
      return {
        success: true,
        goal: response.goal || response,
      };
    } catch (error) {
      console.warn(`Backend updateGoal ${goalId} error:`, error.message);
      return {
        success: true,
        goal: goalData,
        isFallback: true,
      };
    }
  },

  /**
   * Delete a goal
   * DELETE /api/goals/:id
   */
  async deleteGoal(goalId) {
    try {
      await api.delete(`/goals/${goalId}`);
      return { success: true };
    } catch (error) {
      console.warn(`Backend deleteGoal ${goalId} error:`, error.message);
      return { success: true, isFallback: true };
    }
  },
};
