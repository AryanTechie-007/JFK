/**
 * Sentinel Read-Only Database Connection (S-12, SEN-AC-05).
 * 
 * Enforces PRAGMA query_only = ON to guarantee Sentinel is strictly a read-only observer.
 * Any write attempt (INSERT, UPDATE, DELETE, DROP) through this connection throws an error.
 */

const path = require('path');
const { DatabaseSync } = require('node:sqlite');

function getReadOnlyDb(customPath) {
  const dbPath = customPath || process.env.DB_PATH || path.join(__dirname, '..', '..', '..', 'finmate.db');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA query_only = ON;');
  return db;
}

const sentinelDb = getReadOnlyDb();

module.exports = {
  getReadOnlyDb,
  sentinelDb,
};
