/**
 * PROFILE-AVATAR.JS
 * Ikon profil bulat di pojok kanan atas app-bar.
 * - Ada foto (user_metadata.avatar_url / picture) → tampilkan foto.
 * - Tidak ada foto → huruf pertama email (mis. tkl@opr.com → "T").
 * Klik ikon → menu kecil berisi email + tombol Keluar (meneruskan ke #btnLogout).
 */
const ProfileAvatar = (() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const getInitial = (email) => {
    const m = String(email || '').trim().match(/[A-Za-z0-9]/);
    return m ? m[0].toUpperCase() : '?';
  };

  const paint = (el, initial, photo) => {
    el.textContent = '';
    if (photo) {
      const img = new Image();
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => { el.textContent = initial; };  // foto gagal → inisial
      img.src = photo;
      el.appendChild(img);
    } else {
      el.textContent = initial;
    }
  };

  const refresh = () => {
    const btn = $('apBtn');
    if (!btn) return;
    const user = (typeof Auth !== 'undefined' && Auth.getCurrentUser) ? Auth.getCurrentUser() : null;
    const offline = typeof Auth !== 'undefined' && Auth.isOfflineMode && Auth.isOfflineMode();
    const email = user && user.email ? user.email : '';
    const meta = (user && (user.user_metadata || {})) || {};
    const photo = offline ? '' : (meta.avatar_url || meta.picture || '');
    const initial = getInitial(email);

    paint(btn, initial, photo);
    paint($('apAvatarLg'), initial, photo);
    $('apEmail').textContent = offline ? 'Mode Offline' : (email || '-');
    $('apSub').textContent = offline ? 'Data hanya tersimpan di perangkat ini' : 'Sedang login';
    btn.title = offline ? 'Mode Offline' : (email || 'Profil');
  };

  const closeMenu = () => {
    const menu = $('apMenu'), btn = $('apBtn');
    if (menu) menu.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  };

  const openMenu = () => {
    const menu = $('apMenu'), btn = $('apBtn');
    refresh();
    menu.hidden = false;
    const r = btn.getBoundingClientRect();
    menu.style.top = (r.bottom + 8) + 'px';
    menu.style.right = Math.max(12, window.innerWidth - r.right) + 'px';
    btn.setAttribute('aria-expanded', 'true');
  };

  const init = () => {
    const btn = $('apBtn');
    if (!btn) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      $('apMenu').hidden ? openMenu() : closeMenu();
    });
    $('apMenu').addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', closeMenu);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
    window.addEventListener('resize', closeMenu);

    $('apLogout').addEventListener('click', () => {
      closeMenu();
      const real = $('btnLogout');
      if (real) real.click();
    });

    refresh();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return { refresh, closeMenu };
})();
