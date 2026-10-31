/**
 * Backfill ringkasan lama — mengisi payload.summary (OPE, OEE 365, tabel per produk)
 * untuk record yang disimpan sebelum fitur sinkron Sheets, supaya tab "ringkasan shift"
 * dan "ringkasan produk" terisi.
 *
 * Cara pakai: buka aplikasi (sudah login online), tekan F12 → Console, ketik:
 *   Backfill.run()                                    // semua record yang belum punya ringkasan
 *   Backfill.run({ from: '2026-10-01', to: '2026-10-31' })
 *   Backfill.stop()                                   // hentikan di tengah jalan
 * Tiap record dibuka, dihitung ulang, lalu disimpan (sama seperti klik Simpan).
 */
const Backfill = (() => {
  let running = false;
  let stopFlag = false;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const run = async ({ from, to, pauseMs = 250 } = {}) => {
    if (running) { console.warn('Backfill sedang berjalan'); return; }
    const client = SupabaseClient.getClient();
    if (!client || !navigator.onLine) { console.warn('Harus online & login dulu'); return; }
    running = true; stopFlag = false;
    try {
      let q = client.from(CONFIG.DB_TABLE)
        .select('date,shift,line,tahapan,ope:payload->summary->ope')
        .order('date', { ascending: false })
        .range(0, 4999);
      if (from) q = q.gte('date', from);
      if (to) q = q.lte('date', to);
      const { data, error } = await q;
      if (error) throw error;
      const todo = (data || []).filter((r) => !r.ope);
      console.log(`[Backfill] ${todo.length} record perlu diisi (dari ${(data || []).length})`);

      // Simpan posisi layar sekarang, kembalikan setelah selesai
      const back = Storage.activeFilter();
      let done = 0, failed = 0;
      for (const r of todo) {
        if (stopFlag) break;
        try {
          await UI.openRecord({ date: r.date, shift: r.shift, line: r.line, stage: r.tahapan, stayOnScreen: true });
          await sleep(120);
          if (typeof Calculation !== 'undefined' && Calculation.recalc) Calculation.recalc();
          await Storage.saveData({ silent: true });
          done++;
        } catch (e) {
          failed++;
          console.warn('[Backfill] gagal', r.date, 'S' + r.shift, 'L' + r.line, r.tahapan, e);
        }
        if ((done + failed) % 10 === 0) console.log(`[Backfill] ${done + failed}/${todo.length}`);
        await sleep(pauseMs);
      }
      try {
        await UI.openRecord({ date: back.rawDate, shift: back.shift, line: back.line, stage: back.stage, stayOnScreen: true });
      } catch (_) {}
      console.log(`[Backfill] selesai: ${done} berhasil, ${failed} gagal${stopFlag ? ' (dihentikan)' : ''}`);
      return { done, failed, total: todo.length };
    } finally { running = false; }
  };

  const stop = () => { stopFlag = true; };
  return { run, stop };
})();
