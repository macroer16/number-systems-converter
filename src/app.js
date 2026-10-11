// Browser UI. All conversions live in convert.js (tested separately).
import {
  parseInteger, allBases, divisionSteps, toTwosComplement, twosRange,
  floatToBits, bitsToHex, hexToBits, explainFloat, storeDecimal, exactDecimal, FORMATS,
} from './convert.js';

const $ = (id) => document.getElementById(id);

// ---------------- Bases ----------------
const baseInputs = [...document.querySelectorAll('[data-base]')];

function updateBases(source) {
  const base = Number(source.dataset.base);
  const err = $('base-error');
  if (source.value.trim() === '') {
    baseInputs.forEach((i) => { if (i !== source) i.value = ''; });
    err.hidden = true;
    renderSteps(null);
    return;
  }
  try {
    const value = parseInteger(source.value, base);
    const all = allBases(value);
    for (const input of baseInputs) {
      if (input !== source) input.value = all[input.dataset.base];
      input.removeAttribute('aria-invalid');
    }
    err.hidden = true;
    renderSteps(value);
  } catch (e) {
    source.setAttribute('aria-invalid', 'true');
    err.textContent = e.message;
    err.hidden = false;
  }
}

function renderSteps(value) {
  const body = $('steps-body');
  if (value === null || value < 0n) { body.innerHTML = '<p>Enter a positive number to see the working.</p>'; return; }
  const steps = divisionSteps(value, 2, 40);
  const rows = steps.map((s) => `<tr><td>${s.dividend} ÷ 2</td><td>${s.quotient}</td><td class="mono">${s.digit}</td></tr>`).join('');
  const more = steps.length === 40 ? '<p>Showing the first 40 steps.</p>' : '';
  body.innerHTML = `
    <table><thead><tr><th scope="col">Divide</th><th scope="col">Result</th><th scope="col">Remainder</th></tr></thead><tbody>${rows}</tbody></table>
    ${more}<p>Read the remainders from bottom to top: <span class="mono">${steps.map((s) => s.digit).reverse().join('')}</span></p>`;
}

baseInputs.forEach((input) => input.addEventListener('input', () => updateBases(input)));
$('base-steps').addEventListener('toggle', () => {});
baseInputs.find((i) => i.dataset.base === '10').value = '2026';
updateBases(baseInputs.find((i) => i.dataset.base === '10'));

// ---------------- Two's complement ----------------
function updateTwos() {
  const width = Number($('twos-width').value);
  const err = $('twos-error');
  try {
    const value = parseInteger($('twos-value').value, 10);
    const bits = toTwosComplement(value, width);
    $('twos-bits').innerHTML = [...bits].map((b, i) =>
      `<span class="bit${i === 0 ? ' bit-sign' : ''}" title="${i === 0 ? `Weight −2^${width - 1}` : `Weight 2^${width - 1 - i}`}">${b}</span>`
    ).join('');
    const { min, max } = twosRange(width);
    $('twos-note').textContent = `In ${width} bits you can store ${min} to ${max}. The first bit is worth −2^${width - 1}.`;
    err.hidden = true;
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
    $('twos-bits').innerHTML = '';
  }
}
$('twos-value').addEventListener('input', updateTwos);
$('twos-width').addEventListener('change', updateTwos);
updateTwos();

// ---------------- IEEE 754 ----------------
let fpBits = '';

function renderFloat(bits, { fromBits = false } = {}) {
  fpBits = bits;
  const width = bits.length;
  const f = FORMATS[width];
  const e = explainFloat(bits);
  const cls = (i) => (i === 0 ? 'sign' : i <= f.exponentBits ? 'exp' : 'man');

  $('fp-bits').innerHTML = [...bits].map((b, i) =>
    `<button type="button" class="bit bit-${cls(i)}" data-i="${i}" aria-label="Bit ${width - 1 - i}, ${cls(i) === 'man' ? 'mantissa' : cls(i) === 'exp' ? 'exponent' : 'sign'}, currently ${b}" aria-pressed="${b === '1'}">${b}</button>`
  ).join('');

  $('fp-hex').value = bitsToHex(bits);
  const sci = Number.isFinite(e.value) ? e.value : String(e.value);
  $('fp-explain').innerHTML = `
    <div><dt>Sign</dt><dd><span class="mono">${e.sign}</span>, ${e.sign === '1' ? 'negative' : 'positive'}</dd></div>
    <div><dt>Exponent</dt><dd><span class="mono">${e.exponent}</span> = ${e.storedExponent}${e.realExponent !== null ? `, minus the bias ${f.bias} = <strong>${e.realExponent}</strong>` : ''}</dd></div>
    <div><dt>Mantissa</dt><dd><span class="mono man-text">${e.mantissa}</span></dd></div>
    <div><dt>Type</dt><dd>${e.category}</dd></div>
    <div><dt>Formula</dt><dd>${e.formula}</dd></div>
    <div><dt>Value</dt><dd class="value">${sci}</dd></div>`;

  if (fromBits) $('fp-input').value = Number.isNaN(e.value) ? 'NaN' : String(e.value);
  const exact = exactDecimal(bits);
  const typed = $('fp-input').value.trim();
  let note = '';
  if (!fromBits && e.category === 'Normal' || !fromBits && e.category === 'Subnormal') {
    try {
      const r = storeDecimal(typed, width);
      note = r.isExact
        ? `<p class="ok"><strong>${typed} is stored exactly.</strong></p>`
        : `<p class="warn"><strong>${typed} can't be stored exactly in binary.</strong> The nearest ${width}-bit value is:</p>`;
    } catch { /* ignore */ }
  }
  $('fp-precision').innerHTML = ['Normal', 'Subnormal'].includes(e.category)
    ? `${note}<p class="exact"><span class="label">Exact value stored</span> <span class="mono">${exact}</span></p>`
    : '';
}

function fromDecimal() {
  const width = Number($('fp-width').value);
  const err = $('fp-error');
  try {
    const r = storeDecimal($('fp-input').value, width);
    err.hidden = true;
    renderFloat(r.bits);
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
  }
}

$('fp-input').addEventListener('input', fromDecimal);
$('fp-width').addEventListener('change', fromDecimal);
$('fp-hex').addEventListener('change', () => {
  const width = Number($('fp-width').value);
  try {
    renderFloat(hexToBits($('fp-hex').value, width), { fromBits: true });
    $('fp-error').hidden = true;
  } catch (e) {
    $('fp-error').textContent = e.message;
    $('fp-error').hidden = false;
  }
});
$('fp-bits').addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-i]');
  if (!btn) return;
  const i = Number(btn.dataset.i);
  const flipped = fpBits.slice(0, i) + (fpBits[i] === '1' ? '0' : '1') + fpBits.slice(i + 1);
  renderFloat(flipped, { fromBits: true });
  $('fp-bits').querySelector(`[data-i="${i}"]`).focus();
});

fromDecimal();
