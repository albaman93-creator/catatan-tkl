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
    State.el.shiftIndicatorText.textContent = `SHIFT ${State.evalShift + 1} · ${dateText}`;
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
    updateEditChip, setSyncStatus,
    setupPWA, registerServiceWorker,
  };
})();
