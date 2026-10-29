/**
 * WEEKLY-THEME.JS
 * Tema Weekly Meeting: 'light' | 'dark' | 'pink'.
 * - Disimpan di localStorage ('fima_weekly_theme').
 * - Default awal: mengikuti tema aplikasi (gelap -> gelap, selain itu terang).
 * - Atribut dipasang di <html data-wd-theme="..."> agar menu/portal ikut berubah.
 */
const WeeklyTheme = (() => {
  'use strict';
  const KEY = 'fima_weekly_theme';
  const MODES = ['light', 'dark', 'pink'];

  const normalize = (m) => (MODES.includes(m) ? m : 'light');

  const get = () => {
    try {
      const s = localStorage.getItem(KEY);
      if (MODES.includes(s)) return s;
    } catch (e) { /* storage diblokir */ }
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  };

  const syncButtons = (mode) => {
    document.querySelectorAll('#weeklyThemeSwitch [data-wd-mode]').forEach((btn) => {
      const on = btn.dataset.wdMode === mode;
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
      btn.tabIndex = on ? 0 : -1;
    });
  };

  const apply = (mode) => {
    const m = normalize(mode);
    document.documentElement.setAttribute('data-wd-theme', m);
    syncButtons(m);
    return m;
  };

  const set = (mode) => {
    const m = normalize(mode);
    try { localStorage.setItem(KEY, m); } catch (e) {}
    return apply(m);
  };

  const toggle = () => set(MODES[(MODES.indexOf(get()) + 1) % MODES.length]);

  apply(get());

  const group = document.getElementById('weeklyThemeSwitch');
  if (group) {
    group.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-wd-mode]');
      if (btn) set(btn.dataset.wdMode);
    });
    // Navigasi panah (pola radiogroup)
    group.addEventListener('keydown', (e) => {
      if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
      e.preventDefault();
      const i = MODES.indexOf(get());
      const next = MODES[(i + (e.key === 'ArrowRight' ? 1 : MODES.length - 1)) % MODES.length];
      set(next);
      group.querySelector(`[data-wd-mode="${next}"]`)?.focus();
    });
  }

  return { get, set, toggle };
})();
