/**
 * IrisAgent — Forward-Looking Planning & Habit Specialist (Stateless Advisor)
 *
 * Implements Section 2, 3, 7 (Pattern B), 10, and 14:
 * - Never communicates directly with Nova (Star Topology).
 * - Receives `RECURRING_ANOMALY` hints placed by John into `TaskPacket@1.peer_findings`.
 * - Stored open alerts are also visible to Iris through Sentinel's anomaly/alert function.
 */

const TaskPacketV1 = require('../../contracts/TaskPacketV1');
const SpecialistResponseV1 = require('../../contracts/SpecialistResponseV1');
const { RESPONSE_STATUSES } = require('../../contracts/PlatformRules');
const { defaultAlertStore } = require('../../tools/threshold-job/AlertHygieneStore');

class IrisAgent {
  static invoke(packet) {
    TaskPacketV1.validate(packet);

    const recurringHints = (packet.peer_findings || []).filter(
      h => h.type === 'RECURRING_ANOMALY'
    );
    const openAlerts = defaultAlertStore.getOpenAlerts();

    return SpecialistResponseV1.build({
      status: RESPONSE_STATUSES.OK,
      findings: recurringHints.map((h, idx) => ({
        statement: `Next-month forecast incorporates recurring anomaly in ${h.merchant || 'subscription'} (+₹{{delta_amount}}/month).`,
        rendered_statement: `Next-month forecast incorporates recurring anomaly in ${h.merchant || 'subscription'} (+₹${Number(h.delta || 0).toLocaleString()}/month).`,
        bindings: {
          delta_amount: {
            placeholder: '{{delta_amount}}',
            value: Number(h.delta || 0),
            formatted: Number(h.delta || 0).toLocaleString(),
            tool_result_id: h.tool_result_id || `res_iris_${idx}`
          }
        },
        tool_result_id: h.tool_result_id || `res_iris_${idx}`
      })),
      boundary_alerts: openAlerts.map(a => ({
        alert_id: a.alert_id,
        category: a.category,
        tier: a.tier,
        provisional: Boolean(a.provisional),
        tool_result_id: a.tool_result_id
      })),
      confidence: 'high',
      tool_result_ids: recurringHints.map(h => h.tool_result_id).filter(Boolean)
    });
  }
}

module.exports = IrisAgent;
