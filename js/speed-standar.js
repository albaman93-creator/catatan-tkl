/**
 * speed-standar.js
 * Screen: Speed Standar (data-screen="speed-standar")
 *
 * Tabel 1 — data nyata dari oee_data (Supabase) per bulan
 * Tabel 2 — master manual admin di tabel speed_standar (Supabase cloud)
 */
const SpeedStandar = (() => {
  'use strict';

  const SCREEN = 'speed-standar';
  const MON = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  /** @type {{ year: number, month: number }} */
  let cursor = (() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  })();

  let loading = false;
  let savingManual = false;

  /**
   * Baris admin. id = uuid dari Supabase (null untuk baris baru).
   * @type {{ id: string|null, line: string, produk: string, rate: string }[]}
   */
  let manualRows = [];

  const qs = (sel, rootEl = document) => rootEl.querySelector(sel);
  const root = () => qs(`.sec[data-screen="${SCREEN}"]`);
  const pad2 = (n) => String(n).padStart(2, '0');

  const getClient = () =>
    (typeof SupabaseClient !== 'undefined') ? SupabaseClient.getClient() : null;

  const speedTable = () =>
    (typeof CONFIG !== 'undefined' && CONFIG.DB_SPEED_STANDAR_TABLE)
      ? CONFIG.DB_SPEED_STANDAR_TABLE
      : 'speed_standar';

  const oeeTable = () =>
    (typeof CONFIG !== 'undefined' && CONFIG.DB_TABLE) ? CONFIG.DB_TABLE : 'oee_data';

  const monthRange = (y, m) => {
    const from = `${y}-${pad2(m + 1)}-01`;
    const last = new Date(y, m + 1, 0).getDate();
    const to = `${y}-${pad2(m + 1)}-${pad2(last)}`;
    return { from, to };
  };

  const monthLabel = (y, m) => `${MON[m]} ${y}`;

  const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const num = (v) => {
    if (v == null || v === '') return null;
    const n = Number(String(v).replace(',', '.').trim());
    return Number.isFinite(n) ? n : null;
  };

  const setStatus = (msg, kind = '') => {
    const el = qs('#ssStatus', root());
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'ss-status' + (kind ? ` ${kind}` : '');
  };

  const setSaveHint = (msg, kind = '') => {
    const hint = qs('#ssSaveHint', root());
    if (!hint) return;
    hint.textContent = msg || '';
    hint.className = 'ss-save-hint' + (kind ? ` ${kind}` : '');
  };

  const renderMonthLabel = () => {
    const el = qs('#ssMonthLabel', root());
    if (el) el.textContent = monthLabel(cursor.year, cursor.month);
  };

  /* ========== TABEL 1: oee_data ========== */

  const extractProducts = (rec) => {
    const out = [];
    const line = String(rec?.line ?? '').trim() || '—';
    const p = rec?.payload?.products || {};
    const updatedAt = rec?.updatedAt || rec?.date || '';

    for (let i = 1; i <= 3; i++) {
      const name = String(p[`p${i}Name`] || '').trim();
      const rate = num(p[`p${i}Rate`]);
      if (!name) continue;
      if (rate == null || rate <= 0) continue;
      out.push({ line, produk: name, rate, updatedAt, date: rec?.date || '' });
    }
    return out;
  };

  const dedupe = (items) => {
    const map = new Map();
    for (const it of items) {
      const key = `${it.line}|${it.produk}`.toLowerCase();
      const prev = map.get(key);
      if (!prev) {
        map.set(key, it);
        continue;
      }
      const prevTs = String(prev.updatedAt || prev.date || '');
      const curTs = String(it.updatedAt || it.date || '');
      if (curTs >= prevTs) map.set(key, it);
    }
    return [...map.values()].sort((a, b) => {
      const la = a.line.localeCompare(b.line, 'id', { numeric: true });
      if (la !== 0) return la;
      return a.produk.localeCompare(b.produk, 'id', { sensitivity: 'base' });
    });
  };

  const setTbody1 = (html) => {
    const tb = qs('#ssTbody1', root());
    if (tb) tb.innerHTML = html;
  };

  const renderTable1 = (rows) => {
    if (!rows.length) {
      setTbody1(`<tr class="ss-empty-row"><td colspan="4">Belum ada data</td></tr>`);
      setStatus(`Tidak ada speed standar tercatat di ${monthLabel(cursor.year, cursor.month)}.`);
      return;
    }
    setTbody1(rows.map((r, i) => `
      <tr>
        <td class="ss-col-no">${i + 1}</td>
        <td class="ss-col-line">${esc(r.line)}</td>
        <td class="ss-col-produk">${esc(r.produk)}</td>
        <td class="ss-col-speed">${esc(String(r.rate).replace('.', ','))} <span class="ss-unit-inline">bag/menit</span></td>
      </tr>`).join(''));
    setStatus(`✓ Tabel 1: ${rows.length} produk unik · ${monthLabel(cursor.year, cursor.month)}`);
  };

  /** Bulan produksi record: utamakan payload.prodMonth, fallback bulan kalender (sama Rincian/Dashboard). */
  const recordMonth = (rec) => {
    const pm = rec?.payload && rec.payload.prodMonth != null ? String(rec.payload.prodMonth).trim() : '';
    if (pm) {
      let n = parseInt(pm, 10);
      if (!n) {
        const map = {
          JAN: 1, FEB: 2, MAR: 3, APR: 4, MEI: 5, MAY: 5, JUN: 6,
          JUL: 7, AGU: 8, AUG: 8, SEP: 9, OKT: 10, OCT: 10, NOV: 11, DES: 12, DEC: 12
        };
        n = map[pm.toUpperCase().slice(0, 3)] || 0;
      }
      if (n) return n;
    }
    const ymd = String(rec?.date || '').slice(0, 10);
    return parseInt(ymd.slice(5, 7), 10) || 0;
  };

  const fetchMonth = async () => {
    if (loading) return;
    // Ambil tahun penuh agar record dengan prodMonth di luar kalender bulan tetap ikut
    const yearFrom = `${cursor.year}-01-01`;
    const yearTo = `${cursor.year}-12-31`;
    const wantMonth = cursor.month + 1; // 1–12
    const client = getClient();
    if (!client) {
      setTbody1(`<tr class="ss-empty-row"><td colspan="4">Supabase belum terhubung</td></tr>`);
      setStatus('Koneksi database tidak tersedia.', 'err');
      return;
    }

    loading = true;
    setTbody1(`<tr class="ss-loading-row"><td colspan="4">Memuat data…</td></tr>`);
    setStatus('Mengambil data dari database…');

    try {
      const { data, error } = await client
        .from(oeeTable())
        .select('date, line, payload, "updatedAt"')
        .gte('date', yearFrom)
        .lte('date', yearTo)
        .order('date', { ascending: false })
        .limit(8000);

      if (error) throw error;

      const records = Array.isArray(data) ? data : [];
      // Filter: prodMonth (tag di sheet) > bulan kalender — konsisten dengan Rincian per Produk
      const inMonth = records.filter((rec) => recordMonth(rec) === wantMonth);
      const extracted = [];
      inMonth.forEach((rec) => {
        extractProducts(rec).forEach((item) => extracted.push(item));
      });
      renderTable1(dedupe(extracted));
    } catch (err) {
      console.error('[SpeedStandar] tabel1', err);
      setTbody1(`<tr class="ss-empty-row"><td colspan="4">Gagal memuat data</td></tr>`);
      setStatus(`Gagal memuat: ${err?.message || err}`, 'err');
    } finally {
      loading = false;
    }
  };

  /* ========== TABEL 2: speed_standar (Supabase) ========== */

  const emptyManual = () => [
    { id: null, line: '', produk: '', rate: '' },
    { id: null, line: '', produk: '', rate: '' }
  ];

  const renderTable2 = () => {
    const tb = qs('#ssTbody2', root());
    if (!tb) return;
    if (!manualRows.length) manualRows = emptyManual();

    tb.innerHTML = manualRows.map((r, i) => `
      <tr data-ss-row="${i}" data-ss-id="${esc(r.id || '')}">
        <td class="ss-col-no">${i + 1}</td>
        <td class="ss-col-line">
          <input type="text" class="ss-input" data-f="line" value="${esc(r.line)}" placeholder="Line" autocomplete="off">
        </td>
        <td class="ss-col-produk">
          <input type="text" class="ss-input" data-f="produk" value="${esc(r.produk)}" placeholder="Nama produk" autocomplete="off">
        </td>
        <td class="ss-col-speed">
          <div class="ss-rate-wrap">
            <input type="number" class="ss-input ss-input-rate" data-f="rate" value="${esc(r.rate)}" placeholder="0" min="0" step="any" inputmode="decimal">
            <span class="ss-unit-inline">bag/menit</span>
          </div>
        </td>
        <td class="ss-col-act">
          <button type="button" class="ss-del-btn" data-ss-del="${i}" title="Hapus baris" aria-label="Hapus">×</button>
        </td>
      </tr>`).join('');
  };

  const syncManualFromDom = () => {
    const tb = qs('#ssTbody2', root());
    if (!tb) return;
    manualRows = [...tb.querySelectorAll('tr[data-ss-row]')].map((tr) => ({
      id: tr.getAttribute('data-ss-id') || null,
      line: (tr.querySelector('[data-f="line"]')?.value || '').trim(),
      produk: (tr.querySelector('[data-f="produk"]')?.value || '').trim(),
      rate: (tr.querySelector('[data-f="rate"]')?.value || '').trim()
    }));
  };

  const loadManual = async () => {
    const client = getClient();
    const tb = qs('#ssTbody2', root());
    if (!client) {
      manualRows = emptyManual();
      renderTable2();
      setSaveHint('Supabase belum terhubung', 'err');
      return;
    }

    if (tb) {
      tb.innerHTML = `<tr class="ss-loading-row"><td colspan="5">Memuat master dari cloud…</td></tr>`;
    }

    try {
      const { data, error } = await client
        .from(speedTable())
        .select('id, line, produk, rate, "updatedAt"')
        .order('line', { ascending: true })
        .order('produk', { ascending: true });

      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];
      if (!rows.length) {
        manualRows = emptyManual();
      } else {
        manualRows = rows.map((r) => ({
          id: r.id || null,
          line: String(r.line ?? ''),
          produk: String(r.produk ?? ''),
          rate: r.rate == null || r.rate === '' ? '' : String(r.rate)
        }));
      }
      renderTable2();
      setSaveHint(rows.length ? `${rows.length} baris dari cloud` : '');
    } catch (err) {
      console.error('[SpeedStandar] load manual', err);
      // Tabel mungkin belum dibuat di Supabase
      const msg = err?.message || String(err);
      manualRows = emptyManual();
      renderTable2();
      setSaveHint(
        msg.includes('relation') || msg.includes('does not exist')
          ? 'Tabel speed_standar belum ada — jalankan SQL di database/'
          : `Gagal muat: ${msg}`,
        'err'
      );
    }
  };

  /**
   * Simpan ke Supabase:
   * 1. Ambil baris valid dari form (produk + rate wajib)
   * 2. Hapus semua baris cloud yang tidak lagi ada di form
   * 3. Upsert baris yang valid (insert baru / update yang punya id)
   */
  const saveManual = async () => {
    if (savingManual) return;
    const client = getClient();
    if (!client) {
      setSaveHint('Supabase belum terhubung', 'err');
      return;
    }

    syncManualFromDom();

    // Baris yang diisi (produk wajib, rate angka >= 0)
    const valid = [];
    const invalid = [];
    for (const r of manualRows) {
      if (!r.produk && !r.line && (r.rate === '' || r.rate == null)) continue; // baris kosong total diabaikan
      const rateN = num(r.rate);
      if (!r.produk || rateN == null || rateN < 0) {
        invalid.push(r);
        continue;
      }
      valid.push({
        id: r.id || null,
        line: r.line || '',
        produk: r.produk,
        rate: rateN
      });
    }

    if (invalid.length) {
      setSaveHint('Lengkapi Produk & Speed (angka) pada semua baris terisi', 'err');
      return;
    }

    savingManual = true;
    setSaveHint('Menyimpan ke cloud…');

    try {
      // ID yang tetap dipertahankan
      const keepIds = new Set(valid.filter((r) => r.id).map((r) => r.id));

      // Ambil semua id yang ada di cloud
      const { data: existing, error: exErr } = await client
        .from(speedTable())
        .select('id');
      if (exErr) throw exErr;

      const toDelete = (existing || [])
        .map((r) => r.id)
        .filter((id) => id && !keepIds.has(id));

      if (toDelete.length) {
        const { error: delErr } = await client
          .from(speedTable())
          .delete()
          .in('id', toDelete);
        if (delErr) throw delErr;
      }

      // Insert baris baru & update baris lama
      for (const r of valid) {
        const payload = {
          line: r.line,
          produk: r.produk,
          rate: r.rate
        };
        if (r.id) {
          const { error } = await client
            .from(speedTable())
            .update(payload)
            .eq('id', r.id);
          if (error) throw error;
        } else {
          const { data: inserted, error } = await client
            .from(speedTable())
            .insert(payload)
            .select('id')
            .single();
          if (error) throw error;
          r.id = inserted?.id || null;
        }
      }

      // Sinkron state lokal dengan hasil simpan
      manualRows = valid.length
        ? valid.map((r) => ({
            id: r.id,
            line: r.line,
            produk: r.produk,
            rate: String(r.rate)
          }))
        : emptyManual();
      renderTable2();
      setSaveHint(`Tersimpan di cloud ✓ (${valid.length} baris)`, 'ok');
      setTimeout(() => setSaveHint(''), 2500);
    } catch (err) {
      console.error('[SpeedStandar] save manual', err);
      const msg = err?.message || String(err);
      setSaveHint(
        msg.includes('relation') || msg.includes('does not exist')
          ? 'Tabel speed_standar belum ada — jalankan SQL setup dulu'
          : `Gagal simpan: ${msg}`,
        'err'
      );
    } finally {
      savingManual = false;
    }
  };

  const addManualRow = () => {
    syncManualFromDom();
    manualRows.push({ id: null, line: '', produk: '', rate: '' });
    renderTable2();
    const last = qs('#ssTbody2 tr:last-child [data-f="line"]', root());
    if (last) last.focus();
  };

  const deleteManualRow = async (idx) => {
    syncManualFromDom();
    const row = manualRows[idx];
    if (!row) return;

    // Jika sudah ada di cloud, hapus langsung
    if (row.id) {
      const client = getClient();
      if (client) {
        try {
          const { error } = await client.from(speedTable()).delete().eq('id', row.id);
          if (error) throw error;
        } catch (err) {
          console.error('[SpeedStandar] delete row', err);
          setSaveHint(`Gagal hapus: ${err?.message || err}`, 'err');
          return;
        }
      }
    }

    manualRows.splice(idx, 1);
    if (!manualRows.length) manualRows = emptyManual();
    renderTable2();
    setSaveHint('Baris dihapus', 'ok');
    setTimeout(() => setSaveHint(''), 1500);
  };

  /* ========== Navigasi & bind ========== */

  const shiftMonth = (delta) => {
    let y = cursor.year;
    let m = cursor.month + delta;
    while (m < 0) { m += 12; y -= 1; }
    while (m > 11) { m -= 12; y += 1; }
    cursor = { year: y, month: m };
    renderMonthLabel();
    fetchMonth();
  };

  const bind = () => {
    const sec = root();
    if (!sec || sec.dataset.ssBound === '1') return;
    sec.dataset.ssBound = '1';

    qs('#ssPrevMonth', sec)?.addEventListener('click', () => shiftMonth(-1));
    qs('#ssNextMonth', sec)?.addEventListener('click', () => shiftMonth(1));
    qs('#ssRefresh', sec)?.addEventListener('click', () => {
      fetchMonth();
      loadManual();
    });
    qs('#ssAddRow', sec)?.addEventListener('click', () => addManualRow());
    qs('#ssSaveManual', sec)?.addEventListener('click', () => saveManual());

    qs('#ssTbody2', sec)?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ss-del]');
      if (!btn) return;
      const idx = parseInt(btn.getAttribute('data-ss-del'), 10);
      if (Number.isFinite(idx)) deleteManualRow(idx);
    });
  };

  const open = () => {
    bind();
    renderMonthLabel();
    loadManual();
    fetchMonth();
  };

  const init = () => {
    if (!root()) return;
    bind();
    renderMonthLabel();
  };

  return { init, open, SCREEN };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => SpeedStandar.init());
} else {
  SpeedStandar.init();
}
