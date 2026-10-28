/**
 * SUGGEST.JS
 * Sugesti "ghost text" untuk kolom Kegiatan — muncul di 3 tempat sekaligus
 * (sel tabel langsung, kotak Isi Massal, dan Form Input) karena semuanya
 * cukup memanggil Suggest.attachGhost(elemen).
 *
 * Cara kerja: sambil mengetik, teks di kata/frasa aktif (dipisah koma ","
 * titik-koma ";" atau baris baru) dicocokkan ke daftar sugesti Tahapan
 * Proses aktif (#fStage). Pencarian mendukung:
 *   (1) awalan frasa  — "Fil" → "Filling Lot A"  (ghost text + dropdown)
 *   (2) awalan kata di tengah — "C" → "Line Clearance", "Filling Lot C"
 *   (3) substring di mana saja — "ear" → "Line Clearance"  (dropdown)
 * Ghost text abu-abu hanya untuk match awalan (aman secara visual);
 * match kata-tengah dipilih lewat dropdown atau Tab. Karena dihitung
 * per-segmen aktif, sugesti tetap jalan untuk kegiatan ke-2/ke-3, misal:
 * "Loading Lot A, Loading Lot B". Tab / → menerima sugesti; Esc batal.
 *
 * Daftar sugesti ada di CONFIG.KEGIATAN_SUGGESTIONS (js/config.js) — cukup
 * tambah/ubah teks di sana, tidak perlu sentuh file ini.
 */
const Suggest = (() => {
  'use strict';

  // Pemisah antar-kegiatan dalam satu kotak yang sama (koma, titik-koma, baris baru)
  const SEGMENT_DELIMS = /[,;\n]/;

  // ====== DAFTAR SUGESTI SESUAI TAHAPAN PROSES AKTIF ======
  const CUSTOM_KEY = 'TKL_KEGIATAN_SUGGESTIONS_CUSTOM_V2';
  const REMOTE_TABLE = 'kegiatan_suggestions';
  let remoteSuggestions = [];
  let remoteReady = false;
  let remoteLoading = false;

  const loadCustomSuggestions = () => {
    try {
      const raw = localStorage.getItem(CUSTOM_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(v => typeof v === 'string' && v.trim()) : [];
    } catch (_) { return []; }
  };

  const saveCustomSuggestions = (list) => {
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify([...new Set(list.map(v => v.trim()).filter(Boolean))])); } catch (_) {}
  };

  const getStage = () => (State.el.fStage && State.el.fStage.value) || 'common';

  const getSuggestions = () => {
    const stage = getStage();
    const list = (CONFIG.KEGIATAN_SUGGESTIONS && CONFIG.KEGIATAN_SUGGESTIONS[stage]) || [];
    const common = (CONFIG.KEGIATAN_SUGGESTIONS && CONFIG.KEGIATAN_SUGGESTIONS.common) || [];
    const remote = remoteSuggestions
      .filter(x => x.stage === 'common' || x.stage === stage)
      .map(x => x.suggestion);
    const aliasCanon = Object.values(CONFIG.KEGIATAN_ALIASES || {});
    return [...new Set([...list, ...common, ...aliasCanon, ...loadCustomSuggestions(), ...remote])];
  };

  /**
   * Standarisasi kosa kata (Issue #9).
   * Alias → bentuk baku. Return teks baru, atau null jika tidak berubah.
   */
  const normalizeKegiatanText = (raw) => {
    if (!raw || typeof raw !== 'string') return null;
    const aliases = CONFIG.KEGIATAN_ALIASES || {};
    if (!Object.keys(aliases).length) return null;

    const parts = [];
    let changed = false;
    let last = 0;
    const re = /[,;\n]/g;
    let m;
    const pushSeg = (seg) => {
      const lead = (seg.match(/^\s*/) || [''])[0];
      const trail = (seg.match(/\s*$/) || [''])[0];
      const core = seg.trim();
      if (!core) { parts.push(seg); return; }
      const key = core.toLowerCase().replace(/\s+/g, ' ');
      if (aliases[key]) {
        parts.push(lead + aliases[key] + trail);
        changed = true;
      } else {
        parts.push(seg);
      }
    };
    const str = raw;
    while ((m = re.exec(str)) !== null) {
      pushSeg(str.slice(last, m.index));
      parts.push(m[0]);
      last = m.index + m[0].length;
    }
    pushSeg(str.slice(last));
    return changed ? parts.join('') : null;
  };

  /** Resolve alias → bentuk baku untuk matching sugesti. */
  const resolveAlias = (q) => {
    const key = String(q || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const aliases = CONFIG.KEGIATAN_ALIASES || {};
    return aliases[key] || null;
  };

  const getClient = () => (typeof SupabaseClient !== 'undefined' && SupabaseClient.getClient)
    ? SupabaseClient.getClient() : null;

  const refreshRemoteSuggestions = async () => {
    const client = getClient();
    if (!client || remoteLoading) return remoteSuggestions;
    remoteLoading = true;
    try {
      const { data, error } = await client
        .from(REMOTE_TABLE)
        .select('id,stage,suggestion,created_at')
        .order('suggestion', { ascending: true });
      if (error) throw error;
      remoteSuggestions = Array.isArray(data) ? data : [];
      remoteReady = true;
      return remoteSuggestions;
    } catch (err) {
      console.warn('Sugesti Supabase tidak dapat dimuat:', err);
      return remoteSuggestions;
    } finally {
      remoteLoading = false;
    }
  };

  const initRemote = () => {
    // Supabase diinisialisasi setelah suggest.js dimuat, jadi beri kesempatan
    // satu tick dan retry singkat jika client belum siap.
    const run = () => refreshRemoteSuggestions();
    if (getClient()) run();
    else setTimeout(run, 300);
  };

  const addSuggestion = (text) => {
    const value = String(text || '').trim().replace(/\s+/g, ' ');
    if (!value) return false;
    const exists = getSuggestions().some(v => v.toLowerCase() === value.toLowerCase());
    if (exists) return false;
    const stage = getStage();
    const list = loadCustomSuggestions();
    list.push(value);
    saveCustomSuggestions(list);
    remoteSuggestions.push({ id: `local-${Date.now()}`, stage, suggestion: value, _local: true });

    const client = getClient();
    if (client) {
      client.from(REMOTE_TABLE).insert({ stage, suggestion: value })
        .then(({ error }) => {
          if (error) console.warn('Gagal menyimpan sugesti ke Supabase:', error);
          else refreshRemoteSuggestions();
        });
    }
    return true;
  };

  const removeSuggestion = (text) => {
    const value = String(text || '').trim();
    const lower = value.toLowerCase();
    saveCustomSuggestions(loadCustomSuggestions().filter(v => v.toLowerCase() !== lower));
    remoteSuggestions = remoteSuggestions.filter(x => x.suggestion.toLowerCase() !== lower);
    const client = getClient();
    if (client) {
      client.from(REMOTE_TABLE).delete().eq('suggestion', value)
        .then(({ error }) => {
          if (error) console.warn('Gagal menghapus sugesti Supabase:', error);
          else refreshRemoteSuggestions();
        });
    }
  };

  const getCustomSuggestions = () => {
    const stage = getStage();
    const remote = remoteSuggestions.filter(x => x.stage === 'common' || x.stage === stage).map(x => x.suggestion);
    return [...new Set([...loadCustomSuggestions(), ...remote])];
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

  // Mode cepat untuk HP: setelah spasi, kata berikutnya dianggap token baru.
  // Jadi setelah memilih "Loading Lot A", aplikasi menambahkan spasi dan saat
  // operator mengetik "L" lagi, daftar sugesti muncul lagi.
  const getActiveToken = (value, caret = value.length) => {
    const before = value.slice(0, caret);
    const m = before.match(/(^|[\s,;\n])([^\s,;\n]*)$/);
    const token = m ? m[2] : '';
    const tokenStart = caret - token.length;
    return { tokenStart, token };
  };

  /**
   * Cari alias yang diawali / cocok dengan query (partial).
   * "rapihkan" → "Merapihkan Media" via alias "rapihkan media".
   */
  const findAliasMatch = (query) => {
    const q = String(query || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!q || q.length < 3) return null;
    const aliases = CONFIG.KEGIATAN_ALIASES || {};
    // Exact dulu
    if (aliases[q]) return aliases[q];
    // Alias yang diawali query, atau query yang diawali alias
    let best = null;
    for (const [alias, canon] of Object.entries(aliases)) {
      if (alias === q) return canon;
      if (alias.startsWith(q) || q.startsWith(alias)) {
        if (!best || alias.length < best.aliasLen) best = { canon, aliasLen: alias.length };
      }
    }
    return best ? best.canon : null;
  };

  // Cari sugesti terbaik untuk ghost-text / Tab-accept.
  // Alias non-prefix TIDAK dipakai untuk ghost append (hanya dropdown + blur).
  const bestMatch = (segment) => {
    if (!segment) return null;
    const lower = segment.toLowerCase();

    const list = getSuggestions();
    // 1) Prefix penuh saja — aman untuk ghost text "ketikan|sisanya"
    const prefix = list.find(s => {
      const t = s.toLowerCase();
      return t.startsWith(lower) && t !== lower;
    });
    if (prefix) return prefix;

    // 2) Kata di tengah yang diawali query — untuk Tab-accept, bukan ghost
    //    (ghost tidak ditampilkan karena isPrefixMatch = false)
    const mid = list.find(s => {
      const t = s.toLowerCase();
      if (t === lower) return false;
      return t.split(/[\s\-_/]+/).some(w => w.startsWith(lower) && w !== lower);
    });
    if (mid) return mid;

    // 3) Alias partial ("rapihkan" → Merapihkan Media) — Tab/blur, bukan ghost
    const aliasHit = findAliasMatch(lower);
    if (aliasHit && aliasHit.toLowerCase() !== lower) return aliasHit;

    return null;
  };

  // Ghost text HANYA jika match benar-benar diawali teks yang diketik
  // (kalau tidak, "rapihkan" + "Merapihkan Media" jadi tampilan rusak).
  const isPrefixMatch = (segment, match) => {
    if (!segment || !match) return false;
    return match.toLowerCase().startsWith(segment.toLowerCase());
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
  // Filter dropdown: kata tengah + alias (Issue #9).
  // Ranking: alias-baku > prefix > awal-kata > substring.
  const filterActivities = (segment) => {
    const q = (segment || '').trim().toLowerCase();
    const all = [...new Set(getSuggestions())];
    if (!q) return all.slice(0, 12);

    const canon = findAliasMatch(q);

    const scored = [];
    for (const s of all) {
      const t = s.toLowerCase();
      if (t === q) continue;
      let rank;
      if (canon && t === canon.toLowerCase()) {
        rank = -1;
      } else if (t.startsWith(q)) {
        rank = 0;
      } else if (t.split(/[\s\-_/]+/).some(w => w.startsWith(q))) {
        rank = 1;
      } else if (q.length >= 4 && t.includes(q)) {
        // Substring hanya jika query cukup panjang (hindari "a" mencocok semua)
        rank = 2;
      } else {
        continue;
      }
      scored.push({ s, rank, len: t.length });
    }
    if (canon && !scored.some(x => x.s.toLowerCase() === canon.toLowerCase())) {
      scored.unshift({ s: canon, rank: -1, len: canon.length });
    }
    scored.sort((a, b) => a.rank - b.rank || a.len - b.len || a.s.localeCompare(b.s));
    return scored.slice(0, 12).map(x => x.s);
  };

  let _actDrop = null;
  let _actActiveInput = null;
  let _actHighlight = -1;
  let _actSegStart = 0;

  const ensureActDropdown = () => {
    if (_actDrop) return _actDrop;
    _actDrop = document.createElement('div');
    _actDrop.className = 'kegiatan-suggest-drop';
    _actDrop.setAttribute('role', 'listbox');
    _actDrop.setAttribute('data-suggest-kind', 'kegiatan');
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

  /** True jika wizard / modal manapun sedang terbuka — dropdown disembunyikan. */
  const isAnyOverlayOpen = () => {
    return !!document.querySelector(
      '.qm-overlay:not(.hide), #wizardOverlay:not(.hide), #suggestOverlay:not(.hide), #qmOverlay:not(.hide), #bulkOverlay:not(.hide)'
    );
  };

  const hideAllSuggestDropdowns = () => {
    hideActDropdown();
    if (typeof hideProdDropdown === 'function') hideProdDropdown();
    if (typeof hideBnDropdown === 'function') hideBnDropdown();
  };

  const hideActDropdown = () => {
    if (_actDrop) _actDrop.hidden = true;
    _actActiveInput = null;
    _actHighlight = -1;
  };

  /**
   * Pilih kegiatan dari dropdown: ganti SELURUH segmen aktif (bukan hanya
   * kata terakhir), supaya "rapihkan" + pilih "Merapihkan Media" tidak jadi
   * "rapihkan Merapihkan Media".
   */
  const selectActivity = (el, text, _tokenStart) => {
    if (!el || !text) return;
    const info = getActiveSegment(el.value);
    const before = el.value.slice(0, info.segStart);
    // Setelah segmen aktif: buang sisa segmen lama, sisakan pemisah berikutnya jika ada
    const afterRaw = el.value.slice(info.segStart + info.segment.length);
    const canon = text.trim();
    el.value = before + canon + (afterRaw.match(/^[,;\n]/) ? afterRaw : ' ' + afterRaw.replace(/^\s+/, ''));
    const pos = before.length + canon.length + (el.value[before.length + canon.length] === ' ' ? 1 : 0);
    el.selectionStart = el.selectionEnd = pos;
    el.focus();
    hideActDropdown();
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const renderActDropdown = (el, items, segStart) => {
    if (isAnyOverlayOpen()) { hideActDropdown(); return; }
    const drop = ensureActDropdown();
    _actActiveInput = el;
    _actSegStart = segStart;
    _actHighlight = items.length ? 0 : -1;
    if (!items.length) {
      drop.hidden = true;
      return;
    }
    drop.innerHTML = items.map((text, i) =>
      `<button type="button" class="kegiatan-suggest-item${i === 0 ? ' on' : ''}" role="option" data-text="${Utils.escapeHtml(text)}">${Utils.escapeHtml(text)}</button>`
    ).join('');
    drop.querySelectorAll('.kegiatan-suggest-item').forEach(btn => {
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

      // Ghost text hanya ditampilkan untuk prefix-match (aman secara visual).
      // Match kata-tengah tetap tersedia lewat dropdown + Tab/Enter.
      if (match && isPrefixMatch(segment, match)) {
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
        const tokenInfo = getActiveToken(typed, typed.length);
        renderActDropdown(el, filterActivities(tokenInfo.token), tokenInfo.tokenStart);
      } else {
        hideActDropdown();
      }
    };

    const acceptSuggestion = () => {
      if (!currentSuggestion) return;
      // Ganti seluruh segmen aktif (bukan append), termasuk match alias
      const info = getActiveSegment(el.value);
      const before = el.value.slice(0, info.segStart);
      const afterRaw = el.value.slice(info.segStart + info.segment.length);
      const canon = currentSuggestion.trim();
      el.value = before + canon + (afterRaw.match(/^[,;\n]/) ? afterRaw : '');
      el.selectionStart = el.selectionEnd = before.length + canon.length;
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
      // Standarisasi kosa kata: alias → bentuk baku (Issue #9)
      setTimeout(() => {
        if (document.activeElement === el) return;
        hideActDropdown();
        const next = normalizeKegiatanText(el.value);
        if (next != null && next !== el.value) {
          el.value = next;
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, 150);
    });
    el.addEventListener('keydown', (e) => {
      // Navigasi dropdown (panah atas/bawah + Enter) kalau dropdown sedang tampil
      if (_actDrop && !_actDrop.hidden && _actActiveInput === el) {
        const items = [..._actDrop.querySelectorAll('.kegiatan-suggest-item')];
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
    return stage || 'filling';
  };

  const FALLBACK_PRODUCT_CODES = {
    mixing:  ['VTTS1 Mixing L','VTTS1 Loading L','VKAM1','VLON1','VMON1','VTRA1','VCLN2','VMNT1','VTRM1','VPEL1','ITTC2','VTTC1'],
    filling: ['VTTS1','VKAM1','VLON1','VMON1','VTRA1','VCLN2','VMNT1','VTRM1','VPEL1','ITTC2','VTTC1'],
    steril:  ['VTTS1','VKAM1','VLON1','VMON1','VTRA1','VCLN2','VMNT1','VTRM1','VPEL1','ITTC2','VTTC1'],
    visual:  ['VTTSA','VKAMA','VLONA','VMONA','VTRAB','VCLNB','VMNTA','VTRME','VPELA','ITTCB','VTTCA'],
    kemas:   ['VTTSA','VKAMA','VLONA','VMONA','VTRAB','VCLNB','VMNTA','VTRME','VPELA','ITTCB','VTTCA'],
  };

  // ====== HISTORY PRODUK + BN (Issue #8) ======
  // Menyimpan kombinasi kode+BN yang pernah diisi, agar bisa dipilih lagi
  // tanpa mengetik ulang. Disimpan di localStorage per browser.
  const PROD_HISTORY_KEY = 'TKL_PRODUCT_HISTORY_V1';
  const PROD_HISTORY_MAX = 80;

  const loadProdHistory = () => {
    try {
      const raw = localStorage.getItem(PROD_HISTORY_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) { return []; }
  };

  const saveProdHistory = (arr) => {
    try {
      localStorage.setItem(PROD_HISTORY_KEY, JSON.stringify(arr.slice(0, PROD_HISTORY_MAX)));
    } catch (_) {}
  };

  /**
   * Catat kombinasi kode produk + BN ke history.
   * Dipanggil saat user mengisi/menyimpan master produk.
   */
  const rememberProduct = (code, bn) => {
    const c = String(code || '').trim();
    if (!c) return;
    const b = String(bn || '').trim();
    const cKey = c.toUpperCase();
    const bKey = b.toUpperCase();
    let list = loadProdHistory().filter(x =>
      !(String(x.code || '').toUpperCase() === cKey && String(x.bn || '').toUpperCase() === bKey)
    );
    list.unshift({ code: c, bn: b, at: Date.now() });
    saveProdHistory(list);
  };

  /** Semua kode unik dari history (paling baru dulu). */
  const historyCodes = () => {
    const seen = new Set();
    const out = [];
    for (const x of loadProdHistory()) {
      const c = String(x.code || '').trim();
      if (!c || seen.has(c.toUpperCase())) continue;
      seen.add(c.toUpperCase());
      out.push(c);
    }
    return out;
  };

  /** BN unik yang pernah dipakai untuk kode produk tertentu (paling baru dulu). */
  const historyBnFor = (code) => {
    const c = String(code || '').trim().toUpperCase();
    if (!c) {
      // Tanpa kode: tampilkan semua BN unik dari history
      const seen = new Set();
      const out = [];
      for (const x of loadProdHistory()) {
        const b = String(x.bn || '').trim();
        if (!b || seen.has(b.toUpperCase())) continue;
        seen.add(b.toUpperCase());
        out.push(b);
      }
      return out;
    }
    const seen = new Set();
    const out = [];
    for (const x of loadProdHistory()) {
      if (String(x.code || '').toUpperCase() !== c) continue;
      const b = String(x.bn || '').trim();
      if (!b || seen.has(b.toUpperCase())) continue;
      seen.add(b.toUpperCase());
      out.push(b);
    }
    return out;
  };

  /**
   * Seed history dari data sheet yang sudah tersimpan di localStorage
   * (supaya produk/BN lama langsung muncul tanpa harus simpan ulang).
   */
  const seedHistoryFromDb = () => {
    try {
      if (typeof Storage === 'undefined' || !Storage.dbGet) return;
      const db = Storage.dbGet();
      if (!db || typeof db !== 'object') return;
      Object.values(db).forEach((rec) => {
        const p = rec && rec.products;
        if (!p) return;
        for (const i of [1, 2, 3]) {
          let name = String(p['p' + i + 'Name'] || '').trim();
          let bn = String(p['p' + i + 'Bn'] || '').trim();
          if (!bn && name.includes(' ')) {
            const sp = name.indexOf(' ');
            bn = name.slice(sp + 1).trim();
            name = name.slice(0, sp).trim();
          }
          if (name) rememberProduct(name, bn);
        }
      });
    } catch (_) {}
  };

  /** Scan 3 slot master produk & catat ke history. */
  const rememberFromMaster = () => {
    for (let i = 1; i <= 3; i++) {
      const nameEl = document.getElementById('prodName' + i) || document.getElementById('masterProdName' + i);
      const bnEl = document.getElementById('prodBn' + i) || document.getElementById('masterProdBn' + i);
      const code = nameEl ? nameEl.value.trim() : '';
      const bn = bnEl ? bnEl.value.trim() : '';
      if (code) rememberProduct(code, bn);
    }
  };

  const getProductCodes = () => {
    const stage = getActiveStage();
    const map = (typeof CONFIG !== 'undefined' && CONFIG.PRODUCT_CODE_SUGGESTIONS)
      || FALLBACK_PRODUCT_CODES;
    const list = map[stage] || map.mixing || FALLBACK_PRODUCT_CODES.mixing;
    // History dulu: tampilkan "KODE · BN" jika ada BN, supaya user langsung lihat batch
    const histItems = [];
    const seenCode = new Set();
    for (const x of loadProdHistory()) {
      const c = String(x.code || '').trim();
      if (!c) continue;
      const b = String(x.bn || '').trim();
      const label = b ? `${c} · ${b}` : c;
      if (seenCode.has(label.toUpperCase())) continue;
      seenCode.add(label.toUpperCase());
      histItems.push(label);
    }
    // Kode unik history (tanpa BN) + daftar standar
    const codes = [...historyCodes(), ...list];
    const merged = [];
    const seen = new Set();
    for (const item of [...histItems, ...codes]) {
      const k = String(item).toUpperCase();
      if (seen.has(k)) continue;
      seen.add(k);
      merged.push(item);
    }
    return merged;
  };

  const filterProductCodes = (query) => {
    const q = (query || '').trim().toUpperCase();
    const all = getProductCodes();
    if (!q) return all.slice(0, 12);
    const scored = [];
    for (const code of all) {
      const t = code.toUpperCase();
      let rank;
      if (t.startsWith(q)) rank = 0;
      else if (t.includes(q)) rank = 1;
      else continue;
      scored.push({ code, rank });
    }
    scored.sort((a, b) => a.rank - b.rank);
    return scored.slice(0, 12).map(x => x.code);
  };

  let _prodDrop = null;
  let _prodActiveInput = null;
  let _prodHighlight = -1;

  const ensureProdDropdown = () => {
    if (_prodDrop) return _prodDrop;
    _prodDrop = document.createElement('div');
    _prodDrop.className = 'prod-suggest-drop';
    _prodDrop.setAttribute('role', 'listbox');
    _prodDrop.setAttribute('data-suggest-kind', 'produk');
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
    // Bisa "VTTS1" atau "VTTS1 · L030101" dari history
    let pureCode = code;
    let bnFromLabel = '';
    const sep = code.indexOf(' · ');
    if (sep >= 0) {
      pureCode = code.slice(0, sep).trim();
      bnFromLabel = code.slice(sep + 3).trim();
    }
    input.value = pureCode;
    const pos = pureCode.length;
    try { input.setSelectionRange(pos, pos); } catch (_) {}
    input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    hideProdDropdown();

    // Isi BN: dari label history, atau BN terakhir untuk kode ini
    const id = input.id || '';
    const slotMatch = id.match(/(?:master)?[Pp]rodName(\d)/);
    if (slotMatch) {
      const n = slotMatch[1];
      const bnEl = document.getElementById('prodBn' + n) || document.getElementById('masterProdBn' + n);
      if (bnEl) {
        const fill = bnFromLabel || (historyBnFor(pureCode)[0] || '');
        if (fill) {
          bnEl.value = fill;
          bnEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    }
  };

  const renderProdDropdown = (input, items) => {
    if (isAnyOverlayOpen()) { hideProdDropdown(); return; }
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

  // ====== AUTOCOMPLETE BN (history per kode produk) ======
  let _bnDrop = null;
  let _bnActiveInput = null;
  let _bnHighlight = -1;

  const ensureBnDropdown = () => {
    if (_bnDrop) return _bnDrop;
    _bnDrop = document.createElement('div');
    _bnDrop.className = 'bn-suggest-drop';
    _bnDrop.setAttribute('role', 'listbox');
    _bnDrop.setAttribute('data-suggest-kind', 'bn');
    _bnDrop.hidden = true;
    document.body.appendChild(_bnDrop);
    document.addEventListener('mousedown', (e) => {
      if (!_bnDrop || _bnDrop.hidden) return;
      if (_bnDrop.contains(e.target)) return;
      if (_bnActiveInput && _bnActiveInput === e.target) return;
      hideBnDropdown();
    });
    return _bnDrop;
  };

  const hideBnDropdown = () => {
    if (_bnDrop) _bnDrop.hidden = true;
    _bnActiveInput = null;
    _bnHighlight = -1;
  };

  const relatedProductCode = (bnInput) => {
    const id = bnInput.id || '';
    const m = id.match(/(?:master)?[Pp]rodBn(\d)/);
    if (!m) return '';
    const n = m[1];
    const nameEl = document.getElementById('prodName' + n) || document.getElementById('masterProdName' + n);
    return nameEl ? nameEl.value.trim() : '';
  };

  const selectBn = (input, bn) => {
    if (!input || !bn) return;
    input.value = String(bn).trim();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    hideBnDropdown();
  };

  const renderBnDropdown = (input, items) => {
    if (isAnyOverlayOpen()) { hideBnDropdown(); return; }
    const drop = ensureBnDropdown();
    _bnActiveInput = input;
    _bnHighlight = items.length ? 0 : -1;
    if (!items.length) {
      drop.hidden = true;
      return;
    }
    drop.innerHTML = items.map((bn, i) =>
      `<button type="button" class="bn-suggest-item${i === 0 ? ' on' : ''}" role="option" data-bn="${bn}">${bn}</button>`
    ).join('');
    drop.querySelectorAll('.bn-suggest-item').forEach(btn => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectBn(input, btn.getAttribute('data-bn'));
      });
    });
    // Reuse positioning logic
    const r = input.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const maxH = Math.min(220, Math.max(120, spaceBelow - 8));
    drop.style.position = 'fixed';
    drop.style.left = Math.max(4, r.left) + 'px';
    drop.style.width = Math.max(r.width, 120) + 'px';
    drop.style.maxHeight = maxH + 'px';
    if (spaceBelow < 100 && r.top > spaceBelow) {
      drop.style.top = 'auto';
      drop.style.bottom = (window.innerHeight - r.top + 4) + 'px';
    } else {
      drop.style.bottom = 'auto';
      drop.style.top = (r.bottom + 4) + 'px';
    }
    drop.hidden = false;
  };

  const refreshBnDropdown = (input) => {
    const code = relatedProductCode(input);
    let items = historyBnFor(code);
    const q = String(input.value || '').trim().toUpperCase();
    if (q) items = items.filter(b => b.toUpperCase().startsWith(q) || b.toUpperCase().includes(q));
    if (items.length === 1 && items[0].toUpperCase() === q) {
      hideBnDropdown();
      return;
    }
    renderBnDropdown(input, items.slice(0, 12));
  };

  const attachBnAutocomplete = (el) => {
    if (!el || el.dataset.bnSuggestBound === '1') return;
    el.dataset.bnSuggestBound = '1';
    el.setAttribute('autocomplete', 'off');

    el.addEventListener('focus', () => refreshBnDropdown(el));
    el.addEventListener('input', () => refreshBnDropdown(el));
    el.addEventListener('click', () => refreshBnDropdown(el));
    el.addEventListener('keydown', (e) => {
      if (!_bnDrop || _bnDrop.hidden || _bnActiveInput !== el) {
        if (e.key === 'Escape') hideBnDropdown();
        return;
      }
      const items = [..._bnDrop.querySelectorAll('.bn-suggest-item')];
      if (!items.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        _bnHighlight = (_bnHighlight + 1) % items.length;
        items.forEach((b, i) => b.classList.toggle('on', i === _bnHighlight));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        _bnHighlight = (_bnHighlight - 1 + items.length) % items.length;
        items.forEach((b, i) => b.classList.toggle('on', i === _bnHighlight));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (_bnHighlight >= 0 && items[_bnHighlight]) {
          e.preventDefault();
          selectBn(el, items[_bnHighlight].getAttribute('data-bn'));
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        hideBnDropdown();
      }
    });
    el.addEventListener('blur', () => {
      setTimeout(() => { if (document.activeElement !== el) hideBnDropdown(); }, 150);
      // Catat ke history saat blur jika ada kode+BN
      const code = relatedProductCode(el);
      const bn = el.value.trim();
      if (code && bn) rememberProduct(code, bn);
    });
  };

  const isBnInput = (el) => {
    if (!el || el.tagName !== 'INPUT') return false;
    const id = el.id || '';
    return /^prodBn[123]$/.test(id) || /^masterProdBn[123]$/.test(id);
  };

  // Delegasi global: tetap jalan meski input di-render ulang / user belum attach manual
  const isProductNameInput = (el) => {
    if (!el || el.tagName !== 'INPUT') return false;
    if (el.type && el.type !== 'text' && el.type !== 'search') return false;
    const id = el.id || '';
    if (/^prodName[123]$/.test(id) || /^masterProdName[123]$/.test(id)) return true;
    if (el.classList.contains('sheet-product-name')) return true;
    // Wizard Setup Awal — input [data-prod-name]
    if (el.hasAttribute('data-prod-name')) return true;
    if (el.classList.contains('wiz-prod-name')) return true;
    if (el.dataset && el.dataset.field === 'name' && el.closest('.sheet-product-slot, .sheet-product-bar, .product-grid, .wizard-modal, #wizardModal')) return true;
    return false;
  };

  const bindProductDelegation = () => {
    if (document.documentElement.dataset.prodSuggestDelegation === '1') return;
    document.documentElement.dataset.prodSuggestDelegation = '1';

    document.addEventListener('focusin', (e) => {
      const el = e.target;
      if (isProductNameInput(el)) {
        attachProductAutocomplete(el);
        refreshProdDropdown(el);
      } else if (isBnInput(el)) {
        attachBnAutocomplete(el);
        refreshBnDropdown(el);
      }
    }, true);

    document.addEventListener('input', (e) => {
      const el = e.target;
      if (isProductNameInput(el)) {
        attachProductAutocomplete(el);
        refreshProdDropdown(el);
      } else if (isBnInput(el)) {
        attachBnAutocomplete(el);
        refreshBnDropdown(el);
      }
    }, true);
  };

  // Auto-bind saat script termuat
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindProductDelegation);
  } else {
    bindProductDelegation();
  }


  // ====== UI: kelola sugesti dari tombol di sheet =====
  const refreshCustomList = () => {
    const ul = document.getElementById('suggestCustomList');
    if (!ul) return;
    const customs = getCustomSuggestions();
    if (!customs.length) {
      ul.innerHTML = '<li style="padding:12px;color:#64748b;font-size:12.5px;font-style:italic">Belum ada sugesti tambahan.</li>';
      return;
    }
    ul.innerHTML = customs.map((txt) => {
      const safe = String(txt).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
      return `<li style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-bottom:1px solid #16324c;font-size:13px;color:#e2e8f0">`
        + `<span style="flex:1;word-break:break-word">${safe}</span>`
        + `<button type="button" class="btn btn-ghost btn-sm suggest-del" data-text="${safe}" title="Hapus">✕</button></li>`;
    }).join('');
  };

  const openManage = () => {
    const ov = document.getElementById('suggestOverlay');
    if (!ov) return;
    const inp = document.getElementById('suggestInput');
    if (inp) inp.value = '';
    refreshCustomList();
    ov.classList.remove('hide');
    setTimeout(() => inp?.focus(), 40);
  };

  const closeManage = () => {
    document.getElementById('suggestOverlay')?.classList.add('hide');
  };

  const bindManageUI = () => {
    document.getElementById('btnSuggestKegiatan')?.addEventListener('click', openManage);
    document.getElementById('suggestClose')?.addEventListener('click', closeManage);
    document.getElementById('suggestDoneBtn')?.addEventListener('click', closeManage);
    document.getElementById('suggestOverlay')?.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'suggestOverlay') closeManage();
    });
    document.getElementById('suggestAddBtn')?.addEventListener('click', () => {
      const inp = document.getElementById('suggestInput');
      const val = (inp?.value || '').trim();
      if (!val) {
        if (typeof UI !== 'undefined' && UI.toast) UI.toast('Isi teks kegiatan dulu', true);
        return;
      }
      const ok = addSuggestion(val);
      if (ok) {
        if (typeof UI !== 'undefined' && UI.toast) UI.toast('✓ Sugesti ditambahkan');
        if (inp) inp.value = '';
        refreshCustomList();
      } else {
        if (typeof UI !== 'undefined' && UI.toast) UI.toast('Sudah ada di daftar sugesti', true);
      }
    });
    document.getElementById('suggestInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('suggestAddBtn')?.click();
      }
    });
    document.getElementById('suggestCustomList')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.suggest-del');
      if (!btn) return;
      const text = btn.getAttribute('data-text') || '';
      removeSuggestion(text);
      refreshCustomList();
      if (typeof UI !== 'undefined' && UI.toast) UI.toast('Sugesti dihapus');
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindManageUI);
  } else {
    bindManageUI();
  }

  return {
    attachGhost, attachAll, getSuggestions, addSuggestion, removeSuggestion, getCustomSuggestions,
    initRemote, refreshRemoteSuggestions, attachProductAll, openManage,
    rememberProduct, rememberFromMaster, historyBnFor, historyCodes, seedHistoryFromDb,
  };
})();
