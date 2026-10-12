/**
 * WEEKLY-OEE.JS
 * Hitung OEE / OEE 365 dari record localStorage (DB_KEY) dengan rumus
 * yang sama dengan js/calculation.js, lalu update gauge halaman mesin.
 *
 * Trigger: event 'weekly-filter-change' dari weekly-filter.js
 * atau klik nav Filling/Kemas.
 */
const WeeklyOee = (() => {
  'use strict';

  const ARC = 266.9; // panjang path gauge semicircle

  const $ = (id) => document.getElementById(id);

  const getDb = () => {
    try {
      const key = (typeof CONFIG !== 'undefined' && CONFIG.DB_KEY) ? CONFIG.DB_KEY : 'fima_oee_db_v3';
      return JSON.parse(localStorage.getItem(key)) || {};
    } catch (_) {
      return {};
    }
  };

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

  const parseTime = (str) => {
    if (typeof Utils !== 'undefined' && Utils.parseTime) return Utils.parseTime(str);
    const m = String(str || '').trim().match(/^(\d{1,2})[:.](\d{2})$/);
    if (!m) return null;
    const h = +m[1], min = +m[2];
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  };

  const nf2 = (n) => {
    if (typeof Utils !== 'undefined' && Utils.nf2) return Utils.nf2(n);
    return (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');
  };

  const matchProduct = (batchVal, productFilter) => {
    if (!productFilter) return true;
    const v = String(batchVal || '').trim().toLowerCase();
    const p = String(productFilter).trim().toLowerCase();
    if (!v) return false;
    if (v === p) return true;
    if (v.startsWith(p + ' ') || p.startsWith(v + ' ')) return true;
    const v0 = v.split(/\s+/)[0];
    const p0 = p.split(/\s+/)[0];
    return v0 && v0 === p0;
  };

  /**
   * Hitung A/P/Q/OEE/OEE365 dari satu payload (satu shift record),
   * rumus selaras calculation.js.
   */
  const computeFromPayload = (payload, shiftIndex) => {
    const rows = payload?.rows || [];
    const products = payload?.products || {};
    const rates = [
      parseFloat(products.p1Rate) || 0,
      parseFloat(products.p2Rate) || 0,
      parseFloat(products.p3Rate) || 0,
    ];
    const names = [];
    for (let i = 1; i <= 3; i++) {
      const name = (products['p' + i + 'Name'] || '').trim();
      const bn = (products['p' + i + 'Bn'] || '').trim();
      names.push(name ? (bn ? `${name} ${bn}` : name) : '');
    }

    const planned = (typeof CONFIG !== 'undefined' && CONFIG.PLANNED_CODES)
      ? CONFIG.PLANNED_CODES : new Set([5, 6, 7, 8]);
    const unplanned = (typeof CONFIG !== 'undefined' && CONFIG.UNPLANNED_CODES)
      ? CONFIG.UNPLANNED_CODES : new Set([1, 3, 4, 9]);
    const prodCodes = (typeof CONFIG !== 'undefined' && CONFIG.PROD_CODES)
      ? CONFIG.PROD_CODES : new Set([2]);

    const sA = (CONFIG.SHIFT_A && CONFIG.SHIFT_A[shiftIndex] != null)
      ? CONFIG.SHIFT_A[shiftIndex] : [510, 480, 450][shiftIndex] || 480;

    let B = 0, D = 0;
    let sumGood = 0, sumDefect = 0;
    const prodStats = [
      { dur: 0, rate: rates[0], target: 0, actual: 0 },
      { dur: 0, rate: rates[1], target: 0, actual: 0 },
      { dur: 0, rate: rates[2], target: 0, actual: 0 },
    ];

    const slotOf = (batch) => {
      const v = String(batch || '').trim().toLowerCase();
      if (!v) return -1;
      for (let i = 0; i < 3; i++) {
        const n = names[i].toLowerCase();
        if (!n) continue;
        if (n === v || n.startsWith(v + ' ') || v.startsWith(n + ' ')) return i;
        if (n.split(/\s+/)[0] === v.split(/\s+/)[0]) return i;
      }
      // fallback: jika hanya 1 produk master, pakai slot 0
      const filled = names.filter(Boolean).length;
      if (filled === 1) return names.findIndex(Boolean);
      return -1;
    };

    rows.forEach(r => {
      const kode = parseInt(String(r.kode || '').trim(), 10);
      const mulai = parseTime(r.mulai);
      const selesai = parseTime(r.selesai);
      let dur = parseFloat(String(r.durasi || '').replace(',', '.'));
      if (!isFinite(dur) || dur < 0) {
        if (mulai != null && selesai != null) dur = (selesai - mulai + 1440) % 1440;
        else return;
      }

      const gVal = parseFloat(String(r.good || '0').replace(',', '.')) || 0;
      const dVal = parseFloat(String(r.defect || '0').replace(',', '.')) || 0;
      sumGood += gVal;
      sumDefect += dVal;

      if (planned.has(kode)) B += dur;
      else if (unplanned.has(kode)) D += dur;
      else if (prodCodes.has(kode)) {
        const slot = slotOf(r.batch);
        if (slot >= 0) {
          prodStats[slot].dur += dur;
          prodStats[slot].actual += gVal + dVal;
          const rate = prodStats[slot].rate || 0;
          prodStats[slot].target += dur * rate;
        } else if (names.filter(Boolean).length === 0) {
          // tidak ada master name — tetap hitung ke slot 0 agar P tidak 0
          prodStats[0].dur += dur;
          prodStats[0].actual += gVal + dVal;
          prodStats[0].target += dur * (prodStats[0].rate || 0);
        }
      }
    });

    const sC = Math.max(sA - B, 0);
    const sE = Math.max(sC - D, 0);
    const avail = sC > 0 ? (sE / sC) * 100 : 0;

    let perfSum = 0, perfN = 0;
    for (let i = 0; i < 3; i++) {
      const gTarget = prodStats[i].target > 0
        ? prodStats[i].target
        : (prodStats[i].dur * prodStats[i].rate);
      const hAct = prodStats[i].actual;
      const p = gTarget > 0 ? (hAct / gTarget) * 100 : 0;
      if (names[i] && (prodStats[i].rate > 0 || prodStats[i].target > 0 || prodStats[i].actual > 0)) {
        perfSum += p;
        perfN++;
      }
    }
    // Jika tidak ada nama produk tapi ada actual, hitung dari slot 0
    if (perfN === 0 && prodStats[0].actual > 0) {
      const gTarget = prodStats[0].target > 0 ? prodStats[0].target : (prodStats[0].dur * prodStats[0].rate);
      const p = gTarget > 0 ? (prodStats[0].actual / gTarget) * 100 : 0;
      perfSum = p;
      perfN = 1;
    }
    const perf = perfN > 0 ? perfSum / perfN : 0;

    const totalOut = sumGood + sumDefect;
    const quality = totalOut > 0 ? (sumGood / totalOut) * 100 : 0;

    const oee = avail * perf * quality / 10000;
    const a365 = sA > 0 ? (sE / sA) * 100 : 0;
    const oee365 = a365 * perf * quality / 10000;

    return {
      A: avail, P: perf, Q: quality, OEE: oee,
      A365: a365, OEE365: oee365,
      sA, B, D, sC, sE,
      sumGood, sumDefect,
      products: names.map((n, i) => ({
        name: n,
        rate: rates[i],
        actual: prodStats[i].actual,
        target: prodStats[i].target,
      })).filter(p => p.name || p.actual > 0),
    };
  };

  /**
   * Agregasi beberapa record (rata-rata tertimbang menit operasional, atau
   * rata-rata sederhana OEE jika multi-shift).
   * Untuk 1 record → angka identik dengan sheet.
   */
  const aggregate = (results) => {
    if (!results.length) {
      return { A: 0, P: 0, Q: 0, OEE: 0, A365: 0, OEE365: 0, count: 0, products: [] };
    }
    if (results.length === 1) {
      return { ...results[0], count: 1 };
    }
    // Rata-rata sederhana antar record (setiap shift/hari setara)
    const avg = (key) => results.reduce((s, r) => s + (r[key] || 0), 0) / results.length;
    const prodMap = new Map();
    results.forEach(r => {
      (r.products || []).forEach(p => {
        if (!p.name) return;
        const cur = prodMap.get(p.name) || { name: p.name, rate: p.rate, actual: 0, target: 0 };
        cur.actual += p.actual;
        cur.target += p.target;
        if (p.rate) cur.rate = p.rate;
        prodMap.set(p.name, cur);
      });
    });
    return {
      A: avg('A'), P: avg('P'), Q: avg('Q'), OEE: avg('OEE'),
      A365: avg('A365'), OEE365: avg('OEE365'),
      count: results.length,
      products: Array.from(prodMap.values()),
    };
  };

  const setGauge = (fillId, valueId, pct) => {
    const fill = $(fillId);
    const val = $(valueId);
    const p = Math.max(0, Math.min(100, pct || 0));
    if (fill) fill.style.strokeDashoffset = String(ARC - (ARC * p / 100));
    if (val) val.textContent = isFinite(pct) && pct > 0 ? nf2(pct) + '%' : '—';
  };

  const setText = (id, pct, suffix = '%') => {
    const el = $(id);
    if (!el) return;
    el.textContent = isFinite(pct) && (pct > 0 || suffix !== '%') ? nf2(pct) + (suffix || '') : '—';
  };

  const renderSpeedTable = (products) => {
    const body = $('mchSpeedBody');
    if (!body) return;
    if (!products || !products.length) {
      body.innerHTML = '<tr><td colspan="3">Tidak ada produk pada filter ini</td></tr>';
      return;
    }
    body.innerHTML = products.map((p, i) => `
      <tr>
        <td>${i + 1}.</td>
        <td><b>${p.name || '—'}</b></td>
        <td>${p.rate || 0} <span style="opacity:.6">↗</span></td>
      </tr>
    `).join('');
  };

  const render = (filter) => {
    const page = filter.page || (typeof WeeklyFilter !== 'undefined' && WeeklyFilter.contextFromPage
      ? null : null);
    const ctx = (typeof WeeklyFilter !== 'undefined' && WeeklyFilter.contextFromPage)
      ? WeeklyFilter.contextFromPage(filter.page)
      : { line: null, stage: null };

    // Fallback: parse page string
    let line = ctx.line;
    let stage = ctx.stage;
    if (!line && filter.page) {
      const m = String(filter.page).match(/^(filling|kemas|steril|visual|mixing)-(\d+)$/i);
      if (m) { stage = m[1].toLowerCase(); line = m[2]; }
    }

    const from = filter.from || '';
    const to = filter.to || '';
    const shiftF = filter.shift || 'all';
    const product = filter.product || '';

    const db = getDb();
    const results = [];

    Object.keys(db).forEach(key => {
      const meta = parseKey(key);
      if (!meta) return;
      if (line && meta.line !== String(line)) return;
      if (stage && meta.stage !== String(stage)) return;
      if (from && meta.date < from) return;
      if (to && meta.date > to) return;
      if (shiftF && shiftF !== 'all' && meta.shift !== String(shiftF)) return;

      const payload = db[key]?.payload || db[key];
      if (!payload) return;

      // Filter produk: minimal satu baris / master cocok
      if (product) {
        const rows = payload.rows || [];
        const prods = payload.products || {};
        const names = [];
        for (let i = 1; i <= 3; i++) {
          const n = (prods['p' + i + 'Name'] || '').trim();
          const bn = (prods['p' + i + 'Bn'] || '').trim();
          if (n) names.push(bn ? `${n} ${bn}` : n);
        }
        const hitRow = rows.some(r => matchProduct(r.batch, product));
        const hitName = names.some(n => matchProduct(n, product));
        if (!hitRow && !hitName) return;
      }

      const shiftIndex = Math.max(0, Math.min(2, (parseInt(meta.shift, 10) || 1) - 1));
      results.push(computeFromPayload(payload, shiftIndex));
    });

    const agg = aggregate(results);

    // Update gauges mesin
    setGauge('mchOpeFill', 'mchOpeValue', agg.OEE);
    setText('mchOpeA', agg.A);
    setText('mchOpeP', agg.P);
    setText('mchOpeQ', agg.Q);

    setGauge('mch365Fill', 'mch365Value', agg.OEE365);
    setText('mch365A', agg.A365);
    setText('mch365P', agg.P);
    setText('mch365Q', agg.Q);

    // OEE Production page (agregat lebih luas — page generik)
    if (!line) {
      setGauge('oeeOpeFill', 'oeeOpeValue', agg.OEE);
      setText('oeeOpeA', agg.A);
      setText('oeeOpeP', agg.P);
      setText('oeeOpeQ', agg.Q);
      setGauge('oee365Fill', 'oee365Value', agg.OEE365);
    }

    renderSpeedTable(agg.products);

    return agg;
  };

  const onFilterChange = (e) => {
    const detail = e?.detail || {};
    render(detail);
  };

  const bind = () => {
    document.addEventListener('weekly-filter-change', onFilterChange);

    document.querySelectorAll('.weekly-nav-item').forEach(el => {
      el.addEventListener('click', () => {
        const page = el.getAttribute('data-weekly-page');
        setTimeout(() => {
          const from = $('mchFrom')?.value || '';
          const to = $('mchTo')?.value || '';
          const product = $('mchProduct')?.value || '';
          const shiftBtn = document.querySelector('#mchShiftGroup .mch-shift-btn.on');
          const shift = shiftBtn ? shiftBtn.getAttribute('data-shift') : 'all';
          render({ page, from, to, product, shift, scope: 'machine' });
        }, 60);
      });
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  return { render, computeFromPayload, bind };
})();
