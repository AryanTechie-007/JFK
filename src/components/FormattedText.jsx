import React from 'react';

/**
 * FormattedText component safely renders bold text (**bold**), clean line breaks,
 * bullet points, and converts LaTeX artifacts ($\rightarrow$) to clean arrows (→).
 */
export default function FormattedText({ text }) {
  if (!text) return null;

  // Clean raw LaTeX arrows if present
  const cleanedText = text
    .replace(/\$\\rightarrow\$/g, '→')
    .replace(/\\\$/g, '$');

  const lines = cleanedText.split('\n');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {lines.map((line, lineIdx) => {
        if (!line.trim()) {
          return <div key={lineIdx} style={{ height: '4px' }} />;
        }

        // Parse **bold** parts in the line
        const parts = line.split(/(\*\*.*?\*\*)/g);

        return (
          <div key={lineIdx} style={{ lineHeight: '1.6' }}>
            {parts.map((part, partIdx) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return (
                  <strong key={partIdx} style={{ fontWeight: '700', color: 'inherit' }}>
                    {part.slice(2, -2)}
                  </strong>
                );
              }
              return <span key={partIdx}>{part}</span>;
            })}
          </div>
        );
      })}
    </div>
  );
}
