/**
 * dashboard-screen.js
 * Screen: Dashboard OEE 360° (data-screen="dashboard")
 */
const DashboardScreen = (() => {
  'use strict';

  const SCREEN = 'dashboard';
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];
  const root = () => qs(`.sec[data-screen="${SCREEN}"]`);

  function setPreset(name) {
    const sec = root();
    if (!sec) return;
    qsa('.dash-preset', sec).forEach((btn) => {
      const on = btn.dataset.dashPreset === name;
      btn.classList.toggle('is-active', on);
    });
  }

  function bindPresets() {
    const sec = root();
    if (!sec) return;

    sec.addEventListener('click', (e) => {
      const btn = e.target.closest('.dash-preset');
      if (!btn) return;
      const preset = btn.dataset.dashPreset;
      setPreset(preset);

      const today = new Date();
      const toISO = (d) => d.toISOString().slice(0, 10);
      let from = toISO(today);
      let to = toISO(today);

      if (preset === 'yesterday') {
        const y = new Date(today);
        y.setDate(y.getDate() - 1);
        from = to = toISO(y);
      } else if (preset === '7') {
        const s = new Date(today);
        s.setDate(s.getDate() - 6);
        from = toISO(s);
      } else if (preset === '30') {
        const s = new Date(today);
        s.setDate(s.getDate() - 29);
        from = toISO(s);
      } else if (preset === 'month') {
        from = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
      } else if (preset === 'custom') {
        // biarkan user isi manual
        document.dispatchEvent(new CustomEvent('dashboard:preset', { detail: { preset } }));
        return;
      }

      const fromEl = qs('#dashFrom', sec);
      const toEl = qs('#dashTo', sec);
      if (fromEl) fromEl.value = from;
      if (toEl) toEl.value = to;

      document.dispatchEvent(new CustomEvent('dashboard:preset', {
        detail: { preset, from, to }
      }));
    });
  }

  function bindActions() {
    const sec = root();
    if (!sec) return;

    const refresh = qs('#dashRefresh', sec);
    if (refresh) {
      refresh.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('dashboard:refresh'));
      });
    }

    const exportBtn = qs('#dashExport', sec);
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('dashboard:export'));
      });
    }

    const meeting = qs('#dashMeeting', sec);
    if (meeting) {
      meeting.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('dashboard:meeting'));
      });
    }

    const apply = qs('#dashApply, [data-dash-apply]', sec);
    if (apply) {
      apply.addEventListener('click', () => {
        const from = (qs('#dashFrom', sec) || {}).value;
        const to = (qs('#dashTo', sec) || {}).value;
        const line = (qs('#dashLine', sec) || {}).value;
        const shift = (qs('#dashShift', sec) || {}).value;
        document.dispatchEvent(new CustomEvent('dashboard:filter', {
          detail: { from, to, line, shift }
        }));
      });
    }
  }

  function setRecordCount(n) {
    const el = qs('.record-count', root());
    if (el) el.textContent = `✓ ${n} record tersedia`;
  }

  function init() {
    if (!root()) return;
    bindPresets();
    bindActions();
  }

  return { init, setPreset, setRecordCount, SCREEN };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => DashboardScreen.init());
} else {
  DashboardScreen.init();
}
