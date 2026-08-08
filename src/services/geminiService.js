// Gemini AI Service Wrapper for FinMate AI
// SECURED ARCHITECTURE: All Gemini AI calls route through the Backend API (/api/ai/chat)
// The frontend NEVER directly calls Google's API or handles GEMINI_API_KEY.

import { conversationService } from './conversationService';
import { runOrchestratorQuery } from '../data/mockFinancialData';

export async function askGeminiJohn(userQuery, userProfile, activeGoals, conversationId = null) {
  try {
    // Call backend API endpoint
    const response = await conversationService.sendMessage(conversationId, userQuery, userProfile, activeGoals);

    if (response.success) {
      return {
        success: true,
        text: response.text,
        traces: response.traces,
        proposedGoal: response.proposedGoal,
        conversationId: response.conversationId,
      };
    }
  } catch (err) {
    console.warn("Backend AI Chat endpoint unreachable, evaluating local fallback:", err.message);
  }

  // Development Fallback when backend is offline
  const localResult = runOrchestratorQuery(userQuery);
  return {
    success: true,
    text: localResult.johnResponse,
    traces: localResult.traces,
    proposedGoal: localResult.proposedGoal,
    isFallback: true,
  };
}
