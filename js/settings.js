/**
 * SETTINGS.JS
 * Preferensi tampilan yang disimpan lokal (localStorage), independen dari
 * akun/login — bukan bagian dari payload data OEE.
 *
 * Menangani: (1) toggle elemen dekoratif, (2) tema terang/gelap,
 * (3) tema halaman login ('santai' = nature scene, 'professional' =
 * clean corporate). Modul ini akan berkembang jadi halaman Pengaturan
 * penuh di Tahap E.
 */
const Settings = (() => {
  'use strict';

  const KEY_DECOR = 'fima_decor_enabled';
  const KEY_THEME = 'fima_theme';       // 'light' | 'dark'
  const KEY_LOGIN_THEME = 'fima_login_theme'; // 'santai' | 'professional'

  /**
   * Default OFF. Sengaja dibalik dari perilaku lama — supaya kesan pertama
   * aplikasi tetap profesional untuk pengguna baru.
   */
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

  // ---------- Tema Halaman Login ----------
  const getLoginTheme = () => localStorage.getItem(KEY_LOGIN_THEME) || 'professional';

  const applyLoginTheme = (mode) => {
    document.body.classList.toggle('login-theme-professional', mode === 'professional');
  };

  const setLoginTheme = (mode) => {
    localStorage.setItem(KEY_LOGIN_THEME, mode);
    applyLoginTheme(mode);
  };

  // Terapkan tema tersimpan sesegera mungkin (jalan begitu file diparse)
  applyTheme(getTheme());

  return {
    isDecorEnabled, setDecorEnabled,
    getTheme, setTheme, toggleTheme,
    getLoginTheme, setLoginTheme, applyLoginTheme
  };
})();

// Terapkan tema login tersimpan + dekorasi landscape SVG login HANYA jika
// operator sudah mengaktifkannya.
document.addEventListener('DOMContentLoaded', () => {
  // Terapkan tema login (default: professional). Body mungkin belum ada saat
  // script diparse, jadi pastikan dulu.
  Settings.applyLoginTheme(Settings.getLoginTheme());

  // Landscape SVG hanya tampil di tema santai DAN decor aktif
  const overlay = document.getElementById('loginOverlay');
  if (overlay) {
    overlay.classList.toggle('decor-on',
      Settings.isDecorEnabled() && Settings.getLoginTheme() === 'santai');
  }
});
