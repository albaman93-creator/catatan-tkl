/**
 * SHEET-OP-SYNC.JS
 * Menyambungkan 6 kotak "OP1..OP6" di baris terpadu Sheet (Shift/Line/
 * Tanggal) dengan field asli Inisial Operator (#op1..#op6) di section
 * "Inisial" — supaya data tetap tersimpan lewat alur storage.js yang
 * sudah ada, tanpa perlu ubah logic penyimpanan sama sekali.
 *
 * Additive murni: tidak mengubah field #op1..#op6 asli, cuma menambah
 * "cermin" tampilan yang lebih ringkas di halaman Sheet.
 */
(function () {
  'use strict';

  const MAXLEN = 3;

  const boxes = () => Array.from(document.querySelectorAll('.sheet-op-box[data-sheet-op]'));

  const originalField = (i) => document.getElementById('op' + i);

  /** Tulis dari kotak ringkas → field asli #opN (lalu picu event supaya alur lain yang mendengarkan tetap jalan). */
  const writeToOriginal = (i, val) => {
    const el = originalField(i);
    if (!el) return;
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };

  /** Tarik nilai dari field asli #opN → kotak ringkas (dipakai saat data baru dimuat/reset). */
  const syncFromOriginal = () => {
    boxes().forEach((box) => {
      const i = box.getAttribute('data-sheet-op');
      const el = originalField(i);
      if (!el) return;
      if (document.activeElement !== box) {
        box.value = el.value || '';
        box.classList.toggle('filled', !!box.value);
      }
    });
  };

  const focusNext = (idx) => {
    const list = boxes();
    const next = list[idx + 1];
    if (next) { next.focus(); next.select(); }
  };

  const focusPrev = (idx) => {
    const list = boxes();
    const prev = list[idx - 1];
    if (prev) { prev.focus(); prev.select(); }
  };

  const bind = () => {
    const list = boxes();
    list.forEach((box, idx) => {
      const i = box.getAttribute('data-sheet-op');

      box.addEventListener('input', () => {
        let cleaned = box.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        // Overflow: "KOKO" → box ini "KOK", sisa ke box berikutnya
        if (cleaned.length > MAXLEN) {
          let rest = cleaned;
          let p = idx;
          const list = boxes();
          while (rest.length > 0 && p < list.length) {
            const chunk = rest.slice(0, MAXLEN);
            rest = rest.slice(MAXLEN);
            list[p].value = chunk;
            list[p].classList.toggle('filled', !!chunk);
            writeToOriginal(list[p].getAttribute('data-sheet-op'), chunk);
            p++;
          }
          const last = Math.min(p - 1, list.length - 1);
          if (list[last]) { list[last].focus(); list[last].select(); }
          return;
        }
        box.value = cleaned;
        box.classList.toggle('filled', !!cleaned);
        writeToOriginal(i, cleaned);
        if (cleaned.length >= MAXLEN) focusNext(idx);
      });

      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && box.value === '' && idx > 0) {
          e.preventDefault();
          focusPrev(idx);
        }
      });

      box.addEventListener('focus', () => box.select());
    });
  };

  // Sinkron ulang kotak ringkas setiap kali data record dimuat/direset
  // (Storage.applyRecord mengubah #op1..#op6 secara langsung tanpa event,
  // jadi kita polling ringan setiap 500ms — murah & aman untuk 6 input kecil).
  // Lewat Perf.every supaya berhenti saat app disembunyikan (hemat baterai/CPU)
  const startPolling = () => {
    if (typeof Perf !== 'undefined') Perf.every(500, syncFromOriginal);
    else setInterval(syncFromOriginal, 500);
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (!boxes().length) return; // guard kalau markup belum ada
    bind();
    syncFromOriginal();
    startPolling();
  });
})();