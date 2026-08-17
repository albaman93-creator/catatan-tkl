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

  /**
   * No. WO yang terdaftar untuk 1 produk di Master Produk (slot 1/2/3).
   * Dipakai supaya kolom "Nomor WO" pada baris log bisa otomatis mengikuti
   * produk yang dipilih di kolom "Produk & Batch" — tiap produk boleh
   * punya No. WO sendiri-sendiri.
   */
  const getWoForProduct = (prodName) => {
    if (!prodName || !State.el.prodWo1) return '';
    const names = [
      State.el.prodName1.value.trim(),
      State.el.prodName2.value.trim(),
      State.el.prodName3.value.trim()
    ];
    const wos = [
      State.el.prodWo1.value.trim(),
      State.el.prodWo2.value.trim(),
      State.el.prodWo3.value.trim(),
    ];
    const idx = names.indexOf(prodName);
    return idx >= 0 ? wos[idx] : '';
  };

  /**
   * Auto-isi kolom "Nomor WO" pada 1 baris berdasarkan produk yang dipilih
   * di kolom "Produk & Batch" baris itu (fallback ke WO default Wizard
   * kalau produknya tidak punya WO khusus).
   *
   * SENGAJA hanya mengisi No. WO kalau kolom Kode baris tsb SUDAH terisi
   * (kolom Produk & Batch sendiri boleh ke-cascade duluan ke banyak baris —
   * lihat QuickMode.handleBatchChange — tapi No. WO baru menyusul begitu
   * operator benar-benar mengisi Kode baris itu, supaya baris kosong yang
   * belum dipakai tidak kelihatan "sudah ada WO" padahal belum dikerjakan).
   *
   * @param {HTMLElement} tr - baris <tr> tabel log.
   * @param {Object} opts - { force: true } untuk menimpa WO yang sudah
   *        diisi manual (dipakai saat user baru saja MEMILIH produknya);
   *        default false supaya tidak menimpa isian manual operator saat
   *        trigger-nya cuma dari mengetik Kode.
   */
  const autoFillWoForRow = (tr, opts) => {
    if (!tr) return;
    const force = !!(opts && opts.force);
    const kodeEl = tr.querySelector('[data-f="kode"]');
    if (!kodeEl || kodeEl.value.trim() === '') return; // gerbang: Kode wajib terisi dulu
    const batchEl = tr.querySelector('[data-f="batch"]');
    const woEl = tr.querySelector('[data-f="wo"]');
    if (!batchEl || !woEl) return;
    if (!force && woEl.value.trim() !== '') return; // jangan timpa isian manual
    const prod = batchEl.value;
    if (!prod) return;
    const finalWo = getWoForProduct(prod) || State.defaultWO || '';
    if (!finalWo || woEl.value === finalWo) return;
    woEl.value = finalWo;
    if (typeof FormModeFull !== 'undefined' && FormModeFull.refreshWoField) FormModeFull.refreshWoField(tr);
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
    });
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
      <td class="col-mulai"><input data-f="mulai" data-nav class="in mono ctr t-time" inputmode="numeric" maxlength="5" placeholder="--:--" aria-label="Jam Mulai"></td>
      <td class="col-panggil"><input data-f="panggil" data-nav class="in mono ctr t-time" inputmode="numeric" maxlength="5" placeholder="--:--" aria-label="Panggil Teknik"></td>
      <td class="col-teknik"><input data-f="teknik" data-nav class="in mono ctr t-time" inputmode="numeric" maxlength="5" placeholder="--:--" aria-label="Teknik Datang"></td>
      <td class="col-selesai"><input data-f="selesai" data-nav class="in mono ctr t-time" inputmode="numeric" maxlength="5" placeholder="--:--" aria-label="Jam Selesai"></td>
      <td class="col-durasi dur"><b class="dur-v"> </b><input data-f="durasi" data-nav class="in mono ctr durasi-input" type="text" inputmode="decimal" maxlength="4" placeholder="0" aria-label="Durasi (menit)" style="display:none"></td>
      <td class="col-kegiatan"><textarea data-f="kegiatan" data-nav class="in" placeholder="Kegiatan " aria-label="Kegiatan" rows="1"></textarea></td>
      <td class="col-masalah"><textarea data-f="masalah" data-nav class="in" placeholder="Penyebab " aria-label="Masalah" rows="1"></textarea></td>
      <td class="col-disposisi"><textarea data-f="disposisi" data-nav class="in" placeholder="Tindakan " aria-label="Disposisi" rows="1"></textarea></td>
      <td class="col-wo"><input data-f="wo" data-nav class="in mono" placeholder="No WO " aria-label="Nomor WO"></td>
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
    }
    // Catatan: No. WO baris baru yang masih kosong SENGAJA tidak diisi di
    // sini — baru diisi otomatis lewat autoFillWoForRow() begitu operator
    // mengisi kolom Kode baris ini (lihat app.js & quickmode.js), supaya
    // baris kosong yang belum dipakai tidak ikut kecolongan keisi WO/Batch.

    State.el.tbody.appendChild(tr);
    applyCat(tr);
    Navigation.syncColumnVisibility();
    const kegiatanEl = tr.querySelector('[data-f="kegiatan"]');
    if (kegiatanEl && typeof Suggest !== 'undefined') Suggest.attachGhost(kegiatanEl);
    return tr;
  };

  // ====== TABEL RINCIAN PRODUK ======
  const updateProductDetailTable = () => {
    const tbody = State.el.tbodyProdDetail;
    if (!tbody) return;
    tbody.innerHTML = '';
    const prods = getActiveProducts();

    if (prods.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--mut);">Belum ada produk terdaftar di Master Produk.</td></tr>';
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

    let hasData = false;
    prods.forEach(p => {
      const item = summary[p];
      const targetG = item.durasiValid * item.rate;
      const perfP = targetG > 0 ? (item.actual / targetG) * 100 : 0;

      if (item.durasiTotal > 0 || item.actual > 0) hasData = true;

      const perfColor = perfP >= CONFIG.TARGET.PERFORMANCE
        ? 'color:var(--green-d);font-weight:700;'
        : 'color:var(--red);font-weight:700;';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="text-align:left; padding: 10px 12px;">
          <div style="font-weight:700; color:var(--ink); font-size: 14px;">📦 ${p}</div>
          <div style="font-size: 11.5px; color: var(--mut); margin-top: 6px; line-height: 1.5; background: #f8fafc; padding: 8px 10px; border-radius: 6px; border: 1px solid var(--line2);" class="perf-detail-box">
            <div>⏱️ Total Waktu Keseluruhan: <b>${Utils.nf0(item.durasiTotal)} mnt</b></div>
            <div>⚙️ Waktu Produktif (Semua Kode 2): <b>${Utils.nf0(item.durasiProdAll)} mnt</b></div>
            <div>✅ Waktu Produktif Valid (Good ≥ 1): <b style="color:var(--green-d);">${Utils.nf0(item.durasiValid)} mnt</b></div>
            <div>🟨 Planned Down Time (Kode 5,6,7,8): <b style="color:var(--amber);">${Utils.nf0(item.durasiPlannedDT)} mnt</b></div>
            <div>🟥 Unplanned Down Time (Kode 1,3,4,9): <b style="color:var(--red);">${Utils.nf0(item.durasiUnplannedDT)} mnt</b></div>
          </div>
        </td>
        <td style="text-align:center;"><b>${Utils.nf0(item.durasiValid)}</b></td>
        <td style="text-align:center;">${Utils.nf0(item.rate)}</td>
        <td style="text-align:center;">${Utils.nf0(targetG)}</td>
        <td style="text-align:center;">${Utils.nf0(item.actual)}</td>
        <td style="text-align:center; ${perfColor}">${Utils.nf2(perfP)} %</td>
      `;
      tbody.appendChild(tr);
    });

    if (!hasData) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--mut);">Belum ada catatan log aktif untuk produk-produk ini pada Shift ${State.evalShift + 1}.</td></tr>`;
    }
  };

  return {
    getActiveProducts, getRateForProduct, getWoForProduct, autoFillWoForRow,
    rows, updateRowNumbers, applyCat, makeRow,
    updateAllDropdowns, updateMatrixProductHeaders,
    updateProductDetailTable,
  };
})();