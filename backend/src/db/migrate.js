'use strict';

// WS-FND-P2 migration runner (plan-002-migrations-and-schema-gaps.md §5).
//
// Contract:
//   migrate(rawDb) -> { applied: string[] }
//   - applies every *.sql file in backend/src/db/migrations/ exactly once, in lexical order
//   - records (id, sha-256 checksum, applied_at) in the schema_migrations metadata table
//   - is idempotent: a second run applies nothing
//   - throws MIGRATION_CHECKSUM_MISMATCH when a recorded file's content changed
//   - throws MIGRATION_FILE_MISSING when a recorded id has no file (else a deleted
//     migration would silently be reapplied on the next database)
//   - wraps each file in its own transaction so a failing migration leaves no half-applied
//     schema behind
//
// Migration files are immutable once merged: numbering ranges are owned per workstream
// (0xx FND, 1xx CAT, 2xx SEN, 3xx PLT, 4xx AGT, 5xx JON) and are never edited after merge.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const METADATA_TABLE = 'schema_migrations';

const CREATE_METADATA_TABLE = `CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

function sha256(text) {
  return crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

function listMigrationFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function readMigration(dir, id) {
  const sql = fs.readFileSync(path.join(dir, id), 'utf8');
  return { id, sql, checksum: sha256(sql) };
}

function rollbackQuietly(raw) {
  try {
    raw.exec('ROLLBACK');
  } catch (_) {
    // The transaction was already closed by SQLite (for example after an I/O error);
    // the original failure is the one worth reporting.
  }
}

function runMigrations(raw, dir = MIGRATIONS_DIR) {
  raw.exec(CREATE_METADATA_TABLE);

  const recorded = new Map(
    raw
      .prepare(`SELECT id, checksum FROM ${METADATA_TABLE}`)
      .all()
      .map((row) => [row.id, row.checksum])
  );

  const files = listMigrationFiles(dir);
  const onDisk = new Set(files);

  for (const id of recorded.keys()) {
    if (!onDisk.has(id)) {
      throw new Error(
        `MIGRATION_FILE_MISSING: ${id} is recorded in ${METADATA_TABLE} but no migration file exists in ${dir}`
      );
    }
  }

  const applied = [];
  for (const id of files) {
    const migration = readMigration(dir, id);
    const known = recorded.get(id);

    if (known !== undefined) {
      if (known !== migration.checksum) {
        throw new Error(
          `MIGRATION_CHECKSUM_MISMATCH: ${id} was applied with checksum ${known} but the file now has ${migration.checksum}`
        );
      }
      continue;
    }

    raw.exec('BEGIN IMMEDIATE');
    try {
      raw.exec(migration.sql);
      raw
        .prepare(`INSERT INTO ${METADATA_TABLE} (id, checksum) VALUES (?, ?)`)
        .run(id, migration.checksum);
      raw.exec('COMMIT');
    } catch (error) {
      rollbackQuietly(raw);
      throw error;
    }
    applied.push(id);
  }

  return { applied };
}

function migrate(raw) {
  return runMigrations(raw);
}

module.exports = { migrate, runMigrations, sha256, MIGRATIONS_DIR };
