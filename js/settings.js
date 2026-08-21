/**
 * SETTINGS.JS
 * Preferensi tampilan yang disimpan lokal (localStorage), independen dari
 * akun/login — bukan bagian dari payload data OEE.
 *
 * Untuk Tahap A menangani dua hal: (1) toggle elemen dekoratif (background
 * cuaca/musim/kembang api di layar login, default OFF), dan (2) tema
 * terang/gelap. Modul ini akan berkembang jadi halaman Pengaturan penuh di
 * Tahap E (target OEE, koordinat pabrik, dst.) — dibuat terpisah dari
 * sekarang supaya perluasannya nanti tidak mengubah file lain.
 */
const Settings = (() => {
  'use strict';

  const KEY_DECOR = 'fima_decor_enabled';
  const KEY_THEME = 'fima_theme'; // 'light' | 'dark'

  /**
   * Default OFF. Ini sengaja dibalik dari perilaku lama (yang selalu ON) —
   * supaya kesan pertama aplikasi tetap profesional untuk pengguna baru.
   * Operator yang suka efek cuaca/musim bisa menyalakannya sendiri lewat
   * halaman Pengaturan (Tahap E).
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

  // Terapkan tema tersimpan sesegera mungkin (di luar IIFE return, jalan
  // begitu file ini diparse) — supaya tidak ada kedipan warna salah sesaat
  // sebelum DOMContentLoaded.
  applyTheme(getTheme());

  return { isDecorEnabled, setDecorEnabled, getTheme, setTheme, toggleTheme };
})();

// Terapkan sekali di awal: nyalakan landscape SVG login HANYA kalau
// operator sudah pernah mengaktifkannya. Modul nature/scene/weather.js
// masing-masing juga sudah menjaga diri sendiri (early-return) — ini
// lapis CSS-nya, supaya tidak ada elemen SVG lama nongol tanpa animasi.
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('loginOverlay');
  if (overlay) overlay.classList.toggle('decor-on', Settings.isDecorEnabled());
});
