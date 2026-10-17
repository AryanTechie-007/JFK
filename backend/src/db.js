/**
 * SQLite connection backed by Node's built-in `node:sqlite` module.
 * Supports both legacy tables and authoritative v1 specification tables (SC §5–§17).
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

function normalizeParams(params) {
  return params.map((value) => {
    if (value === undefined) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (value instanceof Date) return value.toISOString();
    return value;
  });
}

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

  pragma(statement) {
    return this._db.prepare(`PRAGMA ${statement}`).all();
  }

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

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 2000');

const { migrate } = require('./db/migrate');

// The schema is owned by the versioned migrations in backend/src/db/migrations.
// 000_baseline.sql reproduces the CREATE TABLE block that used to live here verbatim,
// so a database created by the older code opens unchanged (WS-FND-P2 §5).
migrate(raw);

// Startup integrity check (S-14 in docs/prototype-design/05-security-and-reliability.md).
// Two distinct invariants:
//   1. PRAGMA integrity_check must return exactly 'ok'; a corrupt or unreadable database
//      is never served, in any environment.
//   2. Every version counter must be at least the highest row version it stamps
//      (Doc 2 §3.6: counters only increase). The row-version columns are the ones the
//      source baseline has: transactions_v1.categorized_version and
//      categorization_history.version for the ledger, goals_v1.version and
//      caps_v1.version for the plan, user_profiles_v1.version and
//      declared_bills_v1.version for the profile, category_rules.version for the rules.
//      A violation is a development warning, a hard failure under NODE_ENV=test, and a
//      hard failure in production (plan-002-migrations-and-schema-gaps.md §6 step 8).
const COUNTER_ROW_VERSIONS = [
  {
    counter: 'ledger_version',
    refs: [
      ['transactions_v1', 'categorized_version'],
      ['categorization_history', 'version'],
    ],
  },
  {
    counter: 'plan_version',
    refs: [
      ['goals_v1', 'version'],
      ['caps_v1', 'version'],
    ],
  },
  {
    counter: 'profile_version',
    refs: [
      ['user_profiles_v1', 'version'],
      ['declared_bills_v1', 'version'],
    ],
  },
  {
    counter: 'rules_version',
    refs: [['category_rules', 'version']],
  },
];

function currentEnvironment() {
  const env = process.env.NODE_ENV;
  if (env === 'test' || env === 'production' || env === 'development') return env;
  return 'development';
}

function assertIntegrity(rawDb) {
  let rows;
  try {
    rows = rawDb.prepare('PRAGMA integrity_check').all();
  } catch (error) {
    throw new Error(
      'STARTUP_INTEGRITY_CHECK_FAILED: PRAGMA integrity_check could not run: ' + error.message
    );
  }
  const results = rows.map((row) => Object.values(row)[0]);
  if (results.length !== 1 || results[0] !== 'ok') {
    throw new Error(
      'STARTUP_INTEGRITY_CHECK_FAILED: PRAGMA integrity_check returned ' + JSON.stringify(results)
    );
  }

  const violations = [];
  const users = rawDb
    .prepare(
      'SELECT user_id, ledger_version, plan_version, profile_version, rules_version FROM user_state_versions'
    )
    .all();
  for (const user of users) {
    for (const { counter, refs } of COUNTER_ROW_VERSIONS) {
      const counterValue = Number(user[counter]);
      let maxRowVersion = 0;
      for (const [table, column] of refs) {
        const row = rawDb
          .prepare('SELECT MAX(' + column + ') AS max_version FROM ' + table + ' WHERE user_id = ?')
          .get(user.user_id);
        const value =
          row && row.max_version !== null && row.max_version !== undefined
            ? Number(row.max_version)
            : 0;
        if (value > maxRowVersion) maxRowVersion = value;
      }
      if (maxRowVersion > counterValue) {
        violations.push(
          user.user_id + ': ' + counter + '=' + counterValue + ' but a row version is ' + maxRowVersion
        );
      }
    }
  }

  if (violations.length === 0) return;

  const message = 'VERSION_COUNTER_INCONSISTENT: ' + violations.join('; ');
  const env = currentEnvironment();
  if (env === 'development') {
    console.warn('[db] ' + message + ' (development: continuing)');
    return;
  }
  if (env === 'production') console.error('[db] ' + message);
  throw new Error(message);
}

assertIntegrity(raw);

module.exports = db;
