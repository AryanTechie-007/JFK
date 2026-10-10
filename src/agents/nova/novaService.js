/**
 * Nova V4 Guardian Frontend API Client
 */

const API_BASE_URL = typeof process !== 'undefined' && process.env?.NOVA_API_URL
  ? process.env.NOVA_API_URL
  : 'http://localhost:4001';

export const novaService = {
  async getBudget(month = null, userId = 'user_demo_nova') {
    try {
      const url = month ? `${API_BASE_URL}/api/budget?month=${month}` : `${API_BASE_URL}/api/budget`;
      const res = await fetch(url, {
        headers: { 'x-user-id': userId }
      });
      if (!res.ok) throw new Error(`Failed to fetch budget: ${res.statusText}`);
      return await res.json();
    } catch (err) {
      console.warn('[NovaService] Falling back to offline evaluation:', err.message);
      return null;
    }
  },

  async logExpense(transactionData, userId = 'user_demo_nova') {
    const res = await fetch(`${API_BASE_URL}/api/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId
      },
      body: JSON.stringify(transactionData)
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to log expense');
    }
    return await res.json();
  },

  async correctTransactionCategory(transactionId, newCategory, userId = 'user_demo_nova') {
    const res = await fetch(`${API_BASE_URL}/api/transactions/${transactionId}/category`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId
      },
      body: JSON.stringify({ new_category: newCategory })
    });
    if (!res.ok) throw new Error('Failed to correct transaction category');
    return await res.json();
  },

  async getReviewQueue(userId = 'user_demo_nova') {
    const res = await fetch(`${API_BASE_URL}/api/transactions/review-queue`, {
      headers: { 'x-user-id': userId }
    });
    if (!res.ok) throw new Error('Failed to fetch review queue');
    return await res.json();
  },

  async proposeCapChange(category, monthlyCap, explicitUserRequest = false, userId = 'user_demo_nova') {
    const res = await fetch(`${API_BASE_URL}/api/budget/${encodeURIComponent(category)}/propose`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId
      },
      body: JSON.stringify({ monthlyCap, explicit_user_request: explicitUserRequest })
    });
    return await res.json();
  },

  async updateCap(category, monthlyCap, confirmationToken = null, userId = 'user_demo_nova') {
    const res = await fetch(`${API_BASE_URL}/api/budget/${encodeURIComponent(category)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        ...(confirmationToken ? { 'x-confirmation-token': confirmationToken } : {})
      },
      body: JSON.stringify({ monthlyCap, confirmation_token: confirmationToken })
    });
    if (!res.ok) throw new Error('Failed to update budget cap');
    return await res.json();
  },

  async getTelemetry(userId = 'user_demo_nova') {
    const res = await fetch(`${API_BASE_URL}/api/nova/telemetry`, {
      headers: { 'x-user-id': userId }
    });
    if (!res.ok) throw new Error('Failed to fetch Nova telemetry');
    return await res.json();
  },

  async getCognitiveCycle(userId = 'user_demo_nova') {
    try {
      const res = await fetch(`${API_BASE_URL}/api/nova/telemetry/cycle`, {
        headers: { 'x-user-id': userId }
      });
      if (!res.ok) throw new Error('Failed to fetch cognitive cycle');
      return await res.json();
    } catch (err) {
      console.warn('[NovaService] Cognitive cycle fallback:', err.message);
      return null;
    }
  },

  async getJohnBriefing(userId = 'user_demo_nova') {
    const res = await fetch(`${API_BASE_URL}/api/nova/telemetry/briefing`, {
      headers: { 'x-user-id': userId }
    });
    if (!res.ok) throw new Error('Failed to fetch John briefing');
    return await res.json();
  },

  async negotiateWithAtlas(deficitAmount = null, userId = 'user_demo_nova') {
    const res = await fetch(`${API_BASE_URL}/api/nova/telemetry/negotiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId
      },
      body: JSON.stringify({ deficitAmount })
    });
    if (!res.ok) throw new Error('Failed to coordinate with Atlas via John');
    return await res.json();
  },

  async applyRebalance(move, confirmationToken = null, userId = 'user_demo_nova') {
    const res = await fetch(`${API_BASE_URL}/api/nova/telemetry/rebalance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
        ...(confirmationToken ? { 'x-confirmation-token': confirmationToken } : {})
      },
      body: JSON.stringify({ move, confirmation_token: confirmationToken })
    });
    if (!res.ok) throw new Error('Failed to apply rebalance');
    return await res.json();
  }
};
