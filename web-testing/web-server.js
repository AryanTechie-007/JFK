/**
 * FinMate AI — Website Testing Runner & Server (web-testing/web-server.js)
 * ------------------------------------------------------------------------
 * Houses the website hosting and live browser-testing logic so developers can test
 * their agent/tool branch in the browser before promoting to the Electron Desktop App.
 */
const path = require('path');
const { spawn } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');

// 1. Start the Nova V4 API Server on port 4001
const novaApp = require(path.join(ROOT_DIR, 'src', 'index.js'));
const NOVA_PORT = process.env.NOVA_PORT || 4001;

const server = novaApp.listen(NOVA_PORT, () => {
  console.log(`[Web-Testing] Nova V4 API Server active at http://localhost:${NOVA_PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`[Web-Testing] Nova V4 API Server already running on port ${NOVA_PORT}`);
  } else {
    console.error('[Web-Testing] API Server error:', err.message);
  }
});

// 2. Launch Vite Website Dev Server for Browser Testing
console.log('[Web-Testing] Starting Vite Web Testing Server on http://localhost:5173 ...');
const viteBin = path.join(ROOT_DIR, 'node_modules', 'vite', 'bin', 'vite.js');
const viteProc = spawn(
  process.execPath,
  [viteBin, '--config', path.join(__dirname, 'vite.web.config.js'), '--open'],
  { cwd: ROOT_DIR, stdio: 'inherit' }
);

viteProc.on('close', (code) => {
  try {
    server.close();
  } catch (_) {
    // ignore
  }
  process.exit(code || 0);
});
