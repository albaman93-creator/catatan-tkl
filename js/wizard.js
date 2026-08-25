/**
 * WIZARD.JS
 * "Setup Awal" — alur tanya-jawab satu-per-satu di awal sebelum mulai isi
 * Log Sheet, supaya user tidak perlu bolak-balik antar screen dulu.
 * Urutan: Shift → Tahapan Proses → Line → Tanggal →
 * Inisial Operator → Produk, Rate & No. WO.
 *
 * Semua input di wizard ini LANGSUNG tersinkron ke elemen asli di halaman
 * (State.el.fDate, fStage, op1..op6, prodName1..3, dst) — jadi wizard ini
 * cuma "jalan pintas tampilan", bukan sumber data terpisah.
 *
 * Muncul otomatis sekali di kunjungan pertama (localStorage), dan bisa
 * dibuka lagi kapan saja lewat tombol "🧭 Setup Awal" di toolbar — cocok
 * dipakai ulang tiap ganti shift/tanggal/tahapan tanpa perlu scroll ke
 * banyak screen berbeda.
 */
const Wizard = (() => {
  'use strict';

  const STEPS = ['shift', 'stage', 'line', 'date', 'operator', 'produk'];
  let stepIndex = 0;

  const modalEl = () => document.getElementById('wizardModal');
  const renderModal = (html) => { if (modalEl()) modalEl().innerHTML = html; };
  const openModal = () => { if (State.el.wizardOverlay) State.el.wizardOverlay.classList.remove('hide'); };
  const closeModal = () => { if (State.el.wizardOverlay) State.el.wizardOverlay.classList.add('hide'); };

  const progressHtml = () => {
    const n = STEPS.length;
    const pct = Math.round(((stepIndex + 1) / n) * 100);
    return `
      <div class="wiz-progress">
        <span>Langkah ${stepIndex + 1} dari ${n}</span>
        <div class="wiz-bar"><div class="wiz-bar-fill" style="width:${pct}%"></div></div>
      </div>`;
  };

  const navHtml = (opts) => {
    const { showBack = true, nextLabel = 'Lanjut ›', showSkip = false } = opts || {};
    return `
      <div class="wiz-actions">
        ${showBack ? `<button type="button" class="btn btn-ghost" data-act="back">‹ Kembali</button>` : `<span></span>`}
        <div class="wiz-actions-right">
          ${showSkip ? `<button type="button" class="btn btn-ghost" data-act="skip">Lewati</button>` : ''}
          <button type="button" class="btn btn-primary" data-act="next">${nextLabel}</button>
        </div>
      </div>`;
  };

  const bindNav = () => {
    const back = modalEl().querySelector('[data-act="back"]');
    const next = modalEl().querySelector('[data-act="next"]');
    const skip = modalEl().querySelector('[data-act="skip"]');
    if (back) back.addEventListener('click', () => { stepIndex = Math.max(0, stepIndex - 1); renderStep(); });
    if (skip) skip.addEventListener('click', goNext);
    if (next) next.addEventListener('click', goNext);
  };

  const goNext = () => {
    if (stepIndex >= STEPS.length - 1) { finish(); return; }
    stepIndex++;
    renderStep();
  };

  const finish = () => {
    closeModal();
    try { localStorage.setItem(CONFIG.WIZARD_SEEN_KEY, '1'); } catch(e){}
    if (Rows.rows().length === 0) Rows.makeRow();
    if (typeof UI !== 'undefined' && UI.showScreen) UI.showScreen('logsheet');
    UI.toast('Setup awal selesai — siap mulai isi Log Sheet ✓');
  };

  // ====== STEP 1: SHIFT ======
  const renderShiftStep = () => {
    renderModal(`
      ${progressHtml()}
      <h3 class="qm-title">🕐 Pilih Shift</h3>
      <p class="qm-sub">Shift kerja yang sedang Anda jalani sekarang.</p>
      <div class="shiftsel wiz-shift-grid">
        <button type="button" class="wiz-choice" data-shift="0">SHIFT 1<br><small>07.00–15.30</small></button>
        <button type="button" class="wiz-choice" data-shift="1">SHIFT 2<br><small>15.30–23.30</small></button>
        <button type="button" class="wiz-choice" data-shift="2">SHIFT 3<br><small>23.30–07.00</small></button>
      </div>
      ${navHtml({ showBack: false })}
    `);
    modalEl().querySelectorAll('[data-shift]').forEach(b => {
      b.addEventListener('click', () => {
        State.evalShift = parseInt(b.getAttribute('data-shift'), 10) || 0;
        try { localStorage.setItem(CONFIG.EVAL_SHIFT_KEY, String(State.evalShift)); } catch(e){}
        UI.applyShiftUI();
      });
    });
    UI.applyShiftUI();
    bindNav();
  };

  // ====== STEP 2: TAHAPAN PROSES ======
  const STAGE_OPTIONS = [
    { v: 'mixing', l: 'Mixing', i: '🧪' },
    { v: 'filling', l: 'Filling', i: '🧴' },
    { v: 'steril', l: 'Steril', i: '🔥' },
    { v: 'visual', l: 'Visual', i: '👁️' },
    { v: 'kemas', l: 'Kemas', i: '📦' },
  ];
  const renderStageStep = () => {
    const current = State.el.fStage ? State.el.fStage.value : '';
    renderModal(`
      ${progressHtml()}
      <h3 class="qm-title">⚙️ Pilih Tahapan Proses</h3>
      <p class="qm-sub">Tahapan produksi yang sedang berjalan saat ini.</p>
      <div class="wiz-stage-grid">
        ${STAGE_OPTIONS.map(o => `
          <button type="button" class="wiz-choice ${o.v === current ? 'on' : ''}" data-stage="${o.v}">
            <span class="wiz-choice-icon">${o.i}</span>${o.l}
          </button>`).join('')}
      </div>
      ${navHtml()}
    `);
    modalEl().querySelectorAll('[data-stage]').forEach(b => {
      b.addEventListener('click', () => {
        if (State.el.fStage) {
          State.el.fStage.value = b.getAttribute('data-stage');
          State.el.fStage.dispatchEvent(new Event('change', { bubbles: true }));
        }
        modalEl().querySelectorAll('[data-stage]').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
      });
    });
    bindNav();
  };


  // ====== STEP 3: LINE ======
  const LINE_OPTIONS = [
    { v: '1', l: 'Line 1' },
    { v: '2', l: 'Line 2' },
    { v: '4', l: 'Line 4' },
  ];
  const renderLineStep = () => {
    const current = State.el.fLine ? String(State.el.fLine.value) : '1';
    renderModal(`
      ${progressHtml()}
      <h3 class="qm-title">🏭 Pilih Line</h3>
      <p class="qm-sub">Line produksi yang sedang Anda kerjakan.</p>
      <div class="wiz-stage-grid">
        ${LINE_OPTIONS.map(o => `
          <button type="button" class="wiz-choice ${o.v === current ? 'on' : ''}" data-line="${o.v}">
            ${o.l}
          </button>`).join('')}
      </div>
      ${navHtml()}
    `);
    modalEl().querySelectorAll('[data-line]').forEach(b => {
      b.addEventListener('click', () => {
        if (State.el.fLine) {
          State.el.fLine.value = b.getAttribute('data-line');
          State.el.fLine.dispatchEvent(new Event('change', { bubbles: true }));
        }
        modalEl().querySelectorAll('[data-line]').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        if (typeof UI !== 'undefined') {
          if (UI.applyLineUI) UI.applyLineUI();
          if (UI.updateUnifiedControl) UI.updateUnifiedControl();
        }
      });
    });
    bindNav();
  };

  // ====== STEP 4: TANGGAL ======

  const renderDateStep = () => {
    const current = State.el.fDate ? State.el.fDate.value : '';
    renderModal(`
      ${progressHtml()}
      <h3 class="qm-title">📅 Pilih Tanggal</h3>
      <p class="qm-sub">Tanggal Log Sheet yang akan diisi.</p>
      <input type="date" id="wizDate" class="in wiz-date-input" value="${current}">
      ${navHtml()}
    `);
    const dateInput = modalEl().querySelector('#wizDate');
    dateInput.addEventListener('input', () => {
      if (State.el.fDate) {
        State.el.fDate.value = dateInput.value;
        State.el.fDate.dispatchEvent(new Event('input', { bubbles: true }));
        State.el.fDate.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    bindNav();
  };

  // ====== STEP 5: INISIAL OPERATOR ======
  const renderOperatorStep = () => {
    let fieldsHtml = '';
    for (let i = 1; i <= 6; i++) {
      const el = State.el['op' + i];
      const val = el ? el.value : '';
      fieldsHtml += `
        <div class="field">
          <label>Operator ${i}</label>
          <input type="text" maxlength="3" class="in mono ctr" data-op="${i}" placeholder="---" value="${Utils.escapeHtml(val)}">
        </div>`;
    }
    renderModal(`
      ${progressHtml()}
      <h3 class="qm-title">👤 Inisial Operator</h3>
      <p class="qm-sub">Isi minimal 1 operator yang bertugas (maks. 3 huruf per kolom). Boleh dilewati kalau belum tahu.</p>
      <div class="wiz-op-grid">${fieldsHtml}</div>
      ${navHtml({ showSkip: true })}
    `);
    modalEl().querySelectorAll('[data-op]').forEach(inp => {
      inp.addEventListener('input', () => {
        const i = inp.getAttribute('data-op');
        const el = State.el['op' + i];
        if (el) el.value = inp.value.toUpperCase();
        inp.value = inp.value.toUpperCase();
      });
    });
    bindNav();
  };

  // ====== STEP 6: PRODUK, RATE PER MENIT & NO. WO (per produk) ======
  const renderProdukStep = () => {
    const slots = [
      { name: State.el.prodName1, rate: State.el.prodRate1, wo: State.el.prodWo1, label: 'Produk 1' },
      { name: State.el.prodName2, rate: State.el.prodRate2, wo: State.el.prodWo2, label: 'Produk 2 (Cadangan)' },
      { name: State.el.prodName3, rate: State.el.prodRate3, wo: State.el.prodWo3, label: 'Produk 3 (Cadangan)' },
    ];
    const slotsHtml = slots.map((s, i) => `
      <div class="qm-slot">
        <label class="qm-label">${s.label}</label>
        <div class="wiz-inline-row">
          <input type="text" data-prod-name="${i}" class="in" placeholder="Nama produk_batch" value="${Utils.escapeHtml(s.name ? s.name.value : '')}">
          <input type="number" inputmode="decimal" data-prod-rate="${i}" class="in" placeholder="Rate/mnt" value="${s.rate ? s.rate.value : ''}">
        </div>
        <input type="text" data-prod-wo="${i}" class="in mono" inputmode="numeric" maxlength="8" placeholder="No. WO (opsional)" value="${Utils.escapeHtml(s.wo ? s.wo.value : '')}" style="width:100%;">
      </div>`).join('');

    renderModal(`
      ${progressHtml()}
      <h3 class="qm-title">📦 Produk, Rate per Menit &amp; No. WO</h3>
      <p class="qm-sub">Isi nama produk_batch dan WO</p>
      ${slotsHtml}
      ${navHtml({ nextLabel: 'Selesai · Mulai Isi Data ✓' })}
    `);
    modalEl().querySelectorAll('[data-prod-name]').forEach(inp => {
      inp.addEventListener('input', () => {
        const i = parseInt(inp.getAttribute('data-prod-name'), 10);
        if (slots[i] && slots[i].name) {
          slots[i].name.value = inp.value;
          Rows.updateAllDropdowns();
          Rows.updateMatrixProductHeaders();
        }
      });
    });
    modalEl().querySelectorAll('[data-prod-rate]').forEach(inp => {
      inp.addEventListener('input', () => {
        const i = parseInt(inp.getAttribute('data-prod-rate'), 10);
        if (slots[i] && slots[i].rate) slots[i].rate.value = inp.value;
        Calculation.recalc();
      });
    });
    modalEl().querySelectorAll('[data-prod-wo]').forEach(inp => {
      inp.addEventListener('input', () => {
        // Hanya angka, maksimal 8 digit
        const cleaned = inp.value.replace(/\D/g, '').slice(0, 8);
        if (cleaned !== inp.value) inp.value = cleaned;
        const i = parseInt(inp.getAttribute('data-prod-wo'), 10);
        if (slots[i] && slots[i].wo) slots[i].wo.value = inp.value;
      });
    });
    bindNav();
  };

  const STEP_RENDERERS = {
    shift: renderShiftStep,
    stage: renderStageStep,
    line: renderLineStep,
    date: renderDateStep,
    operator: renderOperatorStep,
    produk: renderProdukStep,
  };

  const renderStep = () => {
    const key = STEPS[stepIndex];
    (STEP_RENDERERS[key] || renderShiftStep)();
  };

  const open = () => {
    stepIndex = 0;
    renderStep();
    openModal();
  };

  const init = () => {
    if (State.el.btnWizard) State.el.btnWizard.addEventListener('click', open);

    // Tutup kalau klik area gelap di luar modal, atau tekan Esc
    if (State.el.wizardOverlay) {
      State.el.wizardOverlay.addEventListener('click', (e) => {
        if (e.target === State.el.wizardOverlay) closeModal();
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && State.el.wizardOverlay && !State.el.wizardOverlay.classList.contains('hide')) closeModal();
    });

    // Muncul otomatis sekali di kunjungan pertama
    let seen = false;
    try { seen = localStorage.getItem(CONFIG.WIZARD_SEEN_KEY) === '1'; } catch(e){}
    if (!seen) open();
  };

  return { init, open, closeModal };
})();
