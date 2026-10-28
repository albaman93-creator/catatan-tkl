/**
 * COMPACT-CONTROLS.JS
 * Header Sheet khusus layar sempit: Tanggal | Tahapan | Line | Shift | OPR | Produk.
 * Panel OPR dan Produk dibuka hanya saat diperlukan lalu dapat ditutup kembali.
 */
(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const closeAll = (except) => {
    $$('.compact-popover.is-open').forEach(p => {
      if (p !== except) p.classList.remove('is-open');
    });
    $$('.compact-trigger[aria-expanded="true"]').forEach(b => {
      const panelId = b.getAttribute('aria-controls');
      const panel = panelId ? document.getElementById(panelId) : null;
      if (!panel || panel !== except) b.setAttribute('aria-expanded', 'false');
    });
  };

  const positionPanel = (button, panel) => {
    if (!panel) return;

    // Portal-kan dropdown ke <body>. Dengan cara ini dropdown tidak lagi
    // menjadi anak dari card/sheet yang memiliki overflow, transform,
    // filter, atau stacking-context yang dapat memotong popup di HP.
    if (panel.parentElement !== document.body) {
      document.body.appendChild(panel);
    }

    const r = button.getBoundingClientRect();
    const vv = window.visualViewport;
    const viewportWidth = vv?.width || window.innerWidth;
    const viewportHeight = vv?.height || window.innerHeight;
    const viewportLeft = vv?.offsetLeft || 0;
    const viewportTop = vv?.offsetTop || 0;
    const edge = 8;
    const gap = 6;

    // Ukuran panel setelah berada di body.
    panel.style.position = 'fixed';
    panel.style.left = '0px';
    panel.style.top = '0px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.maxWidth = `calc(100vw - ${edge * 2}px)`;
    panel.style.maxHeight = `calc(100vh - ${edge * 2}px)`;
    panel.style.overflowY = 'auto';
    panel.style.zIndex = '2147483647';

    const panelWidth = Math.min(panel.offsetWidth || 300, viewportWidth - edge * 2);
    const panelHeight = Math.min(panel.offsetHeight || 160, viewportHeight - edge * 2);

    let left = r.left;
    left = Math.max(viewportLeft + edge, Math.min(left, viewportLeft + viewportWidth - panelWidth - edge));

    const spaceBelow = viewportTop + viewportHeight - (r.bottom + gap);
    const spaceAbove = r.top - gap - viewportTop;

    // Utamakan bawah. Jika tidak cukup, pindah ke atas. Jika dua-duanya
    // tidak cukup (misalnya panel Produk panjang), tetap tampil penuh
    // dengan scroll di dalam panel.
    let top;
    if (spaceBelow >= panelHeight || spaceBelow >= spaceAbove) {
      top = r.bottom + gap;
      if (top + panelHeight > viewportTop + viewportHeight - edge) {
        top = viewportTop + viewportHeight - panelHeight - edge;
      }
    } else {
      top = r.top - gap - panelHeight;
      if (top < viewportTop + edge) top = viewportTop + edge;
    }

    top = Math.max(viewportTop + edge, Math.min(top, viewportTop + viewportHeight - panelHeight - edge));

    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
  };

  const togglePanel = (button, panel) => {
    if (!panel) return;
    const open = panel.classList.contains('is-open');
    closeAll(panel);
    panel.classList.toggle('is-open', !open);
    button.setAttribute('aria-expanded', open ? 'false' : 'true');
    if (!open) {
      positionPanel(button, panel);
      const first = panel.querySelector('input, button:not(.compact-close)');
      if (first) setTimeout(() => first.focus(), 50);
    }
  };

  const setText = (id, text) => { const e = document.getElementById(id); if (e) e.textContent = text; };

  function syncSummary() {
    const stage = $('#fStage')?.value || 'filling';
    const stageBtn = $(`[data-sheet-stage="${CSS.escape(stage)}"]`);
    // Tahapan di luar Filling/Kemas (mis. Mixing/Steril/Visual) tidak lagi
    // punya tombol di header Log Sheet — tetap tampilkan labelnya dengan rapi.
    setText('compactStageValue', stageBtn?.textContent?.trim() || (stage.charAt(0).toUpperCase() + stage.slice(1)));

    const line = $('#fLine')?.value || '1';
    setText('compactLineValue', 'Line ' + line);

    const shift = Number(typeof State !== 'undefined' ? State.evalShift : 0) + 1;
    setText('compactShiftValue', 'Shift ' + shift);

    const ops = $$('[data-sheet-op]').map(e => e.value.trim()).filter(Boolean);
    setText('compactOpValue', ops.length ? `OPR ${ops.length}/6` : 'OPR');

    const products = [1,2,3].map(i => $('#prodName' + i)?.value.trim()).filter(Boolean);
    setText('compactProductValue', products.length ? (products.length === 1 ? products[0] : `Produk ${products.length}`) : 'Produk');

    const date = $('#fDate')?.value || '';
    setText('shiftNavDateLabel', date ? Utils.formatDateText(date) : 'Pilih tanggal');
    setText('shiftNavShiftLabel', `Shift ${shift}`);
    setText('shiftNavStageLabel', stageBtn?.textContent?.trim() || (stage.charAt(0).toUpperCase() + stage.slice(1)));
    $$('[data-nav-shift]').forEach(button => {
      const selected = Number(button.getAttribute('data-nav-shift')) === shift;
      button.classList.toggle('on', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    $$('[data-nav-stage]').forEach(button => {
      const selected = button.getAttribute('data-nav-stage') === stage;
      button.classList.toggle('on', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function wireShiftNavigator() {
    const trigger = $('#shiftIndicator');
    const panel = $('#shiftNavigatorPanel');
    if (!trigger || !panel) return;

    const showView = (view) => {
      panel.querySelectorAll('[data-shift-nav-view]').forEach(section => {
        section.hidden = section.getAttribute('data-shift-nav-view') !== view;
      });
      if (view !== 'menu') {
        positionPanel(trigger, panel);
        panel.querySelector(`[data-shift-nav-view="${view}"] button:not(.compact-close)`)?.focus();
      }
    };

    panel.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button || !panel.contains(button)) return;

      const action = button.getAttribute('data-shift-nav-action');
      if (action === 'shift' || action === 'stage') {
        showView(action);
        return;
      }

      if (button.classList.contains('shift-nav-back')) {
        showView('menu');
        panel.querySelector('[data-shift-nav-action="shift"]')?.focus();
        return;
      }

      if (action === 'date') {
        event.stopPropagation();
        const dateInput = $('#shiftNavigatorDate');
        const currentDate = $('#fDate')?.value || '';
        if (!dateInput || typeof ProdWeek === 'undefined' || !ProdWeek.open) {
          if (typeof UI !== 'undefined') UI.toast('Kalender tidak tersedia.', true, 'warn');
          return;
        }

        dateInput.value = currentDate;
        closeAll(null);
        ProdWeek.open(dateInput, trigger, (date) => {
          if (!date || typeof UI === 'undefined' || !UI.openRecord) return;
          UI.openRecord({
            date,
            shift: State.evalShift + 1,
            line: $('#fLine')?.value || '1',
            stage: $('#fStage')?.value || 'filling',
            stayOnScreen: true,
          });
        });
        return;
      }

      const shift = button.getAttribute('data-nav-shift');
      const stage = button.getAttribute('data-nav-stage');
      if (shift === null && stage === null) return;

      const date = $('#fDate')?.value || '';
      if (!date) {
        if (typeof UI !== 'undefined') UI.toast('Pilih tanggal terlebih dahulu.', true, 'warn');
        return;
      }
      if (typeof UI === 'undefined' || !UI.openRecord) return;

      closeAll(null);
      UI.openRecord({
        date,
        shift: shift === null ? State.evalShift + 1 : Number(shift),
        line: $('#fLine')?.value || '1',
        stage: stage || $('#fStage')?.value || 'filling',
        stayOnScreen: true,
      });
    });
  }

  function wireTriggers() {
    $$('.compact-trigger').forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const panel = document.getElementById(button.getAttribute('aria-controls'));
        togglePanel(button, panel);
      });
    });

    $$('.compact-close').forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const panel = button.closest('.compact-popover');
        const trigger = panel ? document.querySelector(`[aria-controls="${panel.id}"]`) : null;
        if (panel) panel.classList.remove('is-open');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
      });
    });

    document.addEventListener('click', (e) => {
      // Jangan tutup panel Produk saat user klik item sugesti nama produk
      if (e.target.closest('.prod-suggest-drop, .kegiatan-suggest-drop, .bn-suggest-drop, .prod-suggest-item, .kegiatan-suggest-item, .bn-suggest-item')) return;
      if (!e.target.closest('.compact-control, .compact-trigger') && !e.target.closest('.compact-popover')) closeAll(null);
    });

    // Panel pilihan di-portal ke <body>, sehingga event delegation di
    // UI.bindUnifiedControls() yang menempel pada #sheetUnifiedControl
    // tidak lagi menerima klik secara bubbling. Karena itu setiap opsi
    // meneruskan klik ke tombol legacy yang masih berada di dalam root.
    // Dengan cara ini logika lama tetap menjadi satu-satunya sumber state.
    const forwardChoice = (btn, attr) => {
      const value = btn.getAttribute(attr);
      if (!value) return;
      const root = $('#sheetUnifiedControl');
      if (!root) return;
      const legacy = Array.from(root.querySelectorAll(`[${attr}]`)).find(el =>
        el !== btn && el.getAttribute(attr) === value && !el.closest('.compact-popover')
      );
      if (legacy) {
        legacy.click();
      } else {
        // Fallback jika tombol legacy tidak tersedia.
        if (attr === 'data-sheet-stage' && $('#fStage')) {
          $('#fStage').value = value;
          $('#fStage').dispatchEvent(new Event('change', { bubbles: true }));
          if (typeof UI !== 'undefined') {
            UI.applyStageUI?.();
            UI.updateShiftIndicator?.();
            UI.updateUnifiedControl?.();
          }
        } else if (attr === 'data-sheet-line' && $('#fLine')) {
          $('#fLine').value = value;
          $('#fLine').dispatchEvent(new Event('change', { bubbles: true }));
          if (typeof UI !== 'undefined') {
            UI.applyLineUI?.();
            UI.updateUnifiedControl?.();
          }
        } else if (attr === 'data-sheet-shift') {
          const legacyShift = root.querySelector(`#sheetShift [data-sheet-shift=\"${CSS.escape(value)}\"]`);
          legacyShift?.click();
        }
      }
      setTimeout(syncSummary, 0);
      closeAll(null);
    };

    $$('.compact-stage-option').forEach(btn => btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      forwardChoice(btn, 'data-sheet-stage');
    }));
    $$('.compact-line-option').forEach(btn => btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      forwardChoice(btn, 'data-sheet-line');
    }));
    $$('.compact-shift-option').forEach(btn => btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      forwardChoice(btn, 'data-sheet-shift');
    }));

    $$('.sheet-op-box, #prodName1, #prodName2, #prodName3, #prodRate1, #prodRate2, #prodRate3, #prodUkuran1, #prodUkuran2, #prodUkuran3, #prodWo1, #prodWo2, #prodWo3')
      .forEach(input => {
        input.addEventListener('input', syncSummary);
        input.addEventListener('change', syncSummary);
      });
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!$('#sheetUnifiedControl')) return;
    wireTriggers();
    wireShiftNavigator();
    syncSummary();

    // Popover diposisikan fixed saat dibuka agar tidak terpotong oleh
    // overflow/scroll container Sheet. Saat layar digeser, posisinya ikut.
    window.addEventListener('resize', () => {
      const open = $('.compact-popover.is-open');
      if (!open) return;
      const trigger = document.querySelector(`[aria-controls=\"${open.id}\"]`);
      if (trigger) positionPanel(trigger, open);
    }, { passive: true });
    const repositionOpen = () => {
      const open = $('.compact-popover.is-open');
      if (!open) return;
      const trigger = document.querySelector(`[aria-controls=\"${open.id}\"]`);
      if (trigger) positionPanel(trigger, open);
    };
    window.addEventListener('scroll', repositionOpen, { passive: true, capture: true });
    window.addEventListener('orientationchange', repositionOpen, { passive: true });
    window.visualViewport?.addEventListener('resize', repositionOpen, { passive: true });
    window.visualViewport?.addEventListener('scroll', repositionOpen, { passive: true });

    // Field asli dapat diubah oleh Storage/app tanpa event.
    setInterval(syncSummary, 700);
  });
})();
