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
    { key: 'batch',    label: 'Produk',  type: 'select', cls: 'bf-batch' }, /* <-- DROPDOWN PRODUK */
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

        if (col.type === 'select') {
          // Ambil daftar produk yang sedang aktif dari modul Rows
          const prods = (typeof Rows !== 'undefined') ? Rows.getActiveProducts() : [];
          let optionsHtml = '<option value="">-- Pilih --</option>';
          prods.forEach(p => {
            const isSelected = (p === value) ? ' selected' : '';
            optionsHtml += `<option value="${esc(p)}"${isSelected}>${esc(p)}</option>`;
          });
          html += `<select class="bf-input" data-bf-field="${col.key}" data-bf-row="${i}" aria-label="${col.label} baris ${startRow + i}"${disabled}>${optionsHtml}</select>`;
        } else {
          html += `<input class="bf-input" data-bf-field="${col.key}" data-bf-row="${i}" ${inputAttrs(col)} value="${esc(value)}" placeholder="${placeholder}"${disabled} aria-label="${col.label} baris ${startRow + i}">`;
        }

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
    // Kode 1 digit: pindah sesuai mode navigasi aktif
    if (field === 'kode' && input.value.length >= 1) {
      return nextCell(input, navMode);
    }
    // Jam pada HH:MM (5 karakter): pindah sesuai mode navigasi aktif
    if ((field === 'mulai' || field === 'selesai') && input.value.length >= 5) {
      return nextCell(input, navMode);
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

    // Panel "Sugesti Kegiatan" dihapus dari UI agar halaman lebih bersih.
    // Sugesti tambahan tetap disimpan ke Supabase lewat Suggest.addSuggestion()
    // (ghost-text / autocomplete Kegiatan tetap aktif).

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

      // Efek cascade (beruntun ke bawah) khusus untuk dropdown Produk (batch)
      input.addEventListener('change', (e) => {
        if (input.dataset.bfField === 'batch') {
          const currentRowIdx = Number(input.dataset.bfRow);
          const selectedProduct = input.value;
          
          // Loop baris-baris di bawahnya dan ubah nilainya
          for (let r = currentRowIdx + 1; r < rowCount; r++) {
            const targetSelect = modal.querySelector(`[data-bf-row="${r}"][data-bf-field="batch"]`);
            if (targetSelect) {
              targetSelect.value = selectedProduct;
            }
          }
        }
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

    modal.querySelectorAll('[data-act="cancel"]').forEach(btn => btn.addEventListener('click', closeModal));
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

  // ====== NOTEPAD MASS FILL (Kode / Jam Mulai / Durasi) ======
  // UI sederhana: textarea + copy / simpan / hapus — sesuai mockup operator.
  const NOTEPAD_COLS = {
    kode: {
      title: 'Isi Kode masal',
      hint: 'Satu digit = satu baris. Format: 2 atau 2.918.4 (kode.good.defect). Ketik 2542 → otomatis jadi 4 baris. Hapus baris = hapus kode+good+defect di sheet.',
      inputmode: 'text',
    },
    mulai: {
      title: 'Isi Jam Mulai',
      hint: 'Format: 1630 atau 1630.918.4 (jam.good.defect). Hapus baris = hapus jam+good+defect di sheet.',
      inputmode: 'text',
    },
    durasi: {
      title: 'Isi Durasi masal',
      hint: 'Format: 35 atau 35.918.4 (durasi.good.defect). Hapus baris = hapus durasi+good+defect di sheet.',
      inputmode: 'text',
    },
  };

  /**
   * Prefill notepad: ambil SEMUA baris sheet yang sudah terisi kolom ini
   * (dari baris 1), supaya bisa diedit / dicopy — bukan mulai dari baris kosong.
   */
  const buildNotepadPrefill = (col) => {
    const rows = Rows.rows();
    const lines = [];
    for (let i = 0; i < rows.length; i++) {
      const tr = rows[i];
      if (!tr) continue;
      if (col === 'kode') {
        const v = (tr.querySelector('[data-f="kode"]')?.value || '').trim();
        const good = (tr.querySelector('[data-f="good"]')?.value || '').trim();
        const defect = (tr.querySelector('[data-f="defect"]')?.value || '').trim();
        // Tampilkan jika ada kode atau good/defect
        if (!v && !good && !defect) continue;
        let packed = v || '0';
        if (good || defect) {
          packed += '.' + (good || '0') + '.' + (defect || '0');
        }
        lines.push(packed);
      } else if (col === 'mulai') {
        const mulai = (tr.querySelector('[data-f="mulai"]')?.value || '').trim();
        const good = (tr.querySelector('[data-f="good"]')?.value || '').trim();
        const defect = (tr.querySelector('[data-f="defect"]')?.value || '').trim();
        // Tampilkan jika ada jam atau good/defect
        if (!mulai && !good && !defect) continue;
        let packed;
        if (mulai) {
          const digits = mulai.replace(/\D/g, '');
          packed = digits.length >= 3
            ? digits.padStart(4, '0').slice(0, 4)
            : mulai.replace(':', '');
        } else {
          packed = '0000';
        }
        // Selalu tampilkan good & defect jika ada (format jam.good.defect)
        if (good || defect) {
          packed += '.' + (good || '0') + '.' + (defect || '0');
        }
        lines.push(packed);
      } else if (col === 'durasi') {
        const dur = (tr.querySelector('[data-f="durasi"]')?.value || '').trim();
        const good = (tr.querySelector('[data-f="good"]')?.value || '').trim();
        const defect = (tr.querySelector('[data-f="defect"]')?.value || '').trim();
        if (!dur && !good && !defect) continue;
        let packed = dur || '0';
        if (good || defect) {
          packed += '.' + (good || '0') + '.' + (defect || '0');
        }
        lines.push(packed);
      }
    }
    // Prefill dengan nomor baris: "1. 2" / "1. 1540" / "1. 35.918.4"
    if (!lines.length) return '1. ';
    return lines.map((ln, i) => `${i + 1}. ${ln}`).join('\n');
  };

  const ensureRows = (startIdx0, count) => {
    while (Rows.rows().length < startIdx0 + count) Rows.makeRow();
    Rows.updateRowNumbers();
    return Rows.rows();
  };

  /** Hapus prefix nomor baris: "4. 1630.918.6" → "1630.918.6" */
  const stripLineNumber = (line) =>
    String(line || '').replace(/^\s*\d+\.\s*/, '').trim();

  /**
   * Renumber semua baris jadi "1. …", "2. …".
   * keepTrailingEmpty=true → selalu sisakan baris terakhir "N. " siap ketik (untuk Enter).
   */
  const renumberNotepadLines = (text, keepTrailingEmpty = false) => {
    const rawLines = String(text || '').split(/\r?\n/);
    const contents = rawLines.map(stripLineNumber);
    const meaningful = contents.filter(s => s !== '');
    const lastWasEmpty = contents.length > 0 && contents[contents.length - 1] === '';
    if (!meaningful.length) return '1. ';
    const lines = meaningful.map((s, i) => `${i + 1}. ${s}`);
    if (keepTrailingEmpty || lastWasEmpty) {
      lines.push(`${meaningful.length + 1}. `);
    }
    return lines.join('\n');
  };

  const parseMulaiLine = (line) => {
    const raw = stripLineNumber(line);
    if (!raw) return null;
    const parts = raw.split(/[.\t,]/).map(s => s.trim());
    const timeRaw = (parts[0] || '').replace(/\s/g, '');
    const goodRaw = parts.length > 1 ? parts[1].replace(/[^\d]/g, '') : '';
    const defectRaw = parts.length > 2 ? parts[2].replace(/[^\d]/g, '') : '';
    let digits = timeRaw.replace(/\D/g, '');
    let mulai = '';
    if (/^\d{1,2}:\d{1,2}$/.test(timeRaw)) {
      mulai = Utils.normTime(timeRaw) || Utils.maskTime(timeRaw);
    } else if (digits.length >= 3 && digits.length <= 4) {
      digits = digits.padStart(4, '0');
      mulai = digits.slice(0, 2) + ':' + digits.slice(2);
      const n = Utils.normTime(mulai);
      if (n) mulai = n;
    } else if (digits.length > 0 && digits.length <= 2) {
      mulai = Utils.normTime(digits) || (digits.padStart(2, '0') + ':00');
    } else return null;
    return {
      mulai,
      good: goodRaw !== '' ? goodRaw : null,
      defect: defectRaw !== '' ? defectRaw : null,
    };
  };

  const parseDurasiLine = (line) => {
    const raw = stripLineNumber(line);
    if (!raw) return null;
    const parts = raw.split(/[.\t,]/).map(s => s.trim());
    const durRaw = (parts[0] || '').replace(/[^\d]/g, '');
    const goodRaw = parts.length > 1 ? parts[1].replace(/[^\d]/g, '') : '';
    const defectRaw = parts.length > 2 ? parts[2].replace(/[^\d]/g, '') : '';
    if (durRaw === '') return null;
    const n = parseInt(durRaw, 10);
    if (!isFinite(n) || n < 0) return null;
    return {
      durasi: String(n),
      good: goodRaw !== '' ? goodRaw : null,
      defect: defectRaw !== '' ? defectRaw : null,
    };
  };

  /** Parse baris kode: "2" atau "2.918.4" (kode.good.defect). Kode max 1 digit. */
  const parseKodeLine = (line) => {
    const raw = stripLineNumber(line);
    if (!raw) return null;
    const parts = raw.split(/[.\t,]/).map(s => s.trim());
    const kodeRaw = (parts[0] || '').replace(/\D/g, '');
    const goodRaw = parts.length > 1 ? parts[1].replace(/[^\d]/g, '') : '';
    const defectRaw = parts.length > 2 ? parts[2].replace(/[^\d]/g, '') : '';
    if (kodeRaw === '') return null;
    // Ambil hanya digit pertama sebagai kode (1 digit)
    const kode = kodeRaw.slice(0, 1);
    return {
      kode,
      good: goodRaw !== '' ? goodRaw : null,
      defect: defectRaw !== '' ? defectRaw : null,
    };
  };

  /** Kosongkan field di baris; return true jika ada nilai yang dihapus. */
  const clearRowField = (tr, field) => {
    const el = tr.querySelector(`[data-f="${field}"]`);
    if (!el) return false;
    if (!String(el.value || '').trim()) return false;
    el.value = '';
    el.classList.remove('invalid');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  };

  /**
   * Apply 2 arah: tulis data baru + hapus sisa di baris berikutnya
   * yang masih berisi field yang sama (agar edit/hapus di notepad = sheet).
   */
  const applyNotepadKode = (text, fromRow) => {
    const lines = String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const parsed = lines.map(parseKodeLine).filter(Boolean);
    const startIdx = Math.max(0, (fromRow || 1) - 1);
    let rows = Rows.rows();

    if (parsed.length) {
      rows = ensureRows(startIdx, parsed.length);
    }

    let written = 0;
    parsed.forEach((item, offset) => {
      const tr = rows[startIdx + offset];
      if (!tr) return;
      const el = tr.querySelector('[data-f="kode"]');
      if (!el) return;
      el.value = item.kode;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      try { Rows.applyCat(tr); } catch (_) {}

      // Good/Defect 2 arah: ada di baris → set; tidak ada → hapus di sheet
      if (item.good != null) {
        const g = tr.querySelector('[data-f="good"]');
        if (g) { g.value = item.good; g.dispatchEvent(new Event('input', { bubbles: true })); }
      } else {
        clearRowField(tr, 'good');
      }
      if (item.defect != null) {
        const d = tr.querySelector('[data-f="defect"]');
        if (d) { d.value = item.defect; d.dispatchEvent(new Event('input', { bubbles: true })); }
      } else {
        clearRowField(tr, 'defect');
      }
      written++;
    });

    // Hapus Kode + Good + Defect di baris sisa (2 arah penuh)
    let cleared = 0;
    rows = Rows.rows();
    for (let i = startIdx + parsed.length; i < rows.length; i++) {
      const tr = rows[i];
      if (!tr) continue;
      let any = false;
      if (clearRowField(tr, 'kode')) {
        try { Rows.applyCat(tr); } catch (_) {}
        any = true;
      }
      if (clearRowField(tr, 'good')) any = true;
      if (clearRowField(tr, 'defect')) any = true;
      if (any) cleared++;
    }

    if (!written && !cleared) {
      UI.toast('Belum ada kode untuk disimpan ⚠', true, 'warn');
      return 0;
    }
    return written + cleared;
  };

  const applyNotepadMulai = (text, fromRow) => {
    const lines = String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const parsed = lines.map(parseMulaiLine).filter(Boolean);
    const startIdx = Math.max(0, (fromRow || 1) - 1);
    let rows = Rows.rows();

    if (parsed.length) {
      rows = ensureRows(startIdx, parsed.length);
    }

    let written = 0;
    parsed.forEach((item, offset) => {
      const tr = rows[startIdx + offset];
      if (!tr) return;
      const mulaiEl = tr.querySelector('[data-f="mulai"]');
      if (!mulaiEl) return;
      mulaiEl.value = item.mulai;
      mulaiEl.classList.remove('invalid');
      mulaiEl.dispatchEvent(new Event('input', { bubbles: true }));
      mulaiEl.dispatchEvent(new Event('change', { bubbles: true }));
      mulaiEl.dispatchEvent(new Event('focusout', { bubbles: true }));

      // Cascade: jam mulai → selesai baris sebelumnya
      const prev = offset === 0
        ? (() => {
            let p = tr.previousElementSibling;
            while (p && !p.classList.contains('log-row')) p = p.previousElementSibling;
            return p;
          })()
        : rows[startIdx + offset - 1];
      if (prev) {
        const sv = prev.querySelector('[data-f="selesai"]');
        if (sv) {
          sv.value = item.mulai;
          sv.classList.remove('invalid');
          sv.dispatchEvent(new Event('input', { bubbles: true }));
          sv.dispatchEvent(new Event('focusout', { bubbles: true }));
        }
      }

      // Good/Defect 2 arah: ada di baris → set; tidak ada → hapus di sheet
      const g = tr.querySelector('[data-f="good"]');
      const d = tr.querySelector('[data-f="defect"]');
      if (item.good != null) {
        if (g) { g.value = item.good; g.dispatchEvent(new Event('input', { bubbles: true })); }
      } else {
        clearRowField(tr, 'good');
      }
      if (item.defect != null) {
        if (d) { d.value = item.defect; d.dispatchEvent(new Event('input', { bubbles: true })); }
      } else {
        clearRowField(tr, 'defect');
      }
      written++;
    });

    // Hapus Jam Mulai + Good + Defect di baris sisa (2 arah penuh)
    let cleared = 0;
    rows = Rows.rows();
    for (let i = startIdx + parsed.length; i < rows.length; i++) {
      const tr = rows[i];
      if (!tr) continue;
      let any = false;
      if (clearRowField(tr, 'mulai')) any = true;
      if (clearRowField(tr, 'good')) any = true;
      if (clearRowField(tr, 'defect')) any = true;
      if (any) cleared++;
    }

    if (!written && !cleared) {
      UI.toast('Format jam tidak valid ⚠', true, 'warn');
      return 0;
    }
    return written + cleared;
  };

  const applyNotepadDurasi = (text, fromRow) => {
    const lines = String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const parsed = lines.map(parseDurasiLine).filter(Boolean);
    const startIdx = Math.max(0, (fromRow || 1) - 1);
    let rows = Rows.rows();

    if (parsed.length) {
      rows = ensureRows(startIdx, parsed.length);
    }

    let written = 0;
    parsed.forEach((item, offset) => {
      const tr = rows[startIdx + offset];
      if (!tr) return;
      const durEl = tr.querySelector('[data-f="durasi"]');
      if (!durEl) return;
      durEl.value = item.durasi;
      durEl.dispatchEvent(new Event('input', { bubbles: true }));

      const mulaiEl = tr.querySelector('[data-f="mulai"]');
      const selesaiEl = tr.querySelector('[data-f="selesai"]');
      const mulaiMin = mulaiEl ? Utils.parseTime(mulaiEl.value) : null;
      const durMin = parseFloat(item.durasi);
      if (mulaiMin != null && isFinite(durMin) && selesaiEl) {
        selesaiEl.value = Utils.minutesToHHMM(mulaiMin + durMin);
        selesaiEl.classList.remove('invalid');
        selesaiEl.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // Good/Defect 2 arah sama seperti Jam Mulai
      if (item.good != null) {
        const g = tr.querySelector('[data-f="good"]');
        if (g) { g.value = item.good; g.dispatchEvent(new Event('input', { bubbles: true })); }
      } else {
        clearRowField(tr, 'good');
      }
      if (item.defect != null) {
        const d = tr.querySelector('[data-f="defect"]');
        if (d) { d.value = item.defect; d.dispatchEvent(new Event('input', { bubbles: true })); }
      } else {
        clearRowField(tr, 'defect');
      }
      written++;
    });

    // Hapus Durasi + Good + Defect di baris sisa
    let cleared = 0;
    rows = Rows.rows();
    for (let i = startIdx + parsed.length; i < rows.length; i++) {
      const tr = rows[i];
      if (!tr) continue;
      let any = false;
      if (clearRowField(tr, 'durasi')) any = true;
      if (clearRowField(tr, 'good')) any = true;
      if (clearRowField(tr, 'defect')) any = true;
      if (any) cleared++;
    }

    if (!written && !cleared) {
      UI.toast('Format durasi tidak valid ⚠', true, 'warn');
      return 0;
    }
    return written + cleared;
  };

  const bindNotepadEvents = (col, fromRow) => {
    const modal = modalEl();
    if (!modal) return;
    const ta = modal.querySelector('#npText');
    const btnCopy = modal.querySelector('[data-np="copy"]');
    const btnSave = modal.querySelector('[data-np="save"]');
    const btnClear = modal.querySelector('[data-np="clear"]');
    const btnClose = modal.querySelector('[data-np="close"]');
    const numbered = true; // kode, mulai, durasi semua pakai format bernomor + Enter

    btnClose?.addEventListener('click', closeModal);
    btnClear?.addEventListener('click', () => {
      if (!ta) return;
      ta.value = '1. ';
      ta.focus();
      // Kursor di akhir
      const len = ta.value.length;
      try { ta.setSelectionRange(len, len); } catch (_) {}
    });
    btnCopy?.addEventListener('click', async () => {
      const text = ta ? ta.value : '';
      try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
        else {
          ta?.select();
          document.execCommand('copy');
        }
        UI.toast('Tersalin ke clipboard ✓');
      } catch (_) {
        UI.toast('Gagal menyalin ⚠', true, 'warn');
      }
    });
    btnSave?.addEventListener('click', () => {
      const text = ta ? ta.value : '';
      let count = 0;
      if (col === 'kode') count = applyNotepadKode(text, fromRow);
      else if (col === 'mulai') count = applyNotepadMulai(text, fromRow);
      else if (col === 'durasi') count = applyNotepadDurasi(text, fromRow);
      if (!count) return;
      try { Calculation.recalc(); } catch (_) {}
      try {
        if (Storage && typeof Storage.saveData === 'function') {
          Storage.saveData({ silent: true }).catch(() => {});
        } else if (Storage?.autoSaveLocal) Storage.autoSaveLocal();
      } catch (_) {}
      closeModal();
      UI.toast(`${count} baris masuk ke Sheet ✓`);
    });

    if (ta && numbered) {
      // Enter → baris baru otomatis berprefix "N. "
      ta.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
        e.preventDefault();
        e.stopPropagation();
        const val = ta.value;
        const pos = ta.selectionStart ?? val.length;
        const end = ta.selectionEnd ?? pos;
        const before = val.slice(0, pos);
        const after = val.slice(end);
        // Sisip newline + nomor; keepTrailingEmpty agar baris baru tidak hilang
        ta.value = renumberNotepadLines(before + '\n' + after, true);
        // Kursor di akhir baris kosong terakhir (setelah "N. ")
        const lines = ta.value.split('\n');
        let caret = 0;
        for (let i = 0; i < lines.length - 1; i++) caret += lines[i].length + 1;
        caret += lines[lines.length - 1].length;
        try { ta.setSelectionRange(caret, caret); } catch (_) {}
      });

      // Paste multi-baris → otomatis beri nomor
      // Untuk kode: "2542" atau "2542\n3" → pecah jadi 1 digit per baris (kecuali yang punya .)
      ta.addEventListener('paste', (e) => {
        const cd = e.clipboardData || window.clipboardData;
        const text = cd ? (cd.getData('text') || '') : '';
        if (!text) return;
        e.preventDefault();
        e.stopPropagation();
        const pos = ta.selectionStart ?? ta.value.length;
        const end = ta.selectionEnd ?? pos;
        const before = ta.value.slice(0, pos);
        const after = ta.value.slice(end);

        let mid;
        if (col === 'kode') {
          // Expand: tiap digit murni jadi baris sendiri; yang ada separator (.) biarkan utuh
          const chunks = [];
          text.split(/\r?\n/).forEach(ln => {
            const raw = stripLineNumber(ln).trim();
            if (!raw) return;
            if (/[.\t,]/.test(raw)) {
              chunks.push(raw); // e.g. 2.918.4
            } else {
              // pure digits → 1 digit per line
              raw.replace(/\D/g, '').split('').forEach(d => chunks.push(d));
            }
          });
          mid = chunks.join('\n');
        } else {
          const pasted = text.split(/\r?\n/).map(stripLineNumber).filter(s => s !== '');
          mid = pasted.length ? pasted.join('\n') : stripLineNumber(text);
        }

        let merged = before;
        if (merged && !merged.endsWith('\n') && mid) merged += '\n';
        merged += mid;
        if (after) {
          if (!merged.endsWith('\n') && after) merged += '\n';
          merged += after;
        }
        ta.value = renumberNotepadLines(merged, false);
        const caret = ta.value.length;
        try { ta.setSelectionRange(caret, caret); } catch (_) {}
      });

      // Kode only: saat mengetik digit murni > 1 karakter di 1 baris → auto-split jadi baris baru
      // Pengecualian: jika ada separator "." maka biarkan (format kode.good.defect)
      if (col === 'kode') {
        ta.addEventListener('input', () => {
          const val = ta.value;
          const lines = val.split(/\r?\n/);
          let changed = false;
          const expanded = [];
          lines.forEach(ln => {
            const numMatch = ln.match(/^(\s*\d+\.\s*)(.*)$/);
            const prefix = numMatch ? numMatch[1] : '';
            const content = numMatch ? numMatch[2] : ln;
            if (!content) {
              expanded.push(ln);
              return;
            }
            // Ada separator → biarkan utuh (max length tidak dipotong)
            if (/[.\t,]/.test(content)) {
              expanded.push(ln);
              return;
            }
            // Pure digits: pecah jadi 1 digit per baris
            const digits = content.replace(/\D/g, '');
            if (digits.length <= 1) {
              expanded.push(ln);
              return;
            }
            changed = true;
            digits.split('').forEach((d, i) => {
              if (i === 0) expanded.push(prefix + d);
              else expanded.push(d); // akan di-renumber
            });
          });
          if (!changed) return;
          ta.value = renumberNotepadLines(expanded.join('\n'), true);
          // Kursor di akhir
          const len = ta.value.length;
          try { ta.setSelectionRange(len, len); } catch (_) {}
        });
      }
    }

    setTimeout(() => {
      if (!ta) return;
      ta.focus();
      const len = ta.value.length;
      try { ta.setSelectionRange(len, len); } catch (_) {}
    }, 50);
  };

  const renderNotepad = (col) => {
    const meta = NOTEPAD_COLS[col];
    if (!meta) return;
    // Selalu apply dari baris 1: prefill menampilkan semua data yang sudah ada
    const fromRow = 1;
    startRow = fromRow;
    const prefill = buildNotepadPrefill(col);
    const modal = modalEl();
    if (!modal) return;
    modal.classList.remove('bulk-modal-grid', 'bulk-modal-wide');
    modal.classList.add('bulk-modal', 'np-modal');
    const filledHint = prefill && prefill !== '1. '
      ? 'Data terisi ditampilkan — edit lalu simpan, atau tambah baris dengan Enter.'
      : meta.hint;
    modal.innerHTML = `
      <div class="np-shell">
        <div class="np-badge">${esc(meta.title)}</div>
        <textarea id="npText" class="np-textarea" inputmode="${meta.inputmode}"
          spellcheck="false" autocomplete="off" autocapitalize="off"
          placeholder="${esc(meta.hint)}">${esc(prefill)}</textarea>
        <div class="np-actions">
          <button type="button" class="np-btn np-btn-copy" data-np="copy">copy</button>
          <button type="button" class="np-btn np-btn-save" data-np="save">simpan</button>
          <button type="button" class="np-btn np-btn-clear" data-np="clear">hapus</button>
        </div>
        <p class="np-hint">${esc(filledHint)}</p>
        <button type="button" class="np-close" data-np="close" title="Tutup">✕</button>
      </div>
    `;
    bindNotepadEvents(col, fromRow);
  };

  const open = (requestedCol) => {
    focusCol = requestedCol || 'kode';
    draftData = [];
    // Kode / Mulai / Durasi → mode notepad (mockup operator)
    if (NOTEPAD_COLS[focusCol]) {
      renderNotepad(focusCol);
      overlayEl()?.classList.remove('hide');
      return;
    }
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
