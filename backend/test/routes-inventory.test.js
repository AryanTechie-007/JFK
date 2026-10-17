/**
 * Route inventory contract (WS-FND-P1 step 7).
 *
 * The 25 /api/v1 method/path pairs below are frozen from baseline.md Appendix A.
 * Every PR that adds, removes or renames a route updates this list in the same PR
 * (README "Global rules for every plan"; workstream-assignments.md section 5), so
 * later plans change the surface on purpose and never by accident.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { setupTempDb } = require('./helpers/temp-db');
setupTempDb();

const { loadApp } = require('./helpers/app');

const EXPECTED_V1_ROUTES = [
  'POST /chat',
  'POST /actions/propose',
  'POST /actions/execute',
  'POST /actions/:id/undo',
  'GET /actions/history',
  'GET /workspaces/john',
  'GET /workspaces/atlas',
  'GET /workspaces/atlas/archived',
  'POST /workspaces/atlas/validate',
  'POST /workspaces/atlas/sip',
  'GET /workspaces/nova',
  'POST /workspaces/nova/validate-cap',
  'POST /workspaces/nova/rebalance',
  'GET /workspaces/iris',
  'POST /workspaces/iris/simulate',
  'GET /workspaces/sentinel',
  'GET /workspaces/sentinel/overview',
  'GET /workspaces/sentinel/spending',
  'GET /workspaces/sentinel/timeseries',
  'GET /workspaces/sentinel/forecast',
  'GET /categorizer/status',
  'GET /categorizer/taxonomy',
  'GET /categorizer/review-queue',
  'POST /ingest/batch',
  'POST /ingest/manual',
  'GET /settings',
  'GET /settings/category-rules',
  'GET /settings/memory-facts',
  'POST /memory/facts',
  'DELETE /memory/facts/:fact_id',
];

const DOMAIN_ROUTERS = [
  'system',
  'chat',
  'actions',
  'workspaces-john',
  'workspaces-atlas',
  'workspaces-nova',
  'workspaces-iris',
  'workspaces-sentinel',
  'categorizer',
  'ingest',
  'settings',
];

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const V1 = '/api/v1';

/** Walk an Express router stack and collect every routable "METHOD path" pair. */
function collectRoutes(stack, prefix) {
  const found = [];
  for (const layer of stack) {
    if (layer.route) {
      const routePath = prefix + layer.route.path;
      for (const method of METHODS) {
        if (layer.route.methods[method]) found.push(method.toUpperCase() + ' ' + routePath);
      }
      continue;
    }
    if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      found.push(...collectRoutes(layer.handle.stack, prefix));
    }
  }
  return found;
}

/** Extract the mount path from an Express 4 nested-router layer regexp source. */
function mountPathOf(layer) {
  const source = layer.regexp && layer.regexp.source;
  if (!source) return '';
  let body = source;
  if (body.charAt(0) === '^') body = body.slice(1);
  const anchor = body.indexOf('/?(?=');
  if (anchor !== -1) body = body.slice(0, anchor);
  return body.split('\\').join('');
}

/** Every "METHOD path" the app can route, including nested routers. */
function appRoutes(app) {
  const found = [];
  const walk = (stack, prefix) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const method of METHODS) {
          if (layer.route.methods[method]) {
            found.push(method.toUpperCase() + ' ' + prefix + layer.route.path);
          }
        }
        continue;
      }
      if (layer.name === 'router' && layer.handle && layer.handle.stack) {
        walk(layer.handle.stack, prefix + mountPathOf(layer));
      }
    }
  };
  walk(app._router.stack, '');
  return found;
}

/** The /api/v1 surface as bare "METHOD /path" pairs (the inventory contract). */
function v1Surface(app) {
  return appRoutes(app)
    .filter((pair) => pair.split(' ')[1].startsWith(V1 + '/'))
    .map((pair) => {
      const parts = pair.split(' ');
      let routePath = parts[1].slice(V1.length);
      if (routePath.length > 1 && routePath.endsWith('/')) routePath = routePath.slice(0, -1);
      return parts[0] + ' ' + routePath;
    })
    .sort();
}

/** Routes declared by one domain router file, mounted at /api/v1. */
function domainRoutes(domain) {
  const router = require('../src/routes/v1/' + domain);
  return collectRoutes(router.stack, V1);
}

test('the /api/v1 surface is exactly the frozen method/path pairs', () => {
  const app = loadApp();
  assert.deepEqual(v1Surface(app), [...EXPECTED_V1_ROUTES].sort());
  assert.equal(v1Surface(app).length, EXPECTED_V1_ROUTES.length);
});

test('every expected route is reachable through the mounted app (no dropped wiring)', () => {
  const app = loadApp();
  const mounted = new Set(v1Surface(app));
  for (const pair of EXPECTED_V1_ROUTES) {
    assert.ok(mounted.has(pair), 'missing route: ' + pair);
  }
});

test('domain routers together declare the frozen surface exactly once', () => {
  const collected = DOMAIN_ROUTERS.flatMap((domain) => domainRoutes(domain))
    .map((pair) => pair.split(' ')[0] + ' ' + pair.split(' ')[1].slice(V1.length))
    .sort();
  assert.deepEqual(collected, [...EXPECTED_V1_ROUTES].sort());
});

test('index.js wires every domain router and defines no handlers', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'routes', 'v1', 'index.js'),
    'utf8'
  );
  for (const domain of DOMAIN_ROUTERS) {
    assert.ok(
      source.includes("router.use(require('./" + domain + "'))"),
      'missing wiring: ' + domain
    );
  }
  assert.equal((source.match(/^router\.(get|post|put|delete|patch)\(/gm) || []).length, 0);
});
