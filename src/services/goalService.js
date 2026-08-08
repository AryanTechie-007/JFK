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
      return {
        success: true,
        goals: Array.isArray(response) ? response : (response.goals || []),
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
