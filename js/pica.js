/**
 * PICA.JS — Minor Stoppage (manual) + Breakdown (otomatis dari log) di Weekly.
 *
 *  - Minor Stoppage: INPUT MANUAL (Produk, Batch, Problem, Frekuensi + Why-Why)
 *  - Breakdown: baris UNPLANNED kode 1,3,4,9 dengan durasi > 10 menit → Why-Why
 */
const Pica = (() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const sb = () => (typeof SupabaseClient !== 'undefined' ? SupabaseClient.getClient() : null);
  const esc = (s) => Utils.escapeHtml(String(s ?? ''));
  const fmtD = (iso) => String(iso).split('-').reverse().join('/');
  const toNum = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (v == null || v === '') return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };

  const MINOR_MAX_MIN = 10;
  let listBd = [], listMs = [], analysis = {}, current = null, seq = 0;
  let formMode = 'breakdown'; // 'breakdown' | 'minor'
  let metaCtx = { line: '1', stage: 'filling' };

  const rowKey = (x) => [x.kode, x.mulai, x.selesai].map((v) => String(v ?? '').trim()).join('|');
  const fullKey = (p) => [p.date, p.shift, p.line, p.stage, p.key].join('|');
  // ===== Breakdown saja dari log sheet (durasi > 10 mnt, unplanned) =====
  const collectBreakdown = (records) => {
    const out = [];
    records.forEach((r) => {
      const rows = Array.isArray(r.payload?.rows) ? r.payload.rows : [];
      const pr = r.payload?.products || {};
      rows.forEach((x) => {
        const k = parseInt(String(x.kode ?? '').trim(), 10);
        if (!CONFIG.UNPLANNED_CODES.has(k)) return;
        const s = Utils.parseTime(x.mulai), e = Utils.parseTime(x.selesai);
        const d = s != null && e != null ? (e - s + 1440) % 1440 : (toNum(x.durasi) || 0);
        if (!(d > MINOR_MAX_MIN)) return; // hanya > 10 menit
        const prodName = String(x.batch || '').trim();
        const toks = prodName.split(/\s+/);
        const kegiatan = String(x.kegiatan || '').trim();
        const masalah = String(x.masalah || '').trim();
        const problem = masalah || kegiatan || '(tanpa keterangan)';
        let batch = '';
        if (toks.length >= 2) batch = toks.slice(1).join(' ');
        else {
          for (const h of [1, 2, 3]) {
            const nm = String(pr['p' + h + 'Name'] || '').trim();
            const wo = String(pr['p' + h + 'Wo'] || '').trim();
            if (nm && (prodName === nm || prodName.startsWith(nm))) { batch = wo; break; }
          }
        }
        const produk = toks[0] || prodName || '—';
        out.push({
          date: r.rec_date, shift: r.shift, line: String(r.line), stage: String(r.tahapan || r.stage || ''),
          key: rowKey(x), produk, batch, problem, dur: d, freq: 1,
          sebab: masalah, tindakan: String(x.disposisi || '').trim(),
          kind: 'breakdown',
        });
      });
    });
    return out;
  };

  // ===== Minor: localStorage per mesin (line + tahapan) =====
  const msStoreKey = (line, stage) => `tkl_minor_v1_${line}_${stage}`;
  const loadMinorLocal = (line, stage) => {
    try {
      const raw = localStorage.getItem(msStoreKey(line, stage));
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) { return []; }
  };
  const saveMinorLocal = (line, stage, arr) => {
    try { localStorage.setItem(msStoreKey(line, stage), JSON.stringify(arr)); } catch (_) {}
  };

  const loadAnalysis = async (from, to, meta) => {
    const c = sb();
    if (!c) return {};
    const out = {};
    for (let i = 0; i < 30; i++) {
      const { data, error } = await c.from('pica_analysis').select('*')
        .gte('rec_date', from).lte('rec_date', to)
        .eq('line', meta.line).eq('tahapan', meta.stage)
        .range(i * 1000, i * 1000 + 999);
      if (error) throw error;
      (data || []).forEach((d) => { out[[d.rec_date, d.shift, d.line, d.tahapan, d.row_key].join('|')] = d; });
      if (!data || data.length < 1000) break;
    }
    return out;
  };

  const statusCls = (s) => (s === 'Closed' ? 'st-closed' : s === 'On Progress' ? 'st-progress' : 'st-open');
  const cell = (v) => (v ? `<td>${esc(v)}</td>` : '<td class="pica-null"></td>');

  // ===== Bar chart sederhana (nilai per produk) =====
  const barChart = (svgId, pairs, valueLabel, color) => {
    const svg = $(svgId);
    if (!svg) return;
    const items = pairs.slice(0, 12);
    const slot = 72, L = 40, R = 10, T = 22, B = 42, H = 200, ph = H - T - B;
    const W = Math.max(280, L + R + Math.max(1, items.length) * slot);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.style.width = W > 480 ? W + 'px' : '100%';
    const max = Math.max(1, ...items.map((x) => x.v));
    const Y = (v) => T + ph - (v / max) * ph;
    let s = '<g stroke="#334155" stroke-width="1">';
    for (let i = 0; i <= 4; i++) s += `<line x1="${L}" y1="${Y((max * i) / 4)}" x2="${W - R}" y2="${Y((max * i) / 4)}"/>`;
    s += '</g><g fill="#64748b" font-size="9" text-anchor="end">';
    for (let i = 0; i <= 4; i++) s += `<text x="${L - 4}" y="${Y((max * i) / 4) + 3}">${Math.round((max * i) / 4)}</text>`;
    s += '</g>';
    if (!items.length) {
      svg.innerHTML = s + `<text x="${W / 2}" y="${T + ph / 2}" fill="#64748b" font-size="11" text-anchor="middle">Tidak ada data</text>`;
      return;
    }
    items.forEach((it, i) => {
      const x = L + i * slot + 12, w = slot - 24, cx = x + w / 2;
      const y = Y(it.v);
      s += `<rect x="${x}" y="${y}" width="${w}" height="${T + ph - y}" rx="3" fill="${color}">`
        + `<title>${esc(it.label)} · ${it.v} ${valueLabel}</title></rect>`
        + `<text x="${cx}" y="${y - 5}" fill="#e2e8f0" font-size="10" font-weight="700" text-anchor="middle">${it.v}</text>`
        + `<text x="${cx}" y="${T + ph + 14}" fill="#94a3b8" font-size="9" text-anchor="middle">${esc(it.label)}</text>`;
    });
    svg.innerHTML = s;
  };

  const renderMsTable = () => {
    const body = $('msBody');
    if (!body) return;
    if (!listMs.length) {
      body.innerHTML = '<tr><td colspan="13">Belum ada minor stop — klik ➕ Tambah Minor Stop (input manual).</td></tr>';
      return;
    }
    body.innerHTML = listMs.map((p, i) => {
      return `<tr>`
        + `<td class="ctr"><button type="button" class="btn btn-ghost btn-sm ms-edit" data-i="${i}" title="Edit minor stop">✍️</button></td>`
        + `<td class="ctr">${i + 1}.</td>`
        + `<td><b>${esc(p.produk)}</b></td>`
        + `<td class="mono">${esc(p.batch || '—')}</td><td class="pica-problem">${esc(p.problem)}</td>`
        + `<td class="ctr"><b>${p.freq || 1}</b></td>`
        + cell(p.why1) + cell(p.why2) + cell(p.why3) + cell(p.corrective) + cell(p.preventive) + cell(p.pic)
        + `<td><span class="pica-status ${statusCls(p.status)}">${esc(p.status || 'Open')}</span></td></tr>`;
    }).join('');
  };

  const renderBdTable = () => {
    const body = $('picaBody');
    if (!body) return;
    if (!listBd.length) {
      body.innerHTML = '<tr><td colspan="13">Tidak ada breakdown (&gt;10 mnt) pada rentang ini.</td></tr>';
      return;
    }
    body.innerHTML = listBd.map((p, i) => {
      const a = analysis[fullKey(p)];
      return `<tr>`
        + `<td class="ctr"><button type="button" class="btn btn-ghost btn-sm pica-edit" data-i="${i}" title="Isi / ubah Why-Why">✍️</button></td>`
        + `<td class="ctr">${i + 1}.</td>`
        + `<td><button type="button" class="pica-link bd-link" data-i="${i}" title="Buka log sheet">${esc(p.produk)}</button></td>`
        + `<td class="mono">${esc(p.batch || '—')}</td><td class="pica-problem">${esc(p.problem)}</td>`
        + `<td class="ctr">${p.dur || 0}</td>`
        + cell(a?.why1) + cell(a?.why2) + cell(a?.why3) + cell(a?.corrective) + cell(a?.preventive) + cell(a?.pic)
        + `<td><span class="pica-status ${statusCls(a?.status)}">${esc(a?.status || 'Open')}</span></td></tr>`;
    }).join('');
  };

  // ===== Modal form (Breakdown + Minor manual) =====
  const closeForm = () => $('picaOverlay')?.classList.add('hide');

  const openFormBreakdown = (i) => {
    const p = listBd[i];
    if (!p) return;
    formMode = 'breakdown';
    current = p;
    const a = analysis[fullKey(p)];
    const mf = $('picaMinorFields');
    if (mf) mf.hidden = true;
    const title = $('picaModalTitle');
    if (title) title.textContent = '✍️ Form Why-Why / PICA (Breakdown)';
    $('picaCtx').innerHTML =
      `<div class="pica-ctx-row"><b>${esc(p.produk)}</b> · Batch ${esc(p.batch || '—')} · ${fmtD(p.date)} · S${p.shift} · Line ${p.line} · ${esc(p.stage)}</div>`
      + `<div class="pica-ctx-row">Problem: ${esc(p.problem)} (${p.dur || 0} mnt)</div>`;
    $('picaWhy1').value = a?.why1 ?? '';
    $('picaWhy2').value = a?.why2 ?? '';
    $('picaWhy3').value = a?.why3 ?? '';
    $('picaCorrective').value = a?.corrective ?? '';
    $('picaPreventive').value = a?.preventive ?? '';
    $('picaPic').value = a?.pic ?? '';
    $('picaStatus').value = a?.status || 'Open';
    $('picaOverlay').classList.remove('hide');
    setTimeout(() => $('picaWhy1')?.focus(), 30);
  };

  const openFormMinor = (i) => {
    formMode = 'minor';
    const isNew = i == null || i < 0;
    const p = isNew ? null : listMs[i];
    current = isNew
      ? { id: 'ms_' + Date.now(), produk: '', batch: '', problem: '', freq: 1, status: 'Open', kind: 'minor' }
      : p;
    const mf = $('picaMinorFields');
    if (mf) mf.hidden = false;
    const title = $('picaModalTitle');
    if (title) title.textContent = isNew ? '➕ Tambah Minor Stop' : '✍️ Edit Minor Stop';
    $('picaCtx').innerHTML =
      `<div class="pica-ctx-row">Minor Stop · Line ${esc(metaCtx.line)} · ${esc(metaCtx.stage)} — <b>input manual</b> (bukan dari log sheet)</div>`;
    if ($('msProduk')) $('msProduk').value = current.produk || '';
    if ($('msBatch')) $('msBatch').value = current.batch || '';
    if ($('msProblem')) $('msProblem').value = current.problem || '';
    if ($('msFreq')) $('msFreq').value = String(current.freq || 1);
    $('picaWhy1').value = current.why1 || '';
    $('picaWhy2').value = current.why2 || '';
    $('picaWhy3').value = current.why3 || '';
    $('picaCorrective').value = current.corrective || '';
    $('picaPreventive').value = current.preventive || '';
    $('picaPic').value = current.pic || '';
    $('picaStatus').value = current.status || 'Open';
    $('picaOverlay').classList.remove('hide');
    setTimeout(() => ($('msProduk') || $('picaWhy1'))?.focus(), 30);
  };

  const openForm = openFormBreakdown;

  const save = async () => {
    if (formMode === 'minor') {
      const produk = ($('msProduk')?.value || '').trim();
      const problem = ($('msProblem')?.value || '').trim();
      const freq = parseInt($('msFreq')?.value || '1', 10) || 1;
      if (!produk || !problem) {
        if (typeof UI !== 'undefined' && UI.toast) UI.toast('Produk & Problem wajib diisi', true);
        return;
      }
      const rec = {
        id: current?.id || ('ms_' + Date.now()),
        produk,
        batch: ($('msBatch')?.value || '').trim(),
        problem,
        freq,
        why1: $('picaWhy1').value.trim(),
        why2: $('picaWhy2').value.trim(),
        why3: $('picaWhy3').value.trim(),
        corrective: $('picaCorrective').value.trim(),
        preventive: $('picaPreventive').value.trim(),
        pic: $('picaPic').value.trim(),
        status: $('picaStatus').value || 'Open',
        kind: 'minor',
        line: metaCtx.line,
        stage: metaCtx.stage,
      };
      const idx = listMs.findIndex((x) => x.id === rec.id);
      if (idx >= 0) listMs[idx] = rec;
      else listMs.push(rec);
      saveMinorLocal(metaCtx.line, metaCtx.stage, listMs);
      renderMsTable();
      updateMsStatus();
      closeForm();
      if (typeof UI !== 'undefined' && UI.toast) UI.toast('✓ Minor stop disimpan');
      // chart
      const byProd = {};
      listMs.forEach((p) => { byProd[p.produk] = (byProd[p.produk] || 0) + (p.freq || 1); });
      barChart('msChartSvg', Object.entries(byProd).map(([label, v]) => ({ label, v })).sort((a, b) => b.v - a.v), 'kali', '#f59e0b');
      return;
    }

    const c = sb();
    if (!c) { if (typeof UI !== 'undefined' && UI.toast) UI.toast('⚠ Supabase belum terhubung'); return; }
    const p = current;
    if (!p) return;
    const btn = $('picaSave');
    if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan…'; }
    try {
      const rec = {
        rec_date: p.date, shift: p.shift, line: p.line, tahapan: p.stage, row_key: p.key,
        produk: p.produk, batch: p.batch, problem: p.problem, durasi_min: p.dur,
        why1: $('picaWhy1').value.trim(), why2: $('picaWhy2').value.trim(), why3: $('picaWhy3').value.trim(),
        corrective: $('picaCorrective').value.trim(), preventive: $('picaPreventive').value.trim(),
        pic: $('picaPic').value.trim(), status: $('picaStatus').value || 'Open',
      };
      const { error } = await c.from('pica_analysis').upsert(rec, { onConflict: 'rec_date,shift,line,tahapan,row_key' });
      if (error) throw error;
      analysis[fullKey(p)] = rec;
      renderBdTable(); closeForm();
      if (typeof UI !== 'undefined' && UI.toast) UI.toast('✓ Analisis PICA disimpan');
    } catch (e) {
      console.warn('PICA save error:', e);
      if (typeof UI !== 'undefined' && UI.toast) UI.toast('⚠ Gagal simpan: ' + (e.message || e), true);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Simpan'; }
    }
  };

  const updateMsStatus = () => {
    const st = $('msStatusMsg');
    if (!st) return;
    const n = listMs.length;
    const f = listMs.reduce((s, p) => s + (p.freq || 1), 0);
    st.textContent = n ? `✓ ${n} problem minor · total frekuensi ${f} (input manual)` : 'Belum ada minor stop — klik ➕ untuk menambah';
    st.className = 'oee-filter-status';
  };

  const openSheet = (p) => {
    if (p && typeof UI !== 'undefined' && UI.openRecord) {
      UI.openRecord({ date: p.date, shift: p.shift, line: p.line, stage: p.stage });
    }
  };

  // ===== Dipanggil weekly-dashboard setiap halaman mesin dirender =====
  const render = async (records, meta, from, to) => {
    const stg = meta.stage.charAt(0).toUpperCase() + meta.stage.slice(1);
    const set = (id, t) => { const el = $(id); if (el) el.textContent = t; };
    set('msTitle', `Minor Stoppage OEE ${stg} - Line ${meta.line}`);
    set('picaTitle', `PICA Problem OEE (Breakdown >10 mnt) ${stg} - Line ${meta.line}`);
    set('msChartTitle', `Minor Stoppage — Frekuensi per Produk · ${stg} L${meta.line}`);
    set('bdChartTitle', `Breakdown — Durasi per Produk (mnt) · ${stg} L${meta.line}`);

    metaCtx = { line: String(meta.line), stage: String(meta.stage) };
    listBd = collectBreakdown(records);
    listMs = loadMinorLocal(metaCtx.line, metaCtx.stage);

    // Chart: minor = frekuensi per produk; breakdown = total menit per produk
    const msByProd = {};
    listMs.forEach((p) => { msByProd[p.produk] = (msByProd[p.produk] || 0) + (p.freq || 1); });
    const bdByProd = {};
    listBd.forEach((p) => { bdByProd[p.produk] = (bdByProd[p.produk] || 0) + (p.dur || 0); });
    barChart('msChartSvg', Object.entries(msByProd).map(([label, v]) => ({ label, v })).sort((a, b) => b.v - a.v), 'kali', '#f59e0b');
    barChart('bdChartSvg', Object.entries(bdByProd).map(([label, v]) => ({ label, v })).sort((a, b) => b.v - a.v), 'mnt', '#f43f5e');

    renderMsTable();
    renderBdTable();
    updateMsStatus();

    const say = (id, m, err) => {
      const st = $(id);
      if (st) { st.textContent = m; st.className = 'oee-filter-status' + (err ? ' err' : ''); }
    };
    say('msChartStatus', listMs.length ? '' : 'Belum ada minor (input manual)');
    say('bdChartStatus', listBd.length ? '' : 'Tidak ada breakdown');

    const my = ++seq;
    try {
      analysis = await loadAnalysis(from, to, meta);
      if (my !== seq) return;
      renderBdTable();
      const filled = listBd.filter((p) => analysis[fullKey(p)]).length;
      say('picaStatusMsg', `✓ ${listBd.length} breakdown · ${filled} sudah diisi analisis Why-Why`);
    } catch (e) {
      console.warn('PICA load error:', e);
      say('picaStatusMsg', '⚠ Gagal memuat analisis PICA: ' + (e.message || e), true);
    }
  };

  const bind = () => {
    $('msAddBtn')?.addEventListener('click', () => openFormMinor(-1));
    $('msBody')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.ms-edit');
      if (btn) openFormMinor(Number(btn.dataset.i));
    });
    $('picaBody')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.pica-edit');
      if (btn) { openFormBreakdown(Number(btn.dataset.i)); return; }
      const lk = e.target.closest('.bd-link');
      if (lk) openSheet(listBd[Number(lk.dataset.i)]);
    });
    $('picaClose')?.addEventListener('click', closeForm);
    $('picaCancel')?.addEventListener('click', closeForm);
    $('picaSave')?.addEventListener('click', save);
    $('picaOverlay')?.addEventListener('click', (e) => { if (e.target === $('picaOverlay')) closeForm(); });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  return { render };
})();
