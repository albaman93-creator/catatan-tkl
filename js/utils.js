/**
 * UTILS.JS
 * Fungsi-fungsi utilitas yang TIDAK memiliki side-effect.
 * Semua fungsi di sini murni (pure functions) untuk memudahkan testing.
 */
const Utils = (() => {
  'use strict';

  // ====== FORMAT ANGKA ======
  const nf0 = (n) => Math.round(n).toLocaleString('id-ID');
  const nf2 = (n) => (+n).toLocaleString('id-ID', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  // ====== PARSING & NORMALISASI ======
  const parseNumber = (el) => {
    const v = parseFloat(String(el.value || '').replace(',', '.'));
    return isFinite(v) ? v : 0;
  };

  /**
   * Parse string "HH:MM" → total menit dari 00:00.
   * Return null kalau format invalid.
   */
  const parseTime = (s) => {
    const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(s || '');
    if (!m) return null;
    const h = +m[1], mi = +m[2];
    return (h < 24 && mi < 60) ? h * 60 + mi : null;
  };

  /**
   * Auto-mask input jam: "0740" → "07:40", "730" → "07:30".
   */
  const maskTime = (raw) => {
    raw = raw || '';
    if (raw.indexOf(':') >= 0) {
      const p = raw.split(':');
      const h = p[0].replace(/\D/g, '').slice(0, 2);
      const m = (p[1] || '').replace(/\D/g, '').slice(0, 2);
      return (raw.slice(-1) === ':' || m) ? h + ':' + m : h;
    }
    const d = raw.replace(/\D/g, '').slice(0, 4);
    if (d.length >= 3) return d.slice(0, 2) + ':' + d.slice(2);
    return d;
  };

  /**
   * Normalisasi waktu ke format "HH:MM". Return null kalau invalid.
   */
  const normTime = (v) => {
    v = (v || '').trim();
    if (!v) return '';
    if (/^\d{1,2}$/.test(v))      v = v.padStart(2, '0') + ':00';
    else if (/^\d{3,4}$/.test(v)) v = v.padStart(4, '0').slice(0,2) + ':' + v.padStart(4,'0').slice(2);
    return parseTime(v) != null ? v : null;
  };

  // ====== TANGGAL ======
  const todayLocal = () => {
    const n = new Date();
    return new Date(n.getTime() - n.getTimezoneOffset() * 60000)
      .toISOString().slice(0, 10);
  };

  const formatDateText = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [y, mStr, d] = parts;
    const mName = CONFIG.MONTHS[parseInt(mStr, 10) - 1] || 'JAN';
    return `${d} ${mName} ${y}`;
  };

  // ====== LOGIKA BISNIS ======
  /**
   * Tentukan index shift berdasarkan menit (0-1439).
   * Return 0 (S1), 1 (S2), 2 (S3), atau null kalau invalid.
   */
  const shiftOf = (m) => {
    if (m == null || isNaN(m)) return null;
    for (const range of CONFIG.SHIFT_RANGES) {
      if (m >= range.from && m < range.to) return range.index;
    }
    return null;
  };

  /**
   * Kategorisasi kode log: 'planned' | 'unplanned' | 'prod' | null.
   */
  const catOf = (k) => {
    if (k === '' || k == null) return null;
    const n = parseInt(k, 10);
    if (isNaN(n)) return null;
    if (CONFIG.PLANNED_CODES.has(n))   return 'planned';
    if (CONFIG.UNPLANNED_CODES.has(n)) return 'unplanned';
    return 'prod';
  };

  return {
    nf0, nf2, parseNumber, parseTime, maskTime, normTime,
    todayLocal, formatDateText, shiftOf, catOf
  };
})();
