// Authentication Service for FinMate AI
import { api, setAuthToken } from './api';

const LOCAL_STORAGE_ACCOUNTS_KEY = 'finhack_registered_accounts';

/**
 * Helper to persist registered user account to localStorage
 */
function saveLocalAccount(userData) {
  try {
    const existingAccounts = JSON.parse(localStorage.getItem(LOCAL_STORAGE_ACCOUNTS_KEY) || '[]');
    const filtered = existingAccounts.filter(acc => acc.email.toLowerCase() !== (userData.email || '').toLowerCase());
    filtered.push({
      name: userData.name,
      email: (userData.email || '').toLowerCase(),
      password: userData.password,
      createdAt: new Date().toISOString()
    });
    localStorage.setItem(LOCAL_STORAGE_ACCOUNTS_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.warn('Failed to persist local account:', e);
  }
}

/**
 * Helper to retrieve local account by email
 */
function getLocalAccount(email) {
  try {
    const existingAccounts = JSON.parse(localStorage.getItem(LOCAL_STORAGE_ACCOUNTS_KEY) || '[]');
    return existingAccounts.find(acc => acc.email.toLowerCase() === (email || '').toLowerCase());
  } catch (e) {
    return null;
  }
}

export const authService = {
  /**
   * Helper functions exposed on authService
   */
  saveLocalAccount,
  getLocalAccount,

  /**
   * Register a new user
   * POST /api/auth/register
   */
  async register(userData) {
    // Save user locally first to guarantee offline login works
    saveLocalAccount(userData);

    try {
      const response = await api.post('/auth/register', {
        name: userData.name,
        email: userData.email,
        password: userData.password,
      });

      if (response && response.token) {
        setAuthToken(response.token);
      }

      return {
        success: true,
        user: response?.user || { name: userData.name, email: userData.email },
        token: response?.token,
      };
    } catch (error) {
      console.info('Backend auth server offline or unconfigured; proceeding with local user account registration.');
      return {
        success: true,
        user: { name: userData.name, email: userData.email },
        isFallback: true,
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

      if (response && response.token) {
        setAuthToken(response.token);
      }

      return {
        success: true,
        user: response?.user || { name: response?.name || credentials.email.split('@')[0], email: credentials.email },
        token: response?.token,
      };
    } catch (error) {
      console.info('Backend auth server error or offline; validating against local account registry.');
      
      const localAcc = getLocalAccount(credentials.email);
      
      if (!localAcc) {
        return {
          success: false,
          error: 'Account does not exist. Please create an account first.',
        };
      }

      if (localAcc.password && credentials.password !== localAcc.password) {
        return {
          success: false,
          error: 'Invalid password. Please check your credentials.',
        };
      }

      return {
        success: true,
        user: { name: localAcc.name || credentials.email.split('@')[0], email: credentials.email },
        isFallback: true,
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
        user: response?.user || response,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
};
