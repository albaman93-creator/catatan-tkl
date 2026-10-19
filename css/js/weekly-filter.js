/**
 * WEEKLY-FILTER.JS
 * Kontrol filter Produk & Batch + Shift untuk halaman Weekly OEE Production
 * (scope 'oee') dan halaman detail mesin (scope 'mch').
 *
 * Modul ini HANYA mengurus tampilan filter (dropdown, tombol shift) dan memberi
 * tahu pemakai lewat WeeklyFilter.on(). Pengambilan data & hitungan ada di
 * weekly-dashboard.js + weekly-calc.js.
 *
 * Dropdown diisi dari riwayat produk/batch pada rentang tanggal terpilih
 * (WeeklyCalc.productOptions) — bukan dari localStorage perangkat ini.
 */
const WeeklyFilter = (() => {
  'use strict';

  const IDS = {
    oee: { product: 'oeeProduct', shift: 'oeeShiftGroup' },
    mch: { product: 'mchProduct', shift: 'mchShiftGroup' },
  };
  const handlers = { oee: [], mch: [] };
  let bound = false;

  const $ = (id) => document.getElementById(id);

  const getShift = (scope) => {
    const on = document.querySelector(`#${IDS[scope].shift} .mch-shift-btn.on`);
    return on ? on.getAttribute('data-shift') : 'all';
  };

  const setShift = (scope, shift) => {
    document.querySelectorAll(`#${IDS[scope].shift} .mch-shift-btn`).forEach((btn) => {
      btn.classList.toggle('on', btn.getAttribute('data-shift') === String(shift));
    });
  };

  /** Filter aktif: { product: '' | 'KODE' | 'KODE BN', shift: 'all' | '1' | '2' | '3' } */
  const get = (scope) => ({
    product: ($(IDS[scope].product) || {}).value || '',
    shift: getShift(scope),
  });

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

  /** Kembalikan ke "Semua produk" + "All" (tanpa memicu handler). */
  const reset = (scope) => { setProduct(scope, ''); setShift(scope, 'all'); };

  /** Daftarkan fungsi yang dipanggil saat user ganti produk atau shift. */
  const on = (scope, fn) => { handlers[scope].push(fn); };
  const emit = (scope) => handlers[scope].forEach((fn) => fn(get(scope)));

  const bind = () => {
    if (bound) return;
    bound = true;
    Object.keys(IDS).forEach((scope) => {
      $(IDS[scope].product)?.addEventListener('change', () => emit(scope));
      $(IDS[scope].shift)?.addEventListener('click', (e) => {
        const btn = e.target.closest('.mch-shift-btn');
        if (!btn) return;
        setShift(scope, btn.getAttribute('data-shift'));
        emit(scope);
      });
    });
  };

  return { bind, get, populate, setProduct, setShift, reset, on };
})();
