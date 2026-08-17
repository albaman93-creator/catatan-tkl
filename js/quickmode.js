/**
 * QUICKMODE.JS
 * Menangani Mode Input pengisian log sheet:
 *   - Mode Normal   : perilaku default (tidak berubah).
 *   - Mode Cepat 1  : fokus Kode & Rate per Menit, kolom ringkas.
 *   - Mode Cepat 2  : "Mode Super Cepat", fokus pemilihan produk & rate,
 *                      kolom sedikit lebih lengkap (+ Jam Selesai).
 *
 * Modul ini bersifat ADDITIVE: tidak mengubah logika Mode Normal yang
 * sudah ada di rows.js/calculation.js/navigation.js/app.js, hanya
 * menambah listener & aturan tampilan baru di atasnya.
 */
const QuickMode = (() => {
  'use strict';

  let timeDropdownEl = null;

  // ====== HELPERS MODAL ======
  const qmModalEl = () => State.el.qmModal;

  const renderModal = (html) => { if (qmModalEl()) qmModalEl().innerHTML = html; };

  const openModal = () => { if (State.el.qmOverlay) State.el.qmOverlay.classList.remove('hide'); };

  const closeModal = () => {
    if (State.el.qmOverlay) State.el.qmOverlay.classList.add('hide');
    hideTimeDropdown();
  };

  const bindModalActions = (handlers) => {
    const modal = qmModalEl();
    if (!modal) return;
    modal.querySelectorAll('[data-act]').forEach(b => {
      b.addEventListener('click', () => {
        const act = b.getAttribute('data-act');
        if (handlers[act]) handlers[act]();
      });
    });
  };

  // ====== MODE BUTTONS UI ======
  const updateModeButtonsUI = () => {
    document.querySelectorAll('#qmModeSel button[data-imode]').forEach(b => {
      b.classList.toggle('on', b.getAttribute('data-imode') === State.inputMode);
    });
  };

  const bindModeButtons = () => {
    document.querySelectorAll('#qmModeSel button[data-imode]').forEach(b => {
      b.addEventListener('click', () => selectMode(b.getAttribute('data-imode')));
    });
  };

  const selectMode = (mode) => {
    if (mode === State.inputMode) return;
    if (mode === 'normal') { deactivateQuickMode(); return; }
    if (mode === 'cepat1') {
      openConfirm(
        'Aktifkan Mode Cepat 1?', '⚡',
        'Fokus pengisian: Kode Produk &amp; Rate per Menit. Kolom lain akan disembunyikan agar pengisian lebih cepat.',
        () => showProductCountPicker('cepat1')
      );
    } else if (mode === 'cepat2') {
      openConfirm(
        'Apakah yakin ingin mengaktifkan mode cepat?', '⚡⚡',
        'Mode Super Cepat — fokus pemilihan produk &amp; kecepatan pengisian per produk.',
        () => showProductCountPicker('cepat2')
      );
    }
  };

  // ====== STEP 1: KONFIRMASI ======
  const openConfirm = (title, icon, sub, onOk) => {
    renderModal(`
      <h3 class="qm-title"><span class="bolt">${icon}</span>${Utils.escapeHtml(title)}</h3>
      <p class="qm-sub">${sub}</p>
      <div class="qm-actions">
        <button type="button" class="btn btn-ghost" data-act="cancel">Batal</button>
        <button type="button" class="btn btn-primary" data-act="ok">Oke</button>
      </div>
    `);
    bindModalActions({ ok: onOk, cancel: closeModal });
    openModal();
  };

  // ====== STEP 2: JUMLAH PRODUK ======
  const showProductCountPicker = (mode) => {
    renderModal(`
      <h3 class="qm-title"><span class="bolt">${mode === 'cepat2' ? '⚡⚡' : '⚡'}</span>Berapa Produk?</h3>
      <p class="qm-sub">Anda akan mengisi berapa produk?</p>
      <div class="qm-row qm-choices">
        <button type="button" data-count="1">Satu</button>
        <button type="button" data-count="2">Dua</button>
        <button type="button" data-count="3">Tiga</button>
      </div>
      <div class="qm-actions">
        <button type="button" class="btn btn-ghost" data-act="cancel">Batal</button>
      </div>
    `);
    qmModalEl().querySelectorAll('[data-count]').forEach(b => {
      b.addEventListener('click', () => showProductSetup(mode, parseInt(b.getAttribute('data-count'), 10)));
    });
    bindModalActions({ cancel: closeModal });
    openModal();
  };

  // ====== STEP 3: PILIH PRODUK & RATE (langsung tersinkron ke Master Produk) ======
  const showProductSetup = (mode, count) => {
    const masterEls = [
      { name: State.el.prodName1, rate: State.el.prodRate1 },
      { name: State.el.prodName2, rate: State.el.prodRate2 },
      { name: State.el.prodName3, rate: State.el.prodRate3 },
    ];

    let slotsHtml = '';
    for (let i = 0; i < count; i++) {
      const curName = masterEls[i].name.value;
      const curRate = masterEls[i].rate.value;
      slotsHtml += `
        <div class="qm-slot" data-slot="${i}">
          <label class="qm-label">Produk ${i + 1} (Nama &amp; Kecepatan)</label>
          <input type="text" data-slot-name="${i}" placeholder="Nama produk" value="${Utils.escapeHtml(curName)}">
          <input type="number" inputmode="decimal" data-slot-rate="${i}" placeholder="Rate per menit" value="${curRate}">
        </div>`;
    }

    renderModal(`
      <h3 class="qm-title"><span class="bolt">${mode === 'cepat2' ? '⚡⚡' : '⚡'}</span>Pilih Produk &amp; Rate</h3>
      <p class="qm-sub">Isi Nama Produk &amp; Rate per Menit di sini — data akan otomatis tersinkron langsung ke Master Produk &amp; Kecepatan Standar (Produk 1/2/3 sesuai urutan slot).</p>
      ${slotsHtml}
      <div class="qm-actions">
        <button type="button" class="btn btn-ghost" data-act="cancel">Batal</button>
        <button type="button" class="btn btn-primary" data-act="ok">Oke, Mulai Isi</button>
      </div>
    `);

    // Sinkron real-time: setiap ketikan langsung ditulis ke field Master Produk asli
    qmModalEl().querySelectorAll('[data-slot-name]').forEach(nameInput => {
      nameInput.addEventListener('input', () => {
        const i = parseInt(nameInput.getAttribute('data-slot-name'), 10);
        if (!masterEls[i]) return;
        masterEls[i].name.value = nameInput.value;
        Rows.updateAllDropdowns();
        Rows.updateMatrixProductHeaders();
        Calculation.recalc();
      });
    });
    qmModalEl().querySelectorAll('[data-slot-rate]').forEach(rateInput => {
      rateInput.addEventListener('input', () => {
        const i = parseInt(rateInput.getAttribute('data-slot-rate'), 10);
        if (!masterEls[i]) return;
        masterEls[i].rate.value = rateInput.value;
        Calculation.recalc();
      });
    });

    bindModalActions({ cancel: closeModal, ok: () => applyProductSetup(mode, count) });
    openModal();

    const firstInput = qmModalEl().querySelector('[data-slot-name]');
    if (firstInput) { firstInput.focus(); firstInput.select(); }
  };

  // ====== STEP 4: TERAPKAN ======
  const applyProductSetup = (mode, count) => {
    const masterEls = [
      { name: State.el.prodName1, rate: State.el.prodRate1 },
      { name: State.el.prodName2, rate: State.el.prodRate2 },
      { name: State.el.prodName3, rate: State.el.prodRate3 },
    ];
    const chosenNames = [];

    for (let i = 0; i < count; i++) {
      const nameInput = qmModalEl().querySelector(`[data-slot-name="${i}"]`);
      const rateInput = qmModalEl().querySelector(`[data-slot-rate="${i}"]`);
      const nameVal = nameInput ? nameInput.value.trim() : '';
      if (!nameVal) {
        UI.toast('Isi nama produk untuk setiap slot terlebih dahulu ⚠', true, 'warn');
        return;
      }
      masterEls[i].name.value = nameVal;
      masterEls[i].rate.value = rateInput ? rateInput.value : masterEls[i].rate.value;
      chosenNames.push(nameVal);
    }

    State.inputMode = mode;
    State.quickActiveProducts = chosenNames;

    // Mode Cepat wajib navigasi tab vertikal (poin B.11)
    State.navMode = 'v';
    try { localStorage.setItem(CONFIG.NAV_MODE_KEY, 'v'); } catch (e) {}
    UI.applyModeUI();

    const table = document.getElementById('logTable');
    if (table) {
      table.classList.remove('qm-cepat1', 'qm-cepat2');
      table.classList.add(mode === 'cepat2' ? 'qm-cepat2' : 'qm-cepat1');
    }

    Rows.updateAllDropdowns();
    Rows.updateMatrixProductHeaders();

    // Isi Batch baris yang masih kosong dengan produk pertama yang dipilih
    Rows.rows().forEach(tr => {
      const sel = tr.querySelector('[data-f="batch"]');
      if (sel && !sel.value) sel.value = chosenNames[0];
    });

    refreshRowStates();
    Calculation.recalc();
    updateModeButtonsUI();
    closeModal();

    UI.toast(mode === 'cepat2' ? 'Mode Super Cepat aktif ⚡⚡' : 'Mode Cepat 1 aktif ⚡');

    const cells = Navigation.navCells();
    const first = cells.find(c => c.f === 'kode' && c.ri === 0);
    if (first) Navigation.focusCell(first);
  };

  const deactivateQuickMode = () => {
    State.inputMode = 'normal';
    State.quickActiveProducts = [];

    const table = document.getElementById('logTable');
    if (table) table.classList.remove('qm-cepat1', 'qm-cepat2');

    refreshRowStates();
    Rows.updateAllDropdowns();
    Calculation.recalc();
    updateModeButtonsUI();
    UI.toast('Mode Normal aktif 📝');
  };

  // ====== BARIS: semua kolom bebas diisi (tidak ada yang disable) + cascade Batch default ======
  const refreshRowStates = () => {
    const rowsArr = Rows.rows();
    rowsArr.forEach((tr, i) => {
      const mulaiEl = tr.querySelector('[data-f="mulai"]');
      if (!mulaiEl) return;
      // Tidak ada kolom yang di-readonly — sistem otomatisasi 2 arah (lihat
      // handleMulaiInput/handleSelesaiInput/handleDurasiInput/cascadeFromRow)
      // yang menjaga Jam Mulai ⇄ Jam Selesai ⇄ Durasi tetap konsisten,
      // dari kolom manapun user mulai mengisi.
      mulaiEl.readOnly = false;
      mulaiEl.classList.remove('ro-mulai');
      if (State.inputMode !== 'normal' && i > 0) {
        const kodeEl = tr.querySelector('[data-f="kode"]');
        const batchEl = tr.querySelector('[data-f="batch"]');
        const prevBatchEl = rowsArr[i - 1] && rowsArr[i - 1].querySelector('[data-f="batch"]');
        // Batch (& otomatis No. WO ikut) cuma di-cascade ke baris yang
        // Kode-nya SUDAH terisi — baris yang Kode-nya masih kosong
        // sengaja dilewati (belum dianggap baris aktif).
        if (kodeEl && kodeEl.value.trim() && batchEl && prevBatchEl && !batchEl.value && prevBatchEl.value) {
          batchEl.value = prevBatchEl.value;
          Rows.applyWoFromBatch(tr);
        }
      }
    });
    Navigation.applyTabOrder();
  };

  const observeRows = () => {
    if (!State.el.tbody) return;
    const mo = new MutationObserver(() => refreshRowStates());
    mo.observe(State.el.tbody, { childList: true });
  };

  // ====== G: INPUT CEPAT KOLOM KODE (maxlength 1 + auto-advance + paste) ======
  const distributeKodeDigits = (startEl, digits) => {
    const cells = Navigation.navCells();
    const startCell = cells.find(c => c.el === startEl);
    if (!startCell) return;
    let last = startCell;
    for (let i = 0; i < digits.length; i++) {
      const cell = cells.find(c => c.f === 'kode' && c.ri === startCell.ri + i);
      if (!cell) break; // baris berikutnya tidak tersedia -> berhenti, tidak error
      cell.el.value = digits[i];
      Rows.applyCat(cell.el.closest('tr'));
      last = cell;
    }
    Calculation.recalc();
    Navigation.focusCell(last);
  };

  const handleKodeInput = (t) => {
    if (/^[0-9]$/.test(t.value)) {
      const cells = Navigation.navCells();
      const cur = cells.find(c => c.el === t);
      if (cur) {
        const next = cells.find(c => c.f === 'kode' && c.ri === cur.ri + 1);
        if (next) Navigation.focusCell(next);
        // kalau baris berikutnya tidak ada: diam, tidak error (poin G)
      }
    }
  };

  // ====== SISTEM 2 ARAH: Jam Mulai ⇄ Jam Selesai ⇄ Durasi ======
  // Baris berikutnya (tr) diteruskan rantainya: kalau baris itu SUDAH punya
  // Durasi atau Jam Selesai terisi, nilainya ikut menyesuaikan & merambat
  // lagi ke baris sesudahnya — begitu seterusnya. Kalau baris itu belum
  // punya info apa-apa selain Jam Mulai (baru diisi dari rantai), rantai
  // berhenti di situ dan menunggu user mengisi salah satu kolomnya.
  const findNextRow = (tr) => {
    let next = tr.nextElementSibling;
    while (next && !next.classList.contains('log-row')) next = next.nextElementSibling;
    return next;
  };
  const findPrevRow = (tr) => {
    let prev = tr.previousElementSibling;
    while (prev && !prev.classList.contains('log-row')) prev = prev.previousElementSibling;
    return prev;
  };

  const cascadeFromRow = (tr, depth) => {
    depth = depth || 0;
    if (!tr || depth > 200) return; // jaring pengaman anti infinite-loop
    const mulaiEl = tr.querySelector('[data-f="mulai"]');
    const selesaiEl = tr.querySelector('[data-f="selesai"]');
    const durasiEl = tr.querySelector('[data-f="durasi"]');
    const mulaiMin = mulaiEl ? Utils.parseTime(mulaiEl.value) : null;
    if (mulaiMin == null) return;

    let selesaiStr = null;
    if (durasiEl && durasiEl.value !== '' && !isNaN(parseFloat(durasiEl.value))) {
      const durMin = parseFloat(durasiEl.value);
      selesaiStr = Utils.minutesToHHMM(mulaiMin + durMin);
      if (selesaiEl) { selesaiEl.value = selesaiStr; selesaiEl.classList.remove('invalid'); }
    } else if (selesaiEl && Utils.parseTime(selesaiEl.value) != null) {
      selesaiStr = selesaiEl.value;
      const selesaiMin = Utils.parseTime(selesaiStr);
      const durMin = (selesaiMin - mulaiMin + 1440) % 1440;
      if (durasiEl) durasiEl.value = String(durMin);
    } else {
      return; // belum ada info Durasi/Jam Selesai — rantai berhenti di sini
    }

    const next = findNextRow(tr);
    if (next) {
      const nextMulai = next.querySelector('[data-f="mulai"]');
      if (nextMulai && nextMulai.value !== selesaiStr) {
        nextMulai.value = selesaiStr;
        nextMulai.classList.remove('invalid');
        cascadeFromRow(next, depth + 1);
      }
    }
  };

  // ====== D/H: DURASI → JAM SELESAI (+ rantai Jam Mulai baris-baris berikutnya) ======
  const handleDurasiInput = (t) => {
    const cleaned = t.value.replace(/[^\d]/g, '');
    if (cleaned !== t.value) t.value = cleaned;

    const tr = t.closest('tr');
    if (!tr) return;
    const mulaiEl = tr.querySelector('[data-f="mulai"]');
    const selesaiEl = tr.querySelector('[data-f="selesai"]');
    const durV = tr.querySelector('.dur-v');
    const mulaiMin = mulaiEl ? Utils.parseTime(mulaiEl.value) : null;
    const durMin = parseFloat(cleaned);

    if (mulaiMin != null && cleaned !== '' && !isNaN(durMin)) {
      const selesaiStr = Utils.minutesToHHMM(mulaiMin + durMin);
      if (selesaiEl) { selesaiEl.value = selesaiStr; selesaiEl.classList.remove('invalid'); }
      if (durV) durV.textContent = Utils.nf0(durMin);

      // Jam Mulai baris berikutnya otomatis mengikuti Jam Selesai baris ini (+ rantai lanjut)
      const next = findNextRow(tr);
      if (next) {
        const nextMulai = next.querySelector('[data-f="mulai"]');
        if (nextMulai) { nextMulai.value = selesaiStr; nextMulai.classList.remove('invalid'); }
        cascadeFromRow(next);
      }
    }
    Calculation.recalc();
  };

  // ====== E: JAM SELESAI → DURASI (+ rantai Jam Mulai baris-baris berikutnya) ======
  const handleSelesaiInput = (t) => {
    if (State.inputMode === 'normal') return; // Mode Normal punya alurnya sendiri
    const tr = t.closest('tr');
    if (!tr) return;
    const mulaiEl = tr.querySelector('[data-f="mulai"]');
    const durasiEl = tr.querySelector('[data-f="durasi"]');
    const mulaiMin = mulaiEl ? Utils.parseTime(mulaiEl.value) : null;
    const selesaiMin = Utils.parseTime(t.value);

    if (mulaiMin != null && selesaiMin != null) {
      const durMin = (selesaiMin - mulaiMin + 1440) % 1440;
      if (durasiEl) durasiEl.value = String(durMin);

      const next = findNextRow(tr);
      if (next) {
        const nextMulai = next.querySelector('[data-f="mulai"]');
        if (nextMulai) { nextMulai.value = t.value; nextMulai.classList.remove('invalid'); }
        cascadeFromRow(next);
      }
    }
    Calculation.recalc();
  };

  // ====== H: JAM MULAI — auto-advance + sistem 2 arah (maju & mundur) ======
  const handleMulaiInput = (t) => {
    setTimeout(() => {
      if (/^\d{2}:\d{2}$/.test(t.value)) {
        const cells = Navigation.navCells();
        const cur = cells.find(c => c.el === t);
        if (cur) {
          const idx = cells.indexOf(cur);
          if (idx >= 0 && idx < cells.length - 1) Navigation.focusCell(cells[idx + 1]);
        }
      }
    }, 0);

    if (State.inputMode === 'normal') return; // Mode Normal punya alurnya sendiri

    const tr = t.closest('tr');
    if (!tr) return;
    const mulaiMin = Utils.parseTime(t.value);
    if (mulaiMin == null) return;

    const durasiEl = tr.querySelector('[data-f="durasi"]');
    const selesaiEl = tr.querySelector('[data-f="selesai"]');

    // Maju: kalau Durasi baris ini sudah terisi, Jam Selesai & rantai berikutnya ikut bergeser
    if (durasiEl && durasiEl.value !== '' && !isNaN(parseFloat(durasiEl.value))) {
      const durMin = parseFloat(durasiEl.value);
      const selesaiStr = Utils.minutesToHHMM(mulaiMin + durMin);
      if (selesaiEl) { selesaiEl.value = selesaiStr; selesaiEl.classList.remove('invalid'); }
      const next = findNextRow(tr);
      if (next) {
        const nextMulai = next.querySelector('[data-f="mulai"]');
        if (nextMulai) { nextMulai.value = selesaiStr; nextMulai.classList.remove('invalid'); }
        cascadeFromRow(next);
      }
    } else if (selesaiEl && Utils.parseTime(selesaiEl.value) != null) {
      // Kalau belum ada Durasi tapi Jam Selesai sudah ada, Durasi dihitung ulang
      const selesaiMin = Utils.parseTime(selesaiEl.value);
      const durMin = (selesaiMin - mulaiMin + 1440) % 1440;
      durasiEl.value = String(durMin);
    }

    // Mundur: baris sebelumnya (Jam Selesai-nya sudah otomatis mengikuti Jam Mulai ini,
    // lihat app.js) → sinkronkan juga kolom Durasinya
    const prev = findPrevRow(tr);
    if (prev) {
      const prevMulaiEl = prev.querySelector('[data-f="mulai"]');
      const prevDurasiEl = prev.querySelector('[data-f="durasi"]');
      const prevMulaiMin = prevMulaiEl ? Utils.parseTime(prevMulaiEl.value) : null;
      if (prevMulaiMin != null && prevDurasiEl) {
        const durMin = (mulaiMin - prevMulaiMin + 1440) % 1440;
        prevDurasiEl.value = String(durMin);
      }
    }

    Calculation.recalc();
  };

  // ====== D: DROPDOWN JAM MULAI (baris pertama, Mode Cepat) ======
  const hideTimeDropdown = () => {
    if (timeDropdownEl) { timeDropdownEl.remove(); timeDropdownEl = null; }
  };

  const showTimeDropdown = (inputEl) => {
    hideTimeDropdown();
    const rect = inputEl.getBoundingClientRect();
    const div = document.createElement('div');
    div.className = 'qm-time-dropdown';
    div.style.left = rect.left + 'px';
    div.style.top = (rect.bottom + 4) + 'px';
    CONFIG.SHIFT_START_TIMES.forEach((tm, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = `Shift ${i + 1} · ${tm}`;
      btn.addEventListener('mousedown', (ev) => {
        ev.preventDefault(); // cegah blur sebelum value ter-set
        inputEl.value = tm;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        hideTimeDropdown();
        setTimeout(() => {
          const cells = Navigation.navCells();
          const cur = cells.find(c => c.el === inputEl);
          if (cur) {
            const idx = cells.indexOf(cur);
            if (idx >= 0 && idx < cells.length - 1) Navigation.focusCell(cells[idx + 1]);
          }
        }, 0);
      });
      div.appendChild(btn);
    });
    document.body.appendChild(div);
    timeDropdownEl = div;
  };

  // ====== E: CASCADE DROPDOWN KODE PRODUK & BATCH (Mode Cepat) ======
  const handleBatchChange = (t) => {
    if (State.inputMode === 'normal') return;
    const tr = t.closest('tr');
    const allRows = Rows.rows();
    const idx = allRows.indexOf(tr);
    if (idx < 0) return;
    for (let i = idx + 1; i < allRows.length; i++) {
      const sel = allRows[i].querySelector('[data-f="batch"]');
      if (sel) sel.value = t.value;
    }
    Calculation.recalc();
  };

  // ====== DELEGATED TBODY EVENTS ======
  const bindTbodyDelegatedEvents = () => {
    const tbody = State.el.tbody;
    if (!tbody) return;

    tbody.addEventListener('paste', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement) || t.getAttribute('data-f') !== 'kode') return;
      const cd = e.clipboardData || window.clipboardData;
      const text = cd ? (cd.getData('text') || '') : '';
      const digits = text.replace(/\D/g, '');
      if (!digits) return;
      e.preventDefault();
      distributeKodeDigits(t, digits);
    });

    tbody.addEventListener('input', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const f = t.getAttribute('data-f');
      if (f === 'kode') handleKodeInput(t);
      else if (f === 'durasi') handleDurasiInput(t);
      else if (f === 'mulai') handleMulaiInput(t);
      else if (f === 'selesai') handleSelesaiInput(t);
    });

    tbody.addEventListener('change', (e) => {
      const t = e.target;
      if (t instanceof HTMLElement && t.getAttribute('data-f') === 'batch') handleBatchChange(t);
    });

    tbody.addEventListener('focusin', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement) || t.getAttribute('data-f') !== 'mulai') { hideTimeDropdown(); return; }
      const rowsArr = Rows.rows();
      if (State.inputMode === 'normal' || rowsArr[0] !== t.closest('tr')) { hideTimeDropdown(); return; }
      showTimeDropdown(t);
    });
  };

  // ====== INIT ======
  const init = () => {
    bindModeButtons();
    updateModeButtonsUI();
    bindTbodyDelegatedEvents();
    observeRows();

    if (State.el.qmOverlay) {
      State.el.qmOverlay.addEventListener('click', (e) => {
        if (e.target === State.el.qmOverlay) closeModal();
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && State.el.qmOverlay && !State.el.qmOverlay.classList.contains('hide')) closeModal();
    });
    document.addEventListener('scroll', hideTimeDropdown, true);
    window.addEventListener('resize', hideTimeDropdown);
  };

  return { init, selectMode, refreshRowStates };
})();
