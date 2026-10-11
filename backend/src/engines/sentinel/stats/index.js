/**
 * Sentinel Stats Module Index (§K.1)
 */

const math = require('./math');
const cadence = require('./cadence');
const bands = require('./bands');

module.exports = {
  ...math,
  ...cadence,
  ...bands,
};
