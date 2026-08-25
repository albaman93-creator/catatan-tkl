/**
 * ROWS.JS
 * Menangani pembuatan, penghapusan, dan pengelolaan baris log sheet.
 * Juga dropdown produk dan tabel rincian performa produk.
 */
const Rows = (() => {
  'use strict';

  // ====== HELPER ======
  const getAllProducts = () => {
    const p1 = State.el.prodName1.value.trim();
    const p2 = State.el.prodName2.value.trim();
    const p3 = State.el.prodName3.value.trim();
    return [p1, p2, p3].filter(Boolean);
  };

  /**
   * Produk yang aktif untuk dropdown Batch pada baris log.
   * Di Mode Normal: semua produk Master Produk yang terisi.
   * Di Mode Cepat 1 / Mode Cepat 2: hanya produk yang dipilih user
   * saat setup mode cepat (lihat QuickMode), agar user fokus mengisi.
   */
  const getActiveProducts = () => {
    if (State.inputMode !== 'normal' && State.quickActiveProducts.length > 0) {
      return State.quickActiveProducts.filter(Boolean);
    }
    return getAllProducts();
  };

  const getRateForProduct = (prodName) => {
    if (!prodName) return 0;
    const names = [
      State.el.prodName1.value.trim(),
      State.el.prodName2.value.trim(),
      State.el.prodName3.value.trim()
    ];
    const rates = [
      parseFloat(State.el.prodRate1.value) || 0,
      parseFloat(State.el.prodRate2.value) || 0,
      parseFloat(State.el.prodRate3.value) || 0,
    ];
    const idx = names.indexOf(prodName);
    return idx >= 0 ? rates[idx] : 0;
  };

  /** Baca nilai produk/WO langsung dari DOM (lebih andal dari cache State). */
  const readProdSlot = (i) => {
    const nameEl = (State.el['prodName' + i]) || document.getElementById('prodName' + i)
      || document.getElementById('masterProdName' + i);
    const woEl = (State.el['prodWo' + i]) || document.getElementById('prodWo' + i)
      || document.getElementById('masterProdWo' + i);
    return {
      name: nameEl ? String(nameEl.value || '').trim() : '',
      wo: woEl ? String(woEl.value || '').trim() : '',
    };
  };

  /**
   * Cari No. WO untuk nama produk.
   * Cocokkan exact (ignore case), lalu prefix (VKAM1 ≈ VKAM1 Mixing L).
   */
  const getWoForProduct = (prodName) => {
    if (!prodName) return '';
    const needle = prodName.trim().toLowerCase();
    const slots = [1, 2, 3].map(readProdSlot);

    // 1) Exact match
    let hit = slots.find(s => s.name && s.name.toLowerCase() === needle);
    if (hit && hit.wo) return hit.wo;

    // 2) Prefix / contains (kode pendek vs nama panjang)
    hit = slots.find(s => {
      if (!s.name) return false;
      const n = s.name.toLowerCase();
      return n.startsWith(needle) || needle.startsWith(n) || n.includes(needle) || needle.includes(n);
    });
    if (hit && hit.wo) return hit.wo;

    return hit ? (hit.wo || '') : '';
  };

  /**
   * Isi No. WO baris mengikuti Produk yang dipilih.
   * Selalu dijalankan saat produk dipilih — tidak tergantung Kode.
   */
  const applyWoFromBatch = (tr) => {
    if (!tr) return;
    const batchEl = tr.querySelector('[data-f="batch"]');
    const woEl = tr.querySelector('[data-f="wo"]');
    if (!batchEl || !woEl) return;
    const prodName = (batchEl.value || '').trim();
    if (!prodName) return;
    const wo = getWoForProduct(prodName);
    if (wo) {
      woEl.value = wo;
      try { woEl.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
    }
  };

  /** Isi ulang WO di semua baris sesuai produk masing-masing. */
  const refreshAllRowWo = () => {
    rows().forEach(tr => applyWoFromBatch(tr));
  };

  // ====== DEFAULT JAM MULAI BARIS PERTAMA (mengikuti Shift terpilih) ======
  // Shift 1 -> 07:00, Shift 2 -> 15:30, Shift 3 -> 23:30
  const SHIFT_START_TIME = {
    0: '07:00', // Shift 1
    1: '15:30', // Shift 2
    2: '23:30', // Shift 3
  };

  const getSelectedShiftIndex = () => {
    const v = State.evalShift;
    return (typeof v === 'number' && v >= 0 && v <= 2) ? v : 0;
  };

  /** Isi jam mulai default HANYA untuk baris pertama & HANYA kalau kosong. */
  const applyDefaultStartTimeForFirstRow = (tr) => {
    if (!tr) return;
    if (rows().indexOf(tr) !== 0) return; // cuma baris pertama
    const mulaiEl = tr.querySelector('[data-f="mulai"]');
    if (!mulaiEl || mulaiEl.value.trim()) return; // sudah ada isi -> jangan timpa
    const defaultTime = SHIFT_START_TIME[getSelectedShiftIndex()];
    if (defaultTime) mulaiEl.value = defaultTime;
  };

  /**
   * Dipanggil saat user GANTI SHIFT (lihat UI.setEvalShift). Kalau jam mulai
   * baris pertama masih kosong ATAU masih berupa salah satu nilai default
   * (07:00 / 15:30 / 23:30 — bukan hasil isian manual operator), maka
   * di-refresh mengikuti shift yang baru dipilih.
   */
  const refreshFirstRowStartTime = () => {
    const first = rows()[0];
    if (!first) return;
    const mulaiEl = first.querySelector('[data-f="mulai"]');
    if (!mulaiEl) return;
    const currentVal = mulaiEl.value.trim();
    const isStillDefault = !currentVal || Object.values(SHIFT_START_TIME).includes(currentVal);
    if (isStillDefault) {
      const defaultTime = SHIFT_START_TIME[getSelectedShiftIndex()];
      if (defaultTime) mulaiEl.value = defaultTime;
    }
  };

  // ====== DROPDOWN PRODUK ======
  const updateAllDropdowns = () => {
    const prods = getActiveProducts();
    const selects = State.el.tbody.querySelectorAll('select[data-f="batch"]');
    selects.forEach(sel => {
      const currentVal = sel.value;
      sel.innerHTML = '<option value="">-- Pilih Produk --</option>';
      prods.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        if (p === currentVal) opt.selected = true;
        sel.appendChild(opt);
      });
      // Belum ada pilihan sama sekali -> otomatis default ke Produk 1 (atau
      // satu-satunya produk kalau memang cuma ada 1) supaya operator tidak
      // perlu klik pilih manual lagi. No. WO ikut mengikuti (lihat
      // applyWoFromBatch, refreshAllRowWo, hanya berlaku kalau Kode baris sudah terisi).
      if ((!currentVal || !prods.includes(currentVal)) && prods.length > 0) {
        sel.value = prods[0];
      }
      const tr = sel.closest('tr');
      if (tr) applyWoFromBatch(tr);
    });
    // Pastikan semua baris dapat WO terbaru
    refreshAllRowWo();
  };

  const updateMatrixProductHeaders = () => {
    State.el.thProd1.textContent = State.el.prodName1.value.trim() || 'Produk 1';
    State.el.thProd2.textContent = State.el.prodName2.value.trim() || 'Produk 2';
    State.el.thProd3.textContent = State.el.prodName3.value.trim() || 'Produk 3';
  };

  // ====== MANIPULASI BARIS ======
  const rows = () => Array.from(State.el.tbody.querySelectorAll('tr.log-row'));

  const updateRowNumbers = () => {
    rows().forEach((tr, i) => {
      const numCell = tr.querySelector('.col-num');
      if (numCell) numCell.textContent = i + 1;
    });
  };

  /**
   * Apply kategori (warna) ke baris berdasarkan kode.
   */
  const applyCat = (tr) => {
    const kodeInput = tr.querySelector('[data-f="kode"]');
    if (!kodeInput) return;
    const c = Utils.catOf(kodeInput.value.trim());
    if (c) tr.dataset.cat = c;
    else delete tr.dataset.cat;
  };

  /**
   * Buat satu baris log sheet baru.
   * @param {Object} data - Data untuk diisi ke input (optional, untuk load).
   */
  const makeRow = (data) => {
    const tr = document.createElement('tr');
    tr.className = 'log-row';

    const prods = getActiveProducts();
    const optionsHtml = '<option value="">-- Pilih Produk --</option>' +
      prods.map(p => `<option value="${p}">${p}</option>`).join('');

    tr.innerHTML = `
      <td class="col-num">${rows().length + 1}</td>
      <td class="col-kode"><div class="c-kode"><span class="dot"></span>
        <input data-f="kode" data-nav class="in mono ctr" type="tel" inputmode="numeric" maxlength="1" placeholder=" " aria-label="Kode">
      </div></td>
      <td class="col-op"><input data-f="op" data-nav class="in mono ctr" type="text" inputmode="numeric" maxlength="12" placeholder=" " aria-label="OP"></td>
      <td class="col-mulai"><input data-f="mulai" data-nav class="in mono ctr t-time" inputmode="numeric" maxlength="5" placeholder="--:--" aria-label="Jam Mulai"></td>
      <td class="col-panggil"><input data-f="panggil" data-nav class="in mono ctr t-time" inputmode="numeric" maxlength="5" placeholder="--:--" aria-label="Panggil Teknik"></td>
      <td class="col-teknik"><input data-f="teknik" data-nav class="in mono ctr t-time" inputmode="numeric" maxlength="5" placeholder="--:--" aria-label="Teknik Datang"></td>
      <td class="col-selesai"><input data-f="selesai" data-nav class="in mono ctr t-time" inputmode="numeric" maxlength="5" placeholder="--:--" aria-label="Jam Selesai"></td>
      <td class="col-durasi dur"><b class="dur-v"> </b><input data-f="durasi" data-nav class="in mono ctr durasi-input" type="text" inputmode="decimal" maxlength="4" placeholder="0" aria-label="Durasi (menit)" style="display:none"></td>
      <td class="col-kegiatan"><textarea data-f="kegiatan" data-nav class="in" placeholder="Kegiatan " aria-label="Kegiatan" rows="1"></textarea></td>
      <td class="col-masalah"><textarea data-f="masalah" data-nav class="in" placeholder="Penyebab " aria-label="Masalah" rows="1"></textarea></td>
      <td class="col-disposisi"><textarea data-f="disposisi" data-nav class="in" placeholder="Tindakan " aria-label="Disposisi" rows="1"></textarea></td>
      <td class="col-wo"><textarea data-f="wo" data-nav class="in mono wo-wrap" placeholder="No WO " aria-label="Nomor WO" rows="1"></textarea></td>
      <td class="col-batch"><select data-f="batch" data-nav class="in mono" aria-label="Produk & Batch">${optionsHtml}</select></td>
      <td class="col-good"><input data-f="good" data-nav class="in mono ctr" inputmode="decimal" placeholder="0" aria-label="Good"></td>
      <td class="col-defect"><input data-f="defect" data-nav class="in mono ctr" inputmode="decimal" placeholder="0" aria-label="Defect"></td>
      <td class="col-aksi c-aksi"><button type="button" class="del" title="Hapus baris"> </button></td>
    `;

    if (data) {
      CONFIG.NAV_FIELDS.forEach(f => {
        const el = tr.querySelector(`[data-f="${f}"]`);
        if (el && data[f] != null) {
          el.value = data[f];
          if (['kegiatan','masalah','disposisi'].includes(f)) {
            setTimeout(() => UI.autoResizeTextarea(el), 10);
          }
        }
      });
    } else if (prods.length > 0) {
      // Baris baru (bukan hasil load data lama) — Produk otomatis di-default
      // ke Produk 1 (kalau cuma ada 1 produk terdaftar, otomatis itu saja,
      // operator tidak perlu klik pilih lagi). No. WO ikut menyesuaikan
      // (hanya kalau Kode baris ini sudah terisi — lihat applyWoFromBatch).
      const batchEl = tr.querySelector('[data-f="batch"]');
      if (batchEl) batchEl.value = prods[0];
    }

    State.el.tbody.appendChild(tr);
    applyCat(tr);
    Navigation.syncColumnVisibility();
    const kegiatanEl = tr.querySelector('[data-f="kegiatan"]');
    if (kegiatanEl && typeof Suggest !== 'undefined') Suggest.attachGhost(kegiatanEl);
    applyWoFromBatch(tr);
    // Baris baru kosong (bukan hasil load data lama) -> kalau ini baris
    // pertama, isi jam mulai otomatis sesuai Shift yang sedang dipilih.
    if (!data) applyDefaultStartTimeForFirstRow(tr);
    return tr;
  };

  // ====== CASCADE PRODUK KE BAWAH ======
  /**
   * Ketika user mengubah produk di suatu baris, semua baris di bawahnya
   * akan mengikuti produk yang sama. Baris di atas tidak berubah.
   */
  const cascadeProductToBelow = (startTr, productName) => {
    const allRows = rows();
    const startIdx = allRows.indexOf(startTr);
    if (startIdx < 0 || !productName) return;

    // Loop mulai dari baris setelah startTr
    for (let i = startIdx + 1; i < allRows.length; i++) {
      const tr = allRows[i];
      const batchEl = tr.querySelector('[data-f="batch"]');
      if (batchEl) {
        batchEl.value = productName;
        // Update WO langsung tanpa memicu event change agar tidak infinite loop
        applyWoFromBatch(tr);
      }
    }
  };

  // ====== TABEL RINCIAN PRODUK ======
  const updateProductDetailTable = () => {
    const container = State.el.tbodyProdDetail;
    if (!container) return;
    container.innerHTML = '';

    const prods = getActiveProducts();

    if (prods.length === 0) {
      container.innerHTML = `
        <div class="product-detail-empty">
          Belum ada produk terdaftar di Master Produk.
        </div>`;
      return;
    }

    const summary = {};
    prods.forEach(p => {
      summary[p] = {
        durasiValid: 0,       // Waktu produktif valid (Kode produksi dengan Good >= 1) untuk target
        durasiTotal: 0,       // Total waktu keseluruhan aktivitas dengan batch ini (kode apapun)
        durasiProdAll: 0,     // Total waktu seluruh kode produksi (baik ada good maupun kosong)
        durasiPlannedDT: 0,   // Total waktu Planned Down Time (Kode 5, 6, 7, 8)
        durasiUnplannedDT: 0, // Total waktu Unplanned Down Time (Kode 1, 3, 4, 9)
        rate: getRateForProduct(p),
        actual: 0
      };
    });

    rows().forEach(tr => {
      const g = (f) => {
        const el = tr.querySelector(`[data-f="${f}"]`);
        return el ? el.value : '';
      };
      const kodeStr = g('kode').trim();
      const kodeNum = parseInt(kodeStr, 10);
      const mulai = Utils.parseTime(g('mulai'));
      const selesai = Utils.parseTime(g('selesai'));
      const prodName = g('batch');
      const goodVal = parseFloat(String(g('good') || '0').replace(',', '.')) || 0;
      const defectVal = parseFloat(String(g('defect') || '0').replace(',', '.')) || 0;
      const rowActual = goodVal + defectVal;

      if (mulai == null || selesai == null || !prodName || !summary[prodName]) return;
      const dur = (selesai - mulai + 1440) % 1440;
      const si = Utils.shiftOf(mulai);

      if (si === State.evalShift) {
        // 1. Total waktu keseluruhan aktivitas (kode apapun)
        summary[prodName].durasiTotal += dur;

        // Kategori Down Time & Produksi
        if (CONFIG.PLANNED_CODES.has(kodeNum)) {
          summary[prodName].durasiPlannedDT += dur;
        } else if (CONFIG.UNPLANNED_CODES.has(kodeNum)) {
          summary[prodName].durasiUnplannedDT += dur;
        } else if (Utils.catOf(kodeStr) === 'prod') {
          summary[prodName].durasiProdAll += dur; // Total waktu kategori produksi

          // Syarat valid untuk target: Kode produksi DAN kolom Good terisi >= 1
          if (goodVal >= 1) {
            summary[prodName].durasiValid += dur;
            summary[prodName].actual += rowActual;
          }
        }
      }
    });

    prods.forEach((p, index) => {
      const item = summary[p];
      const targetG = item.durasiValid * item.rate;
      const perfP = targetG > 0 ? (item.actual / targetG) * 100 : 0;

      const perfColor = perfP >= CONFIG.TARGET.PERFORMANCE
        ? 'color:var(--green-d);font-weight:700;'
        : 'color:var(--red);font-weight:700;';

      const block = document.createElement('div');
      block.className = 'product-detail-block';

      const title = document.createElement('div');
      title.className = 'product-detail-title';
      title.innerHTML = `<span>Produk ${index + 1}</span><strong>— ${Utils.escapeHtml ? Utils.escapeHtml(p) : p}</strong>`;
      block.appendChild(title);

      const productTable = document.createElement('table');
      productTable.className = 'shift product-detail-table';
      productTable.innerHTML = `
        <thead>
          <tr>
            <th>Nama Produk</th>
            <th>Durasi output kode 2 (mnt)</th>
            <th>Rate (u/mnt)</th>
            <th>Target (G)</th>
            <th>Aktual (H)</th>
            <th>% Perf</th>
          </tr>
        </thead>
        <tbody>
          <tr class="perf-prod-row">
            <td style="text-align:left; font-weight:700;">📦 ${Utils.escapeHtml ? Utils.escapeHtml(p) : p}</td>
            <td style="text-align:center;"><b>${Utils.nf0(item.durasiValid)}</b></td>
            <td style="text-align:center;">${Utils.nf0(item.rate)}</td>
            <td style="text-align:center;">${Utils.nf0(targetG)}</td>
            <td style="text-align:center;">${Utils.nf0(item.actual)}</td>
            <td style="text-align:center; ${perfColor}">${Utils.nf2(perfP)} %</td>
          </tr>
        </tbody>`;
      block.appendChild(productTable);

      const summaryTable = document.createElement('table');
      summaryTable.className = 'shift product-summary-table';
      summaryTable.innerHTML = `
        <thead>
          <tr><th>Ringkasan Waktu</th><th>Nilai</th></tr>
        </thead>
        <tbody>
          <tr class="summary-row summary-total"><td>⏱️ Total Waktu Terpakai</td><td><b>${Utils.nf0(item.durasiTotal)} mnt</b></td></tr>
          <tr class="summary-row summary-prod"><td>✅ Waktu Produktif — total Kode 2</td><td><b>${Utils.nf0(item.durasiProdAll)} mnt</b></td></tr>
          <tr class="summary-row summary-prod-valid"><td>✅ Waktu Produktif — Kode 2 dengan output ≥ 1 pcs</td><td><b style="color:var(--green-d);">${Utils.nf0(item.durasiValid)} mnt</b></td></tr>
          <tr class="summary-row summary-planned"><td>🟨 Planned Down Time — Kode 5, 6, 7, 8</td><td><b style="color:var(--amber);">${Utils.nf0(item.durasiPlannedDT)} mnt</b></td></tr>
          <tr class="summary-row summary-unplanned"><td>🟥 Unplanned Down Time — Kode 1, 3, 4, 9</td><td><b style="color:var(--red);">${Utils.nf0(item.durasiUnplannedDT)} mnt</b></td></tr>
        </tbody>`;
      block.appendChild(summaryTable);

      container.appendChild(block);
    });
  };

  // ====== EXPORT ======
  return {
    getActiveProducts,
    getRateForProduct,
    getWoForProduct,
    applyWoFromBatch,
    rows,
    updateRowNumbers,
    applyCat,
    makeRow,
    updateAllDropdowns,
    updateMatrixProductHeaders,
    updateProductDetailTable,
    applyDefaultStartTimeForFirstRow,
    refreshFirstRowStartTime,
    cascadeProductToBelow,
  };
})();