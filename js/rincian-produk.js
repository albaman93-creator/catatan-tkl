/**
 * RINCIAN-PRODUK.JS — Issue #14
 * Dashboard rekap kegiatan + perhitungan per produk.
 * - Tabel detail kegiatan (format backup Google Sheet)
 * - Tabel rekap per produk (Time Available, E, C, breakdown, output)
 * - Unduh Excel: sheet "Line 1", "Line 2", "Line 4" + "all proses produk"
 */
const RincianProduk = (() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const LINES = ['1', '2', '4'];
  const STAGES = ['filling', 'kemas', 'mixing', 'steril', 'visual'];

  let raw = [];
  let detailRows = [];
  let summaryRows = [];
  let batchRows = [];

  const num = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (v == null || v === '') return 0;
    let s = String(v).replace('%', '').trim();
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };
  const esc = (s) => (typeof Utils !== 'undefined' && Utils.escapeHtml
    ? Utils.escapeHtml(String(s ?? ''))
    : String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const fmtD = (iso) => {
    const s = String(iso || '');
    return s.length >= 10 ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : s;
  };
  const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const hariOf = (iso) => {
    const s = String(iso || '').slice(0, 10);
    if (s.length < 10) return '';
    const d = new Date(s + 'T12:00:00');
    return Number.isNaN(d.getTime()) ? '' : HARI_ID[d.getDay()];
  };
  const say = (msg, err) => {
    const el = $('rpStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'oee-filter-status' + (err ? ' err' : '');
  };

  const slotsOf = (products) => {
    const p = products || {};
    return [1, 2, 3].map((i) => {
      const name = String(p['p' + i + 'Name'] || '').trim();
      const bn = String(p['p' + i + 'Bn'] || '').trim();
      return {
        name,
        bn,
        wo: String(p['p' + i + 'Wo'] || '').trim(),
        label: name ? (bn ? name + ' ' + bn : name) : '',
        rate: num(p['p' + i + 'Rate']),
      };
    });
  };

  /** Ambil kode produk + nomor BATCH (BN), bukan No. WO. */
  const parseProd = (batchVal, slots) => {
    const raw = String(batchVal || '').trim();
    if (!raw) return { produk: '', batch: '' };
    const toks = raw.split(/\s+/);
    const code = toks[0] || '';
    let batch = toks.slice(1).join(' '); // sisa label baris = BN bila format "KODE BN"
    if (!batch) {
      for (const s of slots) {
        if (!s.name) continue;
        if (raw === s.name || raw.startsWith(s.name + ' ') || raw.toUpperCase() === s.name.toUpperCase()) {
          // Prioritas: BN master produk; fallback potongan label "KODE BN"
          batch = String(s.bn || '').trim();
          if (!batch && s.label) batch = String(s.label).split(/\s+/).slice(1).join(' ');
          break;
        }
      }
    }
    return { produk: code, batch };
  };

  const durOf = (x) => {
    if (typeof Utils !== 'undefined' && Utils.parseTime) {
      const s = Utils.parseTime(x.mulai), e = Utils.parseTime(x.selesai);
      if (s != null && e != null) return (e - s + 1440) % 1440;
    }
    return num(x.durasi);
  };

  /** True jika record punya minimal satu kode produk di master sheet. */
  const recordHasProduct = (r) => {
    const p = (r.payload || {}).products || {};
    return [p.p1Name, p.p2Name, p.p3Name].some((n) => String(n || '').trim() !== '');
  };

  /** Baris detail kegiatan — format issue #14
   *  Hanya record yang punya produk terdaftar; baris tanpa kode produk di-skip. */
  /** Menit dari 00:00; untuk urutan kronologis shift malam (S3) waktu < 07:00 digeser +1440. */
  const mulaiSortKey = (mulaiStr, shift) => {
    let m = null;
    if (typeof Utils !== 'undefined' && Utils.parseTime) m = Utils.parseTime(mulaiStr);
    if (m == null) {
      const p = String(mulaiStr || '').split(':');
      if (p.length >= 2) m = (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
    }
    if (m == null || isNaN(m)) return 9999;
    const si = Number(shift) || 0;
    // Shift 3 mulai ~23:30: jam 00:xx–06:xx adalah lanjutan, urut setelah 23:xx
    if (si === 3 && m < 420) m += 1440;
    return m;
  };

  const buildDetail = (recs) => {
    const out = [];
    recs.forEach((r) => {
      if (!recordHasProduct(r)) return;
      const pay = r.payload || {};
      const rows = Array.isArray(pay.rows) ? pay.rows : [];
      const slots = slotsOf(pay.products);
      const hasMaster = slots.some((s) => s.name);
      if (!hasMaster) return;
      const op = String(pay.operator || pay.inisial || r.inisial_operator || '').trim();
      // Fallback produk/batch dari master slot pertama (untuk baris planned/setup tanpa batch)
      const fallbackSlot = slots.find((s) => s.name) || {};
      const fallbackProduk = String(fallbackSlot.name || '').trim();
      const fallbackBatch = String(fallbackSlot.bn || '').trim()
        || String(fallbackSlot.label || '').split(/\s+/).slice(1).join(' ').trim();

      rows.forEach((x) => {
        let { produk, batch } = parseProd(x.batch, slots);
        // Issue #26: baris tanpa kode produk (setup/planned) tetap ditampilkan
        // dengan mewarisi produk/batch dari master record, agar timeline tidak terputus.
        if (!produk || produk === '—') {
          if (!fallbackProduk) return; // record tanpa master — skip
          produk = fallbackProduk;
          batch = fallbackBatch || '—';
        }
        const mulai = String(x.mulai || '').trim();
        const selesai = String(x.selesai || '').trim();
        const kegiatan = String(x.kegiatan || x.masalah || '').trim();
        const masalah = String(x.masalah || '').trim();
        const durasi = durOf(x);
        const good = num(x.good);
        const defect = num(x.defect);
        // Lewati baris kosong sisa template log sheet (25 baris default tanpa input)
        const hasInput = !!(mulai || selesai || kegiatan || masalah || (durasi != null && durasi > 0) || good > 0 || defect > 0);
        if (!hasInput) return;
        const tgl = String(r.date || '').slice(0, 10);
        out.push({
          produk,
          batch: batch || '—',
          hari: hariOf(tgl),
          tgl,
          shift: r.shift,
          tahapan: String(r.tahapan || '').toLowerCase(),
          line: String(r.line ?? ''),
          mulai,
          selesai,
          kegiatan,
          durasi,
          masalah,
          good,
          defect,
          operator: op || String(x.op || '').trim() || '—',
          kode: String(x.kode || '').trim(),
          _sortMulai: mulaiSortKey(mulai, r.shift),
        });
      });
    });
    out.sort((a, b) =>
      (a.tgl < b.tgl ? -1 : a.tgl > b.tgl ? 1 : 0) ||
      (String(a.line).localeCompare(String(b.line))) ||
      (Number(a.shift) - Number(b.shift)) ||
      ((a._sortMulai || 0) - (b._sortMulai || 0))
    );
    return out;
  };

  /**
   * Rekap per produk × tanggal × shift × line × tahapan
   * Kolom: Time Available, Waktu Produksi Terencana (C), breakdown unplanned (D),
   * Waktu Operasional (E), standart output, good, defect
   */
  const buildSummary = (recs) => {
    const out = [];
    recs.forEach((r) => {
      if (typeof WeeklyCalc === 'undefined') return;
      const re = WeeklyCalc.recompute(r);
      const slots = re.slots || [];
      slots.forEach((s, i) => {
        if (!s.label && !s.name) return;
        const st = re.perSlot[i];
        if (!st || !st.active) return;
        const code = String(s.name || (s.label || '').split(/\s+/)[0] || '').trim();
        // Nomor batch = BN (bukan No. WO). Dari field bn / label "KODE BN" / baris produksi.
        let bn = String(s.bn || '').trim()
          || String(s.label || '').split(/\s+/).slice(1).join(' ').trim();
        const rate = st.rate || s.rate || 0;
        const actual = st.actual || 0;
        // good/defect + BN dari baris produksi yang match slot
        let good = 0, defect = 0;
        (re.info || []).forEach((inf) => {
          if (inf.cat !== 'prod' || !inf.inShift) return;
          const lab = typeof WeeklyCalc.rowLabel === 'function'
            ? WeeklyCalc.rowLabel(inf.x, slots)
            : String(inf.x.batch || '');
          if (typeof WeeklyCalc.matches === 'function') {
            if (!WeeklyCalc.matches(lab, s.label || code)) return;
          } else if (code && !String(lab).toUpperCase().startsWith(code.toUpperCase())) return;
          good += inf.g; defect += inf.d;
          if (!bn) {
            const toks = String(lab || '').trim().split(/\s+/);
            if (toks.length >= 2) bn = toks.slice(1).join(' ');
          }
        });
        const stdOut = Math.round(rate * re.E);
        const actualOut = good + defect;
        // OEE OPE: A = E/C, P = actual/stdOut, Q = good/actual
        const aOpe = re.C > 0 ? (re.E / re.C) * 100 : 0;
        const pOpe = stdOut > 0 ? (actualOut / stdOut) * 100 : 0;
        const qOpe = actualOut > 0 ? (good / actualOut) * 100 : 0;
        const oeeOpe = (aOpe * pOpe * qOpe) / 10000;
        // OEE 365: A = E / Time Available Filling, P & Q sama
        const a365 = re.availBase > 0 ? (re.E / re.availBase) * 100 : 0;
        const oee365 = (a365 * pOpe * qOpe) / 10000;
        const pay = r.payload || {};
        const inisial = String(pay.operator || pay.inisial || r.inisial_operator || '').trim() || '—';

        out.push({
          produk: code || '—',
          batch: bn || '—',
          tgl: String(r.date || '').slice(0, 10),
          shift: r.shift,
          line: String(r.line ?? ''),
          tahapan: String(r.tahapan || '').toLowerCase(),
          timeAvailable: re.availBase,
          waktuProduksiTerencana: re.C,
          breakdownUnplanned: re.D,
          waktuOperasional: re.E,
          standartOutput: stdOut,
          good,
          defect,
          rate,
          aOpe,
          pOpe,
          qOpe,
          oeeOpe,
          a365,
          p365: pOpe,
          q365: qOpe,
          oee365,
          inisial,
        });
      });
    });
    out.sort((a, b) =>
      (a.tgl < b.tgl ? -1 : a.tgl > b.tgl ? 1 : 0) ||
      a.produk.localeCompare(b.produk) ||
      (Number(a.shift) - Number(b.shift))
    );
    return out;
  };

  const fetchRows = async (from, to) => {
    const client = typeof SupabaseClient !== 'undefined' ? SupabaseClient.getClient() : null;
    if (!client) throw new Error('Supabase belum terhubung');
    const out = [];
    for (let i = 0; i < 40; i++) {
      const { data, error } = await client.from(CONFIG.DB_TABLE)
        .select('date,shift,line,tahapan,payload,inisial_operator,key')
        .gte('date', from).lte('date', to)
        .order('date', { ascending: true })
        .order('key', { ascending: true })
        .range(i * 1000, i * 1000 + 999);
      if (error) throw error;
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return out;
  };

  /** Bulan produksi record: utamakan payload.prodMonth, fallback bulan kalender. */
  const recordMonth = (r) => {
    const pm = r.payload && r.payload.prodMonth != null ? String(r.payload.prodMonth).trim() : '';
    if (pm) {
      let n = parseInt(pm, 10);
      if (!n) {
        const map = { JAN:1,FEB:2,MAR:3,APR:4,MEI:5,MAY:5,JUN:6,JUL:7,AGU:8,AUG:8,SEP:9,OKT:10,OCT:10,NOV:11,DES:12,DEC:12 };
        n = map[pm.toUpperCase().slice(0, 3)] || 0;
      }
      if (n) return String(n);
    }
    const ymd = String(r.date || '').slice(0, 10);
    return String(parseInt(ymd.slice(5, 7), 10) || 0);
  };

  const recordWeek = (r) => {
    const ymd = String(r.date || '').slice(0, 10);
    if (typeof ProdWeek !== 'undefined' && ProdWeek.weekNumFromYMD) {
      return String(ProdWeek.weekNumFromYMD(ymd));
    }
    const day = parseInt(ymd.slice(8, 10), 10) || 1;
    return String(day <= 7 ? 1 : day <= 14 ? 2 : day <= 21 ? 3 : 4);
  };

  const filterLocal = (recs) => {
    const f = (typeof WeeklyFilter !== 'undefined') ? WeeklyFilter.get('rp') : {};
    const product = (f.product || '').trim();
    const wantMonth = (f.month && f.month !== 'all') ? String(parseInt(f.month, 10)) : null;
    const wantWeek  = (f.week && f.week !== 'all') ? String(parseInt(f.week, 10)) : null;
    return recs.filter((r) => {
      // Hanya record dengan produk terdaftar di master sheet
      const prod = (r.payload || {}).products || {};
      if (![prod.p1Name, prod.p2Name, prod.p3Name].some((n) => String(n || '').trim())) return false;
      // Periode: prodMonth (cutoff manual) > tanggal kalender — sama seperti dashboard mesin
      if (wantMonth && recordMonth(r) !== wantMonth) return false;
      if (wantWeek && recordWeek(r) !== wantWeek) return false;
      if (!product) return true;
      // cocokkan kode produk / label batch (WeeklyCalc.matches bila ada)
      if (typeof WeeklyCalc !== 'undefined' && WeeklyCalc.matches) {
        const pay = r.payload || {};
        const slots = slotsOf(pay.products);
        if (slots.some((s) => s.label && WeeklyCalc.matches(s.label, product))) return true;
        if (slots.some((s) => s.name && WeeklyCalc.matches(s.name, product))) return true;
        const rows = Array.isArray(pay.rows) ? pay.rows : [];
        return rows.some((x) => {
          const raw = String(x.batch || '').trim();
          return raw && WeeklyCalc.matches(raw, product);
        });
      }
      const pay = r.payload || {};
      const slots = slotsOf(pay.products);
      const hitSlot = slots.some((s) =>
        (s.label && (s.label === product || s.label.toUpperCase().includes(product.toUpperCase()))) ||
        (s.name && s.name === product)
      );
      if (hitSlot) return true;
      const rows = Array.isArray(pay.rows) ? pay.rows : [];
      return rows.some((x) => {
        const raw = String(x.batch || '').trim();
        return raw === product || raw.toUpperCase().startsWith(product.toUpperCase());
      });
    });
  };

  const renderDetailTable = (rows) => {
    const body = $('rpDetailBody');
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="15">Tidak ada data kegiatan pada filter ini.</td></tr>';
      return;
    }
    const max = 500;
    const slice = rows.slice(0, max);
    let html = '';
    let prevKey = '';
    slice.forEach((r, i) => {
      // Pembatas saat ganti tanggal atau shift (atau line/tahapan)
      const key = [r.tgl, r.shift, r.line, r.tahapan].join('|');
      if (i > 0 && key !== prevKey) {
        html += '<tr class="rp-shift-sep" aria-hidden="true"><td colspan="15"></td></tr>';
      }
      prevKey = key;
      html += `<tr>
      <td>${esc(r.produk)}</td>
      <td class="mono">${esc(r.batch)}</td>
      <td>${esc(r.hari || hariOf(r.tgl))}</td>
      <td class="mono">${esc(fmtD(r.tgl))}</td>
      <td class="ctr">${esc(r.shift)}</td>
      <td>${esc(r.tahapan)}</td>
      <td class="ctr">${esc(r.line)}</td>
      <td class="mono">${esc(r.mulai)}</td>
      <td class="mono">${esc(r.selesai)}</td>
      <td>${esc(r.kegiatan)}</td>
      <td class="ctr">${r.durasi || ''}</td>
      <td>${esc(r.masalah)}</td>
      <td class="ctr">${r.good || ''}</td>
      <td class="ctr">${r.defect || ''}</td>
      <td>${esc(r.operator)}</td>
    </tr>`;
    });
    if (rows.length > max) {
      html += `<tr><td colspan="15"><i>Menampilkan ${max} dari ${rows.length} baris — unduh Excel untuk data lengkap.</i></td></tr>`;
    }
    body.innerHTML = html;
  };


  /** Format rentang tanggal: 01/10/2026 atau 01/10–02/10/2026 */
  const fmtDateRange = (dates) => {
    const uniq = [...new Set((dates || []).filter(Boolean))].sort();
    if (!uniq.length) return '—';
    const short = (iso) => {
      const s = String(iso);
      return s.length >= 10 ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(2, 4) : s;
    };
    if (uniq.length === 1) return short(uniq[0]);
    return short(uniq[0]) + '–' + short(uniq[uniq.length - 1]);
  };

  /**
   * Gabung baris rekap per batch yang sama (Produk+Batch+Line+Tahapan),
   * lintas shift & tanggal. TGL = rentang bila beda hari.
   */
  const aggregateByBatch = (rows) => {
    const map = new Map();
    rows.forEach((r) => {
      const key = [r.produk, r.batch, r.line, r.tahapan].join('|');
      if (!map.has(key)) {
        map.set(key, {
          produk: r.produk,
          batch: r.batch,
          line: r.line,
          tahapan: r.tahapan,
          dates: [],
          timeAvailable: 0,
          waktuProduksiTerencana: 0,
          breakdownUnplanned: 0,
          waktuOperasional: 0,
          standartOutput: 0,
          good: 0,
          defect: 0,
        });
      }
      const e = map.get(key);
      if (r.tgl) e.dates.push(r.tgl);
      e.timeAvailable += Number(r.timeAvailable) || 0;
      e.waktuProduksiTerencana += Number(r.waktuProduksiTerencana) || 0;
      e.breakdownUnplanned += Number(r.breakdownUnplanned) || 0;
      e.waktuOperasional += Number(r.waktuOperasional) || 0;
      e.standartOutput += Number(r.standartOutput) || 0;
      e.good += Utils.parseArithmeticExpression(r.good) ?? 0;
      e.defect += Utils.parseArithmeticExpression(r.defect) ?? 0;
    });
    return [...map.values()]
      .map((e) => {
        const actualOut = e.good + e.defect;
        const aOpe = e.waktuProduksiTerencana > 0 ? (e.waktuOperasional / e.waktuProduksiTerencana) * 100 : 0;
        const pOpe = e.standartOutput > 0 ? (actualOut / e.standartOutput) * 100 : 0;
        const qOpe = actualOut > 0 ? (e.good / actualOut) * 100 : 0;
        const oeeOpe = (aOpe * pOpe * qOpe) / 10000;
        const a365 = e.timeAvailable > 0 ? (e.waktuOperasional / e.timeAvailable) * 100 : 0;
        const oee365 = (a365 * pOpe * qOpe) / 10000;
        return {
          ...e,
          tglLabel: fmtDateRange(e.dates),
          aOpe, pOpe, qOpe, oeeOpe,
          a365, p365: pOpe, q365: qOpe, oee365,
        };
      })
      .sort((a, b) =>
        a.produk.localeCompare(b.produk) ||
        String(a.batch).localeCompare(String(b.batch)) ||
        String(a.line).localeCompare(String(b.line)) ||
        (a.dates[0] || '').localeCompare(b.dates[0] || '')
      );
  };

  // Target untuk warna sel (mengikuti CONFIG.TARGET bila ada)
  const tgt = (typeof CONFIG !== 'undefined' && CONFIG.TARGET) ? CONFIG.TARGET : {
    AVAILABILITY: 90, PERFORMANCE: 98, QUALITY: 99.5, OEE: 88, OEE365: 55
  };
  const clsOpe = (v, target) =>
    Number.isFinite(v) && v >= target ? 'rp-ope-ok' : 'rp-ope-fail';
  const cls365 = (v, target) =>
    Number.isFinite(v) && v >= target ? 'rp-365-ok' : 'rp-365-fail';

  const renderBatchTable = (rows) => {
    const body = $('rpBatchBody');
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="20">Tidak ada data rekap batch.</td></tr>';
      return;
    }
    const max = 500;
    const slice = rows.slice(0, max);
    body.innerHTML = slice.map((r) => `<tr>
      <td>${esc(r.produk)}</td>
      <td class="mono">${esc(r.batch)}</td>
      <td class="mono">${esc(r.tglLabel)}</td>
      <td class="ctr">${esc(r.line)}</td>
      <td>${esc(r.tahapan)}</td>
      <td class="ctr">${r.timeAvailable}</td>
      <td class="ctr">${r.waktuProduksiTerencana}</td>
      <td class="ctr">${r.breakdownUnplanned}</td>
      <td class="ctr">${r.waktuOperasional}</td>
      <td class="ctr">${r.standartOutput}</td>
      <td class="ctr">${r.good}</td>
      <td class="ctr">${r.defect}</td>
      <td class="ctr ${clsOpe(r.aOpe, tgt.AVAILABILITY)}">${pct(r.aOpe)}</td>
      <td class="ctr ${clsOpe(r.pOpe, tgt.PERFORMANCE)}">${pct(r.pOpe)}</td>
      <td class="ctr ${clsOpe(r.qOpe, tgt.QUALITY)}">${pct(r.qOpe)}</td>
      <td class="ctr ${clsOpe(r.oeeOpe, tgt.OEE)}">${pct(r.oeeOpe)}</td>
      <td class="ctr ${cls365(r.a365, tgt.AVAILABILITY)}">${pct(r.a365)}</td>
      <td class="ctr ${cls365(r.p365, tgt.PERFORMANCE)}">${pct(r.p365)}</td>
      <td class="ctr ${cls365(r.q365, tgt.QUALITY)}">${pct(r.q365)}</td>
      <td class="ctr ${cls365(r.oee365, tgt.OEE365)}">${pct(r.oee365)}</td>
    </tr>`).join('');
    if (rows.length > max) {
      body.innerHTML += `<tr><td colspan="20"><i>Menampilkan ${max} dari ${rows.length} baris — unduh Excel untuk data lengkap.</i></td></tr>`;
    }
  };

  const pct = (v) => (Number.isFinite(v) ? Number(v).toFixed(2) + '%' : '—');

  const renderSummaryTable = (rows) => {
    const body = $('rpSummaryBody');
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="22">Tidak ada data rekap batch per shift.</td></tr>';
      return;
    }
    const max = 500;
    const slice = rows.slice(0, max);
    body.innerHTML = slice.map((r) => {
      const attrs = [
        'class="rp-row-link"',
        'title="Buka log sheet record ini"',
        'data-date="' + esc(r.tgl || '') + '"',
        'data-shift="' + esc(r.shift || '') + '"',
        'data-line="' + esc(r.line || '') + '"',
        'data-stage="' + esc(r.tahapan || '') + '"',
      ].join(' ');
      return `<tr ${attrs}>
      <td>${esc(r.produk)}</td>
      <td class="mono">${esc(r.batch)}</td>
      <td class="mono">${esc(fmtD(r.tgl))}</td>
      <td class="ctr">${esc(r.shift)}</td>
      <td class="ctr">${esc(r.line)}</td>
      <td>${esc(r.tahapan)}</td>
      <td class="ctr">${r.timeAvailable}</td>
      <td class="ctr">${r.waktuProduksiTerencana}</td>
      <td class="ctr">${r.breakdownUnplanned}</td>
      <td class="ctr">${r.waktuOperasional}</td>
      <td class="ctr">${r.standartOutput}</td>
      <td class="ctr">${r.good}</td>
      <td class="ctr">${r.defect}</td>
      <td class="ctr">${pct(r.aOpe)}</td>
      <td class="ctr">${pct(r.pOpe)}</td>
      <td class="ctr">${pct(r.qOpe)}</td>
      <td class="ctr">${pct(r.oeeOpe)}</td>
      <td class="ctr">${pct(r.a365)}</td>
      <td class="ctr">${pct(r.p365)}</td>
      <td class="ctr">${pct(r.q365)}</td>
      <td class="ctr">${pct(r.oee365)}</td>
      <td>${esc(r.inisial)}</td>
    </tr>`;
    }).join('');
    if (rows.length > max) {
      body.innerHTML += `<tr><td colspan="22"><i>Menampilkan ${max} dari ${rows.length} baris — unduh Excel untuk data lengkap.</i></td></tr>`;
    }
  };

  /** Klik baris rekap batch per shift → buka log sheet tanggal/shift/line/tahapan itu */
  const openSummaryRow = (tr) => {
    if (!tr || !tr.dataset || !tr.dataset.date) return;
    if (typeof UI === 'undefined' || !UI.openRecord) {
      console.warn('RincianProduk: UI.openRecord tidak tersedia');
      return;
    }
    UI.openRecord({
      date: String(tr.dataset.date),
      shift: String(tr.dataset.shift || 1),
      line: String(tr.dataset.line || ''),
      stage: String(tr.dataset.stage || ''),
    });
  };

  const refreshView = () => {
    const filtered = filterLocal(raw);
    detailRows = buildDetail(filtered);
    summaryRows = buildSummary(filtered);
    batchRows = aggregateByBatch(summaryRows);
    renderDetailTable(detailRows);
    renderSummaryTable(summaryRows);
    renderBatchTable(batchRows);
    const rangeTxt = ($('rpStatus') && $('rpStatus').dataset.range) || '';
    say(`✓ ${filtered.length} record · ${detailRows.length} kegiatan · ${summaryRows.length} rekap produk · ${batchRows.length} rekap batch` + (rangeTxt ? ' · ' + rangeTxt : ''));
  };

  const load = async () => {
    const f = (typeof WeeklyFilter !== 'undefined')
      ? WeeklyFilter.get('rp')
      : { year: String(new Date().getFullYear()), month: 'all', week: 'all', product: '' };
    // Fetch tahun penuh bila bulan spesifik agar record dengan prodMonth
    // di luar kalender bulan (cutoff) tetap ikut — sama seperti dashboard mesin.
    const yearRange = (typeof WeeklyFilter !== 'undefined' && WeeklyFilter.toDateRange)
      ? WeeklyFilter.toDateRange(f.year, 'all', 'all')
      : { from: f.year + '-01-01', to: f.year + '-12-31' };
    const from = yearRange.from;
    const to = yearRange.to;
    const label = (typeof WeeklyFilter !== 'undefined' && WeeklyFilter.rangeLabel)
      ? WeeklyFilter.rangeLabel(f.year, f.month, f.week)
      : (from + ' – ' + to);
    say('Memuat data · ' + label + '…');
    try {
      raw = await fetchRows(from, to);
      // Filter periode dulu, lalu isi dropdown produk dari hasil filter
      const periodRows = filterLocal(raw.map((r) => r).filter((r) => {
        // filterLocal termasuk product — untuk opsi produk, ignore product dulu
        return true;
      }));
      // Opsi produk: hanya dari record yang lolos filter bulan/week (tanpa product)
      const forOpts = (() => {
        const wantMonth = (f.month && f.month !== 'all') ? String(parseInt(f.month, 10)) : null;
        const wantWeek  = (f.week && f.week !== 'all') ? String(parseInt(f.week, 10)) : null;
        return raw.filter((r) => {
          const prod = (r.payload || {}).products || {};
          if (![prod.p1Name, prod.p2Name, prod.p3Name].some((n) => String(n || '').trim())) return false;
          if (wantMonth && recordMonth(r) !== wantMonth) return false;
          if (wantWeek && recordWeek(r) !== wantWeek) return false;
          return true;
        });
      })();
      if (typeof WeeklyFilter !== 'undefined' && WeeklyCalc && WeeklyCalc.productOptions) {
        try {
          WeeklyFilter.populate('rp', WeeklyCalc.productOptions(forOpts));
        } catch (_) { /* ignore */ }
      } else {
        populateProductFallback(forOpts);
      }
      if ($('rpStatus')) $('rpStatus').dataset.range = label;
      refreshView();
    } catch (e) {
      console.warn(e);
      say('Gagal memuat: ' + (e.message || e), true);
    }
  };

  /** Fallback opsi produk bila WeeklyCalc.productOptions tidak ada */
  const populateProductFallback = (recs) => {
    const sel = $('rpProduct');
    if (!sel) return;
    const keep = sel.value;
    const set = new Map();
    recs.forEach((r) => {
      const slots = slotsOf((r.payload || {}).products);
      slots.forEach((s) => {
        if (s.name) set.set(s.name, s.label || s.name);
      });
    });
    let html = '<option value="">Semua produk</option>';
    [...set.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([code, label]) => {
      html += `<option value="${esc(code)}">${esc(label || code)}</option>`;
    });
    sel.innerHTML = html;
    if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
  };

  const loadXlsx = () => new Promise((resolve, reject) => {
    if (window.XLSX) return resolve(window.XLSX);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error('Gagal memuat library Excel'));
    document.head.appendChild(s);
  });

  const DETAIL_HEADER = [
    'Produk', 'Batch Number', 'Hari', 'TGL', 'Shift', 'tahapan proses', 'Line',
    'jam mulai', 'jam selesai', 'kegiatan', 'durasi', 'MASALAH', 'good', 'defect', 'operator/inisial'
  ];
  const SUMMARY_HEADER = [
    'Produk', 'batch number', 'TGL', 'shift', 'Line', 'tahapan proses',
    'Time Available', 'Waktu Produksi Terencana', 'waktu breakdown tidak terencana',
    'Waktu Operasional', 'standart output', 'good', 'defect',
    'A OPE', 'P OPE', 'Q OPE', 'OEE OPE',
    'A 365', 'P 365', 'Q 365', 'OEE 365',
    'inisial operator'
  ];

  const detailToAoA = (rows) => {
    const aoa = [DETAIL_HEADER];
    rows.forEach((r) => {
      aoa.push([
        r.produk, r.batch, r.hari || hariOf(r.tgl), r.tgl, r.shift, r.tahapan, r.line,
        r.mulai, r.selesai, r.kegiatan, r.durasi, r.masalah, r.good, r.defect, r.operator
      ]);
    });
    return aoa;
  };

  const summaryToAoA = (rows) => {
    const aoa = [SUMMARY_HEADER];
    rows.forEach((r) => {
      aoa.push([
        r.produk, r.batch, r.tgl, r.shift, r.line, r.tahapan,
        r.timeAvailable, r.waktuProduksiTerencana, r.breakdownUnplanned,
        r.waktuOperasional, r.standartOutput, r.good, r.defect,
        Number.isFinite(r.aOpe) ? Number(r.aOpe).toFixed(2) + '%' : '',
        Number.isFinite(r.pOpe) ? Number(r.pOpe).toFixed(2) + '%' : '',
        Number.isFinite(r.qOpe) ? Number(r.qOpe).toFixed(2) + '%' : '',
        Number.isFinite(r.oeeOpe) ? Number(r.oeeOpe).toFixed(2) + '%' : '',
        Number.isFinite(r.a365) ? Number(r.a365).toFixed(2) + '%' : '',
        Number.isFinite(r.p365) ? Number(r.p365).toFixed(2) + '%' : '',
        Number.isFinite(r.q365) ? Number(r.q365).toFixed(2) + '%' : '',
        Number.isFinite(r.oee365) ? Number(r.oee365).toFixed(2) + '%' : '',
        r.inisial || ''
      ]);
    });
    return aoa;
  };

  const downloadExcel = async () => {
    if (!detailRows.length && !summaryRows.length) {
      say('Tidak ada data untuk diunduh. Terapkan filter dulu.', true);
      return;
    }
    try {
      say('Menyiapkan file Excel…');
      const XLSX = await loadXlsx();
      const wb = XLSX.utils.book_new();

      // Sheet per line (kegiatan) — Line 1, Line 2, Line 4
      LINES.forEach((ln) => {
        const rows = detailRows.filter((r) => String(r.line) === ln);
        const ws = XLSX.utils.aoa_to_sheet(detailToAoA(rows));
        XLSX.utils.book_append_sheet(wb, ws, 'Line ' + ln);
      });
      // Sheet lain (line di luar 1/2/4) jika ada
      const other = detailRows.filter((r) => !LINES.includes(String(r.line)));
      if (other.length) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detailToAoA(other)), 'Line lain');
      }
      // Rekap per produk
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryToAoA(summaryRows)), 'all proses produk');
      // Rekap per batch (gabungan lintas shift/tanggal)
      const batchHeader = [
        'Produk', 'Batch', 'TGL', 'Line', 'tahapan proses',
        'Time Available', 'Waktu Produksi Terencana', 'waktu breakdown tidak terencana',
        'Waktu Operasional', 'standart output', 'good', 'defect',
        'A OPE', 'P OPE', 'Q OPE', 'OEE OPE',
        'A 365', 'P 365', 'Q 365', 'OEE 365'
      ];
      const batchAoa = [batchHeader];
      batchRows.forEach((r) => {
        batchAoa.push([
          r.produk, r.batch, r.tglLabel, r.line, r.tahapan,
          r.timeAvailable, r.waktuProduksiTerencana, r.breakdownUnplanned,
          r.waktuOperasional, r.standartOutput, r.good, r.defect,
          Number.isFinite(r.aOpe) ? Number(r.aOpe).toFixed(2) + '%' : '',
          Number.isFinite(r.pOpe) ? Number(r.pOpe).toFixed(2) + '%' : '',
          Number.isFinite(r.qOpe) ? Number(r.qOpe).toFixed(2) + '%' : '',
          Number.isFinite(r.oeeOpe) ? Number(r.oeeOpe).toFixed(2) + '%' : '',
          Number.isFinite(r.a365) ? Number(r.a365).toFixed(2) + '%' : '',
          Number.isFinite(r.p365) ? Number(r.p365).toFixed(2) + '%' : '',
          Number.isFinite(r.q365) ? Number(r.q365).toFixed(2) + '%' : '',
          Number.isFinite(r.oee365) ? Number(r.oee365).toFixed(2) + '%' : ''
        ]);
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(batchAoa), 'rekap per batch');

      const f = (typeof WeeklyFilter !== 'undefined') ? WeeklyFilter.get('rp') : {};
      const range = (typeof WeeklyFilter !== 'undefined' && WeeklyFilter.toDateRange)
        ? WeeklyFilter.toDateRange(f.year, f.month, f.week)
        : { from: 'all', to: 'all' };
      const name = `rincian-produk_${range.from}_${range.to}.xlsx`;
      XLSX.writeFile(wb, name);
      say(`✓ File diunduh: ${name}`);
    } catch (e) {
      console.warn(e);
      say('Gagal unduh Excel: ' + (e.message || e), true);
    }
  };

  const open = () => {
    if (typeof WeeklyFilter !== 'undefined') {
      WeeklyFilter.initYear('rp');
      WeeklyFilter.syncWeekEnabled('rp');
    }
    const tab = document.querySelector('.rp-tab.is-on')?.dataset.rpTab || 'detail';
    showTab(tab);
    if (!raw.length) load();
    else refreshView();
  };

  const showTab = (tab) => {
    document.querySelectorAll('.rp-tab').forEach((b) => b.classList.toggle('is-on', b.dataset.rpTab === tab));
    const d = $('rpPanelDetail');
    const s = $('rpPanelSummary');
    const b = $('rpPanelBatch');
    if (d) d.hidden = tab !== 'detail';
    if (s) s.hidden = tab !== 'summary';
    if (b) b.hidden = tab !== 'batch';
  };

  const bind = () => {
    if (typeof WeeklyFilter !== 'undefined') {
      WeeklyFilter.initYear('rp');
      WeeklyFilter.syncWeekEnabled('rp');
    }
    $('rpApply')?.addEventListener('click', load);
    $('rpReset')?.addEventListener('click', () => {
      if (typeof WeeklyFilter !== 'undefined') WeeklyFilter.reset('rp');
      else {
        if ($('rpYear')) $('rpYear').value = String(new Date().getFullYear());
        if ($('rpMonth')) $('rpMonth').value = 'all';
        if ($('rpWeek')) { $('rpWeek').value = 'all'; $('rpWeek').disabled = true; }
        if ($('rpProduct')) $('rpProduct').value = '';
      }
      load();
    });
    $('rpDownload')?.addEventListener('click', downloadExcel);
    document.querySelectorAll('.rp-tab').forEach((b) => {
      b.addEventListener('click', () => showTab(b.dataset.rpTab));
    });
    $('rpSummaryBody')?.addEventListener('click', (e) => {
      const tr = e.target.closest('tr.rp-row-link');
      if (tr) openSummaryRow(tr);
    });
    // Tahun/Bulan/Week → fetch ulang; Produk → filter lokal
    ['rpYear', 'rpMonth', 'rpWeek'].forEach((id) => {
      $(id)?.addEventListener('change', () => {
        if (id === 'rpMonth' && typeof WeeklyFilter !== 'undefined') WeeklyFilter.syncWeekEnabled('rp');
      });
    });
    $('rpProduct')?.addEventListener('change', () => { if (raw.length) refreshView(); });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  return { open, load, downloadExcel };
})();
