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
 *
 * Dispatch event 'scenechange' saat nama scene berubah, agar modul lain
 * (misalnya weather.js) bisa merespon untuk efek visual (pelangi, dll).
 */
const Scene = (() => {
  'use strict';

  let manualMode = null;
  let lastName   = null;
  const MODES = ['auto', 'day', 'sunset', 'night', 'sunrise'];
  const SCENE_CLASSES = ['scene--night', 'scene--day', 'scene--sunrise', 'scene--sunset'];

  const sceneOf = (mins) => {
    for (const slot of CONFIG.SCENE_SCHEDULE) {
      if (mins >= slot.from && mins < slot.to) return slot.name;
    }
    return 'day';
  };

  /**
   * Posisi matahari di busur langit (05:30 → 18:30).
   * Bergerak dari timur (kiri) ke barat (kanan) dengan tinggi maksimum di tengah hari.
   * Puncak diatur cukup tinggi (y=110) agar tidak terhalang login card di tengah layar.
   */
  const sunPosition = (mins) => {
    // 05:30 (330) = terbit timur, 18:30 (1110) = terbenam barat
    const p = Math.max(0, Math.min(1, (mins - 330) / 780));
    const x = 100 + p * 1720;                     // kiri → kanan
    const y = 680 - Math.sin(p * Math.PI) * 570;  // puncak y=110 (tinggi di atas login card)
    return { x, y };
  };

  /**
   * Posisi bulan di busur langit (18:00 → 06:00 berikutnya).
   * Puncak di tengah malam pada posisi atas tengah layar.
   */
  const moonPosition = (mins) => {
    // Normalize: 18:00 (1080) → 06:00 berikutnya (360 + 1440)
    const normalized = mins >= 1080 ? mins - 1080 : mins + 360;
    const p = Math.max(0, Math.min(1, normalized / 720));
    const x = 100 + p * 1720;
    const y = 680 - Math.sin(p * Math.PI) * 570;
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

    // Hanya ganti class scene--*, pertahankan class lain (is-rain, has-rainbow)
    SCENE_CLASSES.forEach(c => wrap.classList.remove(c));
    wrap.classList.add('scene--' + name);
    wrap.classList.add('scene');

    const sun  = document.getElementById('sun');
    const moon = document.getElementById('moon');
    const sp = sunPosition(mins);
    const mp = moonPosition(mins);
    if (sun)  sun.setAttribute('transform',  `translate(${sp.x} ${sp.y})`);
    if (moon) moon.setAttribute('transform', `translate(${mp.x} ${mp.y})`);

    const btn = document.getElementById('sceneToggle');
    if (btn) btn.textContent = labels[manualMode || 'auto'];

    // Dispatch event saat scene berubah, supaya modul lain (weather) tahu
    if (name !== lastName) {
      lastName = name;
      window.dispatchEvent(new CustomEvent('scenechange', { detail: { name } }));
    }
  };

  /**
   * Siklus mode preview: auto → day → sunset → night → sunrise → auto.
   */
  const cycle = () => {
    const idx = MODES.indexOf(manualMode || 'auto');
    const next = MODES[(idx + 1) % MODES.length];
    manualMode = next === 'auto' ? null : next;
    apply();
  };

  /**
   * Nama scene saat ini (auto atau manual override).
   */
  const current = () => {
    if (lastName) return lastName;
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    return manualMode || sceneOf(mins);
  };

  const init = () => {
    apply();
    // Update setiap 30 detik agar posisi matahari/bulan terlihat bergerak pelan
    setInterval(apply, 30000);
    const btn = document.getElementById('sceneToggle');
    if (btn) btn.addEventListener('click', cycle);
  };

  return { init, cycle, apply, current };
})();

document.addEventListener('DOMContentLoaded', Scene.init);
