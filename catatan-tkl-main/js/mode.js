/**
 * MODE.JS
 * Menangani mode input: Normal, Cepat 1, dan Cepat 2 (Super Cepat).
 * Mengatur dialog konfirmasi, pemilihan jumlah produk, dan visibility kolom.
 */
const Mode = (() => {
  'use strict';

  const init = () => {
    // Load mode from localStorage
    try {
      const savedMode = localStorage.getItem(CONFIG.MODE_KEY);
      if (savedMode && CONFIG.MODE_FIELDS[savedMode]) {
        State.inputMode = savedMode;
      }
    } catch(e) {}

    bindModeSelector();
    bindDialogs();
    applyModeUI();
  };

  const bindModeSelector = () => {
    document.querySelectorAll('#modeSelector button').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode');
        if (mode === State.inputMode) return;
        requestModeChange(mode);
      });
    });
  };

  const requestModeChange = (mode) => {
    if (mode === 'normal') {
      State.inputMode = 'normal';
      State.modeInitialized = false;
      try { localStorage.setItem(CONFIG.MODE_KEY, State.inputMode); } catch(e){}
      applyModeUI();
      initializeRowsForMode();
      UI.toast('Mode Normal diaktifkan');
      return;
    }

    // Cepat 1 or Cepat 2
    const isCepat1 = (mode === 'cepat1');
    const title = isCepat1 ? 'Aktifkan Mode Cepat 1?' : 'Apakah yakin ingin mengaktifkan mode cepat?';
    const msg = isCepat1 
      ? 'Mode Cepat 1 akan memfokuskan pada Kode Produk dan Rate.' 
      : 'Mode Super Cepat akan mempercepat pengisian data OEE.';
    const icon = isCepat1 ? '🚀' : '⚡';

    State.el.modeConfirmTitle.textContent = title;
    State.el.modeConfirmMsg.textContent = msg;
    State.el.modeConfirmIcon.textContent = icon;
    State.el.modeConfirmOverlay.classList.remove('hide');
    
    // Store pending mode
    State.el.modeConfirmOverlay.dataset.pendingMode = mode;
    State.el.modeProductOverlay.dataset.pendingMode = mode;
  };

  const bindDialogs = () => {
    State.el.modeConfirmCancel.addEventListener('click', () => {
      State.el.modeConfirmOverlay.classList.add('hide');
      updateModeButtons();
    });

    State.el.modeProductCancel.addEventListener('click', () => {
      State.el.modeProductOverlay.classList.add('hide');
      updateModeButtons();
    });

    State.el.modeConfirmOk.addEventListener('click', () => {
      State.el.modeConfirmOverlay.classList.add('hide');
      State.el.modeProductTitle.textContent = 'Anda akan mengisi berapa produk?';
      State.el.modeProductOverlay.classList.remove('hide');
    });

    const setProductCount = (count) => {
      const mode = State.el.modeProductOverlay.dataset.pendingMode || 'cepat1';
      State.productCount = count;
      State.inputMode = mode;
      State.modeInitialized = true;
      try { localStorage.setItem(CONFIG.MODE_KEY, State.inputMode); } catch(e){}
      State.el.modeProductOverlay.classList.add('hide');
      applyModeUI();
      initializeRowsForMode();
      UI.toast(`Mode ${mode === 'cepat1' ? 'Cepat 1' : 'Super Cepat'} · ${count} Produk`);
    };

    State.el.modeProductOne.addEventListener('click', () => setProductCount(1));
    State.el.modeProductTwo.addEventListener('click', () => setProductCount(2));
    State.el.modeProductThree.addEventListener('click', () => setProductCount(3));
  };

  const updateModeButtons = () => {
    document.querySelectorAll('#modeSelector button').forEach(btn => {
      btn.classList.toggle('on', btn.getAttribute('data-mode') === State.inputMode);
    });
  };

  const applyModeUI = () => {
    updateModeButtons();
    const mode = State.inputMode;
    const activeFields = CONFIG.MODE_FIELDS[mode] || CONFIG.MODE_FIELDS.normal;

    // Force vertical navigation in Cepat 1
    if (mode === 'cepat1') {
      State.navMode = 'v';
      try { localStorage.setItem(CONFIG.NAV_MODE_KEY, State.navMode); } catch(e){}
      UI.applyModeUI();
    }

    // Show/hide columns based on mode
    document.querySelectorAll('.col-toggle-bar input[type="checkbox"]').forEach(chk => {
      const colClass = chk.getAttribute('data-col');
      const fieldName = colClass.replace('col-', '');
      
      if (mode !== 'normal') {
        // Always keep Nomor and Aksi visible
        if (colClass === 'col-num' || colClass === 'col-aksi') {
          chk.checked = true;
        } else {
          const isActive = activeFields.includes(fieldName);
          chk.checked = isActive;
        }
      }
    });
    Navigation.syncColumnVisibility();

    // Durasi readonly/disabled in normal mode
    // Disable Jam Mulai on rows > 0 in Cepat modes
    Rows.rows().forEach((tr, idx) => {
      const durInput = tr.querySelector('[data-f="durasi"]');
      if (durInput) {
        durInput.readOnly = (mode === 'normal');
        durInput.disabled = (mode === 'normal');
      }
      const mEl = tr.querySelector('[data-f="mulai"]');
      if (mEl) {
        mEl.disabled = (mode !== 'normal' && idx > 0);
      }
      const sEl = tr.querySelector('[data-f="selesai"]');
      if (sEl) {
        sEl.readOnly = (mode !== 'normal');
      }
    });
  };

  const initializeRowsForMode = () => {
    State.el.tbody.innerHTML = '';
    const rowCount = State.inputMode === 'normal' ? CONFIG.DEFAULT_ROWS : 20;
    for (let i = 0; i < rowCount; i++) {
      Rows.makeRow();
    }
    Rows.updateRowNumbers();
    Calculation.recalc();

    if (State.inputMode !== 'normal') {
      const rows = Rows.rows();
      rows.forEach((tr, idx) => {
        const mEl = tr.querySelector('[data-f="mulai"]');
        if (mEl) {
          // Enable only first row in Cepat modes
          mEl.disabled = (idx > 0);
        }
        const sEl = tr.querySelector('[data-f="selesai"]');
        if (sEl) {
          sEl.readOnly = true;
        }
        const dEl = tr.querySelector('[data-f="durasi"]');
        if (dEl) {
          dEl.readOnly = false;
          dEl.disabled = false;
        }
      });
      const firstKode = rows[0] && rows[0].querySelector('[data-f="kode"]');
      if (firstKode) firstKode.focus();
    }
  };

  return { init, applyModeUI, initializeRowsForMode };
})();
