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
    UI.loadColToggleState();
    UI.loadViewMode();
    Rows.updateMatrixProductHeaders();

    // Set default tanggal = hari ini
    State.el.fDate.value = Utils.todayLocal();
    UI.updateShiftIndicator();

    // Load record pertama
    Storage.loadRecord();

    // Auto-save LOKAL tiap N ms (default 1 menit) — tidak menyentuh Supabase
    // (lewat Perf.every supaya ikut berhenti saat app disembunyikan/background)
    if (typeof Perf !== 'undefined') {
      Perf.every(CONFIG.AUTO_SAVE_INTERVAL_MS || 60000, Storage.autoSaveLocal);
    } else {
      setInterval(Storage.autoSaveLocal, CONFIG.AUTO_SAVE_INTERVAL_MS || 60000);
    }

    // Start clock
    UI.startClock();

    // Setup PWA & Service Worker
    UI.setupPWA();
    UI.registerServiceWorker();

    // Dashboard (rekap data & grafik) — bind sekali saat app utama siap
    if (typeof Dashboard !== 'undefined') Dashboard.init();

    // Wizard Setup Awal — HANYA di-init setelah login berhasil, supaya
    // auto-open pertama kali tidak menimpa layar login.
    if (typeof Wizard !== 'undefined') Wizard.init();
  };

  /**
   * Binding semua event listeners utama (dipanggil sekali di DOMContentLoaded).
   */
  const bindEvents = () => {
    // Login
    // Dipasang di bindEvents setelah seluruh elemen DOM tersedia.
    if (State.el.loginForm && typeof Auth !== 'undefined') {
      // Satu handler submit untuk kedua tema; tema hanya mengubah tampilan.
      State.el.loginForm.addEventListener('submit', Auth.handleLogin);
    }
    State.el.btnLogout.addEventListener('click', Auth.handleLogout);

    // Shift & Mode
    UI.bindModeButtons();
    UI.bindShiftButtons();
    UI.bindUnifiedControls();
    UI.bindToolbarToggle();
    UI.bindScreenNav();
    UI.bindLogsheetHelp();
    UI.bindColToggleCollapse();
    UI.bindViewModeToggle();

    // Keyboard navigation
    Navigation.bindKeyboard();
    Navigation.bindFocusin();
    Navigation.bindColumnToggles();
    Navigation.bindColumnPresets();
    Navigation.loadColumnPreset();
    if (State.el.oeeIndicator) {
      State.el.oeeIndicator.addEventListener('click', () => UI.showScreen('oee'));
    }

    // ============================================================
    // ROW INTERACTIONS (delegation pada tbody)
    // ============================================================
    State.el.tbody.addEventListener('input', (e) => {
      const t = e.target;

      // Auto-resize textarea
      if (t.tagName === 'TEXTAREA' && ['kegiatan','masalah','disposisi','wo'].includes(t.getAttribute('data-f'))) {
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

    // ============================================================
    // EVENT CHANGE (Batch & Kode)
    // ============================================================
    State.el.tbody.addEventListener('change', (e) => {
      if (e.target.getAttribute('data-f') === 'batch') {
        const tr = e.target.closest('tr');
        const productName = e.target.value;
        // Update WO untuk baris ini
        Rows.applyWoFromBatch(tr);
        // Cascade produk ke bawah
        if (productName) {
          Rows.cascadeProductToBelow(tr, productName);
        }
        Calculation.recalc();
      }
      if (e.target.getAttribute('data-f') === 'kode') {
        Rows.applyCat(e.target.closest('tr'));
        Rows.applyWoFromBatch(e.target.closest('tr')); // jaga-jaga kalau Batch sudah dipilih duluan
      }
    });

    // ============================================================
    // FOCUSOUT (validasi waktu)
    // ============================================================
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

    // ============================================================
    // HAPUS BARIS (tombol del)
    // ============================================================
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

    // ============================================================
    // MASTER PRODUK & OPERATOR → recalc + sync ke Master
    // ============================================================
    ['prodName1','prodName2','prodName3','prodRate1','prodRate2','prodRate3','prodWo1','prodWo2','prodWo3'].forEach(id => {
      if (!State.el[id]) return;
      State.el[id].addEventListener('input', () => {
        if (id.startsWith('prodName') || id.startsWith('prodRate')) {
          Rows.updateAllDropdowns();
          Rows.updateMatrixProductHeaders();
          Calculation.recalc();
        }
        // Sync ke input di halaman Master Produk (jika ada)
        const masterEl = document.querySelector(`[data-sync="${id}"]`);
        if (masterEl && masterEl.value !== State.el[id].value) masterEl.value = State.el[id].value;
      });
    });

    // ============================================================
    // SYNC DUA ARAH: Master Produk ↔ Sheet Produk
    // ============================================================
    document.querySelectorAll('#masterProductGrid [data-sync]').forEach(el => {
      el.addEventListener('input', () => {
        const targetId = el.getAttribute('data-sync');
        const target = State.el[targetId] || document.getElementById(targetId);
        if (target && target.value !== el.value) {
          target.value = el.value;
          target.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    });

    // ============================================================
    // FILTER CHANGES → reload
    // ============================================================
    ['fDate','fLine','fStage'].forEach(id => {
      State.el[id].addEventListener('change', Storage.loadRecord);
    });
    // Indikator Shift & Tanggal di toolbar atas ikut update tiap tanggal/tahapan diganti
    State.el.fDate.addEventListener('input', UI.updateShiftIndicator);
    State.el.fStage.addEventListener('change', () => { UI.updateShiftIndicator(); });
    State.el.fLine.addEventListener('change', () => { UI.updateUnifiedControl(); });

    // ============================================================
    // BUTTONS
    // ============================================================
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

    // ============================================================
    // Ctrl+S SHORTCUT
    // ============================================================
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
  const bindLoginThemeToggle = () => {
    const buttons = document.querySelectorAll('[data-login-theme]');
    if (!buttons.length || typeof Settings === 'undefined') return;

    const sync = () => {
      const current = Settings.getLoginTheme();
      buttons.forEach(btn => {
        const active = btn.dataset.loginTheme === current;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    };

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const theme = btn.dataset.loginTheme;
        Settings.setLoginTheme(theme);
        sync();
        if (typeof UI !== 'undefined' && UI.toast) {
          UI.toast(theme === 'professional' ? 'Tema login Profesional dipilih' : 'Tema login Santai dipilih');
        }
      });
    });

    sync();
  };

  /**
   * Toggle Tema Aplikasi (Standar / Profesional) — dipakai di seluruh
   * aplikasi (app bar, sidebar, bottom nav, tombol, dst), bukan cuma
   * layar login. Nilainya independen dari tema login.
   */
  const bindAppThemeToggle = () => {
    const buttons = document.querySelectorAll('[data-app-theme]');
    if (!buttons.length || typeof Settings === 'undefined') return;

    const sync = () => {
      const current = Settings.getTheme();
      buttons.forEach(btn => {
        btn.classList.toggle('on', btn.dataset.appTheme === current);
      });
    };

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        Settings.setTheme(btn.dataset.appTheme);
        sync();
        if (typeof UI !== 'undefined' && UI.toast) {
          UI.toast(btn.dataset.appTheme === 'professional' ? 'Tema aplikasi Profesional aktif' : 'Tema aplikasi Standar aktif');
        }
      });
    });

    sync();
  };

  const bindDisplayModeToggle = () => {
    const buttons = document.querySelectorAll('[data-display-mode]');
    if (!buttons.length || typeof Settings === 'undefined') return;

    const sync = () => {
      const current = Settings.getDisplayMode();
      buttons.forEach(btn => {
        const active = btn.dataset.displayMode === current;
        btn.classList.toggle('on', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        const indicator = btn.querySelector('i');
        if (indicator) indicator.textContent = active ? '✓' : '○';
      });
    };

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = Settings.setDisplayMode(btn.dataset.displayMode);
        sync();
        if (typeof UI !== 'undefined' && UI.toast) {
          UI.toast(mode === 'dark' ? 'Mode gelap aktif' : 'Mode terang aktif');
        }
      });
    });

    sync();
  };

  const init = () => {
    State.initElements();
    bindLoginThemeToggle();
    bindAppThemeToggle();
    bindDisplayModeToggle();

    // Inisialisasi client Supabase (butuh CONFIG.SUPABASE_URL/ANON_KEY terisi benar)
    if (typeof SupabaseClient !== 'undefined') SupabaseClient.init();

    bindEvents();

    // Mode Input Cepat (Normal / Cepat 1 / Cepat 2) — additive, tidak
    // mengubah alur Mode Normal yang sudah ada.
    if (typeof QuickMode !== 'undefined') QuickMode.init();

    // Mode Form Input (kartu per-baris, additive — tabel tetap source of truth)
    if (typeof FormMode !== 'undefined') FormMode.init();
    if (typeof FormModeFull !== 'undefined') FormModeFull.init();

    // Isi Massal (kotak input daftar bernomor untuk kolom Kode / Jam Mulai)
    if (typeof BulkFill !== 'undefined') BulkFill.init();
    if (typeof PrintSheet !== 'undefined') PrintSheet.bind();

    // Autocomplete kode produk di kolom Nama Produk (Sheet + Master)
    if (typeof Suggest !== 'undefined' && Suggest.attachProductAll) {
      Suggest.attachProductAll('#prodName1, #prodName2, #prodName3, #masterProdName1, #masterProdName2, #masterProdName3');
    }

    Auth.initSession();

    // Coba kirim antrean offline yang tertunda (jika ada) begitu app siap
    if (typeof Sync !== 'undefined') Sync.flushQueue();
  };

  return { startMain, init };
})();

// Boot aplikasi saat DOM siap
document.addEventListener('DOMContentLoaded', App.init);