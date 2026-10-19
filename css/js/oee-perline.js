/**
 * OEE-PERLINE.JS — Grafik OEE per Line × Tahapan Proses di Dashboard utama.
 * Satu batang = satu mesin (tahapan+line), nilai = RATA-RATA oee record
 * mesin tsb (bukan gabungan antar mesin), sehingga tidak ada lagi
 * persentase "menjumlah" lintas line.
 */
const OeePerLine = (() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const STAGE_ORDER = ['mixing', 'filling', 'steril', 'visual', 'kemas'];
  const STAGE_LABEL = { mixing: 'Mixing', filling: 'Filling', steril: 'Steril', visual: 'Visual', kemas: 'Kemas' };
  const COLORS = { mixing: '#a78bfa', filling: '#3b82f6', steril: '#f472b6', visual: '#f59e0b', kemas: '#22c55e' };
  let seq = 0;

  const toNum = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (v == null || v === '') return null;
    const n = Number(String(v).replace('%', '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };
  const fmtPct = (v, d = 1) => v.toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%';
  const avg = (arr) => {
    const v = arr.filter((x) => x != null);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };

  const fetchAll = async (from, to) => {
    const c = typeof SupabaseClient !== 'undefined' ? SupabaseClient.getClient() : null;
    if (!c) throw new Error('Supabase belum terhubung');
    const out = [];
    for (let i = 0; i < 30; i++) {
      const { data, error } = await c.from(CONFIG.DB_TABLE)
        .select('date,shift,line,tahapan,availability,performance,quality,oee')
        .gte('date', from).lte('date', to)
        .order('date', { ascending: false }).order('key', { ascending: true })
        .range(i * 1000, i * 1000 + 999);
      if (error) throw error;
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return out;
  };

  // ===== Satu batang per (tahapan + line) =====
  const group = (rows) => {
    const by = {};
    rows.forEach((r) => {
      const k = String(r.tahapan || '') + '|' + String(r.line || '');
      (by[k] = by[k] || []).push(r);
    });
    return Object.keys(by).map((k) => {
      const [st, ln] = k.split('|');
      const list = by[k];
      return {
        st, ln, n: list.length,
        oee: avg(list.map((r) => toNum(r.oee))),
        a: avg(list.map((r) => toNum(r.availability))),
        p: avg(list.map((r) => toNum(r.performance))),
        q: avg(list.map((r) => toNum(r.quality)))
      };
    }).sort((x, y) => {
      const sx = STAGE_ORDER.indexOf(x.st);
      const sy = STAGE_ORDER.indexOf(y.st);
      return (sx < 0 ? 99 : sx) - (sy < 0 ? 99 : sy) || Number(x.ln) - Number(y.ln);
    });
  };

  const draw = (items) => {
    const svg = $('oplSvg');
    if (!svg) return;
    const slot = 92, L = 46, R = 10, T = 26, B = 48, H = 270, ph = H - T - B;
    const W = Math.max(420, L + R + items.length * slot);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.style.width = (W > 760 ? W + 'px' : '100%');
    const Y = (v) => T + ph - (Math.min(Math.max(v ?? 0, 0), 100) / 100) * ph;
    let s = '<g stroke="#334155" stroke-width="1">';
    for (let v = 0; v <= 100; v += 25) s += `<line x1="${L}" y1="${Y(v)}" x2="${W - R}" y2="${Y(v)}"/>`;
    s += '</g><g fill="#64748b" font-size="10" text-anchor="end">';
    for (let v = 0; v <= 100; v += 25) s += `<text x="${L - 6}" y="${Y(v) + 3}">${v}%</text>`;
    s += '</g>';
    if (!items.length) {
      svg.innerHTML = s + `<text x="${W / 2}" y="${T + ph / 2}" fill="#64748b" font-size="12" text-anchor="middle">Tidak ada data pada rentang ini</text>`;
      return;
    }
    items.forEach((it, i) => {
      const x = L + i * slot + 14, w = slot - 28;
      const col = COLORS[it.st] || '#64748b';
      const cx = x + w / 2;
      if (it.oee != null) {
        const y = Y(it.oee);
        s += `<rect x="${x}" y="${y}" width="${w}" height="${T + ph - y}" rx="4" fill="${col}">`
          + `<title>${STAGE_LABEL[it.st] || it.st} Line ${it.ln} · OEE ${fmtPct(it.oee, 2)} · A ${it.a == null ? '—' : fmtPct(it.a, 1)} · P ${it.p == null ? '—' : fmtPct(it.p, 1)} · Q ${it.q == null ? '—' : fmtPct(it.q, 1)} · ${it.n} record</title></rect>`
          + `<text x="${cx}" y="${y - 6}" fill="#e2e8f0" font-size="10" font-weight="700" text-anchor="middle">${fmtPct(it.oee, 1)}</text>`;
      } else {
        s += `<text x="${cx}" y="${Y(0) - 6}" fill="#64748b" font-size="10" text-anchor="middle">—</text>`;
      }
      s += `<text x="${cx}" y="${T + ph + 16}" fill="#94a3b8" font-size="9.5" text-anchor="middle">${STAGE_LABEL[it.st] || it.st} L${it.ln}</text>`
        + `<text x="${cx}" y="${T + ph + 28}" fill="#64748b" font-size="8" text-anchor="middle">${it.n} rec</text>`;
    });
    svg.innerHTML = s;
  };

  const load = async () => {
    const from = $('oplFrom')?.value, to = $('oplTo')?.value, st = $('oplStatus');
    const say = (m, err) => { if (st) { st.textContent = m; st.className = 'oee-filter-status' + (err ? ' err' : ''); } };
    if (!from || !to) return say('Isi Dari Tanggal dan Sampai Tanggal.', true);
    if (from > to) return say('Tanggal awal tidak boleh melebihi tanggal akhir.', true);
    if (!navigator.onLine) return say('⚠ Tidak ada koneksi — data diambil dari Supabase.', true);
    const my = ++seq;
    say('Memuat data…');
    try {
      const rows = await fetchAll(from, to);
      if (my !== seq) return;
      const items = group(rows);
      draw(items);
      say(`✓ ${rows.length} record · ${items.length} mesin/line · ${STAGE_ORDER.map((k) => STAGE_LABEL[k]).join(', ')}`);
    } catch (e) {
      console.warn('OEE per line error:', e);
      say('⚠ Gagal memuat: ' + (e.message || e), true);
    }
  };

  // Init when DOM ready
  const init = () => {
    $('oplApply')?.addEventListener('click', load);
    const f = $('oplFrom'), t = $('oplTo');
    if (f && t && !f.value && !t.value) {
      const today = Utils.todayLocal();
      f.value = today.slice(0, 8) + '01';
      t.value = today;
      load();
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { load };
})();
