/**
 * WEEKLY-BATCH.JS
 * Hitungan OEE per BATCH untuk halaman detail mesin (Dashboard Weekly Meeting) — issue #12.
 *
 * Rumus (total per batch, sama dengan file contoh Excel "contohhitung_oee"):
 *   A = Waktu Operasional (E) ÷ Waktu Produksi Terencana (C)
 *   P = Output Aktual ÷ Output Standar
 *       Output Standar = Speed Standar × Waktu Operasional (E)
 *       Output Aktual  = Output Baik + Output Defect
 *   Q = Output Baik ÷ Output Aktual
 *   OEE = A × P × Q
 *
 * Penting: nilai dijumlah dulu per batch (ΣE, ΣC, ΣOutput…) baru dibagi.
 * BUKAN rata-rata % per shift.
 *
 * Batch = label "KODE BN" (mis. "VPEL1 L027103"), sama dengan dropdown Produk & Batch.
 * Bila satu shift memuat > 1 batch, C & E shift itu dibagi proporsional menit produksi
 * (kode 2) tiap batch, supaya tidak terhitung dobel.
 *
 * Bagian hitung (calc/derive) murni tanpa DOM → bisa dites dengan node (weekly-batch-test.mjs).
 * Bergantung pada: WeeklyCalc (weekly-calc.js), Utils (utils.js).
 */
const WeeklyBatch = (() => {
  'use strict';

  const NO_BATCH = '(Tanpa batch)';

  // ================= HITUNG (tanpa DOM) =================

  /** Turunkan A/P/Q/OEE dari jumlah mentah. null bila pembagi 0. */
  const derive = (b) => {
    const a = b.C > 0 ? (b.E / b.C) * 100 : null;
    const p = b.std > 0 ? (b.actual / b.std) * 100 : null;
    const q = b.actual > 0 ? (b.good / b.actual) * 100 : null;
    return {
      ...b,
      speed: b.E > 0 ? b.std / b.E : null,
      a, p, q,
      oee: a != null && p != null && q != null ? (a * p * q) / 10000 : null,
    };
  };

  /**
   * recs    : record OEE (sudah difilter shift bila perlu)
   * product : filter Produk/Batch ('' = semua; "KODE" = semua batch kode itu; "KODE BN" = satu batch)
   * Return  : { batches:[{label, code, C, E, std, actual, good, defect, speed, a, p, q, oee, first, last, days, records}], total }
   */
  const calc = (recs, product) => {
    const by = new Map();

    (recs || []).forEach((rec) => {
      const re = WeeklyCalc.recompute(rec);
      if (!re.info.length) return;

      // Menit produksi (kode 2, di dalam shift) & target per batch pada record ini.
      const mine = new Map();
      let tAll = 0;
      re.info.forEach((r) => {
        if (r.cat !== 'prod' || !r.inShift || r.dur == null) return;
        tAll += r.dur;
        const label = WeeklyCalc.rowLabel(r.x, re.slots) || NO_BATCH;
        if (label !== NO_BATCH && !WeeklyCalc.matches(label, product)) return;
        if (label === NO_BATCH && WeeklyCalc.norm(product)) return;
        const si = WeeklyCalc.slotIndex(r.x.batch, re.slots, true);
        const rate = si >= 0 ? (WeeklyCalc.effRate(re.stage, re.line, re.slots[si], r.x.op) || 0) : 0;
        const m = mine.get(label) || { t: 0, tg: 0 };
        m.t += r.dur;
        m.tg += r.dur * rate;           // Σ menit × speed → speed rata-rata terbobot menit
        mine.set(label, m);
      });
      if (!(tAll > 0)) return;

      const date = String(rec.date || '').slice(0, 10);
      mine.forEach((m, label) => {
        if (!(m.t > 0)) return;
        const share = m.t / tAll;
        // Output baik & defect: semua baris log milik batch ini (aturan sheet: dihitung walau durasi kosong).
        let g = 0, d = 0;
        re.info.forEach((r) => {
          if ((WeeklyCalc.rowLabel(r.x, re.slots) || NO_BATCH) === label) { g += r.g; d += r.d; }
        });
        const b = by.get(label) || {
          label, code: label === NO_BATCH ? '' : WeeklyCalc.codeOf(label),
          C: 0, E: 0, std: 0, actual: 0, good: 0, defect: 0,
          first: date, last: date, dates: new Set(), records: 0,
        };
        b.C += re.C * share;
        b.E += re.E * share;
        b.std += (m.tg / m.t) * re.E * share;   // speed batch di record ini × E yang dialokasikan
        b.actual += g + d;
        b.good += g;
        b.defect += d;
        b.records++;
        if (date) {
          b.dates.add(date);
          if (!b.first || date < b.first) b.first = date;
          if (date > b.last) b.last = date;
        }
        by.set(label, b);
      });
    });

    const batches = [...by.values()]
      .map((b) => derive({ ...b, days: b.dates.size }))
      .sort((x, y) => (x.first < y.first ? -1 : x.first > y.first ? 1 : x.label < y.label ? -1 : 1));

    const sum = (k) => batches.reduce((s, b) => s + b[k], 0);
    const total = derive({
      label: 'TOTAL', code: '', C: sum('C'), E: sum('E'), std: sum('std'),
      actual: sum('actual'), good: sum('good'), defect: sum('defect'),
      first: batches.length ? batches[0].first : '', last: batches.length ? batches[batches.length - 1].last : '',
      days: 0, records: sum('records'),
    });
    return { batches, total };
  };

  // ================= TAMPILAN =================

  const $ = (id) => document.getElementById(id);
  const esc = (s) => (typeof Utils !== 'undefined' ? Utils.escapeHtml(s) : String(s));
  const nf = (n, d) => (n == null || !Number.isFinite(n)) ? '—'
    : Number(n).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: d });
  const pct = (v) => (v == null ? '—' : Number(v).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%');
  const fmtD = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

  let last = null;       // { res, ctx, targets }
  let selected = '';     // '' = TOTAL, selain itu label batch

  const cls = (v, tgt) => (v == null || tgt == null ? '' : v >= tgt ? ' wb-ok' : ' wb-low');

  const rowHtml = (b, tg, isTotal) => {
    const sel = isTotal ? selected === '' : selected === b.label;
    return `<tr class="wb-row${isTotal ? ' wb-total' : ''}${sel ? ' is-sel' : ''}" data-batch="${esc(isTotal ? '' : b.label)}" tabindex="0" role="button" aria-pressed="${sel}" title="Klik untuk melihat rumus & angka">`
      + `<td class="wb-name">${esc(b.label)}${isTotal ? '' : `<small>${fmtD(b.first)}${b.last !== b.first ? ' – ' + fmtD(b.last) : ''}</small>`}</td>`
      + `<td>${nf(b.C, 1)}</td><td>${nf(b.E, 1)}</td>`
      + `<td class="wb-pct${cls(b.a, tg.a)}">${pct(b.a)}</td>`
      + `<td>${nf(b.speed, 2)}</td><td>${nf(b.std, 0)}</td><td>${nf(b.actual, 0)}</td><td>${nf(b.good, 0)}</td>`
      + `<td class="wb-pct${cls(b.p, tg.p)}">${pct(b.p)}</td>`
      + `<td class="wb-pct${cls(b.q, tg.q)}">${pct(b.q)}</td>`
      + `<td class="wb-pct wb-oee${cls(b.oee, tg.oee)}">${pct(b.oee)}</td></tr>`;
  };

  /** Kartu rumus + angka untuk batch terpilih (mis. "1.295 ÷ 1.320 = 98,11%"). */
  const detailHtml = (b) => {
    const step = (key, name, formula, nums, val, extra) =>
      `<div class="wb-step"><div class="wb-step-key">${key}</div><div class="wb-step-body">`
      + `<div class="wb-step-name">${name}</div><div class="wb-step-formula">${formula}</div>`
      + `<div class="wb-step-calc">${nums} = <b>${val}</b></div>${extra || ''}</div></div>`;
    return `<div class="wb-detail-head">Rumus &amp; angka · <b>${esc(b.label)}</b></div><div class="wb-steps">`
      + step('A', 'Availability', 'Waktu Operasional ÷ Waktu Produksi Terencana',
        `${nf(b.E, 1)} ÷ ${nf(b.C, 1)}`, pct(b.a))
      + step('P', 'Performance', 'Output Aktual ÷ Output Standar',
        `${nf(b.actual, 0)} ÷ ${nf(b.std, 0)}`, pct(b.p),
        `<div class="wb-step-sub">Output Standar = Speed Standar × Waktu Operasional = ${nf(b.speed, 2)} × ${nf(b.E, 1)}<br>Output Aktual = Baik + Defect = ${nf(b.good, 0)} + ${nf(b.defect, 0)}</div>`)
      + step('Q', 'Quality', 'Output Baik ÷ Output Aktual',
        `${nf(b.good, 0)} ÷ ${nf(b.actual, 0)}`, pct(b.q))
      + step('OEE', 'OEE', 'A × P × Q',
        `${pct(b.a)} × ${pct(b.p)} × ${pct(b.q)}`, pct(b.oee))
      + '</div>';
  };

  const paint = () => {
    if (!last) return;
    const { res, ctx, targets } = last;
    const tg = targets || {};
    const body = $('wbBody'), foot = $('wbFoot'), det = $('wbDetail'), note = $('wbCtx'), empty = $('wbEmpty'), wrap = $('wbTableWrap');
    if (!body) return;
    if (note) note.textContent = ctx || '';
    if (!res.batches.length) {
      body.innerHTML = ''; if (foot) foot.innerHTML = ''; if (det) det.innerHTML = '';
      if (empty) empty.hidden = false;
      if (wrap) wrap.hidden = true;
      return;
    }
    if (empty) empty.hidden = true;
    if (wrap) wrap.hidden = false;
    if (selected && !res.batches.some((b) => b.label === selected)) selected = '';
    body.innerHTML = res.batches.map((b) => rowHtml(b, tg, false)).join('');
    if (foot) foot.innerHTML = res.batches.length > 1 ? rowHtml(res.total, tg, true) : '';
    const cur = selected ? res.batches.find((b) => b.label === selected) : (res.batches.length === 1 ? res.batches[0] : res.total);
    if (det) det.innerHTML = detailHtml(cur);
  };

  let bound = false;
  const bind = () => {
    if (bound) return;
    const root = $('mchBatchCalc');
    if (!root) return;
    bound = true;
    const pick = (tr) => {
      if (!tr) return;
      selected = tr.getAttribute('data-batch') || '';
      paint();
    };
    root.addEventListener('click', (e) => pick(e.target.closest('tr.wb-row')));
    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const tr = e.target.closest('tr.wb-row');
      if (tr) { e.preventDefault(); pick(tr); }
    });
  };

  /**
   * recs   : record mesin pada rentang tanggal (sudah difilter shift)
   * f      : filter { product, shift }
   * opts   : { targets:{a,p,q,oee}, ctx:'teks konteks' }
   */
  const render = (recs, f, opts) => {
    bind();
    const o = opts || {};
    last = { res: calc(recs, f && f.product), ctx: o.ctx || '', targets: o.targets };
    paint();
    return last.res;
  };

  return { calc, derive, render };
})();
