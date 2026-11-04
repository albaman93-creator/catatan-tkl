/**
 * shift-produk.js
 * Screen: Shift & Produk (data-screen="filter")
 * button.screen-tab:nth-child(1)
 *
 * Tanggung jawab:
 * - Toggle chip Shift / Line / Tahapan
 * - Sinkronisasi tanggal, mesin, master produk
 * - Status cloud badge
 */
const ShiftProduk = (() => {
  'use strict';

  const SCREEN = 'filter';

  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

  /** Section root */
  const root = () => qs(`.sec[data-screen="${SCREEN}"]`);

  /** Aktifkan chip (Shift / Line / Tahapan) */
  function setActiveChip(groupSelector, value) {
    const group = qs(groupSelector, root());
    if (!group) return;
    qsa('.chip-btn', group).forEach((btn) => {
      const v = btn.dataset.value || btn.dataset.shift || btn.dataset.line || btn.dataset.stage || btn.textContent.trim();
      const on = String(v).toLowerCase() === String(value).toLowerCase();
      btn.classList.toggle('is-active', on);
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  /** Baca nilai chip aktif */
  function getActiveChip(groupSelector) {
    const active = qs(`${groupSelector} .chip-btn.is-active, ${groupSelector} .chip-btn.on`, root());
    if (!active) return null;
    return active.dataset.value || active.dataset.shift || active.dataset.line || active.dataset.stage || active.textContent.trim();
  }

  /** Update status cloud */
  function setCloudStatus(text, ok = true) {
    let badge = qs('.cloud-status', root());
    if (!badge) {
      const head = qs('.sec-h', root());
      if (!head) return;
      badge = document.createElement('span');
      badge.className = 'cloud-status';
      head.appendChild(badge);
    }
    badge.textContent = text;
    badge.style.background = ok ? '#ecfdf5' : '#fef2f2';
    badge.style.color = ok ? '#059669' : '#dc2626';
    badge.style.borderColor = ok ? '#a7f3d0' : '#fecaca';
  }

  /** Init event chip */
  function bindChips() {
    const sec = root();
    if (!sec) return;

    sec.addEventListener('click', (e) => {
      const btn = e.target.closest('.chip-btn');
      if (!btn) return;

      const group = btn.closest('.chip-row, .filter-group, .filter-chips');
      if (!group) return;

      qsa('.chip-btn', group).forEach((b) => {
        b.classList.remove('is-active', 'on');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('is-active', 'on');
      btn.setAttribute('aria-pressed', 'true');

      // Dispatch custom event agar modul lain bisa listen
      const detail = {
        shift: getActiveChip('[data-chip-group="shift"]') || getActiveChip('.chip-row-shift'),
        line: getActiveChip('[data-chip-group="line"]') || getActiveChip('.chip-row-line'),
        stage: getActiveChip('[data-chip-group="stage"]') || getActiveChip('.chip-row-stage'),
      };
      document.dispatchEvent(new CustomEvent('shiftproduk:change', { detail }));
    });
  }

  /** Init date field */
  function bindDate() {
    const input = qs('#filterDate, input[type="date"]', root()) || qs('input[data-sync="tanggal"]');
    if (!input) return;
    input.addEventListener('change', () => {
      document.dispatchEvent(new CustomEvent('shiftproduk:date', { detail: { date: input.value } }));
    });
  }

  /** Public API */
  function init() {
    if (!root()) return;
    bindChips();
    bindDate();
    setCloudStatus('data kosong (belum ada di cloud) · belum ada data tersimpan untuk filter ini', true);
  }

  function getState() {
    return {
      shift: getActiveChip('[data-chip-group="shift"]'),
      line: getActiveChip('[data-chip-group="line"]'),
      stage: getActiveChip('[data-chip-group="stage"]'),
      date: (qs('#filterDate, input[type="date"]', root()) || {}).value || null,
    };
  }

  return { init, getState, setActiveChip, setCloudStatus, SCREEN };
})();

// Auto-init saat DOM ready (aman dipanggil ulang)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ShiftProduk.init());
} else {
  ShiftProduk.init();
}
