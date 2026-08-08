require('dotenv').config();

const bcrypt = require('bcryptjs');
const db = require('./db');
const { categorizeTransaction } = require('./utils/categorize');

const EMAIL = 'demo@finmate.ai';

db.prepare('DELETE FROM users WHERE email = ?').run(EMAIL);

const userId = db
  .prepare(
    `INSERT INTO users (name, email, password_hash, occupation, monthly_income,
                        fixed_housing_expense, risk_strategy)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  .run('Demo User', EMAIL, bcrypt.hashSync('demopass123', 10), 'Software Engineer', 95000, 28000, 'balanced')
  .lastInsertRowid;

const caps = {
  'Food Delivery': 8000,
  Subscriptions: 1500,
  Shopping: 6000,
  Groceries: 8000,
  Transport: 4000,
};
const capStmt = db.prepare(
  'INSERT INTO budget_categories (user_id, category, monthly_cap) VALUES (?, ?, ?)'
);
for (const [cat, cap] of Object.entries(caps)) capStmt.run(userId, cat, cap);

const goalStmt = db.prepare(
  `INSERT INTO goals (user_id, name, target_amount, saved_amount, monthly_allocation, priority)
   VALUES (?, ?, ?, ?, ?, ?)`
);
goalStmt.run(userId, 'Emergency Fund', 300000, 145000, 12000, 'high');
goalStmt.run(userId, 'iPhone 16 Purchase Reserve', 85000, 22000, 6000, 'medium');

const billStmt = db.prepare(
  'INSERT INTO upcoming_bills (user_id, label, amount, due_date) VALUES (?, ?, ?, ?)'
);
billStmt.run(userId, 'Car Insurance Renewal', 12000, '2026-09-15');
billStmt.run(userId, 'Annual Broadband Plan', 7200, '2026-09-28');

// Three months of transactions so Sentinel's trend line has something to fit.
const samples = [
  ['SWIGGY GOURMET BOWL', 520],
  ['ZOMATO ORDER', 480],
  ['SWIGGY DINNER', 610],
  ['NETFLIX PAY', 649],
  ['SPOTIFY PREMIUM', 199],
  ['AMAZON CLOTHING', 2400],
  ['BIGBASKET GROCERY', 3200],
  ['UBER RIDE', 340],
  ['ELECTRICITY BILL', 1850],
];

const txnStmt = db.prepare(
  `INSERT INTO transactions (user_id, raw_description, amount, category, txn_date)
   VALUES (?, ?, ?, ?, ?)`
);

const now = new Date();
for (let monthsAgo = 2; monthsAgo >= 0; monthsAgo--) {
  const base = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const monthStr = base.toISOString().slice(0, 7);
  // Food delivery frequency creeps up each month — gives Iris something to flag.
  const deliveryOrders = 10 + (2 - monthsAgo) * 4;

  for (let i = 0; i < deliveryOrders; i++) {
    const [desc, amt] = samples[i % 3];
    const day = String(Math.min(i + 1, 28)).padStart(2, '0');
    txnStmt.run(userId, desc, amt + (i % 5) * 40, categorizeTransaction(desc), `${monthStr}-${day} 13:00:00`);
  }

  samples.slice(3).forEach(([desc, amt], i) => {
    const day = String(5 + i * 3).padStart(2, '0');
    txnStmt.run(userId, desc, amt, categorizeTransaction(desc), `${monthStr}-${day} 10:00:00`);
  });
}

console.log(`Seeded demo user: ${EMAIL} / demopass123 (user id ${userId})`);
