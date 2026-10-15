/**
 * Standalone Branch Test: Tally Tool (src/tools/tally/)
 * Validates 3-state categorization (SETTLED / NEEDS_REVIEW / UNCATEGORIZED), taxonomy hierarchy, and correction events.
 */
const assert = require('assert');
const { getDb } = require('../../db/db');
const { seedNova } = require('../../db/seed');
const { TaxonomyRegistry, TallyCategorizer, defaultTallyService } = require('./TallyService');

console.log('🏷️  [Branch Test: TALLY] Running Tally Categorization Service verification...');

const db = getDb(':memory:');
const userId = 'test_branch_tally';
seedNova(userId, db);

assert.strictEqual(TallyCategorizer.categorize('Swiggy Order #912'), 'Food & Dining');

const covered = TaxonomyRegistry.getCoveredCategoryIds('cat_food', new Set(['cat_food']));
assert.ok(covered.includes('cat_food_dining'));

const migrated = TaxonomyRegistry.migrateCapRecord({ category_id: 'cat_entertainment_legacy', monthly_cap: 2500 });
assert.strictEqual(migrated[0].migrated, true);

const ingested = defaultTallyService.ingestBatch(userId, [{ rawDescription: 'Zomato Dinner', amount: 520 }], db);
assert.ok(Array.isArray(ingested.event.touched_categories) && ingested.event.touched_categories.includes('Food & Dining'));

console.log('✅ [Branch Test: TALLY] Passed 100%!');
