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

    let { error } = await client
      .from(CONFIG.DB_TABLE)
      .upsert(row, { onConflict: 'key' });

    // Kolom `source` belum ada (SQL sinkron Sheets belum dijalankan) → ulangi tanpa kolom itu
    if (error && /source/i.test(error.message || '') && 'source' in row) {
      const { source, ...noSource } = row;
      row = noSource;
      ({ error } = await client.from(CONFIG.DB_TABLE).upsert(row, { onConflict: 'key' }));
    }

    if (!error) return;

    // 409 / 23505: baris untuk (date, shift, line, tahapan) yang sama sudah ada dengan `key` berbeda.
    // Upsert via `key` tidak menemukannya → UPDATE langsung berdasarkan 4 kolom itu.
    const isConflict = error.code === '23505' || error.status === 409 || /duplicate key/i.test(error.message || '');
    if (!isConflict) throw error;

    const { key, ...rest } = row;
    const { data, error: err2 } = await client
      .from(CONFIG.DB_TABLE)
      .update(rest)
      .match({ date: row.date, shift: row.shift, line: row.line, tahapan: row.tahapan })
      .select('key');
    if (err2) throw err2;
    if (!data || !data.length) throw error; // tidak ada baris ter-update (mis. RLS) → laporkan error asli
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
