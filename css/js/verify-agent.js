/**
 * VERIFY-AGENT.JS — Agent Verifikasi Rutin
 * ============================================================
 * Memeriksa kelengkapan log sheet seperti agent pengecekan:
 *  - Produk / Batch terisi
 *  - Kode 2 punya Good/Defect
 *  - Rate master > 0
 *  - Rantai jam mulai–selesai
 *  - Kesiapan Availability / Performance / Quality
 *
 * Perbaikan aman (opsional):
 *  - Isi Batch otomatis jika hanya 1 produk di master
 *  - Isi WO dari master produk
 *  - Rantai mulai baris berikutnya dari selesai baris sebelumnya
 * ============================================================
 */
const VerifyAgent = (() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const productSlots = () => {
    const slots = [];
    for (let i = 1; i <= 3; i++) {
      const name = (State.el['prodName' + i]?.value || '').trim();
      const bn = (State.el['prodBn' + i]?.value || '').trim();
      if (!name) continue;
      const label = bn ? `${name} ${bn}` : name;
      const rate = parseFloat(State.el['prodRate' + i]?.value) || 0;
      const wo = (State.el['prodWo' + i]?.value || '').trim();
      slots.push({ i, name, bn, label, rate, wo });
    }
    return slots;
  };

  const scan = () => {
    const products = productSlots();
    const rows = (typeof Rows !== 'undefined' && Rows.rows) ? Rows.rows() : [];
    const issues = [];
    const ok = [];
    const stats = {
      rowCount: rows.length,
      filledRows: 0,
      kode2Rows: 0,
      kode2WithOutput: 0,
      missingBatch: 0,
      missingTime: 0,
      missingRate: 0,
    };

    if (products.length === 0) {
      issues.push({
        level: 'err',
        code: 'NO_PRODUCT',
        msg: 'Belum ada produk di Master Produk — isi Kode (+ BN) dan Rate.',
        fix: null,
      });
    } else {
      ok.push({ level: 'ok', msg: `${products.length} produk master: ${products.map(p => p.label).join(', ')}` });
      products.forEach(p => {
        if (p.rate <= 0) {
          stats.missingRate++;
          issues.push({
            level: 'err',
            code: 'NO_RATE',
            msg: `Rate produk "${p.label}" masih 0 — Performance tidak bisa dihitung.`,
            fix: null,
          });
        }
      });
    }

    rows.forEach((tr, idx) => {
      const g = (f) => {
        const el = tr.querySelector(`[data-f="${f}"]`);
        return el ? el.value.trim() : '';
      };
      const kode = g('kode');
      const mulai = g('mulai');
      const selesai = g('selesai');
      const batch = g('batch');
      const good = parseFloat(String(g('good') || '0').replace(',', '.')) || 0;
      const defect = parseFloat(String(g('defect') || '0').replace(',', '.')) || 0;
      const n = idx + 1;

      if (!kode && !mulai && !selesai) return;
      stats.filledRows++;

      if (!mulai || !selesai) {
        stats.missingTime++;
        issues.push({
          level: 'warn',
          code: 'TIME',
          msg: `Baris #${n}: jam mulai/selesai belum lengkap.`,
          fix: 'chain_times',
          row: tr,
        });
      }

      if (!batch) {
        stats.missingBatch++;
        issues.push({
          level: 'warn',
          code: 'BATCH',
          msg: `Baris #${n}: Batch/Produk belum dipilih.`,
          fix: products.length === 1 ? 'fill_batch' : null,
          row: tr,
        });
      }

      if (kode === '2' || (typeof Utils !== 'undefined' && Utils.catOf(kode) === 'prod')) {
        stats.kode2Rows++;
        if (good + defect >= 1) {
          stats.kode2WithOutput++;
        } else {
          issues.push({
            level: 'err',
            code: 'NO_OUTPUT',
            msg: `Baris #${n} (Kode 2): Good/Defect masih 0 — isi output agar Performance & Quality terhitung.`,
            fix: null,
            row: tr,
          });
        }
      }
    });

    // Ringkasan kesiapan OEE
    if (stats.kode2Rows === 0) {
      issues.push({
        level: 'err',
        code: 'NO_KODE2',
        msg: 'Belum ada baris Kode 2 (produksi). Availability bisa terisi, Performance tetap 0%.',
        fix: null,
      });
    } else if (stats.kode2WithOutput > 0 && products.length > 0 && stats.missingRate === 0) {
      ok.push({
        level: 'ok',
        msg: `Kode 2 dengan output: ${stats.kode2WithOutput}/${stats.kode2Rows} — Performance siap dihitung.`,
      });
    }

    // Baca nilai OEE saat ini dari UI (jika sudah di-recalc)
    const readPct = (id) => {
      const el = State.el[id] || $(id);
      if (!el) return null;
      const n = parseFloat(String(el.textContent || '').replace(',', '.').replace('%', ''));
      return isFinite(n) ? n : null;
    };

    const apq = {
      A: readPct('oF') ?? readPct('sheetKpiA'),
      P: readPct('oITotal') ?? readPct('sheetKpiP'),
      Q: readPct('oM') ?? readPct('sheetKpiQ'),
      OEE: readPct('oee') ?? readPct('sheetKpiOEE'),
    };

    return { products, issues, ok, stats, apq };
  };

  const applySafeFixes = (report) => {
    const products = productSlots();
    let fixed = 0;
    const rows = (typeof Rows !== 'undefined' && Rows.rows) ? Rows.rows() : [];

    // 1) Isi batch jika hanya 1 produk
    if (products.length === 1) {
      const label = products[0].label;
      rows.forEach(tr => {
        const batchEl = tr.querySelector('[data-f="batch"]');
        if (!batchEl) return;
        if (!batchEl.value.trim()) {
          batchEl.value = label;
          batchEl.dispatchEvent(new Event('change', { bubbles: true }));
          if (Rows.applyWoFromBatch) Rows.applyWoFromBatch(tr);
          fixed++;
        }
      });
    }

    // 2) Isi WO dari batch yang sudah ada
    rows.forEach(tr => {
      const batchEl = tr.querySelector('[data-f="batch"]');
      const woEl = tr.querySelector('[data-f="wo"]');
      if (!batchEl || !woEl) return;
      if (batchEl.value.trim() && !woEl.value.trim() && Rows.applyWoFromBatch) {
        Rows.applyWoFromBatch(tr);
        if (woEl.value.trim()) fixed++;
      }
    });

    // 3) Rantai jam: mulai baris berikutnya = selesai baris sebelumnya
    let prevSelesai = '';
    rows.forEach(tr => {
      const mulaiEl = tr.querySelector('[data-f="mulai"]');
      const selesaiEl = tr.querySelector('[data-f="selesai"]');
      if (!mulaiEl || !selesaiEl) return;
      if (prevSelesai && !mulaiEl.value.trim()) {
        mulaiEl.value = prevSelesai;
        mulaiEl.dispatchEvent(new Event('input', { bubbles: true }));
        fixed++;
      }
      if (selesaiEl.value.trim()) prevSelesai = selesaiEl.value.trim();
      else if (mulaiEl.value.trim()) prevSelesai = mulaiEl.value.trim();
    });

    if (typeof Calculation !== 'undefined' && Calculation.recalc) Calculation.recalc();
    if (typeof UI !== 'undefined' && UI.toast) UI.toast(`Agent: ${fixed} perbaikan diterapkan`);
    return fixed;
  };

  const levelIcon = (lv) => (lv === 'ok' ? '✓' : lv === 'warn' ? '⚠' : '✕');

  const renderReport = (report) => {
    const body = $('verifyAgentBody');
    if (!body) return;

    const { issues, ok, stats, apq, products } = report;
    const errN = issues.filter(i => i.level === 'err').length;
    const warnN = issues.filter(i => i.level === 'warn').length;
    const statusClass = errN ? 'va-status-bad' : warnN ? 'va-status-warn' : 'va-status-ok';
    const statusText = errN
      ? `${errN} masalah kritis`
      : warnN
        ? `${warnN} peringatan`
        : 'Siap diverifikasi';

    const apqCard = (label, val, target) => {
      const v = val == null ? '—' : Utils.nf2(val) + '%';
      let cls = 'va-apq-na';
      if (val != null) {
        cls = val >= target ? 'va-apq-ok' : val >= target * 0.75 ? 'va-apq-warn' : 'va-apq-bad';
      }
      return `<div class="va-apq ${cls}"><span>${label}</span><b>${v}</b></div>`;
    };

    const fixable = issues.some(i => i.fix);
    const listItems = [
      ...ok.map(i => `<li class="va-ok"><span>${levelIcon('ok')}</span> ${i.msg}</li>`),
      ...issues.map(i => `<li class="va-${i.level}"><span>${levelIcon(i.level)}</span> ${i.msg}</li>`),
    ].join('') || '<li class="va-ok"><span>✓</span> Tidak ada temuan.</li>';

    body.innerHTML = `
      <div class="va-status ${statusClass}">${statusText}</div>
      <div class="va-apq-row">
        ${apqCard('A', apq.A, (CONFIG.TARGET && CONFIG.TARGET.AVAILABILITY) || 90)}
        ${apqCard('P', apq.P, (CONFIG.TARGET && CONFIG.TARGET.PERFORMANCE) || 98)}
        ${apqCard('Q', apq.Q, (CONFIG.TARGET && CONFIG.TARGET.QUALITY) || 99.5)}
        ${apqCard('OEE', apq.OEE, (CONFIG.TARGET && CONFIG.TARGET.OEE) || 88)}
      </div>
      <div class="va-stats">
        Baris terisi: <b>${stats.filledRows}</b> ·
        Kode 2: <b>${stats.kode2Rows}</b> ·
        Output: <b>${stats.kode2WithOutput}</b> ·
        Produk master: <b>${products.length}</b>
      </div>
      <ul class="va-list">${listItems}</ul>
      <div class="va-actions">
        <button type="button" class="btn btn-ghost" id="verifyAgentRescan">🔍 Scan ulang</button>
        <button type="button" class="btn btn-primary" id="verifyAgentFix" ${fixable ? '' : 'disabled'}
          title="Isi Batch (jika 1 produk), WO, dan rantai jam secara aman">
          ✨ Terapkan perbaikan aman
        </button>
      </div>
      <p class="va-hint">
        Agent hanya mengisi yang aman (Batch tunggal, WO, rantai jam).
        Good/Defect &amp; Rate tetap diisi manual.
      </p>
    `;

    $('verifyAgentRescan')?.addEventListener('click', () => {
      if (typeof Calculation !== 'undefined') Calculation.recalc();
      renderReport(scan());
    });
    $('verifyAgentFix')?.addEventListener('click', () => {
      applySafeFixes(report);
      renderReport(scan());
    });
  };

  const open = () => {
    if (typeof Calculation !== 'undefined') Calculation.recalc();
    const overlay = $('verifyAgentOverlay');
    if (!overlay) return;
    overlay.classList.remove('hide');
    renderReport(scan());
  };

  const close = () => {
    $('verifyAgentOverlay')?.classList.add('hide');
  };

  const bind = () => {
    $('btnVerifyAgent')?.addEventListener('click', open);
    $('verifyAgentClose')?.addEventListener('click', close);
    $('verifyAgentOverlay')?.addEventListener('click', (e) => {
      if (e.target.id === 'verifyAgentOverlay') close();
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

  return { open, close, scan, applySafeFixes, bind };
})();
