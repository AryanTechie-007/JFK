// Persistent AI Conversation & Orchestrator API Service for FinMate AI
import { api } from './api';

export const conversationService = {
  /**
   * Fetch user's conversation list
   * GET /api/ai/conversations
   */
  async getConversations() {
    try {
      const response = await api.get('/ai/conversations');
      return {
        success: true,
        conversations: Array.isArray(response) ? response : (response.conversations || []),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        conversations: [],
      };
    }
  },

  /**
   * Fetch a specific conversation with messages
   * GET /api/ai/conversations/:id
   */
  async getConversation(id) {
    try {
      const response = await api.get(`/ai/conversations/${id}`);
      return {
        success: true,
        conversation: response.conversation || response,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * Create a new conversation session
   * POST /api/ai/conversations
   */
  async createConversation(title = 'New Financial Coaching Session') {
    try {
      const response = await api.post('/ai/conversations', { title });
      return {
        success: true,
        conversation: response.conversation || response,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  },

  /**
   * Send user message to Backend AI orchestrator / Gemini service
   * POST /api/ai/chat or POST /api/ai/conversations/:id/messages
   */
  async sendMessage(conversationId, userQuery, userProfile, activeGoals) {
    try {
      const endpoint = conversationId 
        ? `/ai/conversations/${conversationId}/messages`
        : '/ai/chat';

      const payload = {
        message: userQuery,
        conversationId,
        userProfile,
        activeGoals,
      };

      const response = await api.post(endpoint, payload);

      return {
        success: true,
        text: response.message || response.text || response.reply,
        traces: response.traces || [],
        proposedGoal: response.proposedGoal || null,
        conversationId: response.conversationId || conversationId,
      };
    } catch (error) {
      console.warn('Backend AI chat error:', error.message);
      return {
        success: false,
        error: error.message || 'AI service currently unavailable.',
      };
    }
  },
};
