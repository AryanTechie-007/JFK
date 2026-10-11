/**
 * Snapshot Service (SC §7.1–§7.3, §17.3)
 * Creates and resolves immutable Snapshot@1 records pinning ledger, plan, profile, and rules versions.
 */

const db = require('../db');
const { newId, toCanonicalUserId } = require('../shared/ids');
const { ensureUserVersionsRow, syncLegacyTransactionsForUser } = require('../engines/categorizer');
const { syncUserStateFromLegacy } = require('./profile');

function getCurrentIstDateAndMonth(now = new Date()) {
  // IST is UTC + 05:30
  const istTime = new Date(now.getTime() + 5.5 * 3600 * 1000);
  const iso = istTime.toISOString();
  return {
    as_of: now.toISOString(),
    current_date_ist: iso.slice(0, 10),
    current_month_ist: iso.slice(0, 7),
  };
}

function currentVersions(userId) {
  syncUserStateFromLegacy(userId);
  syncLegacyTransactionsForUser(userId);
  const canonicalId = toCanonicalUserId(userId);
  const row = ensureUserVersionsRow(canonicalId);
  return {
    ledger_version: row.ledger_version,
    plan_version: row.plan_version,
    profile_version: row.profile_version,
    rules_version: row.rules_version,
  };
}

function createSnapshot(userId) {
  const canonicalId = toCanonicalUserId(userId);
  const versions = currentVersions(canonicalId);
  const { as_of, current_date_ist, current_month_ist } = getCurrentIstDateAndMonth();
  const snapshotId = newId('snap');

  const snapshot = {
    schema: 'Snapshot@1',
    snapshot_id: snapshotId,
    user_id: canonicalId,
    created_at: as_of,
    as_of,
    current_date_ist,
    current_month_ist,
    ledger_version: versions.ledger_version,
    plan_version: versions.plan_version,
    profile_version: versions.profile_version,
    rules_version: versions.rules_version,
    taxonomy_version: '1.0.0',
    sentinel_model_version: '5.0.0',
  };

  db.prepare(
    `INSERT INTO snapshots_v1 (
      snapshot_id, user_id, created_at, as_of, current_date_ist, current_month_ist,
      ledger_version, plan_version, profile_version, rules_version,
      taxonomy_version, sentinel_model_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    snapshot.snapshot_id,
    snapshot.user_id,
    snapshot.created_at,
    snapshot.as_of,
    snapshot.current_date_ist,
    snapshot.current_month_ist,
    snapshot.ledger_version,
    snapshot.plan_version,
    snapshot.profile_version,
    snapshot.rules_version,
    snapshot.taxonomy_version,
    snapshot.sentinel_model_version
  );

  return snapshot;
}

function getSnapshot(snapshotId) {
  if (!snapshotId) return null;
  const row = db
    .prepare('SELECT * FROM snapshots_v1 WHERE snapshot_id = ?')
    .get(snapshotId);
  if (!row) return null;
  return {
    schema: 'Snapshot@1',
    ...row,
  };
}

function bumpVersion(userId, domain = 'plan_version') {
  const canonicalId = toCanonicalUserId(userId);
  ensureUserVersionsRow(canonicalId);
  const allowedCols = new Set(['ledger_version', 'plan_version', 'profile_version', 'rules_version']);
  const col = allowedCols.has(domain) ? domain : 'plan_version';
  db.prepare(
    `UPDATE user_state_versions
     SET ${col} = ${col} + 1, last_updated_at = datetime('now')
     WHERE user_id = ?`
  ).run(canonicalId);
  return currentVersions(canonicalId);
}

module.exports = {
  getCurrentIstDateAndMonth,
  currentVersions,
  createSnapshot,
  getSnapshot,
  bumpVersion,
};
