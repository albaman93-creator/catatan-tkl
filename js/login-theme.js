/**
 * LOGIN-THEME.JS
 * Mengatur tema layar login: 'santai' (landscape SVG animasi, default)
 * atau 'professional' (dark glassmorphism). Tersimpan di localStorage
 * dengan key 'fima_login_theme', independen dari settings.js (yang saat
 * ini belum dimuat di index.html) — sengaja dibuat berdiri sendiri
 * supaya tidak menyalakan sistem lain (decor toggle / dark mode app)
 * yang belum selesai diintegrasikan.
 *
 * PENTING: script ini harus dimuat sesegera mungkin — persis setelah
 * tag pembuka <div id="loginOverlay">, sebelum children-nya diparse —
 * supaya tema tersimpan langsung terpasang tanpa flash tema yang salah.
 */
const LoginTheme = (() => {
  'use strict';

  const KEY = 'fima_login_theme'; // 'santai' | 'professional'
  const DEFAULT_THEME = 'santai';

  const getLoginTheme = () => localStorage.getItem(KEY) || DEFAULT_THEME;

  // Label tombol menampilkan tema TUJUAN (yang akan aktif kalau diklik),
  // bukan tema yang sedang aktif — supaya jelas ini ajakan untuk beralih.
  const updateToggleLabel = (mode) => {
    const btn = document.getElementById('loginThemeToggle');
    if (!btn) return;
    btn.textContent = mode === 'professional' ? '🌤 Tema Santai' : '🌃 Tema Profesional';
  };

  const applyLoginTheme = (mode) => {
    const overlay = document.getElementById('loginOverlay');
    if (overlay) {
      overlay.classList.remove('login-theme-santai', 'login-theme-professional');
      overlay.classList.add(mode === 'professional' ? 'login-theme-professional' : 'login-theme-santai');
    }
    updateToggleLabel(mode);
  };

  const setLoginTheme = (mode) => {
    const next = mode === 'professional' ? 'professional' : 'santai';
    localStorage.setItem(KEY, next);
    applyLoginTheme(next);
    return next;
  };

  const toggleLoginTheme = () => {
    const next = getLoginTheme() === 'professional' ? 'santai' : 'professional';
    return setLoginTheme(next);
  };

  // Terapkan tema tersimpan sesegera mungkin — lihat catatan di atas
  // soal urutan <script> ini di index.html. Tombol #loginThemeToggle
  // sendiri belum ada di DOM di titik ini (baru diparse belakangan),
  // jadi label & event listener-nya dipasang lagi saat DOMContentLoaded.
  applyLoginTheme(getLoginTheme());

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('loginThemeToggle');
    if (!btn) return;
    updateToggleLabel(getLoginTheme());
    btn.addEventListener('click', () => toggleLoginTheme());
  });

  return { getLoginTheme, setLoginTheme, toggleLoginTheme };
})();
