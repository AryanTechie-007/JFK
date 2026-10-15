/**
 * Step 2: Transaction Normalization & Rail/VPA/Token Extraction (Categorizer §B.2 step 2)
 */

function normalizeTransactionDescription(rawDescription = '', explicitRail = null, explicitVpa = null) {
  const raw = String(rawDescription || '').trim();
  const normalized = raw
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Detect rail
  let rail = explicitRail || 'OTHER';
  if (!explicitRail) {
    if (/\bUPI\b|\/UPI\/|@/.test(normalized)) rail = 'UPI';
    else if (/\bIMPS\b/.test(normalized)) rail = 'IMPS';
    else if (/\bNEFT\b/.test(normalized)) rail = 'NEFT';
    else if (/\bRTGS\b/.test(normalized)) rail = 'RTGS';
    else if (/\bNACH\b|\bACH\b|\bMANDATE\b|\bAUTOPAY\b/.test(normalized)) rail = 'NACH';
    else if (/\bPOS\b|\bECOM\b|\bVISA\b|\bMASTERCARD\b|\bRUPAY\b|\bCARD\b/.test(normalized)) rail = 'CARD';
    else if (/\bATM\b|\bCASH\s*WDL\b|\bATW\b/.test(normalized)) rail = 'ATM';
    else if (/\bFEE\b|\bCHG\b|\bCHARGE\b|\bGST\b|\bPENALTY\b/.test(normalized)) rail = 'BANK_FEE';
    else if (/\bINT\s*PD\b|\bINTEREST\b|\bSB\s*INT\b/.test(normalized)) rail = 'INTEREST';
  }

  // Extract VPA if present
  let vpa = explicitVpa ? String(explicitVpa).toLowerCase().trim() : null;
  if (!vpa) {
    const vpaMatch = raw.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9]+)/);
    if (vpaMatch) {
      vpa = vpaMatch[1].toLowerCase();
    }
  }

  // Extract last4 digits of account/card if present
  let last4 = null;
  const last4Match = normalized.match(/(?:XX+|\*\*+|ENDING\s*|A\/C\s*)(\d{4})\b/);
  if (last4Match) {
    last4 = last4Match[1];
  }

  // Extract reference number
  let refToken = null;
  const refMatch = normalized.match(/\b(\d{10,16})\b/);
  if (refMatch) {
    refToken = refMatch[1];
  }

  // Extract clean merchant token
  const cleanedMerchant = normalized
    .replace(/\b(UPI|IMPS|NEFT|RTGS|NACH|POS|ECOM|DR|CR|TO|BY|TRF|TRANSFER|REF|TXN|PAYTM|PHONEPE|GPAY)\b/g, ' ')
    .replace(/[a-zA-Z0-9._-]+@[a-zA-Z0-9]+/gi, ' ')
    .replace(/\b\d{6,}\b/g, ' ')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    normalized_description: normalized,
    rail,
    vpa,
    last4,
    ref_token: refToken,
    merchant_token: cleanedMerchant,
  };
}

module.exports = {
  normalizeTransactionDescription,
};
