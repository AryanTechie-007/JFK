// Gemini API Service Integration for John Master AI Financial Coach

const getGeminiApiKey = () => 
  import.meta.env.GEMINI_API_KEY || 
  import.meta.env.VITE_GEMINI_API_KEY || 
  (typeof process !== 'undefined' && process.env ? process.env.GEMINI_API_KEY : '') || 
  '';

export async function askGeminiJohn(userQuery, userProfile, activeGoals) {
  const apiKey = getGeminiApiKey();
  const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const systemContext = `
You are John, the Master AI Financial Coach of FinMate AI.
You orchestrate 4 specialized underlying AI agents:
1. Sentinel (Observer & Expense Predictor): Detects upcoming insurance bills (₹12,000 due Sep 15th) and forecasts time-series spending.
2. Iris (Spending Advisor): Identifies food delivery bloat (18 Swiggy orders = ₹9,200/mo) and unused SaaS subscriptions (₹1,200/mo).
3. Atlas (Saving Strategist): Manages liquidity goals (Emergency Reserve ₹60k/₹120k) and wealth SIPs.
4. Nova (Budget Guardian): Enforces category limits (Subscriptions breached at 116%, Food at 92%).

User Financial Profile:
Name: ${userProfile.name}
Monthly Income: ₹${userProfile.monthlyIncome}
Fixed Expenses: ₹${userProfile.fixedExpenses}
Total Spent this month: ₹${userProfile.totalSpentThisMonth}
Net Surplus: ₹${userProfile.currentSavings}
Current Active Goals: ${activeGoals.map(g => `${g.name} (Saved ₹${g.current}/₹${g.target})`).join(', ')}

Guidelines:
- Give direct, actionable financial advice in clean bullet points.
- Do NOT use LaTeX math syntax like $\\rightarrow$. Use clean arrow symbols → instead.
- Format bold text using standard double asterisks **like this**.
- If the user query implies a new saving objective or purchase (e.g. buying a bike, phone, laptop, or holiday), offer to create a new savings goal for them, but ask for their consent.
`;

  try {
    const response = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: `${systemContext}\n\nUser Question: ${userQuery}` }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API error status: ${response.status}`);
    }

    const data = await response.json();
    const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (replyText) {
      return {
        success: true,
        text: replyText.replace(/\$\\rightarrow\$/g, '→')
      };
    }
  } catch (err) {
    console.warn("Gemini API fallback to local engine:", err);
  }

  return { success: false };
}
