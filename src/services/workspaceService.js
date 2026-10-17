/**
 * Transitional Workspace Service — Re-exports unified api/v1 client and formatting helpers.
 * (Will be retired in WS-UI-P3).
 */

import { api } from './api/v1';
export { formatMinorInr, formatBpPct, formatDate } from '../lib/format';

export const workspaceService = {
  // Chat
  async sendChat(messageOrObj, workspace = 'JOHN', extra = {}) {
    if (typeof messageOrObj === 'object' && messageOrObj !== null) {
      const ws = messageOrObj.workspace || messageOrObj.ui_context?.workspace || 'JOHN';
      return api.post('/chat', {
        message: messageOrObj.message,
        thread_id: messageOrObj.thread_id,
        ui_context: messageOrObj.ui_context || { workspace: ws },
      });
    }
    return api.post('/chat', {
      message: messageOrObj,
      ui_context: { workspace },
      ...extra,
    });
  },

  // Proposals & Actions
  async proposeAction(actionType, params) {
    return api.submitProposal({ action: actionType, params });
  },

  async executeAction({ proposal_id, params_hash, ack = true }) {
    return api.confirmProposal(proposal_id, { params_hash, ack });
  },

  async undoAction(actionId) {
    return api.undoAction(actionId);
  },

  // Workspaces
  async getAtlasWorkspace() {
    return api.getWorkspace('atlas');
  },

  async getArchivedGoals() {
    return api.get('/workspaces/atlas/archived');
  },

  async validateGoalAction(payload) {
    return api.post('/workspaces/atlas/validate', payload);
  },

  async projectSip(params) {
    return api.post('/workspaces/atlas/sip', params);
  },

  async getNovaWorkspace(period) {
    return api.getWorkspace('nova', period ? { period } : {});
  },

  async validateCapChange(payload) {
    return api.post('/workspaces/nova/validate-cap', payload);
  },

  async simulateRebalance(payload) {
    return api.post('/workspaces/nova/rebalance', payload);
  },

  async getIrisWorkspace(targetMonth) {
    return api.getWorkspace('iris', targetMonth ? { target_month: targetMonth } : {});
  },

  async simulateSpendingPlan(payload) {
    return api.post('/workspaces/iris/simulate', payload);
  },

  async getSentinelWorkspace(params = {}) {
    return api.getWorkspace('sentinel', params);
  },

  async getDataQuality() {
    return api.get('/categorizer/status');
  },

  async getTaxonomy() {
    return api.get('/categorizer/taxonomy');
  },

  async getSettings() {
    return api.get('/settings');
  },
};

export default workspaceService;
