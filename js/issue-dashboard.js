/**
 * ISSUE-DASHBOARD.JS — Issue #16
 * Dashboard kumpulan issue (Breakdown PICA + Minor) di Weekly Meeting.
 * - Badge angka issue Open di sidebar
 * - Tab filter Open / Closed dengan indikator
 * - Tabel Open & Closed (kolom sama PICA)
 */
const IssueDashboard = (() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const MINOR_MAX_MIN = 10;
  const STAGES = ['filling', 'kemas'];
  const LINES = ['1', '2', '4'];

  let rawIssues = []; // full list sebelum filter UI
  let allIssues = []; // setelah filter Line/Tahapan/Shift/Mesin/Produk
  let filterTab = 'open'; // open | closed | all
  let pendingIssue = null;

  const esc = (s) => {
    if (typeof Utils !== 'undefined' && Utils.escapeHtml) return Utils.escapeHtml(String(s ?? ''));
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };
  const toNum = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (v == null || v === '') return 0;
    let s = String(v).replace('%', '').trim();
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };
  const fmtD = (iso) => {
    const s = String(iso || '');
    return s.length >= 10 ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : s;
  };
  const fmtShort = (iso) => {
    const s = String(iso || '');
    return s.length >= 10 ? s.slice(8, 10) + '/' + s.slice(5, 7) : s;
  };
  const statusCls = (s) => (s === 'Closed' ? 'st-closed' : s === 'On Progress' ? 'st-progress' : 'st-open');
  /** Label lokasi issue: "Filling · Line 1" (supaya jelas issue ada di mana) */
  const locLabel = (p) => {
    const st = String(p.stage || '').trim();
    const ln = String(p.line ?? '').trim();
    const stTxt = st ? st.charAt(0).toUpperCase() + st.slice(1) : '';
    const lnTxt = ln ? 'Line ' + ln : '';
    return [stTxt, lnTxt].filter(Boolean).join(' · ') || '—';
  };

  const cell = (v) => (v ? `<td>${esc(v)}</td>` : '<td class="pica-null"></td>');
  const isClosed = (s) => String(s || 'Open') === 'Closed';
  const say = (msg, err) => {
    const el = $('issueStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'oee-filter-status' + (err ? ' err' : '');
  };

  const rowKey = (x) => {
    const k = String(x.kode || '').trim();
    const m = String(x.mulai || '').trim();
    const s = String(x.selesai || '').trim();
    const keg = String(x.kegiatan || '').trim();
    return [k, m, s, keg].join('|');
  };

  const fullKey = (p) => [p.date, p.shift, p.line, p.stage, p.key].join('|');

  /** BN dari master produk, bukan WO */
  const batchOf = (prodName, pr) => {
    const toks = String(prodName || '').trim().split(/\s+/);
    if (toks.length >= 2) return toks.slice(1).join(' ');
    const code = toks[0] || '';
    for (const h of [1, 2, 3]) {
      const nm = String(pr['p' + h + 'Name'] || '').trim();
      const bn = String(pr['p' + h + 'Bn'] || '').trim();
      if (nm && (code === nm || prodName === nm || String(prodName).startsWith(nm))) {
        return bn || '';
      }
    }
    return '';
  };

  const collectBreakdown = (records) => {
    const out = [];
    const unplanned = (typeof CONFIG !== 'undefined' && CONFIG.UNPLANNED_CODES)
      ? CONFIG.UNPLANNED_CODES : new Set([3, 4, 5, 6, 7, 8, 9]);
    records.forEach((r) => {
      const rows = Array.isArray(r.payload?.rows) ? r.payload.rows : [];
      const pr = r.payload?.products || {};
      rows.forEach((x) => {
        const k = parseInt(String(x.kode ?? '').trim(), 10);
        if (!unplanned.has(k)) return;
        const s = typeof Utils !== 'undefined' ? Utils.parseTime(x.mulai) : null;
        const e = typeof Utils !== 'undefined' ? Utils.parseTime(x.selesai) : null;
        const d = s != null && e != null ? (e - s + 1440) % 1440 : (toNum(x.durasi) || 0);
        if (!(d > MINOR_MAX_MIN)) return;
        const prodName = String(x.batch || '').trim();
        const toks = prodName.split(/\s+/);
        const kegiatan = String(x.kegiatan || '').trim();
        const masalah = String(x.masalah || '').trim();
        const problem = masalah || kegiatan || '(tanpa keterangan)';
        out.push({
          date: String(r.date || '').slice(0, 10),
          shift: r.shift,
          line: String(r.line ?? ''),
          stage: String(r.tahapan || '').toLowerCase(),
          key: rowKey(x),
          produk: toks[0] || prodName || '—',
          batch: batchOf(prodName, pr),
          problem,
          dur: d,
          freq: 1,
          kind: 'breakdown',
        });
      });
    });
    return out;
  };

  const collectMinor = (records) => {
    const map = new Map();
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
        const produk = toks[0] || prodName || '—';
        const batch = batchOf(prodName, pr);
        const id = [produk, batch, problem, r.line, r.tahapan].join('|');
        if (!map.has(id)) {
          map.set(id, {
            id: 'ms_' + id,
            date: String(r.date || '').slice(0, 10),
            shift: r.shift != null ? String(r.shift) : '',
            line: String(r.line ?? ''),
            stage: String(r.tahapan || '').toLowerCase(),
            key: id,
            produk, batch, problem,
            dur: 0,
            freq: 0,
            kind: 'minor',
          });
        }
        const entry = map.get(id);
        entry.freq += freq;
        const sh = r.shift != null ? String(r.shift) : '';
        if (sh) {
          if (!entry.shift) entry.shift = sh;
          else {
            const parts = String(entry.shift).split(',').map((s) => s.trim()).filter(Boolean);
            if (!parts.includes(sh)) entry.shift = parts.concat(sh).join(',');
          }
        }
      });
    });
    return Array.from(map.values());
  };

  const loadAnalysis = async (from, to) => {
    const client = typeof SupabaseClient !== 'undefined' ? SupabaseClient.getClient() : null;
    if (!client) return {};
    const out = {};
    for (let i = 0; i < 40; i++) {
      const { data, error } = await client.from('pica_analysis').select('*')
        .gte('rec_date', from).lte('rec_date', to)
        .range(i * 1000, i * 1000 + 999);
      if (error) throw error;
      (data || []).forEach((d) => {
        const k = [d.rec_date, d.shift, d.line, d.tahapan, d.row_key].join('|');
        out[k] = d;
      });
      if (!data || data.length < 1000) break;
    }
    return out;
  };

  /** Why-Why minor di localStorage (semua line/stage) */
  const loadMinorLocals = () => {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith('tkl_minor_v1_')) continue;
        const arr = JSON.parse(localStorage.getItem(k) || '[]');
        if (!Array.isArray(arr)) continue;
        arr.forEach((x) => {
          const id = x.id || [x.produk, x.batch, x.problem].join('|');
          out[id] = x;
        });
      }
    } catch (_) {}
    return out;
  };

  const fetchRows = async (from, to) => {
    const client = typeof SupabaseClient !== 'undefined' ? SupabaseClient.getClient() : null;
    if (!client) throw new Error('Supabase belum terhubung');
    const out = [];
    for (let i = 0; i < 40; i++) {
      const { data, error } = await client.from(CONFIG.DB_TABLE)
        .select('date,shift,line,tahapan,payload,key')
        .in('tahapan', STAGES)
        .in('line', LINES)
        .gte('date', from).lte('date', to)
        .order('date', { ascending: true })
        .range(i * 1000, i * 1000 + 999);
      if (error) throw error;
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return out;
  };

  const mergeIssues = (bd, ms, analysis, minorLocal) => {
    const list = [];
    bd.forEach((p) => {
      const a = analysis[fullKey(p)] || {};
      list.push({
        ...p,
        why1: a.why1 || '', why2: a.why2 || '', why3: a.why3 || '',
        corrective: a.corrective || '', preventive: a.preventive || '',
        pic: a.pic || '',
        status: a.status || 'Open',
        durLabel: (p.dur || 0) + '',
      });
    });
    ms.forEach((p) => {
      const loc = minorLocal[p.id] || minorLocal[[p.produk, p.batch, p.problem].join('|')] || {};
      list.push({
        ...p,
        why1: loc.why1 || '', why2: loc.why2 || '', why3: loc.why3 || '',
        corrective: loc.corrective || '', preventive: loc.preventive || '',
        pic: loc.pic || '',
        status: loc.status || 'Open',
        durLabel: p.freq ? (p.freq + '×') : '—',
      });
    });
    list.sort((a, b) =>
      (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) ||
      (Number(b.shift) - Number(a.shift)) ||
      String(a.line).localeCompare(String(b.line))
    );
    return list;
  };


  const getFilters = () => ({
    line: ($('issueLine')?.value || '').trim(),
    stage: ($('issueStage')?.value || '').trim().toLowerCase(),
    shift: ($('issueShift')?.value || 'all').trim(),
    mesin: ($('issueMesin')?.value || '').trim(),
    produk: ($('issueProduk')?.value || '').trim().toUpperCase(),
  });

  /** Filter issue by Line, Tahapan, Shift, Mesin, Produk */
  const applyFilters = (list) => {
    const f = getFilters();
    let stage = f.stage;
    let line = f.line;
    // Mesin mengunci tahapan + line
    if (f.mesin && f.mesin.includes('|')) {
      const [st, ln] = f.mesin.split('|');
      stage = (st || '').toLowerCase();
      line = String(ln || '');
    }
    return list.filter((p) => {
      if (line && String(p.line) !== line) return false;
      if (stage && String(p.stage || '').toLowerCase() !== stage) return false;
      if (f.shift && f.shift !== 'all') {
        const sh = String(p.shift || '');
        // minor bisa "1,2"
        if (sh.includes(',')) {
          if (!sh.split(',').map((x) => x.trim()).includes(f.shift)) return false;
        } else if (sh !== f.shift) return false;
      }
      if (f.produk) {
        const code = String(p.produk || '').trim().toUpperCase().split(/\s+/)[0];
        if (code !== f.produk) return false;
      }
      return true;
    });
  };

  const populateProduk = (list) => {
    const sel = $('issueProduk');
    if (!sel) return;
    const cur = sel.value;
    const codes = [...new Set(list.map((p) => String(p.produk || '').trim().split(/\s+/)[0]).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    sel.innerHTML = '<option value="">Semua produk</option>' +
      codes.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    if (cur && codes.includes(cur)) sel.value = cur;
  };

  const refilter = () => {
    allIssues = applyFilters(rawIssues);
    render();
    const c = counts();
    const f = getFilters();
    const bits = [];
    if (f.mesin) bits.push(f.mesin.replace('|', ' L'));
    else {
      if (f.stage) bits.push(f.stage);
      if (f.line) bits.push('L' + f.line);
    }
    if (f.shift && f.shift !== 'all') bits.push('S' + f.shift);
    if (f.produk) bits.push(f.produk);
    const extra = bits.length ? ' · ' + bits.join(' · ') : '';
    say(`✓ ${c.total} issue · Open ${c.open} · Closed ${c.closed}${extra}`);
  };

  const counts = () => {
    let open = 0, closed = 0;
    allIssues.forEach((p) => {
      if (isClosed(p.status)) closed++;
      else open++;
    });
    return { open, closed, total: allIssues.length };
  };

  const updateBadges = () => {
    const c = counts();
    const set = (id, n) => {
      const el = $(id);
      if (!el) return;
      el.textContent = String(n);
      el.hidden = false;
    };
    set('issueOpenBadge', c.open);
    set('issueTabOpenCount', c.open);
    set('issueTabClosedCount', c.closed);
    set('issueOpenTotal', c.open);
    set('issueClosedTotal', c.closed);
    // hide badge on nav if 0
    const nav = $('issueOpenBadge');
    if (nav) nav.style.display = c.open > 0 ? '' : 'none';
  };

  const filtered = () => {
    if (filterTab === 'closed') return allIssues.filter((p) => isClosed(p.status));
    if (filterTab === 'open') return allIssues.filter((p) => !isClosed(p.status));
    return allIssues;
  };

  const renderTable = (bodyId, rows, emptyMsg) => {
    const body = $(bodyId);
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="15">${esc(emptyMsg)}</td></tr>`;
      return;
    }
    body.innerHTML = rows.map((p, i) => {
      const tip = `Klik untuk aksi: log sheet / form Why-Why`;
      const ikey = esc([p.kind, p.date, p.shift, p.line, p.stage, p.key || p.id || ''].join('||'));
      return `<tr class="issue-row" data-ikey="${ikey}" data-date="${esc(p.date)}" data-shift="${esc(p.shift)}" data-line="${esc(p.line)}" data-stage="${esc(p.stage)}" title="${esc(tip)}">
        <td class="ctr">${i + 1}.</td>
        <td class="mono">${esc(fmtShort(p.date))}</td>
        <td class="ctr mono">${esc(p.shift != null && p.shift !== '' ? p.shift : '—')}</td>
        <td>${esc(p.produk)}</td>
        <td class="mono">${esc(p.batch || '—')}</td>
        <td class="ctr">${esc(locLabel(p))}</td>
        <td class="pica-problem">${esc(p.problem)}${p.kind === 'minor' ? ' <small class="issue-kind">MS</small>' : ''}</td>
        <td class="ctr">${esc(p.durLabel)}</td>
        ${cell(p.why1)}${cell(p.why2)}${cell(p.why3)}
        ${cell(p.corrective)}${cell(p.preventive)}${cell(p.pic)}
        <td><span class="pica-status ${statusCls(p.status)}">${esc(p.status || 'Open')}</span></td>
      </tr>`;
    }).join('');
  };

  const render = () => {
    const openRows = allIssues.filter((p) => !isClosed(p.status));
    const closedRows = allIssues.filter((p) => isClosed(p.status));
    updateBadges();

    // Panel visibility by tab
    const openPanel = $('issuePanelOpen');
    const closedPanel = $('issuePanelClosed');
    if (filterTab === 'open') {
      if (openPanel) openPanel.hidden = false;
      if (closedPanel) closedPanel.hidden = true;
      renderTable('issueOpenBody', openRows, 'Tidak ada issue Open pada rentang ini.');
    } else if (filterTab === 'closed') {
      if (openPanel) openPanel.hidden = true;
      if (closedPanel) closedPanel.hidden = false;
      renderTable('issueClosedBody', closedRows, 'Belum ada issue Closed.');
    } else {
      if (openPanel) openPanel.hidden = false;
      if (closedPanel) closedPanel.hidden = false;
      renderTable('issueOpenBody', openRows, 'Tidak ada issue Open.');
      renderTable('issueClosedBody', closedRows, 'Belum ada issue Closed.');
    }

    document.querySelectorAll('.issue-tab').forEach((b) => {
      b.classList.toggle('is-on', b.dataset.issueTab === filterTab);
    });
  };

  const load = async () => {
    const from = $('issueFrom')?.value;
    const to = $('issueTo')?.value;
    if (!from || !to) return say('Isi rentang tanggal.', true);
    if (from > to) return say('Tanggal awal tidak boleh > tanggal akhir.', true);
    say('Memuat issue…');
    try {
      const records = await fetchRows(from, to);
      const bd = collectBreakdown(records);
      const ms = collectMinor(records);
      const analysis = await loadAnalysis(from, to);
      const minorLocal = loadMinorLocals();
      rawIssues = mergeIssues(bd, ms, analysis, minorLocal);
      populateProduk(rawIssues);
      allIssues = applyFilters(rawIssues);
      render();
      const c = counts();
      say(`✓ ${c.total} issue · Open ${c.open} · Closed ${c.closed} · dari ${records.length} record (mentah ${rawIssues.length})`);
    } catch (e) {
      console.warn(e);
      say('Gagal memuat: ' + (e.message || e), true);
    }
  };

  const defaultDates = () => {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - 13);
    const iso = (d) => d.toISOString().slice(0, 10);
    if ($('issueFrom') && !$('issueFrom').value) $('issueFrom').value = iso(from);
    if ($('issueTo') && !$('issueTo').value) $('issueTo').value = iso(to);
  };

  const findIssueByIkey = (ikey) => {
    if (!ikey) return null;
    return allIssues.find((p) =>
      [p.kind, p.date, p.shift, p.line, p.stage, p.key || p.id || ''].join('||') === ikey
    ) || null;
  };

  const hideActionMenu = () => {
    const m = $('issueActionMenu');
    if (m) m.classList.add('hide');
    // jangan null-kan pendingIssue di sini jika dipanggil setelah salin ref;
    // caller yang meng-clear bila perlu
  };

  const clearPending = () => { pendingIssue = null; };

  const showActionMenu = (tr, clientX, clientY) => {
    const issue = findIssueByIkey(tr?.dataset?.ikey);
    if (!issue) {
      console.warn('IssueDashboard: issue tidak ditemukan untuk baris', tr?.dataset?.ikey);
      return;
    }
    pendingIssue = issue;
    const m = $('issueActionMenu');
    if (!m) {
      console.warn('IssueDashboard: #issueActionMenu tidak ada di HTML');
      return;
    }
    const prodBatch = [issue.produk || '—', issue.batch || ''].filter(Boolean).join(' ').trim();
    const title = $('issueActionTitle');
    if (title) {
      // Format: VTTS1 L030210 · Main drive tidak bisa berjalan
      title.textContent = prodBatch + ' · ' + String(issue.problem || '').slice(0, 60);
    }
    const sub = $('issueActionSub');
    if (sub) {
      sub.textContent = fmtD(issue.date) + ' · S' + (issue.shift || '—')
        + ' · L' + (issue.line || '—') + ' · ' + (issue.stage || '')
        + ' · ' + (issue.kind === 'minor' ? 'Minor' : 'Breakdown')
        + ' · ' + (issue.status || 'Open');
    }
    m.classList.remove('hide');
    const pad = 8;
    let left = (clientX || 40);
    let top = (clientY || 80);
    // ukur setelah tampil
    const w = m.offsetWidth || 280;
    const h = m.offsetHeight || 180;
    if (left + w > window.innerWidth - pad) left = window.innerWidth - w - pad;
    if (top + h > window.innerHeight - pad) top = window.innerHeight - h - pad;
    m.style.left = Math.max(pad, left) + 'px';
    m.style.top = Math.max(pad, top) + 'px';
  };

  const openLogSheet = (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const issue = pendingIssue;
    hideActionMenu();
    clearPending();
    if (!issue?.date) {
      if (typeof UI !== 'undefined' && UI.toast) UI.toast('⚠ Data tanggal issue kosong', true);
      return;
    }
    if (typeof UI !== 'undefined' && UI.openRecord) {
      UI.openRecord({
        date: String(issue.date),
        shift: String(issue.shift || 1),
        line: String(issue.line || ''),
        stage: String(issue.stage || ''),
      });
    } else if (typeof UI !== 'undefined' && UI.toast) {
      UI.toast('⚠ UI.openRecord tidak tersedia', true);
    }
  };

  const openWhyWhy = (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const issue = pendingIssue;
    hideActionMenu();
    // pendingIssue tetap dipakai oleh form; clear setelah form dibuka
    if (!issue) {
      if (typeof UI !== 'undefined' && UI.toast) UI.toast('⚠ Issue tidak dipilih', true);
      return;
    }
    clearPending();
    if (typeof Pica === 'undefined' || typeof Pica.openIssue !== 'function') {
      if (typeof UI !== 'undefined' && UI.toast) UI.toast('⚠ Form PICA tidak tersedia (Pica.openIssue)', true);
      console.warn('Pica.openIssue missing', typeof Pica);
      return;
    }
    Pica.openIssue(issue, () => { load(); });
  };

  const openRow = (tr, ev) => {
    if (!tr?.dataset?.date) return;
    if (ev) { ev.preventDefault(); ev.stopPropagation(); }
    showActionMenu(tr, ev?.clientX, ev?.clientY);
  };

  const open = () => {
    defaultDates();
    if (!allIssues.length) load();
    else render();
  };

  /** Refresh badge saja (dipakai saat buka weekly) */
  const refreshBadge = async () => {
    try {
      defaultDates();
      const from = $('issueFrom')?.value;
      const to = $('issueTo')?.value;
      if (!from || !to) return;
      const records = await fetchRows(from, to);
      const bd = collectBreakdown(records);
      const ms = collectMinor(records);
      const analysis = await loadAnalysis(from, to);
      const minorLocal = loadMinorLocals();
      rawIssues = mergeIssues(bd, ms, analysis, minorLocal);
      populateProduk(rawIssues);
      allIssues = applyFilters(rawIssues);
      updateBadges();
    } catch (_) {}
  };

  const bind = () => {
    $('issueApply')?.addEventListener('click', load);
    $('issueReset')?.addEventListener('click', () => {
      if ($('issueFrom')) $('issueFrom').value = '';
      if ($('issueTo')) $('issueTo').value = '';
      if ($('issueLine')) $('issueLine').value = '';
      if ($('issueStage')) $('issueStage').value = '';
      if ($('issueShift')) $('issueShift').value = 'all';
      if ($('issueMesin')) $('issueMesin').value = '';
      if ($('issueProduk')) $('issueProduk').value = '';
      defaultDates();
      load();
    });
    document.querySelectorAll('.issue-tab').forEach((b) => {
      b.addEventListener('click', () => {
        filterTab = b.dataset.issueTab || 'open';
        render();
      });
    });
    ['issueLine', 'issueStage', 'issueShift', 'issueMesin', 'issueProduk'].forEach((id) => {
      $(id)?.addEventListener('change', () => {
        if (!rawIssues.length) return;
        if (id === 'issueMesin') {
          const v = $('issueMesin')?.value || '';
          if (v.includes('|')) {
            const [st, ln] = v.split('|');
            if ($('issueStage')) $('issueStage').value = st || '';
            if ($('issueLine')) $('issueLine').value = ln || '';
          }
        }
        refilter();
      });
    });
    $('issueOpenBody')?.addEventListener('click', (e) => {
      const tr = e.target.closest('tr.issue-row');
      if (tr) openRow(tr, e);
    });
    $('issueClosedBody')?.addEventListener('click', (e) => {
      const tr = e.target.closest('tr.issue-row');
      if (tr) openRow(tr, e);
    });

    // Tombol menu aksi — bind langsung + stopPropagation
    const menu = $('issueActionMenu');
    if (menu) {
      menu.addEventListener('click', (e) => e.stopPropagation());
      menu.addEventListener('mousedown', (e) => e.stopPropagation());
    }
    $('issueActionLog')?.addEventListener('click', openLogSheet);
    $('issueActionWhy')?.addEventListener('click', openWhyWhy);
    $('issueActionCancel')?.addEventListener('click', (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      hideActionMenu();
      clearPending();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { hideActionMenu(); clearPending(); }
    });
    // tutup menu jika klik di luar (pakai click, setelah button handlers)
    document.addEventListener('click', (e) => {
      const m = $('issueActionMenu');
      if (!m || m.classList.contains('hide')) return;
      if (m.contains(e.target)) return;
      if (e.target.closest && e.target.closest('tr.issue-row')) return;
      hideActionMenu();
      clearPending();
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  return { open, load, refreshBadge, updateBadges };
})();
