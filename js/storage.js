/**
 * STORAGE.JS
 * Menangani penyimpanan lokal (localStorage) dan sinkronisasi ke Google Sheets.
 */
const Storage = (() => {
  'use strict';

  // ====== LOCAL STORAGE ======
  const dbGet = () => {
    try { return JSON.parse(localStorage.getItem(CONFIG.DB_KEY)) || {}; }
    catch(e) { return {}; }
  };
  const dbSet = (db) => {
    try { localStorage.setItem(CONFIG.DB_KEY, JSON.stringify(db)); }
    catch(e) {}
  };

  /**
   * Buat unique key untuk record berdasarkan filter aktif.
   * Format: "YYYY-MM-DD|S1|L1|mixing"
   */
  const curKey = () => {
    const date = State.el.fDate.value || Utils.todayLocal();
    return `${date}|S${State.evalShift + 1}|L${State.el.fLine.value}|${State.el.fStage.value}`;
  };

  const labelFilter = () => {
    const rawDate = State.el.fDate.value || Utils.todayLocal();
    return `${Utils.formatDateText(rawDate)} · Shift ${State.evalShift + 1} · Line ${State.el.fLine.value} · ${State.el.fStage.value.toUpperCase()}`;
  };

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
  };

  // ====== CLOUD SYNC ======
  const loadRecord = () => {
    UI.setSyncStatus('sync', 'memuat dari cloud…');

    const rawDate = State.el.fDate.value || Utils.todayLocal();
    const bodyObj = {
      action: 'load',
      token:  CONFIG.SHEETS_TOKEN,
      date:   Utils.formatDateText(rawDate),
      shift:  State.evalShift + 1,
      line:   State.el.fLine.value,
      stage:  State.el.fStage.value,
    };

    fetch(CONFIG.SHEETS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(bodyObj),
    })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(j => {
      if (j && j.ok && j.data) {
        const db = dbGet();
        db[curKey()] = j.data;
        dbSet(db);
        applyRecord(j.data);
        UI.setSyncStatus('ok', '✓ sinkron dari cloud');
      } else {
        applyRecord(null);
        UI.setSyncStatus('ok', 'data kosong di cloud');
      }
    })
    .catch(() => {
      const db = dbGet();
      applyRecord(db[curKey()] || null);
      UI.setSyncStatus('err', 'offline · mode lokal');
    });
  };

  const saveData = (opts = {}) => {
    const rec = collect();
    const db = dbGet();
    db[curKey()] = rec;
    dbSet(db);

    State.el.lastSaved.textContent = '✓ tersimpan ' + new Date().toLocaleTimeString('id-ID');
    UI.updateEditChip(rec);
    if (!opts.silent) UI.toast('Data tersimpan lokal ✓');

    UI.setSyncStatus('sync', 'mengunggah…');
    const rawDate = State.el.fDate.value || Utils.todayLocal();
    const bodyObj = {
      action: 'save',
      token:  CONFIG.SHEETS_TOKEN,
      date:   Utils.formatDateText(rawDate),
      shift:  State.evalShift + 1,
      line:   State.el.fLine.value,
      stage:  State.el.fStage.value,
      payload: rec,
    };

    fetch(CONFIG.SHEETS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(bodyObj),
    })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(j => {
      if (!j || j.ok === false) throw new Error((j && j.error) || 'server error');
      UI.setSyncStatus('ok', '✓ tersinkron cloud');
      if (j.updatedAt) {
        rec.savedAt = j.updatedAt;
        db[curKey()] = rec;
        dbSet(db);
        UI.updateEditChip(rec);
      }
      if (!opts.silent) UI.toast('Sync cloud ✓ ' + labelFilter());
    })
    .catch(err => {
      UI.setSyncStatus('err', '⚠ sync gagal: ' + err.message);
      if (!opts.silent) UI.toast('Tersimpan LOKAL — sync gagal ⚠', true);
    });
  };

  return { dbGet, dbSet, curKey, labelFilter, collect, applyRecord, loadRecord, saveData };
})();
