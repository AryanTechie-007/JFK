// Very small keyword-based categorizer standing in for a real ML classifier.
// Swap this out later for a trained model or an LLM call without changing the API shape.

const RULES = [
  { category: 'Food Delivery', keywords: ['swiggy', 'zomato', 'gourmet bowl', 'ubereats'] },
  { category: 'Subscriptions', keywords: ['netflix', 'spotify', 'prime', 'hotstar', 'youtube premium'] },
  { category: 'Shopping', keywords: ['amazon', 'flipkart', 'myntra', 'ajio'] },
  { category: 'Groceries', keywords: ['bigbasket', 'blinkit', 'zepto', 'dmart', 'grocery'] },
  { category: 'Transport', keywords: ['uber', 'ola', 'rapido', 'fuel', 'petrol', 'metro'] },
  { category: 'Utilities', keywords: ['electricity', 'water bill', 'broadband', 'recharge', 'gas bill'] },
  { category: 'Insurance', keywords: ['insurance', 'lic', 'policybazaar'] },
  { category: 'Housing', keywords: ['rent', 'maintenance fee', 'landlord'] },
];

function categorizeTransaction(rawDescription) {
  const text = rawDescription.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((kw) => text.includes(kw))) {
      return rule.category;
    }
  }
  return 'Uncategorized';
}

module.exports = { categorizeTransaction };
