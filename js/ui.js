/**
 * UI.JS
 * Menangani komponen UI non-bisnis: clock, toast, mode navigasi, shift,
 * chip status sync, install PWA, dll.
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
    setInterval(tick, 1000);
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

  // ====== INDIKATOR SHIFT & TANGGAL AKTIF (di toolbar atas, tidak perlu scroll) ======
  const updateShiftIndicator = () => {
    if (!State.el.shiftIndicatorText) return;
    const dateVal = State.el.fDate ? State.el.fDate.value : '';
    const dateText = dateVal ? Utils.formatDateText(dateVal) : '— pilih tanggal —';
    const stageVal = State.el.fStage ? State.el.fStage.value : '';
    const stageText = stageVal ? '_' + stageVal.charAt(0).toUpperCase() + stageVal.slice(1) : '';
    State.el.shiftIndicatorText.textContent = `SHIFT ${State.evalShift + 1} · ${dateText}${stageText}`;
  };

  const bindShiftButtons = () => {
    document.querySelectorAll('.shiftsel button').forEach(b => {
      b.addEventListener('click', () => {
        State.evalShift = parseInt(b.getAttribute('data-shift'), 10) || 0;
        try { localStorage.setItem(CONFIG.EVAL_SHIFT_KEY, String(State.evalShift)); } catch(e){}
        applyShiftUI();
        Storage.loadRecord();
        toast(`Shift ${State.evalShift + 1} · A = ${CONFIG.SHIFT_A[State.evalShift]} mnt`);
      });
    });
  };

  const loadEvalShift = () => {
    try {
      const e = parseInt(localStorage.getItem(CONFIG.EVAL_SHIFT_KEY), 10);
      if (e >= 0 && e <= 2) State.evalShift = e;
    } catch(e) {}
  };

  // ====== APP BAR MENU (dropdown "☰", gaya native app) ======
  const setToolbarCollapsed = (collapsed) => {
    const toolbar = document.querySelector('.toolbar');
    if (!toolbar) return;
    toolbar.classList.toggle('collapsed', collapsed);
    if (State.el.toolbarToggleIcon) State.el.toolbarToggleIcon.textContent = collapsed ? '☰' : '✕';
    try { localStorage.setItem(CONFIG.TOOLBAR_COLLAPSED_KEY, collapsed ? '1' : '0'); } catch(e){}
  };

  const bindToolbarToggle = () => {
    if (!State.el.toolbarToggle) return;

    State.el.toolbarToggle.addEventListener('click', () => {
      const toolbar = document.querySelector('.toolbar');
      const isCollapsed = toolbar && toolbar.classList.contains('collapsed');
      setToolbarCollapsed(!isCollapsed);
    });

    // Klik backdrop gelap = tutup menu
    const backdrop = document.querySelector('.toolbar-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', () => setToolbarCollapsed(true));
    }
  };

  const loadToolbarCollapsed = () => {
    // Default: menu TERTUTUP (gaya native app — dropdown baru muncul saat
    // tombol ☰ diklik). Kalau user sudah pernah pilih sebelumnya, ikuti itu.
    let collapsed = true;
    try {
      const saved = localStorage.getItem(CONFIG.TOOLBAR_COLLAPSED_KEY);
      if (saved !== null) collapsed = saved === '1';
    } catch(e){}
    setToolbarCollapsed(collapsed);
  };

  // ====== SCREEN NAV (pindah antar section tanpa perlu scroll) ======
  const showScreen = (screenId, silent) => {
    if (!screenId) return;
    document.querySelectorAll('.sheet > .sec[data-screen]').forEach(sec => {
      sec.classList.toggle('active', sec.getAttribute('data-screen') === screenId);
    });
    document.querySelectorAll('.screen-tab').forEach(tab => {
      tab.classList.toggle('on', tab.getAttribute('data-screen') === screenId);
    });
    try { localStorage.setItem(CONFIG.ACTIVE_SCREEN_KEY, screenId); } catch(e){}
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

  // ====== PANDUAN LOG SHEET (help panel, disembunyikan default) ======
  const bindLogsheetHelp = () => {
    if (!State.el.logsheetHelpBtn || !State.el.logsheetHelpPanel) return;
    State.el.logsheetHelpBtn.addEventListener('click', () => {
      const isHidden = State.el.logsheetHelpPanel.hasAttribute('hidden');
      if (isHidden) State.el.logsheetHelpPanel.removeAttribute('hidden');
      else State.el.logsheetHelpPanel.setAttribute('hidden', '');
      State.el.logsheetHelpBtn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
    });
  };

  // ====== CEKLIS TAMPILKAN KOLOM (bisa digulung, ringkas) ======
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
    let open = false; // ringkas/gulung secara default
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

    // Saat mode Form / Form Lengkap aktif, sembunyikan ceklis "Tampilkan Kolom"
    // & panel Panduan — tidak relevan dan cuma bikin scroll tambahan saat
    // sedang fokus mengisi satu baris (mirip pengalaman native di ponsel).
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
    updateShiftIndicator,
    bindToolbarToggle, loadToolbarCollapsed,
    bindScreenNav, loadActiveScreen, showScreen,
    bindLogsheetHelp,
    setColToggleOpen, bindColToggleCollapse, loadColToggleState,
    setViewMode, bindViewModeToggle, loadViewMode,
    updateEditChip, setSyncStatus,
    setupPWA, registerServiceWorker,
  };
})();