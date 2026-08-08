/**
 * SQLite connection backed by Node's built-in `node:sqlite` module.
 *
 * Why not better-sqlite3: it is a native addon, so on a Node version with no
 * matching prebuilt binary npm falls back to compiling from source, which needs
 * Python + a C++ toolchain. `node:sqlite` ships inside Node itself — nothing to
 * download, nothing to compile, works on Windows out of the box.
 *
 * Requires Node.js >= 22.5.0. Unflagged from Node 23.4.0 onward (so v24.x is fine).
 *
 * This module deliberately exposes the same surface the rest of the codebase
 * already calls — prepare() / exec() / pragma() / transaction() and the
 * statement methods run() / get() / all() — so no route file needed changing.
 */

const path = require('path');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (err) {
  console.error(
    `\nFinMate backend needs Node.js >= 22.5.0 for the built-in node:sqlite module.\n` +
      `You are running ${process.version}. Please upgrade Node.js.\n`
  );
  throw err;
}

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'finmate.db');

const raw = new DatabaseSync(DB_PATH);

/**
 * node:sqlite only accepts null / number / bigint / string / Uint8Array as bound
 * values. better-sqlite3 rejected undefined and booleans too, so nothing in this
 * codebase relied on them — we normalise instead of throwing so a missing
 * optional field can't turn into a 500.
 */
function normalizeParams(params) {
  return params.map((value) => {
    if (value === undefined) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value instanceof Date) return value.toISOString();
    return value;
  });
}

// lastInsertRowid / changes come back as number here, but can widen to BigInt on
// very large tables. Callers expect plain numbers.
function toNumber(value) {
  return typeof value === 'bigint' ? Number(value) : value;
}

class Statement {
  constructor(stmt) {
    this._stmt = stmt;
  }

  run(...params) {
    const result = this._stmt.run(...normalizeParams(params));
    return {
      changes: toNumber(result.changes),
      lastInsertRowid: toNumber(result.lastInsertRowid),
    };
  }

  get(...params) {
    return this._stmt.get(...normalizeParams(params));
  }

  all(...params) {
    return this._stmt.all(...normalizeParams(params));
  }
}

class Db {
  constructor(database) {
    this._db = database;
    this._txDepth = 0;
  }

  prepare(sql) {
    return new Statement(this._db.prepare(sql));
  }

  exec(sql) {
    return this._db.exec(sql);
  }

  /** better-sqlite3-style: pragma('journal_mode = WAL') */
  pragma(statement) {
    return this._db.prepare(`PRAGMA ${statement}`).all();
  }

  /**
   * better-sqlite3-style: db.transaction(fn) returns a callable that runs fn
   * inside BEGIN/COMMIT, rolling back if it throws. Nested calls use SAVEPOINTs.
   */
  transaction(fn) {
    const self = this;
    return function transactionRunner(...args) {
      const nested = self._txDepth > 0;
      const savepoint = `sp_${self._txDepth}`;

      self._db.exec(nested ? `SAVEPOINT ${savepoint}` : 'BEGIN');
      self._txDepth++;

      try {
        const result = fn.apply(this, args);
        self._txDepth--;
        self._db.exec(nested ? `RELEASE ${savepoint}` : 'COMMIT');
        return result;
      } catch (err) {
        self._txDepth--;
        try {
          self._db.exec(nested ? `ROLLBACK TO ${savepoint}` : 'ROLLBACK');
        } catch (rollbackErr) {
          console.error('Rollback failed:', rollbackErr);
        }
        throw err;
      }
    };
  }

  close() {
    return this._db.close();
  }
}

const db = new Db(raw);

// WAL keeps reads from blocking writes and survives restarts, same as before.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  occupation TEXT,
  monthly_income REAL DEFAULT 0,
  fixed_housing_expense REAL DEFAULT 0,
  risk_strategy TEXT DEFAULT 'balanced', -- conservative | balanced | aggressive
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount REAL NOT NULL,
  saved_amount REAL DEFAULT 0,
  monthly_allocation REAL DEFAULT 0,
  priority TEXT DEFAULT 'medium', -- low | medium | high
  status TEXT DEFAULT 'active',   -- active | completed | declined
  source TEXT DEFAULT 'user',     -- user | john_proposal
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS budget_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  monthly_cap REAL NOT NULL,
  UNIQUE(user_id, category)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  raw_description TEXT NOT NULL,
  amount REAL NOT NULL,
  category TEXT NOT NULL DEFAULT 'Uncategorized',
  txn_date TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS upcoming_bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  amount REAL NOT NULL,
  due_date TEXT NOT NULL,
  is_paid INTEGER DEFAULT 0
);
`);

module.exports = db;
