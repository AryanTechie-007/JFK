const fs = require('fs');
const path = require('path');

let Database;
let dbInstance = null;

function getDb(dbPath = null) {
  if (dbInstance && dbPath !== ':memory:') return dbInstance;

  if (dbPath === ':memory:') {
    dbInstance = createInMemoryStore();
    return dbInstance;
  }

  try {
    Database = require('better-sqlite3');
    const targetPath = dbPath || process.env.NOVA_DB_PATH || path.join(__dirname, '..', '..', 'nova.db');
    dbInstance = new Database(targetPath);
    dbInstance.pragma('journal_mode = WAL');
  } catch (err) {
    dbInstance = createInMemoryStore();
    return dbInstance;
  }

  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    dbInstance.exec(schema);
  }

  return dbInstance;
}

function createInMemoryStore() {
  const tables = {
    users: [],
    budget_categories: [],
    transactions: [],
    user_personas: [],
    merchant_profiles: [],
    action_audit_log: []
  };

  let autoInc = 1;

  return {
    isMemory: true,
    prepare(query) {
      return {
        all(...params) {
          if (query.includes('FROM budget_categories')) {
            const userId = params[0];
            return tables.budget_categories
              .filter(c => c.user_id === userId)
              .sort((a, b) => b.monthly_cap - a.monthly_cap);
          }
          if (query.includes('FROM transactions') && query.includes('GROUP BY category')) {
            const [userId, month] = params;
            const res = {};
            const counts = {};
            tables.transactions
              .filter(t => t.user_id === userId && (!month || (t.txn_date || '').startsWith(month)))
              .forEach(t => {
                res[t.category] = (res[t.category] || 0) + Number(t.amount);
                counts[t.category] = (counts[t.category] || 0) + 1;
              });
            return Object.entries(res).map(([category, spent]) => ({
              category,
              spent,
              total: spent,
              txn_count: counts[category]
            }));
          }
          if (query.includes('FROM transactions')) {
            const userId = params[0];
            return tables.transactions.filter(t => !userId || t.user_id === userId);
          }
          if (query.includes('FROM merchant_profiles')) {
            const userId = params[0];
            return tables.merchant_profiles.filter(m => m.user_id === userId);
          }
          return [];
        },
        get(...params) {
          if (query.includes('FROM users WHERE id = ?')) {
            const id = params[0];
            return tables.users.find(u => u.id === id) || {
              monthly_income: 75000,
              fixed_housing_expense: 25000,
              currency: '₹'
            };
          }
          if (query.includes('FROM user_personas WHERE user_id = ?')) {
            const id = params[0];
            return tables.user_personas.find(p => p.user_id === id) || {
              user_id: id,
              lifestyle_flexibility: 'moderate',
              priority_categories: '["Housing", "Healthcare", "Bills & Utilities"]',
              flexible_categories: '["Shopping & Lifestyle", "Food & Dining"]',
              target_savings_rate: 25.0
            };
          }
          if (query.includes('SELECT SUM(amount) as total FROM transactions')) {
            const [userId, cat, month] = params;
            const sum = tables.transactions
              .filter(t => t.user_id === userId && t.category === cat && (!month || (t.txn_date || '').startsWith(month)))
              .reduce((acc, t) => acc + Number(t.amount), 0);
            return { total: sum };
          }
          if (query.includes('FROM budget_categories WHERE user_id = ? AND category = ?')) {
            const [userId, cat] = params;
            return tables.budget_categories.find(c => c.user_id === userId && c.category === cat) || null;
          }
          if (query.includes('FROM transactions WHERE id = ?')) {
            const id = Number(params[0]);
            return tables.transactions.find(t => t.id === id) || null;
          }
          return null;
        },
        run(...params) {
          if (query.includes('INSERT INTO users')) {
            const [id, name, email, income, housing, currency] = params;
            const idx = tables.users.findIndex(u => u.id === id);
            const item = {
              id,
              name,
              email,
              monthly_income: Number(income),
              fixed_housing_expense: Number(housing),
              currency: currency || '₹'
            };
            if (idx >= 0) tables.users[idx] = item;
            else tables.users.push(item);
            return { changes: 1 };
          }
          if (query.includes('UPDATE budget_categories SET monthly_cap = ? WHERE user_id = ? AND category = ?')) {
            const [newCap, userId, cat] = params;
            const item = tables.budget_categories.find(c => c.user_id === userId && c.category === cat);
            if (item) item.monthly_cap = Number(newCap);
            return { changes: item ? 1 : 0 };
          }
          if (query.includes('UPDATE transactions') && query.includes('SET category = ?')) {
            const [newCat, newCatId, txId] = params;
            const tx = tables.transactions.find(t => t.id === Number(txId));
            if (tx) {
              tx.category = newCat;
              tx.category_id = newCatId;
              tx.categorization_status = 'SETTLED';
            }
            return { changes: tx ? 1 : 0 };
          }
          if (query.includes('UPDATE transactions') && query.includes("SET categorization_status = 'SETTLED'")) {
            const [txId] = params;
            const tx = tables.transactions.find(t => t.id === Number(txId));
            if (tx) tx.categorization_status = 'SETTLED';
            return { changes: tx ? 1 : 0 };
          }
          if (query.includes('INSERT INTO transactions')) {
            let userId, rawDesc, amount, cat, catId, catStatus, txnDate;
            if (params.length >= 7) {
              [userId, rawDesc, amount, cat, catId, catStatus, txnDate] = params;
            } else {
              [userId, rawDesc, amount, cat, txnDate] = params;
              catId = null;
              catStatus = 'SETTLED';
            }
            const newTx = {
              id: autoInc++,
              user_id: userId,
              raw_description: rawDesc,
              amount: Number(amount),
              category: cat,
              category_id: catId,
              categorization_status: catStatus || 'SETTLED',
              txn_type: 'debit',
              txn_date: txnDate || new Date().toISOString()
            };
            tables.transactions.unshift(newTx);
            return { lastInsertRowid: newTx.id, changes: 1 };
          }
          if (query.includes('INSERT INTO budget_categories')) {
            let userId, catId, cat, cap;
            if (params.length === 4) {
              [userId, catId, cat, cap] = params;
            } else {
              [userId, cat, cap] = params;
              catId = null;
            }
            const idx = tables.budget_categories.findIndex(c => c.user_id === userId && c.category === cat);
            if (idx >= 0) {
              tables.budget_categories[idx].monthly_cap = Number(cap);
              if (catId) tables.budget_categories[idx].category_id = catId;
            } else {
              tables.budget_categories.push({
                id: autoInc++,
                user_id: userId,
                category_id: catId,
                category: cat,
                monthly_cap: Number(cap)
              });
            }
            return { changes: 1 };
          }
          if (query.includes('DELETE FROM budget_categories')) {
            const [userId, cat] = params;
            const prevLen = tables.budget_categories.length;
            tables.budget_categories = tables.budget_categories.filter(
              c => !(c.user_id === userId && c.category === cat)
            );
            return { changes: prevLen - tables.budget_categories.length };
          }
          if (query.includes('INSERT INTO user_personas') || query.includes('INSERT OR REPLACE INTO user_personas')) {
            const [userId, flex, pri, flx, rate] = params;
            const idx = tables.user_personas.findIndex(p => p.user_id === userId);
            const item = {
              user_id: userId,
              lifestyle_flexibility: flex,
              priority_categories: pri,
              flexible_categories: flx,
              target_savings_rate: rate
            };
            if (idx >= 0) tables.user_personas[idx] = item;
            else tables.user_personas.push(item);
            return { changes: 1 };
          }
          if (query.includes('INSERT INTO merchant_profiles') || query.includes('INSERT OR REPLACE INTO merchant_profiles')) {
            const [userId, mName, cat, amt, freq, isSub] = params;
            const idx = tables.merchant_profiles.findIndex(
              m => m.user_id === userId && m.merchant_name === mName
            );
            const item = {
              id: autoInc++,
              user_id: userId,
              merchant_name: mName,
              category: cat,
              typical_amount: amt,
              frequency: freq,
              is_subscription: isSub,
              last_seen_date: new Date().toISOString()
            };
            if (idx >= 0) tables.merchant_profiles[idx] = item;
            else tables.merchant_profiles.push(item);
            return { changes: 1 };
          }
          return { changes: 1 };
        }
      };
    },
    exec() {},
    transaction(fn) {
      return (...args) => fn(...args);
    }
  };
}

module.exports = { getDb, createInMemoryStore };
