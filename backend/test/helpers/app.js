/**
 * Test helper: load the Express app against the current temporary DB and issue
 * HTTP requests with node:http (no new dependency, no supertest).
 *
 * Usage:
 *   const { setupTempDb } = require('./helpers/temp-db');
 *   setupTempDb();                                   // before any src require
 *   const { loadApp, createUser, signup, authed } = require('./helpers/app');
 *   const app = loadApp();
 */

const http = require('http');

function loadApp() {
  process.env.JWT_SECRET = 'test-secret';
  process.env.NODE_ENV = 'test';
  return require('../../src/index');
}

function startServer(app) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function stopServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

/**
 * Minimal request helper: boots the app on an ephemeral port, sends one request
 * and returns { status, headers, body, text }.
 */
async function request(app, method, path, { body, token, headers = {} } = {}) {
  const server = await startServer(app);
  try {
    const { port } = server.address();
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const requestHeaders = { ...headers };
    if (payload) {
      requestHeaders['Content-Type'] = 'application/json';
      requestHeaders['Content-Length'] = String(payload.length);
    }
    if (token) requestHeaders.Authorization = 'Bearer ' + token;

    return await new Promise((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port, method, path, headers: requestHeaders },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            let parsed = null;
            try {
              parsed = text ? JSON.parse(text) : null;
            } catch (err) {
              parsed = null;
            }
            resolve({ status: res.statusCode, headers: res.headers, body: parsed, text });
          });
        }
      );
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  } finally {
    await stopServer(server);
  }
}

let userCounter = 0;

/**
 * Sign a user up through POST /api/auth/signup and return { userId, token, email }.
 */
async function signup(app, user = {}) {
  userCounter += 1;
  const email = user.email || 'testuser' + userCounter + '@finmate.test';
  const password = user.password || 'test-password-123';
  const res = await request(app, 'POST', '/api/auth/signup', {
    body: { name: user.name || 'Test User', email, password },
  });
  if (res.status !== 201) {
    throw new Error('signup failed: ' + res.status + ' ' + res.text);
  }
  return { userId: res.body.user.id, token: res.body.token, email, password };
}

/**
 * Alias kept for the plan's test-helper contract wording.
 */
async function createUser(app, user = {}) {
  const created = await signup(app, user);
  return { userId: created.userId, token: created.token };
}

/**
 * Supertest-like client bound to one app + token: { get, post, del }.
 */
function authed(app, token) {
  const call = (method) => (path, options = {}) =>
    request(app, method, path, { token, ...options });
  return {
    get: call('GET'),
    post: call('POST'),
    del: call('DELETE'),
    request: (method, path, options = {}) => request(app, method, path, { token, ...options }),
  };
}

module.exports = { loadApp, request, signup, createUser, authed };
