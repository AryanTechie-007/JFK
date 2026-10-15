/**
 * TallyCategorizer — Deterministic Categorization & Provisional/Uncategorized Classifier
 *
 * Classifies merchant descriptions into:
 * - category_id & display category name
 * - status: 'SETTLED' | 'NEEDS_REVIEW' | 'UNCATEGORIZED'
 * - confidence: 'high' | 'medium' | 'low'
 */

const TaxonomyRegistry = require('./TaxonomyRegistry');

const KEYWORD_RULES = [
  {
    category_id: 'cat_food_groceries',
    category: 'Food & Dining',
    subcategory_name: 'Groceries',
    keywords: ['bigbasket', 'blinkit', 'zepto', 'instamart', 'dmart', 'supermarket', 'grocery', 'groceries', 'nature basket']
  },
  {
    category_id: 'cat_food',
    category: 'Food & Dining',
    keywords: [
      'swiggy', 'zomato', 'gourmet', 'restaurant', 'cafe', 'starbucks', 'mcdonalds',
      'subway', 'burger', 'pizza', 'dominos', 'kfc', 'dining', 'food', 'bistro'
    ]
  },
  {
    category_id: 'cat_subscriptions',
    category: 'Subscriptions',
    keywords: [
      'netflix', 'spotify', 'prime', 'hotstar', 'youtube', 'apple music', 'icloud',
      'google one', 'chatgpt', 'openai', 'github', 'dropbox', 'subscription', 'hulu'
    ]
  },
  {
    category_id: 'cat_shopping_electronics',
    category: 'Shopping & Lifestyle',
    subcategory_name: 'Electronics & Gadgets',
    keywords: ['electronics', 'croma', 'reliance digital', 'apple store', 'gadget', 'cables']
  },
  {
    category_id: 'cat_shopping_apparel',
    category: 'Shopping & Lifestyle',
    subcategory_name: 'Apparel & Fashion',
    keywords: ['myntra', 'ajio', 'zara', 'h&m', 'apparel', 'clothing', 'fashion']
  },
  {
    category_id: 'cat_shopping',
    category: 'Shopping & Lifestyle',
    keywords: ['amazon', 'flipkart', 'mall', 'retail', 'ikea', 'lifestyle']
  },
  {
    category_id: 'cat_transport',
    category: 'Transport',
    keywords: [
      'uber', 'ola', 'rapido', 'petrol', 'diesel', 'fuel', 'shell', 'metro',
      'fastag', 'toll', 'flight', 'indigo', 'railway', 'irctc', 'parking'
    ]
  },
  {
    category_id: 'cat_bills',
    category: 'Bills & Utilities',
    keywords: [
      'airtel', 'jio', 'broadband', 'electricity', 'bescom', 'water bill',
      'gas bill', 'cylinder', 'recharge', 'wifi', 'utility', 'maintenance'
    ]
  },
  {
    category_id: 'cat_healthcare',
    category: 'Healthcare',
    keywords: [
      'pharmacy', 'apollo', 'medplus', '1mg', 'doctor', 'hospital', 'clinic',
      'lab', 'diagnostic', 'medicine', 'dental'
    ]
  },
  {
    category_id: 'cat_housing',
    category: 'Housing',
    keywords: ['rent', 'landlord', 'society maintenance', 'housing', 'mortgage', 'lease']
  }
];

const PROVISIONAL_HINTS = [
  { keywords: ['pending', 'provisional', 'unverified', 'pos swipe', 'card hold', 'upi merchant'], default_cat_id: 'cat_shopping' },
  { keywords: ['canteen', 'snacks', 'refreshment', 'club'], default_cat_id: 'cat_food' }
];

class TallyCategorizer {
  /**
   * Backward-compatible string categorizer returning display category name.
   */
  static categorize(rawDescription) {
    const detailed = this.classifyTransaction({ rawDescription });
    if (detailed.status === 'UNCATEGORIZED') {
      return 'Miscellaneous';
    }
    return detailed.category;
  }

  /**
   * Full V4 classification returning category_id, subcategory_id, status ('SETTLED' | 'NEEDS_REVIEW' | 'UNCATEGORIZED'),
   * confidence, and suspected miscategorization flag.
   */
  static classifyTransaction({ rawDescription, explicitCategory, categorizationStatus } = {}) {
    const text = typeof rawDescription === 'string' ? rawDescription.toLowerCase().trim() : '';

    // Check if keyword strongly contradicts explicit category (for MISCATEGORIZATION_SUSPECTED hint)
    let keywordMatchedRule = null;
    for (const rule of KEYWORD_RULES) {
      if (rule.keywords.some(kw => text.includes(kw))) {
        keywordMatchedRule = rule;
        break;
      }
    }

    if (explicitCategory) {
      if (explicitCategory.toUpperCase() === 'UNCATEGORIZED') {
        return {
          category_id: 'cat_uncategorized',
          subcategory_id: null,
          category: 'UNCATEGORIZED',
          status: 'UNCATEGORIZED',
          confidence: 'low',
          miscategorization_suspected: false
        };
      }

      const resolved = TaxonomyRegistry.resolve(explicitCategory);
      const topNode = resolved && resolved.parent_id
        ? TaxonomyRegistry.resolve(resolved.parent_id)
        : resolved;

      const status = categorizationStatus || (
        text.includes('needs_review') || text.includes('provisional') ? 'NEEDS_REVIEW' : 'SETTLED'
      );

      // Flag suspicion if explicit category conflicts with a known merchant keyword (e.g., Netflix placed in Healthcare)
      let miscategorizationSuspected = false;
      let suspectedTargetCategory = null;
      if (keywordMatchedRule && topNode && keywordMatchedRule.category !== topNode.name) {
        miscategorizationSuspected = true;
        suspectedTargetCategory = keywordMatchedRule.category;
      }

      return {
        category_id: resolved ? resolved.category_id : `cat_${explicitCategory.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        subcategory_id: resolved && resolved.parent_id ? resolved.category_id : null,
        category: topNode ? topNode.name : explicitCategory,
        status,
        confidence: status === 'NEEDS_REVIEW' ? 'medium' : 'high',
        miscategorization_suspected: miscategorizationSuspected,
        suspected_category: suspectedTargetCategory
      };
    }

    if (keywordMatchedRule) {
      const status = categorizationStatus || (
        text.includes('provisional') || text.includes('pending') ? 'NEEDS_REVIEW' : 'SETTLED'
      );
      return {
        category_id: keywordMatchedRule.category_id,
        subcategory_id: keywordMatchedRule.subcategory_name ? keywordMatchedRule.category_id : null,
        category: keywordMatchedRule.category,
        status,
        confidence: status === 'NEEDS_REVIEW' ? 'medium' : 'high',
        miscategorization_suspected: false
      };
    }

    // Check provisional hints
    for (const hint of PROVISIONAL_HINTS) {
      if (hint.keywords.some(kw => text.includes(kw))) {
        const node = TaxonomyRegistry.resolve(hint.default_cat_id);
        return {
          category_id: node.category_id,
          subcategory_id: null,
          category: node.name,
          status: 'NEEDS_REVIEW',
          confidence: 'low',
          miscategorization_suspected: false
        };
      }
    }

    // Unknown -> UNCATEGORIZED (in V4, uncategorized items are excluded from caps and reported separately)
    return {
      category_id: 'cat_uncategorized',
      subcategory_id: null,
      category: 'Miscellaneous',
      status: categorizationStatus || 'UNCATEGORIZED',
      confidence: 'low',
      miscategorization_suspected: false
    };
  }

  static getRules() {
    return KEYWORD_RULES;
  }
}

module.exports = TallyCategorizer;
