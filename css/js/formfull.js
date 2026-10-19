/**
 * FORMFULL.JS
 * Mode "Form Lengkap": sama seperti FormMode (js/formmode.js) tapi menampilkan
 * SEMUA kolom tabel (bukan cuma 5 field ringkas) dalam satu kartu per baris:
 * Kode, Jam Mulai, Panggil Teknik, Teknik Datang, Jam Selesai, Durasi (m),
 * Kegiatan, Masalah/Penyebab, Disposisi/Tindakan, Nomor WO, Kode Produk &
 * Batch, Good, Defect — plus aksi hapus baris.
 *
 * Sama seperti FormMode: TIDAK menyimpan data sendiri — setiap field
 * langsung menulis ke input asli pada baris tabel lalu memicu event asli
 * (input/change/focusout) supaya semua logika existing (masking jam, mode
 * cepat/durasi, kategori kode, recalculation OEE) tetap satu-satunya sumber
 * kebenaran.
 */
const FormModeFull = (() => {
  'use strict';

  let currentIndex = 0;

  // ====== URUTAN FOKUS FIELD (untuk auto-advance & smart backspace) ======
  const FIELD_ORDER = [
    'ffKode', 'ffMulai', 'ffPanggil', 'ffTeknik', 'ffSelesai', 'ffDurasi',
    'ffKegiatan', 'ffMasalah', 'ffDisposisi', 'ffWo', 'ffBatch', 'ffGood', 'ffDefect',
  ];

  const focusField = (id) => {
    const el = State.el[id];
    if (!el) return;
    el.focus();
    if (el.select) el.select();
  };

  const focusNext = (currentId) => {
    const idx = FIELD_ORDER.indexOf(currentId);
    if (idx >= 0 && idx < FIELD_ORDER.length - 1) focusField(FIELD_ORDER[idx + 1]);
  };

  const focusPrev = (currentId) => {
    const idx = FIELD_ORDER.indexOf(currentId);
    if (idx > 0) focusField(FIELD_ORDER[idx - 1]);
  };

  // field data-f  →  { el: <input id>, kind }
  const FIELD_MAP = [
    { f: 'kode',      id: 'ffKode',      kind: 'digit' },
    { f: 'mulai',     id: 'ffMulai',     kind: 'time'  },
    { f: 'panggil',   id: 'ffPanggil',   kind: 'time'  },
    { f: 'teknik',    id: 'ffTeknik',    kind: 'time'  },
    { f: 'selesai',   id: 'ffSelesai',   kind: 'time'  },
    { f: 'durasi',    id: 'ffDurasi',    kind: 'text'  },
    { f: 'kegiatan',  id: 'ffKegiatan',  kind: 'textarea' },
    { f: 'masalah',   id: 'ffMasalah',   kind: 'textarea' },
    { f: 'disposisi', id: 'ffDisposisi', kind: 'textarea' },
    { f: 'wo',        id: 'ffWo',        kind: 'text'  },
    { f: 'batch',     id: 'ffBatch',     kind: 'select' },
    { f: 'good',      id: 'ffGood',      kind: 'text'  },
    { f: 'defect',    id: 'ffDefect',    kind: 'text'  },
  ];

  const currentRow = () => Rows.rows()[currentIndex] || null;

  const readField = (tr, f) => {
    const el = tr.querySelector(`[data-f="${f}"]`);
    return el ? el.value : '';
  };

  const writeField = (f, value, { commit } = {}) => {
    const tr = currentRow();
    if (!tr) return value;
    const el = tr.querySelector(`[data-f="${f}"]`);
    if (!el) return value;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    if (f === 'batch') el.dispatchEvent(new Event('change', { bubbles: true }));
    if (commit) el.dispatchEvent(new Event('focusout', { bubbles: true }));
    return el.value;
  };

  const applyFormCat = () => {
    const tr = currentRow();
    if (!State.el.formFullPanel) return;
    if (tr && tr.dataset.cat) State.el.formFullPanel.dataset.cat = tr.dataset.cat;
    else delete State.el.formFullPanel.dataset.cat;
  };

  /** Isi ulang opsi dropdown Batch supaya sama dengan daftar produk aktif saat ini. */
  const syncBatchOptions = (currentVal) => {
    const sel = State.el.ffBatch;
    if (!sel) return;
    const prods = Rows.getActiveProducts();
    sel.innerHTML = '<option value="">-- Pilih Produk --</option>' +
      prods.map(p => `<option value="${p}">${p}</option>`).join('');
    if (currentVal && prods.includes(currentVal)) sel.value = currentVal;
  };

  // ====== RENDER ======
  const render = () => {
    if (!State.el.formFullPanel) return;
    if (Rows.rows().length === 0) Rows.makeRow();
    const list = Rows.rows();
    currentIndex = Math.min(Math.max(currentIndex, 0), list.length - 1);
    const tr = list[currentIndex];
    if (!tr) return;

    syncBatchOptions(readField(tr, 'batch'));

    FIELD_MAP.forEach(({ f, id }) => {
      const target = State.el[id];
      if (target) target.value = readField(tr, f);
    });

    State.el.ffNavLabel.textContent = `Baris ${currentIndex + 1} dari ${list.length}`;
    State.el.ffPrev.disabled = currentIndex === 0;
    applyFormCat();
    setTimeout(() => {
      UI.autoResizeTextarea(State.el.ffKegiatan);
      UI.autoResizeTextarea(State.el.ffMasalah);
      UI.autoResizeTextarea(State.el.ffDisposisi);
    }, 0);
  };

  // ====== NAVIGASI ANTAR BARIS ======
  const goTo = (i, { create } = {}) => {
    const list = Rows.rows();
    if (i >= list.length) {
      if (create) {
        Rows.makeRow();
        Rows.updateRowNumbers();
        Calculation.recalc();
      } else {
        i = list.length - 1;
      }
    }
    if (i < 0) i = 0;
    currentIndex = i;
    render();
  };

  const commitCurrent = () => {
    writeField('mulai', State.el.ffMulai.value, { commit: true });
    writeField('panggil', State.el.ffPanggil.value, { commit: true });
    writeField('teknik', State.el.ffTeknik.value, { commit: true });
    writeField('selesai', State.el.ffSelesai.value, { commit: true });
  };

  /**
   * Wajib isi minimal Kode & Jam Mulai sebelum boleh pindah ke baris
   * berikutnya. Kalau salah satu/keduanya kosong: tandai invalid,
   * tampilkan peringatan, fokuskan ke kolom yang kosong, lalu batalkan
   * perpindahan baris.
   */
  const validateBeforeNext = () => {
    const kodeVal = State.el.ffKode.value.trim();
    const mulaiVal = State.el.ffMulai.value.trim();
    State.el.ffKode.classList.toggle('invalid', !kodeVal);
    State.el.ffMulai.classList.toggle('invalid', !mulaiVal);
    if (!kodeVal || !mulaiVal) {
      UI.toast('Kolom Kode & Jam Mulai belum terisi · minimal isi keduanya sebelum lanjut ⚠', true, 'warn');
      focusField(!kodeVal ? 'ffKode' : 'ffMulai');
      return false;
    }
    return true;
  };

  // ====== BINDINGS ======
  const bindNav = () => {
    State.el.ffPrev.addEventListener('click', () => {
      commitCurrent();
      goTo(currentIndex - 1);
      focusField('ffKode');
    });
    State.el.ffNext.addEventListener('click', () => {
      if (!validateBeforeNext()) return;
      commitCurrent();
      goTo(currentIndex + 1, { create: true });
      focusField('ffKode');
    });
    State.el.ffSave.addEventListener('click', () => {
      if (!validateBeforeNext()) return;
      commitCurrent();
      goTo(currentIndex + 1, { create: true });
      focusField('ffKode');
      UI.toast('Baris tersimpan · lanjut ke baris berikutnya');
    });
    if (State.el.ffDelete) {
      State.el.ffDelete.addEventListener('click', () => {
        const tr = currentRow();
        if (!tr) return;
        if (Rows.rows().length <= 1) {
          UI.toast('Minimal harus ada 1 baris', false, 'warn');
          return;
        }
        tr.remove();
        Rows.updateRowNumbers();
        Calculation.recalc();
        goTo(currentIndex); // tetap di posisi yang sama (kini terisi baris berikutnya)
        UI.toast('Baris dihapus 🗑');
      });
    }
  };

  const bindFields = () => {
    State.el.ffKode.addEventListener('input', () => {
      const v = State.el.ffKode.value.replace(/\D/g, '');
      State.el.ffKode.value = writeField('kode', v);
      applyFormCat();
      State.el.ffKode.classList.remove('invalid');
      // Max length 1 → begitu terisi, langsung lompat ke kolom Jam Mulai.
      if (v.length >= 1) focusNext('ffKode');
    });

    [['ffMulai','mulai'],['ffPanggil','panggil'],['ffTeknik','teknik'],['ffSelesai','selesai']].forEach(([id, f]) => {
      const el = State.el[id];
      el.addEventListener('input', () => {
        const masked = Utils.maskTime(el.value);
        el.value = writeField(f, masked);
        if (id === 'ffMulai') el.classList.remove('invalid');
        // Begitu format "HH:MM" lengkap (mis. "1730" → "17:30") → lompat otomatis.
        if (/^\d{2}:\d{2}$/.test(masked)) focusNext(id);
      });
      el.addEventListener('blur',  () => { el.value = writeField(f, el.value, { commit: true }); });
    });

    // ====== SMART BACKSPACE: kolom kosong + Backspace → mundur ke kolom sebelumnya ======
    FIELD_ORDER.forEach(id => {
      const el = State.el[id];
      if (!el || el.tagName !== 'INPUT') return;
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && el.value === '') {
          e.preventDefault();
          focusPrev(id);
        }
      });
    });

    State.el.ffDurasi.addEventListener('input', () => {
      writeField('durasi', State.el.ffDurasi.value);
    });

    [['ffKegiatan','kegiatan'],['ffMasalah','masalah'],['ffDisposisi','disposisi']].forEach(([id, f]) => {
      const el = State.el[id];
      el.addEventListener('input', () => {
        writeField(f, el.value);
        UI.autoResizeTextarea(el);
      });
    });

    State.el.ffWo.addEventListener('input', () => writeField('wo', State.el.ffWo.value));
    State.el.ffBatch.addEventListener('change', () => writeField('batch', State.el.ffBatch.value));
    State.el.ffGood.addEventListener('input', () => writeField('good', State.el.ffGood.value));
    State.el.ffDefect.addEventListener('input', () => writeField('defect', State.el.ffDefect.value));

    State.el.formFullPanel.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (['ffKegiatan','ffMasalah','ffDisposisi'].includes(e.target.id)) return; // biarkan Enter di textarea
      e.preventDefault();
      State.el.ffSave.click();
    });
  };

  const init = () => {
    if (!State.el.formFullPanel) return;
    bindNav();
    bindFields();
    if (State.el.ffKegiatan && typeof Suggest !== 'undefined') Suggest.attachGhost(State.el.ffKegiatan);
  };

  const resetAndRender = () => {
    currentIndex = 0;
    render();
  };

  return { init, render, resetAndRender };
})();
