/**
 * PICA.JS — Minor Stoppage (manual) + Breakdown (otomatis dari log) di Weekly.
 *
 *  - Minor Stoppage: INPUT MANUAL (Produk, Batch, Problem, Frekuensi + Why-Why)
 *  - Breakdown: baris UNPLANNED kode 1,3,4,9 dengan durasi > 10 menit → Why-Why
 *  - Klik Produk pada tabel Breakdown → buka log sheet record sumbernya
 *  - Kolom "Date" ditambahkan di antara No. dan Produk
 */
const Pica = (() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const sb = () => (typeof SupabaseClient !== 'undefined' ? SupabaseClient.getClient() : null);
  const esc = (s) => Utils.escapeHtml(String(s ?? ''));
  const fmtD = (iso) => String(iso || '').split('-').reverse().join('/');
  const fmtShort = (iso) => {
    // 'YYYY-MM-DD' → 'DD/MM' (ringkas untuk kolom Date)
    const s = String(iso || '');
    return s.length >= 10 ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : (s || '—');
  };
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
          date: String(r.date || r.rec_date || ''),
          shift: r.shift,
          line: String(r.line),
          stage: String(r.tahapan || r.stage || ''),
          key: rowKey(x),
          produk, batch, problem, dur: d, freq: 1,
          sebab: masalah,
          tindakan: String(x.disposisi || '').trim(),
          kind: 'breakdown',
        });
      });
    });
    return out;
  };

  // ===== Minor dari kolom MS di log sheet (angka frekuensi per baris) =====
  const collectMinorFromSheet = (records) => {
    const map = new Map(); // key = produk|batch|problem
    records.forEach((r) => {
      const rows = Array.isArray(r.payload?.rows) ? r.payload.rows : [];
      const pr = r.payload?.products || {};
      rows.forEach((x) => {
        const freq = parseInt(String(x.ms ?? '').trim(), 10);
        if (!(freq > 0)) return;
        const prodName = String(x.batch || '').trim();
        const toks = prodName.split(/\s+/);
        const kegiatan = String(x.kegiatan || '').trim();
        const masalah = String(x.masalah || '').trim();
        const problem = masalah || kegiatan || '(minor stop)';
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
        const k = [produk, batch, problem].join('|');
        if (!map.has(k)) {
          map.set(k, {
            id: 'ms_' + k,
            produk, batch, problem, freq: 0,
            date: String(r.date || r.rec_date || ''),
            shift: r.shift != null && r.shift !== '' ? r.shift : '',
            why1: '', why2: '', why3: '', corrective: '', preventive: '', pic: '', status: 'Open',
            kind: 'minor', line: String(r.line), stage: String(r.tahapan || r.stage || ''),
          });
        }
        const entry = map.get(k);
        entry.freq += freq;
        const sh = r.shift != null && r.shift !== '' ? String(r.shift) : '';
        if (sh) {
          if (!entry.shift) entry.shift = sh;
          else {
            const parts = String(entry.shift).split(',').map((s) => s.trim()).filter(Boolean);
            if (!parts.includes(sh)) entry.shift = parts.concat(sh).join(',');
          }
        }
      });
    });
    return Array.from(map.values()).sort((a, b) => b.freq - a.freq);
  };

  // ===== Why-Why minor (opsional) di localStorage, digabung ke data sheet =====
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
  // opts: { clickable, selectedLabel }
  const barChart = (svgId, pairs, valueLabel, color, opts = {}) => {
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
    const clickable = !!opts.clickable;
    const selected = opts.selectedLabel || '';
    items.forEach((it, i) => {
      const x = L + i * slot + 12, w = slot - 24, cx = x + w / 2;
      const y = Y(it.v);
      const isSel = selected && it.label === selected;
      const fill = isSel ? '#fb7185' : color;
      const stroke = isSel ? ' stroke="#fecdd3" stroke-width="2"' : '';
      const tip = clickable
        ? `${esc(it.label)} · ${it.v} ${valueLabel} — klik untuk detail`
        : `${esc(it.label)} · ${it.v} ${valueLabel}`;
      // data-label on rect; pointer-events all; invisible hit area full height optional
      const dl = esc(it.label).replace(/"/g, '&quot;');
      s += `<g class="${clickable ? 'bd-bar-hit' : ''}" data-label="${dl}" style="${clickable ? 'cursor:pointer' : ''}">`
        + `<rect class="bd-bar-rect" data-label="${dl}" x="${x}" y="${y}" width="${w}" height="${Math.max(1, T + ph - y)}" rx="3" fill="${fill}"${stroke} style="pointer-events:all">`
        + `<title>${tip}</title></rect>`
        // full-column hit target (transparent) so label area also clicks
        + (clickable
          ? `<rect class="bd-bar-hitarea" data-label="${dl}" x="${x}" y="${T}" width="${w}" height="${ph}" fill="transparent" style="cursor:pointer;pointer-events:all"></rect>`
          : '')
        + `<text x="${cx}" y="${y - 5}" fill="#e2e8f0" font-size="10" font-weight="700" text-anchor="middle" style="pointer-events:none">${it.v}</text>`
        + `<text x="${cx}" y="${T + ph + 14}" fill="${isSel ? '#fecdd3' : '#94a3b8'}" font-size="9" text-anchor="middle" style="pointer-events:none">${esc(it.label)}</text>`
        + `</g>`;
    });
    svg.innerHTML = s;
  };

  // ===== Detail breakdown per masalah untuk satu produk (panel di samping) =====
  let selectedBdProd = '';

  const setChartsRowMode = (open) => {
    const row = $('picaChartsRow');
    if (row) row.classList.toggle('has-bd-detail', !!open);
  };

  const hideBdDetail = () => {
    selectedBdProd = '';
    const wrap = $('bdDetailWrap');
    if (wrap) wrap.hidden = true;
    setChartsRowMode(false);
  };

  const redrawBdMain = (selected) => {
    const bdByProd = {};
    listBd.forEach((p) => { bdByProd[p.produk] = (bdByProd[p.produk] || 0) + (p.dur || 0); });
    barChart(
      'bdChartSvg',
      Object.entries(bdByProd).map(([label, v]) => ({ label, v })).sort((a, b) => b.v - a.v),
      'mnt',
      '#f43f5e',
      { clickable: true, selectedLabel: selected || '' }
    );
  };

  const renderBdDetail = (produk) => {
    const wrap = $('bdDetailWrap');
    const svg = $('bdDetailSvg');
    if (!wrap || !svg) return;
    selectedBdProd = produk || '';
    if (!produk) { hideBdDetail(); return; }

    const rows = listBd.filter((p) => String(p.produk || '') === produk);
    const byProb = new Map();
    rows.forEach((p) => {
      const key = String(p.problem || '(tanpa keterangan)').trim() || '(tanpa keterangan)';
      if (!byProb.has(key)) byProb.set(key, { problem: key, dur: 0, items: [] });
      const e = byProb.get(key);
      e.dur += Number(p.dur) || 0;
      e.items.push(p);
    });
    const items = [...byProb.values()].sort((a, b) => b.dur - a.dur).slice(0, 15);

    const set = (id, t) => { const el = $(id); if (el) el.textContent = t; };
    set('bdDetailTitle', `Breakdown Durasi (menit) - Produk ${produk}`);
    set('bdDetailSub', '');
    wrap.hidden = false;
    setChartsRowMode(true);

    const slot = 90, L = 44, R = 12, T = 28, B = 48, H = 240, ph = H - T - B;
    const W = Math.max(320, L + R + Math.max(1, items.length) * slot);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.style.width = W > 480 ? W + 'px' : '100%';
    const max = Math.max(1, ...items.map((x) => x.dur));
    // nice scale similar to reference (round up)
    const top = max <= 10 ? 10 : max <= 30 ? Math.ceil(max / 10) * 10 : Math.ceil(max / 20) * 20;
    const Y = (v) => T + ph - (v / top) * ph;
    let s = '<g stroke="#334155" stroke-width="1">';
    for (let i = 0; i <= 4; i++) {
      const vv = (top * i) / 4;
      s += `<line x1="${L}" y1="${Y(vv)}" x2="${W - R}" y2="${Y(vv)}"/>`;
    }
    s += '</g><g fill="#64748b" font-size="10" text-anchor="end">';
    for (let i = 0; i <= 4; i++) {
      const vv = (top * i) / 4;
      s += `<text x="${L - 6}" y="${Y(vv) + 3}">${Math.round(vv)}</text>`;
    }
    s += `</g><text x="14" y="${T + ph / 2}" fill="#64748b" font-size="10" text-anchor="middle" transform="rotate(-90 14 ${T + ph / 2})">Menit</text>`;

    if (!items.length) {
      svg.innerHTML = s + `<text x="${W / 2}" y="${T + ph / 2}" fill="#64748b" font-size="11" text-anchor="middle">Tidak ada rincian</text>`;
      set('bdDetailStatus', '');
      return;
    }

    items.forEach((it) => {
      const i = items.indexOf(it);
      const x = L + i * slot + 16, w = slot - 28, cx = x + w / 2;
      const y = Y(it.dur);
      const lines = it.items.slice(0, 8).map((p) => {
        const batch = p.batch ? ` ${p.batch}` : '';
        const dt = p.date ? fmtD(p.date) : '—';
        const sh = p.shift != null && p.shift !== '' ? ` S${p.shift}` : '';
        return `${produk}${batch} ${dt}${sh} · ${p.dur || 0} mnt`;
      });
      if (it.items.length > 8) lines.push(`… +${it.items.length - 8} kejadian lain`);
      const tip = `${esc(it.problem)} · total ${it.dur} mnt (${it.items.length}x) | ` + lines.map(esc).join(' | ');
      const shortLbl = it.problem.length > 16 ? it.problem.slice(0, 15) + '…' : it.problem;
      s += `<g>`
        + `<rect x="${x}" y="${y}" width="${w}" height="${Math.max(2, T + ph - y)}" rx="4" fill="#ed405c">`
        + `<title>${tip}</title></rect>`
        + `<text x="${cx}" y="${y - 6}" fill="#e2e8f0" font-size="12" font-weight="700" text-anchor="middle">${it.dur}</text>`
        + `<text x="${cx}" y="${T + ph + 16}" fill="#94a3b8" font-size="10" text-anchor="middle">${esc(shortLbl)}</text>`
        + `</g>`;
    });
    svg.innerHTML = s;
    set('bdDetailStatus', `${items.length} jenis masalah · total ${items.reduce((a, b) => a + b.dur, 0)} mnt`);
  };

  const showBdDetail = (produk) => {
    if (!produk) { hideBdDetail(); redrawBdMain(''); return; }
    if (selectedBdProd === produk) {
      hideBdDetail();
      redrawBdMain('');
      return;
    }
    renderBdDetail(produk);
    redrawBdMain(produk);
  };

  const renderMsTable = () => {
    const body = $('msBody');
    if (!body) return;
    if (!listMs.length) {
      body.innerHTML = '<tr><td colspan="15">Belum ada minor stop — isi kolom <b>MS</b> (angka) di log sheet, lalu buka lagi halaman ini.</td></tr>';
      return;
    }
    body.innerHTML = listMs.map((p, i) => {
      return `<tr>`
        + `<td class="ctr"><button type="button" class="btn btn-ghost btn-sm ms-edit" data-i="${i}" title="Edit minor stop">✍️</button></td>`
        + `<td class="ctr">${i + 1}.</td>`
        + `<td class="mono pica-date">${esc(fmtShort(p.date))}</td>`
        + `<td class="ctr mono">${esc(p.shift != null && p.shift !== '' ? p.shift : '—')}</td>`
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
      body.innerHTML = '<tr><td colspan="15">Tidak ada breakdown (&gt;10 mnt) pada rentang ini.</td></tr>';
      return;
    }
    body.innerHTML = listBd.map((p, i) => {
      const a = analysis[fullKey(p)];
      const tip = `Buka log sheet: ${fmtD(p.date)} · S${p.shift} · Line ${p.line} · ${p.stage} — ${p.problem} (${p.dur || 0}m)`;
      return `<tr>`
        + `<td class="ctr"><button type="button" class="btn btn-ghost btn-sm pica-edit" data-i="${i}" title="Isi / ubah Why-Why">✍️</button></td>`
        + `<td class="ctr">${i + 1}.</td>`
        + `<td class="mono pica-date" title="${esc(fmtD(p.date))}">${esc(fmtShort(p.date))}</td>`
        + `<td class="ctr mono">${esc(p.shift != null && p.shift !== '' ? p.shift : '—')}</td>`
        + `<td><button type="button" class="pica-link bd-link"`
        +   ` data-i="${i}"`
        +   ` data-date="${esc(p.date)}"`
        +   ` data-shift="${esc(p.shift)}"`
        +   ` data-line="${esc(p.line)}"`
        +   ` data-stage="${esc(p.stage)}"`
        +   ` data-key="${esc(p.key)}"`
        +   ` title="${esc(tip)}"`
        +   ` aria-label="Buka log sheet ${esc(p.produk)} tanggal ${fmtD(p.date)} shift ${p.shift}">${esc(p.produk)}</button></td>`
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
      ? { id: 'ms_' + Date.now(), produk: '', batch: '', problem: '', freq: 1, status: 'Open', kind: 'minor', date: '' }
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
        date: current?.date || '',
        why1: $('picaWhy1').value.trim(),
        why2: $('picaWhy2').value.trim(),
        why3: $('picaWhy3').value.trim(),
        corrective: $('picaCorrective').value.trim(),
        preventive: $('picaPreventive').value.trim(),
        pic: $('picaPic').value.trim(),
        status: $('picaStatus').value || 'Open',
        kind: 'minor',
        line: String(current?.line || metaCtx.line || ''),
        stage: String(current?.stage || metaCtx.stage || ''),
      };
      const idx = listMs.findIndex((x) => x.id === rec.id);
      if (idx >= 0) listMs[idx] = rec;
      else listMs.push(rec);
      const saveLine = rec.line || metaCtx.line;
      const saveStage = rec.stage || metaCtx.stage;
      // merge into store for that line/stage
      const existing = loadMinorLocal(saveLine, saveStage);
      const eidx = existing.findIndex((x) => (x.id || '') === rec.id ||
        [x.produk, x.batch, x.problem].join('|') === [rec.produk, rec.batch, rec.problem].join('|'));
      if (eidx >= 0) existing[eidx] = { ...existing[eidx], ...rec };
      else existing.push(rec);
      saveMinorLocal(saveLine, saveStage, existing);
      // keep listMs in sync if same context
      if (String(metaCtx.line) === String(saveLine) && String(metaCtx.stage) === String(saveStage)) {
        /* listMs already updated above */
      }
      renderMsTable();
      updateMsStatus();
      closeForm();
      if (typeof UI !== 'undefined' && UI.toast) UI.toast('✓ Minor stop disimpan');
      if (onSavedCb) { try { onSavedCb(rec); } catch (_) {} onSavedCb = null; }
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
      if (onSavedCb) { try { onSavedCb(analysis[fullKey(p)] || rec); } catch (_) {} onSavedCb = null; }
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
    st.textContent = n ? `✓ ${n} problem minor · total frekuensi ${f} (dari kolom MS di sheet)` : 'Belum ada minor — isi kolom MS (angka) di log sheet';
    st.className = 'oee-filter-status';
  };

  // ===== Buka log sheet dari baris Breakdown =====
  const openSheet = (p) => {
    if (!p) return;
    if (typeof UI === 'undefined' || !UI.openRecord) {
      console.warn('PICA: UI.openRecord tidak tersedia');
      return;
    }
    if (!p.date) {
      console.warn('PICA: record tidak punya tanggal — cek collectBreakdown', p);
      return;
    }
    UI.openRecord({
      date:  String(p.date),
      shift: String(p.shift || 1),
      line:  String(p.line || ''),
      stage: String(p.stage || ''),
      rowKey: p.key || ''
    });
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
    // Minor: dari kolom MS di sheet, Why-Why dari localStorage (jika pernah diisi)
    const fromSheet = collectMinorFromSheet(records);
    const saved = loadMinorLocal(metaCtx.line, metaCtx.stage);
    const byId = Object.fromEntries(saved.map((x) => [x.id || (x.produk + '|' + x.batch + '|' + x.problem), x]));
    listMs = fromSheet.map((p) => {
      const s = byId[p.id] || byId[[p.produk, p.batch, p.problem].join('|')];
      if (!s) return p;
      return {
        ...p,
        date: p.date || s.date || '',
        why1: s.why1 || '', why2: s.why2 || '', why3: s.why3 || '',
        corrective: s.corrective || '', preventive: s.preventive || '',
        pic: s.pic || '', status: s.status || 'Open',
      };
    });
    // Entri manual lama yang tidak ada di sheet tetap tampil
    saved.forEach((s) => {
      const id = s.id || [s.produk, s.batch, s.problem].join('|');
      if (!listMs.some((p) => (p.id || [p.produk, p.batch, p.problem].join('|')) === id)) {
        listMs.push(s);
      }
    });

    // Chart: minor = frekuensi per produk; breakdown = total menit per produk
    const msByProd = {};
    listMs.forEach((p) => { msByProd[p.produk] = (msByProd[p.produk] || 0) + (p.freq || 1); });
    const bdByProd = {};
    listBd.forEach((p) => { bdByProd[p.produk] = (bdByProd[p.produk] || 0) + (p.dur || 0); });
    barChart('msChartSvg', Object.entries(msByProd).map(([label, v]) => ({ label, v })).sort((a, b) => b.v - a.v), 'kali', '#f59e0b');
    hideBdDetail();
    redrawBdMain('');

    renderMsTable();
    renderBdTable();
    updateMsStatus();

    const say = (id, m, err) => {
      const st = $(id);
      if (st) { st.textContent = m; st.className = 'oee-filter-status' + (err ? ' err' : ''); }
    };
    say('msChartStatus', listMs.length ? '' : 'Belum ada minor (input manual)');
    say('bdChartStatus', listBd.length ? 'Klik batang produk untuk melihat rincian masalah' : 'Tidak ada breakdown');

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
      if (lk) {
        const i = Number(lk.dataset.i);
        const p = listBd[i] || {
          date:  lk.dataset.date,
          shift: lk.dataset.shift,
          line:  lk.dataset.line,
          stage: lk.dataset.stage,
          key:   lk.dataset.key
        };
        openSheet(p);
      }
    });
    // Keyboard: Enter / Space pada tombol produk
    $('picaBody')?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const lk = e.target.closest('.bd-link');
      if (!lk) return;
      e.preventDefault();
      lk.click();
    });
    $('picaClose')?.addEventListener('click', closeForm);
    $('picaCancel')?.addEventListener('click', closeForm);
    $('picaSave')?.addEventListener('click', save);
    $('picaOverlay')?.addEventListener('click', (e) => { if (e.target === $('picaOverlay')) closeForm(); });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  // Event: klik batang produk (delegation) + tutup detail
  const onBdChartClick = (e) => {
    const el = e.target.closest('[data-label]');
    if (!el) return;
    const label = el.getAttribute('data-label');
    if (label) showBdDetail(label);
  };
  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'bdDetailClose') {
      showBdDetail('');
      return;
    }
    const wrap = $('bdChartWrap') || $('bdChartSvg');
    if (wrap && wrap.contains(e.target)) onBdChartClick(e);
  });


  /**
   * Buka form Why-Why dari Issue Dashboard (atau sumber lain).
   * issue: { kind, date, shift, line, stage, key, produk, batch, problem, dur, freq, why1.., status, id }
   * onSaved: callback setelah simpan sukses
   */
  let onSavedCb = null;
  const openIssue = (issue, onSaved) => {
    if (!issue) return;
    onSavedCb = typeof onSaved === 'function' ? onSaved : null;
    const isMinor = issue.kind === 'minor';
    formMode = isMinor ? 'minor' : 'breakdown';
    current = {
      ...issue,
      date: String(issue.date || '').slice(0, 10),
      shift: issue.shift,
      line: String(issue.line ?? ''),
      stage: String(issue.stage || '').toLowerCase(),
      key: issue.key || '',
      produk: issue.produk || '',
      batch: issue.batch || '',
      problem: issue.problem || '',
      dur: issue.dur || 0,
      freq: issue.freq || 1,
      id: issue.id || '',
      kind: isMinor ? 'minor' : 'breakdown',
    };
    // pastikan metaCtx ikut line/stage issue agar save minor ke store yang benar
    metaCtx = { line: current.line, stage: current.stage };

    const mf = $('picaMinorFields');
    if (mf) mf.hidden = !isMinor;
    const title = $('picaModalTitle');
    if (title) {
      title.textContent = isMinor
        ? '✍️ Form Why-Why / PICA (Minor Stop)'
        : '✍️ Form Why-Why / PICA (Breakdown)';
    }
    const durTxt = isMinor
      ? ((current.freq || 1) + ' kali')
      : ((current.dur || 0) + ' mnt');
    if ($('picaCtx')) {
      $('picaCtx').innerHTML =
        `<div class="pica-ctx-row"><b>${esc(current.produk)}</b> · Batch ${esc(current.batch || '—')} · ${fmtD(current.date)} · S${esc(current.shift)} · Line ${esc(current.line)} · ${esc(current.stage)}</div>`
        + `<div class="pica-ctx-row">Problem: ${esc(current.problem)} (${durTxt})</div>`;
    }
    if (isMinor) {
      if ($('msProduk')) $('msProduk').value = current.produk || '';
      if ($('msBatch')) $('msBatch').value = current.batch || '';
      if ($('msProblem')) $('msProblem').value = current.problem || '';
      if ($('msFreq')) $('msFreq').value = String(current.freq || 1);
    }
    if ($('picaWhy1')) $('picaWhy1').value = issue.why1 || '';
    if ($('picaWhy2')) $('picaWhy2').value = issue.why2 || '';
    if ($('picaWhy3')) $('picaWhy3').value = issue.why3 || '';
    if ($('picaCorrective')) $('picaCorrective').value = issue.corrective || '';
    if ($('picaPreventive')) $('picaPreventive').value = issue.preventive || '';
    if ($('picaPic')) $('picaPic').value = issue.pic || '';
    if ($('picaStatus')) $('picaStatus').value = issue.status || 'Open';
    $('picaOverlay')?.classList.remove('hide');
    setTimeout(() => $('picaWhy1')?.focus(), 30);
  };

  return { render, openIssue };
})();