/**
 * TaxonomyRegistry — Category ID Hierarchy, Aliases, Deprecated Categories & Migration Map
 * Implements Nova V4 Changes from V3, Section 6 (Cap rules & taxonomy), and Section 12.
 */

const TAXONOMY_NODES = Object.freeze({
  cat_food: {
    category_id: 'cat_food',
    name: 'Food & Dining',
    parent_id: null,
    subcategories: ['cat_food_dining', 'cat_food_groceries'],
    deprecated: false,
    aliases: ['food & dining', 'dining', 'food']
  },
  cat_food_dining: {
    category_id: 'cat_food_dining',
    name: 'Restaurants & Delivery',
    parent_id: 'cat_food',
    subcategories: [],
    deprecated: false,
    aliases: ['restaurants', 'restaurants & delivery', 'eating out', 'food delivery']
  },
  cat_food_groceries: {
    category_id: 'cat_food_groceries',
    name: 'Groceries',
    parent_id: 'cat_food',
    subcategories: [],
    deprecated: false,
    aliases: ['groceries', 'grocery', 'supermarket']
  },
  cat_shopping: {
    category_id: 'cat_shopping',
    name: 'Shopping & Lifestyle',
    parent_id: null,
    subcategories: ['cat_shopping_electronics', 'cat_shopping_apparel'],
    deprecated: false,
    aliases: ['shopping & lifestyle', 'shopping', 'lifestyle']
  },
  cat_shopping_electronics: {
    category_id: 'cat_shopping_electronics',
    name: 'Electronics & Gadgets',
    parent_id: 'cat_shopping',
    subcategories: [],
    deprecated: false,
    aliases: ['electronics', 'gadgets', 'electronics & gadgets']
  },
  cat_shopping_apparel: {
    category_id: 'cat_shopping_apparel',
    name: 'Apparel & Fashion',
    parent_id: 'cat_shopping',
    subcategories: [],
    deprecated: false,
    aliases: ['apparel', 'fashion', 'clothing', 'apparel & fashion']
  },
  cat_subscriptions: {
    category_id: 'cat_subscriptions',
    name: 'Subscriptions',
    parent_id: null,
    subcategories: [],
    deprecated: false,
    aliases: ['subscriptions', 'subscription', 'streaming', 'entertainment']
  },
  cat_transport: {
    category_id: 'cat_transport',
    name: 'Transport',
    parent_id: null,
    subcategories: [],
    deprecated: false,
    aliases: ['transport', 'transportation', 'commute', 'fuel', 'travel']
  },
  cat_bills: {
    category_id: 'cat_bills',
    name: 'Bills & Utilities',
    parent_id: null,
    subcategories: [],
    deprecated: false,
    aliases: ['bills & utilities', 'bills', 'utilities']
  },
  cat_healthcare: {
    category_id: 'cat_healthcare',
    name: 'Healthcare',
    parent_id: null,
    subcategories: [],
    deprecated: false,
    aliases: ['healthcare', 'health', 'medical', 'pharmacy']
  },
  cat_housing: {
    category_id: 'cat_housing',
    name: 'Housing',
    parent_id: null,
    subcategories: [],
    deprecated: false,
    aliases: ['housing', 'rent', 'mortgage']
  },
  // Deprecated categories (for CAP_ON_DEPRECATED_CATEGORY & migration map)
  cat_entertainment_legacy: {
    category_id: 'cat_entertainment_legacy',
    name: 'Entertainment (Legacy)',
    parent_id: null,
    subcategories: [],
    deprecated: true,
    suggested_replacement: 'cat_subscriptions',
    SuggestedReplacementName: 'Subscriptions',
    aliases: ['entertainment (legacy)', 'legacy entertainment', 'digital entertainment']
  },
  cat_dining_legacy: {
    category_id: 'cat_dining_legacy',
    name: 'Dining Out (Deprecated)',
    parent_id: null,
    subcategories: [],
    deprecated: true,
    suggested_replacement: 'cat_food',
    SuggestedReplacementName: 'Food & Dining',
    aliases: ['dining out (deprecated)', 'old dining']
  }
});

/**
 * Taxonomy Migration Map: handles renamed, merged, or split categories
 */
const TAXONOMY_MIGRATION_MAP = Object.freeze({
  cat_entertainment_legacy: { type: 'RENAMED', target_id: 'cat_subscriptions' },
  cat_dining_legacy: { type: 'MERGED', target_id: 'cat_food' },
  cat_retail_merged: { type: 'MERGED', target_id: 'cat_shopping' },
  cat_lifestyle_split: {
    type: 'SPLIT',
    targets: [
      { target_id: 'cat_shopping', ratio: 0.7 },
      { target_id: 'cat_subscriptions', ratio: 0.3 }
    ]
  }
});

class TaxonomyRegistry {
  static getAllNodes() {
    return TAXONOMY_NODES;
  }

  static getMigrationMap() {
    return TAXONOMY_MIGRATION_MAP;
  }

  /**
   * Resolves a category_id or display name to a canonical taxonomy node.
   * Returns null if unknown.
   */
  static resolve(input) {
    if (!input || typeof input !== 'string') return null;
    const trimmed = input.trim();
    const lower = trimmed.toLowerCase();

    if (TAXONOMY_NODES[trimmed]) return TAXONOMY_NODES[trimmed];
    if (TAXONOMY_NODES[lower]) return TAXONOMY_NODES[lower];

    // Check migration map if someone passes a migrated ID
    if (TAXONOMY_MIGRATION_MAP[trimmed] && TAXONOMY_MIGRATION_MAP[trimmed].target_id) {
      const migratedTarget = TAXONOMY_NODES[TAXONOMY_MIGRATION_MAP[trimmed].target_id];
      if (migratedTarget) {
        return {
          ...migratedTarget,
          migrated_from: trimmed,
          migration_type: TAXONOMY_MIGRATION_MAP[trimmed].type
        };
      }
    }

    for (const node of Object.values(TAXONOMY_NODES)) {
      if (node.name.toLowerCase() === lower || node.aliases.includes(lower)) {
        return node;
      }
    }

    return null;
  }

  /**
   * Detects ambiguous category queries (Section 12: "Ambiguous category in a request -> needs_input with candidates")
   */
  static findAmbiguousCandidates(query) {
    if (!query || typeof query !== 'string') return [];
    const q = query.trim().toLowerCase();

    // Explicit ambiguous terms that span multiple distinct categories
    const ambiguousMap = {
      'personal': ['cat_shopping', 'cat_healthcare', 'cat_subscriptions'],
      'lifestyle': ['cat_shopping', 'cat_food', 'cat_subscriptions'],
      'living': ['cat_housing', 'cat_bills', 'cat_food_groceries'],
      'monthly': ['cat_bills', 'cat_subscriptions', 'cat_housing'],
      'food & shopping': ['cat_food', 'cat_shopping']
    };

    if (ambiguousMap[q]) {
      return ambiguousMap[q].map(id => ({
        category_id: id,
        name: TAXONOMY_NODES[id].name
      }));
    }

    // Substring match against multiple non-deprecated categories when exact match fails
    if (!this.resolve(q)) {
      const matches = Object.values(TAXONOMY_NODES).filter(
        n => !n.deprecated && (
          n.name.toLowerCase().includes(q) ||
          n.aliases.some(a => a.includes(q))
        )
      );
      if (matches.length > 1) {
        return matches.map(m => ({ category_id: m.category_id, name: m.name }));
      }
    }

    return [];
  }

  /**
   * Returns all descendant category_ids covered by a parent category_id,
   * excluding subcategories that have their own independent budget cap.
   */
  static getCoveredCategoryIds(categoryId, configuredCapIds = new Set()) {
    const node = this.resolve(categoryId);
    if (!node) return [categoryId];

    const covered = [node.category_id];
    if (Array.isArray(node.subcategories) && node.subcategories.length > 0) {
      for (const subId of node.subcategories) {
        // A cap on a top-level category covers all its subcategories unless a subcategory has its own cap
        if (!configuredCapIds.has(subId)) {
          covered.push(subId);
        }
      }
    }
    return covered;
  }

  /**
   * Applies taxonomy migrations to a list of cap records.
   */
  static migrateCapRecord(capRecord) {
    const key = capRecord.category_id || capRecord.category;
    const migration = TAXONOMY_MIGRATION_MAP[key];
    if (!migration) {
      const resolved = this.resolve(key);
      return [{
        ...capRecord,
        category_id: resolved ? resolved.category_id : key,
        category: resolved ? resolved.name : capRecord.category,
        migrated: false
      }];
    }

    if (migration.type === 'RENAMED' || migration.type === 'MERGED') {
      const targetNode = TAXONOMY_NODES[migration.target_id];
      return [{
        ...capRecord,
        category_id: targetNode.category_id,
        category: targetNode.name,
        migrated: true,
        migrated_from: key,
        migration_type: migration.type
      }];
    }

    if (migration.type === 'SPLIT') {
      return migration.targets.map(t => {
        const targetNode = TAXONOMY_NODES[t.target_id];
        return {
          ...capRecord,
          category_id: targetNode.category_id,
          category: targetNode.name,
          monthly_cap: Math.round(Number(capRecord.monthly_cap) * t.ratio),
          migrated: true,
          migrated_from: key,
          migration_type: 'SPLIT'
        };
      });
    }

    return [capRecord];
  }
}

module.exports = TaxonomyRegistry;
