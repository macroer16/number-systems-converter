// Number-system conversions: bases, two's complement and IEEE 754.
// Pure functions (no DOM) so everything is unit-tested in Node.
// Integers use BigInt, so very large values convert exactly.

export const BASES = Object.freeze({ 2: 'Binary', 8: 'Octal', 10: 'Decimal', 16: 'Hexadecimal' });
const DIGITS = '0123456789ABCDEF';
const PREFIX = { '0b': 2, '0o': 8, '0x': 16 };

/**
 * Parse an integer string in the given base into a BigInt.
 * Accepts an optional minus sign, a matching prefix (0b, 0o, 0x), spaces and underscores as separators.
 */
export function parseInteger(input, base) {
  if (!(base in BASES)) throw new Error(`Unsupported base: ${base}`);
  let s = String(input).trim().replace(/[\s_]/g, '').toUpperCase();
  let negative = false;
  if (s.startsWith('-')) { negative = true; s = s.slice(1); }
  const prefix = s.slice(0, 2).toLowerCase();
  if (prefix in PREFIX) {
    if (PREFIX[prefix] !== base) throw new Error(`The prefix ${prefix} doesn't match base ${base}`);
    s = s.slice(2);
  }
  if (s === '') throw new Error('Enter a number');
  let value = 0n;
  const b = BigInt(base);
  for (const ch of s) {
    const d = DIGITS.indexOf(ch);
    if (d === -1 || d >= base) throw new Error(`"${ch}" isn't a valid ${BASES[base].toLowerCase()} digit`);
    value = value * b + BigInt(d);
  }
  return negative ? -value : value;
}

/** Format a BigInt in a base. Binary is grouped in 4s and hex in 4s for readability. */
export function formatInteger(value, base, { group = true } = {}) {
  const negative = value < 0n;
  let digits = (negative ? -value : value).toString(base).toUpperCase();
  if (group && (base === 2 || base === 16)) {
    const size = 4;
    const padded = digits.padStart(Math.ceil(digits.length / size) * size, '0');
    digits = padded.match(new RegExp(`.{${size}}`, 'g')).join(' ');
    if (base === 16) digits = digits.replace(/^0+(?=\w)/, '');
  }
  return (negative ? '-' : '') + digits;
}

/** Convert a non-negative integer to every base at once. */
export function allBases(value) {
  return Object.fromEntries(Object.keys(BASES).map((b) => [b, formatInteger(value, Number(b))]));
}

/**
 * Step-by-step "repeated division" working for converting decimal to another base.
 * Returns rows like { dividend, quotient, remainder, digit }.
 */
export function divisionSteps(value, base, maxSteps = 64) {
  if (value < 0n) throw new Error('Steps are shown for positive numbers');
  const steps = [];
  let n = value;
  const b = BigInt(base);
  if (n === 0n) return [{ dividend: 0n, quotient: 0n, remainder: 0n, digit: '0' }];
  while (n > 0n && steps.length < maxSteps) {
    const q = n / b;
    const r = n % b;
    steps.push({ dividend: n, quotient: q, remainder: r, digit: DIGITS[Number(r)] });
    n = q;
  }
  return steps;
}

// ---------------- Two's complement ----------------

export const WIDTHS = Object.freeze([8, 16, 32, 64]);

/** Smallest and largest value that fits in `bits` bits using two's complement. */
export function twosRange(bits) {
  const half = 1n << BigInt(bits - 1);
  return { min: -half, max: half - 1n };
}

/** Encode a signed integer as a two's complement bit string of the given width. */
export function toTwosComplement(value, bits) {
  if (!WIDTHS.includes(bits)) throw new Error(`Width must be one of ${WIDTHS.join(', ')}`);
  const { min, max } = twosRange(bits);
  if (value < min || value > max) {
    throw new Error(`${value} doesn't fit in ${bits} bits (range ${min} to ${max})`);
  }
  const unsigned = value < 0n ? (1n << BigInt(bits)) + value : value;
  return unsigned.toString(2).padStart(bits, '0');
}

/** Decode a two's complement bit string back to a signed integer. */
export function fromTwosComplement(bitString) {
  const s = bitString.replace(/[\s_]/g, '');
  if (!/^[01]+$/.test(s)) throw new Error('Use only 0 and 1');
  if (!WIDTHS.includes(s.length)) throw new Error(`Enter exactly ${WIDTHS.join(', ')} bits (you entered ${s.length})`);
  const unsigned = BigInt(`0b${s}`);
  return s[0] === '1' ? unsigned - (1n << BigInt(s.length)) : unsigned;
}

// ---------------- IEEE 754 ----------------

export const FORMATS = Object.freeze({
  32: { name: 'Single precision (float)', exponentBits: 8, mantissaBits: 23, bias: 127 },
  64: { name: 'Double precision (double)', exponentBits: 11, mantissaBits: 52, bias: 1023 },
});

/** Bits of a number stored as a 32- or 64-bit IEEE 754 float, as a string of 0s and 1s. */
export function floatToBits(number, width) {
  const view = new DataView(new ArrayBuffer(8));
  if (width === 32) {
    view.setFloat32(0, number);
    return view.getUint32(0).toString(2).padStart(32, '0');
  }
  if (width === 64) {
    view.setFloat64(0, number);
    return view.getBigUint64(0).toString(2).padStart(64, '0');
  }
  throw new Error('Width must be 32 or 64');
}

/** The number represented by a 32- or 64-bit string of 0s and 1s. */
export function bitsToFloat(bitString) {
  const s = bitString.replace(/[\s_]/g, '');
  if (!/^[01]+$/.test(s) || (s.length !== 32 && s.length !== 64)) throw new Error('Enter exactly 32 or 64 bits');
  const view = new DataView(new ArrayBuffer(8));
  if (s.length === 32) {
    view.setUint32(0, Number.parseInt(s, 2) >>> 0);
    return view.getFloat32(0);
  }
  view.setBigUint64(0, BigInt(`0b${s}`));
  return view.getFloat64(0);
}

/** Hex form of a bit string, e.g. 3DCC CCCD. */
export function bitsToHex(bitString) {
  const hex = BigInt(`0b${bitString}`).toString(16).toUpperCase().padStart(bitString.length / 4, '0');
  return hex.match(/.{4}/g).join(' ');
}

export function hexToBits(hex, width) {
  const h = hex.replace(/[\s_]/g, '').replace(/^0x/i, '');
  if (!/^[0-9a-f]+$/i.test(h) || h.length !== width / 4) throw new Error(`Enter exactly ${width / 4} hex digits`);
  return BigInt(`0x${h}`).toString(2).padStart(width, '0');
}

/**
 * Break a float bit string into its parts and explain it.
 * Returns sign, exponent and mantissa bits, the category, the real exponent and the formula used.
 */
export function explainFloat(bitString) {
  const width = bitString.length;
  const f = FORMATS[width];
  if (!f) throw new Error('Enter exactly 32 or 64 bits');
  const sign = bitString[0];
  const exponent = bitString.slice(1, 1 + f.exponentBits);
  const mantissa = bitString.slice(1 + f.exponentBits);
  const storedExponent = Number.parseInt(exponent, 2);
  const allOnes = storedExponent === 2 ** f.exponentBits - 1;
  const mantissaZero = !mantissa.includes('1');
  const value = bitsToFloat(bitString);

  let category;
  let realExponent = null;
  let formula;
  const s = sign === '1' ? '−' : '+';
  if (storedExponent === 0 && mantissaZero) {
    category = 'Zero';
    formula = `Exponent and mantissa are all 0, so the value is ${s}0.`;
  } else if (storedExponent === 0) {
    category = 'Subnormal';
    realExponent = 1 - f.bias;
    formula = `${s} 0.mantissa × 2^${realExponent} (subnormal: no hidden 1, exponent fixed at ${realExponent})`;
  } else if (allOnes && mantissaZero) {
    category = 'Infinity';
    formula = `Exponent all 1s and mantissa 0 means ${s}∞.`;
  } else if (allOnes) {
    category = 'NaN';
    formula = 'Exponent all 1s and a non-zero mantissa means "Not a Number".';
  } else {
    category = 'Normal';
    realExponent = storedExponent - f.bias;
    formula = `${s} 1.mantissa × 2^(${storedExponent} − ${f.bias}) = ${s} 1.mantissa × 2^${realExponent}`;
  }

  return { width, sign, exponent, mantissa, storedExponent, realExponent, category, formula, value, bias: f.bias };
}

/**
 * Store a decimal in a float and compare. Shows why e.g. 0.1 isn't exact.
 * Returns the stored value, the error, and whether it was exact.
 */
export function storeDecimal(text, width) {
  const trimmed = String(text).trim();
  if (trimmed === '' || Number.isNaN(Number(trimmed)) && !/^[+-]?(inf|infinity|nan)$/i.test(trimmed)) {
    throw new Error('Enter a decimal number, like 0.1 or -2.5');
  }
  const lower = trimmed.toLowerCase();
  const input = /inf/.test(lower) ? (lower.startsWith('-') ? -Infinity : Infinity) : /nan/.test(lower) ? NaN : Number(trimmed);
  const stored = width === 32 ? Math.fround(input) : input;
  const bits = floatToBits(stored, width);
  const exact = Number.isFinite(input) ? exactDecimal(bits) : String(stored);
  const isExact = Number.isFinite(input) ? exact === normaliseDecimal(trimmed) : true;
  return { input, stored, bits, exact, isExact, error: Number.isFinite(input) ? stored - input : 0 };
}

/**
 * The exact decimal value of a float's bits (every binary fraction ends in 5 in decimal,
 * so this is always finite). Uses BigInt arithmetic so nothing is rounded.
 */
export function exactDecimal(bitString) {
  const { width, sign, exponent, mantissa, category } = explainFloat(bitString);
  const f = FORMATS[width];
  if (category === 'Zero') return sign === '1' ? '-0' : '0';
  if (category === 'Infinity' || category === 'NaN') return category;
  const stored = Number.parseInt(exponent, 2);
  let significand = BigInt(`0b${mantissa}`);
  let exp;
  if (category === 'Subnormal') {
    exp = 1 - f.bias - f.mantissaBits;
  } else {
    significand += 1n << BigInt(f.mantissaBits);
    exp = stored - f.bias - f.mantissaBits;
  }
  // value = significand × 2^exp
  let result;
  if (exp >= 0) {
    result = (significand << BigInt(exp)).toString();
  } else {
    const scale = BigInt(-exp);
    const numerator = significand * 5n ** scale; // × 10^k / 2^k = × 5^k, then shift the point k places
    let digits = numerator.toString().padStart(Number(scale) + 1, '0');
    const point = digits.length - Number(scale);
    result = `${digits.slice(0, point)}.${digits.slice(point)}`.replace(/\.?0+$/, '');
  }
  return (sign === '1' ? '-' : '') + result;
}

function normaliseDecimal(text) {
  let s = String(text).trim().replace(/^\+/, '');
  if (/e/i.test(s)) return String(Number(s));
  const negative = s.startsWith('-');
  if (negative) s = s.slice(1);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  s = s.replace(/^0+(?=\d)/, '');
  return (negative && s !== '0' ? '-' : '') + (s || '0');
}
