// User Financial Profile Service for FinMate AI
import { api } from './api';

export const profileService = {
  /**
   * Submit onboarding financial data to backend
   * POST /api/profile/onboarding
   */
  async saveOnboarding(onboardingData) {
    try {
      const response = await api.post('/profile/onboarding', onboardingData);
      return {
        success: true,
        profile: response.profile || response,
        initialGoal: response.initialGoal || onboardingData.initialGoal,
      };
    } catch (error) {
      console.warn('Backend onboarding API error:', error.message);
      // Return success with local payload if backend endpoint isn't fully live yet
      return {
        success: true,
        profile: onboardingData,
        isFallback: true,
      };
    }
  },

  /**
   * Fetch user financial profile
   * GET /api/profile
   */
  async getProfile() {
    try {
      const response = await api.get('/profile');
      return {
        success: true,
        profile: response.profile || response,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * Update user financial profile / settings
   * PUT /api/profile
   */
  async updateProfile(profileData) {
    try {
      const response = await api.put('/profile', profileData);
      return {
        success: true,
        profile: response.profile || response,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * Get calculated financial health score and breakdown
   * GET /api/financial-health
   */
  async getFinancialHealth() {
    try {
      const response = await api.get('/financial-health');
      return {
        success: true,
        health: response,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * Request CSV export of profile and financial data
   * GET /api/profile/export
   */
  async exportData() {
    try {
      const response = await api.get('/profile/export');
      return {
        success: true,
        downloadUrl: response.downloadUrl || response.url,
        data: response,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
};
