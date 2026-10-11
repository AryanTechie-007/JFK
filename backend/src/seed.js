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

console.log(`Seeded clean demo user: ${EMAIL} / demopass123 (user id ${userId})`);

