/**
 * ROWS.JS
 * Menangani pembuatan, penghapusan, dan pengelolaan baris log sheet.
 * Juga dropdown produk dan tabel rincian performa produk.
 */
const Rows = (() => {
  'use strict';

  // ====== HELPER ======
  /** BN slot i — teks bebas (user ketik manual, termasuk L jika perlu). */
  const getBn = (i) => {
    const el = (State.el && State.el['prodBn' + i]) || document.getElementById('prodBn' + i);
    return el ? String(el.value || '').trim() : '';
  };

  /** Gabung kode produk + BN → label dropdown, mis. "VTTS1 L030101". */
  const composeLabel = (name, bn) => {
    const n = String(name || '').trim();
    const b = String(bn || '').trim();
    if (!n) return '';
    return b ? `${n} ${b}` : n;
  };

  /** Label produk slot i (kode + BN). */
  const productLabel = (i) => {
    const nameEl = (State.el && State.el['prodName' + i]) || document.getElementById('prodName' + i);
    const name = nameEl ? nameEl.value.trim() : '';
    return composeLabel(name, getBn(i));
  };

  const getAllProducts = () => {
    return [1, 2, 3].map(productLabel).filter(Boolean);
  };

  /**
   * Cocokkan label batch baris ke slot Master Produk 1–3.
   * Pilih kecocokan PALING SPESIFIK (label/nama terpanjang), supaya
   * "VPEL1 mixing L027103" tidak tertarik ke slot "VPEL1" hanya karena
   * berbagi kata pertama. Urutan skor:
   *   100 exact label (nama+BN) · 90 exact nama · 80 prefix label · 50 prefix nama
   * Tidak memakai "kata pertama saja" — itu yang membuat multi-produk
   * dengan kode sama (VPEL1 vs VPEL1 mixing) saling menumpuk.
   */
  const findProductSlot = (prodLabel) => {
    if (!prodLabel) return -1;
    const needle = String(prodLabel).trim().toLowerCase();
    if (!needle) return -1;
    let best = -1, bestScore = 0;
    for (let i = 1; i <= 3; i++) {
      const nameEl = (State.el && State.el['prodName' + i]) || document.getElementById('prodName' + i);
      const name = nameEl ? nameEl.value.trim() : '';
      if (!name) continue;
      const label = composeLabel(name, getBn(i));
      const n = name.toLowerCase();
      const l = label.toLowerCase();
      let score = 0;
      if (l === needle) score = 100;
      else if (n === needle) score = 90;
      else if (needle.startsWith(l + ' ')) score = 80 + Math.min(l.length, 19);
      else if (needle.startsWith(n + ' ')) score = 50 + Math.min(n.length, 19);
      // Bonus panjang nama: "VPEL1 mixing" (12) mengalahkan "VPEL1" (5)
      // saat keduanya prefix-match, tanpa mengandalkan urutan slot.
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return best;
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
    const slot = findProductSlot(prodName);
    if (slot < 0) return 0;
    const el = (State.el && State.el['prodRate' + slot]) || document.getElementById('prodRate' + slot);
    return parseFloat(el?.value) || 0;
  };

  /** Ukuran kemasan (ml) dari master produk — untuk tabel rate Kemas L2. */
  const getUkuranForProduct = (prodName) => {
    const slot = findProductSlot(prodName);
    if (slot < 0) return '';
    const el = (State.el && State.el['prodUkuran' + slot]) || document.getElementById('prodUkuran' + slot);
    return String(el?.value || '');
  };

  /** Kemas Line 1 & 2 memakai tabel rate man power; L4 & tahapan lain = rate mesin. */
  const usesManpowerRate = () => {
    const stage = String(State.el.fStage?.value || '').toLowerCase();
    const line = String(State.el.fLine?.value || '');
    return stage === 'kemas' && (line === '1' || line === '2');
  };

  /**
   * Rate efektif (bag/mnt).
   * Kemas L1: OP < 3 → 8; OP ≥ 3 → 12 (batas mesin).
   * Kemas L2: tabel ukuran (100/250/500) × band OP (≤3 vs >3).
   * Lainnya: Rate master produk.
   */
  const getEffectiveRate = (prodName, opValue) => {
    const stage = String(State.el.fStage?.value || '').toLowerCase();
    const line = String(State.el.fLine?.value || '');
    const op = parseFloat(String(opValue ?? '').replace(',', '.'));
    const orang = (Number.isFinite(op) && op > 0) ? op : 0;

    if (stage === 'kemas' && line === '1') {
      const cfg = CONFIG.KEMAS_L1_RATE || { low: 8, high: 12, opThreshold: 3 };
      // OP kosong → anggap full team (≥ threshold)
      if (!(orang > 0) || orang >= (cfg.opThreshold || 3)) return cfg.high;
      return cfg.low;
    }

    if (stage === 'kemas' && line === '2') {
      const uk = getUkuranForProduct(prodName);
      const table = (CONFIG.KEMAS_L2_RATE || {})[uk];
      if (table) {
        if (!(orang > 0) || orang <= 3) return table.le3;
        return table.gt3;
      }
      // Ukuran belum diisi → fallback rate master
      return getRateForProduct(prodName);
    }

    return getRateForProduct(prodName);
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
   * Cari No. WO untuk nama produk / label batch.
   * Cocokkan slot via findProductSlot (kode, BN, atau label gabungan).
   */
  const getWoForProduct = (prodName) => {
    if (!prodName) return '';
    const slot = findProductSlot(prodName);
    if (slot > 0) {
      const woEl = (State.el && State.el['prodWo' + slot]) || document.getElementById('prodWo' + slot)
        || document.getElementById('masterProdWo' + slot);
      return woEl ? String(woEl.value || '').trim() : '';
    }
    // Fallback: prefix match pada kode produk
    const needle = prodName.trim().toLowerCase();
    for (let i = 1; i <= 3; i++) {
      const s = readProdSlot(i);
      if (!s.name) continue;
      const n = s.name.toLowerCase();
      if (n.startsWith(needle) || needle.startsWith(n) || n.includes(needle) || needle.includes(n)) {
        return s.wo || '';
      }
    }
    return '';
  };

  /**
   * Isi No. WO baris mengikuti Produk yang dipilih.
   * Selalu dijalankan saat produk dipilih — tidak tergantung Kode.
   */
  /**
   * Isi No. WO baris mengikuti Produk yang dipilih.
   * @param {HTMLElement} tr
   * @param {{ silent?: boolean }} [opts] silent=true → tidak dispatch event (bulk update, hindari lag)
   */
  const applyWoFromBatch = (tr, opts) => {
    if (!tr) return;
    const batchEl = tr.querySelector('[data-f="batch"]');
    const woEl = tr.querySelector('[data-f="wo"]');
    if (!batchEl || !woEl) return;
    const prodName = (batchEl.value || '').trim();
    if (!prodName) return;
    const wo = getWoForProduct(prodName);
    if (wo && woEl.value !== wo) {
      woEl.value = wo;
      if (!opts || !opts.silent) {
        try { woEl.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
      } else if (typeof UI !== 'undefined' && UI.autoResizeTextarea) {
        try { UI.autoResizeTextarea(woEl); } catch (e) {}
      }
    }
  };

  /** Isi ulang WO di semua baris sesuai produk masing-masing (silent = tanpa cascade event). */
  const refreshAllRowWo = () => {
    rows().forEach(tr => applyWoFromBatch(tr, { silent: true }));
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
    const prodsKey = prods.join('\0');
    const selects = State.el.tbody.querySelectorAll('select[data-f="batch"]');
    selects.forEach(sel => {
      const currentVal = sel.value;
      // Skip rebuild DOM jika daftar produk tidak berubah (hindari lag saat ketik WO/rate)
      const existing = Array.from(sel.options).slice(1).map((o) => o.value);
      const sameList = existing.length === prods.length && existing.every((v, i) => v === prods[i]);
      if (!sameList) {
        sel.innerHTML = '<option value="">-- Pilih Produk --</option>';
        prods.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p;
          opt.textContent = p;
          if (p === currentVal) opt.selected = true;
          sel.appendChild(opt);
        });
      }
      // Belum ada pilihan sama sekali -> otomatis default ke Produk 1
      if ((!currentVal || !prods.includes(currentVal)) && prods.length > 0) {
        sel.value = prods[0];
      }
      const tr = sel.closest('tr');
      if (tr) applyWoFromBatch(tr, { silent: true });
    });
    // Pastikan semua baris dapat WO terbaru (satu kali, silent)
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
      <td class="col-aksi c-aksi">
        <button type="button" class="btn-icon btn-insert" title="Sisip baris di bawah">➕</button>
        <button type="button" class="del" title="Hapus baris">✕</button>
      </td>
      <td class="col-num">${rows().length + 1}</td>
      <td class="col-kode"><div class="c-kode"><span class="dot"></span>
        <input data-f="kode" data-nav class="in mono ctr" type="tel" inputmode="numeric" maxlength="1" placeholder=" " aria-label="Kode">
      </div></td>
      <td class="col-op"><input data-f="op" data-nav class="in mono ctr" type="text" inputmode="numeric" maxlength="12" placeholder="org" aria-label="Jumlah orang (OP)" title="Kemas L1: OP&lt;3→8, OP≥3→12 bag/mnt. Kemas L2: tergantung ukuran produk + OP"></td>
      <td class="col-mulai"><input data-f="mulai" data-nav class="in mono ctr t-time" inputmode="numeric" maxlength="5" placeholder="--:--" aria-label="Jam Mulai"></td>
      <td class="col-panggil"><input data-f="panggil" data-nav class="in mono ctr t-time" inputmode="numeric" maxlength="5" placeholder="--:--" aria-label="Panggil Teknik"></td>
      <td class="col-teknik"><input data-f="teknik" data-nav class="in mono ctr t-time" inputmode="numeric" maxlength="5" placeholder="--:--" aria-label="Teknik Datang"></td>
      <td class="col-selesai"><input data-f="selesai" data-nav class="in mono ctr t-time" inputmode="numeric" maxlength="5" placeholder="--:--" aria-label="Jam Selesai"></td>
      <td class="col-durasi dur"><b class="dur-v" style="display:none"> </b><input data-f="durasi" data-nav class="in mono ctr durasi-input" type="text" inputmode="decimal" maxlength="4" placeholder="0" aria-label="Durasi (menit)"></td>
      <td class="col-kegiatan"><textarea data-f="kegiatan" data-nav class="in" placeholder="Kegiatan " aria-label="Kegiatan" rows="1"></textarea></td>
      <td class="col-masalah"><textarea data-f="masalah" data-nav class="in" placeholder="Penyebab " aria-label="Masalah" rows="1"></textarea></td>
      <td class="col-ms"><input data-f="ms" data-nav class="in mono ctr" type="text" inputmode="numeric" maxlength="4" placeholder="0" aria-label="Minor Stop (kali)" title="Minor Stop — isi angka frekuensi (kali) pada baris ini"></td>
      <td class="col-disposisi"><textarea data-f="disposisi" data-nav class="in" placeholder="Tindakan " aria-label="Disposisi" rows="1"></textarea></td>
      <td class="col-desc"><textarea data-f="description" data-nav class="in" placeholder="Keterangan bebas…" aria-label="Description" rows="1" title="Catatan acak operator: downtime, trial, dll."></textarea></td>
      <td class="col-wo"><textarea data-f="wo" data-nav class="in mono wo-wrap" placeholder="No WO " aria-label="Nomor WO" rows="1"></textarea></td>
      <td class="col-batch"><select data-f="batch" data-nav class="in mono" aria-label="Produk & Batch">${optionsHtml}</select></td>
      <td class="col-good"><input data-f="good" data-nav class="in mono ctr" inputmode="decimal" placeholder="0" aria-label="Good"></td>
      <td class="col-defect"><input data-f="defect" data-nav class="in mono ctr" inputmode="decimal" placeholder="0" aria-label="Defect"></td>
    `;

    if (data) {
      CONFIG.NAV_FIELDS.forEach(f => {
        const el = tr.querySelector(`[data-f="${f}"]`);
        if (el && data[f] != null) {
          el.value = data[f];
          if (['kegiatan','masalah','disposisi','description'].includes(f)) {
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

  /**
   * Gulir baris agar terlihat di dalam #tblWrap (viewport ~10 baris).
   * Memperhitungkan tinggi header sticky agar baris tidak tertutup header.
   */
  const scrollRowIntoView = (tr, opts = {}) => {
    const wrap = (State.el && State.el.tblWrap) || document.getElementById('tblWrap');
    if (!wrap || !tr) return;

    const behavior = opts.behavior || 'smooth';
    const wrapRect = wrap.getBoundingClientRect();
    const rowRect = tr.getBoundingClientRect();

    // Tinggi header sticky (1 atau 2 baris thead)
    const thead = wrap.querySelector('table.log thead');
    const headH = thead ? thead.offsetHeight : 48;
    const pad = 4;

    const topVisible = wrapRect.top + headH + pad;
    const bottomVisible = wrapRect.bottom - pad;

    if (rowRect.top < topVisible) {
      const delta = rowRect.top - topVisible;
      wrap.scrollBy({ top: delta, behavior });
    } else if (rowRect.bottom > bottomVisible) {
      const delta = rowRect.bottom - bottomVisible;
      wrap.scrollBy({ top: delta, behavior });
    }
  };

  /** Tandai baris baru untuk animasi masuk singkat (opsional). */
  const markRowEnter = (tr) => {
    if (!tr) return;
    tr.classList.add('log-row-enter');
    const done = () => {
      tr.classList.remove('log-row-enter');
      tr.removeEventListener('animationend', done);
    };
    tr.addEventListener('animationend', done);
  };

  /**
   * Sisip baris baru tepat di bawah targetTr.
   * Jam Mulai baris baru = Jam Selesai baris atas (targetTr).
   */
  const insertRowAfter = (targetTr) => {
    if (!targetTr || !targetTr.parentNode) return null;

    const newRow = makeRow(); // append di akhir, lalu dipindah
    targetTr.after(newRow);

    // Logika Jam Otomatis: Jam Selesai baris atas → Jam Mulai baris baru
    const selesaiEl = targetTr.querySelector('[data-f="selesai"]');
    const mulaiEl = newRow.querySelector('[data-f="mulai"]');
    if (selesaiEl && mulaiEl && selesaiEl.value.trim()) {
      mulaiEl.value = selesaiEl.value.trim();
      mulaiEl.classList.remove('invalid');
    }

    // Alias sesuai instruksi: renumberRows → updateRowNumbers
    updateRowNumbers();
    markRowEnter(newRow);

    if (typeof Calculation !== 'undefined' && Calculation.recalc) {
      Calculation.recalc();
    }
    if (typeof Navigation !== 'undefined') {
      if (Navigation.applyTabOrder) Navigation.applyTabOrder();
      else if (Navigation.syncColumnVisibility) Navigation.syncColumnVisibility();
    }
    if (typeof UI !== 'undefined' && UI.toast) {
      UI.toast('Baris disisipkan');
    }

    scrollRowIntoView(newRow, { behavior: 'smooth' });

    // Fokus ke Kode baris baru agar siap diisi
    const kodeEl = newRow.querySelector('[data-f="kode"]');
    if (kodeEl) {
      try { kodeEl.focus(); } catch (e) { /* ignore */ }
    }

    return newRow;
  };

  /** Alias instruksi: renumberRows */
  const renumberRows = updateRowNumbers;

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
  /**
   * Cocokkan nilai batch di baris ke label produk master.
   * Mendukung "VTTS1", "VTTS1 L030101", dll. (setelah split Produk/BN).
   */
  /**
   * Petakan nilai kolom Batch baris → kunci summary (label master produk).
   * Pilih kecocokan paling spesifik (label terpanjang), tanpa "kata pertama saja".
   */
  const resolveSummaryKey = (batchVal, summary) => {
    const v = String(batchVal || '').trim();
    if (!v) return null;
    if (summary[v]) return v;
    const keys = Object.keys(summary);
    const lower = v.toLowerCase();
    let best = null, bestScore = 0;
    for (const k of keys) {
      const kl = k.toLowerCase();
      let score = 0;
      if (kl === lower) score = 100;
      else if (lower.startsWith(kl + ' ')) score = 80 + Math.min(kl.length, 19);
      else if (kl.startsWith(lower + ' ')) score = 60 + Math.min(lower.length, 19);
      if (score > bestScore) { bestScore = score; best = k; }
    }
    return best;
  };

  const updateProductDetailTable = () => {
    const container = State.el.tbodyProdDetail;
    if (!container) return;
    container.innerHTML = '';

    const prods = getActiveProducts();

    if (prods.length === 0) {
      container.innerHTML = `
        <div class="product-detail-empty">
          Belum ada produk di Master Produk.<br>
          <small>Isi <b>Kode produk</b> (dan BN) di tab Produk / Master Produk, lalu pilih di kolom Batch pada baris log.</small>
        </div>`;
      return;
    }

    const summary = {};
    prods.forEach(p => {
      summary[p] = {
        durasiValid: 0,
        durasiTotal: 0,
        durasiProdAll: 0,
        durasiPlannedDT: 0,
        durasiUnplannedDT: 0,
        rate: getRateForProduct(p),
        target: 0,       // Σ (durasi × rate efektif) — penting untuk Kemas L1/L2
        actual: 0
      };
    });

    let rowsWithBatch = 0;
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

      if (mulai == null || selesai == null) return;
      const key = resolveSummaryKey(prodName, summary);
      if (!key) return;
      rowsWithBatch++;

      const dur = (selesai - mulai + 1440) % 1440;
      const si = Utils.shiftOf(mulai);

      if (si === State.evalShift) {
        summary[key].durasiTotal += dur;

        if (CONFIG.PLANNED_CODES.has(kodeNum)) {
          summary[key].durasiPlannedDT += dur;
        } else if (CONFIG.UNPLANNED_CODES.has(kodeNum)) {
          summary[key].durasiUnplannedDT += dur;
        } else if (Utils.catOf(kodeStr) === 'prod') {
          summary[key].durasiProdAll += dur;

          if (goodVal >= 1) {
            summary[key].durasiValid += dur;
            summary[key].actual += rowActual;
            const eff = getEffectiveRate(key, g('op'));
            summary[key].target += dur * eff;
          }
        }
      }
    });

    prods.forEach((p, index) => {
      const item = summary[p];
      const targetG = item.target > 0 ? item.target : (item.durasiValid * item.rate);
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

    // Petunjuk jika produk ada tapi belum ada output / batch
    if (rowsWithBatch === 0) {
      const tip = document.createElement('div');
      tip.className = 'product-detail-empty';
      tip.style.marginTop = '12px';
      tip.innerHTML = `
        Belum ada baris log yang memilih <b>Batch / Produk</b>.<br>
        <small>Di tab Sheet, isi kolom <b>Batch</b> (pilih produk), lalu isi <b>Good</b> / <b>Defect</b>
        pada baris <b>Kode 2</b> (produksi) agar % Performance terhitung.</small>`;
      container.appendChild(tip);
    }
  };

  // ====== EXPORT ======
  return {
    getActiveProducts,
    findProductSlot,
    getRateForProduct,
    getUkuranForProduct,
    getEffectiveRate,
    usesManpowerRate,
    getWoForProduct,
    applyWoFromBatch,
    rows,
    updateRowNumbers,
    renumberRows,
    applyCat,
    makeRow,
    insertRowAfter,
    scrollRowIntoView,
    markRowEnter,
    updateAllDropdowns,
    updateMatrixProductHeaders,
    updateProductDetailTable,
    applyDefaultStartTimeForFirstRow,
    refreshFirstRowStartTime,
    cascadeProductToBelow,
  };
})();