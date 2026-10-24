/**
 * sheet.js
 * Screen: Log Sheet Harian (data-screen="logsheet")
 * button.screen-tab:nth-child(3)
 *
 * Fokus: UI helper untuk compact controls + highlight baris aktif.
 * Logika hitung OEE tetap di calculation.js / rows.js yang sudah ada.
 */
const SheetScreen = (() => {
  'use strict';

  const SCREEN = 'logsheet';
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];
  const root = () => qs(`.sec[data-screen="${SCREEN}"]`);

  function closeAllPopovers() {
    qsa('.compact-popover', root()).forEach((p) => {
      p.hidden = true;
      const trigger = p.previousElementSibling;
      if (trigger && trigger.classList.contains('compact-trigger')) {
        trigger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function bindCompactControls() {
    const sec = root();
    if (!sec) return;

    sec.addEventListener('click', (e) => {
      const trigger = e.target.closest('.compact-trigger');
      if (trigger) {
        const panelId = trigger.getAttribute('aria-controls');
        const panel = panelId ? qs(`#${panelId}`, sec) : trigger.nextElementSibling;
        if (!panel) return;
        const open = trigger.getAttribute('aria-expanded') === 'true';
        closeAllPopovers();
        if (!open) {
          panel.hidden = false;
          trigger.setAttribute('aria-expanded', 'true');
        }
        return;
      }

      if (e.target.closest('.compact-close')) {
        closeAllPopovers();
        return;
      }

      // Pilih opsi stage / line / shift
      const stageOpt = e.target.closest('[data-sheet-stage]');
      if (stageOpt) {
        const val = stageOpt.dataset.sheetStage;
        const label = qs('#compactStageValue', sec);
        if (label) label.textContent = stageOpt.textContent.trim();
        closeAllPopovers();
        document.dispatchEvent(new CustomEvent('sheet:stage', { detail: { stage: val } }));
        return;
      }

      const lineOpt = e.target.closest('[data-sheet-line]');
      if (lineOpt) {
        const val = lineOpt.dataset.sheetLine;
        const label = qs('#compactLineValue', sec);
        if (label) label.textContent = `Line ${val}`;
        closeAllPopovers();
        document.dispatchEvent(new CustomEvent('sheet:line', { detail: { line: val } }));
        return;
      }
    });

    // Klik di luar → tutup
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.compact-control')) closeAllPopovers();
    });
  }

  function highlightActiveRow() {
    const sec = root();
    if (!sec) return;
    sec.addEventListener('focusin', (e) => {
      const tr = e.target.closest('tr');
      if (!tr || !tr.closest('table.log')) return;
      qsa('table.log tbody tr', sec).forEach((r) => r.classList.remove('is-active-row'));
      tr.classList.add('is-active-row');
    });
  }

  function init() {
    if (!root()) return;
    bindCompactControls();
    highlightActiveRow();
  }

  return { init, SCREEN, closeAllPopovers };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => SheetScreen.init());
} else {
  SheetScreen.init();
}
