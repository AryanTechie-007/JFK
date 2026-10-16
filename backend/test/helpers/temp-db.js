/**
 * Test helper: isolated temporary SQLite database per test file.
 *
 * The module-singleton backend/src/db.js reads DB_PATH at require time, so this
 * helper MUST be the first require in a test file, before any src module:
 *
 *   const { setupTempDb } = require('./helpers/temp-db');
 *   setupTempDb();
 *   const app = require('./helpers/app').loadApp();
 *
 * Each node --test worker runs one test file per process, so a fresh file per
 * helper instance is safe and no test ever touches backend/finmate.db.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

let current = null;

/**
 * Create (once) a temp DB path, point DB_PATH at it and register cleanup.
 * @returns {{ dbPath: string, cleanup: () => void }}
 */
function setupTempDb() {
  if (current && fs.existsSync(current.dbPath)) return current;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finmate-'));
  const dbPath = path.join(dir, 'finmate-test.db');
  process.env.DB_PATH = dbPath;

  const cleanup = () => {
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
      try {
        fs.rmSync(dbPath + suffix, { force: true });
      } catch (err) {
        // Best effort: temp dir is under the OS temp root and CI is ephemeral.
      }
    }
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (err) {
      // Ignore: locked files on Windows are released when the process exits.
    }
  };

  process.on('exit', cleanup);
  current = { dbPath, cleanup };
  return current;
}

module.exports = { setupTempDb };
