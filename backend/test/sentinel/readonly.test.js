const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { setupTempDb } = require('../helpers/temp-db');
const { getReadOnlyDb } = require('../../src/engines/sentinel/connection');

describe('SEN-AC-05: Sentinel Read-Only Connection Enforcement', () => {
  let cleanup;
  let tempDbPath;

  before(() => {
    const res = setupTempDb();
    cleanup = res.cleanup;
    tempDbPath = res.dbPath;

    // Initialize test table using write connection
    const writeDb = new DatabaseSync(tempDbPath);
    writeDb.exec('CREATE TABLE test_data (id TEXT PRIMARY KEY, value INT);');
    writeDb.prepare("INSERT INTO test_data (id, value) VALUES ('init_1', 100)").run();
    writeDb.close();
  });

  after(() => {
    if (cleanup) cleanup();
  });

  test('allows SELECT queries on read-only connection', () => {
    const db = getReadOnlyDb(tempDbPath);
    const rows = db.prepare('SELECT * FROM test_data').all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'init_1');
    assert.equal(rows[0].value, 100);
    db.close();
  });

  test('throws error on INSERT through read-only connection', () => {
    const db = getReadOnlyDb(tempDbPath);
    assert.throws(
      () => {
        db.prepare("INSERT INTO test_data (id, value) VALUES ('new_1', 200)").run();
      },
      /attempt to write a readonly database|readonly/i
    );
    db.close();
  });

  test('throws error on UPDATE through read-only connection', () => {
    const db = getReadOnlyDb(tempDbPath);
    assert.throws(
      () => {
        db.prepare("UPDATE test_data SET value = 999 WHERE id = 'init_1'").run();
      },
      /attempt to write a readonly database|readonly/i
    );
    db.close();
  });

  test('throws error on DELETE through read-only connection', () => {
    const db = getReadOnlyDb(tempDbPath);
    assert.throws(
      () => {
        db.prepare("DELETE FROM test_data WHERE id = 'init_1'").run();
      },
      /attempt to write a readonly database|readonly/i
    );
    db.close();
  });
});
