/**
 * NATURE.JS
 * Modul ADDITIVE untuk elemen pemandangan tambahan di background login:
 * sungai, kincir angin, gubuk, bunga matahari, rumput liar, kupu-kupu,
 * kunang-kunang, dan daun musim gugur.
 *
 * PENTING: modul ini TIDAK mengubah scene.js / weather.js / fx.js sama sekali.
 * Ia hanya MEMBACA state yang sudah ada (posisi #sun dari scene.js, event
 * 'scenechange' yang sudah di-dispatch scene.js) lalu menambahkan/melepas
 * class CSS pada elemen-elemen barunya sendiri (#sunflowers, #butterflies,
 * #autumnLeaves). Elemen lama (hills, trees, clouds, dst) tidak disentuh.
 *
 * Sebagian efek (kincir berputar, kunang-kunang malam, kilau sungai) murni
 * CSS — lihat style.css bagian "NATURE EXTRAS" — supaya tetap ringan.
 */
const Nature = (() => {
  'use strict';

  const REFRESH_MS = 30000; // selaras dengan interval update Scene (30 detik)
  let manualButterflies = null; // null = auto (ikut jam), true/false = override manual (tombol preview)

  /**
   * Baca posisi X matahari saat ini dari elemen #sun (di-set oleh scene.js).
   * Dikembalikan sebagai p = 0 (timur/pagi) .. 1 (barat/sore).
   * Additive: hanya membaca atribut, tidak memanggil/mengubah scene.js.
   */
  const sunProgress = () => {
    const sunEl = document.getElementById('sun');
    if (!sunEl) return 0.5;
    const tf = sunEl.getAttribute('transform') || '';
    const m = tf.match(/translate\(\s*(-?[\d.]+)[ ,]\s*(-?[\d.]+)\s*\)/);
    if (!m) return 0.5;
    const sunX = parseFloat(m[1]);
    // Sesuai rumus scene.js: x = 100 + p*1720 → invers untuk dapatkan p
    return Math.max(0, Math.min(1, (sunX - 100) / 1720));
  };

  /**
   * Bunga matahari mengikuti arah matahari: timur (pagi, condong kiri)
   * → barat (sore, condong kanan). Rotasi diterapkan pada grup kepala bunga
   * (#sf1Head, #sf2Head) yang originnya sudah tepat di pucuk batang.
   */
  const updateSunflowers = () => {
    const p = sunProgress();
    const angle = -38 + p * 76; // -38° (timur) .. +38° (barat)
    ['sf1Head', 'sf2Head'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.style.transform = `rotate(${angle.toFixed(1)}deg)`;
    });
  };

  /**
   * Deteksi "pagi" untuk kemunculan kupu-kupu.
   * Tidak ada state 'pagi' eksplisit di scene.js (hanya sunrise/day/sunset/night),
   * jadi sesuai ketentuan: fallback ke jam lokal 06:00–10:00.
   */
  const isMorningNow = () => {
    const h = new Date().getHours();
    return h >= 6 && h < 10;
  };

  const updateButterflies = () => {
    const wrap = document.getElementById('butterflies');
    if (!wrap) return;
    const show = manualButterflies === null ? isMorningNow() : manualButterflies;
    wrap.classList.toggle('is-morning', show);
  };

  /**
   * Tombol preview "🦋" di pojok kanan bawah: paksa tampil / paksa sembunyi /
   * kembali ke otomatis — supaya bisa dicek tanpa menunggu jam 06.00–10.00.
   * Murni untuk keperluan pratinjau manual, tidak mengubah logika jam asli.
   */
  const cycleButterflyPreview = () => {
    // null(auto) → true(paksa tampil) → false(paksa sembunyi) → null(auto) ...
    manualButterflies = manualButterflies === null ? true : (manualButterflies === true ? false : null);
    updateButterflies();
    const btn = document.getElementById('natureToggle');
    if (btn) {
      btn.textContent = manualButterflies === null ? '🦋 auto' : (manualButterflies ? '🦋 tampil' : '🦋 sembunyi');
    }
  };

  /**
   * Deteksi bulan musim gugur dari CONFIG.AUTUMN_MONTHS (pola sama seperti
   * CONFIG.SNOW_MONTHS yang sudah dipakai weather/fx untuk efek salju).
   */
  const isAutumnNow = () => {
    const month = new Date().getMonth() + 1; // 1..12
    const list = (typeof CONFIG !== 'undefined' && CONFIG.AUTUMN_MONTHS) || [];
    return list.includes(month);
  };

  const updateAutumnLeaves = () => {
    const wrap = document.getElementById('autumnLeaves');
    if (!wrap) return;
    wrap.classList.toggle('is-autumn', isAutumnNow());
  };

  const refreshAll = () => {
    updateSunflowers();
    updateButterflies();
    updateAutumnLeaves();
  };

  const init = () => {
    const wrap = document.getElementById('natureExtra');
    if (!wrap) return; // guard: elemen belum ada di halaman ini

    refreshAll();
    setInterval(refreshAll, REFRESH_MS);

    // Ikut update instan saat scene berganti (event ini sudah di-dispatch
    // oleh scene.js sebelumnya — di sini kita hanya MENDENGARKAN, additive).
    window.addEventListener('scenechange', refreshAll);

    const toggleBtn = document.getElementById('natureToggle');
    if (toggleBtn) toggleBtn.addEventListener('click', cycleButterflyPreview);
  };

  return { init, refreshAll };
})();

document.addEventListener('DOMContentLoaded', Nature.init);
