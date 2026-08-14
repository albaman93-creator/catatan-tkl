/**
 * APP.JS
 * Entry point aplikasi. Menginisialisasi session, binding event, dan boot modul lain.
 */
const App = (() => {
  'use strict';

  /**
   * Inisialisasi aplikasi utama (setelah login berhasil).
   */
  const startMain = () => {
    // Load state dari localStorage
    UI.loadNavMode();
    UI.loadEvalShift();

    // Apply UI awal
    UI.applyModeUI();
    UI.applyShiftUI();
    UI.loadToolbarCollapsed();
    UI.loadActiveScreen();
    Rows.updateMatrixProductHeaders();

    // Set default tanggal = hari ini
    State.el.fDate.value = Utils.todayLocal();
    UI.updateShiftIndicator();

    // Load record pertama
    Storage.loadRecord();

    // Auto-save LOKAL tiap N ms (default 1 menit) — tidak menyentuh Supabase
    setInterval(Storage.autoSaveLocal, CONFIG.AUTO_SAVE_INTERVAL_MS || 60000);

    // Start clock
    UI.startClock();

    // Setup PWA & Service Worker
    UI.setupPWA();
    UI.registerServiceWorker();

    // Dashboard (rekap data & grafik) — bind sekali saat app utama siap
    if (typeof Dashboard !== 'undefined') Dashboard.init();
  };

  /**
   * Binding semua event listeners utama (dipanggil sekali di DOMContentLoaded).
   */
  const bindEvents = () => {
    // Login
    State.el.loginForm.addEventListener('submit', Auth.handleLogin);
    State.el.btnLogout.addEventListener('click', Auth.handleLogout);

    // Shift & Mode
    UI.bindModeButtons();
    UI.bindShiftButtons();
    UI.bindToolbarToggle();
    UI.bindScreenNav();

    // Keyboard navigation
    Navigation.bindKeyboard();
    Navigation.bindFocusin();
    Navigation.bindColumnToggles();

    // Row interactions (delegation pada tbody)
    State.el.tbody.addEventListener('input', (e) => {
      const t = e.target;
      // Auto-resize textarea
      if (t.tagName === 'TEXTAREA' && ['kegiatan','masalah','disposisi'].includes(t.getAttribute('data-f'))) {
        UI.autoResizeTextarea(t);
      }
      // Kode: strip non-digit
      if (t.getAttribute('data-f') === 'kode') {
        t.value = t.value.replace(/\D/g, '');
        Rows.applyCat(t.closest('tr'));
      }
      // Jam mulai → auto-copy ke jam selesai baris sebelumnya
      if (t.getAttribute('data-f') === 'mulai') {
        const tr = t.closest('tr');
        let prev = tr ? tr.previousElementSibling : null;
        while (prev && !prev.classList.contains('log-row')) prev = prev.previousElementSibling;
        if (prev) {
          const sv = prev.querySelector('[data-f="selesai"]');
          if (sv) {
            sv.value = t.value;
            sv.classList.remove('invalid');
            Navigation.flash(sv);
            Calculation.validateTimeInput(sv);
          }
        }
      }
      // Masking jam
      if (t.classList.contains('t-time')) {
        const v = Utils.maskTime(t.value);
        if (v !== t.value) t.value = v;
        t.classList.remove('invalid');
        Calculation.validateTimeInput(t);
      }
      Calculation.recalc();
    });

    State.el.tbody.addEventListener('change', (e) => {
      if (e.target.getAttribute('data-f') === 'batch') Calculation.recalc();
      if (e.target.getAttribute('data-f') === 'kode') Rows.applyCat(e.target.closest('tr'));
    });

    State.el.tbody.addEventListener('focusout', (e) => {
      const t = e.target;
      if (t.classList && t.classList.contains('t-time')) {
        const n = Utils.normTime(t.value);
        if (t.value.trim() !== '' && n === null) t.classList.add('invalid');
        else { t.value = n; t.classList.remove('invalid'); }
        Calculation.validateTimeInput(t);
        Calculation.recalc();
      }
    });

    State.el.tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('.del');
      if (!btn) return;
      const tr = btn.closest('tr');
      tr.classList.add('out');
      setTimeout(() => {
        tr.remove();
        Rows.updateRowNumbers();
        if (Rows.rows().length === 0) Rows.makeRow();
        Calculation.recalc();
      }, 190);
    });

    // Master Produk & Operator → recalc
    ['prodName1','prodName2','prodName3','prodRate1','prodRate2','prodRate3'].forEach(id => {
      State.el[id].addEventListener('input', () => {
        Rows.updateAllDropdowns();
        Rows.updateMatrixProductHeaders();
        Calculation.recalc();
      });
    });

    // Filter changes → reload
    ['fDate','fLine','fStage'].forEach(id => {
      State.el[id].addEventListener('change', Storage.loadRecord);
    });
    // Indikator Shift & Tanggal di toolbar atas ikut update tiap tanggal/tahapan diganti
    State.el.fDate.addEventListener('input', UI.updateShiftIndicator);
    State.el.fStage.addEventListener('change', UI.updateShiftIndicator);

    // Buttons
    State.el.btnSave.addEventListener('click', () => Storage.saveData());
    State.el.btnReset.addEventListener('click', () => {
      if (!confirm('Reset seluruh form? Data yang belum disimpan akan hilang.')) return;
      Storage.applyRecord(null);
      UI.toast('Form dikosongkan ↺');
    });
    State.el.btnAdd.addEventListener('click', () => {
      const tr = Rows.makeRow();
      Rows.updateRowNumbers();
      Calculation.recalc();
      tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      const cells = Navigation.navCells();
      const kodeCell = cells.find(c => c.f === 'kode' && c.ri === Rows.rows().length - 1);
      if (kodeCell) Navigation.focusCell(kodeCell);
    });

    // Ctrl+S shortcut
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        Storage.saveData();
      }
    });
  };

  /**
   * Entry point global.
   */
  const init = () => {
    State.initElements();

    // Inisialisasi client Supabase (butuh CONFIG.SUPABASE_URL/ANON_KEY terisi benar)
    if (typeof SupabaseClient !== 'undefined') SupabaseClient.init();

    bindEvents();

    // Mode Input Cepat (Normal / Cepat 1 / Cepat 2) — additive, tidak
    // mengubah alur Mode Normal yang sudah ada.
    if (typeof QuickMode !== 'undefined') QuickMode.init();

    Auth.initSession();

    // Coba kirim antrean offline yang tertunda (jika ada) begitu app siap
    if (typeof Sync !== 'undefined') Sync.flushQueue();
  };

  return { startMain, init };
})();

// Boot aplikasi saat DOM siap
document.addEventListener('DOMContentLoaded', App.init);
