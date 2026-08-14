/**
 * SUGGEST.JS
 * Sugesti "ghost text" untuk kolom Kegiatan — muncul di 3 tempat sekaligus
 * (sel tabel langsung, kotak Isi Massal, dan Form Input) karena semuanya
 * cukup memanggil Suggest.attachGhost(elemen).
 *
 * Cara kerja: sambil mengetik, kalau teks yang sudah diketik (di kata/frasa
 * yang SEDANG aktif — dipisah tanda koma "," titik-koma ";" atau baris baru)
 * cocok dengan AWALAN salah satu daftar sugesti untuk Tahapan Proses yang
 * sedang aktif (Mixing/Filling/dst — lihat #fStage), sisa katanya
 * ditampilkan abu-abu transparan tepat di belakang kursor (seperti
 * autocomplete Gmail/VSCode). Karena dihitung per-kata-aktif (bukan dari
 * awal kotak), sugesti tetap muncul walau sudah mengetik kata/kegiatan ke-2,
 * ke-3, dst — asal dipisah koma/baris baru dari kata sebelumnya, misal:
 * "Loading Lot A, Loading Lot B" → sugesti tetap jalan untuk "Loading Lot B".
 * Tekan Tab atau → (panah kanan, saat kursor di ujung teks) untuk menerima
 * sugesti; Esc untuk membatalkan.
 *
 * Daftar sugesti ada di CONFIG.KEGIATAN_SUGGESTIONS (js/config.js) — cukup
 * tambah/ubah teks di sana, tidak perlu sentuh file ini.
 */
const Suggest = (() => {
  'use strict';

  // Pemisah antar-kegiatan dalam satu kotak yang sama (koma, titik-koma, baris baru)
  const SEGMENT_DELIMS = /[,;\n]/;

  // ====== DAFTAR SUGESTI SESUAI TAHAPAN PROSES AKTIF ======
  const getSuggestions = () => {
    const stage = (State.el.fStage && State.el.fStage.value) || '';
    const list = (CONFIG.KEGIATAN_SUGGESTIONS && CONFIG.KEGIATAN_SUGGESTIONS[stage]) || [];
    const common = (CONFIG.KEGIATAN_SUGGESTIONS && CONFIG.KEGIATAN_SUGGESTIONS.common) || [];
    return [...list, ...common];
  };

  /**
   * Ambil "kata/frasa yang sedang aktif diketik" dari seluruh isi kotak —
   * yaitu bagian setelah tanda pemisah (koma/titik-koma/baris baru) TERAKHIR,
   * spasi di depannya dibuang. segStart = posisi awal frasa ini di `value`
   * asli (dipakai nanti untuk menyisipkan sugesti di tempat yang tepat).
   */
  const getActiveSegment = (value) => {
    let lastDelimIdx = -1;
    for (let i = value.length - 1; i >= 0; i--) {
      if (SEGMENT_DELIMS.test(value[i])) { lastDelimIdx = i; break; }
    }
    let segStart = lastDelimIdx + 1;
    const rawSeg = value.slice(segStart);
    const leadingWs = (rawSeg.match(/^\s*/) || [''])[0].length;
    segStart += leadingWs;
    return { segStart, segment: value.slice(segStart) };
  };

  // Cari sugesti pertama yang diawali oleh kata/frasa aktif (case-insensitive)
  const bestMatch = (segment) => {
    if (!segment) return null;
    const lower = segment.toLowerCase();
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
    let currentSegStart = 0;

    const render = () => {
      syncMetrics(el, ghost);
      const typed = el.value;
      // Sugesti cuma ditampilkan kalau kursor persis di ujung teks — supaya
      // posisi teks abu-abu (yang selalu digambar setelah SELURUH isi kotak)
      // tidak menyesatkan saat user sedang menyunting di tengah teks.
      const atEnd = el.selectionStart === typed.length && el.selectionEnd === typed.length;
      let match = null;
      let segStart = typed.length;

      if (document.activeElement === el && atEnd) {
        const info = getActiveSegment(typed);
        match = bestMatch(info.segment);
        segStart = info.segStart;
      }

      currentSuggestion = match || '';
      currentSegStart = segStart;

      if (match) {
        const segment = typed.slice(segStart);
        const rest = match.slice(segment.length);
        ghost.innerHTML =
          `<span class="ghost-typed">${Utils.escapeHtml(typed)}</span>` +
          `<span class="ghost-suggest">${Utils.escapeHtml(rest)}</span>`;
      } else {
        ghost.textContent = '';
      }
    };

    const acceptSuggestion = () => {
      const before = el.value.slice(0, currentSegStart);
      el.value = before + currentSuggestion;
      el.selectionStart = el.selectionEnd = el.value.length;
      currentSuggestion = '';
      ghost.textContent = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };

    el.addEventListener('input', render);
    el.addEventListener('focus', render);
    el.addEventListener('click', render);   // klik untuk pindah posisi kursor juga perlu re-cek
    el.addEventListener('keyup', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) render();
    });
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
