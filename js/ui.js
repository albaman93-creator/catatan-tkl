/**
 * UI.JS
 * Menangani komponen UI non-bisnis: clock, toast, mode navigasi, shift,
 * chip status sync, install PWA, dll.
 * 
 * Versi terbaru: Menu & Pengaturan menggunakan SIDEBAR KIRI.
 * (Class .sidebar-open pada <body> menggantikan .toolbar.collapsed lama)
 */
const UI = (() => {
  'use strict';

  // ====== CLOCK ======
  const tick = () => {
    const n = new Date();
    State.el.clock.textContent = n.toLocaleTimeString('id-ID', { hour12: false });
    State.el.dateEl.textContent = n.toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  };

  const startClock = () => {
    tick();
    // Lewat Perf.every supaya jam berhenti "berdetak" saat app disembunyikan
    // (hemat baterai/CPU), lalu langsung update lagi begitu dibuka kembali.
    if (typeof Perf !== 'undefined') Perf.every(1000, tick);
    else setInterval(tick, 1000);
  };

  // ====== TOAST ======
  const toast = (msg, isErr = false, type = null) => {
    const el = State.el.toast;
    el.textContent = msg;
    el.className = '';
    if (type === 'warn')     el.classList.add('warn');
    else if (isErr)          el.classList.add('err');
    el.classList.add('show');
    clearTimeout(State.toastTimer);
    State.toastTimer = setTimeout(() => {
      el.classList.remove('show', 'err', 'warn');
    }, 3000);
  };

  // ====== TEXTAREA AUTO-RESIZE ======
  const autoResizeTextarea = (ta) => {
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  };

  // ====== MODE NAVIGASI (VERTIKAL/HORIZONTAL) ======
  const applyModeUI = () => {
    document.querySelectorAll('.navmode button').forEach(b => {
      b.classList.toggle('on', b.getAttribute('data-mode') === State.navMode);
    });
    State.el.hint.innerHTML = State.navMode === 'v'
      ? '<kbd>Tab</kbd>/<kbd>Enter</kbd> ↓ kolom · <kbd>Shift+Tab</kbd> ↑ · <kbd>⌫</kbd> mundur · <kbd>←</kbd><kbd>→</kbd> pindah kolom'
      : '<kbd>Tab</kbd>/<kbd>Enter</kbd> → baris · <kbd>Shift+Tab</kbd> ← · <kbd>⌫</kbd> mundur · <kbd>↑</kbd><kbd>↓</kbd> pindah baris';
    Navigation.applyTabOrder();
  };

  const bindModeButtons = () => {
    document.querySelectorAll('.navmode button').forEach(b => {
      b.addEventListener('click', () => {
        State.navMode = b.getAttribute('data-mode');
        try { localStorage.setItem(CONFIG.NAV_MODE_KEY, State.navMode); } catch(e){}
        applyModeUI();
        toast(State.navMode === 'v' ? 'Mode: ⇅ VERTIKAL' : 'Mode: ⇄ HORIZONTAL');
      });
    });
  };

  const loadNavMode = () => {
    try {
      State.navMode = localStorage.getItem(CONFIG.NAV_MODE_KEY) === 'h' ? 'h' : 'v';
    } catch(e) {}
  };

  // ====== SHIFT SELECTION ======
  const applyShiftUI = () => {
    document.querySelectorAll('.shiftsel button').forEach(b => {
      b.classList.toggle('on', parseInt(b.getAttribute('data-shift'), 10) === State.evalShift);
    });
    const maxMnt = CONFIG.SHIFT_A[State.evalShift];
    State.el.rincSub.textContent = `Evaluasi Shift ${State.evalShift + 1} · A = ${maxMnt} mnt`;
    State.el.maxShiftMnt.textContent = maxMnt;
    State.el.maxShiftMnt2.textContent = maxMnt;
    updateShiftIndicator();
  };

  // ====== INDIKATOR SHIFT & TANGGAL AKTIF ======
  const formatSheetDate = (raw) => {
    if (!raw) return 'PILIH TANGGAL';
    const d = new Date(raw + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
  };

  const updateUnifiedControl = () => {
    const stageVal = State.el.fStage ? State.el.fStage.value : 'mixing';
    const lineVal = State.el.fLine ? String(State.el.fLine.value) : '1';
    const dateVal = State.el.fDate ? State.el.fDate.value : '';

    const root = State.el.sheetUnifiedControl;
    if (root) root.dataset.stage = stageVal;

    document.querySelectorAll('[data-sheet-stage]').forEach(btn => {
      const on = btn.getAttribute('data-sheet-stage') === stageVal;
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    document.querySelectorAll('[data-sheet-line]').forEach(btn => {
      btn.classList.toggle('on', btn.getAttribute('data-sheet-line') === lineVal);
    });

    document.querySelectorAll('#sheetShift button[data-shift]').forEach(btn => {
      const shift = parseInt(btn.getAttribute('data-shift'), 10);
      btn.classList.toggle('on', shift === State.evalShift);
    });

    if (State.el.sheetDateText) State.el.sheetDateText.textContent = formatSheetDate(dateVal);

    // KPI mini-bar membaca elemen kalkulasi resmi sehingga tidak ada state ganda.
    if (State.el.sheetKpiA && State.el.oF) State.el.sheetKpiA.textContent = `${State.el.oF.textContent}%`;
    if (State.el.sheetKpiP && State.el.oITotal) State.el.sheetKpiP.textContent = `${State.el.oITotal.textContent}%`;
    if (State.el.sheetKpiQ && State.el.oM) State.el.sheetKpiQ.textContent = `${State.el.oM.textContent}%`;
    if (State.el.sheetKpiOEE && State.el.oee) State.el.sheetKpiOEE.textContent = State.el.oee.textContent;

    // Health bar + warna dinamis per KPI (merah/kuning/hijau/biru sesuai target)
    updateKpiHealthBar(State.el.sheetKpiA && State.el.sheetKpiA.closest('.sheet-kpi'), State.el.oF && State.el.oF.textContent);
    updateKpiHealthBar(State.el.sheetKpiP && State.el.sheetKpiP.closest('.sheet-kpi'), State.el.oITotal && State.el.oITotal.textContent);
    updateKpiHealthBar(State.el.sheetKpiQ && State.el.sheetKpiQ.closest('.sheet-kpi'), State.el.oM && State.el.oM.textContent);
    updateKpiHealthBar(State.el.sheetKpiOEE && State.el.sheetKpiOEE.closest('.sheet-kpi'), State.el.oee && State.el.oee.textContent);
  };

  // ====== KPI HEALTH BAR ======
  // Mengisi .kpi-fill (lebar) & data-state (warna) pada kartu .sheet-kpi
  // berdasarkan rasio nilai aktual terhadap data-target di HTML.
  // Aturan: >target = biru (terlampaui) | =target = hijau (tercapai)
  //         >=75% target = kuning (mendekati) | <75% target = merah (jauh)
  // Efek bintang emas otomatis muncul saat status hijau/biru (target tercapai).
  const updateKpiHealthBar = (kpiEl, rawValueText) => {
    if (!kpiEl) return;
    const fillEl = kpiEl.querySelector('.kpi-fill');
    if (!fillEl) return;

    const target = parseFloat(kpiEl.getAttribute('data-target'));
    const value = parseFloat(String(rawValueText || '0').replace(',', '.'));

    if (!isFinite(target) || target <= 0 || !isFinite(value)) {
      fillEl.style.width = '0%';
      kpiEl.setAttribute('data-state', 'red');
      kpiEl.classList.remove('kpi-achieved');
      return;
    }

    const EPS = 0.001; // toleransi floating-point untuk anggap "sama dengan target"
    const ratio = value / target;
    const widthPct = Math.max(0, Math.min(ratio * 100, 100));

    let state;
    let achieved = false;
    if (value > target + EPS) {
      state = 'blue';       // melebihi target
      achieved = true;
    } else if (value >= target - EPS) {
      state = 'green';      // mencapai target
      achieved = true;
    } else if (value >= target * 0.75) {
      state = 'yellow';     // mendekati target
    } else {
      state = 'red';        // masih jauh dari target
    }

    fillEl.style.width = `${widthPct}%`;
    kpiEl.setAttribute('data-state', state);
    kpiEl.classList.toggle('kpi-achieved', achieved);
  };

  // ====== INDIKATOR SHIFT & TANGGAL AKTIF ======
  const updateShiftIndicator = () => {
    if (!State.el.shiftIndicatorText) return;
    const dateVal = State.el.fDate ? State.el.fDate.value : '';
    const dateText = dateVal ? Utils.formatDateText(dateVal) : '— pilih tanggal —';
    const stageVal = State.el.fStage ? State.el.fStage.value : '';
    const stageText = stageVal ? '_' + stageVal.charAt(0).toUpperCase() + stageVal.slice(1) : '';
    State.el.shiftIndicatorText.textContent = `SHIFT ${State.evalShift + 1} · ${dateText}${stageText}`;

    // Warna indikator mengikuti Tahapan Proses yang aktif
    if (State.el.shiftIndicator) {
      ['stage-mixing','stage-filling','stage-steril','stage-kemas','stage-visual'].forEach(c => {
        State.el.shiftIndicator.classList.remove(c);
      });
      if (stageVal) State.el.shiftIndicator.classList.add('stage-' + stageVal);
    }
    updateUnifiedControl();
  };

  const setEvalShift = (shift) => {
    const next = Math.max(0, Math.min(2, parseInt(shift, 10) || 0));
    State.evalShift = next;
    try { localStorage.setItem(CONFIG.EVAL_SHIFT_KEY, String(next)); } catch(e){}
    applyShiftUI();
    updateUnifiedControl();
    if (typeof Storage !== 'undefined' && Storage.loadRecord) Storage.loadRecord();
    if (typeof Rows !== 'undefined' && Rows.refreshFirstRowStartTime) Rows.refreshFirstRowStartTime(); // ← tambahan
    toast(`Shift ${next + 1} · A = ${CONFIG.SHIFT_A[next]} mnt`);
  };

  const bindShiftButtons = () => {
    // Tombol shift lama tetap berfungsi, tetapi hanya #fShift agar
    // kontrol unified tidak menerima dua handler sekaligus.
    document.querySelectorAll('#fShift button[data-shift]').forEach(b => {
      b.addEventListener('click', () => setEvalShift(b.getAttribute('data-shift')));
    });
  };

  const loadEvalShift = () => {
    try {
      const e = parseInt(localStorage.getItem(CONFIG.EVAL_SHIFT_KEY), 10);
      if (e >= 0 && e <= 2) State.evalShift = e;
    } catch(e) {}
  };

  // ====== UNIFIED SHEET CONTROL ======
  const bindUnifiedControls = () => {
    const root = State.el.sheetUnifiedControl;
    if (!root) return;

    // Satu event delegation: lebih tahan terhadap re-render/DOM patch dan
    // memastikan tombol unified selalu benar-benar mengubah filter utama.
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn || !root.contains(btn)) return;

      const shift = btn.getAttribute('data-sheet-shift');
      if (shift !== null) {
        e.preventDefault();
        setEvalShift(shift);
        return;
      }

      const stage = btn.getAttribute('data-sheet-stage');
      if (stage && State.el.fStage) {
        e.preventDefault();
        State.el.fStage.value = stage;
        updateShiftIndicator();
        // Load record untuk kombinasi filter baru.
        if (typeof Storage !== 'undefined' && Storage.loadRecord) Storage.loadRecord();
        toast(`Tahapan: ${stage.charAt(0).toUpperCase() + stage.slice(1)}`);
        return;
      }

      const line = btn.getAttribute('data-sheet-line');
      if (line && State.el.fLine) {
        e.preventDefault();
        State.el.fLine.value = line;
        updateUnifiedControl();
        if (typeof Storage !== 'undefined' && Storage.loadRecord) Storage.loadRecord();
        toast(`Line ${line}`);
      }
    });

    if (State.el.sheetDateTrigger && State.el.fDate) {
      State.el.sheetDateTrigger.addEventListener('click', () => {
        try {
          if (typeof State.el.fDate.showPicker === 'function') State.el.fDate.showPicker();
          else { State.el.fDate.focus(); State.el.fDate.click(); }
        } catch (e) {
          State.el.fDate.focus();
          State.el.fDate.click();
        }
      });
    }

    if (State.el.fDate) {
      State.el.fDate.addEventListener('input', updateUnifiedControl);
      State.el.fDate.addEventListener('change', updateUnifiedControl);
    }

    updateUnifiedControl();
  };

  // ====== SIDEBAR (Menu & Pengaturan) ======
  /**
   * Buka/tutup sidebar.
   * @param {boolean} open - true = sidebar terbuka, false = tertutup
   */
  const setSidebarOpen = (open) => {
    document.body.classList.toggle('sidebar-open', open);
    if (State.el.toolbarToggleIcon) {
      State.el.toolbarToggleIcon.textContent = open ? '✕' : '☰';
    }
    try { localStorage.setItem(CONFIG.TOOLBAR_COLLAPSED_KEY, open ? '0' : '1'); } catch(e){}
  };

  const bindToolbarToggle = () => {
    if (!State.el.toolbarToggle) return;

    State.el.toolbarToggle.addEventListener('click', () => {
      const isOpen = document.body.classList.contains('sidebar-open');
      setSidebarOpen(!isOpen);
    });

    // Klik backdrop untuk menutup sidebar
    const backdrop = document.querySelector('.sidebar-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', () => setSidebarOpen(false));
    }

    // Setelah user memilih/klik salah satu aksi di sidebar (Setup Awal,
    // Dashboard, Print, Reset, Simpan, Keluar, Install, dsb) — sidebar
    // otomatis tertutup lagi, fokus balik ke apa yang baru saja dipilih.
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      sidebar.addEventListener('click', (e) => {
        if (e.target.closest('button')) setSidebarOpen(false);
      });
    }
  };

  const loadToolbarCollapsed = () => {
    // Default: sidebar terbuka di desktop, tertutup di mobile
    let open = window.matchMedia('(min-width: 769px)').matches;
    try {
      const saved = localStorage.getItem(CONFIG.TOOLBAR_COLLAPSED_KEY);
      if (saved === '0') open = true;
      else if (saved === '1') open = false;
    } catch(e){}
    setSidebarOpen(open);
  };

  // ====== SCREEN NAV ======
  const showScreen = (screenId, silent) => {
    if (!screenId) return;
    document.querySelectorAll('.sheet > .sec[data-screen]').forEach(sec => {
      sec.classList.toggle('active', sec.getAttribute('data-screen') === screenId);
    });
    document.querySelectorAll('.screen-tab').forEach(tab => {
      tab.classList.toggle('on', tab.getAttribute('data-screen') === screenId);
    });
    try { localStorage.setItem(CONFIG.ACTIVE_SCREEN_KEY, screenId); } catch(e){}
    // Dashboard baru menarik data dari Supabase saat tabnya benar-benar dibuka
    if (screenId === 'dashboard' && typeof Dashboard !== 'undefined') Dashboard.open();
    if (!silent) {
      const sheet = document.querySelector('.sheet');
      if (sheet) sheet.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const bindScreenNav = () => {
    document.querySelectorAll('.screen-tab').forEach(tab => {
      tab.addEventListener('click', () => showScreen(tab.getAttribute('data-screen')));
    });
  };

  const loadActiveScreen = () => {
    let screenId = 'filter';
    try {
      const saved = localStorage.getItem(CONFIG.ACTIVE_SCREEN_KEY);
      if (saved && document.querySelector(`.screen-tab[data-screen="${saved}"]`)) screenId = saved;
    } catch(e){}
    showScreen(screenId, true);
  };

  // ====== PANDUAN LOG SHEET ======
  const bindLogsheetHelp = () => {
    if (!State.el.logsheetHelpBtn || !State.el.logsheetHelpPanel) return;
    State.el.logsheetHelpBtn.addEventListener('click', () => {
      const isHidden = State.el.logsheetHelpPanel.hasAttribute('hidden');
      if (isHidden) State.el.logsheetHelpPanel.removeAttribute('hidden');
      else State.el.logsheetHelpPanel.setAttribute('hidden', '');
      State.el.logsheetHelpBtn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
    });
  };

  // ====== CEKLIS TAMPILKAN KOLOM ======
  const setColToggleOpen = (open) => {
    if (!State.el.colToggleBar || !State.el.colToggleHead) return;
    if (open) State.el.colToggleBar.removeAttribute('hidden');
    else State.el.colToggleBar.setAttribute('hidden', '');
    State.el.colToggleHead.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (State.el.colToggleIcon) State.el.colToggleIcon.textContent = open ? '▾' : '▸';
    try { localStorage.setItem(CONFIG.COL_TOGGLE_OPEN_KEY, open ? '1' : '0'); } catch(e){}
  };

  const bindColToggleCollapse = () => {
    if (!State.el.colToggleHead) return;
    State.el.colToggleHead.addEventListener('click', () => {
      const isOpen = !State.el.colToggleBar.hasAttribute('hidden');
      setColToggleOpen(!isOpen);
    });
  };

  const loadColToggleState = () => {
    let open = false;
    try { open = localStorage.getItem(CONFIG.COL_TOGGLE_OPEN_KEY) === '1'; } catch(e){}
    setColToggleOpen(open);
  };

  // ====== MODE TAMPILAN: TABEL vs FORM vs FORM LENGKAP ======
  const setViewMode = (mode) => {
    if (!State.el.tblWrap || !State.el.formPanel) return;
    if (mode !== 'table' && mode !== 'form' && mode !== 'form-full') mode = 'table';

    State.el.tblWrap.hidden = mode !== 'table';
    State.el.formPanel.hidden = mode !== 'form';
    if (State.el.formFullPanel) State.el.formFullPanel.hidden = mode !== 'form-full';

    if (State.el.viewModeToggle) {
      State.el.viewModeToggle.querySelectorAll('button[data-view]').forEach(b => {
        b.classList.toggle('on', b.getAttribute('data-view') === mode);
      });
    }

    const logsheetSec = document.querySelector('.sec[data-screen="logsheet"]');
    if (logsheetSec) logsheetSec.dataset.view = mode;

    try { localStorage.setItem(CONFIG.VIEW_MODE_KEY, mode); } catch(e){}

    if (mode === 'form' && typeof FormMode !== 'undefined') FormMode.render();
    if (mode === 'form-full' && typeof FormModeFull !== 'undefined') FormModeFull.render();
  };

  const bindViewModeToggle = () => {
    if (!State.el.viewModeToggle) return;
    State.el.viewModeToggle.querySelectorAll('button[data-view]').forEach(b => {
      b.addEventListener('click', () => setViewMode(b.getAttribute('data-view')));
    });
  };

  const loadViewMode = () => {
    let mode = 'table';
    try {
      const saved = localStorage.getItem(CONFIG.VIEW_MODE_KEY);
      if (saved === 'form' || saved === 'form-full') mode = saved;
    } catch(e){}
    setViewMode(mode);
  };

  // ====== SYNC STATUS CHIP ======
  const applyChip = () => {
    const kind  = State.el.syncStatus.dataset.kind || '';
    const sText = State.el.syncStatus.dataset.sync || '';
    const eText = State.el.syncStatus.dataset.edit || '';
    const full  = sText ? (sText + ' · ' + eText) : eText;
    State.el.syncStatus.className = 'edit-info' + (kind ? ' ' + kind : '');
    State.el.syncStatus.innerHTML = '<i class="sync-dot"></i>' + full;
  };

  const updateEditChip = (d) => {
    let base;
    if (d && d.savedAt) {
      const dt = new Date(d.savedAt);
      base = '✓ diedit ' + dt.toLocaleDateString('id-ID', { day:'2-digit', month:'short' })
        + ' ' + dt.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
    } else {
      base = 'belum ada data tersimpan untuk filter ini';
    }
    State.el.syncStatus.dataset.edit = base;
    applyChip();
  };

  const setSyncStatus = (kind, text) => {
    State.el.syncStatus.dataset.kind = kind || '';
    State.el.syncStatus.dataset.sync = text || '';
    applyChip();
  };

  // ====== PWA INSTALL ======
  const setupPWA = () => {
    const installBtn = State.el['pwa-install-btn'];

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      State.deferredPrompt = e;
      installBtn.classList.add('show');
    });

    installBtn.addEventListener('click', () => {
      if (State.deferredPrompt) {
        State.deferredPrompt.prompt();
        State.deferredPrompt.userChoice.then((result) => {
          if (result.outcome === 'accepted') toast('Aplikasi berhasil diinstall ✓');
          else toast('Installasi dibatalkan');
          State.deferredPrompt = null;
          installBtn.classList.remove('show');
        });
      }
    });

    window.addEventListener('appinstalled', () => {
      installBtn.classList.remove('show');
      toast('Aplikasi terinstall ✓');
    });
  };

  // ====== REGISTER SERVICE WORKER ======
  const registerServiceWorker = () => {
    if (!('serviceWorker' in navigator)) return;
    const isSecure =
      location.protocol === 'https:' ||
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1';
    if (!isSecure) return;

    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(reg => console.log('✅ SW registered:', reg))
      .catch(err => console.warn('⚠️ SW failed:', err));
  };

  return {
    tick, startClock, toast, autoResizeTextarea,
    applyModeUI, bindModeButtons, loadNavMode,
    applyShiftUI, bindShiftButtons, loadEvalShift,
    updateShiftIndicator, updateUnifiedControl, bindUnifiedControls,
    bindToolbarToggle, loadToolbarCollapsed,
    bindScreenNav, loadActiveScreen, showScreen,
    bindLogsheetHelp,
    setColToggleOpen, bindColToggleCollapse, loadColToggleState,
    setViewMode, bindViewModeToggle, loadViewMode,
    updateEditChip, setSyncStatus,
    setupPWA, registerServiceWorker,
  };
})();