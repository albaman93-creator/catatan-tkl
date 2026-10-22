/**
 * SHEET-MESIN-SYNC.JS
 * Menyambungkan kotak ringkas "Mesin" di baris terpadu Sheet (Shift/Line/
 * Tanggal/Tahapan) dengan field asli Nama Mesin (#fMesinNama) di section
 * "Data & Penyimpanan" — supaya data tetap tersimpan lewat alur storage.js
 * yang sudah ada, tanpa perlu ubah logic penyimpanan sama sekali.
 *
 * Additive murni: tidak mengubah field #fMesinNama asli, cuma menambah
 * "cermin" tampilan yang lebih ringkas di header Log Sheet. Nilai
 * #fMesinNama sendiri sudah terisi otomatis oleh UI.fillMachineName()
 * setiap kali Line / Tahapan Proses berganti (lihat CONFIG.MACHINE_NAMES
 * di js/config.js) — modul ini hanya mencerminkan nilai tsb, dua arah.
 */
(function () {
  'use strict';

  const box = () => document.getElementById('sheetMesinNama');
  const original = () => document.getElementById('fMesinNama');
  const label = () => document.getElementById('compactMesinValue');

  const setLabel = (val) => {
    const el = label();
    if (!el) return;
    const v = (val || '').trim();
    el.textContent = v ? (v.length > 20 ? v.slice(0, 19) + '…' : v) : 'Mesin';
  };

  /** Tulis dari kotak ringkas → field asli #fMesinNama (lalu picu event supaya alur lain yang mendengarkan tetap jalan). */
  const writeToOriginal = (val) => {
    const el = original();
    if (!el) return;
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };

  /** Tarik nilai dari field asli #fMesinNama → kotak ringkas (dipakai saat data dimuat/reset/auto-isi line & tahapan). */
  const syncFromOriginal = () => {
    const src = original();
    if (!src) return;
    const val = src.value || '';
    const dst = box();
    if (!dst || document.activeElement !== dst) {
      if (dst) dst.value = val;
      setLabel(val);
    }
  };

  const bind = () => {
    const dst = box();
    if (!dst) return;
    dst.addEventListener('input', () => {
      writeToOriginal(dst.value);
      setLabel(dst.value);
    });
  };

  // Polling ringan: #fMesinNama bisa berubah tanpa event "input" langsung
  // dari user (mis. UI.fillMachineName() saat ganti Line/Tahapan, atau
  // Storage.applyRecord() saat load record) — lewat Perf.every supaya
  // berhenti saat app disembunyikan (hemat baterai/CPU).
  const startPolling = () => {
    if (typeof Perf !== 'undefined') Perf.every(500, syncFromOriginal);
    else setInterval(syncFromOriginal, 500);
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (!box() || !original()) return; // guard kalau markup belum ada
    bind();
    syncFromOriginal();
    startPolling();
  });
})();
