/**
 * WEEKLY-FILTER.JS
 * Kontrol filter untuk halaman Weekly OEE Production (scope 'oee')
 * dan halaman detail mesin (scope 'mch').
 *
 * Keduanya memakai model yang sama:
 *   Tahun + Bulan + Week + Produk (tanpa Shift, tanpa rentang tanggal manual)
 *
 * Modul ini HANYA mengurus tampilan filter dan memberi tahu pemakai lewat
 * WeeklyFilter.on(). Pengambilan data & hitungan ada di weekly-dashboard.js + weekly-calc.js.
 */
const WeeklyFilter = (() => {
  'use strict';

  const IDS = {
    oee: { product: 'oeeProduct', year: 'oeeYear', month: 'oeeMonth', week: 'oeeWeek' },
    mch: { product: 'mchProduct', year: 'mchYear', month: 'mchMonth', week: 'mchWeek' },
    rp:  { product: 'rpProduct',  year: 'rpYear',  month: 'rpMonth',  week: 'rpWeek'  },
  };
  const handlers = { oee: [], mch: [], rp: [] };
  let bound = false;

  const $ = (id) => document.getElementById(id);

  const MONTH_NAMES = [
    '', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  /**
   * Filter aktif (oee & mch sama):
   * { product, shift:'all', year, month, week }
   */
  const get = (scope) => {
    const ids = IDS[scope] || IDS.mch;
    return {
      product: ($(ids.product) || {}).value || '',
      shift: 'all',
      year: ($(ids.year) || {}).value || String(new Date().getFullYear()),
      month: ($(ids.month) || {}).value || 'all',
      week: ($(ids.week) || {}).value || 'all',
    };
  };

  const fmtShort = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '');
  const span = (o) => (o.first === o.last ? fmtShort(o.first) : fmtShort(o.first) + '–' + fmtShort(o.last));

  const populate = (scope, opts, want) => {
    const ids = IDS[scope] || IDS.mch;
    const sel = $(ids.product);
    if (!sel) return '';
    const keep = want != null ? want : sel.value;
    const esc = Utils.escapeHtml;
    let html = '<option value="">Semua produk</option>';
    if (opts.products.length) {
      html += '<optgroup label="Per produk (semua batch)">' + opts.products.map((p) =>
        `<option value="${esc(p.code)}">${esc(p.code)} · ${p.batches} batch · ${span(p)}</option>`).join('') + '</optgroup>';
    }
    if (opts.batches.length) {
      html += '<optgroup label="Per batch">' + opts.batches.map((b) =>
        `<option value="${esc(b.label)}">${esc(b.label)} · ${span(b)}</option>`).join('') + '</optgroup>';
    }
    sel.innerHTML = html;
    sel.value = Array.from(sel.options).some((o) => o.value === keep) ? keep : '';
    return sel.value;
  };

  const setProduct = (scope, value) => {
    const ids = IDS[scope] || IDS.mch;
    const sel = $(ids.product);
    if (!sel) return;
    sel.value = Array.from(sel.options).some((o) => o.value === value) ? value : '';
  };

  /** Isi opsi tahun untuk satu scope. */
  const initYearScope = (scope) => {
    const ids = IDS[scope];
    if (!ids) return;
    const sel = $(ids.year);
    if (!sel) return;
    if (sel.options.length) return;
    const cy = new Date().getFullYear();
    let html = '';
    for (let y = cy; y >= cy - 4; y--) {
      html += `<option value="${y}">${y}</option>`;
    }
    sel.innerHTML = html;
    sel.value = String(cy);
  };

  const initYear = (scope) => {
    if (scope) return initYearScope(scope);
    initYearScope('oee');
    initYearScope('mch');
    initYearScope('rp');
  };

  /** Saat bulan = All, paksa week = All. */
  const syncWeekEnabled = (scope) => {
    const scopes = scope ? [scope] : ['oee', 'mch', 'rp'];
    scopes.forEach((sc) => {
      const ids = IDS[sc];
      if (!ids) return;
      const m = $(ids.month);
      const w = $(ids.week);
      if (!m || !w) return;
      if (m.value === 'all') {
        w.value = 'all';
        w.disabled = true;
      } else {
        w.disabled = false;
      }
    });
  };

  const resetScope = (scope) => {
    initYearScope(scope);
    const ids = IDS[scope];
    if (!ids) return;
    const y = $(ids.year);
    const m = $(ids.month);
    const w = $(ids.week);
    if (y) y.value = String(new Date().getFullYear());
    if (m) m.value = 'all';
    if (w) { w.value = 'all'; w.disabled = true; }
    setProduct(scope, '');
  };

  const reset = (scope) => resetScope(scope);

  /**
   * Hitung rentang tanggal ISO dari year + month + week (kalender).
   * Week 1 = 1–7, Week 2 = 8–14, Week 3 = 15–21, Week 4 = 22–akhir.
   */
  const toDateRange = (year, month, week) => {
    const y = parseInt(year, 10) || new Date().getFullYear();
    if (!month || month === 'all') {
      return { from: y + '-01-01', to: y + '-12-31' };
    }
    const m = parseInt(month, 10);
    const mm = String(m).padStart(2, '0');
    const lastDay = new Date(y, m, 0).getDate();
    if (!week || week === 'all') {
      return { from: y + '-' + mm + '-01', to: y + '-' + mm + '-' + String(lastDay).padStart(2, '0') };
    }
    const w = parseInt(week, 10);
    const starts = [1, 8, 15, 22];
    const ends = [7, 14, 21, lastDay];
    const idx = Math.max(0, Math.min(3, w - 1));
    const d1 = starts[idx];
    const d2 = Math.min(ends[idx], lastDay);
    return {
      from: y + '-' + mm + '-' + String(d1).padStart(2, '0'),
      to: y + '-' + mm + '-' + String(d2).padStart(2, '0'),
    };
  };

  const rangeLabel = (year, month, week) => {
    const y = year || new Date().getFullYear();
    if (!month || month === 'all') return 'Tahun ' + y;
    const name = MONTH_NAMES[parseInt(month, 10)] || month;
    if (!week || week === 'all') return name + ' ' + y;
    return name + ' ' + y + ' · Week ' + week;
  };

  const on = (scope, fn) => { handlers[scope].push(fn); };
  const emit = (scope) => handlers[scope].forEach((fn) => fn(get(scope)));

  // Kompatibilitas API lama (shift sudah dihapus)
  const setShift = () => {};
  const getShift = () => 'all';

  const bind = () => {
    if (bound) return;
    bound = true;

    ['oee', 'mch', 'rp'].forEach((scope) => {
      const ids = IDS[scope];
      initYearScope(scope);
      syncWeekEnabled(scope);

      $(ids.product)?.addEventListener('change', () => emit(scope));
      // Tahun/Bulan/Week di-handle di weekly-dashboard (load ulang data)
    });
  };

  return {
    bind, get, populate, setProduct, setShift, getShift, reset, on,
    toDateRange, rangeLabel, initYear, syncWeekEnabled, MONTH_NAMES,
  };
})();
