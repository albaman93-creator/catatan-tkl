/**
 * PHOTO-IMPORT.JS — Input baris log sheet dari foto / paste teks AI
 *
 * Mode A: Upload foto → Supabase Edge Function → Gemini (lambat, otomatis)
 * Mode B: Paste teks hasil Meta AI / Gemini / ChatGPT (cepat) + prompt siap copy
 */
const PhotoImport = (() => {
  'use strict';

  const FIELDS = [
    { key: 'kode', label: 'Kode', width: '44px' },
    { key: 'op', label: 'OP', width: '44px' },
    { key: 'mulai', label: 'Mulai', width: '64px' },
    { key: 'panggil', label: 'Panggil', width: '64px' },
    { key: 'teknik', label: 'Teknik', width: '64px' },
    { key: 'selesai', label: 'Selesai', width: '64px' },
    { key: 'durasi', label: 'Durasi', width: '56px' },
    { key: 'kegiatan', label: 'Kegiatan', width: 'minmax(100px,1.2fr)' },
    { key: 'masalah', label: 'Masalah', width: 'minmax(80px,1fr)' },
    { key: 'disposisi', label: 'Disposisi', width: 'minmax(80px,1fr)' },
    { key: 'wo', label: 'WO', width: 'minmax(70px,0.8fr)' },
    { key: 'batch', label: 'Produk/Batch', width: 'minmax(90px,1fr)' },
    { key: 'good', label: 'Good', width: '64px' },
    { key: 'defect', label: 'Defect', width: '56px' },
  ];

  /** Prompt siap kirim ke Meta AI / Gemini bersama foto form TKL
   * Fokus hanya pembacaan tabel (rows). Meta (tanggal/shift/mesin/dll) diisi manual user.
   */
  const AI_PROMPT = `Baca foto FORM TKL (Formulir Catatan Pemakaian TKL) ini.
Kembalikan HANYA JSON valid, tanpa markdown, tanpa penjelasan.
ABAIKAN header (tanggal, shift, nama mesin, no mesin, tahapan, rate, inisial, logo, tanda tangan).
Fokus HANYA pada baris-baris tabel.

SETIAP BARIS TABEL:
| Kolom form | Field JSON |
| Kode keg. | kode (1 digit 1-9) |
| Jumlah TKL | op |
| Dari | mulai (HH:MM) |
| Panggil teknik | panggil (HH:MM) |
| Teknik datang | teknik (HH:MM) |
| Sampai | selesai (HH:MM) |
| Durasi (menit) | durasi |
| Aktivitas kegiatan | kegiatan |
| Masalah/penyebab | masalah |
| Disposisi/tindakan | disposisi |
| Nomor WO | wo |
| Kode produk & batch | batch |
| Good | good |
| Defect | defect |

Format WAJIB:
{"rows":[{"kode":"2","op":"","mulai":"07:00","panggil":"","teknik":"","selesai":"07:35","durasi":"35","kegiatan":"...","masalah":"","disposisi":"","wo":"","batch":"","good":"918","defect":"4"}],"meta":{}}

Aturan:
1. Jam format HH:MM (7.30 → 07:30).
2. kode hanya 1 digit (1-9).
3. Jika durasi kosong tapi jam ada, hitung durasi dari mulai-selesai.
4. good/defect utamanya di kode 2.
5. Abaikan baris kosong. Urut dari atas ke bawah.
6. Jangan bungkus dengan \`\`\`json.
7. meta biarkan kosong {} — tidak perlu diisi.`;

  let draftRows = [];
  let draftMeta = {};
  let startRow = 1;

  const esc = (v) => {
    if (typeof Utils !== 'undefined' && Utils.escapeHtml) return Utils.escapeHtml(String(v ?? ''));
    return String(v ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
    }[c]));
  };

  const functionUrl = () => {
    const base = (CONFIG.SUPABASE_URL || '').replace(/\/$/, '');
    return `${base}/functions/v1/parse-tkl-photo`;
  };

  const ensureOverlay = () => {
    let ov = document.getElementById('photoImportOverlay');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'photoImportOverlay';
    ov.className = 'qm-overlay hide';
    ov.innerHTML = `<div class="qm-modal bulk-modal bulk-modal-wide" id="photoImportModal" style="max-width:98vw;width:1100px;max-height:94vh;overflow:auto"></div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', (e) => {
      if (e.target === ov) close();
    });
    return ov;
  };

  const close = () => {
    const ov = document.getElementById('photoImportOverlay');
    if (ov) ov.classList.add('hide');
  };

  const fileToBase64 = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Gagal membaca file'));
      reader.readAsDataURL(file);
    });

  const compressImage = (dataUrl, maxSide = 1800, quality = 0.85) =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, maxSide / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });

  const callParseApi = async (imageBase64) => {
    const client = typeof SupabaseClient !== 'undefined' ? SupabaseClient.getClient() : null;
    let accessToken = CONFIG.SUPABASE_ANON_KEY;
    try {
      const session = client ? (await client.auth.getSession())?.data?.session : null;
      if (session?.access_token) accessToken = session.access_token;
    } catch (_) {}

    const res = await fetch(functionUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: CONFIG.SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ imageBase64 }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error || data.message || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    if (data.error && (!data.rows || !data.rows.length)) {
      throw new Error(data.error);
    }
    return data;
  };

  const normTime = (t) => {
    const s = String(t ?? '').trim();
    if (!s) return '';
    try {
      if (typeof Utils !== 'undefined') {
        if (Utils.normTime) {
          const n = Utils.normTime(s);
          if (n) return n;
        }
        if (Utils.maskTime) return Utils.maskTime(s.replace(/\D/g, '').slice(0, 4));
      }
    } catch (_) {}
    const d = s.replace(/\D/g, '');
    if (d.length >= 3 && d.length <= 4) {
      const p = d.padStart(4, '0');
      return p.slice(0, 2) + ':' + p.slice(2);
    }
    return s;
  };

  const normalizeRow = (r) => ({
    kode: String(r.kode ?? '').replace(/\D/g, '').slice(0, 1),
    op: String(r.op ?? '').replace(/[^\d]/g, ''),
    mulai: normTime(r.mulai),
    panggil: normTime(r.panggil),
    teknik: normTime(r.teknik),
    selesai: normTime(r.selesai),
    durasi: String(r.durasi ?? '').replace(/[^\d.,]/g, ''),
    durasi_flag: String(r.durasi_flag ?? '').trim(),
    kegiatan: String(r.kegiatan ?? '').trim(),
    masalah: String(r.masalah ?? '').trim(),
    disposisi: String(r.disposisi ?? '').trim(),
    wo: String(r.wo ?? '').trim(),
    batch: String(r.batch ?? '').trim(),
    good: String(r.good ?? '').replace(/[^\d.,]/g, ''),
    defect: String(r.defect ?? '').replace(/[^\d.,]/g, ''),
  });

  const checkDurationFlag = (row) => {
    if (!row.mulai || !row.selesai || !row.durasi) return row.durasi_flag || '';
    try {
      const a = Utils?.parseTime?.(row.mulai);
      const b = Utils?.parseTime?.(row.selesai);
      if (a == null || b == null) return row.durasi_flag || '';
      let diff = b - a;
      if (diff < 0) diff += 24 * 60;
      const d = parseFloat(String(row.durasi).replace(',', '.'));
      if (!isFinite(d)) return row.durasi_flag || '';
      if (Math.abs(diff - d) > 1) return 'mismatch';
      return row.durasi_flag === 'calculated' ? 'calculated' : '';
    } catch (_) {
      return row.durasi_flag || '';
    }
  };

  /**
   * Good/Defect hanya relevan di kode 2 (produksi).
   * OCR/operator sering menaruh angka di baris Ganti LOT (atas/bawah) → pindahkan ke kode 2 terdekat.
   */
  const realignGoodDefect = (rows) => {
    if (!Array.isArray(rows) || !rows.length) return rows;
    const hasGD = (r) => !!(String(r.good || '').trim() || String(r.defect || '').trim());
    const isProd = (r) => String(r.kode || '').trim() === '2';

    // 1) Pindahkan good/defect dari non-kode-2 ke kode 2 terdekat yang masih kosong
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!hasGD(r) || isProd(r)) continue;

      let target = -1;
      // Prioritas: baris kode 2 di BAWAH (sering OCR geser ke atas), lalu ATAS
      for (let j = i + 1; j < rows.length && j <= i + 2; j++) {
        if (isProd(rows[j]) && !hasGD(rows[j])) {
          target = j;
          break;
        }
      }
      if (target < 0) {
        for (let j = i - 1; j >= 0 && j >= i - 2; j--) {
          if (isProd(rows[j]) && !hasGD(rows[j])) {
            target = j;
            break;
          }
        }
      }
      // Jika target sudah punya good, tapi baris ini non-2 → hapus saja dari non-2
      if (target < 0) {
        // cari kode 2 terdekat apa pun dalam ±2
        for (const j of [i + 1, i - 1, i + 2, i - 2]) {
          if (j >= 0 && j < rows.length && isProd(rows[j])) {
            target = j;
            break;
          }
        }
      }

      if (target >= 0) {
        const t = rows[target];
        // Merge: isi yang kosong di target
        if (!String(t.good || '').trim() && String(r.good || '').trim()) t.good = r.good;
        if (!String(t.defect || '').trim() && String(r.defect || '').trim()) t.defect = r.defect;
        r.good = '';
        r.defect = '';
      } else {
        // Tidak ada kode 2 di dekatnya → bersihkan dari baris non-produksi
        r.good = '';
        r.defect = '';
      }
    }

    // 2) Jika baris kode 2 kosong good/defect, tapi baris berikutnya (bukan 2) punya → sudah di-handle di atas
    // 3) Pastikan non-2 tidak menyisakan good/defect
    rows.forEach((r) => {
      if (!isProd(r)) {
        r.good = '';
        r.defect = '';
      }
    });

    return rows;
  };

  /** Parse teks dari Meta AI / Gemini / ChatGPT → { rows, meta } */
  const parseAiText = (raw) => {
    let text = String(raw || '').trim();
    if (!text) throw new Error('Teks kosong');

    // Ambil blok JSON jika ada markdown
    text = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start >= 0 && end > start) {
        parsed = JSON.parse(text.slice(start, end + 1));
      } else {
        throw new Error('Tidak menemukan JSON. Pastikan AI mengembalikan format JSON.');
      }
    }

    const rows = Array.isArray(parsed.rows) ? parsed.rows : (Array.isArray(parsed) ? parsed : []);
    const meta = parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {};
    if (!rows.length) throw new Error('JSON tidak berisi baris (rows kosong).');
    return { rows, meta };
  };

  const collectFromPreview = () => {
    const modal = document.getElementById('photoImportModal');
    if (!modal) return [];
    const out = [];
    modal.querySelectorAll('[data-pi-row]').forEach((tr) => {
      const row = {};
      FIELDS.forEach((f) => {
        const input = tr.querySelector(`[data-pi-field="${f.key}"]`);
        row[f.key] = input ? input.value.trim() : '';
      });
      if (FIELDS.some((f) => row[f.key])) out.push(row);
    });
    return out;
  };

  /** P = pagi/S1, S = siang/S2, M = malam/S3 */
  const mapShiftIndex = (raw) => {
    const s = String(raw ?? '').trim().toUpperCase();
    if (!s) return -1;
    if (/^P\b/.test(s) || s === 'P' || s.includes('PAGI') || s === '1' || s === 'S1') return 0;
    if (/^S\b/.test(s) || s === 'S' || s.includes('SIANG') || s === '2' || s === 'S2') return 1;
    if (/^M\b/.test(s) || s === 'M' || s.includes('MALAM') || s === '3' || s === 'S3') return 2;
    const n = s.replace(/\D/g, '');
    if (n === '1') return 0;
    if (n === '2') return 1;
    if (n === '3') return 2;
    return -1;
  };

  const parseRateNumber = (raw) => {
    const s = String(raw ?? '').trim();
    if (!s) return '';
    // "26/bag", "26 / bag", "26 bag/mnt" → 26
    const m = s.match(/(\d+(?:[.,]\d+)?)/);
    return m ? m[1].replace(',', '.') : '';
  };

  const splitInisial = (raw) => {
    const s = String(raw ?? '').trim();
    if (!s) return [];
    // "MSA FOI", "MSA, FOI", "MSA/FOI", "MSA-FDI"
    return s
      .split(/[\s,;/|]+/)
      .map((x) => x.trim().toUpperCase())
      .filter((x) => x && /[A-Z]/.test(x))
      .slice(0, 6);
  };

  const setInputVal = (el, value) => {
    if (!el || value == null || value === '') return false;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  };

  const applyMetaToForm = (meta, rowsData) => {
    if (!meta || typeof meta !== 'object') meta = {};
    try {
      // Tanggal
      if (meta.tanggal && State.el.fDate) {
        let d = String(meta.tanggal).trim();
        const m1 = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
        const m2 = d.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
        if (m1) {
          State.el.fDate.value = `${m1[1]}-${m1[2]}-${m1[3]}`;
        } else if (m2) {
          let y = m2[3];
          if (y.length === 2) y = '20' + y;
          State.el.fDate.value = `${y}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`;
        }
        State.el.fDate.dispatchEvent(new Event('input', { bubbles: true }));
        State.el.fDate.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // Shift: P=1(pagi), S=2(siang), M=3(malam)
      const shiftIdx = mapShiftIndex(meta.shift);
      if (shiftIdx >= 0) {
        if (typeof UI !== 'undefined' && UI.setEvalShift) UI.setEvalShift(shiftIdx);
        else State.evalShift = shiftIdx;
        document.querySelectorAll('#fShift [data-shift]').forEach((b) => {
          b.classList.toggle('on', parseInt(b.getAttribute('data-shift'), 10) === shiftIdx);
        });
      }

      // Tahapan: "mixing dan loading" → mixing
      if (meta.tahapan && State.el.fStage) {
        const tv = String(meta.tahapan).toLowerCase();
        let hit = null;
        if (tv.includes('mix')) hit = 'mixing';
        else if (tv.includes('fill')) hit = 'filling';
        else if (tv.includes('steril')) hit = 'steril';
        else if (tv.includes('visual')) hit = 'visual';
        else if (tv.includes('kemas') || tv.includes('pack')) hit = 'kemas';
        if (hit) {
          State.el.fStage.value = hit;
          State.el.fStage.dispatchEvent(new Event('change', { bubbles: true }));
          if (typeof UI !== 'undefined' && UI.applyStageUI) UI.applyStageUI();
        }
      }

      // Nama & kode mesin
      const mesinNama = meta.nama_mesin || meta.namaMesin || '';
      const mesinKode = meta.no_mesin || meta.kode_mesin || meta.noMesin || '';
      setInputVal(State.el.fMesinNama || document.getElementById('fMesinNama'), mesinNama);
      setInputVal(State.el.fMesinKode || document.getElementById('fMesinKode'), mesinKode);

      // Line: hanya jika no mesin jelas 1/2/4
      if (mesinKode && State.el.fLine) {
        const n = String(mesinKode).replace(/\D/g, '');
        if (n === '1' || n === '2' || n === '4') {
          State.el.fLine.value = n;
          State.el.fLine.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      // Rate standar → prodRate1 (dan slot kosong lain jika perlu)
      const rateNum = parseRateNumber(meta.rate_standar || meta.rate || '');
      if (rateNum) {
        setInputVal(State.el.prodRate1, rateNum);
        const master = document.getElementById('masterProdRate1');
        if (master) setInputVal(master, rateNum);
      }

      // Inisial → op1..op6
      const inisials = splitInisial(meta.inisial || meta.inisial_op || '');
      inisials.forEach((ini, i) => {
        const el = State.el['op' + (i + 1)] || document.getElementById('op' + (i + 1));
        setInputVal(el, ini);
      });
      // Sync compact op boxes if any
      try {
        if (typeof UI !== 'undefined' && UI.syncOpBoxes) UI.syncOpBoxes();
      } catch (_) {}

      // Produk dari baris: kumpulkan batch + wo unik
      const products = [];
      const seen = new Set();
      (rowsData || []).forEach((r) => {
        const batch = String(r.batch || '').trim();
        const wo = String(r.wo || '').trim();
        if (!batch && !wo) return;
        const key = (batch || wo).toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        products.push({ name: batch || wo, wo: wo });
      });
      products.slice(0, 3).forEach((prod, i) => {
        const n = i + 1;
        setInputVal(State.el['prodName' + n] || document.getElementById('prodName' + n), prod.name);
        setInputVal(document.getElementById('masterProdName' + n), prod.name);
        if (prod.wo) {
          setInputVal(State.el['prodWo' + n] || document.getElementById('prodWo' + n), prod.wo);
          setInputVal(document.getElementById('masterProdWo' + n), prod.wo);
        }
        if (rateNum && n === 1) {
          setInputVal(State.el['prodRate' + n], rateNum);
        }
      });
      try {
        if (typeof Rows !== 'undefined' && Rows.updateAllDropdowns) Rows.updateAllDropdowns();
      } catch (_) {}
    } catch (e) {
      console.warn('applyMetaToForm', e);
    }
  };

  const setBatchValue = (tr, batchText) => {
    if (!batchText) return;
    const sel = tr.querySelector('[data-f="batch"]');
    if (!sel) return;
    // Pastikan dropdown produk terbaru
    try {
      if (typeof Rows !== 'undefined' && Rows.updateAllDropdowns) Rows.updateAllDropdowns();
    } catch (_) {}
    const opts = Array.from(sel.options || []);
    const lower = batchText.toLowerCase();
    const exact = opts.find((o) => o.value === batchText);
    const partial = opts.find(
      (o) =>
        o.value &&
        (lower.includes(o.value.toLowerCase()) || o.value.toLowerCase().includes(lower) ||
          lower.split(/[\s\/|,]+/).some((p) => p && o.value.toLowerCase().includes(p))),
    );
    if (exact) {
      sel.value = exact.value;
    } else if (partial) {
      sel.value = partial.value;
    } else {
      const opt = document.createElement('option');
      opt.value = batchText;
      opt.textContent = batchText;
      sel.appendChild(opt);
      sel.value = batchText;
    }
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    sel.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const applyToSheet = () => {
    let rowsData = collectFromPreview();
    rowsData = realignGoodDefect(rowsData.map(normalizeRow));
    if (!rowsData.length) {
      UI?.toast?.('Tidak ada baris untuk dimasukkan ⚠', true, 'warn');
      return;
    }

    const startInput = document.getElementById('piStartRow');
    const start = Math.max(1, parseInt(startInput?.value || '1', 10) || 1);
    startRow = start;

    applyMetaToForm(draftMeta, rowsData);

    while (Rows.rows().length < start - 1 + rowsData.length) {
      Rows.makeRow();
    }
    Rows.updateRowNumbers();

    const sheetRows = Rows.rows();
    let changed = 0;

    rowsData.forEach((item, i) => {
      const tr = sheetRows[start - 1 + i];
      if (!tr) return;
      const map = {
        kode: item.kode,
        op: item.op,
        mulai: item.mulai,
        panggil: item.panggil,
        teknik: item.teknik,
        selesai: item.selesai,
        durasi: item.durasi,
        kegiatan: item.kegiatan,
        masalah: item.masalah,
        disposisi: item.disposisi,
        wo: item.wo,
        good: item.good,
        defect: item.defect,
      };
      Object.entries(map).forEach(([key, value]) => {
        if (!value) return;
        const el = tr.querySelector(`[data-f="${key}"]`);
        if (!el) return;
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('focusout', { bubbles: true }));
        changed++;
      });
      if (item.batch) {
        setBatchValue(tr, item.batch);
        changed++;
      }
      try {
        if (item.kode && typeof Rows.applyCat === 'function') Rows.applyCat(tr);
      } catch (_) {}
    });

    try {
      Calculation.recalc();
    } catch (_) {}
    try {
      if (Storage?.saveData) Storage.saveData({ silent: true }).catch(() => {});
      else Storage?.autoSaveLocal?.();
    } catch (_) {}

    close();
    UI?.toast?.(`${rowsData.length} baris masuk ke Sheet ✓ (${changed} isian)`);
  };

  const renderPreview = (rows, meta, statusMsg) => {
    const modal = document.getElementById('photoImportModal');
    if (!modal) return;

    draftRows = realignGoodDefect((rows || []).map(normalizeRow)).map((r) => {
      r.durasi_flag = checkDurationFlag(r);
      return r;
    });
    draftMeta = meta || {};

    const mismatchCount = draftRows.filter((r) => r.durasi_flag === 'mismatch').length;
    const metaParts = [];
    if (draftMeta.tanggal) metaParts.push(`Tgl: ${draftMeta.tanggal}`);
    if (draftMeta.shift) metaParts.push(`Shift: ${draftMeta.shift}`);
    if (draftMeta.tahapan) metaParts.push(`Tahapan: ${draftMeta.tahapan}`);
    if (draftMeta.no_mesin) metaParts.push(`Mesin: ${draftMeta.no_mesin}`);
    if (draftMeta.nama_mesin) metaParts.push(draftMeta.nama_mesin);
    if (draftMeta.rate_standar) metaParts.push(`Rate: ${draftMeta.rate_standar}/mnt`);
    if (draftMeta.inisial) metaParts.push(`Inisial: ${draftMeta.inisial}`);
    if (draftMeta.catatan) metaParts.push(`⚠ ${draftMeta.catatan}`);
    if (mismatchCount) metaParts.push(`⚠ ${mismatchCount} baris jam≠durasi`);

    const gridCols = `36px ${FIELDS.map((f) => f.width).join(' ')}`;

    modal.innerHTML = `
      <div class="bf-head" style="padding:14px 16px 8px">
        <div>
          <h3 class="qm-title"><span class="bolt">📷</span> Input dari Foto</h3>
          <p class="qm-sub">${esc(statusMsg || 'Periksa data, koreksi jika perlu, lalu masukkan ke sheet.')}</p>
          ${metaParts.length ? `<p class="qm-sub" style="opacity:.85">${esc(metaParts.join(' · '))}</p>` : ''}
        </div>
        <button type="button" class="bf-x" data-pi="close" aria-label="Tutup">×</button>
      </div>
      <div style="padding:0 16px 8px;display:flex;gap:12px;flex-wrap:wrap;align-items:center">
        <label style="font-size:13px">Mulai baris
          <input type="number" id="piStartRow" min="1" value="${startRow}" style="width:72px;margin-left:6px;padding:6px 8px;border-radius:8px;border:1px solid var(--border,#ccc)">
        </label>
        <button type="button" class="btn btn-ghost" data-pi="home">← Kembali</button>
        <span style="font-size:12px;opacity:.7">${draftRows.length} baris · scroll horizontal jika perlu</span>
      </div>
      <div style="padding:0 8px 12px;overflow:auto;max-height:55vh">
        <div style="display:grid;grid-template-columns:${gridCols};gap:3px;font-size:10px;font-weight:700;padding:4px 0;opacity:.75;min-width:980px">
          <div>#</div>
          ${FIELDS.map((f) => `<div>${esc(f.label)}</div>`).join('')}
        </div>
        ${draftRows
          .map((r, i) => {
            const flag = r.durasi_flag;
            const rowStyle =
              flag === 'mismatch'
                ? 'background:rgba(220,38,38,.08);'
                : flag === 'calculated'
                  ? 'background:rgba(234,179,8,.08);'
                  : '';
            return `
          <div data-pi-row="${i}" style="display:grid;grid-template-columns:${gridCols};gap:3px;margin-bottom:3px;align-items:center;min-width:980px;${rowStyle}">
            <div style="font-size:11px;opacity:.6;text-align:center" title="${esc(flag)}">${i + 1}${flag === 'mismatch' ? '⚠' : flag === 'calculated' ? '~' : ''}</div>
            ${FIELDS.map((f) => {
              const isTime = ['mulai', 'panggil', 'teknik', 'selesai'].includes(f.key);
              const isNum = ['kode', 'op', 'good', 'defect', 'durasi'].includes(f.key);
              return `
              <input class="bf-input" data-pi-field="${f.key}" value="${esc(r[f.key] || '')}"
                style="width:100%;padding:5px 6px;border-radius:6px;border:1px solid ${f.key === 'durasi' && flag === 'mismatch' ? '#dc2626' : 'var(--border,#ccc)'};font-size:12px;box-sizing:border-box"
                ${f.key === 'kode' ? 'inputmode="numeric" maxlength="1"' : ''}
                ${isTime ? 'inputmode="numeric"' : ''}
                ${isNum && f.key !== 'kode' ? 'inputmode="decimal"' : ''}
              >`;
            }).join('')}
          </div>`;
          })
          .join('')}
        ${!draftRows.length ? '<p style="padding:24px;text-align:center;opacity:.6">Tidak ada baris.</p>' : ''}
      </div>
      <div class="bf-footer" style="padding:8px 16px 16px">
        <div class="qm-actions" style="width:100%;justify-content:flex-end;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn btn-ghost" data-pi="close">Batal</button>
          <button type="button" class="btn btn-primary" data-pi="apply" ${draftRows.length ? '' : 'disabled'}>✓ Masukkan ke Sheet</button>
        </div>
      </div>
    `;

    modal.querySelectorAll('[data-pi="close"]').forEach((b) => b.addEventListener('click', close));
    modal.querySelector('[data-pi="apply"]')?.addEventListener('click', applyToSheet);
    modal.querySelector('[data-pi="home"]')?.addEventListener('click', () => renderHome());
  };

  const renderPaste = () => {
    const modal = document.getElementById('photoImportModal');
    if (!modal) return;
    modal.innerHTML = `
      <div class="bf-head" style="padding:14px 16px 8px">
        <div>
          <h3 class="qm-title"><span class="bolt">📋</span> Paste dari AI (cepat)</h3>
          <p class="qm-sub">1) Copy prompt → 2) Kirim foto + prompt ke Meta AI / Gemini → 3) Copy JSON hasil → 4) Paste di sini</p>
        </div>
        <button type="button" class="bf-x" data-pi="close" aria-label="Tutup">×</button>
      </div>
      <div style="padding:0 16px 12px">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;align-items:center">
          <button type="button" class="btn btn-ghost" data-pi="copy-prompt">📄 Copy prompt</button>
          <button type="button" class="btn btn-ghost" data-pi="home">← Kembali</button>
          <span style="font-size:12px;opacity:.7">Prompt sudah disesuaikan kolom form TKL kamu</span>
        </div>
        <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Tempel JSON hasil AI di sini</label>
        <textarea id="piPasteBox" rows="12" placeholder='{"rows":[...],"meta":{...}}'
          style="width:100%;padding:12px;border-radius:12px;border:1px solid var(--border,#ccc);font-family:ui-monospace,monospace;font-size:12px;line-height:1.4;box-sizing:border-box;resize:vertical"></textarea>
        <p id="piPasteErr" style="color:var(--red,#c00);font-size:13px;margin:8px 0 0;display:none"></p>
      </div>
      <div class="bf-footer" style="padding:8px 16px 16px">
        <div class="qm-actions" style="width:100%;justify-content:flex-end;gap:8px">
          <button type="button" class="btn btn-ghost" data-pi="close">Batal</button>
          <button type="button" class="btn btn-primary" data-pi="parse-paste">🔍 Baca & Preview</button>
        </div>
      </div>
    `;

    modal.querySelectorAll('[data-pi="close"]').forEach((b) => b.addEventListener('click', close));
    modal.querySelector('[data-pi="home"]')?.addEventListener('click', () => renderHome());
    modal.querySelector('[data-pi="copy-prompt"]')?.addEventListener('click', async () => {
      try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(AI_PROMPT);
        else {
          const ta = document.createElement('textarea');
          ta.value = AI_PROMPT;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        UI?.toast?.('Prompt tersalin ✓ — tempel di Meta AI / Gemini bersama foto');
      } catch (_) {
        UI?.toast?.('Gagal copy prompt', true, 'warn');
      }
    });
    modal.querySelector('[data-pi="parse-paste"]')?.addEventListener('click', () => {
      const box = document.getElementById('piPasteBox');
      const err = document.getElementById('piPasteErr');
      try {
        const { rows, meta } = parseAiText(box?.value || '');
        renderPreview(rows, meta, `Paste AI: ${rows.length} baris. Koreksi jika perlu.`);
      } catch (e) {
        if (err) {
          err.style.display = 'block';
          err.textContent = e.message || String(e);
        }
        UI?.toast?.(e.message || String(e), true, 'warn');
      }
    });
    setTimeout(() => document.getElementById('piPasteBox')?.focus(), 50);
  };

  const renderUpload = () => {
    const modal = document.getElementById('photoImportModal');
    if (!modal) return;
    modal.innerHTML = `
      <div class="bf-head" style="padding:14px 16px 8px">
        <div>
          <h3 class="qm-title"><span class="bolt">📷</span> Upload foto (server AI)</h3>
          <p class="qm-sub">Langsung di app — bisa lebih lambat karena gambar dikirim ke server.</p>
        </div>
        <button type="button" class="bf-x" data-pi="close" aria-label="Tutup">×</button>
      </div>
      <div style="padding:16px;text-align:center">
        <label style="display:inline-block;padding:28px 24px;border:2px dashed var(--border,#ccc);border-radius:16px;cursor:pointer;min-width:260px">
          <div style="font-size:40px;margin-bottom:8px">📄</div>
          <div style="font-weight:600;margin-bottom:4px">Pilih atau ambil foto</div>
          <div style="font-size:12px;opacity:.7">JPG / PNG · cahaya terang · form utuh</div>
          <input type="file" id="piFile" accept="image/*" capture="environment" style="display:none">
        </label>
        <p id="piStatus" style="margin-top:16px;font-size:13px;opacity:.8"></p>
        <div id="piSpinner" style="display:none;margin-top:12px">⏳ Membaca foto dengan AI…</div>
      </div>
      <div class="bf-footer" style="padding:8px 16px 16px">
        <div class="qm-actions" style="width:100%;justify-content:flex-end;gap:8px">
          <button type="button" class="btn btn-ghost" data-pi="home">← Kembali</button>
          <button type="button" class="btn btn-ghost" data-pi="close">Batal</button>
        </div>
      </div>
    `;

    modal.querySelectorAll('[data-pi="close"]').forEach((b) => b.addEventListener('click', close));
    modal.querySelector('[data-pi="home"]')?.addEventListener('click', () => renderHome());
    const fileInput = document.getElementById('piFile');
    const status = document.getElementById('piStatus');
    const spinner = document.getElementById('piSpinner');

    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      status.textContent = `File: ${file.name} (${Math.round(file.size / 1024)} KB)`;
      spinner.style.display = 'block';
      fileInput.disabled = true;
      try {
        let dataUrl = await fileToBase64(file);
        dataUrl = await compressImage(dataUrl);
        const result = await callParseApi(dataUrl);
        const rows = Array.isArray(result.rows) ? result.rows : [];
        renderPreview(
          rows,
          result.meta,
          rows.length
            ? `Berhasil membaca ${rows.length} baris. Koreksi jika perlu (⚠ = jam≠durasi).`
            : result.error || 'Tidak ada baris terdeteksi.',
        );
      } catch (err) {
        spinner.style.display = 'none';
        fileInput.disabled = false;
        status.textContent = '';
        const msg = err?.message || String(err);
        UI?.toast?.(msg, true, 'warn');
        status.textContent = 'Gagal: ' + msg;
        status.style.color = 'var(--red, #c00)';
      }
    });
  };

  const renderHome = () => {
    const modal = document.getElementById('photoImportModal');
    if (!modal) return;
    modal.innerHTML = `
      <div class="bf-head" style="padding:14px 16px 8px">
        <div>
          <h3 class="qm-title"><span class="bolt">⚡</span> Input cepat dari form TKL</h3>
          <p class="qm-sub">Pilih cara: paste hasil AI atau upload foto langsung di app.</p>
        </div>
        <button type="button" class="bf-x" data-pi="close" aria-label="Tutup">×</button>
      </div>
      <div style="padding:12px 16px 20px;display:flex;flex-direction:column;gap:12px">
        <button type="button" class="btn btn-primary" data-pi="paste" style="padding:16px;text-align:left;height:auto">
          <div style="font-size:16px;font-weight:700">📋 Paste dari AI</div>
          <div style="font-size:12px;opacity:.9;font-weight:400;margin-top:4px">Foto + prompt ke Meta AI / Gemini → copy JSON → paste di sini. Cepat & tanpa tunggu server app.</div>
        </button>
        <button type="button" class="btn btn-ghost" data-pi="upload" style="padding:16px;text-align:left;height:auto;border:1px solid var(--border,#ccc)">
          <div style="font-size:16px;font-weight:700">📷 Upload foto di app</div>
          <div style="font-size:12px;opacity:.75;font-weight:400;margin-top:4px">Otomatis lewat Supabase + Gemini.</div>
        </button>
      </div>
      <div class="bf-footer" style="padding:8px 16px 16px">
        <div class="qm-actions" style="width:100%;justify-content:flex-end">
          <button type="button" class="btn btn-ghost" data-pi="close">Batal</button>
        </div>
      </div>
    `;
    modal.querySelectorAll('[data-pi="close"]').forEach((b) => b.addEventListener('click', close));
    modal.querySelector('[data-pi="paste"]')?.addEventListener('click', () => renderPaste());
    modal.querySelector('[data-pi="upload"]')?.addEventListener('click', () => renderUpload());
  };

  const open = (mode) => {
    try {
      const rows = Rows.rows();
      const idx = rows.findIndex((tr) => {
        const k = tr.querySelector('[data-f="kode"]');
        return k && !k.value.trim();
      });
      startRow = idx >= 0 ? idx + 1 : rows.length + 1 || 1;
    } catch (_) {
      startRow = 1;
    }
    ensureOverlay();
    if (mode === 'paste') renderPaste();
    else if (mode === 'upload') renderUpload();
    else renderHome();
    document.getElementById('photoImportOverlay')?.classList.remove('hide');
  };

  const bind = () => {
    document.getElementById('btnPhotoImport')?.addEventListener('click', () => open());
    document.getElementById('btnPhotoPaste')?.addEventListener('click', () => open('paste'));
  };

  return { open, bind, close, AI_PROMPT };
})();
