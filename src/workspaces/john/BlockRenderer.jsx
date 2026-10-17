import React from 'react';
import FormattedText from '../../components/FormattedText';
import ProposalCard from '../../components/ui/ProposalCard';
import ActionChip from '../../components/ui/ActionChip';
import UndoBar from '../../components/ui/UndoBar';
import Notice from '../../components/ui/Notice';
import { ExternalLink } from 'lucide-react';
import { api } from '../../services/api/v1';

export default function BlockRenderer({
  block,
  onNavigateToWorkspace,
  onAnswerQuestion,
  onActionExecuted,
}) {
  if (!block) return null;

  switch (block.kind) {
    case 'TEXT':
      return <FormattedText text={block.text} />;

    case 'NOTICE':
      return (
        <Notice
          code={block.code || block.severity || 'INFO'}
          text={block.text || block.message}
          linkWorkspace={block.link_workspace}
          onNavigate={onNavigateToWorkspace}
        />
      );

    case 'CARD':
      return (
        <ProposalCard
          proposalId={block.proposal_id}
          proposal={block.proposal}
          onConfirmed={onActionExecuted}
          onDeclined={onActionExecuted}
        />
      );

    case 'CHIP':
      return (
        <ActionChip
          action={block.action}
          params={block.params}
          label={block.label}
          onExecuted={onActionExecuted}
        />
      );

    case 'QUESTION':
      return (
        <div
          style={{
            padding: '14px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }}>
            {block.question}
          </div>
          {Array.isArray(block.options) && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {block.options.map((opt, idx) => (
                <button
                  key={opt.option_id || idx}
                  onClick={() => {
                    if (onAnswerQuestion) {
                      onAnswerQuestion(block.question_id, opt.option_id, opt.label || opt.text);
                    }
                  }}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '12px' }}
                >
                  {opt.label || opt.text}
                </button>
              ))}
            </div>
          )}
        </div>
      );

    case 'UNDO':
      return (
        <UndoBar
          label={block.label || 'Action completed'}
          onUndo={async () => {
            if (block.action_id) {
              await api.undoAction(block.action_id);
              if (onActionExecuted) onActionExecuted();
            }
          }}
          undoAvailableUntil={block.until}
        />
      );

    case 'LINK':
      return (
        <div style={{ marginTop: '4px' }}>
          <button
            onClick={() => {
              if (onNavigateToWorkspace) {
                onNavigateToWorkspace((block.workspace || 'sentinel').toLowerCase());
              }
            }}
            className="btn btn-secondary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
          >
            <span>Open {block.workspace || 'Workspace'}</span>
            <ExternalLink size={13} />
          </button>
        </div>
      );

    default:
      console.warn(`[BlockRenderer] Unknown block kind: ${block.kind}`, block);
      return <FormattedText text={block.text || JSON.stringify(block)} />;
  }
}
