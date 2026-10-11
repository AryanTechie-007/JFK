const { getDb } = require('./db');
const SnapshotManager = require('../tools/sentinel/SnapshotManager');

const DEFAULT_CAPS = [
  { category_id: 'cat_food', category: 'Food & Dining', monthly_cap: 10000 },
  { category_id: 'cat_shopping', category: 'Shopping & Lifestyle', monthly_cap: 8000 },
  { category_id: 'cat_subscriptions', category: 'Subscriptions', monthly_cap: 3000 },
  { category_id: 'cat_transport', category: 'Transport', monthly_cap: 5000 },
  { category_id: 'cat_bills', category: 'Bills & Utilities', monthly_cap: 6000 },
  { category_id: 'cat_healthcare', category: 'Healthcare', monthly_cap: 4000 }
];

function getSeedTransactions() {
  const ym = new Date().toISOString().slice(0, 7);
  return [
    { raw_description: 'Swiggy Gourmet Feast', amount: 1450, category_id: 'cat_food_dining', category: 'Food & Dining', status: 'SETTLED', txn_date: `${ym}-02T19:30:00Z` },
    { raw_description: 'Zomato Daily Dinner', amount: 850, category_id: 'cat_food_dining', category: 'Food & Dining', status: 'SETTLED', txn_date: `${ym}-05T20:15:00Z` },
    { raw_description: 'BigBasket Weekly Groceries', amount: 650, category_id: 'cat_food_groceries', category: 'Food & Dining', status: 'SETTLED', txn_date: `${ym}-08T11:00:00Z` },
    { raw_description: 'Fine Dining Bistro', amount: 6250, category_id: 'cat_food_dining', category: 'Food & Dining', status: 'SETTLED', txn_date: `${ym}-14T21:00:00Z` },
    { raw_description: 'Netflix Premium 4K', amount: 799, category_id: 'cat_subscriptions', category: 'Subscriptions', status: 'SETTLED', txn_date: `${ym}-01T08:00:00Z` },
    { raw_description: 'Spotify Family Plan', amount: 199, category_id: 'cat_subscriptions', category: 'Subscriptions', status: 'SETTLED', txn_date: `${ym}-03T10:00:00Z` },
    { raw_description: 'Amazon Prime Yearly Sub', amount: 1499, category_id: 'cat_subscriptions', category: 'Subscriptions', status: 'SETTLED', txn_date: `${ym}-07T12:00:00Z` },
    { raw_description: 'Google One Cloud 2TB', amount: 650, category_id: 'cat_subscriptions', category: 'Subscriptions', status: 'SETTLED', txn_date: `${ym}-10T14:30:00Z` },
    { raw_description: 'Apple iCloud Plus', amount: 490, category_id: 'cat_subscriptions', category: 'Subscriptions', status: 'SETTLED', txn_date: `${ym}-12T09:00:00Z` },
    { raw_description: 'Uber Premier Office Commute', amount: 480, category_id: 'cat_transport', category: 'Transport', status: 'SETTLED', txn_date: `${ym}-04T09:30:00Z` },
    { raw_description: 'Ola Cab Return Trip', amount: 520, category_id: 'cat_transport', category: 'Transport', status: 'SETTLED', txn_date: `${ym}-04T18:45:00Z` },
    { raw_description: 'Shell Petrol Top-up', amount: 2500, category_id: 'cat_transport', category: 'Transport', status: 'SETTLED', txn_date: `${ym}-11T16:00:00Z` },
    { raw_description: 'Amazon Electronics & Cables', amount: 3200, category_id: 'cat_shopping_electronics', category: 'Shopping & Lifestyle', status: 'SETTLED', txn_date: `${ym}-09T15:20:00Z` },
    { raw_description: 'Zara Weekend Casuals (Pending POS)', amount: 4100, category_id: 'cat_shopping_apparel', category: 'Shopping & Lifestyle', status: 'NEEDS_REVIEW', txn_date: `${ym}-15T17:00:00Z` },
    { raw_description: 'Airtel Broadband Fiber', amount: 1199, category_id: 'cat_bills', category: 'Bills & Utilities', status: 'SETTLED', txn_date: `${ym}-06T10:00:00Z` },
    { raw_description: 'Electricity Board BESCOM', amount: 2450, category_id: 'cat_bills', category: 'Bills & Utilities', status: 'SETTLED', txn_date: `${ym}-08T14:00:00Z` }
  ];
}

const SEED_TRANSACTIONS = getSeedTransactions();

function seedNova(userId = 'user_demo_nova', customDb = null) {
  const db = customDb || getDb();
  const txns = getSeedTransactions();

  db.prepare(`
    INSERT INTO users (id, name, email, monthly_income, fixed_housing_expense, currency)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET monthly_income = excluded.monthly_income
  `).run(userId, 'Aryan Demo', 'aryan@example.com', 75000, 25000, '₹');

  const insertCap = db.prepare(`
    INSERT INTO budget_categories (user_id, category, monthly_cap)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, category) DO UPDATE SET monthly_cap = excluded.monthly_cap
  `);

  for (const cap of DEFAULT_CAPS) {
    insertCap.run(userId, cap.category, cap.monthly_cap);
  }

  const insertTx = db.prepare(`
    INSERT INTO transactions (user_id, raw_description, amount, category, category_id, categorization_status, txn_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const tx of txns) {
    insertTx.run(userId, tx.raw_description, tx.amount, tx.category, tx.category_id, tx.status, tx.txn_date);
  }

  db.prepare(`
    INSERT OR REPLACE INTO user_personas (user_id, lifestyle_flexibility, priority_categories, flexible_categories, target_savings_rate)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    userId,
    'moderate',
    JSON.stringify(['Housing', 'Healthcare', 'Bills & Utilities']),
    JSON.stringify(['Shopping & Lifestyle', 'Food & Dining']),
    25.0
  );

  const insertMerchant = db.prepare(`
    INSERT OR REPLACE INTO merchant_profiles (user_id, merchant_name, category, typical_amount, frequency, is_subscription)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const demoMerchants = [
    { name: 'Netflix', cat: 'Subscriptions', amt: 649, freq: 'monthly', isSub: 1 },
    { name: 'Spotify', cat: 'Subscriptions', amt: 199, freq: 'monthly', isSub: 1 },
    { name: 'Swiggy', cat: 'Food & Dining', amt: 950, freq: 'weekly', isSub: 0 },
    { name: 'Uber', cat: 'Transport', amt: 480, freq: 'weekly', isSub: 0 },
    { name: 'Airtel Fiber', cat: 'Bills & Utilities', amt: 1199, freq: 'monthly', isSub: 1 }
  ];

  for (const m of demoMerchants) {
    insertMerchant.run(userId, m.name, m.cat, m.amt, m.freq, m.isSub);
  }

  SnapshotManager.createSnapshot(userId, db);

  console.log(`[Nova V4 Seed] Populated ${DEFAULT_CAPS.length} taxonomy-keyed budget caps, ${txns.length} transactions (settled & provisional), preferences, and initial Sentinel snapshot for user ${userId}.`);
}

if (require.main === module) {
  seedNova();
}

module.exports = { seedNova, DEFAULT_CAPS, SEED_TRANSACTIONS };
