const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('SEN-AC-04: Static No-LLM Check for Sentinel Engine', () => {
  const sentinelDir = path.join(__dirname, '..', '..', 'src', 'engines', 'sentinel');

  function getFiles(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let files = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files = files.concat(getFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        files.push(fullPath);
      }
    }
    return files;
  }

  test('no Sentinel source file imports or references an LLM or provider SDK', () => {
    const files = getFiles(sentinelDir);
    assert.ok(files.length > 0, 'Sentinel source files must be present');

    const forbiddenPatterns = [
      /@google\/generative-ai/i,
      /openai/i,
      /anthropic/i,
      /gemini/i,
      /qwen/i,
      /askGemini/i,
      /llmAdapter/i,
      /generateContent/i,
      /createCompletion/i,
    ];

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf8');
      for (const pattern of forbiddenPatterns) {
        const match = content.match(pattern);
        assert.equal(
          match,
          null,
          `File ${path.relative(sentinelDir, filePath)} contains forbidden LLM pattern: ${pattern}`
        );
      }
    }
  });
});
