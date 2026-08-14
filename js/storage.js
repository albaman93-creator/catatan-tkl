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
      p1Name: State.el.prodName1.value, p1Rate: State.el.prodRate1.value,
      p2Name: State.el.prodName2.value, p2Rate: State.el.prodRate2.value,
      p3Name: State.el.prodName3.value, p3Rate: State.el.prodRate3.value,
    },
    operators: {
      op1: State.el.op1.value, op2: State.el.op2.value, op3: State.el.op3.value,
      op4: State.el.op4.value, op5: State.el.op5.value, op6: State.el.op6.value,
    },
    summary: {
      availability: State.el.oF.textContent,
      performance:  State.el.oITotal.textContent,
      quality:      State.el.oM.textContent,
      oee:          State.el.oee.textContent,
    },
    rows: Rows.rows().map(tr => {
      const g = (f) => { const el = tr.querySelector(`[data-f="${f}"]`); return el ? el.value : ''; };
      return {
        kode: g('kode'), mulai: g('mulai'), panggil: g('panggil'),
        teknik: g('teknik'), selesai: g('selesai'),
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
      State.el.prodName2.value = d.products.p2Name || '';
      State.el.prodRate2.value = d.products.p2Rate || '';
      State.el.prodName3.value = d.products.p3Name || '';
      State.el.prodRate3.value = d.products.p3Rate || '';
    } else {
      State.el.prodName1.value = ''; State.el.prodRate1.value = '';
      State.el.prodName2.value = ''; State.el.prodRate2.value = '';
      State.el.prodName3.value = ''; State.el.prodRate3.value = '';
    }

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

  return {
    dbGet, dbSet, curKey, labelFilter, collect, applyRecord,
    loadRecord, saveData, autoSaveLocal,
  };
})();
