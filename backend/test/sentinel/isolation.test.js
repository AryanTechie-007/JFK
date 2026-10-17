const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupTempDb } = require('../helpers/temp-db');
const { DatabaseSync } = require('node:sqlite');
const { callSentinel } = require('../../src/engines/sentinel');
const { createSnapshot } = require('../../src/platform/snapshot');

describe('SEN-AC-03 & SEN-AC-10: Sentinel Isolation & Identity Parameter Guards', () => {
  let cleanup;
  let tempDbPath;

  before(() => {
    const res = setupTempDb();
    cleanup = res.cleanup;
    tempDbPath = res.dbPath;

    // Seed two distinct users in temp DB
    const db = new DatabaseSync(tempDbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        name TEXT,
        password_hash TEXT,
        currency TEXT DEFAULT '₹',
        monthly_income INT DEFAULT 10000000,
        fixed_housing_expense INT DEFAULT 2000000
      );
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        account_id TEXT,
        amount INT,
        currency TEXT,
        category TEXT,
        merchant TEXT,
        date TEXT,
        description TEXT,
        is_pending INT DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS snapshots (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        created_at TEXT,
        ledger_version INT,
        plan_version INT,
        balance_version INT,
        categorization_version INT,
        data_quality_json TEXT,
        profile_json TEXT
      );
    `);

    db.prepare("INSERT INTO users (id, email, name) VALUES ('u_alice', 'alice@test.com', 'Alice')").run();
    db.prepare("INSERT INTO users (id, email, name) VALUES ('u_bob', 'bob@test.com', 'Bob')").run();

    // Alice transaction
    db.prepare(`
      INSERT INTO transactions (id, user_id, amount, category, date, description)
      VALUES ('t_alice_1', 'u_alice', 50000, 'FOOD', '2026-10-01', 'Alice Cafe')
    `).run();

    // Bob transaction
    db.prepare(`
      INSERT INTO transactions (id, user_id, amount, category, date, description)
      VALUES ('t_bob_1', 'u_bob', 120000, 'TECH', '2026-10-02', 'Bob Laptop')
    `).run();

    db.close();
  });

  after(() => {
    if (cleanup) cleanup();
  });

  test('SEN-AC-03: rejects identity parameter user_id in args', () => {
    const snap = createSnapshot('u_alice');
    assert.throws(
      () => {
        callSentinel('sentinel_get_ledger_summary', 'u_alice', snap, { user_id: 'u_alice' });
      },
      /Identity parameters.*prohibited/i
    );
  });

  test('SEN-AC-03: rejects identity parameter tenant_id in args', () => {
    const snap = createSnapshot('u_alice');
    assert.throws(
      () => {
        callSentinel('sentinel_get_ledger_summary', 'u_alice', snap, { tenant_id: 'tenant_123' });
      },
      /Identity parameters.*prohibited/i
    );
  });

  test('SEN-AC-10: Alice cannot access Bob transactions via Sentinel', () => {
    const snapAlice = createSnapshot('u_alice');
    const result = callSentinel('sentinel_get_ledger_summary', 'u_alice', snapAlice, {});
    assert.equal(result.status, 'OK');
    assert.ok(result.data);
    // Alice spend should only reflect Alice's data, never Bob's
    assert.notEqual(result.data.total_spend_minor, 120000);
  });
});
