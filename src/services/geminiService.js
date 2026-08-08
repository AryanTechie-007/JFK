// Gemini AI Service Wrapper for FinMate AI
import { conversationService } from './conversationService';
import { runOrchestratorQuery, AGENTS } from '../data/mockFinancialData';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

/**
 * Direct call to Google Gemini API when backend is offline
 */
async function callGeminiApiDirect(userQuery, userProfile, activeGoals) {
  if (!GEMINI_API_KEY || GEMINI_API_KEY.includes('your_gemini_api_key')) {
    throw new Error('Gemini API key missing');
  }

  const userName = userProfile?.name || 'User';
  const income = userProfile?.monthlyIncome || 0;
  const fixed = userProfile?.fixedExpenses || 0;
  const surplus = userProfile?.currentSavings || Math.max(0, income - fixed);
  const goalsStr = (activeGoals || []).map(g => `${g.name} (Target: ₹${g.target}, Saved: ₹${g.current})`).join(', ');

  const systemPrompt = `You are John, the Master AI Financial Coach at FinMate AI.
You synthesize financial insights alongside your team of 4 specialist AI agents:
1. Sentinel (Predictor & Risk Radar)
2. Iris (Spending & Habit Advisor)
3. Atlas (Saving Strategist & Wealth Planner)
4. Nova (Real-Time Budget Guardian)

User Financial Profile:
- Name: ${userName}
- Monthly Income: ₹${income.toLocaleString()}
- Fixed Expenses: ₹${fixed.toLocaleString()}
- Monthly Net Surplus: ₹${surplus.toLocaleString()}
- Active Goals: ${goalsStr || 'None set yet'}

User Question: "${userQuery}"

Provide a structured response in valid JSON format with the following fields:
{
  "johnResponse": "Your clear, empathetic, and expert advice as John. Use bold markdown for key figures and bullet points.",
  "traces": [
    { "agent": "sentinel", "title": "Sentinel Forecast", "thought": "Short predictive insight..." },
    { "agent": "iris", "title": "Iris Habit Audit", "thought": "Short spending habit analysis..." },
    { "agent": "nova", "title": "Nova Budget Monitoring", "thought": "Short budget threshold status..." },
    { "agent": "atlas", "title": "Atlas Saving Strategy", "thought": "Short goal path recommendation..." }
  ],
  "proposedGoal": null // or { "name": "Goal Title", "target": 50000, "monthlyAdd": 5000, "priority": "MEDIUM PRIORITY", "category": "Savings", "iconType": "target" } if user asks to create or buy something
}
Ensure your output is strictly valid JSON ONLY, without markdown code fence wrappers if possible.`;

  const models = ['gemini-1.5-flash', 'gemini-2.5-flash', 'gemini-pro'];
  let lastError = null;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }]
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini API HTTP ${response.status}`);
      }

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      // Clean raw text if wrapped in JSON markdown blocks
      const cleanedJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanedJson);

      return {
        success: true,
        text: parsed.johnResponse || rawText,
        traces: parsed.traces || [
          { agent: AGENTS.sentinel, title: 'Sentinel Predictor', thought: 'Forecasted monthly cash flow impact.' },
          { agent: AGENTS.iris, title: 'Iris Spending Advisor', thought: 'Analyzed discretionary category outlays.' },
          { agent: AGENTS.nova, title: 'Nova Budget Guardian', thought: 'Verified budget thresholds.' },
          { agent: AGENTS.atlas, title: 'Atlas Saving Strategist', thought: 'Calculated savings trajectory.' }
        ],
        proposedGoal: parsed.proposedGoal || null,
        isDirectGemini: true
      };
    } catch (err) {
      console.warn(`Model ${model} call failed:`, err.message);
      lastError = err;
    }
  }

  throw lastError || new Error('Gemini API call failed');
}

export async function askGeminiJohn(userQuery, userProfile, activeGoals, conversationId = null) {
  // 1. Try Backend API first
  try {
    const response = await conversationService.sendMessage(conversationId, userQuery, userProfile, activeGoals);
    if (response && response.success && response.text) {
      return {
        success: true,
        text: response.text,
        traces: response.traces,
        proposedGoal: response.proposedGoal,
        conversationId: response.conversationId,
      };
    }
  } catch (err) {
    console.info("Backend AI Chat endpoint offline; falling back to direct Gemini API / local orchestrator.");
  }

  // 2. Try Direct Gemini API call using API Key
  try {
    const directRes = await callGeminiApiDirect(userQuery, userProfile, activeGoals);
    if (directRes && directRes.success) {
      return directRes;
    }
  } catch (err) {
    console.warn("Direct Gemini API call failed:", err.message);
  }

  // 3. Orchestrator local fallback
  const localResult = runOrchestratorQuery(userQuery);
  return {
    success: true,
    text: localResult.johnResponse,
    traces: localResult.traces,
    proposedGoal: localResult.proposedGoal,
    isFallback: true,
  };
}
