/**
 * BULKFILL.JS — Isi Massal model mini-Sheet
 *
 * Saat tombol 📥 pada header diklik, operator mendapatkan grid ringkas
 * seperti lembar kerja: Kode | Mulai | Selesai | Durasi | Kegiatan | Good | Defect.
 * Satu baris modal = satu baris Log Sheet. Enter bergerak ke bawah, Tab
 * bergerak ke kanan, dan semua perubahan baru diterapkan ke Sheet saat
 * tombol "Masukkan ke Sheet" ditekan.
 */
const BulkFill = (() => {
  'use strict';

  const COLS = [
    { key: 'kode',     label: 'Kode',    type: 'digit',  cls: 'bf-kode' },
    { key: 'mulai',    label: 'Mulai',   type: 'time',   cls: 'bf-time' },
    { key: 'selesai',  label: 'Selesai', type: 'time',   cls: 'bf-time' },
    { key: 'durasi',   label: 'Durasi',  type: 'number', cls: 'bf-num' },
    { key: 'kegiatan', label: 'Kegiatan',type: 'text',   cls: 'bf-kegiatan' },
    { key: 'good',     label: 'Good',    type: 'number', cls: 'bf-num bf-output', restrict: 'kode2' },
    { key: 'defect',   label: 'Defect',  type: 'number', cls: 'bf-num bf-output', restrict: 'kode2' }
  ];

  const overlayEl = () => State.el.bulkOverlay;
  const modalEl = () => State.el.bulkModal;
  let startRow = 1;
  let focusCol = 'kode';
  let rowCount = 10;
  // Maksimal 3 kolom aktif agar nyaman dipakai di layar HP.
  // Klik sekali = tampil/aktif, klik lagi = sembunyikan.
  // Jika sudah 3 aktif lalu memilih kolom ke-4, kolom aktif paling lama
  // akan digantikan oleh kolom baru.
  let activeCols = ['kode', 'mulai', 'durasi'];
  let draftData = [];

  const COL_KEY = 'TKL_BULK_ACTIVE_COLS_V1';
  const NAV_KEY = 'TKL_BULK_NAV_MODE_V1';
  let navMode = 'vertical'; // Tab: vertikal (turun) atau horizontal (ke kanan)

  const loadActiveCols = () => {
    try {
      const raw = localStorage.getItem(COL_KEY);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          activeCols = parsed.filter(k => COLS.some(c => c.key === k)).slice(0, 3);
        }
      }
    } catch (_) {}
  };

  const saveActiveCols = () => {
    try { localStorage.setItem(COL_KEY, JSON.stringify(activeCols)); } catch (_) {}
  };

  const loadNavMode = () => {
    try {
      const raw = localStorage.getItem(NAV_KEY);
      if (raw === 'horizontal' || raw === 'vertical') navMode = raw;
    } catch (_) {}
  };

  const saveNavMode = () => {
    try { localStorage.setItem(NAV_KEY, navMode); } catch (_) {}
  };

  const selectedCols = () => COLS.filter(c => activeCols.includes(c.key));

  const toggleColumn = (key) => {
    const idx = activeCols.indexOf(key);
    if (idx >= 0) {
      activeCols.splice(idx, 1);
    } else {
      if (activeCols.length >= 3) {
        // Ganti kolom terakhir agar tetap maksimal 3 kolom.
        activeCols[activeCols.length - 1] = key;
      } else {
        activeCols.push(key);
      }
    }
    saveActiveCols();
  };

  const closeModal = () => {
    if (overlayEl()) overlayEl().classList.add('hide');
  };

  const catOf = (kode) => {
    try { return Utils.catOf(String(kode || '').trim()); } catch (_) { return ''; }
  };

  const esc = (value) => {
    if (typeof Utils !== 'undefined' && Utils.escapeHtml) return Utils.escapeHtml(String(value ?? ''));
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  };

  const inputAttrs = (col) => {
    if (col.type === 'digit') return 'type="tel" inputmode="numeric" maxlength="1"';
    if (col.type === 'time') return 'type="text" inputmode="numeric" maxlength="5"';
    if (col.type === 'number') return 'type="text" inputmode="decimal"';
    return 'type="text"';
  };

  const existingValue = (tr, key) => {
    const el = tr?.querySelector?.(`[data-f="${key}"]`);
    return el ? el.value : '';
  };

  const buildRows = () => {
    const rows = Rows.rows();
    const available = Math.max(0, rows.length - (startRow - 1));
    rowCount = Math.max(10, rowCount, available);
    // Batasi supaya modal tetap ringan di HP.
    rowCount = Math.min(rowCount, 30);

    let html = '';
    for (let i = 0; i < rowCount; i++) {
      const sheetIndex = startRow - 1 + i;
      const tr = rows[sheetIndex];
      const kode = existingValue(tr, 'kode');
      const cat = catOf(kode);
      html += `<div class="bf-row" data-bf-row="${i}" data-cat="${esc(cat)}">`;
      html += `<div class="bf-row-no">${startRow + i}</div>`;
      for (const col of selectedCols()) {
        const value = existingValue(tr, col.key);
        const disabled = col.restrict === 'kode2' && kode.trim() !== '2' ? ' disabled' : '';
        const placeholder = col.key === 'kegiatan' ? 'Kegiatan' : (col.key === 'kode' ? '•' : '');
        html += `<div class="bf-cell ${col.cls}">`;
        html += `<input class="bf-input" data-bf-field="${col.key}" data-bf-row="${i}" ${inputAttrs(col)} value="${esc(value)}" placeholder="${placeholder}"${disabled} aria-label="${col.label} baris ${startRow + i}">`;
        html += `</div>`;
      }
      html += '</div>';
    }
    return html;
  };

  const updateRowState = (rowEl) => {
    if (!rowEl) return;
    const kodeEl = rowEl.querySelector('[data-bf-field="kode"]');
    const kode = kodeEl?.value.trim() || '';
    const cat = catOf(kode);
    rowEl.dataset.cat = cat || '';
    rowEl.classList.remove('bf-planned', 'bf-unplanned', 'bf-prod');
    if (cat === 'planned') rowEl.classList.add('bf-planned');
    if (cat === 'unplanned') rowEl.classList.add('bf-unplanned');
    if (cat === 'prod') rowEl.classList.add('bf-prod');

    rowEl.querySelectorAll('[data-bf-field="good"], [data-bf-field="defect"]').forEach(el => {
      const allowed = kode === '2';
      el.disabled = !allowed;
      if (!allowed && el.value) el.value = '';
    });
  };

  const normalizeInput = (input) => {
    const field = input.dataset.bfField;
    if (field === 'kode') input.value = input.value.replace(/\D/g, '').slice(0, 1);
    if (field === 'time') input.value = Utils.maskTime(input.value);
    if (field === 'mulai' || field === 'selesai') input.value = Utils.maskTime(input.value);
    if (field === 'durasi' || field === 'good' || field === 'defect') input.value = input.value.replace(/[^\d.,]/g, '');
  };

  const focusTarget = (target) => {
    if (!target || target.disabled) return false;
    target.focus();
    target.select?.();
    return true;
  };

  const nextCell = (input, direction = navMode) => {
    const row = Number(input.dataset.bfRow);
    const field = input.dataset.bfField;
    const visibleCols = selectedCols();
    const col = visibleCols.findIndex(c => c.key === field);
    if (!visibleCols.length || col < 0) return false;

    let target = null;
    if (direction === 'horizontal') {
      // Tab ke kanan; ujung baris → awal baris berikutnya.
      if (col + 1 < visibleCols.length) {
        target = modalEl().querySelector(`[data-bf-row="${row}"][data-bf-field="${visibleCols[col + 1].key}"]`);
      } else if (row + 1 < rowCount) {
        target = modalEl().querySelector(`[data-bf-row="${row + 1}"][data-bf-field="${visibleCols[0].key}"]`);
      }
    } else {
      // Tab ke bawah; ujung kolom → awal kolom berikutnya.
      if (row + 1 < rowCount) {
        target = modalEl().querySelector(`[data-bf-row="${row + 1}"][data-bf-field="${field}"]`);
      } else if (col + 1 < visibleCols.length) {
        target = modalEl().querySelector(`[data-bf-row="0"][data-bf-field="${visibleCols[col + 1].key}"]`);
      }
    }
    return focusTarget(target);
  };

  const autoAdvance = (input) => {
    const field = input.dataset.bfField;
    // Kode hanya 1 digit: begitu terisi langsung turun ke baris berikutnya.
    if (field === 'kode' && input.value.length >= 1) {
      return nextCell(input, 'vertical');
    }
    // Jam selesai pada HH:MM (5 karakter): langsung turun ke baris berikutnya.
    if ((field === 'mulai' || field === 'selesai') && input.value.length >= 5) {
      return nextCell(input, 'vertical');
    }
    return false;
  };

  const collect = () => {
    const base = draftData.length
      ? draftData.map(item => ({ ...item }))
      : Array.from({ length: rowCount }, (_, i) => ({ row: startRow + i }));

    // Pastikan area yang sedang terlihat selalu tersedia di draft.
    for (let i = 0; i < rowCount; i++) {
      const rowNo = startRow + i;
      if (!base.some(item => item.row === rowNo)) base.push({ row: rowNo });
    }

    modalEl().querySelectorAll('.bf-input').forEach(input => {
      const i = Number(input.dataset.bfRow);
      const key = input.dataset.bfField;
      const rowNo = startRow + i;
      const item = base.find(r => r.row === rowNo);
      if (!item) return;
      item[key] = input.value.trim();
    });

    base.sort((a, b) => a.row - b.row);
    draftData = base;
    return base;
  };

  const applyToSheet = () => {
    const data = collect();
    const meaningful = data.filter(r => COLS.some(c => String(r[c.key] || '').trim() !== ''));
    if (!meaningful.length) {
      UI.toast('Belum ada data untuk dimasukkan ke Sheet ⚠', true, 'warn');
      return;
    }

    const lastRow = Math.max(...meaningful.map(r => r.row));
    while (Rows.rows().length < lastRow) Rows.makeRow();
    Rows.updateRowNumbers();

    let changed = 0;
    let skippedOutput = 0;
    const rows = Rows.rows();

    data.forEach(item => {
      const hasAny = COLS.some(c => String(item[c.key] || '').trim() !== '');
      if (!hasAny) return;
      const tr = rows[item.row - 1];
      if (!tr) return;

      const kode = String(item.kode || '').trim();
      COLS.forEach(col => {
        let value = String(item[col.key] || '').trim();
        if (!value) return;
        if (col.restrict === 'kode2' && kode !== '2') {
          skippedOutput++;
          return;
        }
        if (col.type === 'time') {
          const n = Utils.normTime(value);
          if (n == null) return;
          value = n;
        }
        const el = tr.querySelector(`[data-f="${col.key}"]`);
        if (!el) return;
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('focusout', { bubbles: true }));
        changed++;
      });
    });

    try { Calculation.recalc(); } catch (_) {}
    try {
      if (Storage && typeof Storage.saveData === 'function') {
        Storage.saveData({ silent: true }).catch(err => console.warn('Sync setelah Isi Massal gagal:', err));
      } else {
        Storage.autoSaveLocal();
      }
    } catch (_) {}
    closeModal();

    const suffix = skippedOutput ? ` · ${skippedOutput} Good/Defect dilewati karena Kode bukan 2` : '';
    UI.toast(`${changed} isian berhasil masuk ke Sheet ✓${suffix}`);
  };

  const bindEvents = () => {
    const modal = modalEl();

    modal.querySelector('[data-act="suggest-toggle"]')?.addEventListener('click', () => {
      const form = modal.querySelector('[data-suggest-form]');
      if (!form) return;
      form.hidden = !form.hidden;
      if (!form.hidden) modal.querySelector('[data-suggest-new]')?.focus();
    });

    const addSuggestionFromUI = () => {
      const input = modal.querySelector('[data-suggest-new]');
      const value = input?.value.trim() || '';
      if (!value) { input?.focus(); return; }
      if (typeof Suggest === 'undefined' || !Suggest.addSuggestion) return;
      const added = Suggest.addSuggestion(value);
      UI.toast(added ? `Sugesti "${value}" ditambahkan ✓` : 'Sugesti sudah terdaftar.', !added, added ? 'ok' : 'warn');
      if (added) {
        input.value = '';
        renderGrid(collect());
        const form = modalEl().querySelector('[data-suggest-form]');
        if (form) form.hidden = false;
        modalEl().querySelector('[data-suggest-new]')?.focus();
      }
    };
    modal.querySelector('[data-act="suggest-add"]')?.addEventListener('click', addSuggestionFromUI);
    modal.querySelector('[data-suggest-new]')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); addSuggestionFromUI(); }
    });
    modal.querySelectorAll('[data-suggest-remove]').forEach(btn => {
      btn.addEventListener('click', () => {
        const value = btn.getAttribute('data-suggest-remove') || '';
        Suggest.removeSuggestion?.(value);
        renderGrid(collect());
      });
    });

    modal.querySelectorAll('[data-nav-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        navMode = btn.getAttribute('data-nav-mode') === 'horizontal' ? 'horizontal' : 'vertical';
        saveNavMode();
        const current = collect();
        renderGrid(current);
      });
    });

    modal.querySelectorAll('[data-col-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const current = collect();
        toggleColumn(btn.getAttribute('data-col-toggle'));
        renderGrid(current);
      });
    });

    modal.querySelectorAll('.bf-input').forEach(input => {
      input.addEventListener('input', () => {
        normalizeInput(input);
        const row = input.closest('.bf-row');
        if (input.dataset.bfField === 'kode') updateRowState(row);
        autoAdvance(input);
      });

      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          normalizeInput(input);
          nextCell(input, 'vertical');
        } else if (e.key === 'Tab') {
          // Jangan biarkan browser keluar dari grid. Navigasi mengikuti pilihan operator.
          e.preventDefault();
          normalizeInput(input);
          nextCell(input, navMode);
        }
      });

      input.addEventListener('blur', () => {
        if (input.dataset.bfField === 'mulai' || input.dataset.bfField === 'selesai') normalizeInput(input);
      });

      // Paste beberapa baris sekaligus ke satu kolom.
      input.addEventListener('paste', e => {
        const text = e.clipboardData?.getData('text') || '';
        const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        if (lines.length <= 1) return;
        e.preventDefault();
        const row = Number(input.dataset.bfRow);
        const field = input.dataset.bfField;
        lines.forEach((value, offset) => {
          const target = modal.querySelector(`[data-bf-row="${row + offset}"][data-bf-field="${field}"]`);
          if (!target) return;
          target.value = value;
          normalizeInput(target);
          if (field === 'kode') updateRowState(target.closest('.bf-row'));
        });
        const last = modal.querySelector(`[data-bf-row="${Math.min(row + lines.length - 1, rowCount - 1)}"][data-bf-field="${field}"]`);
        last?.focus();
      });
    });

    modal.querySelector('[data-act="cancel"]')?.addEventListener('click', closeModal);
    modal.querySelector('[data-act="save"]')?.addEventListener('click', applyToSheet);
    modal.querySelector('[data-act="clear"]')?.addEventListener('click', () => {
      modal.querySelectorAll('.bf-input').forEach(i => i.value = '');
      draftData = [];
      modal.querySelectorAll('.bf-row').forEach(updateRowState);
      modal.querySelector('[data-bf-field="kode"]')?.focus();
    });
    modal.querySelector('[data-act="add"]')?.addEventListener('click', () => {
      const current = collect();
      rowCount = Math.min(rowCount + 5, 30);
      renderGrid(current);
    });
    modal.querySelector('[data-act="start"]')?.addEventListener('change', e => {
      collect();
      const n = parseInt(e.target.value, 10);
      startRow = Number.isFinite(n) && n > 0 ? n : 1;
      renderGrid(draftData);
    });
  };

  const renderNavPicker = () => {
    return `
      <div class="bf-nav-picker" role="group" aria-label="Pilih arah navigasi Tab">
        <div class="bf-nav-title">⌨️ Navigasi Tab <span>${navMode === 'horizontal' ? '→ mendatar' : '↓ menurun'}</span></div>
        <div class="bf-nav-buttons">
          <button type="button" class="bf-nav-toggle ${navMode === 'horizontal' ? 'is-active' : ''}" data-nav-mode="horizontal">→ Horizontal</button>
          <button type="button" class="bf-nav-toggle ${navMode === 'vertical' ? 'is-active' : ''}" data-nav-mode="vertical">↓ Vertikal</button>
        </div>
      </div>
    `;
  };

  const renderSuggestionPanel = () => {
    const custom = (typeof Suggest !== 'undefined' && Suggest.getCustomSuggestions)
      ? Suggest.getCustomSuggestions() : [];
    return `
      <div class="bf-suggest-panel">
        <div class="bf-suggest-head">
          <div>
            <strong>💡 Sugesti Kegiatan</strong>
            <small>Ketik <b>L</b> setelah spasi → pilih kegiatan → spasi berikutnya siap untuk sugesti lagi.</small>
          </div>
          <button type="button" class="bf-suggest-add-toggle" data-act="suggest-toggle">＋ Tambah Sugesti</button>
        </div>
        <div class="bf-suggest-add-form" data-suggest-form hidden>
          <input type="text" class="bf-suggest-new" data-suggest-new placeholder="Contoh: Loading Lot E" maxlength=80 autocomplete="off">
          <button type="button" class="btn btn-primary" data-act="suggest-add">Simpan</button>
        </div>
        ${custom.length ? `<div class="bf-suggest-list">${custom.map(v => `<span class="bf-suggest-chip">${esc(v)} <button type="button" data-suggest-remove="${esc(v)}" title="Hapus sugesti">×</button></span>`).join('')}</div>` : '<div class="bf-suggest-empty">Belum ada sugesti tambahan. Daftar bawaan tetap tersedia.</div>'}
      </div>
    `;
  };

  const renderColumnPicker = () => {
    return `
      <div class="bf-column-picker" role="group" aria-label="Pilih kolom Isi Massal">
        <div class="bf-picker-head">
          <div>
            <strong>Kolom yang ditampilkan</strong>
            <span class="bf-picker-count">${activeCols.length}/3</span>
          </div>
          <small>1× pilih · 2× hide · pilih kolom ke-4 akan mengganti kolom paling lama</small>
        </div>
        <div class="bf-picker-buttons">
          ${COLS.map(c => {
            const on = activeCols.includes(c.key);
            return `<button type="button" class="bf-col-toggle ${on ? 'is-active' : ''}" data-col-toggle="${c.key}" aria-pressed="${on}">${esc(c.label)}${on ? ' ✓' : ''}</button>`;
          }).join('')}
        </div>
        ${activeCols.length === 0 ? '<div class="bf-empty-columns">Tidak ada kolom aktif. Pilih minimal 1 kolom untuk mulai mengisi.</div>' : ''}
      </div>
    `;
  };

  const renderGrid = (previousData = null) => {
    const modal = modalEl();
    const old = previousData || draftData || [];
    modal.classList.add('bulk-modal-grid');
    modal.innerHTML = `
      <div class="bf-head">
        <div>
          <h3 class="qm-title"><span class="bolt">📥</span> Isi Massal — Mini Sheet</h3>
          <p class="qm-sub">Isi beberapa baris sekaligus. <b>Enter</b> turun ke baris berikutnya, <b>Tab</b> ke kolom berikutnya. Setelah selesai klik <b>Masukkan ke Sheet</b>.</p>
        </div>
        <button type="button" class="bf-x" data-act="cancel" aria-label="Tutup">×</button>
      </div>
      <div class="bf-toolbar">
        <label>Mulai baris <input type="number" id="bfStart" min="1" value="${startRow}"></label>
        <span class="bf-tip">💡 Kode 2 otomatis membuka Good &amp; Defect</span>
        <button type="button" class="btn btn-ghost bf-clear" data-act="clear">Bersihkan</button>
      </div>
      ${renderNavPicker()}
      ${renderColumnPicker()}
      ${renderSuggestionPanel()}
      <div class="bf-grid-wrap">
        <div class="bf-grid bf-header-row" style="--bf-col-count:${selectedCols().length}">
          <div class="bf-row-no">#</div>
          ${selectedCols().map(c => `<div class="bf-th ${c.cls}">${c.label}${c.restrict ? '<small>Kode 2</small>' : ''}</div>`).join('')}
        </div>
        <div class="bf-grid bf-body" style="--bf-col-count:${selectedCols().length}">${buildRows()}</div>
      </div>
      <div class="bf-footer">
        <span class="bf-hint">⚡ Bisa paste daftar angka/jam satu kolom sekaligus.</span>
        <div class="qm-actions">
          <button type="button" class="btn btn-ghost" data-act="add">+ 5 baris</button>
          <button type="button" class="btn btn-ghost" data-act="cancel">Batal</button>
          <button type="button" class="btn btn-primary" data-act="save">✓ Masukkan ke Sheet</button>
        </div>
      </div>
    `;

    if (old.length) {
      old.forEach(item => Object.entries(item).forEach(([key, value]) => {
        if (key === 'row') return;
        const row = item.row - startRow;
        const el = modal.querySelector(`[data-bf-row="${row}"][data-bf-field="${key}"]`);
        if (el) el.value = value || '';
      }));
    }
    modal.querySelectorAll('.bf-row').forEach(updateRowState);
    bindEvents();

    // Autocomplete Kegiatan aktif juga untuk input yang baru dirender.
    if (typeof Suggest !== 'undefined' && Suggest.attachGhost) {
      modal.querySelectorAll('.bf-kegiatan .bf-input').forEach(el => Suggest.attachGhost(el));
    }

    const focus = modal.querySelector(`[data-bf-field="${focusCol}"]`);
    focus?.focus();
    focus?.select?.();
  };

  const open = (requestedCol) => {
    focusCol = requestedCol || 'kode';
    draftData = [];
    const rows = Rows.rows();
    const idx = rows.findIndex(tr => {
      const el = tr.querySelector(`[data-f="${focusCol}"]`);
      return el && !el.value.trim();
    });
    startRow = idx >= 0 ? idx + 1 : (rows.length ? rows.length + 1 : 1);
    if (!startRow) startRow = 1;
    renderGrid();
    overlayEl()?.classList.remove('hide');
  };

  const init = () => {
    loadActiveCols();
    loadNavMode();
    if (!overlayEl()) return;
    document.querySelectorAll('.th-bulk-btn[data-bulk-col]').forEach(btn => {
      btn.addEventListener('click', () => open(btn.getAttribute('data-bulk-col')));
    });
    overlayEl().addEventListener('click', e => {
      if (e.target === overlayEl()) closeModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !overlayEl().classList.contains('hide')) closeModal();
    });
  };

  return { init, open };
})();
