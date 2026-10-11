/**
 * Step 5: Merchant Alias & VPA Prefix Dictionary (Categorizer §B.2 step 5)
 */

const MERCHANT_ALIASES = Object.freeze([
  // Food Delivery
  { merchant_id: 'mer_swiggy', display_name: 'Swiggy', category_id: 'FOOD.DELIVERY', patterns: ['SWIGGY', 'BUNDL TECHNOLOGIES'], vpa_prefixes: ['swiggy'], confidence_bp: 9400 },
  { merchant_id: 'mer_zomato', display_name: 'Zomato', category_id: 'FOOD.DELIVERY', patterns: ['ZOMATO'], vpa_prefixes: ['zomato'], confidence_bp: 9400 },
  { merchant_id: 'mer_eatsure', display_name: 'EatSure', category_id: 'FOOD.DELIVERY', patterns: ['EATSURE', 'REBEL FOODS'], vpa_prefixes: ['eatsure'], confidence_bp: 9200 },

  // Groceries
  { merchant_id: 'mer_bigbasket', display_name: 'BigBasket', category_id: 'FOOD.GROCERIES', patterns: ['BIGBASKET', 'SUPERMARKET GROCERY'], vpa_prefixes: ['bigbasket'], confidence_bp: 9400 },
  { merchant_id: 'mer_blinkit', display_name: 'Blinkit', category_id: 'FOOD.GROCERIES', patterns: ['BLINKIT', 'GROFERS'], vpa_prefixes: ['blinkit', 'grofers'], confidence_bp: 9300 },
  { merchant_id: 'mer_zepto', display_name: 'Zepto', category_id: 'FOOD.GROCERIES', patterns: ['ZEPTO', 'KIRANAKART'], vpa_prefixes: ['zepto'], confidence_bp: 9300 },
  { merchant_id: 'mer_dmart', display_name: 'DMart', category_id: 'FOOD.GROCERIES', patterns: ['DMART', 'AVENUE SUPERMARTS'], vpa_prefixes: ['dmart'], confidence_bp: 9400 },
  { merchant_id: 'mer_instamart', display_name: 'Swiggy Instamart', category_id: 'FOOD.GROCERIES', patterns: ['INSTAMART'], vpa_prefixes: ['instamart'], confidence_bp: 9200 },

  // Dining
  { merchant_id: 'mer_starbucks', display_name: 'Starbucks', category_id: 'FOOD.DINING', patterns: ['STARBUCKS', 'TATA STARBUCKS'], vpa_prefixes: ['starbucks'], confidence_bp: 9200 },
  { merchant_id: 'mer_mcdonalds', display_name: "McDonald's", category_id: 'FOOD.DINING', patterns: ['MCDONALD', 'HARDCASTLE RESTAURANTS'], vpa_prefixes: ['mcdonalds'], confidence_bp: 9100 },
  { merchant_id: 'mer_dominos', display_name: "Domino's Pizza", category_id: 'FOOD.DINING', patterns: ['DOMINOS', 'JUBILANT FOODWORKS'], vpa_prefixes: ['dominos'], confidence_bp: 9100 },
  { merchant_id: 'mer_thirdwave', display_name: 'Third Wave Coffee', category_id: 'FOOD.DINING', patterns: ['THIRD WAVE COFFEE', 'HEiset'], vpa_prefixes: ['thirdwave'], confidence_bp: 9000 },

  // Transport - Cabs & Transit
  { merchant_id: 'mer_uber', display_name: 'Uber', category_id: 'TRANSPORT.CAB_TRANSIT', patterns: ['UBER INDIA', 'UBER TRIP', 'UBER BV', 'UBER'], vpa_prefixes: ['uber'], confidence_bp: 9300 },
  { merchant_id: 'mer_ola', display_name: 'Ola Cabs', category_id: 'TRANSPORT.CAB_TRANSIT', patterns: ['OLA CABS', 'ANI TECHNOLOGIES', 'OLACABS'], vpa_prefixes: ['olacabs', 'ola'], confidence_bp: 9300 },
  { merchant_id: 'mer_rapido', display_name: 'Rapido', category_id: 'TRANSPORT.CAB_TRANSIT', patterns: ['RAPIDO', 'ROPPEN TRANSPORTATION'], vpa_prefixes: ['rapido'], confidence_bp: 9300 },
  { merchant_id: 'mer_nammayatri', display_name: 'Namma Yatri', category_id: 'TRANSPORT.CAB_TRANSIT', patterns: ['NAMMA YATRI', 'JUSPAY'], vpa_prefixes: ['nammayatri'], confidence_bp: 9100 },
  { merchant_id: 'mer_metro', display_name: 'Metro Rail', category_id: 'TRANSPORT.CAB_TRANSIT', patterns: ['BMRCL', 'DMRC', 'CMRL', 'MMRDA METRO'], vpa_prefixes: ['bmrcl', 'dmrc'], confidence_bp: 9300 },

  // Transport - Fuel
  { merchant_id: 'mer_iocl', display_name: 'IndianOil', category_id: 'TRANSPORT.FUEL', patterns: ['INDIAN OIL', 'IOCL', 'PETROL PUMP'], vpa_prefixes: ['iocl'], confidence_bp: 9200 },
  { merchant_id: 'mer_hpcl', display_name: 'HPCL Fuel', category_id: 'TRANSPORT.FUEL', patterns: ['HINDUSTAN PETROLEUM', 'HPCL', 'HP PAY'], vpa_prefixes: ['hpcl'], confidence_bp: 9200 },
  { merchant_id: 'mer_bpcl', display_name: 'Bharat Petroleum', category_id: 'TRANSPORT.FUEL', patterns: ['BHARAT PETROLEUM', 'BPCL'], vpa_prefixes: ['bpcl'], confidence_bp: 9200 },
  { merchant_id: 'mer_shell', display_name: 'Shell Fuel', category_id: 'TRANSPORT.FUEL', patterns: ['SHELL INDIA'], vpa_prefixes: ['shell'], confidence_bp: 9200 },

  // Subscriptions
  { merchant_id: 'mer_netflix', display_name: 'Netflix', category_id: 'SUBSCRIPTIONS.STREAMING', patterns: ['NETFLIX'], vpa_prefixes: ['netflix'], confidence_bp: 9600 },
  { merchant_id: 'mer_spotify', display_name: 'Spotify', category_id: 'SUBSCRIPTIONS.STREAMING', patterns: ['SPOTIFY'], vpa_prefixes: ['spotify'], confidence_bp: 9600 },
  { merchant_id: 'mer_hotstar', display_name: 'JioHotstar', category_id: 'SUBSCRIPTIONS.STREAMING', patterns: ['HOTSTAR', 'DISNEY PLUS', 'JIOHOTSTAR', 'NOVI DIGITAL'], vpa_prefixes: ['hotstar'], confidence_bp: 9500 },
  { merchant_id: 'mer_youtube', display_name: 'YouTube Premium', category_id: 'SUBSCRIPTIONS.STREAMING', patterns: ['YOUTUBE PREMIUM', 'GOOGLE YOUTUBE'], vpa_prefixes: ['youtube'], confidence_bp: 9400 },
  { merchant_id: 'mer_prime', display_name: 'Amazon Prime', category_id: 'SUBSCRIPTIONS.STREAMING', patterns: ['AMAZON PRIME'], vpa_prefixes: ['amazonprime'], confidence_bp: 9400 },
  { merchant_id: 'mer_openai', display_name: 'OpenAI', category_id: 'SUBSCRIPTIONS.SOFTWARE_NEWS', patterns: ['OPENAI', 'CHATGPT'], vpa_prefixes: [], confidence_bp: 9500 },
  { merchant_id: 'mer_github', display_name: 'GitHub', category_id: 'SUBSCRIPTIONS.SOFTWARE_NEWS', patterns: ['GITHUB'], vpa_prefixes: [], confidence_bp: 9500 },
  { merchant_id: 'mer_adobe', display_name: 'Adobe', category_id: 'SUBSCRIPTIONS.SOFTWARE_NEWS', patterns: ['ADOBE SYSTEMS', 'ADOBE'], vpa_prefixes: [], confidence_bp: 9500 },
  { merchant_id: 'mer_apple', display_name: 'Apple Services', category_id: 'SUBSCRIPTIONS.SOFTWARE_NEWS', patterns: ['APPLE SERVICES', 'APPLE.COM/BILL', 'ICLOUD'], vpa_prefixes: ['apple'], confidence_bp: 9200 },

  // Shopping
  { merchant_id: 'mer_amazon', display_name: 'Amazon', category_id: 'SHOPPING.GENERAL', patterns: ['AMAZON PAY INDIA', 'AMAZON SELLER', 'AMAZON IN', 'AMAZON'], vpa_prefixes: ['amazon', 'apl'], confidence_bp: 8200 }, // Marketplace -> MEDIUM if no user rule
  { merchant_id: 'mer_flipkart', display_name: 'Flipkart', category_id: 'SHOPPING.GENERAL', patterns: ['FLIPKART'], vpa_prefixes: ['flipkart'], confidence_bp: 8200 },
  { merchant_id: 'mer_myntra', display_name: 'Myntra', category_id: 'SHOPPING.GENERAL', patterns: ['MYNTRA'], vpa_prefixes: ['myntra'], confidence_bp: 9200 },
  { merchant_id: 'mer_nykaa', display_name: 'Nykaa', category_id: 'PERSONAL_CARE.GROOMING', patterns: ['NYKAA', 'FSN E COMMERCE'], vpa_prefixes: ['nykaa'], confidence_bp: 9100 },
  { merchant_id: 'mer_croma', display_name: 'Croma', category_id: 'SHOPPING.ELECTRONICS', patterns: ['CROMA', 'INFINITI RETAIL'], vpa_prefixes: ['croma'], confidence_bp: 9300 },
  { merchant_id: 'mer_reliancedigital', display_name: 'Reliance Digital', category_id: 'SHOPPING.ELECTRONICS', patterns: ['RELIANCE DIGITAL'], vpa_prefixes: ['reliancedigital'], confidence_bp: 9300 },

  // Utilities
  { merchant_id: 'mer_airtel', display_name: 'Airtel', category_id: 'UTILITIES.INTERNET_MOBILE', patterns: ['BHARTI AIRTEL', 'AIRTEL'], vpa_prefixes: ['airtel'], confidence_bp: 9400 },
  { merchant_id: 'mer_jio', display_name: 'Reliance Jio', category_id: 'UTILITIES.INTERNET_MOBILE', patterns: ['RELIANCE JIO', 'JIO INFOCOMM', 'JIOFIBER'], vpa_prefixes: ['jio'], confidence_bp: 9400 },
  { merchant_id: 'mer_act', display_name: 'ACT Fibernet', category_id: 'UTILITIES.INTERNET_MOBILE', patterns: ['ACT FIBERNET', 'ATRIA CONVERGENCE'], vpa_prefixes: ['actfibernet'], confidence_bp: 9400 },
  { merchant_id: 'mer_bescom', display_name: 'BESCOM Electricity', category_id: 'UTILITIES.ELECTRICITY', patterns: ['BESCOM', 'TATA POWER', 'ADANI ELECTRICITY', 'MSEB', 'MAHADISCOM'], vpa_prefixes: ['bescom', 'tatapower'], confidence_bp: 9500 },

  // Health
  { merchant_id: 'mer_apollo', display_name: 'Apollo Pharmacy', category_id: 'HEALTH.PHARMACY_FITNESS', patterns: ['APOLLO PHARMACY', 'APOLLO HOSPITALS'], vpa_prefixes: ['apollopharmacy'], confidence_bp: 9300 },
  { merchant_id: 'mer_1mg', display_name: 'Tata 1mg', category_id: 'HEALTH.PHARMACY_FITNESS', patterns: ['TATA 1MG', '1MG TECHNOLOGIES'], vpa_prefixes: ['1mg'], confidence_bp: 9300 },
  { merchant_id: 'mer_cultfit', display_name: 'Cult.fit', category_id: 'HEALTH.PHARMACY_FITNESS', patterns: ['CULTFIT', 'CUREFIT', 'CULT.FIT'], vpa_prefixes: ['cultfit'], confidence_bp: 9200 },

  // Entertainment & Travel
  { merchant_id: 'mer_bookmyshow', display_name: 'BookMyShow', category_id: 'ENTERTAINMENT.LEISURE', patterns: ['BOOKMYSHOW', 'BIGTREE ENTERTAINMENT', 'PVR INOX'], vpa_prefixes: ['bookmyshow', 'pvr'], confidence_bp: 9300 },
  { merchant_id: 'mer_makemytrip', display_name: 'MakeMyTrip', category_id: 'TRAVEL.STAYS_TICKETS', patterns: ['MAKEMYTRIP', 'GOIBIBO'], vpa_prefixes: ['makemytrip', 'goibibo'], confidence_bp: 9400 },
  { merchant_id: 'mer_irctc', display_name: 'IRCTC Railways', category_id: 'TRAVEL.STAYS_TICKETS', patterns: ['IRCTC'], vpa_prefixes: ['irctc'], confidence_bp: 9500 },
  { merchant_id: 'mer_indigo', display_name: 'IndiGo Airlines', category_id: 'TRAVEL.STAYS_TICKETS', patterns: ['INDIGO AIRLINES', 'INTERGLOBE AVIATION', 'AIR INDIA', 'VISTARA'], vpa_prefixes: ['indigo'], confidence_bp: 9500 },
]);

function resolveMerchant(normalizedDesc = '', vpa = null) {
  const desc = String(normalizedDesc || '').toUpperCase();
  const cleanVpa = vpa ? String(vpa).toLowerCase() : '';

  if (cleanVpa) {
    const vpaLocal = cleanVpa.split('@')[0];
    for (const entry of MERCHANT_ALIASES) {
      if (entry.vpa_prefixes.some((prefix) => vpaLocal.startsWith(prefix))) {
        return entry;
      }
    }
  }

  for (const entry of MERCHANT_ALIASES) {
    if (entry.patterns.some((pat) => desc.includes(pat))) {
      return entry;
    }
  }

  return null;
}

module.exports = {
  MERCHANT_ALIASES,
  resolveMerchant,
};
