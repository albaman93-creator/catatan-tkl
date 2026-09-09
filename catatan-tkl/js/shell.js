/**
 * SHELL.JS
 * Navigasi shell baru (Tahap A): collapse nav rail desktop, command
 * palette (Ctrl/Cmd+K), breadcrumb, visibilitas menu berbasis role, dan
 * wiring toggle di halaman Pengaturan. Murni UI/navigasi tambahan — tidak
 * menyentuh logika data/kalkulasi/keyboard-nav Log Sheet sama sekali.
 */
const Shell = (() => {
  'use strict';

  const RAIL_KEY = 'fima_rail_collapsed';

  const BREADCRUMB_LABEL = {
    filter: 'Data', 'master-produk': 'Master Produk', logsheet: 'Log Sheet',
    operator: 'Inisial Operator', 'perf-produk': 'Rincian Performa', oee: 'Perhitungan OEE',
    dashboard: 'Dashboard', laporan: 'Laporan', admin: 'Admin', pengaturan: 'Pengaturan',
  };

  // Daftar tujuan command palette — dibangun sekali dari item rail supaya
  // tidak dobel-maintain nama/ikon di dua tempat.
  const CMDK_ICON = {
    filter: 'i-filter', 'master-produk': 'i-package', logsheet: 'i-clipboard-list',
    operator: 'i-user-round', 'perf-produk': 'i-trending-up', oee: 'i-target',
    dashboard: 'i-gauge', laporan: 'i-file-text', admin: 'i-shield', pengaturan: 'i-settings',
  };

  let cmdItems = [];      // { id, label, icon, action } — dibangun di init()
  let cmdActiveIdx = 0;

  // ---------- NAV RAIL COLLAPSE ----------
  const loadRailState = () => {
    let collapsed = false;
    try { collapsed = localStorage.getItem(RAIL_KEY) === '1'; } catch (e) {}
    document.body.classList.toggle('rail-collapsed', collapsed);
  };

  const toggleRail = () => {
    const collapsed = !document.body.classList.contains('rail-collapsed');
    document.body.classList.toggle('rail-collapsed', collapsed);
    try { localStorage.setItem(RAIL_KEY, collapsed ? '1' : '0'); } catch (e) {}
  };

  // ---------- BREADCRUMB ----------
  const onScreenChange = (screenId) => {
    if (!State.el.topBreadcrumb) return;
    const label = BREADCRUMB_LABEL[screenId] || screenId;
    const span = State.el.topBreadcrumb.querySelector('.breadcrumb-current');
    if (span) span.textContent = label;
  };

  // ---------- VISIBILITAS BERBASIS ROLE ----------
  const ROLE_LABEL = { admin: 'Admin', supervisor: 'Supervisor', operator: 'Operator' };

  const applyRoleVisibility = () => {
    const role = (typeof Auth !== 'undefined') ? Auth.getCurrentRole() : null;
    document.querySelectorAll('[data-role-gate="admin"]').forEach(el => {
      el.hidden = (role !== 'admin');
    });

    if (State.el.userMenuName && State.el.userMenuRole) {
      const user = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;
      if (user && user.pinMode) {
        State.el.userMenuName.textContent = 'Mode PIN';
        State.el.userMenuRole.textContent = 'offline';
      } else if (user) {
        State.el.userMenuName.textContent = (user.email || '').split('@')[0] || 'Pengguna';
        State.el.userMenuRole.textContent = ROLE_LABEL[role] || 'operator';
      }
    }
  };

  // ---------- USER MENU DROPDOWN ----------
  const bindUserMenu = () => {
    if (!State.el.userMenuBtn || !State.el.userMenuPanel) return;
    State.el.userMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      State.el.userMenuPanel.hidden = !State.el.userMenuPanel.hidden;
    });
    document.addEventListener('click', () => { State.el.userMenuPanel.hidden = true; });
    if (State.el.userMenuLogout) {
      State.el.userMenuLogout.addEventListener('click', () => Auth.handleLogout());
    }
  };

  // ---------- TEMA ----------
  const applyThemeIcon = () => {
    const btn = document.getElementById('themeToggleBtn');
    if (!btn) return;
    const dark = Settings.getTheme() === 'dark';
    btn.innerHTML = '<svg class="icon"><use href="./icons/sprite.svg#' + (dark ? 'i-sun' : 'i-moon') + '"></use></svg>';
  };

  const bindThemeToggle = () => {
    applyThemeIcon();
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.addEventListener('click', () => { Settings.toggleTheme(); applyThemeIcon(); syncSettingsSwitches(); });
  };

  // ---------- HALAMAN PENGATURAN: sinkronkan switch dgn Settings.js ----------
  const syncSettingsSwitches = () => {
    if (State.el.settingsDecorSwitch) State.el.settingsDecorSwitch.checked = Settings.isDecorEnabled();
    const themeSwitch = document.getElementById('settingsThemeSwitch');
    if (themeSwitch) themeSwitch.checked = Settings.getTheme() === 'dark';
  };

  const bindSettingsPage = () => {
    const themeSwitch = document.getElementById('settingsThemeSwitch');
    if (themeSwitch) themeSwitch.addEventListener('change', (e) => {
      Settings.setTheme(e.target.checked ? 'dark' : 'light');
      applyThemeIcon();
    });
    if (State.el.settingsDecorSwitch) State.el.settingsDecorSwitch.addEventListener('change', (e) => {
      Settings.setDecorEnabled(e.target.checked);
      UI.toast(e.target.checked ? 'Elemen dekoratif dinyalakan' : 'Elemen dekoratif dimatikan');
    });
    syncSettingsSwitches();
  };

  // ---------- COMMAND PALETTE ----------
  const buildCmdItems = () => {
    cmdItems = Object.keys(BREADCRUMB_LABEL).map(id => ({
      id, label: BREADCRUMB_LABEL[id], icon: CMDK_ICON[id],
      action: () => UI.showScreen(id),
    }));
    cmdItems.push({
      id: 'logout', label: 'Keluar dari aplikasi', icon: 'i-log-out',
      action: () => Auth.handleLogout(),
    });
  };

  const renderCmdList = (query) => {
    const q = (query || '').trim().toLowerCase();
    const filtered = cmdItems.filter(it => {
      if (it.id === 'admin' && (typeof Auth === 'undefined' || Auth.getCurrentRole() !== 'admin')) return false;
      return !q || it.label.toLowerCase().includes(q);
    });
    cmdActiveIdx = 0;
    if (!filtered.length) {
      State.el.cmdPaletteList.innerHTML = '<div class="cmdk-item-empty">Tidak ada hasil</div>';
      return;
    }
    State.el.cmdPaletteList.innerHTML = filtered.map((it, i) => (
      '<div class="cmdk-item' + (i === 0 ? ' active' : '') + '" data-idx="' + i + '">' +
      '<svg class="icon"><use href="./icons/sprite.svg#' + it.icon + '"></use></svg>' +
      '<span>' + it.label + '</span></div>'
    )).join('');
    State.el.cmdPaletteList.dataset.filteredIds = filtered.map(it => it.id).join(',');
  };

  const cmdFilteredIds = () => (State.el.cmdPaletteList.dataset.filteredIds || '').split(',').filter(Boolean);

  const moveCmdSelection = (delta) => {
    const items = State.el.cmdPaletteList.querySelectorAll('.cmdk-item');
    if (!items.length) return;
    items[cmdActiveIdx] && items[cmdActiveIdx].classList.remove('active');
    cmdActiveIdx = (cmdActiveIdx + delta + items.length) % items.length;
    items[cmdActiveIdx].classList.add('active');
    items[cmdActiveIdx].scrollIntoView({ block: 'nearest' });
  };

  const runCmdActive = () => {
    const ids = cmdFilteredIds();
    const id = ids[cmdActiveIdx];
    const item = cmdItems.find(it => it.id === id);
    if (item) { closeCommandPalette(); item.action(); }
  };

  const openCommandPalette = () => {
    if (!State.el.cmdPaletteOverlay) return;
    buildCmdItems();
    renderCmdList('');
    State.el.cmdPaletteOverlay.hidden = false;
    State.el.cmdPaletteInput.value = '';
    setTimeout(() => State.el.cmdPaletteInput.focus(), 0);
  };

  const closeCommandPalette = () => {
    if (State.el.cmdPaletteOverlay) State.el.cmdPaletteOverlay.hidden = true;
  };

  const bindCommandPalette = () => {
    if (State.el.cmdPaletteBtn) State.el.cmdPaletteBtn.addEventListener('click', openCommandPalette);
    if (!State.el.cmdPaletteOverlay) return;

    const backdrop = State.el.cmdPaletteOverlay.querySelector('.cmdk-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeCommandPalette);

    State.el.cmdPaletteInput.addEventListener('input', (e) => renderCmdList(e.target.value));

    State.el.cmdPaletteList.addEventListener('click', (e) => {
      const row = e.target.closest('.cmdk-item');
      if (!row) return;
      cmdActiveIdx = parseInt(row.dataset.idx, 10) || 0;
      runCmdActive();
    });

    document.addEventListener('keydown', (e) => {
      const isOpen = State.el.cmdPaletteOverlay && !State.el.cmdPaletteOverlay.hidden;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        isOpen ? closeCommandPalette() : openCommandPalette();
        return;
      }
      if (!isOpen) return;
      if (e.key === 'Escape') { closeCommandPalette(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); moveCmdSelection(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); moveCmdSelection(-1); return; }
      if (e.key === 'Enter') { e.preventDefault(); runCmdActive(); return; }
    });
  };

  const init = () => {
    loadRailState();
    if (State.el.navRailToggle) State.el.navRailToggle.addEventListener('click', toggleRail);
    bindUserMenu();
    bindThemeToggle();
    bindCommandPalette();
    bindSettingsPage();
  };

  return { init, onScreenChange, applyRoleVisibility, openCommandPalette, closeCommandPalette };
})();
