/**
 * BULKFILL.JS
 * "Isi Massal": klik ikon 📥 di header kolom (Kode, Jam Mulai, Jam Selesai,
 * Durasi, Kegiatan, Good, Defect) untuk membuka kotak input berupa daftar
 * bernomor (1., 2., 3., ...) — satu nomor = satu baris tabel. Ketik nilainya,
 * tekan Enter (atau untuk Kode/Jam: otomatis begitu nilainya lengkap) supaya
 * nomor berikutnya otomatis muncul & fokus pindah ke sana. Klik "Simpan"
 * untuk menuliskan seluruh nilai ke kolom yang bersangkutan pada baris tabel
 * yang sesuai.
 *
 * Bisa lanjut dari baris manapun — bukan cuma mulai dari baris 1 — lewat
 * kolom "Mulai dari baris #" di atas daftar.
 *
 * Untuk kolom Good & Defect, isian HANYA berlaku untuk baris yang kolom
 * Kode-nya "2" (baris lain dilewati otomatis, tidak dibuat baris baru).
 *
 * Modul ini ADDITIVE — tidak mengubah logika tabel yang sudah ada, hanya
 * menulis ke input asli lalu memicu event input/focusout asli (sama seperti
 * pola FormMode/FormModeFull) supaya seluruh logika existing (masking jam,
 * kategori kode, cascade Mode Cepat, recalculation OEE, auto-resize
 * textarea) tetap satu-satunya sumber kebenaran.
 */
const BulkFill = (() => {
  'use strict';

  // Definisi tiap kolom yang didukung Isi Massal.
  const COLUMN_DEFS = {
    kode:     { kind: 'digit',  label: 'Kode',           restrict: null },
    mulai:    { kind: 'time',   label: 'Jam Mulai',      restrict: null },
    selesai:  { kind: 'time',   label: 'Jam Selesai',    restrict: null },
    durasi:   { kind: 'number', label: 'Durasi (menit)', restrict: null },
    kegiatan: { kind: 'text',   label: 'Kegiatan',       restrict: null },
    good:     { kind: 'number', label: 'Good',           restrict: 'kode2' },
    defect:   { kind: 'number', label: 'Defect',         restrict: 'kode2' },
  };

  let currentCol = null;
  let lines = [];          // array <input> sesuai urutan nomor
  let startRowInput = null;

  const overlayEl = () => State.el.bulkOverlay;
  const modalEl = () => State.el.bulkModal;

  const closeModal = () => {
    if (overlayEl()) overlayEl().classList.add('hide');
    currentCol = null;
    lines = [];
    startRowInput = null;
  };

  const openModal = () => { if (overlayEl()) overlayEl().classList.remove('hide'); };

  const startRow = () => {
    const v = startRowInput ? parseInt(startRowInput.value, 10) : 1;
    return (v && v >= 1) ? v : 1;
  };

  // ====== NOMOR TAMPILAN (mengikuti "Mulai dari baris #") ======
  const renumber = () => {
    const base = startRow();
    lines.forEach((input, i) => {
      const numEl = input.closest('.bulk-line').querySelector('.bulk-num');
      if (numEl) numEl.textContent = `${base + i}.`;
    });
  };

  // ====== BUAT 1 BARIS NOMOR BARU DI DALAM DAFTAR ======
  const addLine = (listEl, def) => {
    const idx = lines.length;
    const wrap = document.createElement('div');
    wrap.className = 'bulk-line';
    let inputHtml;
    if (def.kind === 'digit') {
      inputHtml = `<input type="tel" inputmode="numeric" maxlength="1" class="bulk-input" placeholder=" ">`;
    } else if (def.kind === 'time') {
      inputHtml = `<input type="text" inputmode="numeric" maxlength="5" class="bulk-input" placeholder="--:--">`;
    } else if (def.kind === 'number') {
      inputHtml = `<input type="text" inputmode="decimal" class="bulk-input" placeholder="0">`;
    } else {
      inputHtml = `<input type="text" class="bulk-input bulk-input-text" placeholder="Ketik lalu Enter">`;
    }
    wrap.innerHTML = `<span class="bulk-num">${startRow() + idx}.</span>${inputHtml}`;
    listEl.appendChild(wrap);
    const input = wrap.querySelector('input');
    lines.push(input);
    bindLine(listEl, input, def);
    if (currentCol === 'kegiatan' && typeof Suggest !== 'undefined') Suggest.attachGhost(input);
    applyLineColor(wrap, input, idx);
    return input;
  };

  /**
   * Warnai baris Isi Massal (.bulk-line) sesuai kategori Kode baris tabel
   * yang bersangkutan — sama seperti warna baris di tabel Log Sheet
   * (Kode 5,6,7,8 oranye / 1,3,4,9 merah / Kode 2 hijau). Supaya operator
   * langsung dapat feedback visual walau sedang mengisi kolom lain
   * (Jam Mulai/Selesai/Durasi/Good/Defect), bukan cuma pas isi Kode.
   */
  const catClass = (cat) => cat === 'planned' ? 'bl-planned' : cat === 'unplanned' ? 'bl-unplanned' : cat === 'prod' ? 'bl-prod' : '';

  const applyLineColor = (wrap, input, idx) => {
    wrap.classList.remove('bl-planned', 'bl-unplanned', 'bl-prod');
    if (currentCol === 'kode') {
      // Kolom yang sedang diisi PERSIS Kode -> warnai live sesuai yang diketik
      const cls = catClass(Utils.catOf(input.value.trim()));
      if (cls) wrap.classList.add(cls);
      return;
    }
    // Kolom LAIN (Jam Mulai/Selesai/Durasi/Kegiatan/Good/Defect) -> ambil
    // Kode dari baris tabel yang sesungguhnya (asumsi Kode sudah diisi
    // lebih dulu, sesuai alur: isi Kode dulu, baru kolom berikutnya).
    const realRowIdx = (startRow() - 1) + idx;
    const tr = Rows.rows()[realRowIdx];
    if (!tr) return;
    const kodeEl = tr.querySelector('[data-f="kode"]');
    const cls = catClass(Utils.catOf(kodeEl ? kodeEl.value.trim() : ''));
    if (cls) wrap.classList.add(cls);
  };

  const removeLastLineIfEmpty = (idx) => {
    if (idx === lines.length - 1 && idx > 0 && lines[idx].value === '') {
      const el = lines.pop();
      el.closest('.bulk-line').remove();
    }
  };

  const bindLine = (listEl, input, def) => {
    input.addEventListener('input', () => {
      if (def.kind === 'digit') {
        const v = input.value.replace(/\D/g, '').slice(0, 1);
        input.value = v;
        applyLineColor(input.closest('.bulk-line'), input, lines.indexOf(input));
        if (v.length >= 1) {
          const idx = lines.indexOf(input);
          const next = lines[idx + 1] || addLine(listEl, def);
          next.focus();
        }
      } else if (def.kind === 'time') {
        const masked = Utils.maskTime(input.value);
        input.value = masked;
        if (/^\d{2}:\d{2}$/.test(masked)) {
          const idx = lines.indexOf(input);
          const next = lines[idx + 1] || addLine(listEl, def);
          next.focus();
          if (next.select) next.select();
        }
      } else if (def.kind === 'number') {
        input.value = input.value.replace(/[^\d.,]/g, '');
      }
      // kind 'text' → bebas, tidak ada masking
    });

    input.addEventListener('keydown', (e) => {
      const idx = lines.indexOf(input);

      // Enter → konfirmasi baris ini, munculkan/lompat ke nomor berikutnya.
      if (e.key === 'Enter') {
        e.preventDefault();
        if (input.value === '') return;
        const next = lines[idx + 1] || addLine(listEl, def);
        next.focus();
        if (next.select) next.select();
        return;
      }

      // Smart backspace: kolom kosong + Backspace → mundur & buang baris kosong terbawah.
      if (e.key === 'Backspace' && input.value === '' && idx > 0) {
        e.preventDefault();
        removeLastLineIfEmpty(idx);
        const prev = lines[idx - 1];
        if (prev) { prev.focus(); if (prev.select) prev.select(); }
      }
    });

    // Paste: sebar nilai ke beberapa baris sekaligus.
    input.addEventListener('paste', (e) => {
      const cd = e.clipboardData || window.clipboardData;
      const text = cd ? (cd.getData('text') || '') : '';
      if (!text) return;
      e.preventDefault();
      const idx = lines.indexOf(input);

      if (def.kind === 'digit') {
        const digits = text.replace(/\D/g, '');
        if (!digits) return;
        let last = input;
        for (let i = 0; i < digits.length; i++) {
          const cell = lines[idx + i] || addLine(listEl, def);
          cell.value = digits[i];
          last = cell;
        }
        last.focus();
      } else {
        const tokens = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        if (!tokens.length) return;
        let last = input;
        tokens.forEach((tok, i) => {
          const cell = lines[idx + i] || addLine(listEl, def);
          cell.value = def.kind === 'time' ? Utils.maskTime(tok) : tok;
          last = cell;
        });
        last.focus();
      }
    });
  };

  // ====== RENDER MODAL ======
  const render = (col) => {
    const def = COLUMN_DEFS[col];
    if (!def) return;
    currentCol = col;
    lines = [];

    const hints = {
      kode:     'Ketik langsung angka demi angka (mis. mengetik "87654321" otomatis mengisi baris 1–8). Bisa juga tempel (paste) sekaligus.',
      mulai:    'Ketik jam (mis. "1730"), otomatis jadi 17:30 & lompat ke nomor berikutnya. Bisa juga tempel beberapa baris sekaligus.',
      selesai:  'Ketik jam (mis. "1730"), otomatis jadi 17:30 & lompat ke nomor berikutnya. Bisa juga tempel beberapa baris sekaligus.',
      durasi:   'Ketik jumlah menit lalu tekan Enter untuk lanjut ke nomor berikutnya.',
      kegiatan: 'Ketik teks kegiatan lalu tekan Enter untuk lanjut ke nomor berikutnya.',
      good:     'Ketik jumlah Good lalu tekan Enter. ⚠ Hanya akan diisi ke baris yang kolom Kode-nya "2" — baris lain dilewati otomatis.',
      defect:   'Ketik jumlah Defect lalu tekan Enter. ⚠ Hanya akan diisi ke baris yang kolom Kode-nya "2" — baris lain dilewati otomatis.',
    };

    modalEl().classList.toggle('bulk-modal-wide', def.kind === 'text');
    modalEl().innerHTML = `
      <h3 class="qm-title"><span class="bolt">📥</span>Isi Massal — ${def.label}</h3>
      <p class="qm-sub">${hints[col] || ''} Baris tabel yang belum ada akan dibuat otomatis saat disimpan${def.restrict ? ' (kecuali kolom ini, yang hanya menyasar baris berkode 2)' : ''}.</p>
      <label class="qm-label" for="bulkStartRow">Mulai dari baris #</label>
      <div class="qm-row">
        <input type="number" min="1" step="1" id="bulkStartRow" value="1" class="bulk-startrow">
      </div>
      <div class="bulk-list" id="bulkList"></div>
      <div class="bulk-count" id="bulkCount">0 nilai siap disimpan</div>
      <div class="qm-actions">
        <button type="button" class="btn btn-ghost" data-act="cancel">Batal</button>
        <button type="button" class="btn btn-primary" data-act="save">💾 Simpan ke Kolom ${def.label}</button>
      </div>
    `;

    const listEl = modalEl().querySelector('#bulkList');
    const countEl = modalEl().querySelector('#bulkCount');
    startRowInput = modalEl().querySelector('#bulkStartRow');

    // Tebak baris awal yang masuk akal: baris tabel pertama yang kolom ini
    // masih kosong (supaya user yang sudah mengisi s/d baris 8 langsung
    // diarahkan lanjut dari baris 9, tapi tetap bisa diubah manual).
    const rowsArr = Rows.rows();
    let guess = rowsArr.findIndex(tr => {
      const el = tr.querySelector(`[data-f="${col}"]`);
      return el && el.value.trim() === '';
    });
    if (guess < 0) guess = rowsArr.length; // semua sudah terisi → lanjut di baris berikutnya
    startRowInput.value = String(guess + 1);

    startRowInput.addEventListener('input', renumber);

    const first = addLine(listEl, def);

    listEl.addEventListener('input', () => {
      const filled = lines.filter(l => l.value.trim() !== '').length;
      countEl.textContent = `${filled} nilai siap disimpan`;
    });

    modalEl().querySelector('[data-act="cancel"]').addEventListener('click', closeModal);
    modalEl().querySelector('[data-act="save"]').addEventListener('click', () => applyToTable(col, def));

    openModal();
    first.focus();
  };

  // ====== SIMPAN: TULIS NILAI KE KOLOM TABEL SESUAI BARIS ======
  const applyToTable = (col, def) => {
    const values = [];
    lines.forEach(l => {
      const v = l.value.trim();
      if (v === '') return;
      if (def.kind === 'time') {
        const n = Utils.normTime(v);
        if (n == null) return; // format jam tidak valid, lewati
        values.push(n);
      } else {
        values.push(v);
      }
    });

    if (values.length === 0) {
      UI.toast('Belum ada nilai untuk disimpan ⚠', true, 'warn');
      return;
    }

    const base = startRow(); // 1-indexed

    let filledCount = 0;
    let skippedCount = 0;

    if (def.restrict === 'kode2') {
      // Hanya menyasar baris (mulai dari nomor "base") yang kolom Kode-nya "2".
      // Tidak membuat baris baru — baris memang harus sudah ada & berkode 2.
      const rowsArr = Rows.rows();
      const eligible = [];
      for (let i = base - 1; i < rowsArr.length; i++) {
        const kodeEl = rowsArr[i].querySelector('[data-f="kode"]');
        if (kodeEl && kodeEl.value.trim() === '2') eligible.push(rowsArr[i]);
      }
      values.forEach((val, i) => {
        const tr = eligible[i];
        if (!tr) { skippedCount++; return; }
        const el = tr.querySelector(`[data-f="${col}"]`);
        if (!el) { skippedCount++; return; }
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('focusout', { bubbles: true }));
        filledCount++;
      });
    } else {
      // Kolom umum: pastikan baris tabel cukup (buat baru kalau kurang),
      // lalu isi berurutan mulai dari nomor "base".
      const neededLast = base - 1 + values.length;
      while (Rows.rows().length < neededLast) Rows.makeRow();
      Rows.updateRowNumbers();

      const rowsArr = Rows.rows();
      values.forEach((val, i) => {
        const tr = rowsArr[base - 1 + i];
        if (!tr) { skippedCount++; return; }
        const el = tr.querySelector(`[data-f="${col}"]`);
        if (!el) { skippedCount++; return; }
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('focusout', { bubbles: true }));
        filledCount++;
      });
    }

    Calculation.recalc();
    closeModal();

    if (filledCount === 0) {
      UI.toast(`Tidak ada baris berkode 2 mulai baris ${base} — tidak ada yang diisi ⚠`, true, 'warn');
    } else if (skippedCount > 0) {
      UI.toast(`Berhasil mengisi ${filledCount} baris pada kolom ${def.label} · ${skippedCount} nilai dilewati (baris berkode 2 tidak cukup) ⚠`, true, 'warn');
    } else {
      UI.toast(`Berhasil mengisi ${filledCount} baris pada kolom ${def.label} ✓`);
    }
  };

  // ====== INIT ======
  const init = () => {
    if (!overlayEl()) return;
    document.querySelectorAll('.th-bulk-btn[data-bulk-col]').forEach(btn => {
      btn.addEventListener('click', () => render(btn.getAttribute('data-bulk-col')));
    });
    overlayEl().addEventListener('click', (e) => {
      if (e.target === overlayEl()) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !overlayEl().classList.contains('hide')) closeModal();
    });
  };

  return { init };
})();
