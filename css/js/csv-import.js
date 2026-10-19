/**
 * CSV-IMPORT.JS
 * Import massal dari CSV / Excel (format Detailed downtime list)
 * → mapping kolom → pecah cut-off shift → isi sheet aktif.
 */
const CsvImport = (() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  let lastRows = [];
  let lastMeta = {};

  // ----- Shift cut-off (menit dari 00:00) -----
  const S1_START = 7 * 60;       // 07:00
  const S1_END   = 15 * 60 + 30; // 15:30
  const S2_END   = 23 * 60 + 30; // 23:30
  // S3: 23:30 → 07:00 (+1440)

  const toMin = (hhmm) => {
    if (hhmm == null || hhmm === '') return null;
    const s = String(hhmm).trim();
    // "00:01:00" | "00:01" | "7:15"
    const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  };
  const fromMin = (m) => {
    const x = ((m % 1440) + 1440) % 1440;
    const h = Math.floor(x / 60), mi = x % 60;
    return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
  };
  const durBetween = (a, b) => {
    if (a == null || b == null) return 0;
    return (b - a + 1440) % 1440;
  };

  /** Shift index 0/1/2 dari menit mulai (titik di dalam shift). */
  const shiftOfMin = (m) => {
    if (m == null) return null;
    if (m >= S1_START && m < S1_END) return 0;
    if (m >= S1_END && m < S2_END) return 1;
    return 2; // 23:30–07:00
  };

  /**
   * Pecah rentang [start,end) pada batas shift.
   * Mengembalikan array { shift, mulai, selesai, dur }.
   */
  const splitByShift = (startM, endM) => {
    if (startM == null || endM == null) return [];
    let s = startM;
    let e = endM;
    // jika end <= start anggap lintas hari
    if (e <= s) e += 1440;
    const out = [];
    let guard = 0;
    while (s < e && guard++ < 8) {
      const sNorm = s % 1440;
      const sh = shiftOfMin(sNorm);
      let boundary;
      if (sh === 0) boundary = S1_END;
      else if (sh === 1) boundary = S2_END;
      else boundary = S1_START + 1440; // next 07:00 in absolute timeline from s
      // absolute boundary relative to s's day context
      let absBound;
      if (sh === 2) {
        // from sNorm in [23:30,1440) or [0,07:00)
        if (sNorm >= S2_END) absBound = s - sNorm + 1440 + S1_START;
        else absBound = s - sNorm + S1_START;
        if (absBound <= s) absBound += 1440;
      } else {
        absBound = s - sNorm + boundary;
        if (absBound <= s) absBound += 1440;
      }
      const sliceEnd = Math.min(e, absBound);
      const d = sliceEnd - s;
      if (d > 0) {
        out.push({
          shift: sh,
          mulai: fromMin(s),
          selesai: fromMin(sliceEnd),
          dur: d
        });
      }
      s = sliceEnd;
    }
    return out;
  };

  // ----- Category / Activity → kode app -----
  const mapKode = (category, activityItem, activityName) => {
    const cat = String(category || '').toLowerCase();
    const item = String(activityItem || '').toLowerCase();
    const name = String(activityName || '').toLowerCase();
    if (cat.includes('operating') || item.includes('produksi lancar') || name.includes('produksi lancar')) return '2';
    if (cat.includes('plan')) {
      if (item.includes('istirahat') || item.includes('break') || item.includes('extrafood')) return '5';
      if (item.includes('line clearance') || item.includes('set up') || item.includes('setup')) return '6';
      if (item.includes('briefing') || item.includes('serah')) return '7';
      if (item.includes('approve') || item.includes('spesimen') || item.includes('rekonsiliasi') || item.includes('quality')) return '8';
      return '5';
    }
    if (cat.includes('unplan')) {
      if (item.includes('tunggu') || item.includes('waiting') || item.includes('memasukkan')) return '1';
      if (item.includes('sensor') || item.includes('alarm') || item.includes('mesin')) return '3';
      return '1';
    }
    return '';
  };

  const parseLineFromMesin = (mesin) => {
    const s = String(mesin || '');
    const m = s.match(/line\s*([124])/i);
    return m ? m[1] : '';
  };

  const parseShiftLabel = (v) => {
    const s = String(v || '');
    const m = s.match(/([123])/);
    return m ? parseInt(m[1], 10) - 1 : null;
  };

  const parseDate = (v) => {
    const s = String(v || '').trim();
    // 2026-10-01 07:00:00.000
    const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const m2 = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;
    return '';
  };

  const normHeader = (h) => String(h || '').trim().toLowerCase().replace(/\s+/g, ' ');
  /** Versi tanpa spasi/underscore untuk cocokkan txtLineName, dtActivityStart, dll. */
  const normHeaderCompact = (h) => normHeader(h).replace(/[\s_]+/g, '');

  /** Alias header file → kunci internal (dukung format downtime list + OEE export) */
  const HEADER_MAP = {
    // WO / Lot
    'nomor wo': 'wo', 'no wo': 'wo', 'wo': 'wo', 'nomorwo': 'wo',
    'nomor lot': 'lot', 'lot': 'lot', 'parent lot': 'lot', 'parentlot': 'lot',
    // Mesin / Line
    'mesin': 'mesin', 'nama mesin': 'mesin', 'namamesin': 'mesin',
    'txtlinename': 'line_name', 'line name': 'line_name', 'line': 'line_name',
    // Shift / Tanggal
    'shift': 'shift',
    'tanggal aktivitas': 'tanggal', 'tanggal': 'tanggal',
    'dtactivitydate': 'tanggal', 'activity date': 'tanggal', 'activitydate': 'tanggal',
    // Jam
    'jam mulai aktivitas': 'mulai', 'jam mulai': 'mulai', 'mulai': 'mulai',
    'dtactivitystart': 'mulai', 'activity start': 'mulai', 'activitystart': 'mulai',
    'jam selesai aktivitas': 'selesai', 'jam selesai': 'selesai', 'selesai': 'selesai',
    'dtactivityend': 'selesai', 'activity end': 'selesai', 'activityend': 'selesai',
    // Durasi
    'menit': 'durasi', 'duration': 'duration_raw', 'durasi': 'durasi',
    // Aktivitas
    'activity name': 'activity_name', 'txtactivityname': 'activity_name', 'activityname': 'activity_name',
    'category description': 'category', 'categorydescription': 'category', 'category': 'category',
    'activity item': 'activity_item', 'txtactivityitem': 'activity_item', 'activityitem': 'activity_item',
    // Kode sudah ada di export OEE
    'kode': 'kode', 'code': 'kode',
    // Standar / output
    'standard waktu kemas': 'std_waktu', 'tstandard_waktu_kemas': 'std_waktu', 'standardwaktukemas': 'std_waktu',
    'good': 'good', 'reject': 'defect', 'defect': 'defect',
    'standard speed': 'std_speed', 'flotstdspeed': 'std_speed', 'stdspeed': 'std_speed',
    'description': 'description', 'txtdescription': 'description', 'txt description': 'description',
    // Man power
    'man power': 'op', 'manpower': 'op', 'op': 'op',
    'spee stadar': 'speed_std', 'speed standar': 'speed_std', 'speed standard': 'speed_std',
  };

  const parseCsvText = (text) => {
    // Robust-enough CSV: handles quotes
    const rows = [];
    let i = 0, field = '', row = [], inQ = false;
    const pushField = () => { row.push(field); field = ''; };
    const pushRow = () => {
      if (row.some((c) => String(c).trim() !== '')) rows.push(row);
      row = [];
    };
    while (i < text.length) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { inQ = true; i++; continue; }
      if (c === ',') { pushField(); i++; continue; }
      if (c === '\n') { pushField(); pushRow(); i++; continue; }
      if (c === '\r') { i++; continue; }
      field += c; i++;
    }
    pushField(); pushRow();
    return rows;
  };

  const rowsToObjects = (matrix) => {
    if (!matrix.length) return [];
    // find header row (first non-empty with several cells)
    let hi = 0;
    for (let r = 0; r < Math.min(5, matrix.length); r++) {
      const nonempty = matrix[r].filter((c) => String(c).trim()).length;
      if (nonempty >= 5) { hi = r; break; }
    }
    const headers = matrix[hi].map(normHeader);
    const keys = headers.map((h) => {
      if (HEADER_MAP[h]) return HEADER_MAP[h];
      const c = normHeaderCompact(h);
      if (HEADER_MAP[c]) return HEADER_MAP[c];
      // partial contains
      for (const [alias, key] of Object.entries(HEADER_MAP)) {
        if (c === normHeaderCompact(alias) || c.includes(normHeaderCompact(alias))) return key;
      }
      return null;
    });
    // duration minutes: often a nameless column after Duration time — detect numeric column
    const out = [];
    for (let r = hi + 1; r < matrix.length; r++) {
      const cells = matrix[r];
      if (!cells || !cells.some((c) => String(c).trim())) continue;
      const obj = {};
      keys.forEach((k, idx) => {
        if (!k) return;
        obj[k] = cells[idx] != null ? String(cells[idx]).trim() : '';
      });
      // duration menit: kolom tanpa nama di antara Duration & Activity Name
      if (!obj.durasi) {
        for (let idx = 0; idx < headers.length; idx++) {
          if (keys[idx]) continue;
          const v = String(cells[idx] || '').trim();
          if (/^\d+(\.\d+)?$/.test(v)) {
            const n = parseFloat(v);
            if (n > 0 && n < 1000) { obj.durasi = String(n); break; }
          }
        }
      }
      // skip empty activity rows
      if (!obj.mulai && !obj.selesai && !obj.activity_item && !obj.category && !obj.kode) continue;
      out.push(obj);
    }
    return out;
  };

  const loadXlsxLib = () => new Promise((resolve, reject) => {
    if (window.XLSX) return resolve(window.XLSX);
    const s = document.createElement('script');
    s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error('Gagal memuat library Excel (CDN). Simpan file sebagai CSV lalu coba lagi.'));
    document.head.appendChild(s);
  });

  const readFile = (file) => new Promise((resolve, reject) => {
    const name = (file.name || '').toLowerCase();
    if (name.endsWith('.csv') || name.endsWith('.txt')) {
      const reader = new FileReader();
      reader.onload = () => resolve({ type: 'csv', text: reader.result });
      reader.onerror = () => reject(new Error('Gagal membaca file'));
      reader.readAsText(file, 'UTF-8');
      return;
    }
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const XLSX = await loadXlsxLib();
          const wb = XLSX.read(new Uint8Array(reader.result), { type: 'array' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
          resolve({ type: 'xlsx', matrix });
        } catch (e) { reject(e); }
      };
      reader.onerror = () => reject(new Error('Gagal membaca Excel'));
      reader.readAsArrayBuffer(file);
      return;
    }
    reject(new Error('Format tidak didukung. Gunakan .csv atau .xlsx'));
  });

  /** Bangun baris app + pecah shift jika perlu */
  const buildAppRows = (rawList) => {
    const built = [];
    rawList.forEach((r) => {
      const startM = toMin(r.mulai);
      const endM = toMin(r.selesai);
      let slices = splitByShift(startM, endM);
      // Jika file sudah punya label shift dan hanya 1 slice, pakai label file
      const fileShift = parseShiftLabel(r.shift);
      if (slices.length === 1 && fileShift != null) {
        slices[0].shift = fileShift;
      }
      if (!slices.length) {
        // fallback: satu baris apa adanya
        slices = [{
          shift: fileShift != null ? fileShift : 0,
          mulai: (r.mulai || '').slice(0, 5),
          selesai: (r.selesai || '').slice(0, 5),
          dur: parseFloat(r.durasi) || durBetween(startM, endM)
        }];
      }
      const totalDur = slices.reduce((s, x) => s + x.dur, 0) || 1;
      const good = parseFloat(String(r.good || '0').replace(',', '.')) || 0;
      const defect = parseFloat(String(r.defect || '0').replace(',', '.')) || 0;
      slices.forEach((sl, idx) => {
        const share = sl.dur / totalDur;
        built.push({
          shift: sl.shift,
          tanggal: parseDate(r.tanggal),
          line: parseLineFromMesin(r.mesin) || parseLineFromMesin(r.line_name) || lastMeta.line || '',
          wo: r.wo || '',
          lot: r.lot || '',
          kode: (r.kode && String(r.kode).trim()) || mapKode(r.category, r.activity_item, r.activity_name),
          op: r.op || '',
          mulai: sl.mulai,
          selesai: sl.selesai,
          durasi: String(sl.dur),
          kegiatan: r.activity_item || r.activity_name || '',
          masalah: '',
          disposisi: '',
          description: r.description || '',
          batch: r.lot || '',
          good: (idx === 0 || good === 0) ? (slices.length === 1 ? String(good || '') : String(Math.round(good * share) || '')) : String(Math.round(good * share) || ''),
          defect: (idx === 0 || defect === 0) ? (slices.length === 1 ? String(defect || '') : String(Math.round(defect * share) || '')) : String(Math.round(defect * share) || ''),
          category: r.category || '',
        });
      });
    });
    return built;
  };

  const applyToSheet = (rows, opts = {}) => {
    if (!rows.length) {
      if (typeof UI !== 'undefined') UI.toast('Tidak ada baris untuk diimpor', true);
      return;
    }
    // Set filter tanggal / line / tahapan jika ada
    const sample = rows[0];
    if (sample.tanggal && State.el.fDate) {
      State.el.fDate.value = sample.tanggal;
    }
    if (sample.line && State.el.fLine) {
      State.el.fLine.value = sample.line;
      document.querySelectorAll('[data-sheet-line]').forEach((b) => {
        b.classList.toggle('on', b.getAttribute('data-sheet-line') === sample.line);
      });
    }
    // tahapan kemas default untuk file downtime overwrap
    if (State.el.fStage) {
      State.el.fStage.value = 'kemas';
      document.querySelectorAll('[data-sheet-stage], #fStageSel button, .stagesel button').forEach((b) => {
        const v = b.getAttribute('data-stage') || b.getAttribute('data-sheet-stage') || b.value;
        if (v) b.classList.toggle('on', String(v).toLowerCase() === 'kemas');
      });
    }
    // Shift: pakai yang diminta opts.shiftIdx atau shift baris pertama
    const shiftIdx = opts.shiftIdx != null ? opts.shiftIdx : sample.shift;
    if (typeof State.evalShift !== 'undefined') State.evalShift = shiftIdx;
    // filter shift UI
    document.querySelectorAll('[data-shift], [data-sheet-shift]').forEach((b) => {
      const v = b.getAttribute('data-shift') ?? b.getAttribute('data-sheet-shift');
      if (v != null) b.classList.toggle('on', parseInt(v, 10) === shiftIdx);
    });
    if (State.el.fShift) State.el.fShift.value = String(shiftIdx + 1);

    // Produk dari lot
    const lot = sample.lot || '';
    if (lot && State.el.prodName1 && !State.el.prodName1.value.trim()) {
      State.el.prodName1.value = lot;
    }
    if (sample.wo && State.el.prodWo1 && !State.el.prodWo1.value.trim()) {
      State.el.prodWo1.value = sample.wo;
    }

    // Filter rows for this shift only when multi-shift file
    const forShift = rows.filter((r) => r.shift === shiftIdx);
    const use = forShift.length ? forShift : rows;

    State.el.tbody.innerHTML = '';
    Rows.updateAllDropdowns();
    use.forEach((r) => {
      Rows.makeRow({
        kode: r.kode,
        op: r.op,
        mulai: r.mulai,
        selesai: r.selesai,
        durasi: r.durasi,
        kegiatan: r.kegiatan,
        masalah: r.masalah,
        disposisi: r.disposisi,
        description: r.description,
        wo: r.wo,
        batch: r.batch,
        good: r.good,
        defect: r.defect,
      });
    });
    Rows.updateRowNumbers();
    if (typeof Calculation !== 'undefined') Calculation.recalc();
    if (typeof UI !== 'undefined') {
      UI.toast(`✓ Import ${use.length} baris · Shift ${shiftIdx + 1}` + (sample.tanggal ? ` · ${sample.tanggal}` : ''));
    }
  };

  // ----- UI -----
  const ensureOverlay = () => {
    let ov = $('csvImportOverlay');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'csvImportOverlay';
    ov.className = 'qm-overlay hide';
    ov.innerHTML = `
      <div class="qm-modal bulk-modal bulk-modal-wide" style="max-width:960px;width:95vw;max-height:92vh;overflow:auto">
        <div class="cm-header">
          <h3>📥 Import CSV / Excel (Downtime List)</h3>
          <button type="button" class="cm-close" id="csvImportClose" aria-label="Tutup">×</button>
        </div>
        <div class="cm-body" style="display:flex;flex-direction:column;gap:12px">
          <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.45">
            Format: <b>Detailed downtime list</b> (Nomor WO, Lot, Mesin, Shift, Tanggal, Jam Mulai/Selesai, Category, Activity Item, good, reject, Man Power, Description, …).
            Baris yang lintas cut-off shift (07:00 / 15:30 / 23:30) otomatis dipecah.
          </p>
          <div>
            <input type="file" id="csvImportFile" accept=".csv,.xlsx,.xls,text/csv" style="font-size:13px">
          </div>
          <div id="csvImportStatus" class="oee-filter-status"></div>
          <div id="csvImportPreview" style="overflow:auto;max-height:320px;border:1px solid #1e3a5f;border-radius:8px;display:none">
            <table class="pica-table" style="width:100%;font-size:11.5px">
              <thead><tr>
                <th>Shift</th><th>Mulai</th><th>Selesai</th><th>Dur</th><th>Kode</th><th>Kegiatan</th><th>OP</th><th>Good</th><th>Defect</th><th>Desc</th>
              </tr></thead>
              <tbody id="csvImportBody"></tbody>
            </table>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
            <label style="font-size:12px;color:#94a3b8">Terapkan ke shift:
              <select id="csvImportShiftSel" style="margin-left:6px;background:#0d2135;color:#e2e8f0;border:1px solid #2b4d74;border-radius:6px;padding:4px 8px">
                <option value="0">Shift 1 (07:00–15:30)</option>
                <option value="1">Shift 2 (15:30–23:30)</option>
                <option value="2">Shift 3 (23:30–07:00)</option>
              </select>
            </label>
            <button type="button" class="btn btn-primary" id="csvImportApply" disabled>Terapkan ke Sheet</button>
            <button type="button" class="btn btn-ghost" id="csvImportCancel">Batal</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    $('csvImportClose')?.addEventListener('click', close);
    $('csvImportCancel')?.addEventListener('click', close);
    $('csvImportFile')?.addEventListener('change', onFile);
    $('csvImportApply')?.addEventListener('click', () => {
      const sh = parseInt($('csvImportShiftSel')?.value || '0', 10);
      applyToSheet(lastRows, { shiftIdx: sh });
      close();
    });
    return ov;
  };

  const setStatus = (msg, err) => {
    const el = $('csvImportStatus');
    if (!el) return;
    el.textContent = msg;
    el.className = 'oee-filter-status' + (err ? ' err' : '');
  };

  const showPreview = (rows) => {
    const wrap = $('csvImportPreview');
    const body = $('csvImportBody');
    if (!wrap || !body) return;
    wrap.style.display = 'block';
    const sample = rows.slice(0, 80);
    body.innerHTML = sample.map((r) =>
      `<tr>
        <td class="ctr">S${(r.shift || 0) + 1}</td>
        <td class="ctr">${r.mulai || ''}</td>
        <td class="ctr">${r.selesai || ''}</td>
        <td class="ctr">${r.durasi || ''}</td>
        <td class="ctr">${r.kode || ''}</td>
        <td>${String(r.kegiatan || '').slice(0, 40)}</td>
        <td class="ctr">${r.op || ''}</td>
        <td class="ctr">${r.good || ''}</td>
        <td class="ctr">${r.defect || ''}</td>
        <td>${String(r.description || '').slice(0, 28)}</td>
      </tr>`
    ).join('') + (rows.length > 80 ? `<tr><td colspan="10">… +${rows.length - 80} baris lagi</td></tr>` : '');

    // default shift selector = most common shift in file
    const counts = [0, 0, 0];
    rows.forEach((r) => { if (r.shift >= 0 && r.shift <= 2) counts[r.shift]++; });
    const best = counts.indexOf(Math.max(...counts));
    const sel = $('csvImportShiftSel');
    if (sel) sel.value = String(best >= 0 ? best : 0);
  };

  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setStatus('Membaca file…');
    $('csvImportApply').disabled = true;
    try {
      const data = await readFile(file);
      let matrix;
      if (data.type === 'csv') matrix = parseCsvText(data.text);
      else matrix = data.matrix;
      const raw = rowsToObjects(matrix);
      if (!raw.length) {
        const hi = 0;
        const hdr = (matrix[0] || []).map((h) => String(h).trim()).filter(Boolean).slice(0, 12).join(' | ');
        throw new Error('Tidak ada baris data terdeteksi. Header terbaca: ' + (hdr || '(kosong)'));
      }
      lastMeta = {
        line: parseLineFromMesin(raw[0].mesin) || parseLineFromMesin(raw[0].line_name),
        tanggal: parseDate(raw[0].tanggal),
      };
      lastRows = buildAppRows(raw);
      const nShift = [0, 1, 2].map((s) => lastRows.filter((r) => r.shift === s).length);
      setStatus(`✓ ${raw.length} baris sumber → ${lastRows.length} baris app (setelah pecah shift). S1:${nShift[0]} · S2:${nShift[1]} · S3:${nShift[2]} · Line ${lastMeta.line || '—'}`);
      showPreview(lastRows);
      $('csvImportApply').disabled = false;
    } catch (err) {
      console.warn(err);
      setStatus('⚠ ' + (err.message || err), true);
      lastRows = [];
    }
  };

  const open = () => {
    const ov = ensureOverlay();
    ov.classList.remove('hide');
    const f = $('csvImportFile');
    if (f) f.value = '';
    setStatus('Pilih file .csv atau .xlsx');
    $('csvImportPreview').style.display = 'none';
    $('csvImportApply').disabled = true;
    lastRows = [];
  };
  const close = () => $('csvImportOverlay')?.classList.add('hide');

  const bind = () => {
    $('btnCsvImport')?.addEventListener('click', open);
  };

  return { bind, open };
})();
