/**
 * SHUTDOWN.JS
 * Panel Planned & Unplanned Shutdown (donat + tabel aktivitas + pagination)
 * gaya Looker Studio untuk halaman detail mesin di Weekly Meeting.
 * Planned = kode 5,6,7,8 · Unplanned = kode 1,3,4,9.
 *
 * Pengelompokan kegiatan:
 *  - Kunci dibuat dari teks yang sudah dirapikan (huruf kecil, spasi tunggal),
 *    sehingga "Ganti baju", "GANTI BAJU", dan "Ganti  Baju" dihitung sebagai satu.
 *  - Nama tampil: bentuk baku dari CONFIG.KEGIATAN_ALIASES bila ada,
 *    kalau tidak, ejaan yang paling sering muncul di data.
 *  - Setiap kegiatan membawa jumlah kejadian (n) dan total menit (v).
 *  - Rata-rata = total menit / jumlah kejadian (per kejadian, BUKAN per hari
 *    kalender). Contoh: 3 kejadian @ 20, 30, 10 mnt → rata-rata 20 mnt.
 */
const Shutdown = (() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PAGE_SIZE = 8;

  /* Palet biru (planned) & hijau (unplanned) — tetap terbaca di tema terang
     maupun gelap, dan dibedakan oleh label + posisi (bukan hanya warna). */
  const PLAN_COLORS = ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe', '#e8f1fe', '#94a3b8', '#cbd5e1', '#e2e8f0'];
  const UNP_COLORS  = ['#15803d', '#16a34a', '#22c55e', '#4ade80', '#86efac', '#bbf7d0', '#dcfce7', '#a7f3d0', '#d1fae5', '#f0fdf4'];

  const state = {
    plan: { page: 0, list: [], total: 0 },
    unp:  { page: 0, list: [], total: 0 }
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

  const fmtPct = (v, d) =>
    v.toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%';

  /** Pilih warna teks di atas slice donat berdasarkan kecerahan fill. */
  const textOn = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
    return lum > 150 ? '#0f172a' : '#f8fafc';
  };

  // ===== Normalisasi nama kegiatan =====
  // Kunci pengelompokan: huruf kecil, spasi tunggal, tanpa spasi di ujung.
  const normKey = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

  const aliasOf = (key) => {
    const al = (typeof CONFIG !== 'undefined' && CONFIG.KEGIATAN_ALIASES) || {};
    return al[key] || null;
  };

  // Nama tampil untuk satu kunci: alias baku, atau ejaan terbanyak dengan huruf depan kapital.
  const displayName = (key, variants) => {
    const al = aliasOf(key);
    if (al) return al;
    const best = Object.entries(variants).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return (/^\p{Lu}/u.test(b[0]) ? 1 : 0) - (/^\p{Lu}/u.test(a[0]) ? 1 : 0);
    })[0][0];
    return best.charAt(0).toUpperCase() + best.slice(1);
  };

  const fmtN = (n) => Number(n).toLocaleString('id-ID');

  /**
   * Rata-rata menit per kejadian = totalMenit / jumlahKejadian.
   * Dihitung per kejadian (bukan per hari kalender), sehingga 2 kejadian
   * di hari berbeda masing-masing 30 mnt → rata-rata 30, bukan 15.
   */
  const fmtAvg = (v, n) => (n ? Math.round(v / n) : 0);

  // ===== Agregasi menit per kegiatan (sudah dinormalisasi) =====
  // Baris dengan durasi ≤ 0 atau kode di luar daftar diabaikan.
  const aggregate = (records, codes) => {
    const map = {};
    let total = 0;
    records.forEach((r) => {
      const rows = Array.isArray(r.payload?.rows) ? r.payload.rows : [];
      rows.forEach((x) => {
        const k = parseInt(String(x.kode ?? '').trim(), 10);
        if (!codes.has(k)) return;
        const d = durOf(x);
        if (!(d > 0)) return; // durasi nol / invalid tidak ikut dihitung
        const raw = String(x.kegiatan || '').trim().replace(/\s+/g, ' ')
          || String(x.masalah || '').trim().replace(/\s+/g, ' ')
          || ('Kode ' + k);
        // Kelompokkan berdasarkan bentuk baku bila ada alias, supaya varian alias ikut tergabung.
        const al = aliasOf(normKey(raw));
        const key = normKey(al || raw);
        const g = map[key] || (map[key] = { variants: {}, alias: al, v: 0, n: 0 });
        g.variants[raw] = (g.variants[raw] || 0) + 1;
        g.v += d;
        g.n += 1;
        total += d;
      });
    });
    const list = Object.entries(map)
      .map(([key, g]) => ({
        label: g.alias || displayName(key, g.variants),
        v: g.v,
        n: g.n,
        avg: fmtAvg(g.v, g.n)
      }))
      .sort((a, b) => b.v - a.v);
    return { list, total };
  };

  const topData = (list) => {
    const top = list.slice(0, 9);
    const rest = list.slice(9).reduce((s, x) => s + x.v, 0);
    const restN = list.slice(9).reduce((s, x) => s + x.n, 0);
    return rest > 0
      ? [...top, { label: 'Lainnya', v: rest, n: restN, avg: fmtAvg(rest, restN) }]
      : top;
  };

  // ===== Donat SVG dengan label % di slice =====
  const donut = (id, list, total, colors) => {
    const svg = $(id);
    if (!svg) return;
    if (!total) {
      svg.innerHTML = '<text x="100" y="100" fill="var(--text-muted, #64748b)" font-size="11" text-anchor="middle">Tidak ada data</text>';
      return;
    }
    const data = topData(list);
    const cx = 100, cy = 100, R = 92, r = 50;
    let a0 = -Math.PI / 2, s = '';
    data.forEach((d, i) => {
      const frac = d.v / total;
      const a1 = a0 + frac * 2 * Math.PI;
      const large = frac > 0.5 ? 1 : 0;
      const P = (a, rad) => (cx + Math.cos(a) * rad).toFixed(2) + ',' + (cy + Math.sin(a) * rad).toFixed(2);
      const col = colors[i % colors.length];
      s += `<path d="M ${P(a0, R)} A ${R} ${R} 0 ${large} 1 ${P(a1, R)} L ${P(a1, r)} A ${r} ${r} 0 ${large} 0 ${P(a0, r)} Z" fill="${col}" stroke="var(--bg-surface, #0b1626)" stroke-width="1"></path>`;
      if (frac >= 0.035) {
        const am = (a0 + a1) / 2, rm = (R + r) / 2;
        s += `<text x="${(cx + Math.cos(am) * rm).toFixed(1)}" y="${(cy + Math.sin(am) * rm).toFixed(1)}" fill="${textOn(col)}" font-size="8.5" font-weight="700" text-anchor="middle" dominant-baseline="middle">${fmtPct(frac * 100, 1)}</text>`;
      }
      a0 = a1;
    });
    svg.innerHTML = s;
  };

  const legend = (id, list, total, colors) => {
    const el = $(id);
    if (!el) return;
    el.innerHTML = topData(list).map((d, i) => {
      const tip = `${fmtN(d.n)} kejadian · ${fmtN(d.v)} mnt · rata-rata ${fmtN(d.avg)} mnt/kejadian · ${fmtPct(total ? (d.v / total) * 100 : 0, 1)}`;
      return `<div class="sd-leg-item" title="${Utils.escapeHtml(tip)}">` +
        `<span class="sd-leg-dot" style="background:${colors[i % colors.length]}"></span>` +
        `<span class="sd-leg-label">${Utils.escapeHtml(d.label)}</span>` +
        `<span class="sd-leg-meta">${fmtN(d.v)} mnt · ${fmtPct(total ? (d.v / total) * 100 : 0, 1)}</span>` +
        `</div>`;
    }).join('');
  };

  // ===== Tabel + pagination (8 baris/halaman) =====
  // Kolom: No | Aktivitas | Menit | Frekuensi | Rata-rata | Persentase
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
      ? slice.map((d, i) => {
          const tip = `${fmtN(d.n)} kejadian · total ${fmtN(d.v)} mnt · rata-rata ${fmtN(d.avg)} mnt per kejadian`;
          return `<tr title="${Utils.escapeHtml(tip)}">` +
            `<td class="ctr">${start + i + 1}.</td>` +
            `<td>${Utils.escapeHtml(d.label)}</td>` +
            `<td class="ctr tabular-nums">${fmtN(d.v)}</td>` +
            `<td class="ctr tabular-nums">${fmtN(d.n)}</td>` +
            `<td class="ctr tabular-nums">${fmtN(d.avg)}</td>` +
            `<td class="ctr tabular-nums">${fmtPct(st.total ? (d.v / st.total) * 100 : 0, 2)}</td>` +
            `</tr>`;
        }).join('')
      : '<tr><td colspan="6">Tidak ada data pada rentang ini</td></tr>';
    if (info) info.textContent = st.list.length
      ? `${start + 1} – ${Math.min(start + PAGE_SIZE, st.list.length)} / ${st.list.length}`
      : '0 / 0';
  };

  const bindPager = (kind) => {
    const pre = kind === 'plan' ? 'sdPlan' : 'sdUnp';
    $(pre + 'Prev')?.addEventListener('click', () => {
      if (state[kind].page > 0) { state[kind].page--; renderTable(kind); }
    });
    $(pre + 'Next')?.addEventListener('click', () => {
      const pages = Math.ceil(state[kind].list.length / PAGE_SIZE);
      if (state[kind].page < pages - 1) { state[kind].page++; renderTable(kind); }
    });
  };

  /** Format tanggal ISO → "13 Okt 2026" */
  const fmtDateId = (iso) => {
    if (!iso) return '';
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const p = String(iso).split('-');
    if (p.length < 3) return iso;
    return `${Number(p[2])} ${MON[Number(p[1]) - 1]} ${p[0]}`;
  };

  /**
   * Bangun teks konteks: rentang tanggal, jumlah hari produksi, shift, line, tahapan, produk.
   * Ditampilkan di judul panel dan di area cetak.
   */
  const buildContext = (meta) => {
    const parts = [];
    if (meta.from && meta.to) {
      const range = meta.from === meta.to
        ? fmtDateId(meta.from)
        : `${fmtDateId(meta.from)} – ${fmtDateId(meta.to)}`;
      parts.push(range);
    }
    if (meta.shiftLabel) parts.push(meta.shiftLabel);
    if (meta.stage && meta.line) {
      const stg = String(meta.stage).charAt(0).toUpperCase() + String(meta.stage).slice(1);
      parts.push(`${stg} Line ${meta.line}`);
    }
    if (meta.product) parts.push(meta.product);
    return parts.join(' · ');
  };

  // ===== Dipanggil weekly-dashboard setiap halaman mesin dirender =====
  const render = (records, meta) => {
    meta = meta || {};
    const stg = String(meta.stage || '').charAt(0).toUpperCase() + String(meta.stage || '').slice(1);
    const ctx = buildContext(meta);
    const set = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };

    set('sdPlanDonutTitle', `Planned Shutdown ${stg} – Line ${meta.line || ''}`);
    set('sdPlanTableTitle', `Planned Shutdown Activity – Line ${meta.line || ''}`);
    set('sdUnpDonutTitle',  `Unplanned Shutdown ${stg} – Line ${meta.line || ''}`);
    set('sdUnpTableTitle',  `Unplanned Shutdown Activity – Line ${meta.line || ''}`);

    // Konteks tanggal/shift di bawah judul (elemen opsional)
    ['sdPlanCtx', 'sdUnpCtx', 'sdPlanTableCtx', 'sdUnpTableCtx'].forEach((id) => set(id, ctx));

    const planCodes = (typeof CONFIG !== 'undefined' && CONFIG.PLANNED_CODES) || new Set([5, 6, 7, 8]);
    const unpCodes  = (typeof CONFIG !== 'undefined' && CONFIG.UNPLANNED_CODES) || new Set([1, 3, 4, 9]);

    const plan = aggregate(records, planCodes);
    const unp  = aggregate(records, unpCodes);
    state.plan = { page: 0, list: plan.list, total: plan.total };
    state.unp  = { page: 0, list: unp.list,  total: unp.total };

    // Kartu ringkasan total
    const grand = plan.total + unp.total;
    set('sdPlanTotalMin', plan.total ? `${fmtN(plan.total)} mnt` : '—');
    set('sdPlanTotalPct', grand ? fmtPct((plan.total / grand) * 100, 1) : '—');
    set('sdUnpTotalMin',  unp.total  ? `${fmtN(unp.total)} mnt`  : '—');
    set('sdUnpTotalPct',  grand ? fmtPct((unp.total / grand) * 100, 1)  : '—');
    set('sdPlanTop', plan.list[0] ? `${plan.list[0].label} (${fmtN(plan.list[0].v)} mnt)` : '—');
    set('sdUnpTop',  unp.list[0]  ? `${unp.list[0].label} (${fmtN(unp.list[0].v)} mnt)`  : '—');

    // Keterangan jika tidak ada data
    const emptyNote = (!plan.total && !unp.total)
      ? 'Tidak ada data shutdown pada filter/tanggal/shift yang dipilih.'
      : '';
    set('sdEmptyNote', emptyNote);

    donut('sdPlanDonut', plan.list, plan.total, PLAN_COLORS);
    legend('sdPlanLegend', plan.list, plan.total, PLAN_COLORS);
    donut('sdUnpDonut', unp.list, unp.total, UNP_COLORS);
    legend('sdUnpLegend', unp.list, unp.total, UNP_COLORS);
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

  return { render, _aggregate: aggregate, _normKey: normKey, _fmtAvg: fmtAvg };
})();
