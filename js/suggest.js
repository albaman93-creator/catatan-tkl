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

  // ====== DROPDOWN TAP-UNTUK-PILIH (kolom Kegiatan) ======
  // Sama seperti dropdown kode produk, tapi sumbernya CONFIG.KEGIATAN_SUGGESTIONS
  // dan penyisipannya per-kata-aktif (segmen), bukan seluruh isi kotak — jadi
  // tetap jalan walau sudah ada kegiatan sebelumnya (dipisah koma). Dibuat
  // karena HP tidak punya tombol Tab, jadi user harus bisa pilih dengan tap.
  const filterActivities = (segment) => {
    const q = (segment || '').trim().toLowerCase();
    const all = [...new Set(getSuggestions())];
    if (!q) return all.slice(0, 12);
    return all.filter(s => s.toLowerCase().startsWith(q) && s.toLowerCase() !== q).slice(0, 12);
  };

  let _actDrop = null;
  let _actActiveInput = null;
  let _actHighlight = -1;
  let _actSegStart = 0;

  const ensureActDropdown = () => {
    if (_actDrop) return _actDrop;
    _actDrop = document.createElement('div');
    _actDrop.className = 'prod-suggest-drop';
    _actDrop.setAttribute('role', 'listbox');
    _actDrop.hidden = true;
    document.body.appendChild(_actDrop);
    document.addEventListener('mousedown', (e) => {
      if (!_actDrop || _actDrop.hidden) return;
      if (_actDrop.contains(e.target)) return;
      if (_actActiveInput && _actActiveInput === e.target) return;
      hideActDropdown();
    });
    return _actDrop;
  };

  const positionActDropdown = (input) => {
    const drop = ensureActDropdown();
    const r = input.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const maxH = Math.min(220, Math.max(120, spaceBelow - 8));
    drop.style.position = 'fixed';
    drop.style.left = Math.max(4, r.left) + 'px';
    drop.style.width = Math.max(r.width, 160) + 'px';
    drop.style.maxHeight = maxH + 'px';
    if (spaceBelow < 100 && r.top > spaceBelow) {
      drop.style.top = 'auto';
      drop.style.bottom = (window.innerHeight - r.top + 4) + 'px';
    } else {
      drop.style.bottom = 'auto';
      drop.style.top = (r.bottom + 4) + 'px';
    }
  };

  const hideActDropdown = () => {
    if (_actDrop) _actDrop.hidden = true;
    _actActiveInput = null;
    _actHighlight = -1;
  };

  const selectActivity = (el, text, segStart) => {
    if (!el || !text) return;
    const before = el.value.slice(0, segStart);
    el.value = before + text;
    el.selectionStart = el.selectionEnd = el.value.length;
    el.focus();
    hideActDropdown();
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const renderActDropdown = (el, items, segStart) => {
    const drop = ensureActDropdown();
    _actActiveInput = el;
    _actSegStart = segStart;
    _actHighlight = items.length ? 0 : -1;
    if (!items.length) {
      drop.hidden = true;
      return;
    }
    drop.innerHTML = items.map((text, i) =>
      `<button type="button" class="prod-suggest-item${i === 0 ? ' on' : ''}" role="option" data-text="${Utils.escapeHtml(text)}">${Utils.escapeHtml(text)}</button>`
    ).join('');
    drop.querySelectorAll('.prod-suggest-item').forEach(btn => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectActivity(el, btn.getAttribute('data-text'), segStart);
      });
    });
    positionActDropdown(el);
    drop.hidden = false;
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
      let segment = '';

      if (document.activeElement === el && atEnd) {
        const info = getActiveSegment(typed);
        segment = info.segment;
        segStart = info.segStart;
        match = bestMatch(segment);
      }

      currentSuggestion = match || '';
      currentSegStart = segStart;

      if (match) {
        const seg = typed.slice(segStart);
        const rest = match.slice(seg.length);
        ghost.innerHTML =
          `<span class="ghost-typed">${Utils.escapeHtml(typed)}</span>` +
          `<span class="ghost-suggest">${Utils.escapeHtml(rest)}</span>`;
      } else {
        ghost.textContent = '';
      }

      // Dropdown tap-untuk-pilih — supaya bisa dipakai tanpa tombol Tab
      // (penting di HP, karena keyboard mobile tidak punya tombol Tab).
      if (document.activeElement === el && atEnd) {
        renderActDropdown(el, filterActivities(segment), segStart);
      } else {
        hideActDropdown();
      }
    };

    const acceptSuggestion = () => {
      const before = el.value.slice(0, currentSegStart);
      el.value = before + currentSuggestion;
      el.selectionStart = el.selectionEnd = el.value.length;
      currentSuggestion = '';
      ghost.textContent = '';
      hideActDropdown();
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };

    el.addEventListener('input', render);
    el.addEventListener('focus', render);
    el.addEventListener('click', render);   // klik untuk pindah posisi kursor juga perlu re-cek
    el.addEventListener('keyup', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) render();
    });
    el.addEventListener('blur', () => {
      ghost.textContent = '';
      // Delay dikit: kalau blur ini dipicu oleh tap di item dropdown, biar
      // handler klik itemnya sempat jalan dulu sebelum dropdown ditutup.
      setTimeout(() => { if (document.activeElement !== el) hideActDropdown(); }, 150);
    });
    el.addEventListener('keydown', (e) => {
      // Navigasi dropdown (panah atas/bawah + Enter) kalau dropdown sedang tampil
      if (_actDrop && !_actDrop.hidden && _actActiveInput === el) {
        const items = [..._actDrop.querySelectorAll('.prod-suggest-item')];
        if (items.length) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            _actHighlight = (_actHighlight + 1) % items.length;
            items.forEach((b, i) => b.classList.toggle('on', i === _actHighlight));
            items[_actHighlight].scrollIntoView({ block: 'nearest' });
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            _actHighlight = (_actHighlight - 1 + items.length) % items.length;
            items.forEach((b, i) => b.classList.toggle('on', i === _actHighlight));
            items[_actHighlight].scrollIntoView({ block: 'nearest' });
            return;
          }
          if (e.key === 'Enter' && _actHighlight >= 0) {
            e.preventDefault();
            selectActivity(el, items[_actHighlight].getAttribute('data-text'), _actSegStart);
            return;
          }
        }
      }

      if (!currentSuggestion) {
        if (e.key === 'Escape') hideActDropdown();
        return;
      }
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
        hideActDropdown();
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

  // ====== AUTOCOMPLETE KODE PRODUK (dropdown, kolom Nama Produk) ======
  // Beda dari ghost-text di atas: ini dropdown pilihan yang tampil begitu
  // kursor fokus di kolom Nama Produk (Sheet + Master Produk), difilter
  // sesuai huruf yang diketik, dan tinggal diklik. Daftar kode ikut
  // Tahapan Proses yang aktif (dropdown "Tahapan" di Data & Penyimpanan) —
  // lihat CONFIG.PRODUCT_CODE_SUGGESTIONS di js/config.js.

  const getActiveStage = () => {
    // Utama: dropdown fStage; cadangan: tab sheet yang aktif
    let stage = (State.el.fStage && State.el.fStage.value) || '';
    if (!stage) {
      const on = document.querySelector('.sheet-stage-btn.on, .sheet-stage-btn[aria-selected="true"]');
      if (on) stage = on.getAttribute('data-sheet-stage') || '';
    }
    return stage || 'mixing';
  };

  const FALLBACK_PRODUCT_CODES = {
    mixing:  ['VTTS1 Mixing L','VTTS1 Loading L','VKAM1','VLON1','VMON1','VTRA1','VCLN2','VMNT1','VTRM1','VPEL1','ITTC2','VTTC1'],
    filling: ['VTTS1','VKAM1','VLON1','VMON1','VTRA1','VCLN2','VMNT1','VTRM1','VPEL1','ITTC2','VTTC1'],
    steril:  ['VTTS1','VKAM1','VLON1','VMON1','VTRA1','VCLN2','VMNT1','VTRM1','VPEL1','ITTC2','VTTC1'],
    visual:  ['VTTSA','VKAMA','VLONA','VMONA','VTRAB','VCLNB','VMNTA','VTRME','VPELA','ITTCB','VTTCA'],
    kemas:   ['VTTSA','VKAMA','VLONA','VMONA','VTRAB','VCLNB','VMNTA','VTRME','VPELA','ITTCB','VTTCA'],
  };

  const getProductCodes = () => {
    const stage = getActiveStage();
    const map = (typeof CONFIG !== 'undefined' && CONFIG.PRODUCT_CODE_SUGGESTIONS)
      || FALLBACK_PRODUCT_CODES;
    const list = map[stage] || map.mixing || FALLBACK_PRODUCT_CODES.mixing;
    return [...new Set(list)];
  };

  const filterProductCodes = (query) => {
    const q = (query || '').trim().toUpperCase();
    const all = getProductCodes();
    if (!q) return all.slice(0, 12);
    return all.filter(code => code.toUpperCase().startsWith(q)).slice(0, 12);
  };

  let _prodDrop = null;
  let _prodActiveInput = null;
  let _prodHighlight = -1;

  const ensureProdDropdown = () => {
    if (_prodDrop) return _prodDrop;
    _prodDrop = document.createElement('div');
    _prodDrop.className = 'prod-suggest-drop';
    _prodDrop.setAttribute('role', 'listbox');
    _prodDrop.hidden = true;
    document.body.appendChild(_prodDrop);
    document.addEventListener('mousedown', (e) => {
      if (!_prodDrop || _prodDrop.hidden) return;
      if (_prodDrop.contains(e.target)) return;
      if (_prodActiveInput && _prodActiveInput === e.target) return;
      hideProdDropdown();
    });
    return _prodDrop;
  };

  const positionProdDropdown = (input) => {
    const drop = ensureProdDropdown();
    const r = input.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const maxH = Math.min(220, Math.max(120, spaceBelow - 8));
    drop.style.position = 'fixed';
    drop.style.left = Math.max(4, r.left) + 'px';
    drop.style.width = Math.max(r.width, 140) + 'px';
    drop.style.maxHeight = maxH + 'px';
    if (spaceBelow < 100 && r.top > spaceBelow) {
      drop.style.top = 'auto';
      drop.style.bottom = (window.innerHeight - r.top + 4) + 'px';
    } else {
      drop.style.bottom = 'auto';
      drop.style.top = (r.bottom + 4) + 'px';
    }
  };

  const hideProdDropdown = () => {
    if (_prodDrop) _prodDrop.hidden = true;
    _prodActiveInput = null;
    _prodHighlight = -1;
  };

  const selectProductCode = (input, code) => {
    if (!input || !code) return;
    const val = input.value || '';
    const m = val.match(/^([A-Za-z0-9]*)(.*)$/);
    const rest = m ? m[2] : '';
    const next = code + rest;
    input.value = next;
    const pos = code.length;
    input.setSelectionRange(pos, pos);
    input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    hideProdDropdown();
  };

  const renderProdDropdown = (input, items) => {
    const drop = ensureProdDropdown();
    _prodActiveInput = input;
    _prodHighlight = items.length ? 0 : -1;
    if (!items.length) {
      drop.hidden = true;
      return;
    }
    drop.innerHTML = items.map((code, i) =>
      `<button type="button" class="prod-suggest-item${i === 0 ? ' on' : ''}" role="option" data-code="${code}">${code}</button>`
    ).join('');
    drop.querySelectorAll('.prod-suggest-item').forEach(btn => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectProductCode(input, btn.getAttribute('data-code'));
      });
    });
    positionProdDropdown(input);
    drop.hidden = false;
  };

  const refreshProdDropdown = (input) => {
    const val = input.value || '';
    const caret = typeof input.selectionStart === 'number' ? input.selectionStart : val.length;
    // Setelah spasi = user sedang ketik bebas di belakang kode
    const spaceIdx = val.search(/\s/);
    if (spaceIdx >= 0 && caret > spaceIdx) {
      hideProdDropdown();
      return;
    }
    const beforeCaret = val.slice(0, caret);
    const token = (beforeCaret.match(/^[A-Za-z0-9]*/) || [''])[0];
    const items = filterProductCodes(token);
    if (items.length === 1 && items[0].toUpperCase() === token.toUpperCase() && token.length > 0) {
      hideProdDropdown();
      return;
    }
    renderProdDropdown(input, items);
  };

  const attachProductAutocomplete = (el) => {
    if (!el || el.dataset.prodSuggestBound === '1') return;
    el.dataset.prodSuggestBound = '1';
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('spellcheck', 'false');

    el.addEventListener('focus', () => refreshProdDropdown(el));
    el.addEventListener('input', () => refreshProdDropdown(el));
    el.addEventListener('click', () => refreshProdDropdown(el));

    el.addEventListener('keydown', (e) => {
      if (!_prodDrop || _prodDrop.hidden || _prodActiveInput !== el) {
        if (e.key === 'Escape') hideProdDropdown();
        return;
      }
      const items = [..._prodDrop.querySelectorAll('.prod-suggest-item')];
      if (!items.length) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        _prodHighlight = (_prodHighlight + 1) % items.length;
        items.forEach((b, i) => b.classList.toggle('on', i === _prodHighlight));
        items[_prodHighlight].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        _prodHighlight = (_prodHighlight - 1 + items.length) % items.length;
        items.forEach((b, i) => b.classList.toggle('on', i === _prodHighlight));
        items[_prodHighlight].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (_prodHighlight >= 0 && items[_prodHighlight]) {
          e.preventDefault();
          selectProductCode(el, items[_prodHighlight].getAttribute('data-code'));
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        hideProdDropdown();
      }
    });

    el.addEventListener('blur', () => {
      setTimeout(() => {
        if (document.activeElement !== el) hideProdDropdown();
      }, 150);
    });
  };

  const attachProductAll = (selector) => {
    document.querySelectorAll(selector).forEach(attachProductAutocomplete);
  };

  // Delegasi global: tetap jalan meski input di-render ulang / user belum attach manual
  const isProductNameInput = (el) => {
    if (!el || el.tagName !== 'INPUT') return false;
    if (el.type && el.type !== 'text' && el.type !== 'search') return false;
    const id = el.id || '';
    if (/^prodName[123]$/.test(id) || /^masterProdName[123]$/.test(id)) return true;
    if (el.classList.contains('sheet-product-name')) return true;
    if (el.dataset && el.dataset.field === 'name' && el.closest('.sheet-product-slot, .sheet-product-bar, .product-grid')) return true;
    return false;
  };

  const bindProductDelegation = () => {
    if (document.documentElement.dataset.prodSuggestDelegation === '1') return;
    document.documentElement.dataset.prodSuggestDelegation = '1';

    document.addEventListener('focusin', (e) => {
      const el = e.target;
      if (!isProductNameInput(el)) return;
      attachProductAutocomplete(el);
      refreshProdDropdown(el);
    }, true);

    document.addEventListener('input', (e) => {
      const el = e.target;
      if (!isProductNameInput(el)) return;
      attachProductAutocomplete(el);
      refreshProdDropdown(el);
    }, true);
  };

  // Auto-bind saat script termuat
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindProductDelegation);
  } else {
    bindProductDelegation();
  }

  return {
    attachGhost, attachAll, getSuggestions,
    attachProductAll,
  };
})();
