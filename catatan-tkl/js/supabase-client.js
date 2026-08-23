/**
 * SUPABASE-CLIENT.JS
 * Inisialisasi client Supabase global.
 * File ini harus dimuat setelah config.js dan sebelum auth.js
 */
const SupabaseClient = (() => {
  'use strict';

  let client = null;

  const init = () => {
    if (CONFIG.AUTH_MODE !== 'supabase') {
      console.log('ℹ️ Auth mode: PIN (legacy) — Supabase tidak diinisialisasi');
      return null;
    }

    if (CONFIG.SUPABASE_URL.includes('YOUR_PROJECT_ID') || CONFIG.SUPABASE_ANON_KEY.includes('YOUR_ANON_KEY')) {
      console.warn('⚠️ Supabase belum dikonfigurasi! Edit config.js dan isi SUPABASE_URL & SUPABASE_ANON_KEY');
      return null;
    }

    try {
      client = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storage: localStorage,
        }
      });
      console.log('✅ Supabase client initialized');
      return client;
    } catch (err) {
      console.error('❌ Gagal inisialisasi Supabase:', err);
      return null;
    }
  };

  const getClient = () => client;

  return { init, getClient };
})();
