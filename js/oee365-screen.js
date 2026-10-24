/**
 * oee365-screen.js
 * Screen: OEE 365 (data-screen="oee365")
 */
const Oee365Screen = (() => {
  'use strict';

  const SCREEN = 'oee365';
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];
  const root = () => qs(`.sec[data-screen="${SCREEN}"], .sec.sec-oee365`);

  function formatPct(n) {
    if (n == null || Number.isNaN(Number(n))) return '0,00 %';
    return Number(n).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
  }

  function paint() {
    const sec = root();
    if (!sec) return;
    qsa('[data-oee365-pct]', sec).forEach((el) => {
      const pct = parseFloat(el.dataset.oee365Pct);
      el.classList.remove('val-good', 'val-bad', 'val-zero');
      if (pct >= 90) el.classList.add('val-good');
      else if (pct <= 0) el.classList.add('val-zero');
      else el.classList.add('val-bad');
      if (el.dataset.auto === '1') el.textContent = formatPct(pct);
    });
  }

  function updateFormula(a, p, q) {
    const box = qs('.oee365-formula', root());
    if (!box) return;
    const oee = (a / 100) * (p / 100) * (q / 100) * 100;
    box.innerHTML = `
      <strong>OEE 365 = ${formatPct(a)} × ${formatPct(p)} × ${formatPct(q)} = ${formatPct(oee)}</strong>
      Availability 365 = E ÷ Time Available Filling.
    `;
  }

  function init() {
    if (!root()) return;
    paint();
  }

  return { init, paint, updateFormula, formatPct, SCREEN };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Oee365Screen.init());
} else {
  Oee365Screen.init();
}
