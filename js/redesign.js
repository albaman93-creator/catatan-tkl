/**
 * REDESIGN.JS — lapisan presentasi untuk tampilan "Clean Corporate Dashboard"
 *
 * File ini HANYA mengurus elemen visual baru di topbar & sidebar:
 *   1. Judul + subjudul halaman di topbar (mengikuti layar aktif)
 *   2. Pusat notifikasi (menampilkan riwayat toast yang sudah ada)
 *   3. Menu profil pengguna (membaca Auth.getCurrentUser, tombol Keluar
 *      meneruskan klik ke #btnLogout yang sudah ada)
 *   4. Drawer sidebar di layar < 1024px: tertutup saat aplikasi dibuka,
 *      Escape menutup, dan fokus dikembalikan ke tombol menu.
 *
 * Tidak ada logika bisnis, API, data, atau routing yang diubah di sini:
 * semua perpindahan layar tetap lewat UI.showScreen() milik ui.js, semua
 * toast tetap lewat UI.toast(), dan logout tetap lewat Auth.handleLogout().
 * Kalau file ini gagal dimuat, aplikasi tetap berjalan penuh.
 */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const DESKTOP = '(min-width: 1024px)';
  const NOTIF_KEY = 'fima_ui_notif_log';   // sessionStorage: hilang saat tab ditutup
  const NOTIF_MAX = 30;

  /* ---------------------------------------------------------
     1. JUDUL HALAMAN
     --------------------------------------------------------- */
  const PAGES = {
    'filter':      ['Data & Produk',    'Tanggal, shift, line, tahapan, dan master produk'],
    'operator':    ['Inisial Operator', 'Operator yang bertugas pada shift ini'],
    'logsheet':    ['Log Sheet Harian', 'Catatan downtime dan produksi per baris'],
    'perf-produk': ['Performa Produk',  'Ringkasan performa per produk'],
    'oee':         ['Hitung OEE',       'Availability, Performance, dan Quality'],
    'dashboard':   ['Dashboard OEE',    'Tren OEE, downtime, dan analisis kode aktivitas'],
    'weekly':      ['Weekly Meeting',   'OEE dan yield mingguan'],
  };

  const syncPageTitle = () => {
    const sec = document.querySelector('.sheet > .sec[data-screen].active');
    const key = sec ? sec.getAttribute('data-screen') : null;
    const info = PAGES[key];
    if (!info) return;
    const t = $('pageTitle'), s = $('pageSubtitle');
    if (t && t.textContent !== info[0]) t.textContent = info[0];
    if (s && s.textContent !== info[1]) s.textContent = info[1];
    document.querySelectorAll('.sb-nav-item').forEach((b) => {
      if (b.classList.contains('on')) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
  };

  const watchScreens = () => {
    const sheet = document.querySelector('.sheet');
    if (!sheet) return;
    new MutationObserver(syncPageTitle).observe(sheet, {
      subtree: true, attributes: true, attributeFilter: ['class'],
    });
    syncPageTitle();
  };

  /* ---------------------------------------------------------
     2. NOTIFIKASI (riwayat toast)
     --------------------------------------------------------- */
  let notifs = [];
  let unread = 0;

  const loadNotifs = () => {
    try {
      const raw = sessionStorage.getItem(NOTIF_KEY);
      if (raw) notifs = JSON.parse(raw) || [];
    } catch (e) { notifs = []; }
  };
  const saveNotifs = () => {
    try { sessionStorage.setItem(NOTIF_KEY, JSON.stringify(notifs.slice(0, NOTIF_MAX))); } catch (e) { /* abaikan */ }
  };

  const hhmm = (ts) => {
    const d = new Date(ts);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  };

  const ICON_BY_TYPE = { err: 'triangle-alert', warn: 'triangle-alert', ok: 'check' };

  const renderNotifs = () => {
    const list = $('notifList');
    if (!list) return;
    list.textContent = '';
    if (!notifs.length) {
      const li = document.createElement('li');
      li.className = 'notif-empty';
      li.textContent = 'Belum ada notifikasi. Pesan sistem seperti simpan data atau sinkronisasi akan muncul di sini.';
      list.appendChild(li);
    } else {
      notifs.forEach((n) => {
        const li = document.createElement('li');
        li.className = 'notif-item notif-item--' + n.type;
        const ico = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        ico.setAttribute('class', 'icon notif-ico');
        ico.setAttribute('aria-hidden', 'true');
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', './icons/sprite.svg#i-' + (ICON_BY_TYPE[n.type] || 'info'));
        ico.appendChild(use);
        const body = document.createElement('div');
        body.className = 'notif-body';
        const msg = document.createElement('span');
        msg.className = 'notif-msg';
        msg.textContent = n.msg;                      // textContent: aman dari injeksi HTML
        const time = document.createElement('time');
        time.className = 'notif-time';
        time.textContent = hhmm(n.ts);
        body.appendChild(msg);
        body.appendChild(time);
        li.appendChild(ico);
        li.appendChild(body);
        list.appendChild(li);
      });
    }
    const dot = $('notifDot');
    if (dot) dot.hidden = unread <= 0;
    const btn = $('notifBtn');
    if (btn) btn.setAttribute('aria-label', unread > 0 ? `Notifikasi, ${unread} baru` : 'Notifikasi');
  };

  const watchToast = () => {
    const toast = $('toast');
    if (!toast) return;
    new MutationObserver(() => {
      const msg = (toast.textContent || '').trim();
      if (!msg) return;
      const type = toast.classList.contains('err') ? 'err'
                 : toast.classList.contains('warn') ? 'warn' : 'ok';
      const last = notifs[0];
      if (last && last.msg === msg && Date.now() - last.ts < 1500) return;   // toast ganda
      notifs.unshift({ msg, type, ts: Date.now() });
      if (notifs.length > NOTIF_MAX) notifs.length = NOTIF_MAX;
      const panel = $('notifPanel');
      if (!panel || panel.hidden) unread += 1;
      saveNotifs();
      renderNotifs();
    }).observe(toast, { childList: true, characterData: true, subtree: true });
  };

  /* ---------------------------------------------------------
     3. PROFIL PENGGUNA
     --------------------------------------------------------- */
  const ROLE_LABEL = { operator: 'Operator', supervisor: 'Supervisor', admin: 'Admin', manager: 'Manager' };

  const refreshProfile = () => {
    let user = null, role = 'operator';
    try {
      if (typeof Auth !== 'undefined') {
        user = Auth.getCurrentUser && Auth.getCurrentUser();
        role = (Auth.getCurrentRole && Auth.getCurrentRole()) || 'operator';
      }
    } catch (e) { /* belum login */ }

    const offline = !!(user && (user.offlineMode || user.pinMode));
    const email = (user && user.email) || '';
    let name = 'Pengguna';
    if (offline) name = 'Mode Offline';
    else if (email) {
      const local = email.split('@')[0] || '';
      name = local ? local.charAt(0).toUpperCase() + local.slice(1) : name;
    }
    const roleText = ROLE_LABEL[String(role).toLowerCase()] || String(role);
    const initial = (offline ? 'O' : name.charAt(0) || 'U').toUpperCase();

    const set = (id, v) => { const el = $(id); if (el && el.textContent !== v) el.textContent = v; };
    set('profileName', name);
    set('profileRole', offline ? 'Data lokal' : roleText);
    set('profileAvatar', initial);
    set('profileAvatarLg', initial);
    set('profileMenuName', name);
    set('profileMenuEmail', offline ? 'Data hanya tersimpan di perangkat ini' : (email || '-'));
  };

  /* ---------------------------------------------------------
     4. POPOVER TOPBAR (notifikasi + profil)
     --------------------------------------------------------- */
  const pops = () => [
    { btn: $('notifBtn'),   panel: $('notifPanel') },
    { btn: $('profileBtn'), panel: $('profileMenu') },
  ].filter((p) => p.btn && p.panel);

  const closePops = (except) => {
    pops().forEach((p) => {
      if (p.panel === except) return;
      p.panel.hidden = true;
      p.btn.setAttribute('aria-expanded', 'false');
    });
  };

  const bindPops = () => {
    pops().forEach((p) => {
      p.btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const willOpen = p.panel.hidden;
        closePops(p.panel);
        p.panel.hidden = !willOpen;
        p.btn.setAttribute('aria-expanded', String(willOpen));
        if (willOpen && p.panel.id === 'notifPanel') { unread = 0; renderNotifs(); }
        if (willOpen && p.panel.id === 'profileMenu') refreshProfile();
      });
      p.panel.addEventListener('click', (e) => e.stopPropagation());
    });
    document.addEventListener('click', () => closePops());

    const clear = $('notifClear');
    if (clear) clear.addEventListener('click', () => { notifs = []; unread = 0; saveNotifs(); renderNotifs(); });

    // Keluar → teruskan ke tombol logout yang sudah ada (logika tidak berubah)
    const lo = $('profileLogout');
    if (lo) lo.addEventListener('click', () => {
      closePops();
      const real = $('btnLogout');
      if (real) real.click();
    });
    // Menu & pengaturan → buka drawer (hanya relevan di layar < 1024px)
    const st = $('profileSettings');
    if (st) st.addEventListener('click', () => {
      closePops();
      const t = $('toolbarToggle');
      if (t && !document.body.classList.contains('sidebar-open')) t.click();
    });
  };

  /* ---------------------------------------------------------
     5. DRAWER SIDEBAR (< 1024px)
     --------------------------------------------------------- */
  const drawerOpen = () => document.body.classList.contains('sidebar-open');

  const closeDrawer = () => {
    const c = $('sidebarClose');
    if (c) c.click();            // memakai handler asli: UI.setSidebarOpen(false)
  };

  const bindDrawer = () => {
    const mq = window.matchMedia(DESKTOP);

    // Saat aplikasi pertama tampil: di layar kecil/tablet drawer harus tertutup.
    const container = $('appContainer');
    let handled = false;
    const afterShow = () => {
      if (handled || !container || !container.classList.contains('show')) return;
      handled = true;
      // loadToolbarCollapsed() berjalan sinkron di App.startMain(); tunggu satu tick.
      setTimeout(() => { if (!mq.matches && drawerOpen()) closeDrawer(); refreshProfile(); }, 0);
    };
    if (container) {
      new MutationObserver(afterShow).observe(container, { attributes: true, attributeFilter: ['class'] });
      afterShow();
    }

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const anyPop = pops().some((p) => !p.panel.hidden);
      if (anyPop) {
        const open = pops().find((p) => !p.panel.hidden);
        closePops();
        if (open) open.btn.focus();
        return;
      }
      if (!mq.matches && drawerOpen()) {
        closeDrawer();
        const t = $('toolbarToggle');
        if (t) t.focus();
      }
    });
  };

  /* ---------------------------------------------------------
     INIT
     --------------------------------------------------------- */
  const init = () => {
    loadNotifs();
    renderNotifs();
    bindPops();
    watchScreens();
    watchToast();
    bindDrawer();
    refreshProfile();
    window.addEventListener('online', refreshProfile);
    window.addEventListener('offline', refreshProfile);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
