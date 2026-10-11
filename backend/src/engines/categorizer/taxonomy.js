/**
 * Taxonomy v1 & Legacy Category Migration Map (SC §6.5, Categorizer §C.6 & §C.9)
 */

const TAXONOMY_VERSION = '1.0.0';

const CATEGORIES = Object.freeze([
  // Fixed / Essential
  { category_id: 'HOUSING.RENT', parent_id: 'HOUSING', display_name: 'Rent', nature: 'FIXED', essentiality: 'ESSENTIAL', direction: 'DEBIT' },
  { category_id: 'HOUSING.MAINTENANCE_SOCIETY', parent_id: 'HOUSING', display_name: 'Maintenance & Society', nature: 'FIXED', essentiality: 'ESSENTIAL', direction: 'DEBIT' },
  { category_id: 'UTILITIES.ELECTRICITY', parent_id: 'UTILITIES', display_name: 'Electricity', nature: 'FIXED', essentiality: 'ESSENTIAL', direction: 'DEBIT' },
  { category_id: 'UTILITIES.WATER_GAS', parent_id: 'UTILITIES', display_name: 'Water & Gas', nature: 'FIXED', essentiality: 'ESSENTIAL', direction: 'DEBIT' },
  { category_id: 'UTILITIES.INTERNET_MOBILE', parent_id: 'UTILITIES', display_name: 'Internet & Mobile', nature: 'FIXED', essentiality: 'ESSENTIAL', direction: 'DEBIT' },
  { category_id: 'INSURANCE.PREMIUM', parent_id: 'INSURANCE', display_name: 'Insurance Premium', nature: 'FIXED', essentiality: 'ESSENTIAL', direction: 'DEBIT' },
  { category_id: 'EDUCATION.FEES', parent_id: 'EDUCATION', display_name: 'Education & Fees', nature: 'FIXED', essentiality: 'ESSENTIAL', direction: 'DEBIT' },
  { category_id: 'DEBT.EMI', parent_id: 'DEBT', display_name: 'Loan EMI', nature: 'FIXED', essentiality: 'ESSENTIAL', direction: 'DEBIT' },

  // Discretionary / Essential or Discretionary
  { category_id: 'FOOD.GROCERIES', parent_id: 'FOOD', display_name: 'Groceries', nature: 'DISCRETIONARY', essentiality: 'ESSENTIAL', direction: 'DEBIT' },
  { category_id: 'FOOD.DINING', parent_id: 'FOOD', display_name: 'Dining Out & Cafes', nature: 'DISCRETIONARY', essentiality: 'DISCRETIONARY', direction: 'DEBIT' },
  { category_id: 'FOOD.DELIVERY', parent_id: 'FOOD', display_name: 'Food Delivery', nature: 'DISCRETIONARY', essentiality: 'DISCRETIONARY', direction: 'DEBIT' },
  { category_id: 'TRANSPORT.FUEL', parent_id: 'TRANSPORT', display_name: 'Fuel', nature: 'DISCRETIONARY', essentiality: 'ESSENTIAL', direction: 'DEBIT' },
  { category_id: 'TRANSPORT.CAB_TRANSIT', parent_id: 'TRANSPORT', display_name: 'Cabs, Metro & Transit', nature: 'DISCRETIONARY', essentiality: 'DISCRETIONARY', direction: 'DEBIT' },
  { category_id: 'SHOPPING.GENERAL', parent_id: 'SHOPPING', display_name: 'General Shopping', nature: 'DISCRETIONARY', essentiality: 'DISCRETIONARY', direction: 'DEBIT' },
  { category_id: 'SHOPPING.ELECTRONICS', parent_id: 'SHOPPING', display_name: 'Electronics', nature: 'DISCRETIONARY', essentiality: 'DISCRETIONARY', direction: 'DEBIT' },
  { category_id: 'HEALTH.MEDICAL', parent_id: 'HEALTH', display_name: 'Doctors, Hospital & Lab', nature: 'DISCRETIONARY', essentiality: 'ESSENTIAL', direction: 'DEBIT' },
  { category_id: 'HEALTH.PHARMACY_FITNESS', parent_id: 'HEALTH', display_name: 'Pharmacy & Fitness', nature: 'DISCRETIONARY', essentiality: 'ESSENTIAL', direction: 'DEBIT' },
  { category_id: 'SUBSCRIPTIONS.STREAMING', parent_id: 'SUBSCRIPTIONS', display_name: 'Streaming Subscriptions', nature: 'DISCRETIONARY', essentiality: 'DISCRETIONARY', direction: 'DEBIT' },
  { category_id: 'SUBSCRIPTIONS.SOFTWARE_NEWS', parent_id: 'SUBSCRIPTIONS', display_name: 'Software & News', nature: 'DISCRETIONARY', essentiality: 'DISCRETIONARY', direction: 'DEBIT' },
  { category_id: 'ENTERTAINMENT.LEISURE', parent_id: 'ENTERTAINMENT', display_name: 'Movies, Events & Hobbies', nature: 'DISCRETIONARY', essentiality: 'DISCRETIONARY', direction: 'DEBIT' },
  { category_id: 'TRAVEL.STAYS_TICKETS', parent_id: 'TRAVEL', display_name: 'Flights, Trains & Hotels', nature: 'DISCRETIONARY', essentiality: 'DISCRETIONARY', direction: 'DEBIT' },
  { category_id: 'PERSONAL_CARE.GROOMING', parent_id: 'PERSONAL_CARE', display_name: 'Salon & Personal Care', nature: 'DISCRETIONARY', essentiality: 'DISCRETIONARY', direction: 'DEBIT' },
  { category_id: 'FAMILY_GIFTS.TRANSFER_GIFT', parent_id: 'FAMILY_GIFTS', display_name: 'Family Support & Gifts', nature: 'DISCRETIONARY', essentiality: 'DISCRETIONARY', direction: 'DEBIT' },
  { category_id: 'MISC.OTHER', parent_id: 'MISC', display_name: 'Other Expenses', nature: 'DISCRETIONARY', essentiality: 'DISCRETIONARY', direction: 'DEBIT' },

  // Income
  { category_id: 'INCOME.SALARY', parent_id: 'INCOME', display_name: 'Salary', nature: 'INCOME', essentiality: 'INCOME', direction: 'CREDIT' },
  { category_id: 'INCOME.FREELANCE_BUSINESS', parent_id: 'INCOME', display_name: 'Freelance & Business', nature: 'INCOME', essentiality: 'INCOME', direction: 'CREDIT' },
  { category_id: 'INCOME.REFUND_CASHBACK', parent_id: 'INCOME', display_name: 'Cashback & Interest', nature: 'INCOME', essentiality: 'INCOME', direction: 'CREDIT' },
  { category_id: 'INCOME.OTHER', parent_id: 'INCOME', display_name: 'Other Income', nature: 'INCOME', essentiality: 'INCOME', direction: 'CREDIT' },
]);

const PARENT_CATEGORIES = Object.freeze({
  HOUSING: { category_id: 'HOUSING', display_name: 'Housing & Rent', nature: 'FIXED', essentiality: 'ESSENTIAL' },
  UTILITIES: { category_id: 'UTILITIES', display_name: 'Bills & Utilities', nature: 'FIXED', essentiality: 'ESSENTIAL' },
  INSURANCE: { category_id: 'INSURANCE', display_name: 'Insurance', nature: 'FIXED', essentiality: 'ESSENTIAL' },
  EDUCATION: { category_id: 'EDUCATION', display_name: 'Education', nature: 'FIXED', essentiality: 'ESSENTIAL' },
  DEBT: { category_id: 'DEBT', display_name: 'Debt & EMI', nature: 'FIXED', essentiality: 'ESSENTIAL' },
  FOOD: { category_id: 'FOOD', display_name: 'Food & Dining', nature: 'DISCRETIONARY', essentiality: 'DISCRETIONARY' },
  TRANSPORT: { category_id: 'TRANSPORT', display_name: 'Transport', nature: 'DISCRETIONARY', essentiality: 'DISCRETIONARY' },
  SHOPPING: { category_id: 'SHOPPING', display_name: 'Shopping & Lifestyle', nature: 'DISCRETIONARY', essentiality: 'DISCRETIONARY' },
  HEALTH: { category_id: 'HEALTH', display_name: 'Health & Medical', nature: 'DISCRETIONARY', essentiality: 'ESSENTIAL' },
  SUBSCRIPTIONS: { category_id: 'SUBSCRIPTIONS', display_name: 'Subscriptions', nature: 'DISCRETIONARY', essentiality: 'DISCRETIONARY' },
  ENTERTAINMENT: { category_id: 'ENTERTAINMENT', display_name: 'Entertainment', nature: 'DISCRETIONARY', essentiality: 'DISCRETIONARY' },
  TRAVEL: { category_id: 'TRAVEL', display_name: 'Travel', nature: 'DISCRETIONARY', essentiality: 'DISCRETIONARY' },
  PERSONAL_CARE: { category_id: 'PERSONAL_CARE', display_name: 'Personal Care', nature: 'DISCRETIONARY', essentiality: 'DISCRETIONARY' },
  FAMILY_GIFTS: { category_id: 'FAMILY_GIFTS', display_name: 'Family & Gifts', nature: 'DISCRETIONARY', essentiality: 'DISCRETIONARY' },
  MISC: { category_id: 'MISC', display_name: 'Miscellaneous', nature: 'DISCRETIONARY', essentiality: 'DISCRETIONARY' },
  INCOME: { category_id: 'INCOME', display_name: 'Income', nature: 'INCOME', essentiality: 'INCOME' },
});

const CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.category_id, c]));

// Categorizer §C.9 Legacy category migration map
const LEGACY_CATEGORY_MAP = Object.freeze({
  'Food & Dining': 'FOOD.DINING',
  'Food Delivery': 'FOOD.DELIVERY',
  'Groceries': 'FOOD.GROCERIES',
  'Rent & Housing': 'HOUSING.RENT',
  'Housing': 'HOUSING.RENT',
  'Utilities & Bills': 'UTILITIES.ELECTRICITY',
  'Bills & Utilities': 'UTILITIES.ELECTRICITY',
  'Transport': 'TRANSPORT.CAB_TRANSIT',
  'Shopping': 'SHOPPING.GENERAL',
  'Shopping & Lifestyle': 'SHOPPING.GENERAL',
  'Entertainment': 'ENTERTAINMENT.LEISURE',
  'Subscriptions': 'SUBSCRIPTIONS.STREAMING',
  'Health & Medical': 'HEALTH.MEDICAL',
  'Healthcare': 'HEALTH.MEDICAL',
  'Travel': 'TRAVEL.STAYS_TICKETS',
  'Education': 'EDUCATION.FEES',
  'Salary': 'INCOME.SALARY',
  'Income': 'INCOME.SALARY',
  'Uncategorized': null,
});

function getCategoryById(categoryId) {
  if (!categoryId) return null;
  if (CATEGORY_BY_ID[categoryId]) return CATEGORY_BY_ID[categoryId];
  if (PARENT_CATEGORIES[categoryId]) return PARENT_CATEGORIES[categoryId];
  return null;
}

function getCategoryDisplayName(categoryId) {
  if (!categoryId) return 'Uncategorized';
  const entry = getCategoryById(categoryId);
  return entry ? entry.display_name : categoryId;
}

function migrateLegacyCategory(rawCategory) {
  if (!rawCategory) return null;
  if (CATEGORY_BY_ID[rawCategory] || PARENT_CATEGORIES[rawCategory]) {
    return rawCategory;
  }
  if (Object.prototype.hasOwnProperty.call(LEGACY_CATEGORY_MAP, rawCategory)) {
    return LEGACY_CATEGORY_MAP[rawCategory];
  }
  const upper = String(rawCategory).trim().toUpperCase();
  if (CATEGORY_BY_ID[upper] || PARENT_CATEGORIES[upper]) {
    return upper;
  }
  return 'MISC.OTHER';
}

function isFixedCategory(categoryId) {
  const cat = getCategoryById(categoryId);
  return Boolean(cat && cat.nature === 'FIXED');
}

function isEssentialCategory(categoryId) {
  const cat = getCategoryById(categoryId);
  return Boolean(cat && cat.essentiality === 'ESSENTIAL');
}

function isValidCategoryId(categoryId, allowParent = true) {
  if (!categoryId || typeof categoryId !== 'string') return false;
  if (CATEGORY_BY_ID[categoryId]) return true;
  if (allowParent && PARENT_CATEGORIES[categoryId]) return true;
  return false;
}

module.exports = {
  TAXONOMY_VERSION,
  CATEGORIES,
  PARENT_CATEGORIES,
  CATEGORY_BY_ID,
  LEGACY_CATEGORY_MAP,
  getCategoryById,
  getCategoryDisplayName,
  migrateLegacyCategory,
  isFixedCategory,
  isEssentialCategory,
  isValidCategoryId,
};
