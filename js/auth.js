/**
 * AUTH.JS
 * Menangani autentikasi PIN & manajemen sesi.
 */
const Auth = (() => {
  'use strict';

  const handleLogin = (e) => {
    e.preventDefault();
    const pinInput = State.el.loginPin.value.trim();
    const remember = State.el.rememberMe.checked;

    if (pinInput === CONFIG.CORRECT_PIN) {
      State.el.loginError.classList.remove('show');
      const storage = remember ? localStorage : sessionStorage;
      storage.setItem(CONFIG.AUTH_KEY, 'true');
      initSession();
    } else {
      State.el.loginError.classList.add('show');
      State.el.loginPin.value = '';
      State.el.loginPin.focus();
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(CONFIG.AUTH_KEY);
    sessionStorage.removeItem(CONFIG.AUTH_KEY);
    State.el.appContainer.classList.remove('show');
    State.el.loginOverlay.classList.remove('hide');
    State.el.loginPin.value = '';
    State.el.loginPin.focus();
    UI.toast('Sesi diakhiri, Anda telah keluar 🔒');
  };

  const initSession = () => {
    const isLogged =
      localStorage.getItem(CONFIG.AUTH_KEY) === 'true' ||
      sessionStorage.getItem(CONFIG.AUTH_KEY) === 'true';

    if (isLogged) {
      State.el.loginOverlay.classList.add('hide');
      State.el.appContainer.classList.add('show');
      App.startMain(); // boot aplikasi utama
    } else {
      State.el.loginOverlay.classList.remove('hide');
      State.el.appContainer.classList.remove('show');
    }
  };

  return { handleLogin, handleLogout, initSession };
})();
