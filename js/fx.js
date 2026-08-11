/**
 * FX.JS — Particle Effects Engine
 * Canvas-based particle system untuk efek visual di background login:
 *   - 🌧️ Rain: hujan diagonal dengan streak
 *   - 🌨️ Snow: salju melayang dengan sway (Desember & cuaca salju)
 *   - 🎆 Fireworks: kembang api di tanggal spesial
 *   - ⚡ Lightning: flash saat badai (storm)
 *
 * Satu rAF loop untuk semua efek, otomatis berhenti saat tidak ada yang aktif.
 * Menghormati 'prefers-reduced-motion' (skip seluruhnya).
 */
const FX = (() => {
  'use strict';

  let canvas, ctx, dpr;
  let rafId = null;
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const active = { rain: false, snow: false, fw: false, storm: false };
  const particles = { rain: [], snow: [], fw: [] };
  let lastBurst = 0;
  let flashEl = null;
  let flashTimer = null;

  const W = () => canvas ? canvas.width : 0;
  const H = () => canvas ? canvas.height : 0;

  /**
   * Mount canvas ke host element (biasanya #loginOverlay).
   * Juga membuat overlay div untuk lightning flash.
   */
  function mount(hostId) {
    if (reduced) return;
    const host = document.getElementById(hostId);
    if (!host) return;

    canvas = document.createElement('canvas');
    canvas.id = 'fxCanvas';
    canvas.className = 'fx-canvas';
    host.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);

    flashEl = document.createElement('div');
    flashEl.id = 'fxFlash';
    flashEl.className = 'fx-flash';
    host.appendChild(flashEl);
  }

  function resize() {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    canvas.width  = Math.floor(r.width  * dpr);
    canvas.height = Math.floor(r.height * dpr);
  }

  // ====== RAIN ======
  function spawnRain(n = 1) {
    for (let i = 0; i < n; i++) {
      particles.rain.push({
        x: Math.random() * W(),
        y: -30 * dpr,
        len: (14 + Math.random() * 18) * dpr,
        vy:  (12 + Math.random() * 8)  * dpr,
        vx:  -2.2 * dpr
      });
    }
  }

  function drawRain() {
    const TARGET = 180;
    const need = TARGET - particles.rain.length;
    if (need > 0) spawnRain(need);
    ctx.strokeStyle = 'rgba(180, 215, 255, 0.55)';
    ctx.lineWidth = 1.2 * dpr;
    ctx.beginPath();
    for (let i = particles.rain.length - 1; i >= 0; i--) {
      const p = particles.rain[i];
      p.x += p.vx;
      p.y += p.vy;
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.vx * 1.5, p.y + p.len);
      if (p.y > H() + 20) particles.rain.splice(i, 1);
    }
    ctx.stroke();
  }

  // ====== SNOW ======
  function spawnSnow(n = 1) {
    for (let i = 0; i < n; i++) {
      particles.snow.push({
        x: Math.random() * W(),
        y: -10 * dpr,
        r:   (1.5 + Math.random() * 3.2) * dpr,
        vy:  (0.6 + Math.random() * 1.2) * dpr,
        vx:  (Math.random() - 0.5) * 0.6 * dpr,
        sway:    Math.random() * Math.PI * 2,
        swaySpd: 0.01 + Math.random() * 0.025,
        op:  0.55 + Math.random() * 0.4
      });
    }
  }

  function drawSnow() {
    const TARGET = 130;
    const need = TARGET - particles.snow.length;
    if (need > 0) spawnSnow(need);
    for (let i = particles.snow.length - 1; i >= 0; i--) {
      const p = particles.snow[i];
      p.sway += p.swaySpd;
      p.x += p.vx + Math.sin(p.sway) * 0.6 * dpr;
      p.y += p.vy;
      ctx.fillStyle = `rgba(255,255,255,${p.op})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      if (p.y > H() + 10) particles.snow.splice(i, 1);
    }
  }

  // ====== FIREWORKS ======
  const FW_COLORS = ['#ff5a5f','#ffd93d','#6bcb77','#4d96ff','#b26dff','#ff7ad9','#ffffff','#ffae42'];

  function launchBurst() {
    const cx = (W() * 0.15) + Math.random() * (W() * 0.7);
    const cy = (H() * 0.10) + Math.random() * (H() * 0.35);
    const color = FW_COLORS[Math.floor(Math.random() * FW_COLORS.length)];
    const n = 55 + Math.floor(Math.random() * 25);
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.25;
      const sp = (2.5 + Math.random() * 3.2) * dpr;
      particles.fw.push({
        x: cx, y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 1,
        decay: 0.008 + Math.random() * 0.012,
        color,
        size: (1.4 + Math.random() * 1.8) * dpr,
        g: 0.05 * dpr
      });
    }
  }

  function drawFireworks(now) {
    if (now - lastBurst > 1400) { lastBurst = now; launchBurst(); }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = particles.fw.length - 1; i >= 0; i--) {
      const p = particles.fw[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.g;
      p.vx *= 0.99;
      p.vy *= 0.99;
      p.life -= p.decay;
      if (p.life <= 0) { particles.fw.splice(i, 1); continue; }
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ====== LIGHTNING ======
  function scheduleFlash() {
    if (!active.storm) return;
    const delay = 4000 + Math.random() * 8000;
    flashTimer = setTimeout(() => {
      if (active.storm && flashEl) {
        flashEl.classList.add('flash-once');
        setTimeout(() => flashEl.classList.remove('flash-once'), 500);
      }
      scheduleFlash();
    }, delay);
  }

  // ====== LOOP ======
  function anyActive() { return active.rain || active.snow || active.fw; }

  function loop(t) {
    if (!anyActive()) { rafId = null; return; }
    ctx.clearRect(0, 0, W(), H());
    if (active.rain) drawRain();
    if (active.snow) drawSnow();
    if (active.fw)   drawFireworks(t);
    rafId = requestAnimationFrame(loop);
  }

  function startLoop() {
    if (rafId) return;
    if (!anyActive()) return;
    rafId = requestAnimationFrame(loop);
  }

  function stopAll() {
    active.rain = false; active.snow = false;
    active.fw = false;   active.storm = false;
    particles.rain.length = 0;
    particles.snow.length = 0;
    particles.fw.length   = 0;
    clearTimeout(flashTimer);
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (ctx) ctx.clearRect(0, 0, W(), H());
  }

  // ====== PUBLIC API ======
  function setRain(on) {
    if (active.rain === on) return;
    active.rain = on;
    if (!on) particles.rain.length = 0;
    else startLoop();
  }

  function setSnow(on) {
    if (active.snow === on) return;
    active.snow = on;
    if (!on) particles.snow.length = 0;
    else startLoop();
  }

  function setFireworks(on) {
    if (active.fw === on) return;
    active.fw = on;
    if (!on) { particles.fw.length = 0; lastBurst = 0; }
    else startLoop();
  }

  function setStorm(on) {
    if (active.storm === on) return;
    active.storm = on;
    if (on) {
      setRain(true);
      scheduleFlash();
    } else {
      clearTimeout(flashTimer);
    }
  }

  return { mount, setRain, setSnow, setFireworks, setStorm, stopAll };
})();
