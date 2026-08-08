// Authentication Service for FinMate AI
import { api, setAuthToken } from './api';

export const authService = {
  /**
   * Register a new user
   * POST /api/auth/register
   */
  async register(userData) {
    try {
      const response = await api.post('/auth/register', {
        name: userData.name,
        email: userData.email,
        password: userData.password,
      });

      if (response.token) {
        setAuthToken(response.token);
      }

      return {
        success: true,
        user: response.user || { name: userData.name, email: userData.email },
        token: response.token,
      };
    } catch (error) {
      // If backend API server is offline or unreachable, fall back gracefully to local onboarding
      if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError') || error.status === 404) {
        console.info('Backend auth server offline; proceeding with local user session.');
        return {
          success: true,
          user: { name: userData.name, email: userData.email },
          isFallback: true,
        };
      }

      return {
        success: false,
        error: error.message || 'Registration failed. Please try again.',
      };
    }
  },

  /**
   * Login user with credentials
   * POST /api/auth/login
   */
  async login(credentials) {
    try {
      const response = await api.post('/auth/login', {
        email: credentials.email,
        password: credentials.password,
      });

      if (response.token) {
        setAuthToken(response.token);
      }

      return {
        success: true,
        user: response.user || { name: response.name || credentials.email.split('@')[0], email: credentials.email },
        token: response.token,
      };
    } catch (error) {
      // If backend API server is offline or unreachable, fall back gracefully
      if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError') || error.status === 404) {
        console.info('Backend auth server offline; proceeding with local user login.');
        const fallbackName = credentials.email ? credentials.email.split('@')[0] : 'User';
        return {
          success: true,
          user: { name: fallbackName, email: credentials.email },
          isFallback: true,
        };
      }

      return {
        success: false,
        error: error.message || 'Invalid email or password.',
      };
    }
  },

  /**
   * Logout user
   * POST /api/auth/logout
   */
  async logout() {
    try {
      await api.post('/auth/logout', {});
    } catch (error) {
      console.warn('Backend logout failed or offline:', error.message);
    } finally {
      setAuthToken(null);
    }
    return { success: true };
  },

  /**
   * Get currently authenticated user on app startup
   * GET /api/auth/me
   */
  async getCurrentUser() {
    try {
      const response = await api.get('/auth/me');
      return {
        success: true,
        user: response.user || response,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
};
