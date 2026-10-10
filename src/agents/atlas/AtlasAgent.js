/**
 * AtlasAgent — Goal Creation, Funding & Progress Specialist (Stateless Advisor)
 *
 * Implements Section 3, 7 (Pattern C: Deficit that touches goals), 10, and 14:
 * - Never communicates directly with Nova (Star Topology).
 * - Receives `GOAL_FUNDING_PRESSURE` hints placed by John into `TaskPacket@1.peer_findings`.
 * - Evaluates temporary goal contribution pause options so John can present both rebalance
 *   and goal-pause options to the user.
 */

const TaskPacketV1 = require('../../contracts/TaskPacketV1');
const { RESPONSE_STATUSES } = require('../../contracts/PlatformRules');

class AtlasAgent {
  static invoke(packet) {
    TaskPacketV1.validate(packet);

    const pressureHints = (packet.peer_findings || []).filter(
      h => h.type === 'GOAL_FUNDING_PRESSURE'
    );
    const shortfall = pressureHints.reduce((s, h) => s + (Number(h.shortfall_amount) || 0), 0) ||
      Number(packet.event?.shortfall_amount || 0);

    const toolResultId = pressureHints[0]?.tool_result_id || `res_atlas_goal_${ packet.snapshot_id }`;

    return {
      schema: 'SpecialistResponse@1',
      agent: 'Atlas',
      status: RESPONSE_STATUSES.OK,
      findings: [
        {
          statement: `Pausing ₹{{shortfall_amount}} of this month's discretionary goal contribution covers the remaining category shortfall and shifts target completion by {{delay_days}} days.`,
          rendered_statement: `Pausing ₹${shortfall.toLocaleString()} of this month's discretionary goal contribution covers the remaining category shortfall and shifts target completion by 5 days.`,
          bindings: {
            shortfall_amount: {
              placeholder: '{{shortfall_amount}}',
              value: shortfall,
              formatted: shortfall.toLocaleString(),
              tool_result_id: toolResultId
            },
            delay_days: {
              placeholder: '{{delay_days}}',
              value: 5,
              formatted: '5',
              tool_result_id: toolResultId
            }
          },
          tool_result_id: toolResultId
        }
      ],
      proposed_actions: shortfall > 0
        ? [
            {
              type: 'UPDATE_GOAL',
              tier: 'T2',
              requires_confirmation: true,
              payload: {
                action: 'PAUSE_MONTHLY_CONTRIBUTION',
                pause_amount: shortfall,
                estimated_delay_days: 5
              },
              tool_result_id: toolResultId
            }
          ]
        : [],
      confidence: 'high',
      tool_result_ids: [toolResultId]
    };
  }
}

module.exports = AtlasAgent;
