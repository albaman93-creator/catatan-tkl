/**
 * SCENE.JS
 * Mengatur tema background login sesuai waktu hari:
 *   - Fajar (04–07)   : matahari rendah di timur (kiri)
 *   - Siang (07–16)   : matahari tinggi
 *   - Senja (16–18)   : matahari rendah di barat (kanan)
 *   - Malam (18–04)   : bulan + bintang berkelap-kelip
 *
 * Matahari/bulan bergerak sepanjang busur langit mengikuti waktu.
 * Tombol preview di pojok kanan bawah memungkinkan cycle manual untuk testing.
 */
const Scene = (() => {
  'use strict';

  // null = otomatis ikut waktu sistem; string = manual override untuk preview
  let manualMode = null;
  const MODES = ['auto', 'day', 'sunset', 'night', 'sunrise'];

  /**
   * Tentukan scene dari menit (0–1439).
   * Jadwal bisa diubah di CONFIG.SCENE_SCHEDULE (js/config.js).
   */
  const sceneOf = (mins) => {
    for (const slot of CONFIG.SCENE_SCHEDULE) {
      if (mins >= slot.from && mins < slot.to) return slot.name;
    }
    return 'day';
  };

  /**
   * Posisi matahari di busur langit (06:00 → 18:00).
   * Bergerak dari timur (kiri) ke barat (kanan) dengan tinggi maksimum di tengah hari.
   */
  const sunPosition = (mins) => {
    const p = Math.max(0, Math.min(1, (mins - 360) / 720));
    const x = 150 + p * 1620;
    const y = 780 - Math.sin(p * Math.PI) * 540;
    return { x, y };
  };

  /**
   * Posisi bulan di busur langit (18:00 → 06:00).
   * Sama seperti matahari, lintas malam.
   */
  const moonPosition = (mins) => {
    let m = mins >= 1080 ? mins - 1080 : mins + 360;
    const p = Math.max(0, Math.min(1, m / 720));
    const x = 150 + p * 1620;
    const y = 780 - Math.sin(p * Math.PI) * 540;
    return { x, y };
  };

  const labels = {
    auto:    '🕐 auto',
    sunrise: '🌅 fajar',
    day:     '☀️ siang',
    sunset:  '🌇 senja',
    night:   '🌙 malam',
  };

  const apply = () => {
    const wrap = document.getElementById('bgScene');
    if (!wrap) return;

    const now  = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const name = manualMode || sceneOf(mins);

    wrap.className = 'scene scene--' + name;

    const sun  = document.getElementById('sun');
    const moon = document.getElementById('moon');
    const sp = sunPosition(mins);
    const mp = moonPosition(mins);
    if (sun)  sun.setAttribute('transform',  `translate(${sp.x} ${sp.y})`);
    if (moon) moon.setAttribute('transform', `translate(${mp.x} ${mp.y})`);

    const btn = document.getElementById('sceneToggle');
    if (btn) btn.textContent = labels[manualMode || 'auto'];
  };

  /**
   * Siklus mode preview: auto → day → sunset → night → sunrise → auto.
   * Mode manual tidak mempengaruhi auto-resume (akan tetap manual sampai diklik lagi).
   */
  const cycle = () => {
    const idx = MODES.indexOf(manualMode || 'auto');
    const next = MODES[(idx + 1) % MODES.length];
    manualMode = next === 'auto' ? null : next;
    apply();
  };

  const init = () => {
    apply();
    // Update setiap 30 detik agar posisi matahari/bulan terlihat bergerak pelan
    setInterval(apply, 30000);
    const btn = document.getElementById('sceneToggle');
    if (btn) btn.addEventListener('click', cycle);
  };

  return { init, cycle, apply };
})();

document.addEventListener('DOMContentLoaded', Scene.init);
