/**
 * STORAGE.JS
 * Menangani penyimpanan lokal (localStorage) sebagai cache/offline mode,
 * dan sinkronisasi ke Supabase (tabel `oee_data`) saat online.
 *
 * Strategi hybrid:
 *  - ONLINE  → baca/tulis langsung ke Supabase, lalu cache hasilnya ke localStorage.
 *  - OFFLINE → baca/tulis ke localStorage saja; perubahan (save) masuk
 *              antrean (Sync) dan otomatis dikirim ke Supabase saat online lagi.
 *
 * Filter (Tanggal, Line, Tahapan, Shift) dikirim langsung sebagai kondisi
 * query ke Supabase (bukan tarik semua lalu filter di client) agar tetap ringan & cepat.
 */
const Storage = (() => {
  'use strict';

  // ====== LOCAL STORAGE (cache offline) ======
  const dbGet = () => {
    try { return JSON.parse(localStorage.getItem(CONFIG.DB_KEY)) || {}; }
    catch (e) { return {}; }
  };
  const dbSet = (db) => {
    try { localStorage.setItem(CONFIG.DB_KEY, JSON.stringify(db)); }
    catch (e) { /* storage penuh / tidak tersedia */ }
  };

  /**
   * Buat unique key untuk record berdasarkan filter aktif.
   * Format: "YYYY-MM-DD|S1|L1|mixing" — sama seperti kolom `key` di Supabase.
   */
  const curKey = () => {
    const date = State.el.fDate.value || Utils.todayLocal();
    return `${date}|S${State.evalShift + 1}|L${State.el.fLine.value}|${State.el.fStage.value}`;
  };

  const labelFilter = () => {
    const rawDate = State.el.fDate.value || Utils.todayLocal();
    return `${Utils.formatDateText(rawDate)} · Shift ${State.evalShift + 1} · Line ${State.el.fLine.value} · ${State.el.fStage.value.toUpperCase()}`;
  };

  // ====== FILTER AKTIF (4 parameter: date, shift, line, tahapan) ======
  const activeFilter = () => ({
    rawDate: State.el.fDate.value || Utils.todayLocal(),
    shift:   State.evalShift + 1,
    line:    State.el.fLine.value,
    stage:   State.el.fStage.value, // = kolom "tahapan" di Supabase
  });

  const isOnline = () => navigator.onLine && !!(typeof SupabaseClient !== 'undefined' && SupabaseClient.getClient());

  // ====== COLLECT & APPLY ======
  /**
   * Kumpulkan semua data form untuk disimpan.
   */
  const collect = () => ({
    products: {
      p1Name: State.el.prodName1.value, p1Rate: State.el.prodRate1.value, p1Wo: State.el.prodWo1 ? State.el.prodWo1.value : '',
      p2Name: State.el.prodName2.value, p2Rate: State.el.prodRate2.value, p2Wo: State.el.prodWo2 ? State.el.prodWo2.value : '',
      p3Name: State.el.prodName3.value, p3Rate: State.el.prodRate3.value, p3Wo: State.el.prodWo3 ? State.el.prodWo3.value : '',
    },
    operators: {
      op1: State.el.op1.value, op2: State.el.op2.value, op3: State.el.op3.value,
      op4: State.el.op4.value, op5: State.el.op5.value, op6: State.el.op6.value,
    },
    mesin: {
      nama: (State.el.fMesinNama || document.getElementById('fMesinNama'))?.value || '',
      kode: (State.el.fMesinKode || document.getElementById('fMesinKode'))?.value || '',
    },
    // Jumlah TKL hasil input manual disimpan sebagai bagian dari record Sheet.
    summary: {
      availability: State.el.oF.textContent,
      performance:  State.el.oITotal.textContent,
      quality:      State.el.oM.textContent,
      oee:          State.el.oee.textContent,
    },
    rows: Rows.rows().map(tr => {
      const g = (f) => { const el = tr.querySelector(`[data-f="${f}"]`); return el ? el.value : ''; };
      return {
        kode: g('kode'), op: g('op'), mulai: g('mulai'), panggil: g('panggil'),
        teknik: g('teknik'), selesai: g('selesai'), durasi: g('durasi'),
        kegiatan: g('kegiatan'), masalah: g('masalah'), disposisi: g('disposisi'),
        wo: g('wo'), batch: g('batch'), good: g('good'), defect: g('defect'),
      };
    }),
    savedAt: new Date().toISOString(),
  });

  /**
   * Apply data ke form (saat load record atau reset).
   */
  const applyRecord = (d) => {
    // Products
    if (d && d.products) {
      State.el.prodName1.value = d.products.p1Name || '';
      State.el.prodRate1.value = d.products.p1Rate || '';
      if (State.el.prodWo1) State.el.prodWo1.value = d.products.p1Wo || '';
      State.el.prodName2.value = d.products.p2Name || '';
      State.el.prodRate2.value = d.products.p2Rate || '';
      if (State.el.prodWo2) State.el.prodWo2.value = d.products.p2Wo || '';
      State.el.prodName3.value = d.products.p3Name || '';
      State.el.prodRate3.value = d.products.p3Rate || '';
      if (State.el.prodWo3) State.el.prodWo3.value = d.products.p3Wo || '';
    } else {
      State.el.prodName1.value = ''; State.el.prodRate1.value = '';
      if (State.el.prodWo1) State.el.prodWo1.value = '';
      State.el.prodName2.value = ''; State.el.prodRate2.value = '';
      if (State.el.prodWo2) State.el.prodWo2.value = '';
      State.el.prodName3.value = ''; State.el.prodRate3.value = '';
      if (State.el.prodWo3) State.el.prodWo3.value = '';
    }
    // Sync ke Master Produk UI
    document.querySelectorAll('#masterProductGrid [data-sync]').forEach(el => {
      const targetId = el.getAttribute('data-sync');
      const src = State.el[targetId] || document.getElementById(targetId);
      if (src) el.value = src.value;
    });

    // Operators
    if (d && d.operators) {
      State.el.op1.value = d.operators.op1 || '';
      State.el.op2.value = d.operators.op2 || '';
      State.el.op3.value = d.operators.op3 || '';
      State.el.op4.value = d.operators.op4 || '';
      State.el.op5.value = d.operators.op5 || '';
      State.el.op6.value = d.operators.op6 || '';
    } else {
      State.el.op1.value = ''; State.el.op2.value = ''; State.el.op3.value = '';
      State.el.op4.value = ''; State.el.op5.value = ''; State.el.op6.value = '';
    }

    // Mesin
    const mn = State.el.fMesinNama || document.getElementById('fMesinNama');
    const mk = State.el.fMesinKode || document.getElementById('fMesinKode');
    if (d && d.mesin) {
      if (mn) mn.value = d.mesin.nama || '';
      if (mk) mk.value = d.mesin.kode || '';
    } else {
      if (mn) mn.value = '';
      if (mk) mk.value = '';
    }

    // Restore Jumlah TKL ke Sheet.

    // Rows
    State.el.tbody.innerHTML = '';
    Rows.updateAllDropdowns();
    Rows.updateMatrixProductHeaders();
    if (d && d.rows && d.rows.length) {
      d.rows.forEach(r => Rows.makeRow(r));
    } else {
      for (let i = 0; i < CONFIG.DEFAULT_ROWS; i++) Rows.makeRow();
    }
    Rows.updateRowNumbers();
    Calculation.recalc();
    Calculation.validateAllTimeInputs();
    UI.updateEditChip(d);

    // Kalau Mode Form sedang aktif, sinkronkan kartu form ke baris pertama
    // dari data yang baru saja dimuat (data tabel baru saja diganti total).
    if (typeof FormMode !== 'undefined' && State.el.formPanel && !State.el.formPanel.hidden) {
      FormMode.resetAndRender();
    }
    if (typeof FormModeFull !== 'undefined' && State.el.formFullPanel && !State.el.formFullPanel.hidden) {
      FormModeFull.resetAndRender();
    }
  };

  // ====== HELPER: derivasi kolom ringkasan untuk Supabase ======

  /**
   * Ubah angka format Indonesia ("85,32" / "1.234" / "85,32%") jadi Number murni.
   */
  const parseIdNumber = (raw) => {
    if (raw == null) return null;
    const cleaned = String(raw).replace('%', '').trim().replace(/\./g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return isFinite(n) ? n : null;
  };

  const joinNonEmpty = (arr, sep = '; ') =>
    arr.filter(v => v != null && String(v).trim() !== '')
       .map(v => String(v).trim())
       .join(sep);

  /**
   * Bangun objek row lengkap sesuai kolom tabel `oee_data` di Supabase,
   * dari data form (rec) + filter aktif (date/shift/line/tahapan).
   */
  const buildSupabaseRow = (rec, filter) => {
    const rows = rec.rows || [];
    const ops  = rec.operators || {};
    const prod = rec.products || {};

    const produkBatch = joinNonEmpty(
      [prod.p1Name, prod.p2Name, prod.p3Name].filter(Boolean).map((name) => {
        const wos = rows.filter(r => r.batch === name && r.wo).map(r => r.wo);
        return wos.length ? `${name} (WO: ${joinNonEmpty(wos, ', ')})` : name;
      }),
      ' | '
    );

    return {
      key:     curKey(),
      date:    filter.rawDate,
      shift:   filter.shift,
      line:    String(filter.line),
      tahapan: filter.stage,

      payload: rec,
      updatedAt: new Date().toISOString(),
      schemaVersion: CONFIG.SCHEMA_VERSION || 1,

      availability: parseIdNumber(rec.summary && rec.summary.availability),
      performance:  parseIdNumber(rec.summary && rec.summary.performance),
      quality:      parseIdNumber(rec.summary && rec.summary.quality),
      oee:          parseIdNumber(rec.summary && rec.summary.oee),

      total_downtime: parseIdNumber(State.el.oD && State.el.oD.textContent), // unplanned DT (menit)
      total_good:     parseIdNumber(State.el.oL && State.el.oL.textContent),
      total_defect:   parseIdNumber(State.el.oK && State.el.oK.textContent),

      keterangan_masalah: joinNonEmpty(rows.map(r => r.masalah)),
      penanggulangan:     joinNonEmpty(rows.map(r => r.disposisi)),
      produk_batch:       produkBatch,
      inisial_operator:   joinNonEmpty([ops.op1, ops.op2, ops.op3, ops.op4, ops.op5, ops.op6], ', '),
    };
  };

  // ====== SUPABASE: GET (query langsung dengan 4 filter) ======
  const supabaseSelect = async ({ rawDate, shift, line, stage }) => {
    const client = SupabaseClient.getClient();
    const { data, error } = await client
      .from(CONFIG.DB_TABLE)
      .select('payload, "updatedAt"')
      .eq('date', rawDate)
      .eq('shift', shift)
      .eq('line', String(line))
      .eq('tahapan', stage)
      .maybeSingle();
    if (error) throw error;
    return data ? data.payload : null;
  };

  // ====== LOAD (GET): tarik data — otomatis dipanggil saat app start & saat filter berubah ======
  const loadRecord = async () => {
    const filter = activeFilter();

    // Mode Offline: selalu baca lokal saja, jangan coba Supabase
    const offlineMode = typeof Auth !== 'undefined' && Auth.isOfflineMode && Auth.isOfflineMode();
    if (offlineMode) {
      const db = dbGet();
      applyRecord(db[curKey()] || null);
      UI.setSyncStatus('err', 'Mode Offline · data lokal saja');
      return;
    }

    if (isOnline()) {
      UI.setSyncStatus('sync', 'memuat dari Supabase…');
      try {
        const data = await supabaseSelect(filter);
        if (data) {
          const db = dbGet();
          db[curKey()] = data;
          dbSet(db);
          applyRecord(data);
          UI.setSyncStatus('ok', '✓ dimuat dari Supabase');
        } else {
          // belum ada di Supabase → cek cache lokal (mis. belum sempat sync)
          const db = dbGet();
          const local = db[curKey()] || null;
          applyRecord(local);
          UI.setSyncStatus('ok', local ? '✓ dimuat dari cache lokal' : 'data kosong (belum ada di cloud)');
        }
        return;
      } catch (err) {
        console.warn('Gagal memuat dari Supabase, fallback ke lokal:', err);
        UI.setSyncStatus('err', '⚠ gagal load cloud, pakai data lokal');
      }
    }

    // OFFLINE atau Supabase gagal → localStorage
    const db = dbGet();
    applyRecord(db[curKey()] || null);
    if (!isOnline()) UI.setSyncStatus('err', 'offline · mode lokal');
  };

  // ====== SAVE (POST): tombol "Simpan" — online → Supabase, offline → antre ======
  const saveData = async (opts = {}) => {
    const rec = collect();
    const db = dbGet();
    db[curKey()] = rec;
    dbSet(db);

    State.el.lastSaved.textContent = '✓ tersimpan ' + new Date().toLocaleTimeString('id-ID');
    UI.updateEditChip(rec);
    if (!opts.silent) UI.toast('Data tersimpan lokal ✓');

    const filter = activeFilter();
    const row = buildSupabaseRow(rec, filter);

    // Mode Offline (login tanpa kredensial): HANYA lokal, JANGAN antre ke Supabase.
    // User harus login online dulu jika ingin data naik ke cloud.
    const offlineMode = typeof Auth !== 'undefined' && Auth.isOfflineMode && Auth.isOfflineMode();
    if (offlineMode) {
      UI.setSyncStatus('err', '✓ tersimpan lokal (Mode Offline · tidak ke Supabase)');
      if (!opts.silent) UI.toast('Mode Offline — data hanya lokal. Login online untuk simpan ke Supabase.', true);
      return;
    }

    if (!isOnline()) {
      const n = Sync.queuePush(row);
      UI.setSyncStatus('err', `✓ tersimpan lokal (offline · antre sync: ${n})`);
      if (!opts.silent) UI.toast('Offline — data akan disinkron otomatis nanti ⚠', true);
      return;
    }

    UI.setSyncStatus('sync', 'mengunggah ke Supabase…');
    try {
      await Sync.pushRow(row);
      UI.setSyncStatus('ok', '✓ tersinkron ke Supabase');
      if (!opts.silent) UI.toast('Sync Supabase ✓ ' + labelFilter());
    } catch (err) {
      console.warn('Gagal sync ke Supabase, masuk antrean:', err);
      const n = Sync.queuePush(row);
      UI.setSyncStatus('err', `⚠ sync gagal, diantrekan (${n}): ` + (err.message || ''));
      if (!opts.silent) UI.toast('Tersimpan LOKAL — sync gagal, akan dicoba lagi ⚠', true);
    }
  };

  // ====== AUTO-SAVE LOKAL (setiap CONFIG.AUTO_SAVE_INTERVAL_MS, senyap, TIDAK ke Supabase) ======
  const autoSaveLocal = () => {
    try {
      if (!State.el.tbody) return; // app belum siap (masih di layar login)
      const rec = collect();
      const db = dbGet();
      db[curKey()] = rec;
      dbSet(db);
      if (State.el.lastSaved) {
        State.el.lastSaved.textContent = '💾 auto-save lokal ' + new Date().toLocaleTimeString('id-ID');
      }
    } catch (e) {
      console.warn('Auto-save lokal gagal:', e);
    }
  };

  const rowHasData = (r) =>
    (r.kode && String(r.kode).trim()) ||
    (r.mulai && String(r.mulai).trim()) ||
    (r.selesai && String(r.selesai).trim()) ||
    (r.durasi && String(r.durasi).trim()) ||
    (r.kegiatan && String(r.kegiatan).trim()) ||
    (r.good && String(r.good).trim()) ||
    (r.defect && String(r.defect).trim());

  /** Parse key "YYYY-MM-DD|S1|L1|mixing" → meta */
  const parseRecordKey = (key) => {
    const parts = String(key || '').split('|');
    if (parts.length < 4) return null;
    const shiftM = parts[1].match(/S?(\d+)/i);
    const lineM = parts[2].match(/L?(\d+)/i);
    return {
      date: parts[0],
      shift: shiftM ? shiftM[1] : '',
      line: lineM ? lineM[1] : parts[2].replace(/^L/i, ''),
      stage: parts.slice(3).join('|'),
    };
  };

  const collectProductOptions = () => {
    const set = new Set();
    [1, 2, 3].forEach((i) => {
      const el = State.el['prodName' + i] || document.getElementById('prodName' + i);
      const v = el ? String(el.value || '').trim() : '';
      if (v) set.add(v);
    });
    const db = dbGet();
    Object.values(db).forEach((rec) => {
      if (!rec || typeof rec !== 'object') return;
      if (rec.products) {
        ['p1Name', 'p2Name', 'p3Name'].forEach((k) => {
          const v = String(rec.products[k] || '').trim();
          if (v) set.add(v);
        });
      }
      (rec.rows || []).forEach((r) => {
        const b = String(r.batch || '').trim();
        if (b) set.add(b);
      });
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'id'));
  };

  const downloadCsvBlob = (filename, head, body) => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [head, ...body].map((row) => row.map(esc).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  /**
   * Kumpulkan baris dari local DB + sheet aktif sesuai filter export.
   * stages/lines = array string; kosong = semua.
   * date = YYYY-MM-DD opsional; month = YYYY-MM opsional; products = array nama produk.
   */
  const gatherExportRows = (opts) => {
    const {
      date = '',
      month = '',
      stages = [],
      lines = [],
      products = [],
      shifts = [],
    } = opts || {};

    const stageSet = new Set((stages || []).map((s) => String(s).toLowerCase()).filter(Boolean));
    const lineSet = new Set((lines || []).map((l) => String(l)).filter(Boolean));
    const shiftSet = new Set((shifts || []).map((s) => String(s)).filter(Boolean));
    const prodSet = new Set((products || []).map((p) => String(p).trim().toLowerCase()).filter(Boolean));

    const matchMeta = (meta) => {
      if (!meta) return false;
      if (date && meta.date !== date) return false;
      if (month && !(meta.date || '').startsWith(month)) return false;
      if (stageSet.size && !stageSet.has(String(meta.stage || '').toLowerCase())) return false;
      if (lineSet.size && !lineSet.has(String(meta.line || ''))) return false;
      if (shiftSet.size && !shiftSet.has(String(meta.shift || ''))) return false;
      return true;
    };

    const matchProduct = (batch) => {
      if (!prodSet.size) return true;
      const b = String(batch || '').trim().toLowerCase();
      if (!b) return false;
      for (const p of prodSet) {
        if (b === p || b.includes(p) || p.includes(b)) return true;
      }
      return false;
    };

    const out = [];
    const seen = new Set();

    const pushRec = (meta, rec) => {
      if (!matchMeta(meta) || !rec) return;
      const metaA = rec.summary?.availability ?? '';
      const metaP = rec.summary?.performance ?? '';
      const metaQ = rec.summary?.quality ?? '';
      const metaO = rec.summary?.oee ?? '';
      (rec.rows || []).forEach((r) => {
        if (!rowHasData(r)) return;
        if (!matchProduct(r.batch)) return;
        const sig = [meta.date, meta.shift, meta.line, meta.stage, r.kode, r.mulai, r.selesai, r.kegiatan, r.batch, r.good, r.defect].join('|');
        if (seen.has(sig)) return;
        seen.add(sig);
        out.push({
          date: meta.date,
          shift: meta.shift,
          line: meta.line,
          stage: meta.stage,
          ...r,
          _a: metaA, _p: metaP, _q: metaQ, _o: metaO,
        });
      });
    };

    // Sheet aktif (data di form sekarang)
    const active = activeFilter();
    pushRec(
      { date: active.rawDate, shift: String(active.shift), line: String(active.line), stage: active.stage },
      collect()
    );

    // Semua record di localStorage
    const db = dbGet();
    Object.keys(db).forEach((key) => {
      const meta = parseRecordKey(key);
      if (!meta) return;
      // Skip jika sama persis dengan active (sudah di-push dari collect)
      if (
        meta.date === active.rawDate &&
        String(meta.shift) === String(active.shift) &&
        String(meta.line) === String(active.line) &&
        meta.stage === active.stage
      ) return;
      pushRec(meta, db[key]);
    });

    // Urut tanggal → shift → line → tahap → mulai
    out.sort((a, b) => {
      const c1 = String(a.date).localeCompare(String(b.date));
      if (c1) return c1;
      const c2 = String(a.shift).localeCompare(String(b.shift), undefined, { numeric: true });
      if (c2) return c2;
      const c3 = String(a.line).localeCompare(String(b.line), undefined, { numeric: true });
      if (c3) return c3;
      const c4 = String(a.stage).localeCompare(String(b.stage));
      if (c4) return c4;
      return String(a.mulai || '').localeCompare(String(b.mulai || ''));
    });

    return out;
  };

  const runExportWithFilter = (opts) => {
    const rows = gatherExportRows(opts);
    if (!rows.length) {
      UI?.toast?.('Tidak ada data sesuai filter ⚠', true, 'warn');
      return;
    }

    const head = [
      'No', 'Tanggal', 'Shift', 'Line', 'Tahapan',
      'Kode', 'OP', 'Mulai', 'Panggil', 'Teknik', 'Selesai', 'Durasi',
      'Kegiatan', 'Masalah', 'Disposisi', 'WO', 'Produk', 'Good', 'Defect',
      'Availability%', 'Performance%', 'Quality%', 'OEE%',
    ];

    const body = rows.map((r, i) => [
      i + 1,
      r.date,
      r.shift ? `S${r.shift}` : '',
      r.line,
      r.stage,
      r.kode, r.op, r.mulai, r.panggil, r.teknik, r.selesai, r.durasi,
      r.kegiatan, r.masalah, r.disposisi, r.wo, r.batch, r.good, r.defect,
      r._a, r._p, r._q, r._o,
    ]);

    const datePart = opts.date || opts.month || 'all';
    const stagePart = (opts.stages && opts.stages.length) ? opts.stages.join('+') : 'allstage';
    const linePart = (opts.lines && opts.lines.length) ? 'L' + opts.lines.join('+') : 'allline';
    const filename = `logsheet-${datePart}-${linePart}-${stagePart}.csv`;

    downloadCsvBlob(filename, head, body);
    UI?.toast?.(`CSV diexport (${rows.length} baris) ✓`);
  };

  /**
   * Export CSV dengan dialog filter:
   * tanggal, bulan, produk, tahapan proses (multi), line (multi).
   */
  const exportCsv = () => {
    const active = activeFilter();
    const products = collectProductOptions();
    const stages = [
      { v: 'mixing', l: 'Mixing' },
      { v: 'filling', l: 'Filling' },
      { v: 'steril', l: 'Steril' },
      { v: 'visual', l: 'Visual' },
      { v: 'kemas', l: 'Kemas' },
    ];
    const lines = [
      { v: '1', l: 'Line 1' },
      { v: '2', l: 'Line 2' },
      { v: '4', l: 'Line 4' },
    ];
    const monthDefault = (active.rawDate || '').slice(0, 7);

    let ov = document.getElementById('exportCsvOverlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'exportCsvOverlay';
      ov.className = 'qm-overlay';
      ov.innerHTML = `<div class="qm-modal" id="exportCsvModal" style="max-width:520px;width:96vw"></div>`;
      document.body.appendChild(ov);
      ov.addEventListener('click', (e) => {
        if (e.target === ov) ov.classList.add('hide');
      });
    }

    const modal = document.getElementById('exportCsvModal');
    modal.innerHTML = `
      <div class="bf-head" style="padding:14px 16px 8px">
        <div>
          <h3 class="qm-title"><span class="bolt">⇩</span> Export CSV</h3>
          <p class="qm-sub">Pilih filter data yang akan diunduh. Kosongkan = semua.</p>
        </div>
        <button type="button" class="bf-x" data-ex="close" aria-label="Tutup">×</button>
      </div>
      <div style="padding:0 16px 12px;display:grid;gap:12px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Tanggal</label>
            <input type="date" id="exDate" class="in" value="${active.rawDate || ''}" style="width:100%">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Bulan</label>
            <input type="month" id="exMonth" class="in" value="${monthDefault}" style="width:100%">
            <div style="font-size:10px;opacity:.6;margin-top:2px">Dipakai jika tanggal dikosongkan</div>
          </div>
        </div>

        <div>
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px">Tahapan proses <span style="font-weight:400;opacity:.7">(bisa lebih dari satu)</span></label>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${stages.map((s) => `
              <label style="display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border:1px solid var(--border,#ccc);border-radius:8px;font-size:13px;cursor:pointer">
                <input type="checkbox" name="exStage" value="${s.v}" ${s.v === active.stage ? 'checked' : ''}>
                ${s.l}
              </label>`).join('')}
          </div>
        </div>

        <div>
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px">Line <span style="font-weight:400;opacity:.7">(bisa lebih dari satu)</span></label>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${lines.map((l) => `
              <label style="display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border:1px solid var(--border,#ccc);border-radius:8px;font-size:13px;cursor:pointer">
                <input type="checkbox" name="exLine" value="${l.v}" ${String(l.v) === String(active.line) ? 'checked' : ''}>
                ${l.l}
              </label>`).join('')}
          </div>
        </div>

        <div>
          <label style="font-size:12px;font-weight:600;display:block;margin-bottom:6px">Produk <span style="font-weight:400;opacity:.7">(opsional, multi)</span></label>
          ${products.length
            ? `<div style="display:flex;flex-direction:column;gap:4px;max-height:140px;overflow:auto;border:1px solid var(--border,#e2e8f0);border-radius:8px;padding:6px">
                ${products.map((p) => `
                  <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;padding:2px 4px">
                    <input type="checkbox" name="exProd" value="${String(p).replace(/"/g, '&quot;')}">
                    <span style="word-break:break-word">${String(p).replace(/</g, '&lt;')}</span>
                  </label>`).join('')}
              </div>`
            : `<p style="font-size:12px;opacity:.6;margin:0">Belum ada daftar produk tersimpan. Semua produk ikut diexport.</p>`}
        </div>
      </div>
      <div class="bf-footer" style="padding:8px 16px 16px">
        <div class="qm-actions" style="width:100%;justify-content:flex-end;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-ghost" data-ex="close">Batal</button>
          <button type="button" class="btn btn-ghost" data-ex="all">Export semua (tanpa filter)</button>
          <button type="button" class="btn btn-primary" data-ex="go">⇩ Unduh CSV</button>
        </div>
      </div>
    `;

    ov.classList.remove('hide');

    const close = () => ov.classList.add('hide');
    modal.querySelectorAll('[data-ex="close"]').forEach((b) => b.addEventListener('click', close));

    const readOpts = (ignoreFilters) => {
      if (ignoreFilters) return { date: '', month: '', stages: [], lines: [], products: [] };
      const dateVal = modal.querySelector('#exDate')?.value || '';
      const monthVal = modal.querySelector('#exMonth')?.value || '';
      // Jika tanggal diisi, prioritaskan tanggal (bulan diabaikan)
      return {
        date: dateVal,
        month: dateVal ? '' : monthVal,
        stages: [...modal.querySelectorAll('[name="exStage"]:checked')].map((x) => x.value),
        lines: [...modal.querySelectorAll('[name="exLine"]:checked')].map((x) => x.value),
        products: [...modal.querySelectorAll('[name="exProd"]:checked')].map((x) => x.value),
      };
    };

    modal.querySelector('[data-ex="go"]')?.addEventListener('click', () => {
      const opts = readOpts(false);
      close();
      runExportWithFilter(opts);
    });
    modal.querySelector('[data-ex="all"]')?.addEventListener('click', () => {
      close();
      runExportWithFilter(readOpts(true));
    });
  };

  return {
    dbGet, dbSet, curKey, labelFilter, collect, applyRecord,
    loadRecord, saveData, autoSaveLocal, exportCsv,
  };
})();
