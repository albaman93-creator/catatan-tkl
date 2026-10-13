/**
 * WEEKLY-CALC.JS
 * Perhitungan OEE untuk Dashboard Weekly Meeting — murni hitung, TANPA DOM.
 * Dipakai oleh weekly-dashboard.js (gauge, speed standar, grafik, tabel bawah).
 *
 * Rumus per record (satu shift) SAMA dengan js/calculation.js (log sheet):
 *   C = shift − planned DT · E = C − unplanned DT · A = E / C
 *   P = rata-rata (aktual ÷ target) per produk aktif · Q = good / (good + defect)
 *   OEE = A × P × Q
 * Hanya baris yang jam mulainya jatuh di shift record yang masuk A & P (aturan sheet).
 *
 * Agregasi (tidak berubah dari sebelumnya bila tanpa filter produk):
 *   OPE : rata-rata A/P/Q/OEE tersimpan per record.
 *   365 : A365 = Σ waktu operasional ÷ (menit basis × jumlah hari) per mesin;
 *         basis = 1440 (semua shift) atau menit shift terpilih (S1=510, S2=480, S3=450).
 *         P & Q = rata-rata per mesin; OEE 365 = rata-rata antar mesin.
 *
 * Filter PRODUK (kode = semua batch, atau "KODE BN" = satu batch):
 *   A  = availability record (downtime milik shift, tidak bisa dipisah per produk)
 *   P  = dari baris produksi produk itu · Q = dari good/defect baris produk itu
 *   bobot rata-rata = menit produksi produk itu di tiap record
 *   A365 = waktu operasional yang dialokasikan ke produk (proporsional menit produksi)
 *          ÷ (basis × jumlah hari produk itu berjalan di mesin tsb)
 */
const WeeklyCalc = (() => {
  'use strict';

  const DAY_MIN = 1440;

  // ---------- util kecil ----------
  const norm = (s) => String(s == null ? '' : s).trim().replace(/\s+/g, ' ');
  const codeOf = (s) => norm(s).split(' ')[0].toUpperCase();
  /** Angka gaya log sheet: koma desimal → titik. */
  const num = (v) => parseFloat(String(v == null ? '' : v).replace(',', '.')) || 0;
  /** Angka dari kolom DB (bisa "86,78%" atau number). null bila kosong. */
  const toNum = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (v == null || v === '') return null;
    let s = String(v).replace('%', '').trim();
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  const shiftIdx = (rec) => Math.max(0, Math.min(2, (parseInt(rec.shift, 10) || 1) - 1));
  const dateOf = (rec) => String(rec.date || '').slice(0, 10);

  // ---------- produk ----------
  /** 3 slot master produk di header record. label = "KODE BN". */
  const slotsOf = (products) => [1, 2, 3].map((i) => {
    const p = products || {};
    const name = norm(p['p' + i + 'Name']);
    const bn = norm(p['p' + i + 'Bn']);
    return {
      name,
      label: name ? (bn ? name + ' ' + bn : name) : '',
      rate: num(p['p' + i + 'Rate']),
      ukuran: String(p['p' + i + 'Ukuran'] == null ? '' : p['p' + i + 'Ukuran']),
      wo: norm(p['p' + i + 'Wo']),
    };
  });

  /**
   * Cocokkan batch baris → index slot (0..2) atau -1.
   * Urutan: label persis → awalan → kode sama. blankToSingle: batch kosong
   * dianggap milik slot tunggal bila record hanya punya 1 produk.
   */
  const slotIndex = (batch, slots, blankToSingle) => {
    const b = norm(batch).toLowerCase();
    const filled = [0, 1, 2].filter((i) => slots[i].label);
    if (!b) return blankToSingle && filled.length === 1 ? filled[0] : -1;
    for (const i of filled) if (slots[i].label.toLowerCase() === b) return i;
    for (const i of filled) {
      const l = slots[i].label.toLowerCase();
      if (l.startsWith(b + ' ') || b.startsWith(l + ' ')) return i;
    }
    for (const i of filled) if (codeOf(slots[i].label) === codeOf(b)) return i;
    return -1;
  };

  /** Label produk sebuah baris ("KODE BN"), memakai master slot bila ada. */
  const rowLabel = (row, slots) => {
    const i = slotIndex(row && row.batch, slots, true);
    return i >= 0 ? slots[i].label : norm(row && row.batch);
  };

  /** Filter "VTTS1" → semua batch kode itu; "VTTS1 L030207" → batch itu saja. */
  const matches = (label, filter) => {
    const f = norm(filter);
    if (!f) return true;
    const l = norm(label);
    if (!l) return false;
    if (f.includes(' ')) return l.toLowerCase() === f.toLowerCase();
    return codeOf(l) === f.toUpperCase();
  };

  /**
   * Rate efektif (bag/mnt) — cermin Rows.getEffectiveRate tapi murni (tanpa DOM).
   * Kemas L1: OP < ambang → low, selain itu high · Kemas L2: tabel ukuran × band OP.
   */
  const effRate = (stage, line, slot, op) => {
    const orang = num(op) > 0 ? num(op) : 0;
    if (stage === 'kemas' && line === '1') {
      const c = CONFIG.KEMAS_L1_RATE || { low: 8, high: 12, opThreshold: 3 };
      return (!(orang > 0) || orang >= (c.opThreshold || 3)) ? c.high : c.low;
    }
    if (stage === 'kemas' && line === '2') {
      const t = (CONFIG.KEMAS_L2_RATE || {})[slot.ukuran];
      if (t) return (!(orang > 0) || orang <= 3) ? t.le3 : t.gt3;
    }
    return slot.rate;
  };

  /** Durasi baris (menit): mulai→selesai bila ada, selain itu kolom durasi. null = tak valid. */
  const durOf = (x) => {
    const s = Utils.parseTime(x.mulai), e = Utils.parseTime(x.selesai);
    if (s != null && e != null) return (e - s + DAY_MIN) % DAY_MIN;
    const m = parseFloat(String(x.durasi == null ? '' : x.durasi).replace(',', '.'));
    return Number.isFinite(m) && m >= 0 ? m : null;
  };

  // ---------- hitung ulang satu record dari baris log (cermin calculation.js) ----------
  const recompute = (rec) => {
    const pay = rec.payload || {};
    const rows = Array.isArray(pay.rows) ? pay.rows : [];
    const slots = slotsOf(pay.products);
    const si = shiftIdx(rec);
    const stage = String(rec.tahapan || '').toLowerCase();
    const line = String(rec.line == null ? '' : rec.line);
    const sA = CONFIG.SHIFT_A[si];

    let B = 0, D = 0, tAll = 0, good = 0, defect = 0;
    const st = slots.map(() => ({ dur: 0, actual: 0, target: 0 }));
    const info = [];

    rows.forEach((x) => {
      const g = num(x.good), d = num(x.defect);
      good += g; defect += d;                       // sheet: dihitung walau durasi kosong
      const dur = durOf(x);
      const cat = Utils.catOf(x.kode);
      const rs = Utils.shiftOf(Utils.parseTime(x.mulai));
      const inShift = rs === si;
      info.push({ x, g, d, dur, cat, inShift });
      if (dur == null || !inShift) return;
      if (cat === 'planned') B += dur;
      else if (cat === 'unplanned') D += dur;
      else if (cat === 'prod') {
        tAll += dur;
        const pi = slotIndex(x.batch, slots, false); // sheet: batch kosong tidak dihitung ke P
        if (pi >= 0) {
          st[pi].dur += dur;
          st[pi].actual += g + d;
          st[pi].target += dur * (effRate(stage, line, slots[pi], x.op) || 0);
        }
      }
    });

    const C = Math.max(sA - B, 0);
    const E = Math.max(C - D, 0);
    const A = C > 0 ? (E / C) * 100 : 0;

    let sum = 0, n = 0;
    const perSlot = slots.map((s, i) => {
      const gT = st[i].target > 0 ? st[i].target : st[i].dur * s.rate;
      const p = gT > 0 ? (st[i].actual / gT) * 100 : 0;
      const active = !!s.label && (s.rate > 0 || st[i].target > 0 || st[i].actual > 0);
      if (active) { sum += p; n++; }
      return { p, active };
    });
    const P = n > 0 ? sum / n : 0;
    const out = good + defect;
    const Q = out > 0 ? (good / out) * 100 : 0;
    return { A, P, Q, O: (A * P * Q) / 10000, sA, B, D, C, E, tAll, slots, perSlot, info, si, stage, line };
  };

  // ---------- metrik per record (dipakai agregasi) ----------
  /**
   * Tanpa product → nilai tersimpan per record (bobot 1) — sama dengan perilaku lama.
   * Dengan product → irisan record untuk produk itu; null bila produk tidak berjalan di record.
   * { key, date, shift, w, en, a, p, q, o }
   */
  const metric = (rec, product) => {
    const re = recompute(rec);
    const has = re.info.length > 0;
    const sa = toNum(rec.availability), sp = toNum(rec.performance), sq = toNum(rec.quality), so = toNum(rec.oee);
    const base = {
      key: String(rec.tahapan) + '|' + String(rec.line),
      date: dateOf(rec),
      shift: re.si + 1,
    };
    const enWhole = has ? re.E : (sa != null ? (re.sA * sa) / 100 : 0);
    const a = sa != null ? sa : (has ? re.A : null);

    if (!norm(product)) {
      return {
        ...base, w: 1, en: enWhole, a,
        p: sp != null ? sp : (has ? re.P : null),
        q: sq != null ? sq : (has ? re.Q : null),
        o: so != null ? so : (has ? re.O : null),
      };
    }
    if (!has) return null;

    let t = 0, g = 0, d = 0;
    re.info.forEach((r) => {
      if (!matches(rowLabel(r.x, re.slots), product)) return;
      g += r.g; d += r.d;
      if (r.cat === 'prod' && r.inShift && r.dur != null) t += r.dur;
    });
    if (!(t > 0)) return null;                      // produk tidak berjalan di record ini

    const idx = [0, 1, 2].filter((i) => re.slots[i].label && matches(re.slots[i].label, product) && re.perSlot[i].active);
    const p = idx.length ? idx.reduce((s, i) => s + re.perSlot[i].p, 0) / idx.length : 0;
    const q = g + d > 0 ? (g / (g + d)) * 100 : 0;
    const aa = a != null ? a : re.A;
    return {
      ...base, w: t,
      en: re.tAll > 0 ? (enWhole * t) / re.tAll : 0,
      a: aa, p, q, o: (aa * p * q) / 10000,
    };
  };

  const metrics = (recs, product) => recs.map((r) => metric(r, product)).filter(Boolean);

  // ---------- agregasi ----------
  const wavg = (arr, f) => {
    let s = 0, w = 0;
    arr.forEach((m) => { const v = f(m); if (v != null && m.w > 0) { s += v * m.w; w += m.w; } });
    return w > 0 ? s / w : null;
  };
  const mean = (arr) => {
    const v = arr.filter((x) => x != null);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  const shiftBasis = (shift) => {
    const i = parseInt(shift, 10);
    return i >= 1 && i <= 3 ? CONFIG.SHIFT_A[i - 1] : DAY_MIN;
  };

  /**
   * opts: { days (hari kalender rentang), product (bool), shift ('all'|1|2|3) }
   * Return { ope:{a,p,q,oee}, o365:{a,p,q,oee}, per:{ 'tahapan|line': {...} }, n }
   */
  const calcSet = (ms, opts) => {
    const o = opts || {};
    const basis = shiftBasis(o.shift);
    const ope = {
      a: wavg(ms, (m) => m.a), p: wavg(ms, (m) => m.p),
      q: wavg(ms, (m) => m.q), oee: wavg(ms, (m) => m.o),
    };
    const by = {};
    ms.forEach((m) => { (by[m.key] = by[m.key] || []).push(m); });
    const per = {};
    Object.keys(by).forEach((k) => {
      const list = by[k];
      const dayCount = o.product ? new Set(list.map((m) => m.date)).size : Math.max(1, o.days || 1);
      const a365 = Math.min(100, (list.reduce((s, m) => s + m.en, 0) / (basis * Math.max(1, dayCount))) * 100);
      const p = wavg(list, (m) => m.p), q = wavg(list, (m) => m.q);
      per[k] = { a365, p, q, o365: p != null && q != null ? (a365 * p * q) / 10000 : null, ope: wavg(list, (m) => m.o) };
    });
    const v = Object.values(per);
    const o365 = {
      a: mean(v.map((x) => x.a365)), p: mean(v.map((x) => x.p)),
      q: mean(v.map((x) => x.q)), oee: mean(v.map((x) => x.o365)),
    };
    return { ope, o365, per, n: ms.length };
  };

  // ---------- filter & daftar produk ----------
  const filterShift = (recs, shift) => {
    const s = parseInt(shift, 10);
    return s >= 1 && s <= 3 ? recs.filter((r) => (parseInt(r.shift, 10) || 1) === s) : recs;
  };

  /** Salinan record yang baris log-nya hanya milik produk (untuk tabel Shutdown / PICA). */
  const productView = (recs, product) => {
    if (!norm(product)) return recs;
    const out = [];
    recs.forEach((rec) => {
      const pay = rec.payload || {};
      const rows = Array.isArray(pay.rows) ? pay.rows : [];
      const slots = slotsOf(pay.products);
      const keep = rows.filter((x) => matches(rowLabel(x, slots), product));
      if (keep.length) out.push({ ...rec, payload: { ...pay, rows: keep } });
    });
    return out;
  };

  /**
   * Daftar produk & batch yang terdaftar pada record-record ini (riwayat rentang tanggal).
   * { products:[{code,batches,first,last}], batches:[{label,code,first,last}] } urut tanggal.
   */
  const productOptions = (recs) => {
    const bat = new Map();
    recs.forEach((rec) => {
      const pay = rec.payload || {};
      const slots = slotsOf(pay.products);
      const date = dateOf(rec);
      const labels = new Set(slots.filter((s) => s.label).map((s) => s.label));
      (Array.isArray(pay.rows) ? pay.rows : []).forEach((x) => {
        if (Utils.catOf(x.kode) !== 'prod') return;
        const l = rowLabel(x, slots);
        if (l) labels.add(l);
      });
      labels.forEach((label) => {
        const cur = bat.get(label) || { label, code: codeOf(label), first: date, last: date };
        if (date && (!cur.first || date < cur.first)) cur.first = date;
        if (date && date > cur.last) cur.last = date;
        bat.set(label, cur);
      });
    });
    const byDate = (a, b) => (a.first < b.first ? -1 : a.first > b.first ? 1 : a.label < b.label ? -1 : a.label > b.label ? 1 : 0);
    const batches = [...bat.values()].sort(byDate);
    const pm = new Map();
    batches.forEach((b) => {
      const cur = pm.get(b.code) || { code: b.code, batches: 0, first: b.first, last: b.last };
      cur.batches++;
      if (b.first < cur.first) cur.first = b.first;
      if (b.last > cur.last) cur.last = b.last;
      pm.set(b.code, cur);
    });
    return {
      products: [...pm.values()].sort((a, b) => (a.first < b.first ? -1 : a.first > b.first ? 1 : a.code < b.code ? -1 : 1)),
      batches: batches.filter((b) => b.label.includes(' ')),   // label tanpa BN sudah tercakup di "per produk"
    };
  };

  return {
    codeOf, norm, toNum, slotsOf, slotIndex, rowLabel, matches, effRate,
    recompute, metric, metrics, calcSet, shiftBasis,
    filterShift, productView, productOptions,
  };
})();
