import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseInteger, formatInteger, allBases, divisionSteps, twosRange, toTwosComplement, fromTwosComplement,
  floatToBits, bitsToFloat, bitsToHex, hexToBits, explainFloat, storeDecimal, exactDecimal,
} from '../src/convert.js';

// ---------- Bases ----------

test('parses integers in every base, with prefixes and separators', () => {
  assert.equal(parseInteger('1010', 2), 10n);
  assert.equal(parseInteger('0b1111_0000', 2), 240n);
  assert.equal(parseInteger('777', 8), 511n);
  assert.equal(parseInteger('255', 10), 255n);
  assert.equal(parseInteger('0xFF', 16), 255n);
  assert.equal(parseInteger('ff ff', 16), 65535n);
  assert.equal(parseInteger('-42', 10), -42n);
});

test('rejects invalid digits and mismatched prefixes with a clear message', () => {
  assert.throws(() => parseInteger('102', 2), /"2" isn't a valid binary digit/);
  assert.throws(() => parseInteger('G1', 16), /"G" isn't a valid hexadecimal digit/);
  assert.throws(() => parseInteger('0x10', 2), /doesn't match/);
  assert.throws(() => parseInteger('   ', 10), /Enter a number/);
});

test('handles numbers far beyond 64 bits exactly', () => {
  const big = parseInteger('123456789012345678901234567890', 10);
  assert.equal(parseInteger(formatInteger(big, 16, { group: false }), 16), big);
});

test('formats with readable grouping', () => {
  assert.equal(formatInteger(10n, 2), '1010');
  assert.equal(formatInteger(255n, 2), '1111 1111');
  assert.equal(formatInteger(5n, 2), '0101');
  assert.equal(formatInteger(65535n, 16), 'FFFF');
  assert.equal(formatInteger(1048575n, 16), 'F FFFF');
  assert.equal(formatInteger(-10n, 2), '-1010');
});

test('allBases gives every base at once', () => {
  assert.deepEqual(allBases(255n), { 2: '1111 1111', 8: '377', 10: '255', 16: 'FF' });
});

test('repeated-division steps produce the digits in reverse', () => {
  const steps = divisionSteps(13n, 2);
  assert.deepEqual(steps.map((s) => s.digit), ['1', '0', '1', '1']);
  assert.equal(steps.map((s) => s.digit).reverse().join(''), '1101');
  assert.deepEqual(divisionSteps(0n, 2).map((s) => s.digit), ['0']);
});

// ---------- Two's complement ----------

test('two\'s complement ranges', () => {
  assert.deepEqual(twosRange(8), { min: -128n, max: 127n });
  assert.deepEqual(twosRange(16), { min: -32768n, max: 32767n });
});

test('encodes known two\'s complement values', () => {
  assert.equal(toTwosComplement(-1n, 8), '11111111');
  assert.equal(toTwosComplement(-128n, 8), '10000000');
  assert.equal(toTwosComplement(127n, 8), '01111111');
  assert.equal(toTwosComplement(-5n, 8), '11111011');
  assert.equal(toTwosComplement(0n, 16), '0000000000000000');
  assert.equal(toTwosComplement(-1n, 64), '1'.repeat(64));
});

test('refuses values that don\'t fit the width', () => {
  assert.throws(() => toTwosComplement(128n, 8), /doesn't fit in 8 bits/);
  assert.throws(() => toTwosComplement(-129n, 8), /doesn't fit/);
  assert.throws(() => toTwosComplement(1n, 12), /Width must be/);
});

test('decodes two\'s complement and round-trips every 8-bit value', () => {
  assert.equal(fromTwosComplement('11111011'), -5n);
  assert.equal(fromTwosComplement('0111 1111'), 127n);
  for (let v = -128n; v <= 127n; v += 1n) {
    assert.equal(fromTwosComplement(toTwosComplement(v, 8)), v);
  }
  assert.throws(() => fromTwosComplement('1012'), /only 0 and 1/);
  assert.throws(() => fromTwosComplement('101'), /exactly/);
});

// ---------- IEEE 754 ----------

test('known 32-bit IEEE 754 encodings', () => {
  assert.equal(bitsToHex(floatToBits(1, 32)), '3F80 0000');
  assert.equal(bitsToHex(floatToBits(-2.5, 32)), 'C020 0000');
  assert.equal(bitsToHex(floatToBits(0.1, 32)), '3DCC CCCD');
  assert.equal(bitsToHex(floatToBits(Infinity, 32)), '7F80 0000');
  assert.equal(bitsToHex(floatToBits(-0, 32)), '8000 0000');
});

test('known 64-bit IEEE 754 encoding of 0.1', () => {
  assert.equal(bitsToHex(floatToBits(0.1, 64)), '3FB9 9999 9999 999A');
});

test('bits round-trip back to the same number', () => {
  for (const n of [0, 1, -1, 0.5, 3.14159, -1234.5678, 1e-30, 6.02e23]) {
    assert.equal(bitsToFloat(floatToBits(n, 64)), n);
    assert.equal(bitsToFloat(floatToBits(n, 32)), Math.fround(n));
  }
  assert.equal(bitsToFloat(hexToBits('3F800000', 32)), 1);
});

test('explains a normal float: sign, exponent, mantissa', () => {
  const e = explainFloat(floatToBits(-2.5, 32));
  assert.equal(e.sign, '1');
  assert.equal(e.exponent, '10000000');
  assert.equal(e.storedExponent, 128);
  assert.equal(e.realExponent, 1);
  assert.equal(e.mantissa, '01000000000000000000000');
  assert.equal(e.category, 'Normal');
});

test('recognises zero, subnormal, infinity and NaN', () => {
  assert.equal(explainFloat('0'.repeat(32)).category, 'Zero');
  assert.equal(explainFloat('0'.repeat(31) + '1').category, 'Subnormal');
  assert.equal(explainFloat(hexToBits('7F800000', 32)).category, 'Infinity');
  assert.equal(explainFloat(hexToBits('7FC00000', 32)).category, 'NaN');
  assert.equal(bitsToFloat('0'.repeat(31) + '1'), 1.401298464324817e-45);
});

test('exact decimal value of what is actually stored', () => {
  assert.equal(exactDecimal(floatToBits(0.1, 32)), '0.100000001490116119384765625');
  assert.equal(exactDecimal(floatToBits(0.1, 64)), '0.1000000000000000055511151231257827021181583404541015625');
  assert.equal(exactDecimal(floatToBits(0.5, 32)), '0.5');
  assert.equal(exactDecimal(floatToBits(-2.5, 32)), '-2.5');
  assert.equal(exactDecimal(floatToBits(16777216, 32)), '16777216');
});

test('storeDecimal shows which inputs are exact', () => {
  assert.equal(storeDecimal('0.1', 32).isExact, false);
  assert.equal(storeDecimal('0.5', 32).isExact, true);
  assert.equal(storeDecimal('-2.50', 32).isExact, true);
  assert.equal(storeDecimal('16777217', 32).isExact, false); // 2^24 + 1 can't be stored in a float
  assert.equal(storeDecimal('16777217', 64).isExact, true);
  assert.throws(() => storeDecimal('abc', 32), /Enter a decimal/);
});
