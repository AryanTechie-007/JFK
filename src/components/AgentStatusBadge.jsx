import React from 'react';
import { AGENTS } from '../data/mockFinancialData';

export default function AgentStatusBadge({ agentId, showStatus = true }) {
  const agent = AGENTS[agentId] || AGENTS.john;
  
  return (
    <div className={`badge ${agent.badgeClass}`}>
      <span>{agent.avatar}</span>
      <span>{agent.name}</span>
      {showStatus && (
        <span style={{ opacity: 0.8, fontSize: '10px', marginLeft: '4px' }}>
          • {agent.role.split(' ')[0]}
        </span>
      )}
    </div>
  );
}
