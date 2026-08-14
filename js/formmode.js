/**
 * FORMMODE.JS
 * Mode Form Input: menampilkan satu baris log sheet sebagai kartu input
 * besar (Kode, Jam Mulai, Kegiatan, Good, Defect) dengan navigator baris,
 * supaya lebih nyaman diisi di layar kecil / sambil berdiri di lini produksi.
 *
 * Form ini TIDAK menyimpan data sendiri — setiap perubahan langsung ditulis
 * ke input asli pada baris tabel (data source tunggal), lalu event input/
 * focusout asli ikut dipicu supaya semua logika yang sudah ada (masking jam,
 * pewarnaan kategori kode, auto-isi jam selesai, recalculation OEE) tetap
 * berjalan tanpa duplikasi logika.
 */
const FormMode = (() => {
  'use strict';

  let currentIndex = 0;

  // ====== URUTAN FOKUS FIELD (untuk auto-advance & smart backspace) ======
  const FIELD_ORDER = ['fpKode', 'fpMulai', 'fpKegiatan', 'fpGood', 'fpDefect'];

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

  // ====== HELPER: baca / tulis field pada baris tabel asli ======
  const currentRow = () => Rows.rows()[currentIndex] || null;

  const readField = (tr, f) => {
    const el = tr.querySelector(`[data-f="${f}"]`);
    return el ? el.value : '';
  };

  /**
   * Tulis nilai ke input asli pada baris, picu event yang relevan supaya
   * logika existing (masking, kategori, recalc) tetap jalan, lalu
   * kembalikan nilai akhir (mungkin sudah dinormalisasi/di-mask).
   */
  const writeField = (f, value, { commit } = {}) => {
    const tr = currentRow();
    if (!tr) return value;
    const el = tr.querySelector(`[data-f="${f}"]`);
    if (!el) return value;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    if (commit) el.dispatchEvent(new Event('focusout', { bubbles: true }));
    return el.value;
  };

  const applyFormCat = () => {
    const tr = currentRow();
    if (!State.el.formPanel) return;
    if (tr && tr.dataset.cat) State.el.formPanel.dataset.cat = tr.dataset.cat;
    else delete State.el.formPanel.dataset.cat;
  };

  // ====== RENDER: tampilkan baris aktif ke form ======
  const render = () => {
    if (Rows.rows().length === 0) Rows.makeRow();
    const list = Rows.rows();
    currentIndex = Math.min(Math.max(currentIndex, 0), list.length - 1);
    const tr = list[currentIndex];
    if (!tr) return;

    State.el.fpKode.value     = readField(tr, 'kode');
    State.el.fpMulai.value    = readField(tr, 'mulai');
    State.el.fpKegiatan.value = readField(tr, 'kegiatan');
    State.el.fpGood.value     = readField(tr, 'good');
    State.el.fpDefect.value   = readField(tr, 'defect');

    State.el.fpNavLabel.textContent = `Baris ${currentIndex + 1} dari ${list.length}`;
    State.el.fpPrev.disabled = currentIndex === 0;
    applyFormCat();
    setTimeout(() => UI.autoResizeTextarea(State.el.fpKegiatan), 0);
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

  /** Pastikan nilai jam mulai dinormalisasi (spt saat blur) sebelum pindah baris. */
  const commitCurrent = () => {
    writeField('mulai', State.el.fpMulai.value, { commit: true });
  };

  /**
   * Wajib isi minimal Kode & Jam Mulai sebelum boleh pindah ke baris
   * berikutnya. Kalau salah satu/keduanya kosong: tandai invalid,
   * tampilkan peringatan, fokuskan ke kolom yang kosong, lalu batalkan
   * perpindahan baris.
   */
  const validateBeforeNext = () => {
    const kodeVal = State.el.fpKode.value.trim();
    const mulaiVal = State.el.fpMulai.value.trim();
    State.el.fpKode.classList.toggle('invalid', !kodeVal);
    State.el.fpMulai.classList.toggle('invalid', !mulaiVal);
    if (!kodeVal || !mulaiVal) {
      UI.toast('Kolom Kode & Jam Mulai belum terisi · minimal isi keduanya sebelum lanjut ⚠', true, 'warn');
      focusField(!kodeVal ? 'fpKode' : 'fpMulai');
      return false;
    }
    return true;
  };

  // ====== BINDINGS ======
  const bindNav = () => {
    State.el.fpPrev.addEventListener('click', () => {
      commitCurrent();
      goTo(currentIndex - 1);
      focusField('fpKode');
    });
    State.el.fpNext.addEventListener('click', () => {
      if (!validateBeforeNext()) return;
      commitCurrent();
      goTo(currentIndex + 1, { create: true });
      focusField('fpKode');
    });
    State.el.fpSave.addEventListener('click', () => {
      if (!validateBeforeNext()) return;
      commitCurrent();
      goTo(currentIndex + 1, { create: true });
      focusField('fpKode');
      UI.toast('Baris tersimpan · lanjut ke baris berikutnya');
    });
  };

  const bindFields = () => {
    State.el.fpKode.addEventListener('input', () => {
      const v = State.el.fpKode.value.replace(/\D/g, '');
      State.el.fpKode.value = writeField('kode', v);
      applyFormCat();
      State.el.fpKode.classList.remove('invalid');
      // Max length 1 → begitu terisi, langsung lompat ke kolom Jam Mulai.
      if (v.length >= 1) focusNext('fpKode');
    });

    State.el.fpMulai.addEventListener('input', () => {
      const masked = Utils.maskTime(State.el.fpMulai.value);
      State.el.fpMulai.value = writeField('mulai', masked);
      State.el.fpMulai.classList.remove('invalid');
      // Begitu format "HH:MM" lengkap (mis. "1730" → "17:30") → lompat otomatis.
      if (/^\d{2}:\d{2}$/.test(masked)) focusNext('fpMulai');
    });
    State.el.fpMulai.addEventListener('blur', () => {
      State.el.fpMulai.value = writeField('mulai', State.el.fpMulai.value, { commit: true });
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

    State.el.fpKegiatan.addEventListener('input', () => {
      writeField('kegiatan', State.el.fpKegiatan.value);
      UI.autoResizeTextarea(State.el.fpKegiatan);
    });

    State.el.fpGood.addEventListener('input', () => {
      writeField('good', State.el.fpGood.value);
    });
    State.el.fpDefect.addEventListener('input', () => {
      writeField('defect', State.el.fpDefect.value);
    });

    // Enter di field manapun (kecuali textarea Kegiatan) → simpan & lanjut baris
    State.el.formPanel.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (e.target === State.el.fpKegiatan) return; // biarkan Enter buat baris baru di textarea
      e.preventDefault();
      State.el.fpSave.click();
    });
  };

  const init = () => {
    if (!State.el.formPanel) return;
    bindNav();
    bindFields();
  };

  /** Dipanggil saat data tabel diganti total (ganti tanggal/shift/dsb). */
  const resetAndRender = () => {
    currentIndex = 0;
    render();
  };

  return { init, render, resetAndRender };
})();
