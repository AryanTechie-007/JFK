const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { setupTempDb } = require('./helpers/temp-db');

const { dbPath, cleanup } = setupTempDb();

const db = require('../src/db');

test('temp DB helper points DB_PATH at a temp file, not backend/finmate.db', () => {
  assert.equal(process.env.DB_PATH, dbPath);
  assert.notEqual(
    path.resolve(dbPath),
    path.resolve(path.join(__dirname, '..', 'finmate.db'))
  );
});

test('temp DB helper uses the OS temp directory', () => {
  assert.ok(fs.existsSync(dbPath), 'temp DB file should exist');
  assert.ok(
    path.resolve(dbPath).startsWith(path.resolve(os.tmpdir())),
    'temp DB should live under the OS temp directory'
  );
});

test('the module-singleton db is backed by the temp DB file', () => {
  db.prepare('CREATE TABLE IF NOT EXISTS _temp_db_probe (id INTEGER PRIMARY KEY)').run();
  const probe = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_temp_db_probe'")
    .get();
  assert.ok(probe, 'schema created through the singleton must exist');
  assert.ok(fs.existsSync(dbPath), 'the temp DB file must be the one written to');
});

test('cleanup is exposed and is idempotent', () => {
  assert.equal(typeof cleanup, 'function');
  cleanup();
  cleanup();
});
