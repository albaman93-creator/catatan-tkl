/**
 * SETTINGS.JS
 * Preferensi tampilan yang disimpan lokal (localStorage), independen dari
 * akun/login — bukan bagian dari payload data OEE.
 */
const Settings = (() => {
  'use strict';

  const KEY_DECOR = 'fima_decor_enabled';
  const KEY_THEME = 'fima_theme';
  const KEY_LOGIN_THEME = 'fima_login_theme';

  const isDecorEnabled = () => localStorage.getItem(KEY_DECOR) === '1';

  const setDecorEnabled = (on) => {
    localStorage.setItem(KEY_DECOR, on ? '1' : '0');
  };

  const getTheme = () => localStorage.getItem(KEY_THEME) || 'light';

  const applyTheme = (mode) => {
    document.documentElement.setAttribute('data-theme', mode);
  };

  const setTheme = (mode) => {
    localStorage.setItem(KEY_THEME, mode);
    applyTheme(mode);
  };

  const toggleTheme = () => {
    const next = getTheme() === 'dark' ? 'light' : 'dark';
    setTheme(next);
    return next;
  };

  /* =========================
     LOGIN THEME
     'santai' | 'professional'
     ========================= */
  const normalizeLoginTheme = (mode) =>
    mode === 'professional' ? 'professional' : 'santai';

  const getLoginTheme = () =>
    normalizeLoginTheme(localStorage.getItem(KEY_LOGIN_THEME) || 'santai');

  const applyLoginTheme = (mode) => {
    const theme = normalizeLoginTheme(mode);
    const overlay = document.getElementById('loginOverlay');
    if (!overlay) return theme;

    overlay.classList.toggle('login-theme-santai', theme === 'santai');
    overlay.classList.toggle('login-theme-professional', theme === 'professional');
    return theme;
  };

  const setLoginTheme = (mode) => {
    const theme = normalizeLoginTheme(mode);
    localStorage.setItem(KEY_LOGIN_THEME, theme);
    applyLoginTheme(theme);
    return theme;
  };

  const toggleLoginTheme = () => {
    const next = getLoginTheme() === 'professional' ? 'santai' : 'professional';
    return setLoginTheme(next);
  };

  // Terapkan tema aplikasi tersimpan.
  applyTheme(getTheme());

  // Terapkan tema login setelah elemen overlay tersedia.
  document.addEventListener('DOMContentLoaded', () => {
    applyLoginTheme(getLoginTheme());

    const overlay = document.getElementById('loginOverlay');
    if (overlay) {
      overlay.classList.toggle('decor-on', isDecorEnabled());
    }
  });

  return {
    isDecorEnabled,
    setDecorEnabled,
    getTheme,
    setTheme,
    toggleTheme,
    getLoginTheme,
    setLoginTheme,
    toggleLoginTheme
  };
})();
