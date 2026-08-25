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
  const KEY_DISPLAY_MODE = 'fima_display_mode';

  const isDecorEnabled = () => localStorage.getItem(KEY_DECOR) === '1';

  const setDecorEnabled = (on) => {
    localStorage.setItem(KEY_DECOR, on ? '1' : '0');
  };

  const getTheme = () => localStorage.getItem(KEY_THEME) || 'light';

  const getDisplayMode = () => localStorage.getItem(KEY_DISPLAY_MODE) === 'dark' ? 'dark' : 'light';

  const applyDisplayMode = (mode) => {
    const normalized = mode === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-display-mode', normalized);
    return normalized;
  };

  const applyTheme = (mode) => {
    document.documentElement.setAttribute('data-theme', mode);
    applyDisplayMode(getDisplayMode());
  };

  const setTheme = (mode) => {
    localStorage.setItem(KEY_THEME, mode);
    applyTheme(mode);
    return mode;
  };

  const setDisplayMode = (mode) => {
    const normalized = mode === 'dark' ? 'dark' : 'light';
    localStorage.setItem(KEY_DISPLAY_MODE, normalized);
    applyDisplayMode(normalized);
    return normalized;
  };

  const toggleTheme = () => {
    return setDisplayMode(getDisplayMode() === 'dark' ? 'light' : 'dark');
  };

  applyDisplayMode(getDisplayMode());

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

  /*
   * Sinkronisasi tema aplikasi dengan tema yang dipakai saat login.
   * Jika user masuk menggunakan Login Profesional, aplikasi langsung
   * memakai tema Profesional tanpa perlu memilih tema lagi di dalam aplikasi.
   */
  const syncAppThemeWithLoginTheme = () => {
    const appTheme = getLoginTheme() === 'professional' ? 'professional' : 'light';
    setTheme(appTheme);
    return appTheme;
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
    getDisplayMode,
    setDisplayMode,
    applyDisplayMode,
    getLoginTheme,
    setLoginTheme,
    toggleLoginTheme,
    syncAppThemeWithLoginTheme
  };
})();
