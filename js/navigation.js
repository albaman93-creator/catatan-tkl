/**
 * NAVIGATION.JS
 * Menangani navigasi keyboard antar input (Tab/Enter/Arrow keys),
 * visual highlight kolom aktif, dan column visibility toggle.
 */
const Navigation = (() => {
  'use strict';

  // ====== TAB ORDER ======
  /**
   * Urutkan semua input yang navigable sesuai mode (vertikal/horizontal).
   */
  const navCells = () => {
    const list = [];
    const rs = Rows.rows();

    if (State.navMode === 'v') {
      CONFIG.NAV_FIELDS.forEach((f, ci) => {
        rs.forEach((r, ri) => {
          const el = r.querySelector(`[data-f="${f}"]`);
          if (el && !el.closest('td').classList.contains('col-hide')) {
            list.push({ el, f, ci, ri });
          }
        });
      });
    } else {
      rs.forEach((r, ri) => {
        CONFIG.NAV_FIELDS.forEach((f, ci) => {
          const el = r.querySelector(`[data-f="${f}"]`);
          if (el && !el.closest('td').classList.contains('col-hide')) {
            list.push({ el, f, ci, ri });
          }
        });
      });
    }

    list.push({ el: State.el.btnSave, f: 'save', ci: 100, ri: -1, param: 'SIMPAN DATA' });
    return list;
  };

  const applyTabOrder = () => {
    const cells = navCells();
    cells.forEach((c, i) => {
      if (c.el && ['INPUT','TEXTAREA','SELECT'].includes(c.el.tagName)) {
        c.el.tabIndex = i + 1;
      }
    });
  };

  // ====== VISUAL FEEDBACK ======
  const flash = (el) => {
    if (!el.classList || !el.classList.contains('in')) return;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  };

  const updatePos = (c) => {
    const label = c.ri >= 0
      ? `BARIS ${c.ri + 1} · ${CONFIG.FIELD_LABELS[c.f]}`
      : (c.param || '');
    State.el.pos.innerHTML = '<span class="pos-dot"></span>' + label;
  };

  const hlColumn = (c) => {
    const ths = document.querySelectorAll('.log th');
    ths.forEach(th => th.classList.remove('on'));
    if (c.ri >= 0) {
      const td = c.el.closest('td');
      const tr = td && td.parentElement;
      if (tr) {
        const i = Array.prototype.indexOf.call(tr.children, td);
        if (ths[i]) ths[i].classList.add('on');
      }
    }
  };

  const focusCell = (c) => {
    c.el.focus();
    if (c.el.select) c.el.select();
    flash(c.el);
    updatePos(c);
    hlColumn(c);
  };

  // ====== COLUMN VISIBILITY ======
  const syncColumnVisibility = () => {
    document.querySelectorAll('.col-toggle-bar input[type="checkbox"]').forEach(chk => {
      const className = chk.getAttribute('data-col');
      const isChecked = chk.checked;
      document.querySelectorAll('.' + className).forEach(el => {
        el.classList.toggle('col-hide', !isChecked);
      });
    });
    applyTabOrder();
  };

  const bindColumnToggles = () => {
    document.querySelectorAll('.col-toggle-bar input[type="checkbox"]').forEach(chk => {
      chk.addEventListener('change', syncColumnVisibility);
    });
  };

  // ====== KEYBOARD HANDLER ======
  const bindKeyboard = () => {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (!['INPUT','TEXTAREA','SELECT'].includes(t.tagName) || !t.hasAttribute('data-nav')) return;

      const cells = navCells();
      const idx = cells.findIndex(c => c.el === t);
      if (idx < 0) return;

      const cur = cells[idx];
      const last = cells.length - 1;

      // Tab / Shift+Tab
      if (e.key === 'Tab') {
        e.preventDefault();
        const n = e.shiftKey ? idx - 1 : idx + 1;
        if (n >= 0 && n <= last) focusCell(cells[n]);
        return;
      }

      // Enter
      if (e.key === 'Enter' && t.tagName === 'INPUT') {
        e.preventDefault();
        // Auto-add baris baru kalau enter di defect pada baris terakhir yang terisi
        if (cur.f === 'defect' && cur.ri === Rows.rows().length - 1 && t.value.trim() !== '') {
          const tr = Rows.makeRow();
          Rows.updateRowNumbers();
          Calculation.recalc();
          const nc = navCells();
          const kodeCell = nc.find(c => c.f === 'kode' && c.ri === Rows.rows().length - 1);
          if (kodeCell) focusCell(kodeCell);
          tr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          return;
        }
        if (idx < last) focusCell(cells[idx + 1]);
        return;
      }

      // Arrow keys
      if (e.key === 'ArrowDown' && ['INPUT','SELECT'].includes(t.tagName)) {
        e.preventDefault();
        const dn = cells.find(c => c.ci === cur.ci && c.ri === cur.ri + 1);
        focusCell(dn || (idx < last ? cells[idx + 1] : cur));
        return;
      }
      if (e.key === 'ArrowUp' && ['INPUT','SELECT'].includes(t.tagName)) {
        e.preventDefault();
        const up = cells.find(c => c.ci === cur.ci && c.ri === cur.ri - 1);
        focusCell(up || (idx > 0 ? cells[idx - 1] : cur));
        return;
      }

      // Backspace pada input kosong → mundur
      if (e.key === 'Backspace' && t.value === '' && t.tagName === 'INPUT') {
        e.preventDefault();
        if (idx > 0) focusCell(cells[idx - 1]);
        return;
      }

      // ArrowLeft pada awal cursor → pindah kolom kiri
      if (e.key === 'ArrowLeft' && t.selectionStart === 0 && t.selectionEnd === 0) {
        const pl = cells.find(c => c.ci === cur.ci - 1 && c.ri === cur.ri);
        if (pl) { e.preventDefault(); focusCell(pl); }
        return;
      }

      // ArrowRight pada akhir cursor → pindah kolom kanan
      if (e.key === 'ArrowRight' && t.selectionStart === t.value.length && t.selectionEnd === t.value.length) {
        const pr = cells.find(c => c.ci === cur.ci + 1 && c.ri === cur.ri);
        if (pr) { e.preventDefault(); focusCell(pr); }
      }
    });
  };

  // ====== FOCUS HIGHLIGHT ======
  const bindFocusin = () => {
    document.addEventListener('focusin', (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement) || !t.hasAttribute('data-nav')) return;
      const cells = navCells();
      const match = cells.find(c => c.el === t);
      if (match) { updatePos(match); hlColumn(match); }
    });
  };

  return {
    navCells, applyTabOrder,
    flash, updatePos, hlColumn, focusCell,
    syncColumnVisibility, bindColumnToggles,
    bindKeyboard, bindFocusin,
  };
})();
