/**
 * SHUTDOWN.JS
 * Panel Planned & Unplanned Shutdown (donat + tabel aktivitas + pagination)
 * gaya Looker Studio untuk halaman detail mesin di Weekly Meeting.
 * Planned = kode 5,6,7,8 · Unplanned = kode 1,3,4,9.
 * Dikelompokkan per kolom `kegiatan` (fallback `masalah`), diurutkan terbesar.
 */
const Shutdown = (() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PAGE_SIZE = 8;
  const PLAN_COLORS = ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe', '#e8f1fe', '#94a3b8', '#cbd5e1', '#e2e8f0'];
  const UNP_COLORS = ['#15803d', '#16a34a', '#22c55e', '#4ade80', '#86efac', '#bbf7d0', '#dcfce7', '#a7f3d0', '#d1fae5', '#f0fdf4'];
  const state = {
    plan: { page: 0, list: [], total: 0 },
    unp: { page: 0, list: [], total: 0 }
  };
  const toNum = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (v == null || v === '') return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };
  const durOf = (x) => {
    const s = Utils.parseTime(x.mulai), e = Utils.parseTime(x.selesai);
    return s != null && e != null ? (e - s + 1440) % 1440 : (toNum(x.durasi) || 0);
  };
  const fmtPct = (v, d) => v.toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%';
  const textOn = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
    return lum > 150 ? '#0f172a' : '#f8fafc';
  };

  // ===== Agregasi menit per teks kegiatan =====
  const aggregate = (records, codes) => {
    const map = {};
    let total = 0;
    records.forEach((r) => {
      const rows = Array.isArray(r.payload?.rows) ? r.payload.rows : [];
      rows.forEach((x) => {
        const k = parseInt(String(x.kode ?? '').trim(), 10);
        if (!codes.has(k)) return;
        const d = durOf(x);
        if (!(d > 0)) return;
        const label = String(x.kegiatan || '').trim() || String(x.masalah || '').trim() || ('Kode ' + k);
        map[label] = (map[label] || 0) + d;
        total += d;
      });
    });
    return { list: Object.entries(map).map(([label, v]) => ({ label, v })).sort((a, b) => b.v - a.v), total };
  };

  const topData = (list) => {
    const top = list.slice(0, 9);
    const rest = list.slice(9).reduce((s, x) => s + x.v, 0);
    return rest > 0 ? [...top, { label: 'Lainnya', v: rest }] : top;
  };

  // ===== Donat SVG dengan label % di slice =====
  const donut = (id, list, total, colors) => {
    const svg = $(id);
    if (!svg) return;
    if (!total) { svg.innerHTML = '<text x="100" y="100" fill="#64748b" font-size="11" text-anchor="middle">Tidak ada data</text>'; return; }
    const data = topData(list);
    const cx = 100, cy = 100, R = 92, r = 50;
    let a0 = -Math.PI / 2, s = '';
    data.forEach((d, i) => {
      const frac = d.v / total;
      const a1 = a0 + frac * 2 * Math.PI;
      const large = frac > 0.5 ? 1 : 0;
      const P = (a, rad) => (cx + Math.cos(a) * rad).toFixed(2) + ',' + (cy + Math.sin(a) * rad).toFixed(2);
      const col = colors[i % colors.length];
      s += `<path d="M ${P(a0, R)} A ${R} ${R} 0 ${large} 1 ${P(a1, R)} L ${P(a1, r)} A ${r} ${r} 0 ${large} 0 ${P(a0, r)} Z" fill="${col}" stroke="#0b1626" stroke-width="1"></path>`;
      if (frac >= 0.035) {
        const am = (a0 + a1) / 2, rm = (R + r) / 2;
        s += `<text x="${(cx + Math.cos(am) * rm).toFixed(1)}" y="${(cy + Math.sin(am) * rm).toFixed(1)}" fill="${textOn(col)}" font-size="8.5" font-weight="700" text-anchor="middle" dominant-baseline="middle">${fmtPct(frac * 100, 1)}</text>`;
      }
      a0 = a1;
    });
    svg.innerHTML = s;
  };

  const legend = (id, list, colors) => {
    const el = $(id);
    if (!el) return;
    el.innerHTML = topData(list).map((d, i) =>
      `<div class="sd-leg-item"><span class="sd-leg-dot" style="background:${colors[i % colors.length]}"></span>` +
      `<span class="sd-leg-label" title="${Utils.escapeHtml(d.label)}">${Utils.escapeHtml(d.label)}</span></div>`
    ).join('');
  };

  // ===== Tabel + pagination (8 baris/halaman) =====
  const renderTable = (kind) => {
    const st = state[kind];
    const pre = kind === 'plan' ? 'sdPlan' : 'sdUnp';
    const body = $(pre + 'Body'), info = $(pre + 'PageInfo');
    if (!body) return;
    const pages = Math.max(1, Math.ceil(st.list.length / PAGE_SIZE));
    st.page = Math.max(0, Math.min(st.page, pages - 1));
    const start = st.page * PAGE_SIZE;
    const slice = st.list.slice(start, start + PAGE_SIZE);
    body.innerHTML = slice.length
      ? slice.map((d, i) =>
          `<tr><td class="ctr">${start + i + 1}.</td><td>${Utils.escapeHtml(d.label)}</td>` +
          `<td class="ctr">${d.v.toLocaleString('id-ID')}</td>` +
          `<td class="ctr">${fmtPct(st.total ? (d.v / st.total) * 100 : 0, 2)}</td></tr>`).join('')
      : '<tr><td colspan="4">Tidak ada data pada rentang ini</td></tr>';
    if (info) info.textContent = st.list.length
      ? `${start + 1} - ${Math.min(start + PAGE_SIZE, st.list.length)} / ${st.list.length}`
      : '0 / 0';
  };

  const bindPager = (kind) => {
    const pre = kind === 'plan' ? 'sdPlan' : 'sdUnp';
    $(pre + 'Prev')?.addEventListener('click', () => { if (state[kind].page > 0) { state[kind].page--; renderTable(kind); } });
    $(pre + 'Next')?.addEventListener('click', () => {
      const pages = Math.ceil(state[kind].list.length / PAGE_SIZE);
      if (state[kind].page < pages - 1) { state[kind].page++; renderTable(kind); }
    });
  };

  // ===== Dipanggil weekly-dashboard setiap halaman mesin dirender =====
  const render = (records, meta) => {
    const stg = String(meta.stage).charAt(0).toUpperCase() + String(meta.stage).slice(1);
    const set = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };
    set('sdPlanDonutTitle', `Planned Shutdown ${stg} - Line ${meta.line}`);
    set('sdPlanTableTitle', `Planned Shutdown Activity - Line ${meta.line}`);
    set('sdUnpDonutTitle', `Unplanned Shutdown ${stg} - Line ${meta.line}`);
    set('sdUnpTableTitle', `Unplanned Shutdown Activity - Line ${meta.line}`);
    const plan = aggregate(records, CONFIG.PLANNED_CODES);
    const unp = aggregate(records, CONFIG.UNPLANNED_CODES);
    state.plan = { page: 0, list: plan.list, total: plan.total };
    state.unp = { page: 0, list: unp.list, total: unp.total };
    donut('sdPlanDonut', plan.list, plan.total, PLAN_COLORS);
    legend('sdPlanLegend', plan.list, PLAN_COLORS);
    donut('sdUnpDonut', unp.list, unp.total, UNP_COLORS);
    legend('sdUnpLegend', unp.list, UNP_COLORS);
    renderTable('plan');
    renderTable('unp');
  };

  // Bind pager after DOM ready
  const bind = () => {
    bindPager('plan');
    bindPager('unp');
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  return { render };
})();
