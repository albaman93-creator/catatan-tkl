/**
 * inisial.js
 * Screen: Inisial Operator (data-screen="operator")
 * button.screen-tab:nth-child(2)
 */
const Inisial = (() => {
  'use strict';

  const SCREEN = 'operator';
  const MAX_LEN = 3; // sesuai hint "maks. 3 huruf per kolom" di UI (placeholder ---)

  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

  const root = () => qs(`.sec[data-screen="${SCREEN}"]`);

  function inputs() {
    return qsa('#op1, #op2, #op3, #op4, #op5, #op6', root())
      .concat(qsa('.operator-grid input', root()));
  }

  /** Normalize: uppercase, max 3 huruf, hanya A-Z */
  function normalize(val) {
    return String(val || '')
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, MAX_LEN);
  }

  function bindInputs() {
    const list = inputs();
    // unique by id/element
    const seen = new Set();
    list.forEach((inp) => {
      if (seen.has(inp)) return;
      seen.add(inp);

      inp.setAttribute('maxlength', String(MAX_LEN));
      inp.setAttribute('autocomplete', 'off');
      inp.setAttribute('spellcheck', 'false');

      inp.addEventListener('input', () => {
        const pos = inp.selectionStart;
        const next = normalize(inp.value);
        if (inp.value !== next) {
          inp.value = next;
          try { inp.setSelectionRange(pos, pos); } catch (_) {}
        }
        document.dispatchEvent(new CustomEvent('inisial:change', {
          detail: { values: getValues() }
        }));
      });

      // Tab / Enter pindah ke input berikutnya
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
          const arr = [...seen];
          const idx = arr.indexOf(inp);
          if (idx >= 0 && idx < arr.length - 1) {
            e.preventDefault();
            arr[idx + 1].focus();
            arr[idx + 1].select();
          }
        }
      });
    });
  }

  function getValues() {
    const out = {};
    for (let i = 1; i <= 6; i++) {
      const el = qs(`#op${i}`, root());
      out[`op${i}`] = el ? normalize(el.value) : '';
    }
    return out;
  }

  function setValues(obj = {}) {
    for (let i = 1; i <= 6; i++) {
      const el = qs(`#op${i}`, root());
      if (el && obj[`op${i}`] != null) {
        el.value = normalize(obj[`op${i}`]);
      }
    }
  }

  function init() {
    if (!root()) return;
    bindInputs();
  }

  return { init, getValues, setValues, SCREEN };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Inisial.init());
} else {
  Inisial.init();
}
