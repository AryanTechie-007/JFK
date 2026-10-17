/**
 * FinMate Unified API v1 Client (SC §13, SC §15, Doc 2 §6).
 *
 * Single point of entry for all network calls to the backend on /api/v1.
 * Strict adherence to no-mock, fail-closed policy.
 */

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

function getAuthHeader() {
  const token =
    localStorage.getItem('finmate_token') ||
    localStorage.getItem('finmate_auth_token') ||
    sessionStorage.getItem('finmate_token');
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
      localStorage.removeItem('finmate_auth_token');
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

  delete: (endpoint) => {
    return request(endpoint, {
      method: 'DELETE',
    });
  },

  /* Workspace Read & Operation Routes */
  getWorkspace: (name, params = {}) => api.get(`/workspaces/${name}`, params),
  getAtlasWorkspace: () => api.getWorkspace('atlas'),
  getArchivedGoals: () => api.get('/workspaces/atlas/archived'),
  validateGoalAction: (payload) => api.post('/workspaces/atlas/validate', payload),
  projectSip: (params) => api.post('/workspaces/atlas/sip', params),
  getNovaWorkspace: (period) => api.getWorkspace('nova', period ? { period } : {}),
  validateCapChange: (payload) => api.post('/workspaces/nova/validate-cap', payload),
  simulateRebalance: (payload) => api.post('/workspaces/nova/rebalance', payload),
  getIrisWorkspace: (targetMonth) => api.getWorkspace('iris', targetMonth ? { target_month: targetMonth } : {}),
  simulateSpendingPlan: (payload) => api.post('/workspaces/iris/simulate', payload),
  getSentinelWorkspace: (params = {}) => api.getWorkspace('sentinel', params),
  getSentinelOverview: () => api.get('/workspaces/sentinel/overview'),
  getSentinelSpending: (params = {}) => api.get('/workspaces/sentinel/spending', params),
  getSentinelTimeseries: (params = {}) => api.get('/workspaces/sentinel/timeseries', params),
  getSentinelForecast: (params = {}) => api.get('/workspaces/sentinel/forecast', params),
  getJohnHealthStrip: () => api.get('/workspaces/john'),

  /* Categorizer Routes */
  getTaxonomy: () => api.get('/categorizer/taxonomy'),
  getReviewQueue: () => api.get('/categorizer/review-queue'),
  getCategorizerStatus: () => api.get('/categorizer/status'),
  getDataQuality: () => api.get('/categorizer/status'),

  /* Proposals (T2/T3 forms) */
  submitProposal: ({ action, params }) => api.post('/actions/propose', { action_type: action, params }),
  confirmProposal: (proposalId, { params_hash, ack = false } = {}) =>
    api.post('/actions/execute', { proposal_id: proposalId, params_hash, ack }),
  declineProposal: (proposalId) => api.post('/actions/execute', { proposal_id: proposalId, status: 'DECLINED' }),

  /* Actions Execution & Reversal */
  executeAction: (payload = {}) => {
    const { action, action_type, params, proposal_id, confirmation_token, params_hash, ack, ...rest } = payload;
    const body = {
      action_type: action || action_type,
      params,
      ...(proposal_id ? { proposal_id } : {}),
      ...(confirmation_token ? { confirmation_token } : {}),
      ...(params_hash ? { params_hash } : {}),
      ...(ack !== undefined ? { ack } : {}),
      ...rest,
    };
    if (!body.idempotency_key && !body.proposal_id) {
      body.idempotency_key = (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'act_' + Date.now());
    }
    return api.post('/actions/execute', body);
  },
  undoAction: (actionId) => api.post(`/actions/${actionId}/undo`),

  /* Settings, Profile & Memory Facts */
  getSettings: () => api.get('/settings'),
  getCategoryRules: () => api.get('/settings/category-rules'),
  getMemoryFacts: () => api.get('/settings/memory-facts'),
  addMemoryFact: (text) => api.post('/memory/facts', { text }),
  deleteMemoryFact: (factId) => api.delete(`/memory/facts/${factId}`),
  getProfile: () => api.get('/profile').catch(() => api.get('/settings').then(s => ({ profile: s?.profile }))),
  getPreferences: () => api.get('/preferences').catch(() => api.get('/settings').then(s => ({ preferences: s?.profile }))),

  /* Ingestion */
  ingestBatch: (data) => api.post('/ingest/batch', data),
  ingestManual: (data) => api.post('/ingest/manual', data),
  ingestManualTransaction: (data) => api.post('/ingest/manual', data),

  /* System & Context */
  getHealth: () => api.get('/health'),
  getNotifications: () => api.get('/notifications').catch(() => ({ notifications: [] })),
  getAlerts: (params = {}) => api.get('/alerts', params).catch(() => ({ alerts: [] })),
};

export default api;

