/**
 * SUGGEST.JS
 * Sugesti "ghost text" untuk kolom Kegiatan — muncul di 3 tempat sekaligus
 * (sel tabel langsung, kotak Isi Massal, dan Form Input) karena semuanya
 * cukup memanggil Suggest.attachGhost(elemen).
 *
 * Cara kerja: sambil mengetik, kalau teks yang sudah diketik cocok dengan
 * AWALAN salah satu daftar sugesti untuk Tahapan Proses yang sedang aktif
 * (Mixing/Filling/dst — lihat #fStage), sisa katanya ditampilkan abu-abu
 * transparan tepat di belakang kursor (seperti autocomplete Gmail/VSCode).
 * Tekan Tab atau → (panah kanan, saat kursor di ujung teks) untuk menerima
 * sugesti; Esc untuk membatalkan.
 *
 * Daftar sugesti ada di CONFIG.KEGIATAN_SUGGESTIONS (js/config.js) — cukup
 * tambah/ubah teks di sana, tidak perlu sentuh file ini.
 */
const Suggest = (() => {
  'use strict';

  // ====== DAFTAR SUGESTI SESUAI TAHAPAN PROSES AKTIF ======
  const getSuggestions = () => {
    const stage = (State.el.fStage && State.el.fStage.value) || '';
    const list = (CONFIG.KEGIATAN_SUGGESTIONS && CONFIG.KEGIATAN_SUGGESTIONS[stage]) || [];
    const common = (CONFIG.KEGIATAN_SUGGESTIONS && CONFIG.KEGIATAN_SUGGESTIONS.common) || [];
    return [...list, ...common];
  };

  // Cari sugesti pertama yang diawali oleh teks yang sudah diketik (case-insensitive)
  const bestMatch = (typed) => {
    if (!typed) return null;
    const lower = typed.toLowerCase();
    const list = getSuggestions();
    return list.find(s => s.toLowerCase().startsWith(lower) && s.toLowerCase() !== lower) || null;
  };

  // Salin metrik visual (font, padding, dsb) dari elemen asli ke layer ghost
  // supaya teks abu-abu presis nyambung di posisi yang sama.
  const syncMetrics = (el, ghost) => {
    const cs = getComputedStyle(el);
    [
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
      'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing',
      'boxSizing', 'textAlign', 'textTransform'
    ].forEach(p => { ghost.style[p] = cs[p]; });
    ghost.style.width = el.offsetWidth + 'px';
    ghost.style.height = el.offsetHeight + 'px';
  };

  /**
   * Pasang sugesti ghost-text ke satu <input> atau <textarea>.
   * Aman dipanggil berkali-kali pada elemen yang sama (idempotent).
   */
  const attachGhost = (el) => {
    if (!el || el.dataset.ghostAttached) return;
    el.dataset.ghostAttached = '1';

    // Bungkus elemen dengan wrapper posisi relatif (kalau induknya belum
    // cocok, biar layer ghost bisa presisi menumpuk di atasnya).
    const wrap = document.createElement('span');
    wrap.className = 'ghost-wrap';
    el.parentNode.insertBefore(wrap, el);
    wrap.appendChild(el);

    const ghost = document.createElement('div');
    ghost.className = 'ghost-layer';
    ghost.setAttribute('aria-hidden', 'true');
    wrap.appendChild(ghost);

    let currentSuggestion = '';

    const render = () => {
      syncMetrics(el, ghost);
      const typed = el.value;
      const match = (document.activeElement === el) ? bestMatch(typed) : null;
      currentSuggestion = match || '';
      if (match) {
        const rest = match.slice(typed.length);
        ghost.innerHTML =
          `<span class="ghost-typed">${Utils.escapeHtml(typed)}</span>` +
          `<span class="ghost-suggest">${Utils.escapeHtml(rest)}</span>`;
      } else {
        ghost.textContent = '';
      }
    };

    const acceptSuggestion = () => {
      el.value = currentSuggestion;
      el.selectionStart = el.selectionEnd = el.value.length;
      currentSuggestion = '';
      ghost.textContent = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };

    el.addEventListener('input', render);
    el.addEventListener('focus', render);
    el.addEventListener('blur', () => { ghost.textContent = ''; });
    el.addEventListener('keydown', (e) => {
      if (!currentSuggestion) return;
      const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
      if (e.key === 'Tab' && atEnd) {
        e.preventDefault();
        acceptSuggestion();
      } else if (e.key === 'ArrowRight' && atEnd) {
        e.preventDefault();
        acceptSuggestion();
      } else if (e.key === 'Escape') {
        currentSuggestion = '';
        ghost.textContent = '';
      }
    });

    // Textarea kegiatan di tabel bisa berubah tinggi (auto-resize) — layer
    // ghost ikut menyesuaikan supaya tetap presisi menumpuk.
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => syncMetrics(el, ghost));
      ro.observe(el);
    }
  };

  /** Pasang ghost-text ke semua elemen yang cocok sebuah selector, sekali jalan. */
  const attachAll = (selector) => {
    document.querySelectorAll(selector).forEach(attachGhost);
  };

  return { attachGhost, attachAll, getSuggestions };
})();
