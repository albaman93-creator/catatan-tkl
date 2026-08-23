/**
 * DASHBOARD.JS
 * Screen "Dashboard OEE" — rekap tabel + grafik OEE sederhana, sejajar
 * dengan screen lain (Data/Produk/Sheet/Inisial/Performa/OEE) di Bottom
 * Nav. Bisa diakses semua user yang sudah login (tidak perlu akun
 * Supabase terpisah), karena query dilakukan lewat client Supabase yang
 * sama dengan sesi login user.
 */
const Dashboard = (() => {
  'use strict';

  let loaded = false;

  // ====== DIPANGGIL SETIAP KALI TAB "DASHBOARD" DIBUKA ======
  const open = () => {
    if (!loaded) {
      setDefaultFilters();
      fetchAndRender();
      loaded = true;
    }
  };

  const setDefaultFilters = () => {
    const today = Utils.todayLocal();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    const fromStr = new Date(from.getTime() - from.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    State.el.dashFrom.value = fromStr;
    State.el.dashTo.value = today;
  };

  // ====== STATUS ======
  const setStatus = (msg, isErr) => {
    State.el.dashStatus.textContent = msg;
    State.el.dashStatus.className = 'dash-status' + (isErr ? ' err' : '');
  };

  // ====== FETCH DARI SUPABASE (query langsung pakai filter, ringan & cepat) ======
  const fetchAndRender = async () => {
    const client = typeof SupabaseClient !== 'undefined' ? SupabaseClient.getClient() : null;

    if (!client) {
      setStatus('⚠ Supabase belum terhubung. Cek konfigurasi.', true);
      renderTable([]);
      renderChart([]);
      return;
    }
    if (!navigator.onLine) {
      setStatus('⚠ Tidak ada koneksi internet. Dashboard butuh online untuk menarik data terbaru.', true);
      return;
    }

    setStatus('Memuat data…');

    let q = client
      .from(CONFIG.DB_TABLE)
      .select('*')
      .order('date', { ascending: false })
      .order('shift', { ascending: true })
      .limit(300);

    const from  = State.el.dashFrom.value;
    const to    = State.el.dashTo.value;
    const line  = State.el.dashLine.value;
    const shift = State.el.dashShift.value;
    const stage = State.el.dashStage.value;

    if (from)  q = q.gte('date', from);
    if (to)    q = q.lte('date', to);
    if (line)  q = q.eq('line', line);
    if (shift) q = q.eq('shift', parseInt(shift, 10));
    if (stage) q = q.eq('tahapan', stage);

    try {
      const { data, error } = await q;
      if (error) throw error;
      const rows = data || [];
      renderTable(rows);
      renderChart(rows);
      setStatus(`✓ ${rows.length} record dimuat` + (rows.length === 300 ? ' (dibatasi 300 terbaru, persempit filter untuk lebih spesifik)' : ''));
    } catch (err) {
      console.warn('Dashboard fetch error:', err);
      setStatus('⚠ Gagal memuat data: ' + err.message, true);
    }
  };

  // ====== HELPER ======
  const fmtDate = (iso) => {
    if (!iso) return '-';
    const p = iso.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
  };

  const fmtNum = (v, digits = 1) => (v == null || v === '' ? '-' : (+v).toFixed(digits));

  const oeeClass = (v) => {
    if (v == null) return '';
    if (v >= 85) return 'ok';
    if (v >= 60) return 'warn';
    return 'bad';
  };

  // ====== TABEL REKAP ======
  const renderTable = (rows) => {
    const tbody = State.el.dashTbody;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="14" class="dash-empty">Tidak ada data untuk filter ini.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${fmtDate(r.date)}</td>
        <td>S${r.shift}</td>
        <td>Line ${Utils.escapeHtml(r.line)}</td>
        <td>${Utils.escapeHtml((r.tahapan || '').toUpperCase())}</td>
        <td>${fmtNum(r.availability)}</td>
        <td>${fmtNum(r.performance)}</td>
        <td>${fmtNum(r.quality)}</td>
        <td class="dash-oee-cell ${oeeClass(r.oee)}">${fmtNum(r.oee)}</td>
        <td>${fmtNum(r.total_downtime, 0)}</td>
        <td>${fmtNum(r.total_good, 0)}</td>
        <td>${fmtNum(r.total_defect, 0)}</td>
        <td class="dash-td-wrap">${Utils.escapeHtml(r.produk_batch || '-')}</td>
        <td class="dash-td-wrap">${Utils.escapeHtml(r.inisial_operator || '-')}</td>
        <td>${r.updatedAt ? new Date(r.updatedAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '-'}</td>
      </tr>
    `).join('');
  };

  // ====== GRAFIK OEE SEDERHANA (bar chart SVG, tanpa library eksternal) ======
  const renderChart = (rows) => {
    const el = State.el.dashChart;
    if (!rows.length) {
      el.innerHTML = '<div class="dash-empty">Tidak ada data untuk grafik.</div>';
      return;
    }

    // urutkan ascending (lama → baru) supaya grafik terbaca dari kiri ke kanan
    const sorted = [...rows].reverse();

    const H = 220, padT = 18, padB = 40, barW = 26, gap = 20;
    const step = barW + gap;
    const W = Math.max(sorted.length * step + gap, 360);
    const usableH = H - padT - padB;

    const targetY = padT + usableH * (1 - 85 / 100);

    const bars = sorted.map((r, i) => {
      const v = r.oee != null ? Math.max(0, Math.min(100, +r.oee)) : 0;
      const h = usableH * (v / 100);
      const x = gap + i * step;
      const y = H - padB - h;
      const cls = oeeClass(r.oee);
      const label = `${fmtDate(r.date).slice(0, 5)} S${r.shift}`;
      return `
        <g>
          <rect x="${x}" y="${y}" width="${barW}" height="${Math.max(h, 1)}" rx="4" class="dash-bar ${cls}"><title>${Utils.escapeHtml(label)} · OEE ${fmtNum(r.oee)}%</title></rect>
          <text x="${x + barW / 2}" y="${y - 6}" class="dash-bar-val" text-anchor="middle">${r.oee != null ? Math.round(r.oee) : '-'}</text>
          <text x="${x + barW / 2}" y="${H - padB + 16}" class="dash-bar-label" text-anchor="middle">${Utils.escapeHtml(label)}</text>
        </g>`;
    }).join('');

    el.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" class="dash-svg" preserveAspectRatio="xMinYMid meet" width="${W}" height="${H}">
        <line x1="0" y1="${targetY}" x2="${W}" y2="${targetY}" class="dash-target-line"></line>
        <text x="4" y="${targetY - 4}" class="dash-target-label">Target 85%</text>
        ${bars}
      </svg>`;
  };

  // ====== INIT ======
  const init = () => {
    if (!State.el.dashApply) return; // guard kalau elemen belum ada
    State.el.dashApply.addEventListener('click', fetchAndRender);
  };

  return { init, open };
})();
