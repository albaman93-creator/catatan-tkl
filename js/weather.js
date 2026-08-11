/**
 * WEATHER.JS — Weather integration & effects coordinator
 *
 * 1. Fetch cuaca dari Open-Meteo (gratis, tanpa API key) setiap 30 menit.
 * 2. Klasifikasikan: clear / rain / snow / storm.
 * 3. Aktifkan efek visual sesuai kondisi:
 *    - hujan → hujan + dim background
 *    - salju API → salju
 *    - Desember → salju dekoratif (di Indonesia pun bisa!)
 *    - thunderstorm → hujan + kilat
 *    - 1 Jan / 17 Ags / 31 Des → kembang api
 *    - hujan + matahari (sunrise/siang) → pelangi otomatis
 * 4. Dengar event 'scenechange' dari Scene module agar pelangi responsif.
 */
const Weather = (() => {
  'use strict';

  const LS_KEY  = 'tkl_weather_cache_v1';
  const RAIN_KEY = 'tkl_last_rain';
  let lastKind = 'clear';
  let currentScene = 'day';

  // ====== API ======
  async function fetchFromApi() {
    const { lat, lon } = CONFIG.LOCATION;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code,precipitation&timezone=auto`;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    return {
      code:   j.current?.weather_code ?? 0,
      precip: j.current?.precipitation ?? 0,
      at: Date.now()
    };
  }

  function getCached() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      const age = Date.now() - (obj.at || 0);
      const ttl = CONFIG.WEATHER_REFRESH_MIN * 60 * 1000;
      if (age > ttl) return null;
      return obj;
    } catch { return null; }
  }

  function setCache(obj) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(obj)); } catch {}
  }

  // ====== KLASIFIKASI (WMO weather codes) ======
  function classify(code) {
    if ([95, 96, 99].includes(code)) return 'storm';
    if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return 'rain';
    if ([71,73,75,77,85,86].includes(code)) return 'snow';
    return 'clear';
  }

  // ====== KONDISI KALENDER ======
  function isSpecialDay() {
    const d = new Date();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return CONFIG.SPECIAL_DATES.some(s => s.month === m && s.day === day);
  }

  function isSnowMonth() {
    const m = new Date().getMonth() + 1;
    return CONFIG.SNOW_MONTHS.includes(m);
  }

  // ====== STATE PERSISTENCE ======
  function markRainNow() {
    try { localStorage.setItem(RAIN_KEY, String(Date.now())); } catch {}
  }

  function hasRecentRain() {
    try {
      const ts = parseInt(localStorage.getItem(RAIN_KEY) || '0', 10);
      if (!ts) return false;
      const age = Date.now() - ts;
      return age < CONFIG.RAINBOW_RECENT_MIN * 60 * 1000;
    } catch { return false; }
  }

  // ====== UI HELPERS ======
  function updateChip(text) {
    const el = document.getElementById('wxChip');
    if (!el) return;
    if (!text) { el.textContent = ''; el.classList.remove('show'); return; }
    el.textContent = text;
    el.classList.add('show');
  }

  function applyRainbow() {
    const wrap = document.getElementById('bgScene');
    if (!wrap) return;
    // Pelangi muncul kalau: (sedang hujan ATAU baru-baru ini hujan) DAN scene = fajar/siang
    const rainy = lastKind === 'rain' || lastKind === 'storm' || hasRecentRain();
    const sunny = currentScene === 'sunrise' || currentScene === 'day';
    wrap.classList.toggle('has-rainbow', rainy && sunny);
  }

  function applyRainDim(on) {
    const wrap = document.getElementById('bgScene');
    if (wrap) wrap.classList.toggle('is-rain', on);
  }

  // ====== KOORDINASI EFEK ======
  function applyEffects(kind, sceneName) {
    lastKind = kind;
    currentScene = sceneName;

    if (kind === 'rain' || kind === 'storm') markRainNow();

    const storm   = kind === 'storm';
    const rain    = kind === 'rain';
    const snowApi = kind === 'snow';
    const decSnow = isSnowMonth();

    // Storm = hujan + kilat
    FX.setStorm(storm);
    // Saat salju, tidak hujan (kecuali storm)
    FX.setRain((rain || storm) && !decSnow);
    // Salju dari API atau bulan Desember (dekoratif)
    FX.setSnow((snowApi || decSnow) && !rain && !storm);
    // Fireworks di tanggal spesial
    FX.setFireworks(isSpecialDay());

    applyRainDim(rain || storm);
    applyRainbow();

    const labels = {
      clear: '',
      rain:  `🌧 hujan · ${CONFIG.LOCATION.label}`,
      storm: `⛈ badai · ${CONFIG.LOCATION.label}`,
      snow:  `❄ salju · ${CONFIG.LOCATION.label}`
    };
    updateChip(labels[kind] || '');
  }

  // ====== REFRESH ======
  async function refresh() {
    let data = getCached();
    if (!data) {
      try {
        data = await fetchFromApi();
        setCache(data);
      } catch (e) {
        console.warn('[Weather] fetch gagal:', e);
      }
    }
    const sceneName = (typeof Scene !== 'undefined' && Scene.current)
      ? Scene.current()
      : 'day';
    const kind = data ? classify(data.code) : 'clear';
    applyEffects(kind, sceneName);
  }

  // ====== LISTENER: Scene change ======
  function onSceneChange(e) {
    const sceneName = e.detail && e.detail.name;
    if (!sceneName) return;
    currentScene = sceneName;
    applyRainbow();
  }

  // ====== INIT ======
  function init() {
    FX.mount('loginOverlay');
    window.addEventListener('scenechange', onSceneChange);
    refresh();
    setInterval(refresh, CONFIG.WEATHER_REFRESH_MIN * 60 * 1000);
  }

  return { init, refresh };
})();

document.addEventListener('DOMContentLoaded', Weather.init);
