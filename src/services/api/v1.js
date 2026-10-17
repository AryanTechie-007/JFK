/**
 * FinMate Unified API v1 Client (SC §13, SC §15, Doc 2 §6).
 *
 * Single point of entry for all network calls to the backend on /api/v1.
 * Strict adherence to no-mock, fail-closed policy.
 */

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

function getAuthHeader() {
  const token = localStorage.getItem('finmate_token') || sessionStorage.getItem('finmate_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Core fetch wrapper with ErrorBody mapping and 401 handling.
 */
async function request(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeader(),
    ...(options.headers || {}),
  };

  try {
    const res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
      localStorage.removeItem('finmate_token');
      // Dispatch custom event so React shell can handle route preservation
      window.dispatchEvent(new CustomEvent('finmate:unauthorized'));
      throw new Error('Authentication expired. Please log in again.');
    }

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const err = new Error(data?.error?.message || data?.message || `HTTP ${res.status}`);
      err.code = data?.error?.code || 'UNKNOWN_ERROR';
      err.status = res.status;
      err.details = data?.error?.details || [];
      throw err;
    }

    return data;
  } catch (err) {
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      const networkErr = new Error('Backend service unavailable. Please check your connection.');
      networkErr.code = 'SERVICE_UNAVAILABLE';
      throw networkErr;
    }
    throw err;
  }
}

export const api = {
  get: (endpoint, params = {}) => {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) query.append(k, String(v));
    }
    const qs = query.toString();
    return request(`${endpoint}${qs ? `?${qs}` : ''}`, { method: 'GET' });
  },

  post: (endpoint, body = {}) => {
    return request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  /* Workspace Read Routes */
  getWorkspace: (name, params = {}) => api.get(`/workspaces/${name}`, params),
  getSentinelOverview: () => api.get('/workspaces/sentinel/overview'),
  getSentinelSpending: (params = {}) => api.get('/workspaces/sentinel/spending', params),
  getSentinelTimeseries: (params = {}) => api.get('/workspaces/sentinel/timeseries', params),
  getSentinelForecast: (params = {}) => api.get('/workspaces/sentinel/forecast', params),
  getJohnHealthStrip: () => api.get('/workspaces/john'),

  /* Proposals (T2/T3 forms) */
  submitProposal: ({ action, params }) => api.post('/proposals', { action, params }),
  confirmProposal: (proposalId, { params_hash, ack = false } = {}) =>
    api.post(`/proposals/${proposalId}/confirm`, { params_hash, ack }),
  declineProposal: (proposalId) => api.post(`/proposals/${proposalId}/decline`),

  /* Instant Actions (T1 taps) */
  executeAction: ({ action, params, idempotency_key = crypto.randomUUID() }) =>
    api.post('/actions', { action, params, idempotency_key }),
  undoAction: (actionId) => api.post(`/actions/${actionId}/undo`),

  /* System & Context */
  getHealth: () => api.get('/health'),
  getNotifications: () => api.get('/notifications'),
  getAlerts: (params = {}) => api.get('/alerts', params),
  getProfile: () => api.get('/profile'),
  getPreferences: () => api.get('/preferences'),
};

export default api;
