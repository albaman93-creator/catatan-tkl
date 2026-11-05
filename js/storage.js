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

  /** Key dari objek filter { rawDate, shift, line, stage } (tidak membaca DOM). */
  const keyOf = (f) => `${f.rawDate}|S${f.shift}|L${f.line}|${f.stage}`;

  /** Kebalikan keyOf: "2026-11-02|S1|L1|filling" → filter. */
  const filterFromKey = (key) => {
    const [rawDate, s, l, stage] = String(key).split('|');
    return { rawDate, shift: Number(String(s).replace('S', '')), line: String(l).replace('L', ''), stage };
  };

  // ====== PENGAMAN DATA DOBEL ======
  // formKey  = key milik data yang SEDANG tampil di form (diisi hanya setelah applyRecord selesai).
  // loading  = true selama data filter baru belum selesai dimuat → semua simpan DITAHAN.
  // loadSeq  = nomor pemuatan; respons lama yang datang telat dibuang.
  // Sebelumnya, simpan memakai curKey() (membaca filter BARU) padahal form masih berisi data
  // filter LAMA → data tanggal/shift sebelumnya tertulis ke tanggal/shift baru.
  let formKey = null;
  let loading = false;
  let loadSeq = 0;
  let loadPromise = Promise.resolve();

  // Baca teks elemen hasil hitung; aman jika elemen tidak ada (tidak melempar error)
  const txtOf = (id) => {
    const el = State.el[id] || document.getElementById(id);
    return el ? el.textContent : '0';
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
      p1Name: State.el.prodName1.value,
      p1Bn: State.el.prodBn1 ? State.el.prodBn1.value.trim() : '',
      p1Rate: State.el.prodRate1.value,
      p1Ukuran: State.el.prodUkuran1 ? State.el.prodUkuran1.value : '',
      p1Wo: State.el.prodWo1 ? State.el.prodWo1.value : '',
      p2Name: State.el.prodName2.value,
      p2Bn: State.el.prodBn2 ? State.el.prodBn2.value.trim() : '',
      p2Rate: State.el.prodRate2.value,
      p2Ukuran: State.el.prodUkuran2 ? State.el.prodUkuran2.value : '',
      p2Wo: State.el.prodWo2 ? State.el.prodWo2.value : '',
      p3Name: State.el.prodName3.value,
      p3Bn: State.el.prodBn3 ? State.el.prodBn3.value.trim() : '',
      p3Rate: State.el.prodRate3.value,
      p3Ukuran: State.el.prodUkuran3 ? State.el.prodUkuran3.value : '',
      p3Wo: State.el.prodWo3 ? State.el.prodWo3.value : '',
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
      availability: txtOf('oF'),
      performance:  txtOf('oITotal'),
      quality:      txtOf('oM'),
      oee:          txtOf('oee'),
      ope:    (State.lastCalc && State.lastCalc.ope) || null,
      oee365: (State.lastCalc && State.lastCalc.oee365) || null,
      produk: (State.lastCalc && State.lastCalc.produk) || [],
    },
    rows: Rows.rows().map(tr => {
      const g = (f) => { const el = tr.querySelector(`[data-f="${f}"]`); return el ? el.value : ''; };
      return {
        kode: g('kode'), op: g('op'), ms: g('ms'), mulai: g('mulai'), panggil: g('panggil'),
        teknik: g('teknik'), selesai: g('selesai'), durasi: g('durasi'),
        kegiatan: g('kegiatan'), masalah: g('masalah'), disposisi: g('disposisi'),
        description: g('description'),
        wo: g('wo'), batch: g('batch'), good: g('good'), defect: g('defect'),
      };
    }),
    // Periode bulan produksi (1-12) — penanda manual cutoff bulan untuk filter dashboard.
    // Diisi user lewat dropdown "Periode bulan" di header sheet.
    prodMonth: (document.getElementById('sheetProdMonth') || {}).value || '',
    // Penanda pemilik record: dipakai saat load untuk menolak salinan nyasar.
    formKey: formKey || curKey(),
    savedAt: new Date().toISOString(),
  });

  /** Record boleh dipakai untuk key ini? (record lama tanpa formKey tetap diterima) */
  const isRecordForKey = (rec, key) => !rec || !rec.formKey || rec.formKey === key;
  const pickValid = (rec, key) => {
    if (!rec) return null;
    if (isRecordForKey(rec, key)) return rec;
    console.warn('[Storage] Record diabaikan: milik', rec.formKey, 'bukan', key);
    return null;
  };

  /** Aman menyimpan? Tidak sedang memuat & isi form memang milik filter aktif. */
  const canSave = () => {
    if (loading || formKey === null) return false;
    if (formKey !== curKey()) {
      // Filter berubah tanpa loadRecord (mis. import) → simpan form lama ke key-nya, lalu muat ulang.
      loadRecord();
      return false;
    }
    return true;
  };


  /** True jika minimal satu kode produk terdaftar di master sheet. */
  const hasRegisteredProduct = (rec) => {
    const p = (rec && rec.products) || {};
    return [p.p1Name, p.p2Name, p.p3Name].some((n) => String(n || '').trim() !== '');
  };

  /**
   * Bandingkan isi dua record (abaikan field "waktu" yang selalu berubah:
   * savedAt/copiedAt/updatedAt) supaya bisa tahu apakah benar-benar ADA
   * perubahan sebelum menyimpan/menampilkan notifikasi.
   */
  const stripVolatile = (rec) => {
    if (!rec || typeof rec !== 'object') return rec;
    const { savedAt, copiedAt, copiedFrom, ...rest } = rec;
    return rest;
  };
  const sameContent = (a, b) => {
    try { return JSON.stringify(stripVolatile(a)) === JSON.stringify(stripVolatile(b)); }
    catch (e) { return false; }
  };

  /**
   * Apply data ke form (saat load record atau reset).
   */
  const applyRecord = (d) => {
    // Products — dukung format lama "VTTS1 L030001" (name+BN digabung) & format baru terpisah
    const splitLegacyName = (raw, bnField) => {
      const s = String(raw || '').trim();
      if (bnField != null && String(bnField).trim() !== '') {
        return { name: s, bn: String(bnField).trim() };
      }
      // "VTTS1 L030001" atau "VTTS1 L 030001" → pecah di spasi pertama
      const m = s.match(/^(\S+)\s+(.+)$/);
      if (m) return { name: m[1], bn: m[2].trim() };
      return { name: s, bn: '' };
    };
    if (d && d.products) {
      const p1 = splitLegacyName(d.products.p1Name, d.products.p1Bn);
      const p2 = splitLegacyName(d.products.p2Name, d.products.p2Bn);
      const p3 = splitLegacyName(d.products.p3Name, d.products.p3Bn);
      State.el.prodName1.value = p1.name;
      if (State.el.prodBn1) State.el.prodBn1.value = p1.bn;
      State.el.prodRate1.value = d.products.p1Rate || '';
      if (State.el.prodUkuran1) State.el.prodUkuran1.value = d.products.p1Ukuran || '';
      if (State.el.prodWo1) State.el.prodWo1.value = d.products.p1Wo || '';
      State.el.prodName2.value = p2.name;
      if (State.el.prodBn2) State.el.prodBn2.value = p2.bn;
      State.el.prodRate2.value = d.products.p2Rate || '';
      if (State.el.prodUkuran2) State.el.prodUkuran2.value = d.products.p2Ukuran || '';
      if (State.el.prodWo2) State.el.prodWo2.value = d.products.p2Wo || '';
      State.el.prodName3.value = p3.name;
      if (State.el.prodBn3) State.el.prodBn3.value = p3.bn;
      State.el.prodRate3.value = d.products.p3Rate || '';
      if (State.el.prodUkuran3) State.el.prodUkuran3.value = d.products.p3Ukuran || '';
      if (State.el.prodWo3) State.el.prodWo3.value = d.products.p3Wo || '';
    } else {
      State.el.prodName1.value = ''; if (State.el.prodBn1) State.el.prodBn1.value = ''; State.el.prodRate1.value = '';
      if (State.el.prodUkuran1) State.el.prodUkuran1.value = '';
      if (State.el.prodWo1) State.el.prodWo1.value = '';
      State.el.prodName2.value = ''; if (State.el.prodBn2) State.el.prodBn2.value = ''; State.el.prodRate2.value = '';
      if (State.el.prodUkuran2) State.el.prodUkuran2.value = '';
      if (State.el.prodWo2) State.el.prodWo2.value = '';
      State.el.prodName3.value = ''; if (State.el.prodBn3) State.el.prodBn3.value = ''; State.el.prodRate3.value = '';
      if (State.el.prodUkuran3) State.el.prodUkuran3.value = '';
      if (State.el.prodWo3) State.el.prodWo3.value = '';
    }
    // Sync ke Master Produk UI
    document.querySelectorAll('#masterProductGrid [data-sync]').forEach(el => {
      const targetId = el.getAttribute('data-sync');
      const src = State.el[targetId] || document.getElementById(targetId);
      if (src) el.value = src.value;
    });

    // Periode bulan produksi (penanda manual untuk filter dashboard)
    {
      const pm = (d && d.prodMonth != null) ? String(d.prodMonth) : '';
      const hidden = document.getElementById('sheetProdMonth');
      if (hidden) hidden.value = pm;
      if (typeof window.SheetPeriod !== 'undefined' && window.SheetPeriod.set) {
        const LABELS = { '1':'JAN','2':'FEB','3':'MAR','4':'APR','5':'MEI','6':'JUN',
          '7':'JUL','8':'AGU','9':'SEP','10':'OKT','11':'NOV','12':'DES' };
        window.SheetPeriod.set(pm, LABELS[pm] || '');
      } else {
        const valEl = document.getElementById('sheetPeriodValue');
        if (valEl) {
          const LABELS = { '1':'JAN','2':'FEB','3':'MAR','4':'APR','5':'MEI','6':'JUN',
            '7':'JUL','8':'AGU','9':'SEP','10':'OKT','11':'NOV','12':'DES' };
          if (pm && LABELS[pm]) {
            valEl.textContent = LABELS[pm];
            valEl.classList.remove('is-empty');
            valEl.classList.add('is-set');
          } else {
            valEl.textContent = 'Periode bulan';
            valEl.classList.add('is-empty');
            valEl.classList.remove('is-set');
          }
        }
      }
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

    // Mesin — rebuild dropdown dulu, lalu terapkan nilai tersimpan
    const mn = State.el.fMesinNama || document.getElementById('fMesinNama');
    const mk = State.el.fMesinKode || document.getElementById('fMesinKode');
    if (typeof UI !== 'undefined' && typeof UI.fillMachineName === 'function') {
      UI.fillMachineName();
    }
    if (d && d.mesin) {
      if (mn) {
        const nama = d.mesin.nama || '';
        // Pastikan opsi ada (data lama / nama custom)
        if (mn.tagName === 'SELECT' && nama) {
          const exists = Array.from(mn.options).some((o) => o.value === nama);
          if (!exists) {
            const opt = document.createElement('option');
            opt.value = nama;
            opt.textContent = nama;
            mn.appendChild(opt);
          }
        }
        mn.value = nama;
      }
      if (mk) mk.value = d.mesin.kode || '';
    } else {
      if (mn && !mn.value) mn.value = '';
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

    // Record hasil input dari Google Sheets belum punya ringkasan OEE → hitung ulang (recalc di atas)
    // lalu simpan balik otomatis supaya Supabase & Spreadsheet ikut terisi.
    if (d && d.meta && d.meta.needsRecalc) {
      setTimeout(() => { saveData({ silent: true }).catch(() => {}); }, 400);
    }

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
      key:     keyOf(filter),
      date:    filter.rawDate,
      shift:   filter.shift,
      line:    String(filter.line),
      tahapan: filter.stage,

      payload: rec,
      updatedAt: new Date().toISOString(),
      schemaVersion: CONFIG.SCHEMA_VERSION || 1,
      source: 'app', // dibedakan dari input via Google Sheets (source = 'sheet')

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

  // ====== SIMPAN FORM LAMA KE KEY-NYA SENDIRI sebelum filter berpindah ======
  // Dipanggil di awal loadRecord (filter DOM sudah berubah, tapi isi form belum).
  // Lokal + dorong ke cloud, supaya edit < 30 dtk tidak hilang / tertimpa data cloud lama.
  const flushPrevious = () => {
    if (!formKey || !State.el.tbody) return;
    try {
      const rec = collect(); // rec.formKey = formKey (key lama), bukan curKey()
      // PENTING: dulu di sini dicek hasRegisteredProduct() — kalau user baru
      // sempat isi baris/operator/mesin TAPI belum ketik kode produk, autosave
      // saat pindah tanggal/shift/line/tahapan jadi SKIP dan isian itu hilang.
      // Sekarang dicek isSheetEmpty() saja (sama seperti simpan manual): apa pun
      // yang sudah diisi tetap diamankan sebelum form berpindah ke filter lain.
      if (isSheetEmpty(rec)) return;
      const db = dbGet();
      const prev = db[formKey];
      const changed = !prev || !sameContent(prev, rec);
      db[formKey] = rec;
      dbSet(db);
      if (changed && State.el.lastSaved) {
        State.el.lastSaved.textContent = '💾 auto-save ' + new Date().toLocaleTimeString('id-ID');
      }
      if (changed && typeof UI !== 'undefined' && UI.toast) {
        UI.toast('💾 Data autosave berhasil disimpan');
      }
      const offlineMode = typeof Auth !== 'undefined' && Auth.isOfflineMode && Auth.isOfflineMode();
      if (offlineMode || typeof Sync === 'undefined') return;
      if (!changed) return; // tidak ada perubahan → tidak perlu dorong ulang ke Supabase
      const row = buildSupabaseRow(rec, filterFromKey(formKey));
      if (isOnline()) Sync.pushRow(row).catch(() => Sync.queuePush(row));
      else Sync.queuePush(row);
    } catch (e) {
      console.warn('flushPrevious gagal:', e);
    }
  };

  // ====== LOAD (GET): tarik data — otomatis dipanggil saat app start & saat filter berubah ======
  const loadRecord = () => (loadPromise = _loadRecord());

  const _loadRecord = async () => {
    flushPrevious();
    const filter = activeFilter();
    const key = keyOf(filter); // dibekukan SEKARANG; jangan baca ulang setelah await
    const seq = ++loadSeq;
    loading = true;

    const offlineMode = typeof Auth !== 'undefined' && Auth.isOfflineMode && Auth.isOfflineMode();
    const localGet = () => pickValid(dbGet()[key] || null, key);
    let rec = null;
    let st = ['ok', ''];

    try {
      if (offlineMode) {
        rec = localGet();
        st = ['err', 'Mode Offline · data lokal saja'];
      } else if (isOnline()) {
        UI.setSyncStatus('sync', 'memuat dari Supabase…');
        const data = pickValid(await supabaseSelect(filter), key);
        if (data) {
          const db = dbGet();
          db[key] = data; // pakai key hasil bekuan, bukan curKey() (filter bisa sudah berganti)
          dbSet(db);
          rec = data;
          st = ['ok', '✓ dimuat dari Supabase'];
        } else {
          // belum ada di Supabase → cek cache lokal (mis. belum sempat sync)
          rec = localGet();
          st = ['ok', rec ? '✓ dimuat dari cache lokal' : 'data kosong (belum ada di cloud)'];
        }
      } else {
        rec = localGet();
        st = ['err', 'offline · mode lokal'];
      }
    } catch (err) {
      console.warn('Gagal memuat dari Supabase, fallback ke lokal:', err);
      rec = localGet();
      st = ['err', '⚠ gagal load cloud, pakai data lokal'];
    }

    // Ada pemuatan yang lebih baru (user ganti filter lagi) → buang hasil ini.
    if (seq !== loadSeq) return;

    try {
      applyRecord(rec);
    } catch (e) {
      console.error('applyRecord gagal:', e);
    }
    formKey = key;
    loading = false;
    UI.setSyncStatus(st[0], st[1]);
  };

  // ====== SHEET KOSONG ======
  const ROW_FIELDS = ['kode','op','ms','mulai','panggil','teknik','selesai','durasi','kegiatan',
    'masalah','disposisi','description','wo','batch','good','defect'];
  const has = (v) => String(v == null ? '' : v).trim() !== '';

  /**
   * Sheet dianggap kosong bila tak ada produk, BN/WO/rate, operator, maupun isi baris.
   * Jam mulai baris yang sama dengan default awal shift (terisi otomatis) tidak dihitung.
   */
  const isSheetEmpty = (rec) => {
    const p = (rec && rec.products) || {};
    const prodFields = ['p1Name','p1Bn','p1Rate','p1Wo','p2Name','p2Bn','p2Rate','p2Wo','p3Name','p3Bn','p3Rate','p3Wo'];
    if (prodFields.some(f => has(p[f]))) return false;
    if (Object.values((rec && rec.operators) || {}).some(has)) return false;
    const defaults = (typeof CONFIG !== 'undefined' && CONFIG.SHIFT_START_TIMES) || ['07:00','15:30','23:30'];
    return !((rec && rec.rows) || []).some(r => ROW_FIELDS.some(f => {
      if (!has(r[f])) return false;
      if (f === 'mulai' && defaults.includes(String(r[f]).trim())) return false;
      return true;
    }));
  };

  /**
   * Simpan manual pada sheet KOSONG = hapus data tersimpan untuk filter ini (lokal + cloud).
   * RLS v3: hanya admin yang boleh DELETE → untuk non-admin, baris di cloud dikosongkan (UPDATE).
   */
  const clearCurrentRecord = async () => {
    const key = formKey;
    const filter = filterFromKey(key);
    const offlineMode = typeof Auth !== 'undefined' && Auth.isOfflineMode && Auth.isOfflineMode();
    const online = !offlineMode && isOnline();

    if (!offlineMode && !online) {
      UI.toast('Offline — sheet kosong baru bisa disimpan (dihapus dari cloud) saat online.', true);
      return;
    }

    const hadLocal = !!dbGet()[key];
    let hadCloud = false;
    if (online) {
      try { hadCloud = !!(await supabaseSelect(filter)); }
      catch (e) {
        UI.toast('Gagal mengecek cloud — data tidak diubah. Coba lagi.', true);
        return;
      }
    }
    if (!hadLocal && !hadCloud) {
      UI.toast('Sheet kosong & belum ada data tersimpan untuk filter ini.', false, 'warn');
      UI.setSyncStatus('ok', 'sheet kosong · tidak ada data tersimpan');
      return;
    }
    if (!confirm(`Sheet ini KOSONG.\nHapus data tersimpan untuk\n${labelFilter()}?`)) return;

    let note = '';
    if (online) {
      UI.setSyncStatus('sync', 'menghapus data…');
      try {
        const client = SupabaseClient.getClient();
        const { data, error } = await client.from(CONFIG.DB_TABLE).delete()
          .match({ date: filter.rawDate, shift: filter.shift, line: String(filter.line), tahapan: filter.stage })
          .select('key');
        if (error) throw error;
        if (hadCloud && (!data || !data.length)) {
          // Tidak berhak DELETE (RLS) → kosongkan isinya lewat UPDATE yang diizinkan
          const rec = collect();
          const row = buildSupabaseRow(rec, filter);
          Object.assign(row, {
            availability: null, performance: null, quality: null, oee: null,
            total_downtime: null, total_good: null, total_defect: null,
            keterangan_masalah: '', penanggulangan: '', produk_batch: '', inisial_operator: '',
          });
          await Sync.pushRow(row);
          note = ' (dikosongkan di cloud)';
        }
      } catch (err) {
        console.warn('Hapus/kosongkan di cloud gagal:', err);
        UI.setSyncStatus('err', '⚠ gagal hapus di cloud: ' + (err.message || ''));
        UI.toast('Gagal menghapus di cloud — data TIDAK diubah. ' + (err.message || ''), true);
        return;
      }
    }

    // Cloud beres → bersihkan lokal, antrean, dan cache hash auto-save
    const db = dbGet();
    delete db[key];
    dbSet(db);
    if (typeof Sync !== 'undefined' && Sync.dequeue) Sync.dequeue(key);
    _lastAutoSupabaseHash = '';
    UI.updateEditChip(null);
    State.el.lastSaved.textContent = '🗑 data dihapus ' + new Date().toLocaleTimeString('id-ID');
    UI.setSyncStatus('ok', '✓ sheet kosong · data tersimpan dihapus' + note);
    UI.toast('Data sheet dihapus ✓ ' + labelFilter() + note);
  };

  // ====== SAVE (POST): tombol "Simpan" — online → Supabase, offline → antre ======
  const saveData = async (opts = {}) => {
    while (loading) await loadPromise; // tunggu data filter baru selesai dimuat
    if (!canSave()) {
      if (!opts.silent) UI.toast('Sheet sedang berpindah — coba simpan lagi sebentar.', true);
      return;
    }
    const rec = collect();
    // Simpan otomatis/senyap: hanya bila ada kode produk terdaftar (p1/p2/p3).
    // Simpan MANUAL (tombol / Ctrl+S): sheet kosong → hapus data tersimpan;
    // ada isi walau produk belum diisi → tetap disimpan.
    if (!hasRegisteredProduct(rec)) {
      if (opts.silent) {
        UI.setSyncStatus('err', '⚠ tidak disimpan · produk kosong');
        return;
      }
      if (isSheetEmpty(rec)) {
        await clearCurrentRecord();
        return;
      }
    }

    // Simpan manual tapi isinya persis sama dengan yang sudah tersimpan → tidak perlu
    // menulis ulang / menyinkron ulang, cukup beri tahu user tidak ada perubahan.
    if (!opts.silent) {
      const existing = dbGet()[formKey];
      if (existing && sameContent(existing, rec)) {
        UI.toast('Belum disimpan — tidak ada perubahan', false, 'warn');
        return;
      }
    }

    const db = dbGet();
    db[formKey] = rec;
    dbSet(db);

    // Catat kombinasi produk+BN ke history (Issue #8)
    if (typeof Suggest !== 'undefined' && Suggest.rememberFromMaster) {
      try { Suggest.rememberFromMaster(); } catch (_) {}
    }

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
      if (!canSave()) return;      // sedang memuat / filter baru belum termuat
      const rec = collect();
      // Simpan selama sheet TIDAK kosong (bukan hanya saat produk sudah terdaftar) —
      // supaya baris/operator/mesin yang sudah diisi tidak hilang sebelum sempat
      // mengetik kode produk.
      if (isSheetEmpty(rec)) return;
      const db = dbGet();
      db[formKey] = rec;
      dbSet(db);
      if (typeof Suggest !== 'undefined' && Suggest.rememberFromMaster) {
        try { Suggest.rememberFromMaster(); } catch (_) {}
      }
      if (State.el.lastSaved) {
        State.el.lastSaved.textContent = '💾 auto-save lokal ' + new Date().toLocaleTimeString('id-ID');
      }
    } catch (e) {
      console.warn('Auto-save lokal gagal:', e);
    }
  };

  // ====== AUTO-SAVE SUPABASE (setiap CONFIG.AUTO_SAVE_SUPABASE_INTERVAL_MS) ======
  // Senyap, tanpa toast. Hanya saat online + bukan Mode Offline.
  // Skip jika payload identik dengan yang terakhir berhasil di-push (hemat bandwidth).
  let _autoSupabaseBusy = false;
  let _lastAutoSupabaseHash = '';

  const autoSaveSupabase = async () => {
    try {
      if (!State.el.tbody) return;
      if (_autoSupabaseBusy) return;
      if (!canSave()) return;

      const offlineMode = typeof Auth !== 'undefined' && Auth.isOfflineMode && Auth.isOfflineMode();
      if (offlineMode) return;
      if (!isOnline()) return;

      const rec = collect();
      // Jangan push ke Supabase jika belum ada produk terdaftar
      if (!hasRegisteredProduct(rec)) return;
      // Hash ringan: skip upload kalau isi sheet belum berubah sejak auto-save terakhir
      const hash = JSON.stringify({
        k: curKey(),
        rows: rec.rows,
        products: rec.products,
        mesin: rec.mesin,
        summary: rec.summary,
      });
      if (hash === _lastAutoSupabaseHash) return;

      _autoSupabaseBusy = true;
      // Simpan lokal dulu (sama seperti saveData), lalu push ke Supabase senyap
      const db = dbGet();
      db[formKey] = rec;
      dbSet(db);

      const filter = activeFilter();
      const row = buildSupabaseRow(rec, filter);

      UI.setSyncStatus('sync', 'auto-save Supabase…');
      try {
        await Sync.pushRow(row);
        _lastAutoSupabaseHash = hash;
        UI.setSyncStatus('ok', '✓ auto-save Supabase');
        if (State.el.lastSaved) {
          State.el.lastSaved.textContent = '☁️ auto-save cloud ' + new Date().toLocaleTimeString('id-ID');
        }
      } catch (err) {
        console.warn('Auto-save Supabase gagal, diantrekan:', err);
        const n = Sync.queuePush(row);
        UI.setSyncStatus('err', `⚠ auto-save gagal, antre (${n})`);
      }
    } catch (e) {
      console.warn('Auto-save Supabase error:', e);
    } finally {
      _autoSupabaseBusy = false;
    }
  };

  /**
   * Export log sheet aktif ke CSV (UTF-8 BOM, cocok Excel Indonesia).
   * Satu baris per aktivitas; header memuat meta filter + ringkasan OEE.
   */
  const exportCsv = () => {
    const filter = activeFilter();
    const rec = collect();
    const rows = (rec.rows || []).filter(r =>
      (r.kode && String(r.kode).trim()) ||
      (r.mulai && String(r.mulai).trim()) ||
      (r.selesai && String(r.selesai).trim()) ||
      (r.durasi && String(r.durasi).trim()) ||
      (r.kegiatan && String(r.kegiatan).trim()) ||
      (r.good && String(r.good).trim()) ||
      (r.defect && String(r.defect).trim())
    );

    if (!rows.length) {
      if (typeof UI !== 'undefined' && UI.toast) {
        UI.toast('Tidak ada data baris untuk diexport.', true, 'warn');
      }
      return;
    }

    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = [
      'No', 'Tanggal', 'Shift', 'Line', 'Tahapan',
      'Kode', 'Man Power', 'Mulai', 'Panggil', 'Teknik', 'Selesai', 'Durasi',
      'Kegiatan', 'Masalah', 'Disposisi', 'WO', 'Produk', 'Good', 'Defect',
      'Availability%', 'Performance%', 'Quality%', 'OEE%',
    ];

    const metaA = rec.summary?.availability ?? '';
    const metaP = rec.summary?.performance ?? '';
    const metaQ = rec.summary?.quality ?? '';
    const metaO = rec.summary?.oee ?? '';

    const body = rows.map((r, i) => [
      i + 1,
      filter.rawDate,
      `S${filter.shift}`,
      filter.line,
      filter.stage,
      r.kode, r.op, r.mulai, r.panggil, r.teknik, r.selesai, r.durasi,
      r.kegiatan, r.masalah, r.disposisi, r.wo, r.batch, r.good, r.defect,
      metaA, metaP, metaQ, metaO,
    ]);

    const csv = [head, ...body].map(row => row.map(esc).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const datePart = filter.rawDate || Utils.todayLocal();
    a.href = url;
    a.download = `logsheet-${datePart}-S${filter.shift}-L${filter.line}-${filter.stage}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    if (typeof UI !== 'undefined' && UI.toast) {
      UI.toast(`CSV diexport (${rows.length} baris) ✓`);
    }
  };

  /**
   * Salin atau pindahkan record dari filter sumber ke filter tujuan.
   * @param {object} targetFilter { rawDate, shift, line, stage }
   * @param {'copy'|'move'} mode
   * @returns {Promise<{ok:boolean, message:string, targetKey:string}>}
   */
  const copyOrMoveRecord = async (targetFilter, mode = 'copy') => {
    while (loading) await loadPromise;
    if (!canSave()) {
      return { ok: false, message: 'Sheet sedang berpindah — coba lagi sebentar.' };
    }

    const srcFilter = activeFilter();
    const srcKey = keyOf(srcFilter);
    const targetKey = keyOf(targetFilter);

    if (srcKey === targetKey) {
      return { ok: false, message: 'Tujuan sama dengan sumber. Pilih tanggal/shift/line/tahapan lain.' };
    }

    // Ambil data sumber: utamakan form yang sedang terbuka (paling up-to-date)
    const rec = collect();
    if (!hasRegisteredProduct(rec)) {
      return { ok: false, message: 'Sheet sumber kosong (belum ada produk) — tidak ada data untuk disalin.' };
    }

    // Tandai metadata salinan. formKey = pemilik baru → lolos pemeriksaan saat dimuat.
    const cloned = JSON.parse(JSON.stringify(rec));
    cloned.formKey = targetKey;
    cloned.copiedFrom = srcKey;
    cloned.copiedAt = new Date().toISOString();
    cloned.savedAt = new Date().toISOString();

    // Simpan ke localStorage di key tujuan
    const db = dbGet();
    const targetExisted = !!db[targetKey];
    db[targetKey] = cloned;

    // Jika mode pindah → hapus sumber lokal. Form tidak lagi milik key mana pun,
    // supaya flush/auto-save tidak "menghidupkan" kembali sumber yang baru dihapus.
    if (mode === 'move') {
      delete db[srcKey];
      formKey = null;
    }
    dbSet(db);

    // Sync ke Supabase (upsert tujuan; hapus sumber jika move)
    const offlineMode = typeof Auth !== 'undefined' && Auth.isOfflineMode && Auth.isOfflineMode();
    const row = buildSupabaseRow(cloned, targetFilter); // key = targetKey

    if (!offlineMode && isOnline() && typeof Sync !== 'undefined') {
      try {
        await Sync.pushRow(row);
        if (mode === 'move') {
          try {
            const client = SupabaseClient.getClient();
            if (client) {
              // Hapus lewat 4 kolom filter sumber (tahan terhadap baris lama yang key-nya tidak standar)
              await client.from(CONFIG.DB_TABLE).delete().match({
                date: srcFilter.rawDate, shift: srcFilter.shift,
                line: String(srcFilter.line), tahapan: srcFilter.stage,
              });
            }
          } catch (delErr) {
            console.warn('Gagal hapus sumber di Supabase:', delErr);
          }
        }
      } catch (err) {
        console.warn('Sync copy/move gagal, diantrekan:', err);
        Sync.queuePush(row);
      }
    } else if (!offlineMode && !isOnline() && typeof Sync !== 'undefined') {
      Sync.queuePush(row);
    }

    const action = mode === 'move' ? 'dipindahkan' : 'disalin';
    const label = `${targetFilter.rawDate} · S${targetFilter.shift} · L${targetFilter.line} · ${String(targetFilter.stage).toUpperCase()}`;
    return {
      ok: true,
      message: `Data berhasil ${action} ke ${label}${targetExisted ? ' (data lama ditimpa)' : ''}`,
      targetKey,
      targetFilter,
    };
  };

  /** Cek apakah slot tujuan sudah berisi data (lokal). */
  const targetExists = (targetFilter) => !!dbGet()[keyOf(targetFilter)];

  /** Cek slot tujuan di lokal DAN Supabase (untuk peringatan "akan ditimpa"). */
  const targetExistsAnywhere = async (targetFilter) => {
    if (targetExists(targetFilter)) return true;
    try {
      if (isOnline()) return !!(await supabaseSelect(targetFilter));
    } catch (_) { /* abaikan */ }
    return false;
  };

  /**
   * Diagnostik: cari sheet LOKAL yang isinya identik di key berbeda (jejak data dobel).
   * Jalankan di Console browser:  Storage.scanDuplicates()
   */
  const scanDuplicates = () => {
    const db = dbGet();
    const groups = {};
    Object.entries(db).forEach(([key, rec]) => {
      const rows = ((rec && rec.rows) || []).filter(r => r.kode || r.mulai || r.selesai || r.kegiatan);
      if (!rows.length) return;
      const sig = JSON.stringify(rows.map(r => [r.kode, r.mulai, r.selesai, r.durasi, r.kegiatan, r.good, r.defect]));
      (groups[sig] = groups[sig] || []).push(key);
    });
    const dup = Object.values(groups).filter(g => g.length > 1);
    if (!dup.length) { console.log('✓ Tidak ada sheet lokal dengan isi identik.'); return []; }
    console.warn(`${dup.length} grup sheet identik (kemungkinan salinan nyasar):`);
    dup.forEach(g => console.log('  •', g.sort().join('  ⇄  ')));
    return dup;
  };

  return {
    dbGet, dbSet, curKey, labelFilter, collect, applyRecord,
    loadRecord, saveData, autoSaveLocal, autoSaveSupabase, exportCsv,
    copyOrMoveRecord, targetExists, targetExistsAnywhere, scanDuplicates, activeFilter,
  };
})();
