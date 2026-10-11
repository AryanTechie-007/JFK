import { api } from './api';

export function formatMinorInr(minor, symbol = '₹') {
  const num = Number(minor) || 0;
  const sign = num < 0 ? '-' : '';
  const rupees = Math.round(Math.abs(num) / 100);
  return `${sign}${symbol}${rupees.toLocaleString('en-IN')}`;
}

export function formatBpPct(bp) {
  const num = Number(bp) || 0;
  return `${(num / 100).toFixed(1)}%`;
}

export const workspaceService = {
  // John v2.0 Chat (supports both object or positional arguments)
  async sendChat(messageOrObj, workspace = 'JOHN', extra = {}) {
    if (typeof messageOrObj === 'object' && messageOrObj !== null) {
      const ws = messageOrObj.workspace || messageOrObj.ui_context?.workspace || 'JOHN';
      return api.post('/v1/chat', {
        message: messageOrObj.message,
        thread_id: messageOrObj.thread_id,
        ui_context: messageOrObj.ui_context || { workspace: ws },
      });
    }
    return api.post('/v1/chat', {
      message: messageOrObj,
      ui_context: { workspace },
      ...extra,
    });
  },

  // Action Service (Confirm, Execute, Undo)
  async proposeAction(actionType, params, origin = 'UI_FORM') {
    return api.post('/v1/actions/propose', {
      action_type: actionType,
      params,
      origin,
    });
  },

  async executeAction({
    proposal_id,
    confirmation_token,
    action_type,
    params,
    snapshot_id,
    acknowledgment,
    acknowledged_warnings = true,
  }) {
    return api.post('/v1/actions/execute', {
      proposal_id,
      confirmation_token,
      action_type,
      params,
      snapshot_id,
      acknowledged_warnings: acknowledgment ?? acknowledged_warnings,
    });
  },

  async undoAction(actionId) {
    return api.post(`/v1/actions/${actionId}/undo`, {});
  },

  async getActionHistory() {
    return api.get('/v1/actions/history');
  },

  // Atlas Workspace
  async getAtlasWorkspace() {
    return api.get('/v1/workspaces/atlas');
  },

  async getArchivedGoals() {
    return api.get('/v1/workspaces/atlas/archived');
  },

  async validateGoalAction(payload) {
    return api.post('/v1/workspaces/atlas/validate', payload);
  },

  async validateGoalChange(payload) {
    return api.post('/v1/workspaces/atlas/validate', payload);
  },

  async projectSip({ monthly_amount_minor, annual_rate_bp, months, annual_step_up_bp = 0 }) {
    return api.post('/v1/workspaces/atlas/sip', {
      monthly_amount_minor,
      annual_rate_bp,
      months,
      annual_step_up_bp,
    });
  },

  // Nova Workspace
  async getNovaWorkspace(period) {
    const q = period ? `?period=${encodeURIComponent(period)}` : '';
    return api.get(`/v1/workspaces/nova${q}`);
  },

  async validateCapChange(payload) {
    return api.post('/v1/workspaces/nova/validate-cap', payload);
  },

  async simulateRebalance(payload) {
    return api.post('/v1/workspaces/nova/rebalance', payload);
  },

  // Iris Workspace
  async getIrisWorkspace(targetMonth) {
    const q = targetMonth ? `?target_month=${encodeURIComponent(targetMonth)}` : '';
    return api.get(`/v1/workspaces/iris${q}`);
  },

  async simulateSpendingPlan(payload) {
    return api.post('/v1/workspaces/iris/simulate', payload);
  },

  // Sentinel Workspace
  async getSentinelWorkspace(params = {}) {
    const qs = new URLSearchParams();
    if (params.timeframe_months) qs.set('timeframe_months', params.timeframe_months);
    if (params.category_id) qs.set('category_id', params.category_id);
    if (params.month) qs.set('month', params.month);
    const q = qs.toString() ? `?${qs.toString()}` : '';
    return api.get(`/v1/workspaces/sentinel${q}`);
  },

  // Categorizer & Ingestion
  async getDataQuality() {
    return api.get('/v1/categorizer/status');
  },

  async getTaxonomy() {
    return api.get('/v1/categorizer/taxonomy');
  },

  async ingestManualTransaction(item) {
    return api.post('/v1/ingest/manual', item);
  },

  // Settings & Memory
  async getSettings() {
    return api.get('/v1/settings');
  },

  async getCategoryRules() {
    return api.get('/v1/settings/category-rules');
  },

  async getMemoryFacts() {
    return api.get('/v1/settings/memory-facts');
  },

  async addMemoryFact(text) {
    return api.post('/v1/memory/facts', { text });
  },

  async deleteMemoryFact(factId) {
    return api.delete(`/v1/memory/facts/${factId}`);
  },
};
