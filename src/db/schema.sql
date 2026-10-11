-- Nova V4 Ecosystem Schema (Tally, Sentinel, ThresholdJob, ActionService, John & Nova)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  monthly_income REAL DEFAULT 75000,
  fixed_housing_expense REAL DEFAULT 25000,
  currency TEXT DEFAULT '₹',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS budget_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  category_id TEXT,
  category TEXT NOT NULL,
  monthly_cap REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, category),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  raw_description TEXT NOT NULL,
  amount REAL NOT NULL,
  category_id TEXT DEFAULT 'cat_uncategorized',
  category TEXT NOT NULL,
  categorization_status TEXT DEFAULT 'SETTLED', -- 'SETTLED' | 'NEEDS_REVIEW' | 'UNCATEGORIZED'
  txn_type TEXT DEFAULT 'debit',
  txn_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, txn_date);
CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_tx_cat_id ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_caps_user ON budget_categories(user_id);

-- User Preferences & Protected Categories (Owned by John / User Preferences)
CREATE TABLE IF NOT EXISTS user_personas (
  user_id TEXT PRIMARY KEY,
  lifestyle_flexibility TEXT DEFAULT 'moderate',
  priority_categories TEXT DEFAULT '["Housing", "Healthcare", "Bills & Utilities"]',
  flexible_categories TEXT DEFAULT '["Shopping & Lifestyle", "Food & Dining"]',
  target_savings_rate REAL DEFAULT 25.0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Historical Merchant Baselines & Recurring Schedule (Read by Sentinel)
CREATE TABLE IF NOT EXISTS merchant_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  category TEXT NOT NULL,
  typical_amount REAL NOT NULL,
  frequency TEXT DEFAULT 'monthly',
  last_seen_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_subscription INTEGER DEFAULT 0,
  UNIQUE(user_id, merchant_name),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Action Service Audit Log
CREATE TABLE IF NOT EXISTS action_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  tier TEXT NOT NULL,
  initiated_by TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
