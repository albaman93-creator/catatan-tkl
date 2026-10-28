/**
 * WEEKLY-THEME.JS
 * Tema Gelap / Terang khusus Weekly Meeting.
 * - Disimpan di localStorage ('fima_weekly_theme').
 * - Default awal: mengikuti tema aplikasi (gelap -> gelap, selain itu terang).
 * - Atribut dipasang di <html data-wd-theme="..."> agar menu/portal ikut berubah.
 */
const WeeklyTheme = (() => {
  'use strict';
  const KEY = 'fima_weekly_theme';

  const normalize = (m) => (m === 'dark' ? 'dark' : 'light');

  const get = () => {
    try {
      const s = localStorage.getItem(KEY);
      if (s === 'dark' || s === 'light') return s;
    } catch (e) { /* storage diblokir */ }
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  };

  const syncSwitch = (mode) => {
    const sw = document.getElementById('weeklyThemeSwitch');
    if (!sw) return;
    sw.setAttribute('aria-checked', mode === 'dark' ? 'true' : 'false');
  };

  const apply = (mode) => {
    const m = normalize(mode);
    document.documentElement.setAttribute('data-wd-theme', m);
    syncSwitch(m);
    return m;
  };

  const set = (mode) => {
    const m = normalize(mode);
    try { localStorage.setItem(KEY, m); } catch (e) {}
    return apply(m);
  };

  const toggle = () => set(get() === 'dark' ? 'light' : 'dark');

  apply(get());
  document.getElementById('weeklyThemeSwitch')?.addEventListener('click', toggle);

  return { get, set, toggle };
})();
