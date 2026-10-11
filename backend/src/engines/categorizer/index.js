/**
 * Item Categorizer v3.0 — 10-Step Deterministic Pipeline, Versioned Reads,
 * Review Queue, DataQuality@1 Status, and Action Corrections
 * (docs/specifications/item-categorizer-spec.md)
 */

const db = require('../../db');
const { newId, toCanonicalUserId, toNumericUserId } = require('../../shared/ids');
const { rupeesToMinor } = require('../../shared/money');
const {
  MOVEMENT_TYPES,
  DIRECTIONS,
  CLASSIFICATION_STATUSES,
  CONFIDENCE_LEVELS,
  CATEGORY_BEARING_TYPES,
} = require('../../shared/finance/movement');
const { computeWindowCoverage } = require('../../shared/finance/coverage');
const {
  TAXONOMY_VERSION,
  CATEGORIES,
  PARENT_CATEGORIES,
  migrateLegacyCategory,
  getCategoryById,
  isValidCategoryId,
} = require('./taxonomy');
const { normalizeTransactionDescription } = require('./normalize');
const { resolveMerchant } = require('./merchants');

// Step 6 E4 Keyword Table (Categorizer §B.2 step 6)
const KEYWORD_RULES = [
  { regex: /\b(HOUSE\s*RENT|APARTMENT\s*RENT|LANDLORD|RENTAL|RENT)\b/i, category_id: 'HOUSING.RENT', confidence_bp: 8600, direction: 'DEBIT' },
  { regex: /\b(SOCIETY\s*MAINTENANCE|MAINTENANCE\s*BILL|MYGATE|ADDA|NOBROKERHOOD)\b/i, category_id: 'HOUSING.MAINTENANCE_SOCIETY', confidence_bp: 8800, direction: 'DEBIT' },
  { regex: /\b(ELECTRICITY|POWER\s*BILL|BESCOM|MSEB|TATA\s*POWER)\b/i, category_id: 'UTILITIES.ELECTRICITY', confidence_bp: 8800, direction: 'DEBIT' },
  { regex: /\b(WATER\s*BILL|BWSSB|PIPED\s*GAS|INDANE|BHARAT\s*GAS|HP\s*GAS|MAHANAGAR\s*GAS)\b/i, category_id: 'UTILITIES.WATER_GAS', confidence_bp: 8800, direction: 'DEBIT' },
  { regex: /\b(BROADBAND|FIBERNET|WIFI\s*BILL|MOBILE\s*RECHARGE|POSTPAID)\b/i, category_id: 'UTILITIES.INTERNET_MOBILE', confidence_bp: 8700, direction: 'DEBIT' },
  { regex: /\b(INSURANCE|LIC\s*OF\s*INDIA|HDFC\s*ERGO|ICICI\s*LOMBARD|STAR\s*HEALTH|MAX\s*LIFE)\b/i, category_id: 'INSURANCE.PREMIUM', confidence_bp: 8800, direction: 'DEBIT' },
  { regex: /\b(TUITION|SCHOOL\s*FEE|COLLEGE\s*FEE|UNIVERSITY|COURSERA|UDEMY)\b/i, category_id: 'EDUCATION.FEES', confidence_bp: 8700, direction: 'DEBIT' },
  { regex: /\b(EMI|LOAN\s*INSTALMENT|BAJAJ\s*FINANCE|HOME\s*LOAN|CAR\s*LOAN)\b/i, category_id: 'DEBT.EMI', confidence_bp: 8900, direction: 'DEBIT' },
  { regex: /\b(GROCERY|SUPERMARKET|VEGETABLES|PROVISIONS|FRESH\s*MART|MILK)\b/i, category_id: 'FOOD.GROCERIES', confidence_bp: 7800, direction: 'DEBIT' },
  { regex: /\b(RESTAURANT|CAFE|COFFEE|BAKERY|DINER|BISTRO|PIZZA|BURGER)\b/i, category_id: 'FOOD.DINING', confidence_bp: 7600, direction: 'DEBIT' },
  { regex: /\b(FOOD\s*DELIVERY|SWIGGY|ZOMATO)\b/i, category_id: 'FOOD.DELIVERY', confidence_bp: 8800, direction: 'DEBIT' },
  { regex: /\b(PETROL|DIESEL|FUEL\s*STATION|EV\s*CHARGE)\b/i, category_id: 'TRANSPORT.FUEL', confidence_bp: 8700, direction: 'DEBIT' },
  { regex: /\b(CAB|TAXI|AUTO\s*RICKSHAW|METRO|BUS\s*TICKET|FASTAG|TOLL)\b/i, category_id: 'TRANSPORT.CAB_TRANSIT', confidence_bp: 7800, direction: 'DEBIT' },
  { regex: /\b(HOSPITAL|CLINIC|DIAGNOSTIC|PATHOLOGY|DOCTOR|DENTAL)\b/i, category_id: 'HEALTH.MEDICAL', confidence_bp: 8800, direction: 'DEBIT' },
  { regex: /\b(PHARMACY|CHEMIST|MEDICINE|GYM|FITNESS|YOGA)\b/i, category_id: 'HEALTH.PHARMACY_FITNESS', confidence_bp: 8600, direction: 'DEBIT' },
  { regex: /\b(SUBSCRIPTION|MEMBERSHIP|STREAMING)\b/i, category_id: 'SUBSCRIPTIONS.STREAMING', confidence_bp: 7500, direction: 'DEBIT' },
  { regex: /\b(CINEMA|MOVIE|THEATRE|CONCERT|GAMING|STEAM)\b/i, category_id: 'ENTERTAINMENT.LEISURE', confidence_bp: 7800, direction: 'DEBIT' },
  { regex: /\b(FLIGHT|HOTEL|RESORT|AIRBNB|BOOKING\.COM|TRAIN\s*TICKET)\b/i, category_id: 'TRAVEL.STAYS_TICKETS', confidence_bp: 8700, direction: 'DEBIT' },
  { regex: /\b(SALON|BARBER|SPA|GROOMING|PARLOUR)\b/i, category_id: 'PERSONAL_CARE.GROOMING', confidence_bp: 7800, direction: 'DEBIT' },
  { regex: /\b(GIFT|DONATION|CHARITY)\b/i, category_id: 'FAMILY_GIFTS.TRANSFER_GIFT', confidence_bp: 7500, direction: 'DEBIT' },
  { regex: /\b(SALARY|PAYROLL|STIPEND|WAGES)\b/i, category_id: 'INCOME.SALARY', confidence_bp: 9400, direction: 'CREDIT' },
  { regex: /\b(FREELANCE|CONSULTING\s*FEE|INVOICE\s*PAYMENT)\b/i, category_id: 'INCOME.FREELANCE_BUSINESS', confidence_bp: 8700, direction: 'CREDIT' },
  { regex: /\b(CASHBACK|REWARD\s*CREDIT)\b/i, category_id: 'INCOME.REFUND_CASHBACK', confidence_bp: 8800, direction: 'CREDIT' },
];

function ensureUserVersionsRow(canonicalUserId) {
  const row = db
    .prepare('SELECT * FROM user_state_versions WHERE user_id = ?')
    .get(canonicalUserId);
  if (!row) {
    db.prepare(
      `INSERT INTO user_state_versions (user_id, ledger_version, plan_version, profile_version, rules_version, last_updated_at)
       VALUES (?, 1, 1, 1, 1, datetime('now'))`
    ).run(canonicalUserId);
    return {
      user_id: canonicalUserId,
      ledger_version: 1,
      plan_version: 1,
      profile_version: 1,
      rules_version: 1,
      import_in_progress: 0,
      last_updated_at: new Date().toISOString(),
    };
  }
  return row;
}

function incrementLedgerVersion(canonicalUserId) {
  ensureUserVersionsRow(canonicalUserId);
  db.prepare(
    `UPDATE user_state_versions
     SET ledger_version = ledger_version + 1, last_updated_at = datetime('now')
     WHERE user_id = ?`
  ).run(canonicalUserId);
  return db
    .prepare('SELECT ledger_version FROM user_state_versions WHERE user_id = ?')
    .get(canonicalUserId).ledger_version;
}

function ensureDefaultAccount(canonicalUserId) {
  let acc = db
    .prepare('SELECT * FROM accounts_v1 WHERE user_id = ? ORDER BY created_at LIMIT 1')
    .get(canonicalUserId);
  if (!acc) {
    const accountId = newId('acc');
    db.prepare(
      `INSERT INTO accounts_v1 (account_id, user_id, display_name, type, institution, last4, is_own_account, balance_minor, balance_as_of)
       VALUES (?, ?, 'Primary Checking', 'CHECKING', 'HDFC Bank', '4821', 1, 25000000, datetime('now'))`
    ).run(accountId, canonicalUserId);
    acc = db.prepare('SELECT * FROM accounts_v1 WHERE account_id = ?').get(accountId);
  }
  return acc;
}

/**
 * Step 4: Movement-Type Classification (Categorizer §B.2 step 4)
 */
function classifyMovementType(rawRow, norm, userAccounts = [], recentTransactions = []) {
  const desc = norm.normalized_description;
  const direction = rawRow.direction || 'DEBIT';
  const amountMinor = Number(rawRow.amount_minor) || 0;
  const txnDate = rawRow.txn_date || new Date().toISOString().slice(0, 10);

  // 1. Explicit self-transfer / own account detection
  const ownLast4s = new Set(
    userAccounts.filter((a) => a.is_own_account && a.last4).map((a) => String(a.last4))
  );
  if (
    /\bSELF\s*TRANSFER\b|\bOWN\s*ACCOUNT\b|\bTRFR\s*TO\s*SELF\b/.test(desc) ||
    (norm.last4 && ownLast4s.has(norm.last4) && /\bTRF|TRANSFER|NEFT|IMPS|UPI\b/.test(desc))
  ) {
    return {
      movement_type: MOVEMENT_TYPES.TRANSFER_INTERNAL,
      confidence_bp: 9300,
      paired_txn_id: null,
      linked_expense_txn_id: null,
      review_reason: null,
    };
  }

  // Pair matching for opposite-direction row on another own account within ±1 day
  const oppositeDir = direction === 'DEBIT' ? 'CREDIT' : 'DEBIT';
  const matchingOwnTransfer = recentTransactions.find((t) => {
    if (t.account_id === rawRow.account_id) return false;
    if (t.direction !== oppositeDir) return false;
    if (Number(t.amount_minor) !== amountMinor) return false;
    const daysDiff =
      Math.abs(new Date(t.txn_date).getTime() - new Date(txnDate).getTime()) / 86400000;
    return daysDiff <= 1;
  });
  if (matchingOwnTransfer) {
    return {
      movement_type: MOVEMENT_TYPES.TRANSFER_INTERNAL,
      confidence_bp: 9500,
      paired_txn_id: matchingOwnTransfer.txn_id,
      linked_expense_txn_id: null,
      review_reason: null,
    };
  }

  // 2. Credit card bill payment
  if (
    /\b(CREDIT\s*CARD\s*BILL|CC\s*BILL\s*PMT|CRED\s*CLUB|BILLDESK\s*CC|HDFC\s*CC\s*PAY|ICICI\s*CC\s*PAY|SBI\s*CARD\s*PAY|AMEX\s*EPAY)\b/.test(
      desc
    )
  ) {
    return {
      movement_type: MOVEMENT_TYPES.CARD_PAYMENT,
      confidence_bp: 9400,
      paired_txn_id: null,
      linked_expense_txn_id: null,
      review_reason: null,
    };
  }

  // 3. Refund / Reversal / Chargeback on CREDIT
  if (direction === 'CREDIT') {
    const isReversal = /\b(REV|REVERSAL|UPI\s*REV|IMPS\s*REV|FAILED\s*TXN\s*REV)\b/.test(desc);
    const isChargeback = /\b(CHARGEBACK|CHGBK|DISPUTE\s*CREDIT)\b/.test(desc);
    const isRefund = /\b(REFUND|RFD|RETURN\s*CREDIT|CANCEL\s*REFUND)\b/.test(desc);

    if (isReversal || isChargeback || isRefund) {
      const mType = isChargeback
        ? MOVEMENT_TYPES.CHARGEBACK
        : isReversal
        ? MOVEMENT_TYPES.REVERSAL
        : MOVEMENT_TYPES.REFUND;

      // Look for prior debit in last 90 days with same merchant or amount
      const priorDebit = recentTransactions.find((t) => {
        if (t.direction !== 'DEBIT') return false;
        if (Number(t.amount_minor) < amountMinor) return false;
        const daysDiff =
          (new Date(txnDate).getTime() - new Date(t.txn_date).getTime()) / 86400000;
        if (daysDiff < 0 || daysDiff > 90) return false;
        return Number(t.amount_minor) === amountMinor;
      });

      return {
        movement_type: mType,
        confidence_bp: priorDebit ? 9200 : 7800,
        paired_txn_id: null,
        linked_expense_txn_id: priorDebit ? priorDebit.txn_id : null,
        inherited_category_id: priorDebit ? priorDebit.category_id : null,
        review_reason: priorDebit ? null : 'UNLINKED_REFUND',
      };
    }

    // 4. Interest credit
    if (norm.rail === 'INTEREST' || /\b(INTEREST\s*CREDIT|INT\.PD|SB\s*INT)\b/.test(desc)) {
      return {
        movement_type: MOVEMENT_TYPES.INTEREST,
        confidence_bp: 9500,
        paired_txn_id: null,
        linked_expense_txn_id: null,
        review_reason: null,
      };
    }

    // 5. Income vs Unknown Credit
    if (/\b(SALARY|PAYROLL|NEFT\s*CR.*SALARY|STIPEND|FREELANCE|DIVIDEND|CASHBACK)\b/.test(desc)) {
      return {
        movement_type: MOVEMENT_TYPES.INCOME,
        confidence_bp: 9400,
        paired_txn_id: null,
        linked_expense_txn_id: null,
        review_reason: null,
      };
    }

    return {
      movement_type: MOVEMENT_TYPES.INCOME,
      confidence_bp: 7500,
      paired_txn_id: null,
      linked_expense_txn_id: null,
      review_reason: 'MOVEMENT_TYPE_UNCERTAIN',
    };
  }

  // DEBIT movement types
  if (norm.rail === 'ATM' || /\b(ATM\s*WDL|CASH\s*WITHDRAWAL|ATM\s*CASH)\b/.test(desc)) {
    return {
      movement_type: MOVEMENT_TYPES.CASH_WITHDRAWAL,
      confidence_bp: 9500,
      paired_txn_id: null,
      linked_expense_txn_id: null,
      review_reason: null,
    };
  }

  if (norm.rail === 'BANK_FEE' || /\b(ANNUAL\s*FEE|LATE\s*FEE|OVERLIMIT\s*FEE|SMS\s*CHG|AMB\s*CHG)\b/.test(desc)) {
    return {
      movement_type: MOVEMENT_TYPES.FEE,
      confidence_bp: 9200,
      paired_txn_id: null,
      linked_expense_txn_id: null,
      review_reason: null,
    };
  }

  if (/\b(EMI|LOAN\s*REPAYMENT|AUTO\s*LOAN|HOME\s*LOAN\s*EMI)\b/.test(desc)) {
    return {
      movement_type: MOVEMENT_TYPES.LOAN_REPAYMENT,
      confidence_bp: 9100,
      paired_txn_id: null,
      linked_expense_txn_id: null,
      review_reason: null,
    };
  }

  return {
    movement_type: MOVEMENT_TYPES.EXPENSE,
    confidence_bp: 9000,
    paired_txn_id: null,
    linked_expense_txn_id: null,
    review_reason: null,
  };
}

/**
 * Step 6 & 7: Category Assignment & Confidence Banding (Categorizer §B.2 steps 6-7)
 */
function assignCategoryAndConfidence(rawRow, norm, movementInfo, merchantInfo, userRules = []) {
  const movementType = movementInfo.movement_type;
  const direction = rawRow.direction || 'DEBIT';

  // Non-category-bearing types (SC §6.1)
  if (!CATEGORY_BEARING_TYPES.has(movementType)) {
    return {
      category_id: null,
      classification_status: CLASSIFICATION_STATUSES.AUTO,
      classification_confidence: CONFIDENCE_LEVELS.HIGH,
      classification_confidence_bp: movementInfo.confidence_bp || 9300,
      classification_source: 'STRUCTURAL_RULE',
      rule_id: null,
      review_reason: movementInfo.review_reason || null,
    };
  }

  // If refund/reversal inherited a category from linked expense
  if (movementInfo.inherited_category_id) {
    return {
      category_id: movementInfo.inherited_category_id,
      classification_status: CLASSIFICATION_STATUSES.AUTO,
      classification_confidence: CONFIDENCE_LEVELS.HIGH,
      classification_confidence_bp: 9200,
      classification_source: 'PRIOR_USER_DECISION',
      rule_id: null,
      review_reason: null,
    };
  }

  // If user explicitly supplied a valid category (e.g. Manual Entry or explicit correction)
  if (rawRow.user_category_id && isValidCategoryId(rawRow.user_category_id)) {
    return {
      category_id: rawRow.user_category_id,
      classification_status: CLASSIFICATION_STATUSES.CONFIRMED,
      classification_confidence: CONFIDENCE_LEVELS.HIGH,
      classification_confidence_bp: 10000,
      classification_source: 'USER',
      rule_id: null,
      review_reason: null,
    };
  }

  // E1: User-defined category rules (ordered by specificity & priority)
  const activeRules = userRules
    .filter((r) => r.active && (!r.direction || r.direction === direction))
    .sort((a, b) => (a.priority || 100) - (b.priority || 100));

  for (const rule of activeRules) {
    const pat = String(rule.pattern || '').toUpperCase();
    let matched = false;
    if (rule.match_type === 'MERCHANT_ID' && merchantInfo?.merchant_id === rule.pattern) {
      matched = true;
    } else if (rule.match_type === 'VPA' && norm.vpa && norm.vpa.toUpperCase() === pat) {
      matched = true;
    } else if (rule.match_type === 'NORMALIZED_SUBSTRING' && norm.normalized_description.includes(pat)) {
      matched = true;
    }
    if (matched && rule.category_id) {
      return {
        category_id: rule.category_id,
        classification_status: CLASSIFICATION_STATUSES.AUTO,
        classification_confidence: CONFIDENCE_LEVELS.HIGH,
        classification_confidence_bp: 9600,
        classification_source: 'USER_RULE',
        rule_id: rule.rule_id,
        review_reason: null,
      };
    }
  }

  // E2: Curated Merchant Alias / VPA prefix
  if (merchantInfo && merchantInfo.category_id) {
    const bp = merchantInfo.confidence_bp || 9000;
    const isHigh = bp >= 8500;
    return {
      category_id: merchantInfo.category_id,
      classification_status: isHigh ? CLASSIFICATION_STATUSES.AUTO : CLASSIFICATION_STATUSES.NEEDS_REVIEW,
      classification_confidence: isHigh ? CONFIDENCE_LEVELS.HIGH : CONFIDENCE_LEVELS.MEDIUM,
      classification_confidence_bp: bp,
      classification_source: 'MERCHANT_ALIAS',
      rule_id: merchantInfo.merchant_id,
      review_reason: isHigh ? null : 'MARKETPLACE_AMBIGUOUS',
    };
  }

  // E3: Structural / Rail / Movement Type defaults
  if (movementType === MOVEMENT_TYPES.CASH_WITHDRAWAL) {
    return {
      category_id: 'MISC.OTHER',
      classification_status: CLASSIFICATION_STATUSES.AUTO,
      classification_confidence: CONFIDENCE_LEVELS.HIGH,
      classification_confidence_bp: 9000,
      classification_source: 'STRUCTURAL_RULE',
      rule_id: 'STRUCT_ATM',
      review_reason: null,
    };
  }
  if (movementType === MOVEMENT_TYPES.FEE) {
    return {
      category_id: 'MISC.OTHER',
      classification_status: CLASSIFICATION_STATUSES.AUTO,
      classification_confidence: CONFIDENCE_LEVELS.HIGH,
      classification_confidence_bp: 9000,
      classification_source: 'STRUCTURAL_RULE',
      rule_id: 'STRUCT_FEE',
      review_reason: null,
    };
  }
  if (movementType === MOVEMENT_TYPES.INTEREST) {
    return {
      category_id: 'INCOME.REFUND_CASHBACK',
      classification_status: CLASSIFICATION_STATUSES.AUTO,
      classification_confidence: CONFIDENCE_LEVELS.HIGH,
      classification_confidence_bp: 9400,
      classification_source: 'STRUCTURAL_RULE',
      rule_id: 'STRUCT_INTEREST',
      review_reason: null,
    };
  }

  // E4: Keyword rules
  for (const kw of KEYWORD_RULES) {
    if (kw.direction && kw.direction !== direction) continue;
    if (kw.regex.test(norm.normalized_description)) {
      const bp = kw.confidence_bp;
      const isHigh = bp >= 8500;
      return {
        category_id: kw.category_id,
        classification_status: isHigh ? CLASSIFICATION_STATUSES.AUTO : CLASSIFICATION_STATUSES.NEEDS_REVIEW,
        classification_confidence: isHigh ? CONFIDENCE_LEVELS.HIGH : CONFIDENCE_LEVELS.MEDIUM,
        classification_confidence_bp: bp,
        classification_source: 'KEYWORD_RULE',
        rule_id: `KW_${kw.category_id}`,
        review_reason: isHigh ? null : 'LOW_CONFIDENCE_CATEGORY',
      };
    }
  }

  // If legacy category was passed during import/migration
  if (rawRow.legacy_category) {
    const migrated = migrateLegacyCategory(rawRow.legacy_category);
    if (migrated) {
      return {
        category_id: migrated,
        classification_status: CLASSIFICATION_STATUSES.AUTO,
        classification_confidence: CONFIDENCE_LEVELS.HIGH,
        classification_confidence_bp: 8800,
        classification_source: 'PRIOR_USER_DECISION',
        rule_id: 'LEGACY_MIGRATION',
        review_reason: null,
      };
    }
  }

  // Abstain -> UNCATEGORIZED (LOW confidence)
  return {
    category_id: null,
    classification_status: CLASSIFICATION_STATUSES.UNCATEGORIZED,
    classification_confidence: CONFIDENCE_LEVELS.LOW,
    classification_confidence_bp: 3000,
    classification_source: 'FALLBACK',
    rule_id: null,
    review_reason: movementInfo.review_reason || 'NO_MATCH',
  };
}

/**
 * Syncs any rows in legacy `transactions` table into `transactions_v1` so both APIs share the same truth.
 */
function syncLegacyTransactionsForUser(userId) {
  const numericUserId = toNumericUserId(userId);
  const canonicalUserId = toCanonicalUserId(numericUserId);
  ensureUserVersionsRow(canonicalUserId);
  const defaultAcc = ensureDefaultAccount(canonicalUserId);

  const legacyRows = db
    .prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY id ASC')
    .all(numericUserId);

  if (!legacyRows.length) return;

  const existingLegacyIds = new Set(
    db
      .prepare('SELECT legacy_txn_id FROM transactions_v1 WHERE user_id = ? AND legacy_txn_id IS NOT NULL')
      .all(canonicalUserId)
      .map((r) => r.legacy_txn_id)
  );

  const missingRows = legacyRows.filter((r) => !existingLegacyIds.has(r.id));
  if (!missingRows.length) return;

  const userRules = db
    .prepare('SELECT * FROM category_rules WHERE user_id = ? AND active = 1')
    .all(canonicalUserId);
  const userAccounts = db
    .prepare('SELECT * FROM accounts_v1 WHERE user_id = ?')
    .all(canonicalUserId);

  const ver = incrementLedgerVersion(canonicalUserId);

  for (const row of missingRows) {
    const txnId = newId('txn');
    const amountMinor = rupeesToMinor(Math.abs(Number(row.amount) || 0));
    const txnDate = String(row.txn_date || new Date().toISOString()).slice(0, 10);
    const norm = normalizeTransactionDescription(row.raw_description);
    const merchantInfo = resolveMerchant(norm.normalized_description, norm.vpa);

    const rawInput = {
      account_id: defaultAcc.account_id,
      direction: 'DEBIT',
      amount_minor: amountMinor,
      txn_date: txnDate,
      legacy_category: row.category !== 'Uncategorized' ? row.category : null,
    };

    const movementInfo = classifyMovementType(rawInput, norm, userAccounts, []);
    const catInfo = assignCategoryAndConfidence(rawInput, norm, movementInfo, merchantInfo, userRules);

    db.prepare(
      `INSERT INTO transactions_v1 (
        txn_id, user_id, account_id, source, status, direction, amount_minor, currency,
        txn_timestamp, txn_date, booking_date, raw_description, normalized_description,
        merchant_id, merchant_display_name, rail, vpa, movement_type, category_id,
        classification_status, classification_confidence, classification_confidence_bp,
        classification_source, rule_id, categorized_version, paired_txn_id, linked_expense_txn_id,
        legacy_txn_id
      ) VALUES (?, ?, ?, 'STATEMENT_IMPORT', 'POSTED', 'DEBIT', ?, 'INR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      txnId,
      canonicalUserId,
      defaultAcc.account_id,
      amountMinor,
      `${txnDate}T12:00:00+05:30`,
      txnDate,
      txnDate,
      row.raw_description,
      norm.normalized_description,
      merchantInfo?.merchant_id || null,
      merchantInfo?.display_name || null,
      norm.rail,
      norm.vpa,
      movementInfo.movement_type,
      catInfo.category_id,
      catInfo.classification_status,
      catInfo.classification_confidence,
      catInfo.classification_confidence_bp,
      catInfo.classification_source,
      catInfo.rule_id,
      ver,
      movementInfo.paired_txn_id,
      movementInfo.linked_expense_txn_id,
      row.id
    );

    db.prepare(
      `INSERT INTO categorization_history (
        txn_id, user_id, version, movement_type, category_id, classification_status,
        classification_confidence, classification_confidence_bp, classification_source,
        rule_id, reason_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      txnId,
      canonicalUserId,
      ver,
      movementInfo.movement_type,
      catInfo.category_id,
      catInfo.classification_status,
      catInfo.classification_confidence,
      catInfo.classification_confidence_bp,
      catInfo.classification_source,
      catInfo.rule_id,
      catInfo.review_reason || 'INITIAL_CLASSIFICATION'
    );

    if (
      catInfo.classification_status === CLASSIFICATION_STATUSES.NEEDS_REVIEW ||
      catInfo.classification_status === CLASSIFICATION_STATUSES.UNCATEGORIZED
    ) {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const priorityScore = amountMinor * (txnDate.startsWith(currentMonth) ? 2 : 1);
      db.prepare(
        `INSERT OR REPLACE INTO review_items (
          review_id, user_id, txn_id, reason, suggested_category_id,
          suggested_movement_type, confidence_bp, priority_score, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')`
      ).run(
        newId('evt'),
        canonicalUserId,
        txnId,
        catInfo.review_reason || 'NO_MATCH',
        catInfo.category_id,
        movementInfo.movement_type,
        catInfo.classification_confidence_bp,
        priorityScore
      );
    }
  }
}

/**
 * Ingest a CanonicalBatch@1 or ManualEntry@1 through the 10-step Categorizer pipeline
 */
function ingestTransactions(userId, items = [], source = 'STATEMENT_IMPORT') {
  const numericUserId = toNumericUserId(userId);
  const canonicalUserId = toCanonicalUserId(numericUserId);
  ensureUserVersionsRow(canonicalUserId);
  const defaultAcc = ensureDefaultAccount(canonicalUserId);

  const userRules = db
    .prepare('SELECT * FROM category_rules WHERE user_id = ? AND active = 1')
    .all(canonicalUserId);
  const userAccounts = db
    .prepare('SELECT * FROM accounts_v1 WHERE user_id = ?')
    .all(canonicalUserId);
  const recentTxns = db
    .prepare('SELECT * FROM transactions_v1 WHERE user_id = ? ORDER BY txn_date DESC LIMIT 300')
    .all(canonicalUserId);

  const ver = incrementLedgerVersion(canonicalUserId);
  const inserted = [];

  for (const item of items) {
    const rawDesc = String(item.raw_description || item.rawDescription || '').trim();
    const amountMinor =
      item.amount_minor != null
        ? Math.trunc(Number(item.amount_minor))
        : rupeesToMinor(Math.abs(Number(item.amount) || 0));

    if (!rawDesc || amountMinor <= 0) continue;

    const direction = item.direction || 'DEBIT';
    const txnDate = String(item.txn_date || item.txnDate || new Date().toISOString()).slice(0, 10);
    const txnTimestamp = item.txn_timestamp || `${txnDate}T12:00:00+05:30`;
    const accountId = item.account_id || defaultAcc.account_id;

    const norm = normalizeTransactionDescription(rawDesc, item.rail, item.vpa);

    // Step 3: Supersession check (if bank import matches a MANUAL_USER entry within ±2 days and same amount)
    let supersededManualTxn = null;
    if (source !== 'MANUAL_USER') {
      supersededManualTxn = recentTxns.find((t) => {
        if (t.source !== 'MANUAL_USER' || t.superseded_by) return false;
        if (Number(t.amount_minor) !== amountMinor || t.direction !== direction) return false;
        const diffDays =
          Math.abs(new Date(t.txn_date).getTime() - new Date(txnDate).getTime()) / 86400000;
        return diffDays <= 2;
      });
    }

    const merchantInfo = resolveMerchant(norm.normalized_description, norm.vpa);
    const rawInput = {
      account_id: accountId,
      direction,
      amount_minor: amountMinor,
      txn_date: txnDate,
      user_category_id: item.category_id || null,
      legacy_category: item.category || null,
    };

    const movementInfo = classifyMovementType(rawInput, norm, userAccounts, recentTxns);
    const catInfo = assignCategoryAndConfidence(rawInput, norm, movementInfo, merchantInfo, userRules);

    // Also insert into legacy transactions table for backward compatibility with legacy endpoints
    const displayCategory = catInfo.category_id
      ? getCategoryById(catInfo.category_id)?.display_name || catInfo.category_id
      : 'Uncategorized';
    const legacyInfo = db
      .prepare(
        `INSERT INTO transactions (user_id, raw_description, amount, category, txn_date)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(numericUserId, rawDesc, amountMinor / 100, displayCategory, txnDate);

    const txnId = item.txn_id || newId('txn');

    db.prepare(
      `INSERT INTO transactions_v1 (
        txn_id, user_id, account_id, source, status, direction, amount_minor, currency,
        txn_timestamp, txn_date, booking_date, raw_description, normalized_description,
        merchant_id, merchant_display_name, rail, vpa, movement_type, category_id,
        classification_status, classification_confidence, classification_confidence_bp,
        classification_source, rule_id, categorized_version, paired_txn_id, linked_expense_txn_id,
        legacy_txn_id
      ) VALUES (?, ?, ?, ?, 'POSTED', ?, ?, 'INR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      txnId,
      canonicalUserId,
      accountId,
      source,
      direction,
      amountMinor,
      txnTimestamp,
      txnDate,
      txnDate,
      rawDesc,
      norm.normalized_description,
      merchantInfo?.merchant_id || null,
      merchantInfo?.display_name || null,
      norm.rail,
      norm.vpa,
      movementInfo.movement_type,
      catInfo.category_id,
      catInfo.classification_status,
      catInfo.classification_confidence,
      catInfo.classification_confidence_bp,
      catInfo.classification_source,
      catInfo.rule_id,
      ver,
      movementInfo.paired_txn_id,
      movementInfo.linked_expense_txn_id,
      legacyInfo.lastInsertRowid
    );

    if (supersededManualTxn) {
      db.prepare('UPDATE transactions_v1 SET superseded_by = ? WHERE txn_id = ?').run(
        txnId,
        supersededManualTxn.txn_id
      );
    }

    db.prepare(
      `INSERT INTO categorization_history (
        txn_id, user_id, version, movement_type, category_id, classification_status,
        classification_confidence, classification_confidence_bp, classification_source,
        rule_id, reason_code
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      txnId,
      canonicalUserId,
      ver,
      movementInfo.movement_type,
      catInfo.category_id,
      catInfo.classification_status,
      catInfo.classification_confidence,
      catInfo.classification_confidence_bp,
      catInfo.classification_source,
      catInfo.rule_id,
      catInfo.review_reason || 'INITIAL_CLASSIFICATION'
    );

    if (
      catInfo.classification_status === CLASSIFICATION_STATUSES.NEEDS_REVIEW ||
      catInfo.classification_status === CLASSIFICATION_STATUSES.UNCATEGORIZED
    ) {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const priorityScore = amountMinor * (txnDate.startsWith(currentMonth) ? 2 : 1);
      db.prepare(
        `INSERT OR REPLACE INTO review_items (
          review_id, user_id, txn_id, reason, suggested_category_id,
          suggested_movement_type, confidence_bp, priority_score, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')`
      ).run(
        newId('evt'),
        canonicalUserId,
        txnId,
        catInfo.review_reason || 'NO_MATCH',
        catInfo.category_id,
        movementInfo.movement_type,
        catInfo.classification_confidence_bp,
        priorityScore
      );
    }

    inserted.push(db.prepare('SELECT * FROM transactions_v1 WHERE txn_id = ?').get(txnId));
  }

  return {
    ledger_version: ver,
    inserted,
    data_quality: getStatus(canonicalUserId, ver),
  };
}

/**
 * Step 8: Versioned Reads (`categorized_as_of`) for Pinned Snapshots
 */
function getTransactionsAsOf(userId, asOfVersion = null, filters = {}) {
  syncLegacyTransactionsForUser(userId);
  const canonicalUserId = toCanonicalUserId(userId);
  const rows = db
    .prepare('SELECT * FROM transactions_v1 WHERE user_id = ? ORDER BY txn_date DESC, txn_timestamp DESC')
    .all(canonicalUserId);

  const result = [];
  for (const row of rows) {
    let effective = { ...row };
    if (asOfVersion != null && row.categorized_version > asOfVersion) {
      const hist = db
        .prepare(
          `SELECT * FROM categorization_history
           WHERE txn_id = ? AND version <= ?
           ORDER BY version DESC LIMIT 1`
        )
        .get(row.txn_id, asOfVersion);
      if (!hist) {
        // Transaction did not exist at asOfVersion
        continue;
      }
      effective = {
        ...row,
        movement_type: hist.movement_type,
        category_id: hist.category_id,
        classification_status: hist.classification_status,
        classification_confidence: hist.classification_confidence,
        classification_confidence_bp: hist.classification_confidence_bp,
        classification_source: hist.classification_source,
        rule_id: hist.rule_id,
        paired_txn_id: hist.paired_txn_id,
        linked_expense_txn_id: hist.linked_expense_txn_id,
        is_duplicate_of: hist.is_duplicate_of,
        superseded_by: hist.superseded_by,
      };
    }

    if (filters.month && !String(effective.txn_date).startsWith(filters.month)) continue;
    if (filters.startDate && effective.txn_date < filters.startDate) continue;
    if (filters.endDate && effective.txn_date > filters.endDate) continue;
    if (filters.category_id) {
      const match =
        effective.category_id === filters.category_id ||
        (effective.category_id && effective.category_id.startsWith(`${filters.category_id}.`));
      if (!match) continue;
    }
    if (filters.classification_status && effective.classification_status !== filters.classification_status) {
      continue;
    }
    if (filters.movement_type && effective.movement_type !== filters.movement_type) {
      continue;
    }

    result.push(effective);
  }

  return result;
}

/**
 * Step 10: DataQuality@1 Status (SC §8.1)
 */
function getStatus(userId, asOfVersion = null, windowDays = 30) {
  syncLegacyTransactionsForUser(userId);
  const canonicalUserId = toCanonicalUserId(userId);
  const versions = ensureUserVersionsRow(canonicalUserId);
  const effectiveVersion = asOfVersion != null ? asOfVersion : versions.ledger_version;

  const cutoffDate = new Date(Date.now() - windowDays * 86400000).toISOString().slice(0, 10);
  const txns = getTransactionsAsOf(canonicalUserId, effectiveVersion, { startDate: cutoffDate });
  const cov = computeWindowCoverage(txns);

  const byCategoryMap = {};
  for (const t of txns) {
    if (t.superseded_by || t.is_duplicate_of) continue;
    if (t.direction !== 'DEBIT') continue;
    if (!t.category_id) continue;
    if (!byCategoryMap[t.category_id]) {
      byCategoryMap[t.category_id] = {
        category_id: t.category_id,
        settled_amount_minor: 0,
        provisional_amount_minor: 0,
        needs_review_count: 0,
      };
    }
    const bucket = byCategoryMap[t.category_id];
    const amt = Number(t.amount_minor) || 0;
    if (t.classification_status === 'CONFIRMED' || t.classification_status === 'AUTO') {
      bucket.settled_amount_minor += amt;
    } else if (t.classification_status === 'NEEDS_REVIEW') {
      bucket.provisional_amount_minor += amt;
      bucket.needs_review_count += 1;
    }
  }

  return {
    schema: 'DataQuality@1',
    user_id: canonicalUserId,
    as_of_ledger_version: effectiveVersion,
    import_in_progress: Boolean(versions.import_in_progress),
    complete: !versions.import_in_progress,
    window_days: windowDays,
    coverage_bp: cov.coverage_bp,
    provisional_share_bp: cov.provisional_share_bp,
    total_amount_minor: cov.total_amount_minor,
    settled_amount_minor: cov.settled_amount_minor,
    provisional_amount_minor: cov.provisional_amount_minor,
    uncategorized_amount_minor: cov.uncategorized_amount_minor,
    needs_review_count: cov.needs_review_count,
    uncategorized_count: cov.uncategorized_count,
    by_category: Object.values(byCategoryMap),
    last_updated_at: versions.last_updated_at || new Date().toISOString(),
  };
}

function getReviewQueue(userId) {
  syncLegacyTransactionsForUser(userId);
  const canonicalUserId = toCanonicalUserId(userId);
  const items = db
    .prepare(
      `SELECT r.*, t.raw_description, t.normalized_description, t.amount_minor,
              t.txn_date, t.direction, t.merchant_display_name, t.category_id,
              t.movement_type, t.classification_status
       FROM review_items r
       JOIN transactions_v1 t ON r.txn_id = t.txn_id
       WHERE r.user_id = ? AND r.status = 'OPEN' AND t.superseded_by IS NULL AND t.is_duplicate_of IS NULL
       ORDER BY r.priority_score DESC, r.created_at DESC`
    )
    .all(canonicalUserId);
  return items;
}

module.exports = {
  TAXONOMY_VERSION,
  CATEGORIES,
  PARENT_CATEGORIES,
  ensureUserVersionsRow,
  incrementLedgerVersion,
  ensureDefaultAccount,
  syncLegacyTransactionsForUser,
  ingestTransactions,
  ingestBatch: ingestTransactions,
  getTransactionsAsOf,
  getStatus,
  getReviewQueue,
};
