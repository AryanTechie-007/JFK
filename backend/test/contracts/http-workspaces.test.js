const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { setupTempDb } = require('../helpers/temp-db');
setupTempDb();

const { loadApp, signup, authed } = require('../helpers/app');
const { SCHEMAS, ROUTE_SCHEMAS, getSchemaForRoute } = require('../../src/shared/contracts/schemas/http');

describe('HTTP Workspace View Schemas (WS-SEN-P2)', () => {
  it('loads all workspace schema files without error', () => {
    assert.ok(SCHEMAS.common);
    assert.ok(SCHEMAS.atlas);
    assert.ok(SCHEMAS.nova);
    assert.ok(SCHEMAS.iris);
    assert.ok(SCHEMAS.sentinel);
    assert.ok(SCHEMAS.john);
  });

  it('declares valid draft 2020-12 schema IDs on all files', () => {
    for (const [name, schema] of Object.entries(SCHEMAS)) {
      assert.equal(
        schema.$schema,
        'https://json-schema.org/draft/2020-12/schema',
        `${name} must specify JSON Schema 2020-12`
      );
      assert.ok(schema.$id, `${name} must specify a schema $id`);
      assert.ok(schema.$defs, `${name} must contain $defs`);
    }
  });

  it('defines schemas for every workspace endpoint in the contract registry', () => {
    const expectedRoutes = [
      'GET /api/v1/workspaces/atlas',
      'GET /api/v1/workspaces/atlas/archived',
      'POST /api/v1/workspaces/atlas/validate',
      'POST /api/v1/workspaces/atlas/sip',
      'GET /api/v1/workspaces/nova',
      'POST /api/v1/workspaces/nova/validate-cap',
      'POST /api/v1/workspaces/nova/rebalance',
      'GET /api/v1/workspaces/iris',
      'POST /api/v1/workspaces/iris/simulate',
      'GET /api/v1/workspaces/sentinel',
      'GET /api/v1/workspaces/sentinel/overview',
      'GET /api/v1/workspaces/sentinel/spending',
      'GET /api/v1/workspaces/sentinel/timeseries',
      'GET /api/v1/workspaces/sentinel/forecast',
      'GET /api/v1/workspaces/john',
    ];

    for (const route of expectedRoutes) {
      const schema = getSchemaForRoute(route);
      assert.ok(schema, `Missing schema definition for ${route}`);
      assert.equal(schema.type, 'object', `Schema for ${route} must have type "object"`);
      assert.ok(Array.isArray(schema.required), `Schema for ${route} must specify required fields`);
      assert.ok(schema.properties, `Schema for ${route} must specify properties`);
    }
  });

  it('validates common entity schemas in common.json', () => {
    const commonDefs = SCHEMAS.common.$defs;
    assert.ok(commonDefs.Snapshot, 'Snapshot definition missing');
    assert.ok(commonDefs.DataQuality, 'DataQuality definition missing');
    assert.ok(commonDefs.SentinelResult, 'SentinelResult definition missing');
    assert.ok(commonDefs.Proposal, 'Proposal definition missing');
    assert.ok(commonDefs.ErrorBody, 'ErrorBody definition missing');

    // Check required fields for Snapshot@1 per SC §7.2
    const snapshotReq = commonDefs.Snapshot.required;
    assert.ok(snapshotReq.includes('snapshot_id'));
    assert.ok(snapshotReq.includes('as_of_date'));
    assert.ok(snapshotReq.includes('categorization_version'));
    assert.ok(snapshotReq.includes('plan_version'));
    assert.ok(snapshotReq.includes('balance_version'));
    assert.ok(snapshotReq.includes('model_version'));

    // Check required fields for DataQuality@1 per SC §8.1
    const dqReq = commonDefs.DataQuality.required;
    assert.ok(dqReq.includes('categorization_version'));
    assert.ok(dqReq.includes('coverage_by_amount_bp'));
    assert.ok(dqReq.includes('uncategorized_amount_minor'));
    assert.ok(dqReq.includes('complete'));

    // Check required fields for SentinelResult@1 per SC §10.2
    const srReq = commonDefs.SentinelResult.required;
    assert.ok(srReq.includes('tool_result_id'));
    assert.ok(srReq.includes('function'));
    assert.ok(srReq.includes('status'));
    assert.ok(srReq.includes('snapshot_id'));
    assert.ok(srReq.includes('data_quality'));
  });

  describe('Live Workspace HTTP Endpoints Schema Conformance', () => {
    let app;
    let client;

    before(async () => {
      app = loadApp();
      const user = await signup(app, { email: `contract_test_${Date.now()}@finmate.ai` });
      client = authed(app, user.token);
    });

    const routesToTest = [
      { method: 'get', path: '/api/v1/workspaces/john', routeKey: 'GET /api/v1/workspaces/john' },
      { method: 'get', path: '/api/v1/workspaces/atlas', routeKey: 'GET /api/v1/workspaces/atlas' },
      { method: 'get', path: '/api/v1/workspaces/nova', routeKey: 'GET /api/v1/workspaces/nova' },
      { method: 'get', path: '/api/v1/workspaces/iris', routeKey: 'GET /api/v1/workspaces/iris' },
      { method: 'get', path: '/api/v1/workspaces/sentinel', routeKey: 'GET /api/v1/workspaces/sentinel' },
      { method: 'get', path: '/api/v1/workspaces/sentinel/overview', routeKey: 'GET /api/v1/workspaces/sentinel/overview' },
      { method: 'get', path: '/api/v1/workspaces/sentinel/spending', routeKey: 'GET /api/v1/workspaces/sentinel/spending' },
      { method: 'get', path: '/api/v1/workspaces/sentinel/timeseries', routeKey: 'GET /api/v1/workspaces/sentinel/timeseries' },
      { method: 'get', path: '/api/v1/workspaces/sentinel/forecast', routeKey: 'GET /api/v1/workspaces/sentinel/forecast' },
    ];

    for (const r of routesToTest) {
      it(`serves ${r.routeKey} and conforms to schema`, async () => {
        const res = await client[r.method](r.path);
        assert.equal(res.status, 200, `Expected 200 OK for ${r.path}, got ${res.status}: ${res.text}`);
        assert.ok(res.body, `Expected JSON body for ${r.path}`);

        const schema = getSchemaForRoute(r.routeKey);
        assert.ok(schema, `Missing schema for ${r.routeKey}`);
        for (const reqField of schema.required) {
          assert.ok(
            reqField in res.body,
            `Response for ${r.routeKey} missing required property "${reqField}"`
          );
        }
      });
    }
  });
});
