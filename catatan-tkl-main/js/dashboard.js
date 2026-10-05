/**
 * DASHBOARD.JS — Dashboard OEE 360°
 * Ringkasan KPI + donut + tren + analisis kode 1–9 + tabel paginasi.
 * Tidak membutuhkan library chart eksternal agar tetap ringan dan aman untuk PWA/offline shell.
 */
const Dashboard = (() => {
  'use strict';

  let loaded = false;
  let allRows = [];
  let filteredRows = [];
  let statusFilter = '';
  let chartView = 'donut';
  let codeView = 'table';
  let page = 1;
  const pageSize = 25;
  let zoomPoints = 14;
  let activityDetailState = { code: null, scrollY: 0 };

  const el = (id) => State.el[id] || document.getElementById(id);
  const esc = (v) => (typeof Utils?.escapeHtml === 'function' ? Utils.escapeHtml(v) : String(v ?? ''));
  const num = (v) => {
    if (v == null || v === '') return null;
    const n = Number(String(v).replace('%', '').replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };
  const fmt = (v, d = 1) => Number.isFinite(Number(v)) ? Number(v).toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d }) : '-';
  const fmt0 = (v) => Number.isFinite(Number(v)) ? Math.round(Number(v)).toLocaleString('id-ID') : '0';
  const fmtDate = (iso) => {
    if (!iso) return '-';
    const p = String(iso).split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
  };
  const targetOee = () => num(CONFIG?.TARGET?.OEE) ?? 85;

  const shiftMinutes = (shift) => ({ 1: 510, 2: 480, 3: 450 }[Number(shift)] || 0);

  const daysAgo = (d) => {
    const x = new Date(); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - d);
    return x.toISOString().slice(0, 10);
  };
  const localToday = () => Utils.todayLocal ? Utils.todayLocal() : new Date().toISOString().slice(0, 10);

  const setStatus = (msg, isErr = false) => {
    const node = el('dashStatus');
    if (!node) return;
    node.textContent = msg;
    node.className = `dash-status${isErr ? ' err' : ''}`;
  };

  const setPresetActive = (key) => {
    document.querySelectorAll('[data-dash-preset]').forEach(b => b.classList.toggle('is-active', b.dataset.dashPreset === key));
  };

  const applyPreset = (key) => {
    const to = localToday();
    let from = to;
    if (key === 'yesterday') { from = daysAgo(1); el('dashTo').value = daysAgo(1); }
    else if (key === '7') from = daysAgo(6);
    else if (key === '30') from = daysAgo(29);
    else if (key === 'month') from = `${to.slice(0, 7)}-01`;
    else if (key === 'custom') return;
    el('dashFrom').value = from;
    if (key !== 'yesterday') el('dashTo').value = to;
    setPresetActive(key);
    fetchAndRender();
  };

  const setDefaultFilters = () => {
    el('dashFrom').value = localToday();
    el('dashTo').value = localToday();
    setPresetActive('today');
    ['dashLine', 'dashShift', 'dashStage', 'dashProduct', 'dashOperator'].forEach(id => { if (el(id)) el(id).value = ''; });
  };

  const makeQuery = () => {
    const client = typeof SupabaseClient !== 'undefined' ? SupabaseClient.getClient() : null;
    if (!client) return null;
    let q = client.from(CONFIG.DB_TABLE).select('*').order('date', { ascending: false }).order('shift', { ascending: true }).limit(5000);
    const from = el('dashFrom')?.value;
    const to = el('dashTo')?.value;
    const line = el('dashLine')?.value;
    const shift = el('dashShift')?.value;
    const stage = el('dashStage')?.value;
    if (from) q = q.gte('date', from);
    if (to) q = q.lte('date', to);
    if (line) q = q.eq('line', line);
    if (shift) q = q.eq('shift', parseInt(shift, 10));
    if (stage) q = q.eq('tahapan', stage);
    return q;
  };

  const recordProducts = (r) => {
    const out = new Set();
    const p = r?.payload?.products;
    [p?.p1Name, p?.p2Name, p?.p3Name].forEach(v => { if (String(v || '').trim()) out.add(String(v).trim()); });
    if (r?.produk_batch) String(r.produk_batch).split('|').forEach(v => out.add(v.trim().replace(/\s+\(WO:.*\)$/i, '')));
    return [...out];
  };
  const recordOperators = (r) => {
    const out = new Set();
    const ops = r?.payload?.operators || {};
    Object.values(ops).forEach(v => { if (String(v || '').trim()) out.add(String(v).trim()); });
    if (r?.inisial_operator) String(r.inisial_operator).split(',').forEach(v => out.add(v.trim()));
    return [...out].filter(Boolean);
  };

  const parseDuration = (a, b, fallback = 0) => {
    if (a == null || b == null || a === '' || b === '') return fallback;
    try {
      const s = Utils.parseTime(a), e = Utils.parseTime(b);
      if (s == null || e == null) return fallback;
      return (e - s + 1440) % 1440;
    } catch { return fallback; }
  };

  const rawActivities = (r) => {
    const rows = Array.isArray(r?.payload?.rows) ? r.payload.rows : [];
    return rows.map(x => {
      const kode = parseInt(String(x.kode ?? '').trim(), 10);
      const dur = parseDuration(x.mulai, x.selesai, 0);
      const good = num(x.good) || 0;
      const defect = num(x.defect) || 0;
      let cat = 'prod';
      if (CONFIG?.PLANNED_CODES?.has(kode)) cat = 'planned';
      else if (CONFIG?.UNPLANNED_CODES?.has(kode)) cat = 'unplanned';
      return { ...x, kode, dur, good, defect, cat };
    }).filter(x => Number.isFinite(x.kode));
  };

  const aggregate = (rows) => {
    let sums = { a: 0, p: 0, q: 0, oee: 0, count: 0 };
    let good = 0, defect = 0, target = 0, totalTime = 0, productive = 0, planned = 0, unplanned = 0;
    const codes = Array.from({ length: 9 }, (_, i) => ({ code: i + 1, cat: '', minutes: 0, count: 0, good: 0, defect: 0, activities: {} }));
    const byDate = {};

    rows.forEach(r => {
      const a = num(r.availability), p = num(r.performance), q = num(r.quality), o = num(r.oee);
      if (a != null) sums.a += a; if (p != null) sums.p += p; if (q != null) sums.q += q; if (o != null) sums.oee += o;
      sums.count += 1;
      good += num(r.total_good) || 0; defect += num(r.total_defect) || 0;

      let used = 0, prod = 0, plan = 0, unplan = 0, recordTarget = 0;
      const acts = rawActivities(r);
      const productRates = {};
      const prodCfg = r?.payload?.products || {};
      [[prodCfg.p1Name, prodCfg.p1Rate], [prodCfg.p2Name, prodCfg.p2Rate], [prodCfg.p3Name, prodCfg.p3Rate]].forEach(([n, rate]) => { if (n) productRates[String(n)] = num(rate) || 0; });
      acts.forEach(x => {
        used += x.dur;
        if (x.cat === 'prod') {
          prod += x.dur;
          if (x.good >= 1) recordTarget += x.dur * (productRates[x.batch] || 0);
        } else if (x.cat === 'planned') plan += x.dur;
        else if (x.cat === 'unplanned') unplan += x.dur;
        const c = codes[x.kode - 1];
        if (c) {
          c.minutes += x.dur; c.count += 1; c.good += x.good; c.defect += x.defect;
          if (x.kegiatan) c.activities[x.kegiatan] = (c.activities[x.kegiatan] || 0) + 1;
          c.cat = x.cat;
        }
      });
      if (!used) used = shiftMinutes(r.shift);
      totalTime += used; productive += prod; planned += plan; unplanned += unplan; target += recordTarget;

      const date = r.date || '—';
      if (!byDate[date]) byDate[date] = { date, oee: [], good: 0, defect: 0, productive: 0, planned: 0, unplanned: 0, total: 0 };
      byDate[date].oee.push(o == null ? 0 : Math.max(0, o));
      byDate[date].good += num(r.total_good) || 0;
      byDate[date].defect += num(r.total_defect) || 0;
      byDate[date].productive += prod; byDate[date].planned += plan; byDate[date].unplanned += unplan; byDate[date].total += used;
    });

    const avg = (x) => sums.count ? x / sums.count : 0;
    const avgOee = avg(sums.oee), avgA = avg(sums.a), avgP = avg(sums.p), avgQ = avg(sums.q);
    return {
      count: rows.length, a: avgA, p: avgP, q: avgQ, oee: avgOee,
      good, defect, target, totalTime, productive, planned, unplanned,
      codes,
      byDate: Object.values(byDate).map(x => ({ ...x, oee: x.oee.reduce((a, b) => a + b, 0) / (x.oee.length || 1) })).sort((a, b) => a.date.localeCompare(b.date)),
    };
  };

  const populateDynamicFilters = (rows) => {
    const products = new Set(), operators = new Set();
    rows.forEach(r => { recordProducts(r).forEach(v => products.add(v)); recordOperators(r).forEach(v => operators.add(v)); });
    const productSel = el('dashProduct'), opSel = el('dashOperator');
    const pv = productSel.value, ov = opSel.value;
    productSel.innerHTML = '<option value="">Semua Produk</option>' + [...products].sort().map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    opSel.innerHTML = '<option value="">Semua Operator</option>' + [...operators].sort().map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    productSel.value = [...products].includes(pv) ? pv : '';
    opSel.value = [...operators].includes(ov) ? ov : '';
  };

  const applyClientFilters = () => {
    const product = el('dashProduct')?.value || '';
    const op = el('dashOperator')?.value || '';
    filteredRows = allRows.filter(r => {
      if (product && !recordProducts(r).includes(product)) return false;
      if (op && !recordOperators(r).includes(op)) return false;
      if (statusFilter) {
        const o = num(r.oee);
        const key = o == null ? 'none' : (o >= 85 ? 'good' : (o >= 60 ? 'warn' : 'bad'));
        if (key !== statusFilter) return false;
      }
      return true;
    });
    page = 1;
    renderAll(filteredRows);
  };

  const fetchAndRender = async () => {
    const q = makeQuery();
    if (!q) { setStatus('⚠ Supabase belum terhubung. Cek konfigurasi.', true); renderAll([]); return; }
    if (!navigator.onLine) { setStatus('⚠ Tidak ada koneksi internet. Dashboard butuh online untuk data terbaru.', true); return; }
    setStatus('Memuat dashboard…');
    try {
      const { data, error } = await q;
      if (error) throw error;
      allRows = data || [];
      statusFilter = '';
      populateDynamicFilters(allRows);
      applyClientFilters();
      setStatus(`✓ ${allRows.length} record tersedia${allRows.length === 5000 ? ' (maks. 5000; sempitkan rentang filter untuk lebih detail)' : ''}`);
    } catch (err) {
      console.warn('Dashboard fetch error:', err);
      setStatus('⚠ Gagal memuat data: ' + err.message, true);
      renderAll([]);
    }
  };

  const statusClass = (v) => v == null ? 'none' : v >= 85 ? 'good' : v >= 60 ? 'warn' : 'bad';
  const statusLabel = (v) => v == null ? 'Tidak ada data' : v >= 85 ? 'Sangat Baik' : v >= 60 ? 'Perlu Perbaikan' : 'Kritis';

  const updateKpis = (s) => {
    el('dashKpiOee').textContent = `${fmt(s.oee)}%`;
    el('dashKpiA').textContent = `${fmt(s.a)}%`;
    el('dashKpiP').textContent = `${fmt(s.p)}%`;
    el('dashKpiQ').textContent = `${fmt(s.q)}%`;
    el('dashKpiOutput').textContent = fmt0(s.good + s.defect);
    el('dashKpiDefect').textContent = fmt0(s.defect);
    el('dashKpiDt').textContent = `${fmt0(s.planned + s.unplanned)} mnt`;
    el('dashKpiDtSplit').textContent = `${fmt0(s.planned)} / ${fmt0(s.unplanned)}`;
    el('dashKpiAInfo').textContent = `${fmt0(s.productive)} mnt`;
    el('dashKpiPInfo').textContent = `${fmt0(s.target)} unit`;
    el('dashKpiQInfo').textContent = `${fmt0(s.good)} / ${fmt0(s.good + s.defect)}`;
    el('dashTargetOee').textContent = `${fmt(targetOee(), 0)}%`;
    const gap = s.oee - targetOee();
    el('dashOeeGap').textContent = `${gap >= 0 ? '+' : ''}${fmt(gap)}%`;
    el('dashOeeGap').className = `dash-gap ${gap >= 0 ? 'positive' : 'negative'}`;
    const st = statusClass(s.oee);
    el('dashOeeStatus').textContent = statusLabel(s.oee);
    const card = document.querySelector('.dash-kpi-oee');
    if (card) card.dataset.kpiStatus = st;
    el('dashRecordCount').textContent = `${s.count} record`;
    el('dashCompA').textContent = `${fmt(s.a)}%`;
    el('dashCompP').textContent = `${fmt(s.p)}%`;
    el('dashCompQ').textContent = `${fmt(s.q)}%`;
  };

  const donutSvg = (value, centerTop, centerBottom, size = 230, color = 'var(--blue)', extra = '') => {
    const pct = Math.max(0, Math.min(100, value || 0));
    const r = 76, c = 2 * Math.PI * r, dash = c * pct / 100;
    return `<svg viewBox="0 0 ${size} ${size}" class="dash-donut-svg" ${extra}>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="donut-track"></circle>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="donut-value" style="stroke:${color};stroke-dasharray:${dash} ${c - dash}"></circle>
      <text x="50%" y="47%" class="donut-center-value">${esc(centerTop)}</text>
      <text x="50%" y="58%" class="donut-center-label">${esc(centerBottom)}</text>
    </svg>`;
  };

  const renderDonuts = (s) => {
    const oeeColor = s.oee >= 85 ? 'var(--green)' : s.oee >= 60 ? 'var(--amber)' : 'var(--red)';
    el('dashOeeDonut').innerHTML = donutSvg(s.oee, `${fmt(s.oee)}%`, 'OEE', 250, oeeColor);
    const counts = { good: 0, warn: 0, bad: 0, none: 0 };
    filteredRows.forEach(r => counts[statusClass(num(r.oee))]++);
    const total = Math.max(1, counts.good + counts.warn + counts.bad + counts.none);
    let cursor = 0;
    const colors = { good: 'var(--green)', warn: 'var(--amber)', bad: 'var(--red)', none: 'var(--mut)' };
    const labels = { good: ['≥85%', 'Sangat baik'], warn: ['60–84,99%', 'Perlu perbaikan'], bad: ['<60%', 'Kritis'], none: ['Tanpa data', 'Tidak ada OEE'] };
    const R = 72, C = 2 * Math.PI * R, size = 190;
    const segs = Object.entries(counts).map(([k, v]) => {
      const frac = v / total, dash = C * frac, gap = 2;
      const offset = C * (0.25 - cursor);
      cursor += frac;
      return `<circle cx="95" cy="95" r="${R}" class="status-seg" data-status="${k}" style="stroke:${colors[k]};stroke-dasharray:${Math.max(0, dash - gap)} ${C - Math.max(0, dash - gap)};stroke-dashoffset:${offset * -1}"></circle>`;
    }).join('');
    el('dashStatusDonut').innerHTML = `<svg viewBox="0 0 ${size} ${size}" class="dash-small-donut-svg"><circle cx="95" cy="95" r="${R}" class="donut-track"></circle>${segs}<text x="95" y="92" text-anchor="middle" class="small-donut-main">${filteredRows.length}</text><text x="95" y="112" text-anchor="middle" class="small-donut-sub">record</text></svg>`;
    el('dashStatusLegend').innerHTML = Object.entries(counts).map(([k, v]) => `<button type="button" class="dash-status-item ${statusFilter === k ? 'is-active' : ''}" data-status-filter="${k}"><i style="background:${colors[k]}"></i><span>${labels[k][0]}<small>${labels[k][1]}</small></span><b>${v}</b></button>`).join('');
    el('dashStatusLegend').querySelectorAll('[data-status-filter]').forEach(btn => btn.addEventListener('click', () => {
      statusFilter = statusFilter === btn.dataset.statusFilter ? '' : btn.dataset.statusFilter;
      applyClientFilters();
    }));
  };

  const activityCodeMeta = {
    1: { label: 'Unplanned', cls: 'is-unplanned' },
    2: { label: 'Produktif', cls: 'is-productive' },
    3: { label: 'Unplanned', cls: 'is-unplanned' },
    4: { label: 'Unplanned', cls: 'is-unplanned' },
    5: { label: 'Planned', cls: 'is-planned' },
    6: { label: 'Planned', cls: 'is-planned' },
    7: { label: 'Planned', cls: 'is-planned' },
    8: { label: 'Planned', cls: 'is-planned' },
    9: { label: 'Unplanned', cls: 'is-unplanned' },
  };

  const getFilteredActivities = () => {
    const activities = [];
    filteredRows.forEach(r => {
      rawActivities(r).forEach(a => {
        activities.push({
          ...a,
          date: r.date,
          shift: r.shift,
          line: r.line,
          stage: r.tahapan,
          productName: a.batch || r.produk_batch || '',
          operatorInitial: r.inisial_operator || '',
        });
      });
    });
    return activities;
  };

  const openActivityCodeDetail = (code) => {
    const summary = el('dashCodeSummary');
    const detail = el('activityCodeDetail');
    if (!summary || !detail) return;
    const activities = getFilteredActivities().filter(a => Number(a.kode) === Number(code));
    const meta = activityCodeMeta[Number(code)] || { label: 'Aktivitas', cls: '' };
    const summaryState = aggregate(filteredRows);
    const codeSummary = summaryState.codes.find(c => Number(c.code) === Number(code));
    const totalMinutes = activities.reduce((sum, a) => sum + Number(a.dur || 0), 0);
    const totalTime = Number(summaryState.totalTime || 0);
    const contribution = totalTime ? (totalMinutes / totalTime) * 100 : 0;
    const activityGroups = {};
    activities.forEach(a => {
      const name = String(a.kegiatan || '—').trim() || '—';
      if (!activityGroups[name]) activityGroups[name] = { minutes: 0, count: 0 };
      activityGroups[name].minutes += Number(a.dur || 0);
      activityGroups[name].count += 1;
    });
    const topActivities = Object.entries(activityGroups).sort((a,b) => b[1].minutes - a[1].minutes);

    activityDetailState = { code: Number(code), scrollY: window.scrollY || window.pageYOffset || 0 };

    const title = el('detailCodeTitle');
    const stats = el('detailCodeStats');
    const rows = el('activityCodeDetailRows');
    if (title) title.textContent = `Kode ${code} — ${meta.label}`;
    if (stats) {
      stats.innerHTML = [
        `<span><b>${fmt0(totalMinutes)} mnt</b> total waktu</span>`,
        `<span><b>${fmt0(activities.length)}x</b> kejadian</span>`,
        `<span><b>${fmt(contribution)}%</b> dari total waktu</span>`,
      ].join('');
    }
    const topList = el('activityCodeTopActivities');
    if (topList) {
      topList.innerHTML = topActivities.length
        ? topActivities.map(([name, v]) => `<div class="activity-top-item"><span>${esc(name)}</span><b>${fmt0(v.minutes)} mnt · ${fmt0(v.count)}x</b></div>`).join('')
        : '<div class="activity-top-empty">Tidak ada kegiatan untuk kode ini.</div>';
    }
    if (rows) {
      rows.innerHTML = activities.length ? activities.map(a => `<tr>
        <td>${fmtDate(a.date)}</td>
        <td>S${esc(a.shift ?? '—')}</td>
        <td>Line ${esc(a.line ?? '—')}</td>
        <td>${esc(String(a.stage || '').toUpperCase() || '—')}</td>
        <td class="dash-td-wrap">${esc(a.productName || '—')}</td>
        <td class="dash-td-wrap">${esc(a.kegiatan || '—')}</td>
        <td>${fmt0(a.dur)} mnt</td>
        <td>${esc(a.operatorInitial || '—')}</td>
      </tr>`).join('') : `<tr><td colspan="8" class="empty-detail">Tidak ada kegiatan untuk Kode ${code} pada filter dashboard yang aktif.</td></tr>`;
    }
    summary.hidden = true;
    detail.hidden = false;
    detail.dataset.category = meta.cls;
    requestAnimationFrame(() => { detail.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  };

  const closeActivityCodeDetail = () => {
    const summary = el('dashCodeSummary');
    const detail = el('activityCodeDetail');
    if (!summary || !detail) return;
    detail.hidden = true;
    summary.hidden = false;
    const y = Number(activityDetailState.scrollY || 0);
    requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'smooth' }));
  };

  const bindActivityCodeInteractions = () => {
    const summary = el('dashCodeSummary');
    if (!summary || summary.dataset.bound === '1') return;
    summary.dataset.bound = '1';
    summary.addEventListener('click', (event) => {
      const row = event.target.closest('.activity-code-row');
      if (!row) return;
      openActivityCodeDetail(row.dataset.code);
    });
    summary.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const row = event.target.closest('.activity-code-row');
      if (!row) return;
      event.preventDefault();
      openActivityCodeDetail(row.dataset.code);
    });
    el('backToCodeSummary')?.addEventListener('click', closeActivityCodeDetail);
  };

  const renderCodeTable = (s) => {
    const rows = s.codes.map(c => {
      const topAct = Object.entries(c.activities).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
      const contribution = s.totalTime ? (c.minutes / s.totalTime) * 100 : 0;
      const cat = c.cat || (c.code === 2 ? 'prod' : CONFIG.PLANNED_CODES.has(c.code) ? 'planned' : CONFIG.UNPLANNED_CODES.has(c.code) ? 'unplanned' : 'prod');
      const meta = activityCodeMeta[c.code] || { label: cat === 'prod' ? 'Produktif' : cat === 'planned' ? 'Planned' : 'Unplanned', cls: cat === 'prod' ? 'is-productive' : cat === 'planned' ? 'is-planned' : 'is-unplanned' };
      return `<tr class="activity-code-row ${meta.cls}" data-code="${c.code}" tabindex="0" role="button" aria-label="Buka detail Kode ${c.code}"><td><span class="code-number">${c.code}</span></td><td><span class="activity-category">${meta.label}</span></td><td>${fmt0(c.minutes)} mnt</td><td>${fmt0(c.count)}x</td><td>${fmt(contribution)}%</td><td class="code-act">${esc(topAct)}</td><td><span class="activity-detail-trigger">Detail <span aria-hidden="true">→</span></span></td></tr>`;
    }).join('');
    el('dashCodeSummary').innerHTML = `<div class="dash-code-table-wrap"><table class="dash-code-table activity-code-table"><thead><tr><th>Kode</th><th>Kategori</th><th>Total Waktu</th><th>Frekuensi</th><th>Kontribusi</th><th>Kegiatan Terbanyak</th><th>Aksi</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    bindActivityCodeInteractions();
  };

  const renderCodeDonut = (s) => {
    const groups = { prod: 0, planned: 0, unplanned: 0 };
    s.codes.forEach(c => { const cat = c.cat || (c.code === 2 ? 'prod' : CONFIG.PLANNED_CODES.has(c.code) ? 'planned' : 'unplanned'); groups[cat] += c.minutes; });
    const total = groups.prod + groups.planned + groups.unplanned || 1;
    const entries = [['prod', 'Produktif', 'var(--green)'], ['planned', 'Planned DT', 'var(--amber)'], ['unplanned', 'Unplanned DT', 'var(--red)']];
    let start = 0;
    const C = 2 * Math.PI * 78, cx = 110, cy = 110;
    const seg = entries.map(([k, label, color]) => { const frac = groups[k] / total, dash = C * frac; const offset = -C * start + C / 4; start += frac; return `<circle cx="${cx}" cy="${cy}" r="78" class="code-donut-seg" style="stroke:${color};stroke-dasharray:${dash} ${C - dash};stroke-dashoffset:${offset}"></circle>`; }).join('');
    el('dashCodeSummary').innerHTML = `<div class="dash-code-donut-wrap"><svg viewBox="0 0 220 220" class="dash-code-donut-svg"><circle cx="110" cy="110" r="78" class="donut-track"></circle>${seg}<text x="110" y="105" text-anchor="middle" class="small-donut-main">${fmt0(total)}</text><text x="110" y="125" text-anchor="middle" class="small-donut-sub">menit</text></svg><div class="dash-code-donut-legend">${entries.map(([k,label,color]) => `<div><i style="background:${color}"></i><span>${label}</span><b>${fmt0(groups[k])} mnt</b></div>`).join('')}</div></div>`;
  };

  const dateSeries = (s) => {
    const base = s.byDate.slice(-Math.max(7, zoomPoints));
    el('dashZoomText').textContent = `${base.length} titik terakhir`;
    return base;
  };

  const renderLineChart = (s) => {
    const data = dateSeries(s); if (!data.length) { el('dashChart').innerHTML = '<div class="dash-empty">Tidak ada data untuk grafik.</div>'; return; }
    const W = Math.max(640, data.length * 70), H = 300, p = { l: 42, r: 20, t: 22, b: 54 }, innerW = W - p.l - p.r, innerH = H - p.t - p.b;
    const pts = data.map((d, i) => { const x = p.l + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW); const y = p.t + innerH * (1 - Math.max(0, Math.min(100, d.oee)) / 100); return { ...d, x, y }; });
    const path = pts.map((d,i) => `${i ? 'L' : 'M'}${d.x},${d.y}`).join(' ');
    const targetY = p.t + innerH * (1 - targetOee() / 100);
    const circles = pts.map(d => `<circle cx="${d.x}" cy="${d.y}" r="4" class="trend-point ${statusClass(d.oee)}"><title>${fmtDate(d.date)} · OEE ${fmt(d.oee)}%</title></circle>`).join('');
    const labels = pts.map(d => `<text x="${d.x}" y="${H - 25}" text-anchor="middle" class="trend-label">${esc(fmtDate(d.date).slice(0, 5))}</text>`).join('');
    el('dashChart').innerHTML = `<div class="dash-chart-scroll"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="dash-line-svg"><line x1="${p.l}" y1="${targetY}" x2="${W - p.r}" y2="${targetY}" class="dash-target-line"></line><text x="${p.l}" y="${targetY - 6}" class="dash-target-label">Target ${fmt(targetOee(),0)}%</text><path d="${path}" class="dash-line-path"></path>${circles}${labels}</svg></div>`;
  };

  const renderBarChart = (rows) => {
    const base = [...rows].sort((a,b) => String(a.date).localeCompare(String(b.date))).slice(-Math.max(7, zoomPoints));
    if (!base.length) { el('dashChart').innerHTML = '<div class="dash-empty">Tidak ada data untuk grafik.</div>'; return; }
    const W = Math.max(640, base.length * 54), H = 300, p = { l: 42, r: 16, t: 22, b: 54 }, innerH = H - p.t - p.b, step = (W - p.l - p.r) / base.length, barW = Math.min(32, step * .58);
    const targetY = p.t + innerH * (1 - targetOee() / 100);
    const bars = base.map((r,i) => { const v = Math.max(0, Math.min(100, num(r.oee) || 0)), h = innerH * v / 100, x = p.l + i * step + (step - barW)/2, y = H - p.b - h; return `<g><rect x="${x}" y="${y}" width="${barW}" height="${Math.max(1,h)}" rx="5" class="dash-bar ${statusClass(v)}"><title>${fmtDate(r.date)} · S${r.shift} · OEE ${fmt(v)}%</title></rect><text x="${x+barW/2}" y="${y-6}" text-anchor="middle" class="dash-bar-val">${fmt(v,0)}</text><text x="${x+barW/2}" y="${H-25}" text-anchor="middle" class="trend-label">${esc(fmtDate(r.date).slice(0,5))}</text></g>`; }).join('');
    el('dashChart').innerHTML = `<div class="dash-chart-scroll"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="dash-line-svg"><line x1="${p.l}" y1="${targetY}" x2="${W-p.r}" y2="${targetY}" class="dash-target-line"></line><text x="${p.l}" y="${targetY-6}" class="dash-target-label">Target ${fmt(targetOee(),0)}%</text>${bars}</svg></div>`;
  };

  const renderStacked = (s) => {
    const data = dateSeries(s); if (!data.length) { el('dashChart').innerHTML = '<div class="dash-empty">Tidak ada data untuk grafik.</div>'; return; }
    const W = Math.max(640, data.length * 58), H = 300, p = { l: 44, r: 16, t: 18, b: 54 }, innerH = H-p.t-p.b, step=(W-p.l-p.r)/data.length, barW=Math.min(34,step*.62), maxVal=Math.max(...data.map(d => d.total), 1);
    const bars=data.map((d,i)=>{let y=H-p.b; const vals=[['productive',d.productive,'var(--green)'],['planned',d.planned,'var(--amber)'],['unplanned',d.unplanned,'var(--red)']]; const rects=vals.map(([k,v,color])=>{const h=innerH*v/maxVal; y-=h; return `<rect x="${p.l+i*step+(step-barW)/2}" y="${y}" width="${barW}" height="${Math.max(1,h)}" class="stack-${k}" style="fill:${color}"><title>${fmtDate(d.date)} · ${k} ${fmt0(v)} mnt</title></rect>`}).join(''); return rects+`<text x="${p.l+i*step+step/2}" y="${H-25}" text-anchor="middle" class="trend-label">${esc(fmtDate(d.date).slice(0,5))}</text>`;}).join('');
    el('dashChart').innerHTML=`<div class="dash-chart-scroll"><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="dash-line-svg">${bars}</svg></div><div class="dash-mini-legend"><span><i style="background:var(--green)"></i>Produktif</span><span><i style="background:var(--amber)"></i>Planned</span><span><i style="background:var(--red)"></i>Unplanned</span></div>`;
  };

  const renderChart = (s) => {
    if (chartView === 'donut') renderDonuts(s);
    else if (chartView === 'line') renderLineChart(s);
    else if (chartView === 'bar') renderBarChart(filteredRows);
    else if (chartView === 'stacked') renderStacked(s);
    else renderTable(filteredRows, true);
  };

  const renderTable = (rows = filteredRows, compact = false) => {
    const search = (el('dashSearch')?.value || '').trim().toLowerCase();
    const searched = search ? rows.filter(r => [r.date, r.shift, r.line, r.tahapan, r.produk_batch, r.inisial_operator].some(v => String(v || '').toLowerCase().includes(search))) : rows;
    const totalPages = Math.max(1, Math.ceil(searched.length / pageSize));
    page = Math.min(page, totalPages);
    const start = (page - 1) * pageSize;
    const slice = compact ? searched.slice(0, Math.max(7, zoomPoints)) : searched.slice(start, start + pageSize);
    const tbody = el('dashTbody');
    if (!slice.length) tbody.innerHTML = `<tr><td colspan="14" class="dash-empty">Tidak ada data untuk filter ini.</td></tr>`;
    else tbody.innerHTML = slice.map(r => `<tr><td>${fmtDate(r.date)}</td><td>S${esc(r.shift)}</td><td>Line ${esc(r.line)}</td><td>${esc(String(r.tahapan || '').toUpperCase())}</td><td>${fmt(num(r.availability))}</td><td>${fmt(num(r.performance))}</td><td>${fmt(num(r.quality))}</td><td class="dash-oee-cell ${statusClass(num(r.oee))}">${fmt(num(r.oee))}</td><td>${fmt0(num(r.total_downtime))}</td><td>${fmt0(num(r.total_good))}</td><td>${fmt0(num(r.total_defect))}</td><td class="dash-td-wrap">${esc(r.produk_batch || '-')}</td><td class="dash-td-wrap">${esc(r.inisial_operator || '-')}</td><td>${r.updatedAt ? new Date(r.updatedAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '-'}</td></tr>`).join('');
    el('dashPageInfo').textContent = compact ? `${slice.length} record ditampilkan` : `${searched.length ? start + 1 : 0}–${Math.min(start + pageSize, searched.length)} dari ${searched.length}`;
    el('dashTableHint').textContent = `${searched.length} record sesuai filter${search ? ' + pencarian' : ''}`;
    renderPagination(totalPages, searched.length);
  };

  const renderPagination = (totalPages, count) => {
    const p = el('dashPagination'); if (!p) return;
    if (totalPages <= 1) { p.innerHTML = ''; return; }
    const btn = (n, label, disabled=false) => `<button type="button" data-page="${n}" ${disabled ? 'disabled' : ''}>${label}</button>`;
    const nums = [];
    const from = Math.max(1, page - 2), to = Math.min(totalPages, page + 2);
    for (let i = from; i <= to; i++) nums.push(`<button type="button" class="${i === page ? 'is-active' : ''}" data-page="${i}">${i}</button>`);
    p.innerHTML = btn(Math.max(1,page-1), '‹', page===1) + nums.join('') + btn(Math.min(totalPages,page+1), '›', page===totalPages);
    p.querySelectorAll('[data-page]').forEach(b => b.addEventListener('click', () => { page = Number(b.dataset.page); renderTable(filteredRows); }));
  };

  const renderAll = (rows) => {
    filteredRows = rows;
    const s = aggregate(rows);
    updateKpis(s); renderDonuts(s);
    if (codeView === 'table') renderCodeTable(s); else renderCodeDonut(s);
    renderChart(s);
    if (chartView !== 'table') renderTable(rows);
    else renderTable(rows, true);
  };

  const setChartView = (view) => {
    chartView = view;
    el('dashChartSwitch')?.querySelectorAll('button').forEach(b => b.classList.toggle('is-active', b.dataset.chartView === view));
    renderAll(filteredRows);
  };
  const setCodeView = (view) => {
    codeView = view;
    el('dashCodeSwitch')?.querySelectorAll('button').forEach(b => b.classList.toggle('is-active', b.dataset.codeView === view));
    const s = aggregate(filteredRows);
    if (view === 'table') renderCodeTable(s); else renderCodeDonut(s);
  };

  const exportCsv = () => {
    if (!filteredRows.length) return UI?.toast ? UI.toast('Tidak ada data untuk diexport.', true, 'warn') : alert('Tidak ada data untuk diexport.');
    const head = ['Tanggal','Shift','Line','Tahapan','Availability%','Performance%','Quality%','OEE%','Downtime(mnt)','Good','Defect','Produk/Batch','Operator','UpdatedAt'];
    const body = filteredRows.map(r => [r.date, `S${r.shift}`, `Line ${r.line}`, r.tahapan, num(r.availability), num(r.performance), num(r.quality), num(r.oee), num(r.total_downtime), num(r.total_good), num(r.total_defect), r.produk_batch, r.inisial_operator, r.updatedAt]);
    const csv = [head, ...body].map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href=url; a.download=`dashboard-oee-${localToday()}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const init = () => {
    if (!el('dashApply')) return;
    el('dashApply').addEventListener('click', fetchAndRender);
    el('dashRefresh')?.addEventListener('click', fetchAndRender);
    el('dashReset')?.addEventListener('click', () => { setDefaultFilters(); fetchAndRender(); });
    el('dashExport')?.addEventListener('click', exportCsv);
    el('dashZoom')?.addEventListener('input', () => { zoomPoints = Number(el('dashZoom').value) || 14; renderAll(filteredRows); });
    el('dashSearch')?.addEventListener('input', () => { page = 1; renderTable(filteredRows); });
    document.querySelectorAll('[data-dash-preset]').forEach(b => b.addEventListener('click', () => applyPreset(b.dataset.dashPreset)));
    el('dashChartSwitch')?.querySelectorAll('[data-chart-view]').forEach(b => b.addEventListener('click', () => setChartView(b.dataset.chartView)));
    el('dashCodeSwitch')?.querySelectorAll('[data-code-view]').forEach(b => b.addEventListener('click', () => setCodeView(b.dataset.codeView)));
    el('dashFrom')?.addEventListener('change', () => setPresetActive('custom'));
    el('dashTo')?.addEventListener('change', () => setPresetActive('custom'));
  };

  const open = () => {
    if (!loaded) { setDefaultFilters(); fetchAndRender(); loaded = true; }
  };

  return { init, open, refresh: fetchAndRender };
})();
