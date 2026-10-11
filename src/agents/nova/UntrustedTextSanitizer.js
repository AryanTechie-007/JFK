/**
 * UntrustedTextSanitizer — Defends Nova against Prompt Injection in Merchant Names & Remarks
 *
 * Implements Section 5.2, Section 9 ("Untrusted text. Merchant names and payment remarks are data only.
 * Nova never acts on instructions in them."), Section 13 #9, and Section 14 #8.
 */

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
  /system\s*:\s*/gi,
  /assistant\s*:\s*/gi,
  /developer\s*:\s*/gi,
  /call\s+tool\s+[a-z0-9_]+/gi,
  /invoke\s+[a-z0-9_]+/gi,
  /execute\s+(sql|command|tool|action)/gi,
  /\b(delete_goal|update_budget_cap|apply_rebalance|recategorize_transaction|write_db|drop\s+table)\b/gi,
  /\{\{.*?\}\}/g,
  /<script[\s\S]*?>[\s\S]*?<\/script>/gi
];

class UntrustedTextSanitizer {
  /**
   * Sanitizes an untrusted merchant or remark string into a safe inert data literal.
   */
  static sanitizeText(rawText) {
    if (rawText == null) {
      return { sanitized: '', injection_detected: false, blocked_tokens: [] };
    }

    const str = String(rawText);
    let cleaned = str;
    let injectionDetected = false;
    const blockedTokens = [];

    for (const pattern of INJECTION_PATTERNS) {
      pattern.lastIndex = 0;
      const matches = cleaned.match(pattern);
      if (matches && matches.length > 0) {
        injectionDetected = true;
        blockedTokens.push(...matches);
        cleaned = cleaned.replace(pattern, '[REDACTED_DATA]');
      }
    }

    // Strip control characters and excessive whitespace
    cleaned = cleaned.replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim();

    return {
      sanitized: cleaned || 'Sanitized Merchant',
      injection_detected: injectionDetected,
      blocked_tokens: blockedTokens
    };
  }

  static sanitizeTransaction(tx = {}) {
    const descRes = this.sanitizeText(tx.raw_description || tx.rawDescription || tx.description || '');
    const merchRes = this.sanitizeText(
      tx.merchant || (descRes.sanitized ? descRes.sanitized.split(' ')[0] : 'Merchant')
    );

    return {
      sanitized_description: descRes.sanitized,
      sanitized_merchant: merchRes.sanitized,
      injection_detected: descRes.injection_detected || merchRes.injection_detected,
      blocked_tokens: [...descRes.blocked_tokens, ...merchRes.blocked_tokens]
    };
  }
}

module.exports = UntrustedTextSanitizer;
