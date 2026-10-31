/**
 * PROD-WEEK.JS
 * Minggu produksi: Rabu → Selasa (cutoff setiap Rabu).
 * Nomor week 1–4 berulang relatif terhadap minggu yang memuat tanggal 1 bulan.
 * Warna: 1 orange · 2 kuning · 3 hijau · 4 coklat
 */
const ProdWeek = (() => {
  'use strict';

  const COLORS = {
    // Sesuai mockup referensi: W1 biru · W2 kuning · W3 hijau · W4 coklat
    1: { fg: '#ffffff', bg: '#3b82f6', name: 'blue',   label: 'Week 1' },
    2: { fg: '#1c1917', bg: '#eab308', name: 'yellow', label: 'Week 2' },
    3: { fg: '#ffffff', bg: '#22c55e', name: 'green',  label: 'Week 3' },
    4: { fg: '#ffffff', bg: '#78716c', name: 'brown',  label: 'Week 4' },
  };

  const parseYMD = (s) => {
    if (!s) return null;
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const toYMD = (d) => {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${da}`;
  };

  /** Awal minggu produksi: Rabu (00:00 lokal). */
  const weekStart = (d) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dow = x.getDay(); // 0=Min … 3=Rab
    const back = (dow - 3 + 7) % 7;
    x.setDate(x.getDate() - back);
    return x;
  };

  /**
   * Nomor week 1–4 dalam siklus bulan.
   * Index 0 = minggu yang memuat tanggal 1 bulan (atau Rabu sebelumnya).
   */
  const weekNum = (d) => {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return 1;
    const ws = weekStart(d);
    // Pakai bulan dari tanggal itu sendiri untuk penomoran
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const firstWs = weekStart(first);
    const idx = Math.round((ws.getTime() - firstWs.getTime()) / (7 * 86400000));
    return ((idx % 4) + 4) % 4 + 1;
  };

  const weekNumFromYMD = (ymd) => {
    const d = parseYMD(ymd);
    return d ? weekNum(d) : 1;
  };

  const colorOf = (n) => COLORS[n] || COLORS[1];

  const info = (ymdOrDate) => {
    const d = ymdOrDate instanceof Date ? ymdOrDate : parseYMD(ymdOrDate);
    if (!d) return { num: 1, ...COLORS[1], ymd: null, start: null, end: null };
    const num = weekNum(d);
    const start = weekStart(d);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { num, ...COLORS[num], ymd: toYMD(d), start, end };
  };

  // ---------- Custom calendar popup ----------
  let popup = null;
  let viewYear = 0;
  let viewMonth = 0; // 0-11
  let targetInput = null;
  let onPick = null;

  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const ensurePopup = () => {
    if (popup) return popup;
    popup = document.createElement('div');
    popup.id = 'prodWeekCal';
    popup.className = 'prod-week-cal';
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', 'Pilih tanggal');
    popup.hidden = true;
    document.body.appendChild(popup);

    document.addEventListener('click', (e) => {
      if (!popup || popup.hidden) return;
      // render() mengganti innerHTML → e.target (tombol ‹ ›) sudah lepas dari DOM,
      // sehingga popup.contains() salah mengira klik di luar. Pakai composedPath.
      const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
      if (path.includes(popup) || popup.contains(e.target)) return;
      if (e.target.closest('[data-prod-week-trigger], #sheetDateTrigger, #fDate')) return;
      close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
    });
    return popup;
  };

  const render = () => {
    const el = ensurePopup();
    const selected = targetInput ? parseYMD(targetInput.value) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const first = new Date(viewYear, viewMonth, 1);
    const startPad = first.getDay(); // 0=Sun
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const prevDays = new Date(viewYear, viewMonth, 0).getDate();

    let cells = '';
    // Leading (prev month)
    for (let i = 0; i < startPad; i++) {
      const day = prevDays - startPad + 1 + i;
      const d = new Date(viewYear, viewMonth - 1, day);
      const n = weekNum(d);
      const c = colorOf(n);
      cells += `<button type="button" class="pwc-day pwc-out week-${n}" data-ymd="${toYMD(d)}" style="--pw-bg:${c.bg};--pw-fg:${c.fg}" title="${c.label}">${day}</button>`;
    }
    // Current month
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(viewYear, viewMonth, day);
      const n = weekNum(d);
      const c = colorOf(n);
      const ymd = toYMD(d);
      const isSel = selected && toYMD(selected) === ymd;
      const isToday = toYMD(today) === ymd;
      cells += `<button type="button" class="pwc-day week-${n}${isSel ? ' is-selected' : ''}${isToday ? ' is-today' : ''}" data-ymd="${ymd}" style="--pw-bg:${c.bg};--pw-fg:${c.fg}" title="${c.label} · ${ymd}">${day}</button>`;
    }
    // Trailing
    const total = startPad + daysInMonth;
    const trail = (7 - (total % 7)) % 7;
    for (let i = 1; i <= trail; i++) {
      const d = new Date(viewYear, viewMonth + 1, i);
      const n = weekNum(d);
      const c = colorOf(n);
      cells += `<button type="button" class="pwc-day pwc-out week-${n}" data-ymd="${toYMD(d)}" style="--pw-bg:${c.bg};--pw-fg:${c.fg}" title="${c.label}">${i}</button>`;
    }

    el.innerHTML = `
      <div class="pwc-head">
        <button type="button" class="pwc-nav" data-nav="-1" aria-label="Bulan sebelumnya">‹</button>
        <div class="pwc-title">${MONTHS[viewMonth]} ${viewYear}</div>
        <button type="button" class="pwc-nav" data-nav="1" aria-label="Bulan berikutnya">›</button>
      </div>
      <div class="pwc-legend">
        <span class="pwc-leg week-1">W1</span>
        <span class="pwc-leg week-2">W2</span>
        <span class="pwc-leg week-3">W3</span>
        <span class="pwc-leg week-4">W4</span>
        <span class="pwc-leg-note">cutoff Rabu</span>
      </div>
      <div class="pwc-dow">
        <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
      </div>
      <div class="pwc-grid">${cells}</div>
      <div class="pwc-foot">
        <button type="button" class="pwc-clear">Clear</button>
        <button type="button" class="pwc-today">Today</button>
      </div>`;

    el.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const dir = Number(btn.getAttribute('data-nav'));
        viewMonth += dir;
        if (viewMonth < 0) { viewMonth = 11; viewYear--; }
        if (viewMonth > 11) { viewMonth = 0; viewYear++; }
        render();
      });
    });
    el.querySelectorAll('.pwc-day').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ymd = btn.getAttribute('data-ymd');
        pick(ymd);
      });
    });
    el.querySelector('.pwc-clear')?.addEventListener('click', () => pick(''));
    el.querySelector('.pwc-today')?.addEventListener('click', () => pick(toYMD(new Date())));
  };

  const pick = (ymd) => {
    if (targetInput) {
      targetInput.value = ymd || '';
      targetInput.dispatchEvent(new Event('input', { bubbles: true }));
      targetInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (typeof onPick === 'function') onPick(ymd);
    close();
  };

  const positionNear = (anchor) => {
    const el = ensurePopup();
    el.hidden = false;
    const r = anchor.getBoundingClientRect();
    const pw = el.offsetWidth || 280;
    const ph = el.offsetHeight || 340;
    let left = r.left;
    let top = r.bottom + 6;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    if (left < 8) left = 8;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
    el.style.left = left + 'px';
    el.style.top = top + 'px';
  };

  const open = (input, anchor, cb) => {
    targetInput = input;
    onPick = cb || null;
    const d = parseYMD(input?.value) || new Date();
    viewYear = d.getFullYear();
    viewMonth = d.getMonth();
    render();
    positionNear(anchor || input);
  };

  const close = () => {
    if (popup) popup.hidden = true;
    targetInput = null;
    onPick = null;
  };

  /** Badge "Week N" di toolbar sheet */
  const updateSheetBadge = () => {
    const input = document.getElementById('fDate');
    let badge = document.getElementById('sheetWeekBadge');
    if (!badge) {
      const row = document.querySelector('.compact-main-row') || document.getElementById('sheetUnifiedControl');
      if (!row) return;
      badge = document.createElement('span');
      badge.id = 'sheetWeekBadge';
      badge.className = 'sheet-week-badge';
      badge.title = 'Minggu produksi (cutoff Rabu)';
      // Sisipkan setelah kontrol tanggal
      const dateCtrl = document.querySelector('.compact-date-control');
      if (dateCtrl && dateCtrl.parentNode) {
        dateCtrl.parentNode.insertBefore(badge, dateCtrl.nextSibling);
      } else {
        row.appendChild(badge);
      }
    }
    const ymd = input?.value || '';
    if (!ymd) {
      badge.hidden = true;
      return;
    }
    const inf = info(ymd);
    badge.hidden = false;
    badge.textContent = inf.label;
    badge.dataset.week = String(inf.num);
    badge.style.color = inf.fg;
    badge.style.background = inf.bg;
    badge.style.borderColor = inf.fg;
  };

  const bind = () => {
    const fDate = document.getElementById('fDate');
    const trigger = document.getElementById('sheetDateTrigger');

    if (fDate) {
      // Klik native date: cegah default picker, pakai custom
      fDate.addEventListener('click', (e) => {
        e.preventDefault();
        open(fDate, fDate);
      });
      fDate.addEventListener('mousedown', (e) => {
        // Cegah showPicker native di beberapa browser
        if (e.detail) e.preventDefault();
      });
      fDate.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open(fDate, fDate);
        }
      });
      fDate.addEventListener('change', updateSheetBadge);
      fDate.addEventListener('input', updateSheetBadge);
    }

    if (trigger) {
      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (fDate) open(fDate, trigger, () => {
          if (typeof UI !== 'undefined' && UI.updateUnifiedControl) UI.updateUnifiedControl();
          updateSheetBadge();
        });
      });
    }

    updateSheetBadge();
  };

  const init = () => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bind);
    } else {
      bind();
    }
  };

  return {
    COLORS, weekStart, weekNum, weekNumFromYMD, colorOf, info,
    parseYMD, toYMD, open, close, updateSheetBadge, init,
  };
})();

if (typeof window !== 'undefined') {
  window.ProdWeek = ProdWeek;
  ProdWeek.init();
}
