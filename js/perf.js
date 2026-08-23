/**
 * PERF.JS
 * Scheduler ringan pengganti banyak `setInterval` terpisah yang tersebar di
 * berbagai file (jam, sinkron kotak operator, efek cuaca, dst).
 *
 * Kenapa dibuat:
 * - Sebelumnya ada 7 timer berbeda yang jalan TERUS-MENERUS selama aplikasi
 *   dibuka, bahkan saat HP ditinggal di background / layar dikunci. Ini
 *   boros baterai/CPU dan bisa nambah rasa "berat" terutama di HP low-end.
 * - Sekarang semua timer itu didaftarkan ke SATU mesin (`Perf.every`), dan
 *   mesin ini otomatis BERHENTI TOTAL saat tab/app disembunyikan
 *   (document.hidden), lalu jalan lagi begitu dibuka.
 *
 * Cara pakai (di file lain):
 *   Perf.every(500, fungsiYangMauDipanggilBerkala);
 * Sama persis efeknya dengan `setInterval(fungsi, 500)`, cuma lebih hemat.
 *
 * Aman dipakai berkali-kali; kalau script ini gagal dimuat, file lain akan
 * otomatis balik pakai setInterval biasa (lihat pola try/catch di
 * masing-masing file).
 */
const Perf = (() => {
  'use strict';

  const TICK_MS = 200; // resolusi pengecekan; cukup halus untuk interval 500ms ke atas
  const jobs = []; // { fn, ms, last }
  let masterTimer = null;

  const tick = () => {
    if (document.hidden) return; // app tidak kelihatan → jangan kerja apa-apa
    const now = Date.now();
    for (const job of jobs) {
      if (now - job.last >= job.ms) {
        job.last = now;
        try { job.fn(); } catch (err) { console.error('[Perf] job error:', err); }
      }
    }
  };

  const ensureMaster = () => {
    if (masterTimer) return;
    masterTimer = setInterval(tick, TICK_MS);
  };

  /** Daftarkan fungsi supaya dipanggil kira-kira setiap `ms` milidetik. */
  const every = (ms, fn) => {
    if (typeof fn !== 'function') return;
    jobs.push({ fn, ms, last: Date.now() });
    ensureMaster();
  };

  // Begitu app kelihatan lagi (buka HP, buka tab), jangan langsung "kejar"
  // semua job yang ketinggalan sekaligus — cukup mulai hitung dari sekarang.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      const now = Date.now();
      jobs.forEach(job => { job.last = now; });
    }
  });

  return { every };
})();
