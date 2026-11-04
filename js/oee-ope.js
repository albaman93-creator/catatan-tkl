/**
 * oee-ope.js
 * Screen: OEE OPE (data-screen="oee")
 * button.screen-tab untuk OEE OPE
 *
 * Helper tampilan: format %, warn banner, highlight nilai.
 * Perhitungan utama tetap di calculation.js.
 */
const OeeOpe = (() => {
  'use strict';

  const SCREEN = 'oee';
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];
  const root = () => qs(`.sec[data-screen="${SCREEN}"]`);

  function formatPct(n) {
    if (n == null || Number.isNaN(Number(n))) return '0,00 %';
    return Number(n).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
  }

  function formatMin(n) {
    if (n == null || Number.isNaN(Number(n))) return '0 mnt';
    return Number(n).toLocaleString('id-ID') + ' mnt';
  }

  function classForPct(pct, target = 90) {
    if (pct >= target) return 'pct-good';
    if (pct >= target * 0.7) return 'pct-mid';
    return 'pct-bad';
  }

  /** Update class warna pada sel % */
  function paintPctCells() {
    const sec = root();
    if (!sec) return;
    qsa('[data-pct]', sec).forEach((el) => {
      const pct = parseFloat(el.dataset.pct);
      el.classList.remove('pct-good', 'pct-mid', 'pct-bad');
      el.classList.add(classForPct(pct));
      if (!el.textContent.trim() || el.dataset.auto === '1') {
        el.textContent = formatPct(pct);
      }
    });
  }

  function showAlert(msg, type = 'warn') {
    const sec = root();
    if (!sec) return;
    let box = qs('.oee-alert.' + type, sec);
    if (!box) {
      box = document.createElement('div');
      box.className = 'oee-alert ' + type;
      sec.appendChild(box);
    }
    box.innerHTML = `<span>⚠</span><span>${msg}</span>`;
    box.hidden = !msg;
  }

  function hideAlerts() {
    qsa('.oee-alert', root()).forEach((el) => { el.hidden = true; });
  }

  function init() {
    if (!root()) return;
    paintPctCells();
  }

  return { init, formatPct, formatMin, paintPctCells, showAlert, hideAlerts, SCREEN };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => OeeOpe.init());
} else {
  OeeOpe.init();
}
