/**
 * Sentinel v5.0 Parameter Registry & Model Version (Sentinel §B.3, §C.4)
 */

const { DEFAULT_MODEL_VERSION, getRegistry, listAvailableModelVersions } = require('./registry');

const MODEL_VERSION = DEFAULT_MODEL_VERSION;
const SENTINEL_PARAMS = getRegistry(MODEL_VERSION);

module.exports = {
  MODEL_VERSION,
  SENTINEL_PARAMS,
  getRegistry,
  listAvailableModelVersions,
};
