/**
 * Shared Identifier Conventions (SC §4.1)
 * Format: <prefix>_<26-char Crockford base32 ULID>
 */

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const VALID_PREFIXES = new Set([
  'usr', 'acc', 'txn', 'g', 'cap', 'bil', 'alr', 'prp', 'act', 'snap',
  'trs', 'req', 'trc', 'tsk', 'evt', 'thr', 'trn', 'mf', 'itk', 'cnf'
]);

let lastTime = 0;
let lastRandom = new Array(16).fill(0);

function encodeTime(now, len = 10) {
  let str = '';
  let t = now;
  for (let i = len - 1; i >= 0; i--) {
    const mod = t % 32;
    str = CROCKFORD.charAt(mod) + str;
    t = Math.floor(t / 32);
  }
  return str;
}

function encodeRandom(len = 16) {
  const bytes = [];
  for (let i = 0; i < len; i++) {
    bytes.push(Math.floor(Math.random() * 32));
  }
  return bytes;
}

function incrementRandom(arr) {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] < 31) {
      arr[i]++;
      return arr;
    }
    arr[i] = 0;
  }
  return arr;
}

function generateUlid(seedTime = Date.now()) {
  const now = Number(seedTime) || Date.now();
  if (now === lastTime) {
    lastRandom = incrementRandom(lastRandom);
  } else {
    lastTime = now;
    lastRandom = encodeRandom(16);
  }
  const timePart = encodeTime(now, 10);
  const randPart = lastRandom.map((idx) => CROCKFORD[idx]).join('');
  return timePart + randPart;
}

function newId(prefix) {
  const cleanPrefix = String(prefix).replace(/_$/, '');
  if (!VALID_PREFIXES.has(cleanPrefix)) {
    throw new Error(`Invalid ID prefix: ${cleanPrefix}`);
  }
  return `${cleanPrefix}_${generateUlid()}`;
}

function deterministicId(prefix, numericOrStringKey) {
  const cleanPrefix = String(prefix).replace(/_$/, '');
  const raw = String(numericOrStringKey)
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/[ILOU]/g, '0');
  const padded = raw.padStart(26, '0').slice(-26);
  return `${cleanPrefix}_${padded}`;
}

function isValidId(id, expectedPrefix = null) {
  if (typeof id !== 'string') return false;
  if (expectedPrefix) {
    const clean = expectedPrefix.replace(/_$/, '');
    const regex = new RegExp(`^${clean}_[0-9A-HJKMNP-TV-Z]{26}$`);
    return regex.test(id);
  }
  return /^[a-z]{1,4}_[0-9A-HJKMNP-TV-Z]{26}$/.test(id);
}

function toCanonicalUserId(userId) {
  if (typeof userId === 'string' && userId.startsWith('usr_')) return userId;
  return deterministicId('usr', userId);
}

function toNumericUserId(userId) {
  if (typeof userId === 'number') return userId;
  if (typeof userId === 'string') {
    if (userId.startsWith('usr_')) {
      const tail = userId.slice(4).replace(/^0+/, '');
      const n = parseInt(tail, 10);
      return Number.isFinite(n) ? n : 1;
    }
    const n = parseInt(userId, 10);
    if (Number.isFinite(n)) return n;
  }
  return 1;
}

module.exports = {
  VALID_PREFIXES,
  generateUlid,
  newId,
  deterministicId,
  isValidId,
  toCanonicalUserId,
  toNumericUserId,
};
