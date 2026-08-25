/**
 * SYNC.JS
 * Mengelola antrean offline & sinkronisasi ke Supabase (tabel oee_data).
 * Item (row lengkap sesuai kolom tabel) yang gagal ter-upload disimpan
 * di localStorage lalu dicoba ulang otomatis saat online kembali.
 */
const Sync = (() => {
  'use strict';

  const SYNC_KEY = 'tkl_sync_queue_v2';

  const getQueue = () => {
    try { return JSON.parse(localStorage.getItem(SYNC_KEY) || '[]'); }
    catch (e) { return []; }
  };

  const setQueue = (q) => {
    try { localStorage.setItem(SYNC_KEY, JSON.stringify(q)); }
    catch (e) { /* storage penuh / tidak tersedia */ }
  };

  const queueLength = () => getQueue().length;

  /**
   * Simpan/replace item di antrean berdasarkan `key` (satu item terbaru
   * per kombinasi date|shift|line|tahapan, tidak menumpuk duplikat).
   */
  const queuePush = (row) => {
    const q = getQueue();
    const idx = q.findIndex(x => x.key === row.key);
    if (idx >= 0) q[idx] = row; else q.push(row);
    setQueue(q);
    return q.length;
  };

  /**
   * Kirim satu row ke Supabase (upsert berdasarkan kolom `key`).
   */
  const pushRow = async (row) => {
    const client = SupabaseClient.getClient();
    if (!client) throw new Error('Supabase client tidak aktif');

    const { error } = await client
      .from(CONFIG.DB_TABLE)
      .upsert(row, { onConflict: 'key' });

    if (error) throw error;
  };

  /**
   * Coba kirim semua item di antrean. Dipanggil otomatis saat
   * koneksi kembali online, dan berkala tiap 30 detik sebagai jaga-jaga.
   */
  const flushQueue = async () => {
    if (!navigator.onLine) return;
    const client = SupabaseClient.getClient();
    if (!client) return;

    const q = getQueue();
    if (!q.length) return;

    const sisa = [];
    for (const row of q) {
      try { await pushRow(row); }
      catch (e) { sisa.push(row); }
    }
    setQueue(sisa);

    const berhasil = q.length - sisa.length;
    if (berhasil > 0 && typeof UI !== 'undefined') {
      UI.setSyncStatus(
        'ok',
        sisa.length ? `✓ sebagian tersinkron (${berhasil}/${q.length})` : '✓ semua data tersinkron ke Supabase'
      );
      UI.toast(sisa.length ? `Sync sebagian selesai (${berhasil}/${q.length})` : 'Antrean sync selesai ✓');
    }
  };

  window.addEventListener('online', flushQueue);
  // Lewat Perf.every supaya berhenti saat app disembunyikan (event 'online'
  // di atas tetap jalan independen, jadi begitu koneksi balik saat app
  // sedang dibuka, antrean tetap langsung terkirim).
  if (typeof Perf !== 'undefined') Perf.every(30000, flushQueue);
  else setInterval(flushQueue, 30000);

  return { queuePush, queueLength, pushRow, flushQueue };
})();
