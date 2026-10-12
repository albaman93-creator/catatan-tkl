/**
 * WEEKLY-FILTER.JS
 * Filter tanggal + Produk/Batch + Shift untuk halaman Weekly OEE & Mesin.
 *
 * Produk di dropdown di-scope ke line + tahapan halaman aktif
 * (mis. Filling Line 2 → hanya record key *|L2|filling).
 */
const WeeklyFilter = (() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  /** Halaman weekly yang sedang aktif (data-weekly-page) */
  let activePage = 'machine';

  /**
   * Map data-weekly-page → { line, stage }
   * filling-2 → L2 + filling, kemas-1 → L1 + kemas, dll.
   */
  const contextFromPage = (pageId) => {
    const id = String(pageId || activePage || '');
    const m = id.match(/^(filling|kemas|steril|visual|mixing)-(\d+)$/i);
    if (m) {
      return { line: m[2], stage: m[1].toLowerCase(), page: id };
    }
    // oee-prod / yield / machine generik → tanpa filter line/stage ketat
    return { line: null, stage: null, page: id };
  };

  const getDb = () => {
    try {
      const key = (typeof CONFIG !== 'undefined' && CONFIG.DB_KEY) ? CONFIG.DB_KEY : 'fima_oee_db_v3';
      return JSON.parse(localStorage.getItem(key)) || {};
    } catch (_) {
      return {};
    }
  };

  /** Parse key "YYYY-MM-DD|S1|L2|filling" */
  const parseKey = (key) => {
    const parts = String(key).split('|');
    if (parts.length < 4) return null;
    const date = parts[0];
    const shift = (parts[1] || '').replace(/^S/i, '');
    const line = (parts[2] || '').replace(/^L/i, '');
    const stage = (parts[3] || '').toLowerCase();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    return { date, shift, line, stage, key };
  };

  /** Ambil products label dari payload record (kode, kode+BN, batch baris) */
  const productsFromPayload = (payload) => {
    const set = new Set();
    if (!payload || typeof payload !== 'object') return set;

    const add = (v) => {
      const s = String(v || '').trim();
      if (!s || s === '--' || s === '—') return;
      set.add(s);
      // Juga simpan token pertama (kode produk) agar "VPEL1" & "VPEL1 L027103" tercover
      const code = s.split(/\s+/)[0];
      if (code && code !== s) set.add(code);
    };

    const prods = payload.products || {};
    for (let i = 1; i <= 3; i++) {
      const name = prods['p' + i + 'Name'] || prods['prodName' + i] || '';
      const bn = prods['p' + i + 'Bn'] || prods['prodBn' + i] || '';
      const n = String(name || '').trim();
      const b = String(bn || '').trim();
      if (n) {
        add(n);
        if (b) add(`${n} ${b}`);
      }
      // BN saja (mis. L027103) jika ada di chart batch
      if (b) add(b);
    }

    const rows = payload.rows || payload.log || [];
    if (Array.isArray(rows)) {
      rows.forEach(r => {
        add(r.batch || r.produk || r.product);
        // WO kadang berisi identitas batch
        const wo = String(r.wo || '').trim();
        if (wo && /^[A-Z0-9.\-]+$/i.test(wo) && wo.length >= 4) add(wo);
      });
    }
    return set;
  };

  /**
   * Kumpulkan produk dari record line/stage (+ rentang tanggal).
   * Shift TIDAK dipakai — dropdown menampilkan semua produk di line
   * (VPEL1, VCLN2, …) meski tombol S2 aktif. Filter shift hanya untuk OEE.
   */
  const collectProducts = (opts = {}) => {
    const ctx = contextFromPage(opts.page || activePage);
    const from = opts.from || '';
    const to = opts.to || '';
    const set = new Set();
    const db = getDb();

    Object.keys(db).forEach(key => {
      const meta = parseKey(key);
      if (!meta) return;

      // Scope line + stage dari halaman mesin
      if (ctx.line && meta.line !== String(ctx.line)) return;
      if (ctx.stage && meta.stage !== String(ctx.stage)) return;

      if (from && meta.date < from) return;
      if (to && meta.date > to) return;
      // shift sengaja tidak difilter di sini

      const payload = db[key]?.payload || db[key];
      productsFromPayload(payload).forEach(p => set.add(p));
    });

    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, 'id'));
  };

  const fillProductSelect = (selectEl, opts = {}) => {
    if (!selectEl) return;
    const prev = selectEl.value;
    const products = collectProducts(opts);
    selectEl.innerHTML = '<option value="">Semua produk</option>' +
      products.map(p => `<option value="${p.replace(/"/g, '&quot;')}">${p}</option>`).join('');
    if (prev && products.includes(prev)) selectEl.value = prev;
    else selectEl.value = '';
  };

  const getShift = (groupId) => {
    const on = document.querySelector(`#${groupId} .mch-shift-btn.on`);
    return on ? on.getAttribute('data-shift') : 'all';
  };

  const setShift = (groupId, shift) => {
    document.querySelectorAll(`#${groupId} .mch-shift-btn`).forEach(btn => {
      btn.classList.toggle('on', btn.getAttribute('data-shift') === String(shift));
    });
  };

  const formatDateId = (iso) => {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };

  /** Hitung record di DB sesuai filter + konteks line/stage */
  const countMatching = ({ from, to, product, shift, page }) => {
    const ctx = contextFromPage(page || activePage);
    const db = getDb();
    let n = 0;

    Object.keys(db).forEach(key => {
      const meta = parseKey(key);
      if (!meta) return;
      if (ctx.line && meta.line !== String(ctx.line)) return;
      if (ctx.stage && meta.stage !== String(ctx.stage)) return;
      if (from && meta.date < from) return;
      if (to && meta.date > to) return;
      if (shift && shift !== 'all' && meta.shift !== String(shift)) return;

      if (product) {
        const payload = db[key]?.payload || db[key];
        const prods = productsFromPayload(payload);
        const code = product.split(/\s+/)[0];
        const hit = Array.from(prods).some(p => p === product || p.startsWith(code));
        if (!hit) return;
      }
      n++;
    });
    return n;
  };

  const refreshMchProducts = () => {
    // Jangan kirim shift — dropdown harus menampilkan semua produk di line/tanggal
    fillProductSelect($('mchProduct'), {
      page: activePage,
      from: $('mchFrom')?.value || '',
      to: $('mchTo')?.value || '',
    });
  };

  const refreshOeeProducts = () => {
    // OEE Production: semua line/stage (page generik), tanpa filter shift
    fillProductSelect($('oeeProduct'), {
      page: 'oee-prod',
      from: $('oeeFrom')?.value || '',
      to: $('oeeTo')?.value || '',
    });
  };

  const applyMachine = () => {
    const from = $('mchFrom')?.value || '';
    const to = $('mchTo')?.value || '';
    const product = $('mchProduct')?.value || '';
    const shift = getShift('mchShiftGroup');

    // Refresh opsi produk sesuai rentang/shift (tetap scope line)
    refreshMchProducts();
    // Restore product selection if still valid
    if (product && $('mchProduct')) {
      const exists = Array.from($('mchProduct').options).some(o => o.value === product);
      if (exists) $('mchProduct').value = product;
    }

    const n = countMatching({
      from, to,
      product: $('mchProduct')?.value || '',
      shift,
      page: activePage,
    });
    const title = $('weeklyMachineTitle')?.textContent || 'MESIN';
    const shiftLabel = shift === 'all' ? 'Semua shift' : `Shift ${shift}`;
    const prodLabel = $('mchProduct')?.value || 'Semua produk';
    const range = from || to
      ? `${formatDateId(from || to)} – ${formatDateId(to || from)}`
      : 'Semua tanggal';
    const status = $('mchStatus');
    if (status) {
      status.textContent = `✓ ${n} record · ${title} · ${prodLabel} · ${shiftLabel} · ${range}`;
    }
    document.dispatchEvent(new CustomEvent('weekly-filter-change', {
      detail: { scope: 'machine', page: activePage, from, to, product: prodLabel === 'Semua produk' ? '' : prodLabel, shift },
    }));
  };

  const applyOee = () => {
    const from = $('oeeFrom')?.value || '';
    const to = $('oeeTo')?.value || '';
    const product = $('oeeProduct')?.value || '';
    const shift = getShift('oeeShiftGroup');

    refreshOeeProducts();
    if (product && $('oeeProduct')) {
      const exists = Array.from($('oeeProduct').options).some(o => o.value === product);
      if (exists) $('oeeProduct').value = product;
    }

    const n = countMatching({
      from, to,
      product: $('oeeProduct')?.value || '',
      shift,
      page: 'oee-prod',
    });
    const shiftLabel = shift === 'all' ? 'Semua shift' : `Shift ${shift}`;
    const prodLabel = $('oeeProduct')?.value || 'Semua produk';
    const range = from || to
      ? `${formatDateId(from || to)} – ${formatDateId(to || from)}`
      : 'Semua tanggal';
    const status = $('oeeStatus');
    if (status) {
      status.textContent = `✓ ${n} record · OEE Production · ${prodLabel} · ${shiftLabel} · ${range}`;
    }
    document.dispatchEvent(new CustomEvent('weekly-filter-change', {
      detail: { scope: 'oee-prod', from, to, product: prodLabel === 'Semua produk' ? '' : prodLabel, shift },
    }));
  };

  const resetMachine = () => {
    if ($('mchFrom')) $('mchFrom').value = '';
    if ($('mchTo')) $('mchTo').value = '';
    if ($('mchProduct')) $('mchProduct').value = '';
    setShift('mchShiftGroup', 'all');
    applyMachine();
  };

  const resetOee = () => {
    if ($('oeeFrom')) $('oeeFrom').value = '';
    if ($('oeeTo')) $('oeeTo').value = '';
    if ($('oeeProduct')) $('oeeProduct').value = '';
    setShift('oeeShiftGroup', 'all');
    applyOee();
  };

  const bindShiftGroup = (groupId, onChange) => {
    const group = $(groupId);
    if (!group) return;
    group.addEventListener('click', (e) => {
      const btn = e.target.closest('.mch-shift-btn');
      if (!btn) return;
      setShift(groupId, btn.getAttribute('data-shift'));
      onChange();
    });
  };

  /** Saat user pilih Filling Line 2 dll. */
  const setActivePage = (pageId) => {
    activePage = pageId || 'machine';
    // Halaman mesin (filling-*/kemas-*) → refresh filter mesin
    if (/^(filling|kemas|steril|visual|mixing)-\d+$/i.test(activePage) || activePage === 'machine') {
      refreshMchProducts();
      applyMachine();
    }
    if (activePage === 'oee-prod') {
      refreshOeeProducts();
      applyOee();
    }
  };

  const bind = () => {
    refreshMchProducts();
    refreshOeeProducts();

    $('mchApply')?.addEventListener('click', applyMachine);
    $('mchReset')?.addEventListener('click', resetMachine);
    $('oeeApply')?.addEventListener('click', applyOee);
    $('oeeReset')?.addEventListener('click', resetOee);

    bindShiftGroup('mchShiftGroup', applyMachine);
    bindShiftGroup('oeeShiftGroup', applyOee);

    $('mchProduct')?.addEventListener('change', applyMachine);
    $('oeeProduct')?.addEventListener('change', applyOee);
    $('mchFrom')?.addEventListener('change', () => { refreshMchProducts(); });
    $('mchTo')?.addEventListener('change', () => { refreshMchProducts(); });
    $('oeeFrom')?.addEventListener('change', () => { refreshOeeProducts(); });
    $('oeeTo')?.addEventListener('change', () => { refreshOeeProducts(); });

    // Navigasi sidebar weekly
    document.querySelectorAll('.weekly-nav-item').forEach(el => {
      el.addEventListener('click', () => {
        const page = el.getAttribute('data-weekly-page');
        if (page) setTimeout(() => setActivePage(page), 30);
      });
    });

    // Deteksi halaman aktif saat ini
    const current = document.querySelector('.weekly-nav-item.is-active');
    if (current) activePage = current.getAttribute('data-weekly-page') || activePage;

    applyMachine();
    applyOee();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  return {
    bind, applyMachine, applyOee, collectProducts, fillProductSelect,
    setActivePage, contextFromPage, countMatching,
  };
})();
