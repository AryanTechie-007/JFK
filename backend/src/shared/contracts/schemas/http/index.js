/**
 * FinMate Workspace HTTP Response Schemas (WS-SEN-P2 Step 1)
 *
 * Export all workspace JSON Schemas and provides schema lookup helpers.
 */

const common = require('./common.json');
const atlas = require('./workspaces-atlas.json');
const nova = require('./workspaces-nova.json');
const iris = require('./workspaces-iris.json');
const sentinel = require('./workspaces-sentinel.json');
const john = require('./workspaces-john.json');

const SCHEMAS = Object.freeze({
  common,
  atlas,
  nova,
  iris,
  sentinel,
  john,
});

/**
 * Registry of endpoint routes to their schema definitions.
 */
const ROUTE_SCHEMAS = Object.freeze({
  'GET /api/v1/workspaces/atlas': atlas.$defs.AtlasWorkspaceResponse,
  'GET /api/v1/workspaces/atlas/archived': atlas.$defs.AtlasArchivedResponse,
  'POST /api/v1/workspaces/atlas/validate': atlas.$defs.AtlasValidateResponse,
  'POST /api/v1/workspaces/atlas/sip': atlas.$defs.AtlasSipResponse,

  'GET /api/v1/workspaces/nova': nova.$defs.NovaWorkspaceResponse,
  'POST /api/v1/workspaces/nova/validate-cap': nova.$defs.NovaValidateCapResponse,
  'POST /api/v1/workspaces/nova/rebalance': nova.$defs.NovaRebalanceResponse,

  'GET /api/v1/workspaces/iris': iris.$defs.IrisWorkspaceResponse,
  'POST /api/v1/workspaces/iris/simulate': iris.$defs.IrisSimulateResponse,

  'GET /api/v1/workspaces/sentinel': sentinel.$defs.SentinelAggregateResponse,
  'GET /api/v1/workspaces/sentinel/overview': sentinel.$defs.SentinelOverviewResponse,
  'GET /api/v1/workspaces/sentinel/spending': sentinel.$defs.SentinelSpendingResponse,
  'GET /api/v1/workspaces/sentinel/timeseries': sentinel.$defs.SentinelTimeseriesResponse,
  'GET /api/v1/workspaces/sentinel/forecast': sentinel.$defs.SentinelForecastResponse,

  'GET /api/v1/workspaces/john': john.$defs.JohnWorkspaceResponse,
});

function getSchemaForRoute(methodAndPath) {
  return ROUTE_SCHEMAS[methodAndPath] || null;
}

module.exports = {
  SCHEMAS,
  ROUTE_SCHEMAS,
  getSchemaForRoute,
};
