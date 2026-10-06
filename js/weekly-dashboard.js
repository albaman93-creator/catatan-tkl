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

  const fetchOeeRows = async (from, to) => {
    const client = typeof SupabaseClient !== 'undefined' ? SupabaseClient.getClient() : null;
    if (!client) throw new Error('Supabase belum terhubung');
    const out = [];
    for (let i = 0; i < 30; i++) {
      const { data, error } = await client.from(CONFIG.DB_TABLE)
        .select('date,shift,line,tahapan,availability,performance,quality,oee,payload')
        .in('tahapan', OEE_STAGES).in('line', OEE_LINES)
        .gte('date', from).lte('date', to)
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

  const setOeeGauges = (all) => {
    setHalfGauge('oeeOpeFill', all.ope.oee ?? 0, OEE_GAUGE_LEN);
    setHalfGauge('oee365Fill', all.o365.oee ?? 0, OEE_GAUGE_LEN);
    $('oeeOpeValue').textContent = f2(all.ope.oee);
    $('oee365Value').textContent = f2(all.o365.oee);
    setApq('oeeOpeA', all.ope.a, TGT_OPE.a); setApq('oeeOpeP', all.ope.p, TGT_OPE.p); setApq('oeeOpeQ', all.ope.q, TGT_OPE.q);
    setApq('oee365A', all.o365.a, TGT_365.a); setApq('oee365P', all.o365.p, TGT_365.p); setApq('oee365Q', all.o365.q, TGT_365.q);
  };

  const renderSpeed = (rows) => {
    const body = $('oeeSpeedBody');
    if (!body) return;
    const latest = {};
    rows.forEach((r) => { // rows terurut tanggal terbaru → rate pertama yang ditemui = terbaru
      const p = r.payload?.products || {};
      [[p.p1Name, p.p1Rate], [p.p2Name, p.p2Rate], [p.p3Name, p.p3Rate]].forEach(([n, rt]) => {
        const name = String(n || '').trim(), rate = toNum(rt);
        if (name && rate > 0 && !(name in latest)) latest[name] = rate;
      });
    });
    const names = Object.keys(latest).sort().reverse();
    body.innerHTML = names.length
      ? names.map((n) => `<tr><td>${Utils.escapeHtml(n)}</td><td>${latest[n].toLocaleString('id-ID')}</td></tr>`).join('')
      : '<tr><td colspan="2">Tidak ada data pada rentang ini</td></tr>';
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

  const bindOee = () => {
    $('oeeApply')?.addEventListener('click', loadOee);
    $('oeeFrom')?.addEventListener('change', loadOee);
    $('oeeTo')?.addEventListener('change', loadOee);
    $('oeeReset')?.addEventListener('click', () => { $('oeeFrom').value = ''; $('oeeTo').value = ''; initOeeFilter(); loadOee(); });
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
      initOeeFilter(); loadOee();
    } else if (MACHINE_TITLES[pageId]) {
      const page = document.getElementById('weeklyPageMachine');
      if (page) {
        page.classList.add('is-active');
        const title = document.getElementById('weeklyMachineTitle');
        const badge = document.getElementById('weeklyMachineBadge');
        if (title) title.textContent = MACHINE_TITLES[pageId];
        if (badge) badge.textContent = 'Detail performa ' + MACHINE_TITLES[pageId];
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
