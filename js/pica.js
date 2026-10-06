/**
 * PICA.JS — Tabel PICA Problem + Form Why-Why di Dashboard Weekly.
 * Problem/Produk/Batch/Durasi ditarik otomatis dari baris UNPLANNED (kode 1,3,4,9).
 * Why1–3, Corrective, Preventive, PIC, Status disimpan ke Supabase `pica_analysis`.
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
  let list = [], analysis = {}, current = null, seq = 0;
  const rowKey = (x) => [x.kode, x.mulai, x.selesai].map((v) => String(v ?? '').trim()).join('|');
  const fullKey = (p) => [p.date, p.shift, p.line, p.stage, p.key].join('|');

  // ===== Kumpulkan problem dari record log sheet =====
  const collect = (records) => {
    const out = [];
    records.forEach((r) => {
      const rows = Array.isArray(r.payload?.rows) ? r.payload.rows : [];
      const pr = r.payload?.products || {};
      const head = [1, 2, 3].map((i) => ({ name: String(pr['p' + i + 'Name'] || '').trim(), wo: String(pr['p' + i + 'Wo'] || '').trim() }));
      rows.forEach((x) => {
        const k = parseInt(String(x.kode ?? '').trim(), 10);
        if (!CONFIG.UNPLANNED_CODES.has(k)) return;
        const s = Utils.parseTime(x.mulai), e = Utils.parseTime(x.selesai);
        const d = s != null && e != null ? (e - s + 1440) % 1440 : (toNum(x.durasi) || 0);
        const prodName = String(x.batch || '').trim();
        const toks = prodName.split(/\s+/);
        out.push({
          key: rowKey(x),
          date: String(r.date), shift: Number(r.shift) || 1, line: String(r.line), stage: String(r.tahapan),
          produk: (toks[0] || '—').toUpperCase(),
          batch: (String(x.wo || '').trim() || head.find((h) => h.name && h.name === prodName)?.wo || toks[1] || '').toUpperCase(),
          problem: String(x.kegiatan || '').trim() || String(x.masalah || '').trim() || '(tanpa keterangan)',
          sebab: String(x.masalah || '').trim(),
          tindakan: String(x.disposisi || '').trim(),
          dur: d
        });
      });
    });
    return out.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : a.shift > b.shift ? -1 : 1));
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
  const cell = (v) => (v ? `<td>${esc(v)}</td>` : '<td class="pica-null">null</td>');

  const renderTable = () => {
    const body = $('picaBody');
    if (!body) return;
    if (!list.length) { body.innerHTML = '<tr><td colspan="13">Tidak ada problem unplanned pada rentang ini.</td></tr>'; return; }
    body.innerHTML = list.map((p, i) => {
      const a = analysis[fullKey(p)];
      return `<tr><td class="ctr">${i + 1}.</td>`
        + `<td><button type="button" class="pica-link" data-i="${i}" title="Buka log sheet: ${fmtD(p.date)} · S${p.shift} · Line ${p.line} · ${esc(p.stage)}">${esc(p.produk)}</button></td>`
        + `<td class="mono">${esc(p.batch || '—')}</td><td class="pica-problem">${esc(p.problem)}</td>`
        + `<td class="ctr">${p.dur || 0}</td>`
        + cell(a?.why1) + cell(a?.why2) + cell(a?.why3) + cell(a?.corrective) + cell(a?.preventive) + cell(a?.pic)
        + `<td><span class="pica-status ${statusCls(a?.status)}">${esc(a?.status || 'Open')}</span></td>`
        + `<td class="ctr"><button type="button" class="btn btn-ghost btn-sm pica-edit" data-i="${i}" title="Isi / ubah Why-Why">✍️</button></td></tr>`;
    }).join('');
  };

  // ===== Modal form =====
  const closeForm = () => $('picaOverlay')?.classList.add('hide');
  const openForm = (i) => {
    const p = list[i];
    if (!p) return;
    current = p;
    const a = analysis[fullKey(p)];
    $('picaCtx').innerHTML =
      `<div class="pica-ctx-row"><b>${esc(p.produk)}</b> · Batch ${esc(p.batch || '—')} · ${fmtD(p.date)} · S${p.shift} · Line ${p.line} · ${esc(p.stage)}</div>`
      + `<div class="pica-ctx-row">Problem: ${esc(p.problem)} (${p.dur || 0} mnt)</div>`;
    $('picaWhy1').value = a?.why1 ?? p.sebab;
    $('picaWhy2').value = a?.why2 ?? '';
    $('picaWhy3').value = a?.why3 ?? '';
    $('picaCorrective').value = a?.corrective ?? p.tindakan;
    $('picaPreventive').value = a?.preventive ?? '';
    $('picaPic').value = a?.pic ?? '';
    $('picaStatus').value = a?.status || 'Open';
    $('picaOverlay').classList.remove('hide');
    setTimeout(() => $('picaWhy1')?.focus(), 30);
  };

  const save = async () => {
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
        pic: $('picaPic').value.trim(), status: $('picaStatus').value,
        updated_at: new Date().toISOString()
      };
      const { error } = await c.from('pica_analysis').upsert(rec, { onConflict: 'rec_date,shift,line,tahapan,row_key' });
      if (error) throw error;
      analysis[fullKey(p)] = rec;
      renderTable(); closeForm();
      if (typeof UI !== 'undefined' && UI.toast) UI.toast('✓ Analisis PICA tersimpan');
    } catch (e) {
      console.warn('PICA save error:', e);
      if (typeof UI !== 'undefined' && UI.toast) UI.toast('⚠ Gagal menyimpan: ' + (e.message || e));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Simpan'; }
    }
  };

  // ===== Dipanggil weekly-dashboard setiap halaman mesin dirender =====
  const render = async (records, meta, from, to) => {
    const t = $('picaTitle');
    if (t) t.textContent = `PICA Problem OEE ${meta.stage.charAt(0).toUpperCase() + meta.stage.slice(1)} - Line ${meta.line}`;
    const st = $('picaStatusMsg');
    const say = (m, err) => { if (st) { st.textContent = m; st.className = 'oee-filter-status' + (err ? ' err' : ''); } };
    list = collect(records);
    renderTable();
    const my = ++seq;
    try {
      analysis = await loadAnalysis(from, to, meta);
      if (my !== seq) return;
      renderTable();
      const filled = list.filter((p) => analysis[fullKey(p)]).length;
      say(`✓ ${list.length} problem · ${filled} sudah diisi analisis`);
    } catch (e) {
      console.warn('PICA load error:', e);
      say('⚠ Gagal memuat analisis PICA: ' + (e.message || e), true);
    }
  };

  // ===== Bind sekali =====
  const bind = () => {
    $('picaBody')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.pica-edit');
      if (btn) { openForm(Number(btn.dataset.i)); return; }
      const lk = e.target.closest('.pica-link');
      if (lk) {
        const p = list[Number(lk.dataset.i)];
        if (p && typeof UI !== 'undefined' && UI.openRecord) {
          UI.openRecord({ date: p.date, shift: p.shift, line: p.line, stage: p.stage });
        }
      }
    });
    $('picaClose')?.addEventListener('click', closeForm);
    $('picaCancel')?.addEventListener('click', closeForm);
    $('picaSave')?.addEventListener('click', save);
    $('picaOverlay')?.addEventListener('click', (e) => { if (e.target === $('picaOverlay')) closeForm(); });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  return { render };
})();
