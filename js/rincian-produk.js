/**
 * RINCIAN-PRODUK.JS — Issue #14
 * Dashboard rekap kegiatan + perhitungan per produk.
 * - Tabel detail kegiatan (format backup Google Sheet)
 * - Tabel rekap per produk (Time Available, E, C, breakdown, output)
 * - Unduh Excel: sheet "Line 1", "Line 2", "Line 4" + "all proses produk"
 */
const RincianProduk = (() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const LINES = ['1', '2', '4'];
  const STAGES = ['filling', 'kemas', 'mixing', 'steril', 'visual'];

  let raw = [];
  let detailRows = [];
  let summaryRows = [];
  let batchRows = [];

  const num = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (v == null || v === '') return 0;
    let s = String(v).replace('%', '').trim();
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };
  const esc = (s) => (typeof Utils !== 'undefined' && Utils.escapeHtml
    ? Utils.escapeHtml(String(s ?? ''))
    : String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const fmtD = (iso) => {
    const s = String(iso || '');
    return s.length >= 10 ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : s;
  };
  const say = (msg, err) => {
    const el = $('rpStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'oee-filter-status' + (err ? ' err' : '');
  };

  const slotsOf = (products) => {
    const p = products || {};
    return [1, 2, 3].map((i) => {
      const name = String(p['p' + i + 'Name'] || '').trim();
      const bn = String(p['p' + i + 'Bn'] || '').trim();
      return {
        name,
        bn,
        wo: String(p['p' + i + 'Wo'] || '').trim(),
        label: name ? (bn ? name + ' ' + bn : name) : '',
        rate: num(p['p' + i + 'Rate']),
      };
    });
  };

  /** Ambil kode produk + nomor BATCH (BN), bukan No. WO. */
  const parseProd = (batchVal, slots) => {
    const raw = String(batchVal || '').trim();
    if (!raw) return { produk: '', batch: '' };
    const toks = raw.split(/\s+/);
    const code = toks[0] || '';
    let batch = toks.slice(1).join(' '); // sisa label baris = BN bila format "KODE BN"
    if (!batch) {
      for (const s of slots) {
        if (!s.name) continue;
        if (raw === s.name || raw.startsWith(s.name + ' ') || raw.toUpperCase() === s.name.toUpperCase()) {
          // Prioritas: BN master produk; fallback potongan label "KODE BN"
          batch = String(s.bn || '').trim();
          if (!batch && s.label) batch = String(s.label).split(/\s+/).slice(1).join(' ');
          break;
        }
      }
    }
    return { produk: code, batch };
  };

  const durOf = (x) => {
    if (typeof Utils !== 'undefined' && Utils.parseTime) {
      const s = Utils.parseTime(x.mulai), e = Utils.parseTime(x.selesai);
      if (s != null && e != null) return (e - s + 1440) % 1440;
    }
    return num(x.durasi);
  };

  /** Baris detail kegiatan — format issue #14 */
  const buildDetail = (recs) => {
    const out = [];
    recs.forEach((r) => {
      const pay = r.payload || {};
      const rows = Array.isArray(pay.rows) ? pay.rows : [];
      const slots = slotsOf(pay.products);
      const op = String(pay.operator || pay.inisial || r.inisial_operator || '').trim();
      rows.forEach((x) => {
        const { produk, batch } = parseProd(x.batch, slots);
        out.push({
          produk: produk || '—',
          batch: batch || '—',
          tgl: String(r.date || '').slice(0, 10),
          shift: r.shift,
          tahapan: String(r.tahapan || '').toLowerCase(),
          line: String(r.line ?? ''),
          mulai: String(x.mulai || '').trim(),
          selesai: String(x.selesai || '').trim(),
          kegiatan: String(x.kegiatan || x.masalah || '').trim(),
          durasi: durOf(x),
          masalah: String(x.masalah || '').trim(),
          good: num(x.good),
          defect: num(x.defect),
          operator: op || String(x.op || '').trim() || '—',
          kode: String(x.kode || '').trim(),
        });
      });
    });
    out.sort((a, b) =>
      (a.tgl < b.tgl ? -1 : a.tgl > b.tgl ? 1 : 0) ||
      (String(a.line).localeCompare(String(b.line))) ||
      (Number(a.shift) - Number(b.shift)) ||
      (a.mulai < b.mulai ? -1 : a.mulai > b.mulai ? 1 : 0)
    );
    return out;
  };

  /**
   * Rekap per produk × tanggal × shift × line × tahapan
   * Kolom: Time Available, Waktu Produksi Terencana (C), breakdown unplanned (D),
   * Waktu Operasional (E), standart output, good, defect
   */
  const buildSummary = (recs) => {
    const out = [];
    recs.forEach((r) => {
      if (typeof WeeklyCalc === 'undefined') return;
      const re = WeeklyCalc.recompute(r);
      const slots = re.slots || [];
      slots.forEach((s, i) => {
        if (!s.label && !s.name) return;
        const st = re.perSlot[i];
        if (!st || !st.active) return;
        const code = String(s.name || (s.label || '').split(/\s+/)[0] || '').trim();
        // Nomor batch = BN (bukan No. WO). Dari field bn / label "KODE BN" / baris produksi.
        let bn = String(s.bn || '').trim()
          || String(s.label || '').split(/\s+/).slice(1).join(' ').trim();
        const rate = st.rate || s.rate || 0;
        const actual = st.actual || 0;
        // good/defect + BN dari baris produksi yang match slot
        let good = 0, defect = 0;
        (re.info || []).forEach((inf) => {
          if (inf.cat !== 'prod' || !inf.inShift) return;
          const lab = typeof WeeklyCalc.rowLabel === 'function'
            ? WeeklyCalc.rowLabel(inf.x, slots)
            : String(inf.x.batch || '');
          if (typeof WeeklyCalc.matches === 'function') {
            if (!WeeklyCalc.matches(lab, s.label || code)) return;
          } else if (code && !String(lab).toUpperCase().startsWith(code.toUpperCase())) return;
          good += inf.g; defect += inf.d;
          if (!bn) {
            const toks = String(lab || '').trim().split(/\s+/);
            if (toks.length >= 2) bn = toks.slice(1).join(' ');
          }
        });
        out.push({
          produk: code || '—',
          batch: bn || '—',
          tgl: String(r.date || '').slice(0, 10),
          shift: r.shift,
          line: String(r.line ?? ''),
          tahapan: String(r.tahapan || '').toLowerCase(),
          timeAvailable: re.availBase,
          waktuProduksiTerencana: re.C,
          breakdownUnplanned: re.D,
          waktuOperasional: re.E,
          standartOutput: Math.round(rate * re.E),
          good,
          defect,
          rate,
        });
      });
    });
    out.sort((a, b) =>
      (a.tgl < b.tgl ? -1 : a.tgl > b.tgl ? 1 : 0) ||
      a.produk.localeCompare(b.produk) ||
      (Number(a.shift) - Number(b.shift))
    );
    return out;
  };

  const fetchRows = async (from, to) => {
    const client = typeof SupabaseClient !== 'undefined' ? SupabaseClient.getClient() : null;
    if (!client) throw new Error('Supabase belum terhubung');
    const out = [];
    for (let i = 0; i < 40; i++) {
      const { data, error } = await client.from(CONFIG.DB_TABLE)
        .select('date,shift,line,tahapan,payload,inisial_operator,key')
        .gte('date', from).lte('date', to)
        .order('date', { ascending: true })
        .order('key', { ascending: true })
        .range(i * 1000, i * 1000 + 999);
      if (error) throw error;
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return out;
  };

  const filterLocal = (recs) => {
    const line = $('rpLine')?.value || '';
    const stage = $('rpStage')?.value || '';
    const shift = $('rpShift')?.value || 'all';
    return recs.filter((r) => {
      if (line && String(r.line) !== line) return false;
      if (stage && String(r.tahapan || '').toLowerCase() !== stage) return false;
      if (shift !== 'all' && String(r.shift) !== shift) return false;
      return true;
    });
  };

  const renderDetailTable = (rows) => {
    const body = $('rpDetailBody');
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="14">Tidak ada data kegiatan pada filter ini.</td></tr>';
      return;
    }
    const max = 500;
    const slice = rows.slice(0, max);
    body.innerHTML = slice.map((r) => `<tr>
      <td>${esc(r.produk)}</td>
      <td class="mono">${esc(r.batch)}</td>
      <td class="mono">${esc(fmtD(r.tgl))}</td>
      <td class="ctr">${esc(r.shift)}</td>
      <td>${esc(r.tahapan)}</td>
      <td class="ctr">${esc(r.line)}</td>
      <td class="mono">${esc(r.mulai)}</td>
      <td class="mono">${esc(r.selesai)}</td>
      <td>${esc(r.kegiatan)}</td>
      <td class="ctr">${r.durasi || ''}</td>
      <td>${esc(r.masalah)}</td>
      <td class="ctr">${r.good || ''}</td>
      <td class="ctr">${r.defect || ''}</td>
      <td>${esc(r.operator)}</td>
    </tr>`).join('');
    if (rows.length > max) {
      body.innerHTML += `<tr><td colspan="14"><i>Menampilkan ${max} dari ${rows.length} baris — unduh Excel untuk data lengkap.</i></td></tr>`;
    }
  };


  /** Format rentang tanggal: 01/10/2026 atau 01/10–02/10/2026 */
  const fmtDateRange = (dates) => {
    const uniq = [...new Set((dates || []).filter(Boolean))].sort();
    if (!uniq.length) return '—';
    const short = (iso) => {
      const s = String(iso);
      return s.length >= 10 ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(2, 4) : s;
    };
    if (uniq.length === 1) return short(uniq[0]);
    return short(uniq[0]) + '–' + short(uniq[uniq.length - 1]);
  };

  /**
   * Gabung baris rekap per batch yang sama (Produk+Batch+Line+Tahapan),
   * lintas shift & tanggal. TGL = rentang bila beda hari.
   */
  const aggregateByBatch = (rows) => {
    const map = new Map();
    rows.forEach((r) => {
      const key = [r.produk, r.batch, r.line, r.tahapan].join('|');
      if (!map.has(key)) {
        map.set(key, {
          produk: r.produk,
          batch: r.batch,
          line: r.line,
          tahapan: r.tahapan,
          dates: [],
          timeAvailable: 0,
          waktuProduksiTerencana: 0,
          breakdownUnplanned: 0,
          waktuOperasional: 0,
          standartOutput: 0,
          good: 0,
          defect: 0,
        });
      }
      const e = map.get(key);
      if (r.tgl) e.dates.push(r.tgl);
      e.timeAvailable += Number(r.timeAvailable) || 0;
      e.waktuProduksiTerencana += Number(r.waktuProduksiTerencana) || 0;
      e.breakdownUnplanned += Number(r.breakdownUnplanned) || 0;
      e.waktuOperasional += Number(r.waktuOperasional) || 0;
      e.standartOutput += Number(r.standartOutput) || 0;
      e.good += Utils.parseArithmeticExpression(r.good) ?? 0;
      e.defect += Utils.parseArithmeticExpression(r.defect) ?? 0;
    });
    return [...map.values()]
      .map((e) => ({ ...e, tglLabel: fmtDateRange(e.dates) }))
      .sort((a, b) =>
        a.produk.localeCompare(b.produk) ||
        String(a.batch).localeCompare(String(b.batch)) ||
        String(a.line).localeCompare(String(b.line)) ||
        (a.dates[0] || '').localeCompare(b.dates[0] || '')
      );
  };

  const renderBatchTable = (rows) => {
    const body = $('rpBatchBody');
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="12">Tidak ada data rekap batch.</td></tr>';
      return;
    }
    const max = 500;
    const slice = rows.slice(0, max);
    body.innerHTML = slice.map((r) => `<tr>
      <td>${esc(r.produk)}</td>
      <td class="mono">${esc(r.batch)}</td>
      <td class="mono">${esc(r.tglLabel)}</td>
      <td class="ctr">${esc(r.line)}</td>
      <td>${esc(r.tahapan)}</td>
      <td class="ctr">${r.timeAvailable}</td>
      <td class="ctr">${r.waktuProduksiTerencana}</td>
      <td class="ctr">${r.breakdownUnplanned}</td>
      <td class="ctr">${r.waktuOperasional}</td>
      <td class="ctr">${r.standartOutput}</td>
      <td class="ctr">${r.good}</td>
      <td class="ctr">${r.defect}</td>
    </tr>`).join('');
    if (rows.length > max) {
      body.innerHTML += `<tr><td colspan="12"><i>Menampilkan ${max} dari ${rows.length} baris — unduh Excel untuk data lengkap.</i></td></tr>`;
    }
  };

    const renderSummaryTable = (rows) => {
    const body = $('rpSummaryBody');
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="13">Tidak ada data rekap batch per shift.</td></tr>';
      return;
    }
    const max = 500;
    const slice = rows.slice(0, max);
    body.innerHTML = slice.map((r) => {
      const attrs = [
        'class="rp-row-link"',
        'title="Buka log sheet record ini"',
        'data-date="' + esc(r.tgl || '') + '"',
        'data-shift="' + esc(r.shift || '') + '"',
        'data-line="' + esc(r.line || '') + '"',
        'data-stage="' + esc(r.tahapan || '') + '"',
      ].join(' ');
      return `<tr ${attrs}>
      <td>${esc(r.produk)}</td>
      <td class="mono">${esc(r.batch)}</td>
      <td class="mono">${esc(fmtD(r.tgl))}</td>
      <td class="ctr">${esc(r.shift)}</td>
      <td class="ctr">${esc(r.line)}</td>
      <td>${esc(r.tahapan)}</td>
      <td class="ctr">${r.timeAvailable}</td>
      <td class="ctr">${r.waktuProduksiTerencana}</td>
      <td class="ctr">${r.breakdownUnplanned}</td>
      <td class="ctr">${r.waktuOperasional}</td>
      <td class="ctr">${r.standartOutput}</td>
      <td class="ctr">${r.good}</td>
      <td class="ctr">${r.defect}</td>
    </tr>`;
    }).join('');
    if (rows.length > max) {
      body.innerHTML += `<tr><td colspan="13"><i>Menampilkan ${max} dari ${rows.length} baris — unduh Excel untuk data lengkap.</i></td></tr>`;
    }
  };

  /** Klik baris rekap batch per shift → buka log sheet tanggal/shift/line/tahapan itu */
  const openSummaryRow = (tr) => {
    if (!tr || !tr.dataset || !tr.dataset.date) return;
    if (typeof UI === 'undefined' || !UI.openRecord) {
      console.warn('RincianProduk: UI.openRecord tidak tersedia');
      return;
    }
    UI.openRecord({
      date: String(tr.dataset.date),
      shift: String(tr.dataset.shift || 1),
      line: String(tr.dataset.line || ''),
      stage: String(tr.dataset.stage || ''),
    });
  };

  const refreshView = () => {
    const filtered = filterLocal(raw);
    detailRows = buildDetail(filtered);
    summaryRows = buildSummary(filtered);
    batchRows = aggregateByBatch(summaryRows);
    renderDetailTable(detailRows);
    renderSummaryTable(summaryRows);
    renderBatchTable(batchRows);
    say(`✓ ${filtered.length} record · ${detailRows.length} kegiatan · ${summaryRows.length} rekap produk · ${batchRows.length} rekap batch`);
  };

  const load = async () => {
    const from = $('rpFrom')?.value;
    const to = $('rpTo')?.value;
    if (!from || !to) return say('Isi Dari Tanggal dan Sampai Tanggal.', true);
    if (from > to) return say('Tanggal awal tidak boleh melebihi tanggal akhir.', true);
    say('Memuat data…');
    try {
      raw = await fetchRows(from, to);
      refreshView();
    } catch (e) {
      console.warn(e);
      say('Gagal memuat: ' + (e.message || e), true);
    }
  };

  const loadXlsx = () => new Promise((resolve, reject) => {
    if (window.XLSX) return resolve(window.XLSX);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error('Gagal memuat library Excel'));
    document.head.appendChild(s);
  });

  const DETAIL_HEADER = [
    'Produk', 'Batch Number', 'TGL', 'Shift', 'tahapan proses', 'Line',
    'jam mulai', 'jam selesai', 'kegiatan', 'durasi', 'MASALAH', 'good', 'defect', 'operator/inisial'
  ];
  const SUMMARY_HEADER = [
    'Produk', 'batch number', 'TGL', 'shift', 'Line', 'tahapan proses',
    'Time Available', 'Waktu Produksi Terencana', 'waktu breakdown tidak terencana',
    'Waktu Operasional', 'standart output', 'good', 'defect'
  ];

  const detailToAoA = (rows) => {
    const aoa = [DETAIL_HEADER];
    rows.forEach((r) => {
      aoa.push([
        r.produk, r.batch, r.tgl, r.shift, r.tahapan, r.line,
        r.mulai, r.selesai, r.kegiatan, r.durasi, r.masalah, r.good, r.defect, r.operator
      ]);
    });
    return aoa;
  };

  const summaryToAoA = (rows) => {
    const aoa = [SUMMARY_HEADER];
    rows.forEach((r) => {
      aoa.push([
        r.produk, r.batch, r.tgl, r.shift, r.line, r.tahapan,
        r.timeAvailable, r.waktuProduksiTerencana, r.breakdownUnplanned,
        r.waktuOperasional, r.standartOutput, r.good, r.defect
      ]);
    });
    return aoa;
  };

  const downloadExcel = async () => {
    if (!detailRows.length && !summaryRows.length) {
      say('Tidak ada data untuk diunduh. Terapkan filter dulu.', true);
      return;
    }
    try {
      say('Menyiapkan file Excel…');
      const XLSX = await loadXlsx();
      const wb = XLSX.utils.book_new();

      // Sheet per line (kegiatan) — Line 1, Line 2, Line 4
      LINES.forEach((ln) => {
        const rows = detailRows.filter((r) => String(r.line) === ln);
        const ws = XLSX.utils.aoa_to_sheet(detailToAoA(rows));
        XLSX.utils.book_append_sheet(wb, ws, 'Line ' + ln);
      });
      // Sheet lain (line di luar 1/2/4) jika ada
      const other = detailRows.filter((r) => !LINES.includes(String(r.line)));
      if (other.length) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detailToAoA(other)), 'Line lain');
      }
      // Rekap per produk
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryToAoA(summaryRows)), 'all proses produk');
      // Rekap per batch (gabungan lintas shift/tanggal)
      const batchHeader = [
        'Produk', 'Batch', 'TGL', 'Line', 'tahapan proses',
        'Time Available', 'Waktu Produksi Terencana', 'waktu breakdown tidak terencana',
        'Waktu Operasional', 'standart output', 'good', 'defect'
      ];
      const batchAoa = [batchHeader];
      batchRows.forEach((r) => {
        batchAoa.push([
          r.produk, r.batch, r.tglLabel, r.line, r.tahapan,
          r.timeAvailable, r.waktuProduksiTerencana, r.breakdownUnplanned,
          r.waktuOperasional, r.standartOutput, r.good, r.defect
        ]);
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(batchAoa), 'rekap per batch');

      const from = $('rpFrom')?.value || '';
      const to = $('rpTo')?.value || '';
      const name = `rincian-produk_${from}_${to}.xlsx`;
      XLSX.writeFile(wb, name);
      say(`✓ File diunduh: ${name}`);
    } catch (e) {
      console.warn(e);
      say('Gagal unduh Excel: ' + (e.message || e), true);
    }
  };

  const defaultDates = () => {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - 13);
    const iso = (d) => d.toISOString().slice(0, 10);
    if ($('rpFrom') && !$('rpFrom').value) $('rpFrom').value = iso(from);
    if ($('rpTo') && !$('rpTo').value) $('rpTo').value = iso(to);
  };

  const open = () => {
    defaultDates();
    const tab = document.querySelector('.rp-tab.is-on')?.dataset.rpTab || 'detail';
    showTab(tab);
    if (!raw.length) load();
    else refreshView();
  };

  const showTab = (tab) => {
    document.querySelectorAll('.rp-tab').forEach((b) => b.classList.toggle('is-on', b.dataset.rpTab === tab));
    const d = $('rpPanelDetail');
    const s = $('rpPanelSummary');
    const b = $('rpPanelBatch');
    if (d) d.hidden = tab !== 'detail';
    if (s) s.hidden = tab !== 'summary';
    if (b) b.hidden = tab !== 'batch';
  };

  const bind = () => {
    $('rpApply')?.addEventListener('click', load);
    $('rpReset')?.addEventListener('click', () => {
      if ($('rpLine')) $('rpLine').value = '';
      if ($('rpStage')) $('rpStage').value = '';
      if ($('rpShift')) $('rpShift').value = 'all';
      defaultDates();
      load();
    });
    $('rpDownload')?.addEventListener('click', downloadExcel);
    document.querySelectorAll('.rp-tab').forEach((b) => {
      b.addEventListener('click', () => showTab(b.dataset.rpTab));
    });
    $('rpSummaryBody')?.addEventListener('click', (e) => {
      const tr = e.target.closest('tr.rp-row-link');
      if (tr) openSummaryRow(tr);
    });
    // Filter lokal tanpa fetch ulang
    ['rpLine', 'rpStage', 'rpShift'].forEach((id) => {
      $(id)?.addEventListener('change', () => { if (raw.length) refreshView(); });
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  return { open, load, downloadExcel };
})();
