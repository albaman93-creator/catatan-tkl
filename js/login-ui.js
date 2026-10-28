/**
 * LOGIN-UI.JS
 * Interaksi kecil halaman login: tombol tampil/sembunyi password.
 */
(() => {
  'use strict';
  const btn = document.getElementById('loginPwToggle');
  const input = document.getElementById('loginPassword');
  if (!btn || !input) return;

  btn.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.classList.toggle('on', show);
    btn.setAttribute('aria-pressed', show ? 'true' : 'false');
    btn.setAttribute('aria-label', show ? 'Sembunyikan password' : 'Tampilkan password');
    input.focus({ preventScroll: true });
  });
})();
