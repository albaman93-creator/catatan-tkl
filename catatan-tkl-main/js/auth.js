/**
 * AUTH.JS
 * Autentikasi via Supabase Auth (email & password).
 * Session otomatis di-cache oleh Supabase SDK di localStorage,
 * sehingga user tetap login walau browser ditutup/offline
 * (selama tidak logout manual atau token benar-benar kedaluwarsa).
 */
const Auth = (() => {
  'use strict';

  let currentUser = null;

  const getClient = () => (typeof SupabaseClient !== 'undefined' ? SupabaseClient.getClient() : null);

  const showError = (msg) => {
    State.el.loginError.textContent = msg || 'Email atau password salah. Silakan coba lagi.';
    State.el.loginError.classList.add('show');
  };

  const hideError = () => {
    State.el.loginError.classList.remove('show');
  };

  const setLoading = (loading) => {
    if (!State.el.loginBtn) return;
    State.el.loginBtn.disabled = loading;
    State.el.loginBtn.textContent = loading ? 'Memeriksa…' : 'Masuk Aplikasi';
  };

  /**
   * Submit form login (email + password).
   */
  const handleLogin = async (e) => {
    e.preventDefault();
    hideError();

    const client = getClient();
    if (!client) {
      showError('Supabase belum dikonfigurasi. Hubungi admin (lihat SETUP-SUPABASE.md).');
      return;
    }

    if (!navigator.onLine) {
      showError('Tidak ada koneksi internet. Login pertama kali wajib online.');
      return;
    }

    const email = State.el.loginEmail.value.trim();
    const password = State.el.loginPassword.value;

    if (!email || !password) {
      showError('Email dan password wajib diisi.');
      return;
    }

    setLoading(true);
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      showError(
        /invalid login credentials/i.test(error.message)
          ? 'Email atau password salah.'
          : error.message
      );
      State.el.loginPassword.value = '';
      State.el.loginPassword.focus();
      return;
    }

    currentUser = data.user;
    onLoginSuccess();
  };

  /**
   * Logout dari Supabase & kembali ke layar login.
   */
  const handleLogout = async () => {
    const client = getClient();
    if (client) {
      try { await client.auth.signOut(); } catch (e) { /* abaikan jika offline */ }
    }
    currentUser = null;
    State.el.appContainer.classList.remove('show');
    State.el.loginOverlay.classList.remove('hide');

    // ✅ Tutup sidebar saat logout
    document.body.classList.remove('sidebar-open');
    if (State.el.toolbarToggleIcon) {
      State.el.toolbarToggleIcon.textContent = '☰';
    }

    State.el.loginPassword.value = '';
    if (State.el.loginEmail) State.el.loginEmail.focus();
    UI.toast('Sesi diakhiri, Anda telah keluar 🔒');
  };

  const onLoginSuccess = () => {
    hideError();

    // Tema login menjadi sumber tema aplikasi:
    // Login Profesional -> aplikasi otomatis Profesional.
    // Login Santai -> aplikasi otomatis kembali ke tema Standar.
    if (typeof Settings !== 'undefined' && Settings.syncAppThemeWithLoginTheme) {
      Settings.syncAppThemeWithLoginTheme();
    }

    State.el.loginOverlay.classList.add('hide');
    State.el.appContainer.classList.add('show');
    App.startMain();
  };

  /**
   * Dipanggil sekali saat boot aplikasi.
   * Cek apakah sudah ada sesi Supabase yang tersimpan (persisted session).
   */
  const initSession = async () => {
    const client = getClient();

    if (!client) {
      // Supabase belum dikonfigurasi (URL/key masih placeholder) → tampilkan login,
      // tapi beri tahu user via pesan error saat mencoba submit.
      State.el.loginOverlay.classList.remove('hide');
      State.el.appContainer.classList.remove('show');
      return;
    }

    if (State.el.loginOfflineNote) {
      State.el.loginOfflineNote.style.display = navigator.onLine ? 'none' : 'block';
    }

    try {
      const { data } = await client.auth.getSession();
      if (data && data.session) {
        currentUser = data.session.user;
        onLoginSuccess();
      } else {
        State.el.loginOverlay.classList.remove('hide');
        State.el.appContainer.classList.remove('show');
      }
    } catch (e) {
      State.el.loginOverlay.classList.remove('hide');
      State.el.appContainer.classList.remove('show');
    }

    // Jika sesi berakhir/di-logout dari tab/perangkat lain → paksa kembali ke login
    client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        currentUser = null;
        State.el.appContainer.classList.remove('show');
        State.el.loginOverlay.classList.remove('hide');

        // ✅ Tutup sidebar juga ketika session berakhir
        document.body.classList.remove('sidebar-open');
        if (State.el.toolbarToggleIcon) {
          State.el.toolbarToggleIcon.textContent = '☰';
        }
      }
    });

    // Update indikator offline saat status koneksi berubah
    window.addEventListener('online', () => {
      if (State.el.loginOfflineNote) State.el.loginOfflineNote.style.display = 'none';
    });
    window.addEventListener('offline', () => {
      if (State.el.loginOfflineNote && State.el.loginOverlay && !State.el.loginOverlay.classList.contains('hide')) {
        State.el.loginOfflineNote.style.display = 'block';
      }
    });
  };

  const getCurrentUser = () => currentUser;

  return { handleLogin, handleLogout, initSession, getCurrentUser };
})();