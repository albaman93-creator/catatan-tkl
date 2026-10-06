/**
 * WEEKLY-DASHBOARD.JS
 * Dashboard Weekly Meeting mirip Looker Studio
 * - Sidebar navigasi
 * - Halaman Capaian Yield Produksi (gauge + bar + KPI)
 * - Halaman OEE PRODUCTION (dual half-circle gauge + speed table)
 * - Placeholder detail mesin
 */
const WeeklyDashboard = (() => {
  'use strict';

  const EXTERNAL_URL = 'https://datastudio.google.com/u/2/reporting/6c7344aa-f59c-4913-a8bf-2876228e987f/page/p_cd3o6rdg7d';

  // Panjang path setengah lingkaran: π * radius
  // Yield gauge: r=80 → 251.2
  // OEE gauges: r=85 → 266.9
  const YIELD_GAUGE_LEN = 251.2;
  const OEE_GAUGE_LEN = 266.9;

  const MACHINE_TITLES = {
    'filling-1': 'MESIN FILLING LINE 1',
    'filling-2': 'MESIN FILLING LINE 2',
    'filling-4': 'MESIN FILLING LINE 4',
    'kemas-1': 'MESIN KEMAS LINE 1',
    'kemas-2': 'MESIN KEMAS LINE 2',
    'kemas-4': 'MESIN KEMAS LINE 4'
  };

  let inited = false;

  const fmtPct = (v, d = 2) =>
    Number(v).toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%';

  /** Set stroke-dashoffset untuk gauge setengah lingkaran (0% = kosong, 100% = penuh) */
  const setHalfGauge = (elId, pct, len) => {
    const fill = document.getElementById(elId);
    if (!fill) return;
    const clamped = Math.max(0, Math.min(100, Number(pct) || 0));
    const offset = len * (1 - clamped / 100);
    // Reset dulu biar animasi jalan setiap kali
    fill.style.transition = 'none';
    fill.style.strokeDashoffset = String(len);
    // Force reflow
    void fill.getBoundingClientRect();
    fill.style.transition = 'stroke-dashoffset 0.9s ease';
    fill.style.strokeDashoffset = String(offset);
  };

  const setYieldGauge = (pct) => {
    setHalfGauge('weeklyGaugeFill', pct, YIELD_GAUGE_LEN);
    const val = document.getElementById('weeklyGaugeValue');
    if (val) val.textContent = fmtPct(pct, 1);
  };

  // ===== OEE PRODUCTION: data nyata Supabase (Filling & Kemas, Line 1/2/4) =====
  const OEE_LINES = ['1', '2', '4'];
  const OEE_STAGES = ['filling', 'kemas'];
  // Pemetaan mesin per line — ubah di sini bila nama mesin berbeda.
  const OEE_MACHINES = {
    filling: [
      { line: '1', name: 'Shinva', sub: 'RSYG2-1-23005' },
      { line: '2', name: 'Plumat', sub: 'FFS 991' },
      { line: '4', name: 'Plumat', sub: 'FFS 892' }
    ],
    kemas: [
      { line: '1', name: 'Sysflex', sub: 'Line 1' },
      { line: '2', name: 'Sysflex', sub: 'Line 2' },
      { line: '4', name: 'Plumat', sub: 'OW 834' }
    ]
  };
  const TGT_OPE = { a: 90, p: 98, q: 99.5 };
  const TGT_365 = { a: 56, p: 98, q: 99.5 };
  const DAY_MIN = 1440;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  let oeeSeq = 0;

  const $ = (id) => document.getElementById(id);
  const f2 = (v) => (v == null ? '—' : fmtPct(v, 2));
  const fmtD = (iso) => iso.split('-').reverse().join('/');
  const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1;
  const monthLabel = (k) => MON[Number(k.slice(5, 7)) - 1] + ' ' + k.slice(2, 4);
  const toNum = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (v == null || v === '') return null;
    let s = String(v).replace('%', '').trim();
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  const avg = (arr) => {
    const v = arr.filter((x) => x != null);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };

  // stage+line diisi → satu mesin (halaman detail mesin); kosong → semua Filling & Kemas Line 1/2/4.
  const fetchOeeRows = async (from, to, stage, line) => {
    const client = typeof SupabaseClient !== 'undefined' ? SupabaseClient.getClient() : null;
    if (!client) throw new Error('Supabase belum terhubung');
    const out = [];
    for (let i = 0; i < 30; i++) {
      let q = client.from(CONFIG.DB_TABLE).select('date,shift,line,tahapan,availability,performance,quality,oee,payload');
      q = stage ? q.eq('tahapan', stage).eq('line', String(line)) : q.in('tahapan', OEE_STAGES).in('line', OEE_LINES);
      const { data, error } = await q.gte('date', from).lte('date', to)
        .order('date', { ascending: false }).order('key', { ascending: true })
        .range(i * 1000, i * 1000 + 999);
      if (error) throw error;
      out.push(...data);
      if (data.length < 1000) break;
    }
    return out;
  };

  // Metrik per record. en = waktu operasional (menit) = (shift − planned) − unplanned.
  const recMetrics = (r) => {
    const sm = CONFIG.SHIFT_A[(Number(r.shift) || 1) - 1] || 0;
    const rows = Array.isArray(r.payload?.rows) ? r.payload.rows : [];
    let planned = 0, unplanned = 0;
    rows.forEach((x) => {
      const k = parseInt(String(x.kode ?? '').trim(), 10);
      const s = Utils.parseTime(x.mulai), e = Utils.parseTime(x.selesai);
      const d = s != null && e != null ? (e - s + 1440) % 1440 : (toNum(x.durasi) || 0);
      if (CONFIG.PLANNED_CODES.has(k)) planned += d;
      else if (CONFIG.UNPLANNED_CODES.has(k)) unplanned += d;
    });
    const c = Math.max(sm - planned, 0);
    const a = toNum(r.availability);
    const en = rows.length ? Math.max(c - unplanned, 0) : (a != null ? (c * a) / 100 : 0);
    return { a, p: toNum(r.performance), q: toNum(r.quality), o: toNum(r.oee), en };
  };

  // OPE : rata-rata A/P/Q/OEE tersimpan per record (sama dengan Dashboard 360°).
  // 365 : A365 = Σ waktu operasional ÷ (1440 mnt × hari kalender) per mesin; P & Q sama dengan OPE.
  const calcSet = (rows, days) => {
    const m = rows.map(recMetrics);
    const ope = { a: avg(m.map((x) => x.a)), p: avg(m.map((x) => x.p)), q: avg(m.map((x) => x.q)), oee: avg(m.map((x) => x.o)) };
    const byM = {};
    rows.forEach((r, i) => { const k = r.tahapan + '|' + r.line; (byM[k] = byM[k] || []).push(m[i]); });
    const per = {};
    Object.keys(byM).forEach((k) => {
      const list = byM[k];
      const a365 = Math.min(100, (list.reduce((s, x) => s + x.en, 0) / (DAY_MIN * Math.max(1, days))) * 100);
      const p = avg(list.map((x) => x.p)), q = avg(list.map((x) => x.q));
      per[k] = { a365, p, q, o365: p != null && q != null ? (a365 * p * q) / 10000 : null, ope: avg(list.map((x) => x.o)) };
    });
    const v = Object.values(per);
    const o365 = { a: avg(v.map((x) => x.a365)), p: avg(v.map((x) => x.p)), q: avg(v.map((x) => x.q)), oee: avg(v.map((x) => x.o365)) };
    return { ope, o365, per };
  };

  const setApq = (id, val, tgt) => {
    const n = $(id);
    if (!n) return;
    n.textContent = f2(val);
    const box = n.closest('.oee-apq-item');
    if (box) { box.classList.toggle('over', val != null && val >= tgt); box.classList.toggle('under', val == null || val < tgt); }
  };

  const setOeeGauges = (all, pf = 'oee') => {
    setHalfGauge(pf + 'OpeFill', all.ope.oee ?? 0, OEE_GAUGE_LEN);
    setHalfGauge(pf + '365Fill', all.o365.oee ?? 0, OEE_GAUGE_LEN);
    $(pf + 'OpeValue').textContent = f2(all.ope.oee);
    $(pf + '365Value').textContent = f2(all.o365.oee);
    setApq(pf + 'OpeA', all.ope.a, TGT_OPE.a); setApq(pf + 'OpeP', all.ope.p, TGT_OPE.p); setApq(pf + 'OpeQ', all.ope.q, TGT_OPE.q);
    setApq(pf + '365A', all.o365.a, TGT_365.a); setApq(pf + '365P', all.o365.p, TGT_365.p); setApq(pf + '365Q', all.o365.q, TGT_365.q);
  };

  // Sumber tiap baris Speed Standar: record terbaru (tanggal, lalu shift) yang memuat produk itu.
  // Klik baris → buka log sheet record tersebut.
  const speedLatest = (rows, keyFn) => {
    const latest = {};
    rows.forEach((r) => {
      const p = r.payload?.products || {};
      [[p.p1Name, p.p1Rate], [p.p2Name, p.p2Rate], [p.p3Name, p.p3Rate]].forEach(([n, rt]) => {
        const name = String(n || '').trim(), rate = toNum(rt), key = keyFn(name);
        if (!name || !key || !(rate > 0)) return;
        const cur = latest[key];
        const newer = !cur || r.date > cur.date || (r.date === cur.date && Number(r.shift) > Number(cur.shift));
        if (newer) latest[key] = { rate, date: String(r.date), shift: Number(r.shift) || 1, line: String(r.line), stage: r.tahapan };
      });
    });
    return latest;
  };
  const speedRowAttrs = (name, s) => {
    const stg = s.stage.charAt(0).toUpperCase() + s.stage.slice(1);
    const tip = `Buka log sheet: ${fmtD(s.date)} · Shift ${s.shift} · Line ${s.line} · ${stg}`;
    return {
      src: `${fmtD(s.date)} · S${s.shift} · L${s.line} · ${stg}`,
      attrs: `class="speed-row" tabindex="0" role="link" title="${tip}" aria-label="${Utils.escapeHtml(name)} — ${tip}"`
        + ` data-date="${s.date}" data-shift="${s.shift}" data-line="${s.line}" data-stage="${s.stage}"`
    };
  };

  const renderSpeed = (rows) => {
    const body = $('oeeSpeedBody');
    if (!body) return;
    const latest = speedLatest(rows, (n) => n);
    const names = Object.keys(latest).sort().reverse();
    body.innerHTML = names.length
      ? names.map((n) => {
          const s = latest[n], t = speedRowAttrs(n, s);
          return `<tr ${t.attrs}><td>${Utils.escapeHtml(n)}<small class="speed-src">${t.src}</small></td>`
            + `<td>${s.rate.toLocaleString('id-ID')}<span class="speed-go" aria-hidden="true">↗</span></td></tr>`;
        }).join('')
      : '<tr><td colspan="2">Tidak ada data pada rentang ini</td></tr>';
  };

  const openSpeedRow = (tr) => {
    const d = tr?.dataset;
    if (!d || !d.date) return;
    if (typeof UI === 'undefined' || !UI.openRecord) return;
    UI.openRecord({ date: d.date, shift: d.shift, line: d.line, stage: d.stage });
  };

  const trendSvg = (id, pts, color, light, ylabel, fixedMax) => {
    const svg = $(id);
    if (!svg) return;
    const top = Math.max(0, ...pts.map((p) => (Number.isFinite(p.v) ? p.v : 0)));
    const max = fixedMax || Math.max(50, Math.ceil(top / 10) * 10);
    const Y = (v) => 180 - (Math.min(v, max) / max) * 160;
    let s = '<g stroke="#334155" stroke-width="1">';
    for (let i = 0; i <= 5; i++) s += `<line x1="48" y1="${20 + i * 32}" x2="340" y2="${20 + i * 32}"/>`;
    s += '</g><g fill="#64748b" font-size="10" text-anchor="end">';
    for (let i = 0; i <= 5; i++) s += `<text x="42" y="${24 + i * 32}">${Math.round(max - (i * max) / 5)}%</text>`;
    s += `</g><text x="12" y="100" fill="#94a3b8" font-size="9" transform="rotate(-90 12 100)" text-anchor="middle">${ylabel}</text>`;
    if (!pts.length) { svg.innerHTML = s + '<text x="194" y="104" fill="#64748b" font-size="12" text-anchor="middle">Tidak ada data</text>'; return; }
    const X = (i) => (pts.length === 1 ? 194 : 74 + i * (240 / (pts.length - 1)));
    const line = pts.map((p, i) => (p.v == null ? null : X(i) + ',' + Y(p.v))).filter(Boolean);
    if (line.length > 1) s += `<polyline points="${line.join(' ')}" fill="none" stroke="${color}" stroke-width="2"/>`;
    pts.forEach((p, i) => {
      const x = X(i);
      if (p.v != null) s += `<circle cx="${x}" cy="${Y(p.v)}" r="5" fill="${color}"/><text x="${x}" y="${Y(p.v) - 9}" fill="${light}" font-size="11" font-weight="700" text-anchor="middle">${fmtPct(p.v, pts.length > 6 ? 1 : 2)}</text>`;
      s += `<text x="${x}" y="194" fill="#94a3b8" font-size="${pts.length > 6 ? 9 : 11}" text-anchor="middle">${p.label}</text>`;
    });
    svg.innerHTML = s;
  };

  const barSvg = (id, items, c1, t1, c2, t2, caption) => {
    const svg = $(id);
    if (!svg) return;
    let s = '<g stroke="#334155" stroke-width="1">';
    for (let i = 0; i <= 5; i++) s += `<line x1="56" y1="${20 + i * 32}" x2="400" y2="${20 + i * 32}"/>`;
    s += '</g><g fill="#64748b" font-size="10" text-anchor="end">';
    for (let i = 0; i <= 5; i++) s += `<text x="50" y="${24 + i * 32}">${100 - i * 20}%</text>`;
    s += '</g>';
    items.forEach((m, i) => {
      const x = 78 + i * 110;
      [[m.ope, c1, t1, x], [m.o365, c2, t2, x + 32]].forEach(([v, c, t, bx]) => {
        if (v == null) { s += `<text x="${bx + 14}" y="176" fill="#64748b" font-size="9" text-anchor="middle">—</text>`; return; }
        const h = Math.min(Math.max(v, 0), 100) * 1.6, y = 180 - h;
        s += `<rect x="${bx}" y="${y}" width="28" height="${h}" rx="3" fill="${c}"/><text x="${bx + 14}" y="${y - 5}" fill="${t}" font-size="9" font-weight="700" text-anchor="middle">${fmtPct(v, 2)}</text>`;
      });
      s += `<text x="${x + 30}" y="198" fill="#94a3b8" font-size="8" text-anchor="middle">${m.name}</text><text x="${x + 30}" y="210" fill="#64748b" font-size="7" text-anchor="middle">${m.sub}</text>`;
    });
    svg.innerHTML = s + `<text x="228" y="232" fill="#64748b" font-size="9" text-anchor="middle">${caption}</text>`;
  };

  const monthSpan = (k, from, to) => {
    const a = k + '-01', b = new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7), 0)).toISOString().slice(0, 10);
    return Math.max(1, dayDiff(a > from ? a : from, b < to ? b : to));
  };

  const renderOee = (rows, from, to) => {
    const all = calcSet(rows, dayDiff(from, to));
    setOeeGauges(all);
    renderSpeed(rows);
    const byMonth = {};
    rows.forEach((r) => { const k = String(r.date).slice(0, 7); (byMonth[k] = byMonth[k] || []).push(r); });
    const series = Object.keys(byMonth).sort().map((k) => {
      const c = calcSet(byMonth[k], monthSpan(k, from, to));
      return { label: monthLabel(k), ope: c.ope.oee, o365: c.o365.oee };
    });
    trendSvg('chartOeeOpe', series.map((s) => ({ label: s.label, v: s.ope })), '#3b82f6', '#93c5fd', 'Capaian OEE OPE', 100);
    trendSvg('chartOee365', series.map((s) => ({ label: s.label, v: s.o365 })), '#22c55e', '#86efac', 'Capaian OEE 365', 0);
    const items = (st) => OEE_MACHINES[st].map((m) => { const p = all.per[st + '|' + m.line]; return { ...m, ope: p?.ope ?? null, o365: p?.o365 ?? null }; });
    barSvg('oeeBarFfs', items('filling'), '#22c55e', '#86efac', '#f59e0b', '#fcd34d', 'Automatic Form Fill Seal Machine');
    barSvg('oeeBarOw', items('kemas'), '#f43f5e', '#fda4af', '#22d3ee', '#a5f3fc', 'Overwrapping Machine');
  };

  const loadOee = async () => {
    const from = $('oeeFrom')?.value, to = $('oeeTo')?.value, st = $('oeeStatus');
    const say = (m, err) => { if (st) { st.textContent = m; st.className = 'oee-filter-status' + (err ? ' err' : ''); } };
    if (!from || !to) return say('Isi Dari Tanggal dan Sampai Tanggal.', true);
    if (from > to) return say('Tanggal awal tidak boleh melebihi tanggal akhir.', true);
    if (!navigator.onLine) return say('⚠ Tidak ada koneksi — data OEE diambil dari Supabase.', true);
    const my = ++oeeSeq;
    say('Memuat data…');
    try {
      const rows = await fetchOeeRows(from, to);
      if (my !== oeeSeq) return;
      renderOee(rows, from, to);
      say(`✓ ${rows.length} record · Filling & Kemas Line 1, 2, 4 · ${fmtD(from)} – ${fmtD(to)}`);
    } catch (e) {
      console.warn('OEE Production error:', e);
      say('⚠ Gagal memuat data: ' + (e.message || e), true);
    }
  };

  const initOeeFilter = () => {
    const f = $('oeeFrom'), t = $('oeeTo');
    if (!f || !t || (f.value && t.value)) return;
    const today = Utils.todayLocal();
    f.value = today.slice(0, 8) + '01';
    t.value = today;
  };
  const syncMchRange = () => copyRange('oee', 'mch');

  const bindOee = () => {
    $('oeeApply')?.addEventListener('click', loadOee);
    const sb = $('oeeSpeedBody');
    sb?.addEventListener('click', (e) => openSpeedRow(e.target.closest('tr.speed-row')));
    sb?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const tr = e.target.closest('tr.speed-row');
      if (tr) { e.preventDefault(); openSpeedRow(tr); }
    });
    $('oeeFrom')?.addEventListener('change', () => { syncMchRange(); loadOee(); });
    $('oeeTo')?.addEventListener('change', () => { syncMchRange(); loadOee(); });
    $('mchApply')?.addEventListener('click', () => { copyRange('mch', 'oee'); loadMachine(); });
    $('mchFrom')?.addEventListener('change', () => { copyRange('mch', 'oee'); loadMachine(); });
    $('mchTo')?.addEventListener('change', () => { copyRange('mch', 'oee'); loadMachine(); });
    $('mchReset')?.addEventListener('click', () => { $('oeeFrom').value = ''; $('oeeTo').value = ''; initOeeFilter(); syncMchRange(); loadMachine(); });
    const mb = $('mchSpeedBody');
    mb?.addEventListener('click', (e) => openSpeedRow(e.target.closest('tr.speed-row')));
    mb?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const tr = e.target.closest('tr.speed-row');
      if (tr) { e.preventDefault(); openSpeedRow(tr); }
    });
    $('oeeReset')?.addEventListener('click', () => { $('oeeFrom').value = ''; $('oeeTo').value = ''; initOeeFilter(); loadOee(); });
  };

  // ===== HALAMAN DETAIL MESIN (Filling / Kemas · Line 1, 2, 4) =====
  const MACHINE_PAGES = {
    'filling-1': { stage: 'filling', line: '1' }, 'filling-2': { stage: 'filling', line: '2' }, 'filling-4': { stage: 'filling', line: '4' },
    'kemas-1': { stage: 'kemas', line: '1' }, 'kemas-2': { stage: 'kemas', line: '2' }, 'kemas-4': { stage: 'kemas', line: '4' }
  };
  const STAGE_LABEL = { filling: 'Filling', kemas: 'Kemas' };
  const STAGE_TYPE = { filling: 'Automatic Form Fill Seal Machine', kemas: 'Overwrapping Machine' };
  const C_OPE = '#a3c93a', C_365 = '#22b8cf';
  let curMachine = null, mchSeq = 0;

  // Kode produk = kata pertama nama produk ("VTTS1 L030207" → "VTTS1").
  const prodCode = (n) => String(n || '').trim().split(/\s+/)[0].toUpperCase();

  // Baris produksi (kode kegiatan = produksi) beserta kode produk, nomor WO/batch, dan durasinya.
  // WO diambil dari kolom WO baris; bila kosong → WO produk di header record; bila kosong → kata ke-2 nama produk.
  const prodRows = (r) => {
    const rows = Array.isArray(r.payload?.rows) ? r.payload.rows : [];
    const pr = r.payload?.products || {};
    const list = [1, 2, 3].map((i) => ({ name: String(pr['p' + i + 'Name'] || '').trim(), wo: String(pr['p' + i + 'Wo'] || '').trim() }));
    const out = [];
    rows.forEach((x) => {
      if (Utils.catOf(x.kode) !== 'prod') return;
      const s = Utils.parseTime(x.mulai), e = Utils.parseTime(x.selesai);
      const d = s != null && e != null ? (e - s + 1440) % 1440 : (toNum(x.durasi) || 0);
      if (!(d > 0)) return;
      const name = String(x.batch || '').trim();
      const toks = name.split(/\s+/);
      const wo = String(x.wo || '').trim() || list.find((l) => l.name && l.name === name)?.wo || (toks.length > 1 ? toks[1] : '');
      out.push({ code: prodCode(name), wo: wo.toUpperCase(), d });
    });
    return out;
  };

  // Per batch (WO): OPE & 365 dari record-record yang memuat WO itu.
  //  OPE  = rata-rata OEE tersimpan, dibobot menit produksi WO di tiap record.
  //  365  = A365 × P × Q; A365 = waktu operasional yang dialokasikan ke WO ÷ (1440 mnt × jumlah hari WO berjalan).
  const calcBatches = (rows) => {
    const by = {};
    rows.forEach((r) => {
      const m = recMetrics(r), pr = prodRows(r);
      const tAll = pr.reduce((s, x) => s + x.d, 0);
      if (!tAll) return;
      const mine = {};
      pr.filter((x) => x.wo).forEach((x) => {
        const b = (mine[x.wo] = mine[x.wo] || { t: 0, code: x.code });
        b.t += x.d; if (!b.code) b.code = x.code;
      });
      Object.keys(mine).forEach((wo) => {
        const t = mine[wo].t;
        const b = (by[wo] = by[wo] || { wo, code: mine[wo].code, so: 0, wso: 0, sp: 0, wsp: 0, sq: 0, wsq: 0, en: 0, dates: new Set(), first: String(r.date) });
        if (m.o != null) { b.so += m.o * t; b.wso += t; }
        if (m.p != null) { b.sp += m.p * t; b.wsp += t; }
        if (m.q != null) { b.sq += m.q * t; b.wsq += t; }
        b.en += (m.en * t) / tAll;
        b.dates.add(String(r.date));
        if (String(r.date) < b.first) b.first = String(r.date);
      });
    });
    return Object.values(by).map((b) => {
      const p = b.wsp ? b.sp / b.wsp : null, q = b.wsq ? b.sq / b.wsq : null;
      const a365 = Math.min(100, (b.en / (DAY_MIN * Math.max(1, b.dates.size))) * 100);
      return { wo: b.wo, code: b.code, ope: b.wso ? b.so / b.wso : null, o365: p != null && q != null ? (a365 * p * q) / 10000 : null, first: b.first };
    }).sort((x, y) => (x.first < y.first ? -1 : x.first > y.first ? 1 : x.wo < y.wo ? -1 : 1));
  };

  const rangeLabel = (from, to) => (from.slice(0, 7) === to.slice(0, 7) ? MON[Number(from.slice(5, 7)) - 1] + ' ' + from.slice(0, 4) : fmtD(from) + ' – ' + fmtD(to));

  // Grafik garis kecil: jumlah batch per kode produk.
  const countSvg = (id, items) => {
    const svg = $(id);
    if (!svg) return;
    const L = 34, R = 14, T = 16, B = 26, W = 260, H = 130, ph = H - T - B;
    const max = Math.max(1, ...items.map((i) => i.v));
    const top = max <= 4 ? max : Math.ceil(max / 4) * 4;
    const Y = (v) => T + ph - (v / top) * ph;
    let s = '<g stroke="#334155" stroke-width="1">';
    [0, 0.5, 1].forEach((f) => { const y = Y(top * f); s += `<line x1="${L}" y1="${y}" x2="${W - R}" y2="${y}"/>`; });
    s += '</g><g fill="#64748b" font-size="9" text-anchor="end">';
    [0, 0.5, 1].forEach((f) => { s += `<text x="${L - 5}" y="${Y(top * f) + 3}">${Math.round(top * f)}</text>`; });
    s += `</g><text x="9" y="${T + ph / 2}" fill="#94a3b8" font-size="9" transform="rotate(-90 9 ${T + ph / 2})" text-anchor="middle">No.Batch</text>`;
    if (!items.length) { svg.innerHTML = s + `<text x="${W / 2}" y="${H / 2}" fill="#64748b" font-size="11" text-anchor="middle">Tidak ada data batch</text>`; return; }
    const X = (i) => (items.length === 1 ? (L + W - R) / 2 : L + 14 + (i * (W - R - L - 28)) / (items.length - 1));
    const pts = items.map((it, i) => X(i) + ',' + Y(it.v));
    if (items.length > 1) s += `<polyline points="${pts.join(' ')}" fill="none" stroke="#3b82f6" stroke-width="2"/>`;
    items.forEach((it, i) => {
      s += `<circle cx="${X(i)}" cy="${Y(it.v)}" r="3.5" fill="#3b82f6"/><text x="${X(i)}" y="${Y(it.v) - 7}" fill="#e2e8f0" font-size="10" font-weight="700" text-anchor="middle">${it.v}</text>`;
      s += `<text x="${X(i)}" y="${H - 8}" fill="#94a3b8" font-size="${items.length > 5 ? 8 : 9}" text-anchor="middle">${Utils.escapeHtml(it.label)}</text>`;
    });
    svg.innerHTML = s;
  };

  // Batang berkelompok per batch: OEE (OPE) & OEE_365. Lebar menyesuaikan jumlah batch (scroll horizontal bila banyak).
  const batchBarSvg = (id, list) => {
    const svg = $(id);
    if (!svg) return;
    const slot = 46, L = 44, R = 10, T = 20, B = 58, H = 250, ph = H - T - B;
    const W = Math.max(560, L + R + list.length * slot);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.removeAttribute('height');
    svg.style.width = L + R + list.length * slot > 560 ? W + 'px' : '100%';
    const top = Math.max(0, ...list.flatMap((b) => [b.ope, b.o365].map((v) => (Number.isFinite(v) ? v : 0))));
    const max = Math.max(150, Math.ceil(top / 50) * 50);
    const Y = (v) => T + ph - (Math.min(Math.max(v, 0), max) / max) * ph;
    let s = '<g stroke="#334155" stroke-width="1">';
    for (let v = 0; v <= max; v += 50) s += `<line x1="${L}" y1="${Y(v)}" x2="${W - R}" y2="${Y(v)}"/>`;
    s += '</g><g fill="#64748b" font-size="10" text-anchor="end">';
    for (let v = 0; v <= max; v += 50) s += `<text x="${L - 6}" y="${Y(v) + 3}">${v}%</text>`;
    s += '</g>';
    if (!list.length) { svg.innerHTML = s + `<text x="${W / 2}" y="${T + ph / 2}" fill="#64748b" font-size="12" text-anchor="middle">Tidak ada data batch (kolom WO produksi kosong) pada rentang ini</text>`; return; }
    list.forEach((b, i) => {
      const cx = L + i * slot + slot / 2;
      [[b.ope, C_OPE, cx - 17], [b.o365, C_365, cx + 1]].forEach(([v, c, x]) => {
        if (!Number.isFinite(v)) return;
        const y = Y(v);
        s += `<rect x="${x}" y="${y}" width="16" height="${T + ph - y}" rx="2" fill="${c}"/>`
          + `<text x="${x + 8}" y="${y - 4}" fill="#e2e8f0" font-size="8" font-weight="600" transform="rotate(-90 ${x + 8} ${y - 4})">${fmtPct(v, 1)}</text>`;
      });
      s += `<text x="${cx}" y="${T + ph + 13}" fill="#94a3b8" font-size="9" text-anchor="end" transform="rotate(-40 ${cx} ${T + ph + 13})">${Utils.escapeHtml(b.wo)}</text>`;
    });
    svg.innerHTML = s;
  };

  const renderMachineSpeed = (rows, counts) => {
    const body = $('mchSpeedBody');
    if (!body) return;
    const latest = speedLatest(rows, prodCode);
    const codes = Object.keys(latest).sort((a, b) => (counts[b] || 0) - (counts[a] || 0) || (a < b ? -1 : 1));
    body.innerHTML = codes.length
      ? codes.map((c, i) => {
          const s = latest[c], t = speedRowAttrs(c, s);
          return `<tr ${t.attrs}><td class="speed-no">${i + 1}.</td><td>${Utils.escapeHtml(c)}<small class="speed-src">${t.src}</small></td>`
            + `<td>${s.rate.toLocaleString('id-ID')}<span class="speed-go" aria-hidden="true">↗</span></td></tr>`;
        }).join('')
      : '<tr><td colspan="3">Tidak ada data pada rentang ini</td></tr>';
  };

  const renderMachine = (rows, from, to, meta) => {
    setOeeGauges(calcSet(rows, dayDiff(from, to)), 'mch');
    const batches = calcBatches(rows);
    const counts = {};
    batches.forEach((b) => { if (b.code) counts[b.code] = (counts[b.code] || 0) + 1; });
    renderMachineSpeed(rows, counts);
    countSvg('mchBatchSvg', Object.keys(counts).sort((a, b) => counts[b] - counts[a] || (a < b ? -1 : 1)).map((c) => ({ label: c, v: counts[c] })));
    const t = $('mchBarTitle');
    if (t) t.textContent = `Capaian OEE OPE & OEE 365 ${STAGE_LABEL[meta.stage]} Line ${meta.line} · ${rangeLabel(from, to)}`;
    batchBarSvg('mchBarSvg', batches);
  };

  const loadMachine = async () => {
    const meta = MACHINE_PAGES[curMachine];
    if (!meta) return;
    const from = $('mchFrom')?.value, to = $('mchTo')?.value, st = $('mchStatus');
    const say = (m, err) => { if (st) { st.textContent = m; st.className = 'oee-filter-status' + (err ? ' err' : ''); } };
    if (!from || !to) return say('Isi Dari Tanggal dan Sampai Tanggal.', true);
    if (from > to) return say('Tanggal awal tidak boleh melebihi tanggal akhir.', true);
    if (!navigator.onLine) return say('⚠ Tidak ada koneksi — data OEE diambil dari Supabase.', true);
    const my = ++mchSeq;
    say('Memuat data…');
    try {
      const rows = await fetchOeeRows(from, to, meta.stage, meta.line);
      if (my !== mchSeq) return;
      renderMachine(rows, from, to, meta);
      say(`✓ ${rows.length} record · ${STAGE_LABEL[meta.stage]} Line ${meta.line} · ${fmtD(from)} – ${fmtD(to)}`);
    } catch (e) {
      console.warn('Detail mesin error:', e);
      say('⚠ Gagal memuat data: ' + (e.message || e), true);
    }
  };

  // Filter tanggal dipakai bersama halaman OEE Production & semua halaman mesin.
  const copyRange = (fromPre, toPre) => {
    const f = $(fromPre + 'From'), t = $(toPre + 'From'), f2_ = $(fromPre + 'To'), t2 = $(toPre + 'To');
    if (f && t) t.value = f.value;
    if (f2_ && t2) t2.value = f2_.value;
  };

  const showPage = (pageId) => {
    document.querySelectorAll('.weekly-nav-item').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.weeklyPage === pageId);
    });

    document.querySelectorAll('.weekly-page').forEach(p => p.classList.remove('is-active'));

    if (pageId === 'yield') {
      document.getElementById('weeklyPageYield')?.classList.add('is-active');
      // re-animate
      setTimeout(() => setYieldGauge(100.4), 50);
    } else if (pageId === 'oee-prod') {
      document.getElementById('weeklyPageOee')?.classList.add('is-active');
      initOeeFilter(); syncMchRange(); loadOee();
    } else if (MACHINE_TITLES[pageId]) {
      const page = document.getElementById('weeklyPageMachine');
      if (page) {
        page.classList.add('is-active');
        const title = document.getElementById('weeklyMachineTitle');
        const badge = document.getElementById('weeklyMachineBadge');
        if (title) title.textContent = MACHINE_TITLES[pageId];
        const mt = MACHINE_PAGES[pageId], mm = OEE_MACHINES[mt.stage].find((x) => x.line === mt.line);
        if (badge) badge.textContent = `Mesin ${STAGE_TYPE[mt.stage]} ${mm.name} ${mm.sub}`;
        curMachine = pageId;
        initOeeFilter(); syncMchRange(); loadMachine();
      }
    }
  };

  const bind = () => {
    bindOee();
    document.querySelectorAll('.weekly-nav-item').forEach(btn => {
      btn.addEventListener('click', () => showPage(btn.dataset.weeklyPage));
    });

    document.getElementById('weeklyBackToOee')?.addEventListener('click', () => {
      if (typeof UI !== 'undefined' && UI.showScreen) UI.showScreen('dashboard');
    });

    document.getElementById('weeklyOpenExternal')?.addEventListener('click', () => {
      window.open(EXTERNAL_URL, '_blank', 'noopener,noreferrer');
    });
  };

  const open = () => {
    if (!inited) {
      bind();
      setYieldGauge(100.4);
      const last = document.getElementById('weeklyLastUpdate');
      if (last) {
        last.textContent = new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
      }
      inited = true;
    }
    showPage('yield');
  };

  return { open, showPage };
})();
