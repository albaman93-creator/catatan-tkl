/**
 * WEEKLY-FILTER.JS
 * Kontrol filter untuk halaman Weekly OEE Production (scope 'oee')
 * dan halaman detail mesin (scope 'mch').
 *
 * oee  : Produk & Batch + Shift + rentang tanggal (Dari/Sampai)
 * mch  : Tahun + Bulan + Week + Produk (tanpa Shift, tanpa rentang tanggal manual)
 *
 * Modul ini HANYA mengurus tampilan filter dan memberi tahu pemakai lewat
 * WeeklyFilter.on(). Pengambilan data & hitungan ada di weekly-dashboard.js + weekly-calc.js.
 */
const WeeklyFilter = (() => {
  'use strict';

  const IDS = {
    oee: { product: 'oeeProduct', shift: 'oeeShiftGroup' },
    mch: { product: 'mchProduct', year: 'mchYear', month: 'mchMonth', week: 'mchWeek' },
  };
  const handlers = { oee: [], mch: [] };
  let bound = false;

  const $ = (id) => document.getElementById(id);

  const MONTH_NAMES = [
    '', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  const getShift = (scope) => {
    if (scope === 'mch') return 'all';
    const on = document.querySelector(`#${IDS[scope].shift} .mch-shift-btn.on`);
    return on ? on.getAttribute('data-shift') : 'all';
  };

  const setShift = (scope, shift) => {
    if (scope === 'mch') return;
    document.querySelectorAll(`#${IDS[scope].shift} .mch-shift-btn`).forEach((btn) => {
      btn.classList.toggle('on', btn.getAttribute('data-shift') === String(shift));
    });
  };

  /**
   * Filter aktif.
   * oee: { product, shift }
   * mch: { product, shift:'all', year, month, week }
   */
  const get = (scope) => {
    if (scope === 'mch') {
      return {
        product: ($(IDS.mch.product) || {}).value || '',
        shift: 'all',
        year: ($(IDS.mch.year) || {}).value || String(new Date().getFullYear()),
        month: ($(IDS.mch.month) || {}).value || 'all',
        week: ($(IDS.mch.week) || {}).value || 'all',
      };
    }
    return {
      product: ($(IDS[scope].product) || {}).value || '',
      shift: getShift(scope),
    };
  };

  const fmtShort = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '');
  const span = (o) => (o.first === o.last ? fmtShort(o.first) : fmtShort(o.first) + '–' + fmtShort(o.last));

  /**
   * Isi dropdown dari hasil WeeklyCalc.productOptions().
   * want: nilai yang ingin dipilih (default: pilihan sebelumnya bila masih ada).
   * Return nilai yang akhirnya terpilih.
   */
  const populate = (scope, opts, want) => {
    const sel = $(IDS[scope].product);
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
    const sel = $(IDS[scope].product);
    if (!sel) return;
    sel.value = Array.from(sel.options).some((o) => o.value === value) ? value : '';
  };

  /** Isi opsi tahun (tahun berjalan + beberapa tahun sebelumnya). */
  const initYear = () => {
    const sel = $(IDS.mch.year);
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

  /** Reset filter mesin ke default (tahun berjalan, semua bulan, all week, semua produk). */
  const resetMch = () => {
    initYear();
    const y = $(IDS.mch.year);
    const m = $(IDS.mch.month);
    const w = $(IDS.mch.week);
    if (y) y.value = String(new Date().getFullYear());
    if (m) m.value = 'all';
    if (w) { w.value = 'all'; w.disabled = true; }
    setProduct('mch', '');
  };

  /** Kembalikan ke default (tanpa memicu handler). */
  const reset = (scope) => {
    if (scope === 'mch') return resetMch();
    setProduct(scope, '');
    setShift(scope, 'all');
  };

  /**
   * Hitung rentang tanggal ISO (YYYY-MM-DD) dari year + month + week.
   * Week 1 = tgl 1–7, Week 2 = 8–14, Week 3 = 15–21, Week 4 = 22–akhir bulan.
   * month='all' → seluruh tahun. week hanya berlaku jika month spesifik.
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

  /** Label ringkas untuk status: "November 2026 · Week 2" dsb. */
  const rangeLabel = (year, month, week) => {
    const y = year || new Date().getFullYear();
    if (!month || month === 'all') return 'Tahun ' + y;
    const name = MONTH_NAMES[parseInt(month, 10)] || month;
    if (!week || week === 'all') return name + ' ' + y;
    return name + ' ' + y + ' · Week ' + week;
  };

  /** Saat bulan = All, paksa week = All (week tidak bermakna lintas bulan). */
  const syncWeekEnabled = () => {
    const m = $(IDS.mch.month);
    const w = $(IDS.mch.week);
    if (!m || !w) return;
    if (m.value === 'all') {
      w.value = 'all';
      w.disabled = true;
    } else {
      w.disabled = false;
    }
  };

  /** Daftarkan fungsi yang dipanggil saat user ganti filter. */
  const on = (scope, fn) => { handlers[scope].push(fn); };
  const emit = (scope) => handlers[scope].forEach((fn) => fn(get(scope)));

  const bind = () => {
    if (bound) return;
    bound = true;

    // OEE scope: product + shift
    $(IDS.oee.product)?.addEventListener('change', () => emit('oee'));
    $(IDS.oee.shift)?.addEventListener('click', (e) => {
      const btn = e.target.closest('.mch-shift-btn');
      if (!btn) return;
      setShift('oee', btn.getAttribute('data-shift'));
      emit('oee');
    });

    // MCH scope
    initYear();
    syncWeekEnabled();

    // Hanya product yang emit (re-render). Tahun/Bulan/Week di-handle
    // di weekly-dashboard.js → loadMachine() agar data di-fetch ulang.
    $(IDS.mch.product)?.addEventListener('change', () => emit('mch'));
  };

  return {
    bind, get, populate, setProduct, setShift, reset, on,
    toDateRange, rangeLabel, initYear, syncWeekEnabled, MONTH_NAMES,
  };
})();
