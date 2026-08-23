/**
 * CALCULATION.JS
 * Inti logika bisnis: menghitung durasi, Availability, Performance, Quality, OEE.
 */
const Calculation = (() => {
  'use strict';

  /**
   * Validasi apakah input jam berada di dalam shift aktif.
   * Memberi warning visual (warna kuning) kalau shift tidak sesuai.
   */
  const validateTimeInput = (inputEl) => {
    const val = inputEl.value.trim();
    const fieldName = inputEl.getAttribute('data-f');
    if (!['mulai','selesai'].includes(fieldName) || !val || val.length < 5) {
      inputEl.classList.remove('warn-shift');
      return;
    }
    const mins = Utils.parseTime(val);
    if (mins === null) return;

    const actualShift = Utils.shiftOf(mins);
    if (actualShift !== State.evalShift) {
      inputEl.classList.add('warn-shift');
      UI.toast('Pastikan shift yang Anda pilih benar ⚠', true, 'warn');
    } else {
      inputEl.classList.remove('warn-shift');
    }
  };

  const validateAllTimeInputs = () => {
    Rows.rows().forEach(tr => {
      const mEl = tr.querySelector('[data-f="mulai"]');
      const sEl = tr.querySelector('[data-f="selesai"]');
      if (mEl) validateTimeInput(mEl);
      if (sEl) validateTimeInput(sEl);
    });
  };

  // ===== HEALTH BAR KPI DI SHEET =====
  const updateHealthCard = (card, fill, value, target, incomplete = false) => {
    if (!card || !fill) return;
    const n = Number.isFinite(+value) ? +value : 0;
    const pct = Math.max(0, Math.min(100, n));
    const t = Number.isFinite(+target) ? +target : 100;
    const near = t * 0.90;
    const status = incomplete ? 'incomplete' : (n > t ? 'over' : n >= t ? 'target' : n >= near ? 'near' : 'low');
    card.classList.remove('health-low','health-near','health-target','health-over','health-incomplete');
    card.classList.add('health-' + status);
    card.dataset.health = String(Math.round(pct * 100) / 100);
    fill.style.width = pct + '%';
    card.style.setProperty('--target-pos', Math.min(100, Math.max(0, t)) + '%');
    fill.setAttribute('aria-valuenow', String(Math.round(pct * 100) / 100));
    fill.setAttribute('aria-valuemax', '100');
  };

  /**
   * Fungsi utama: recalculate semua angka OEE + update UI.
   */
  const recalc = () => {
    let B = 0, D = 0, tot = 0, nShift = 0;
    let sumGood = 0, sumDefect = 0;
    let incompleteProduction = false;
    const sh = [{B:0,D:0},{B:0,D:0},{B:0,D:0}];

    const pNames = [
      State.el.prodName1.value.trim(),
      State.el.prodName2.value.trim(),
      State.el.prodName3.value.trim()
    ];
    const prodStats = [
      { dur:0, rate:parseFloat(State.el.prodRate1.value)||0, actual:0 },
      { dur:0, rate:parseFloat(State.el.prodRate2.value)||0, actual:0 },
      { dur:0, rate:parseFloat(State.el.prodRate3.value)||0, actual:0 },
    ];

    Rows.rows().forEach(tr => {
      const g = (f) => { const el = tr.querySelector(`[data-f="${f}"]`); return el ? el.value : ''; };
      const kode = g('kode').trim();
      const mulai = Utils.parseTime(g('mulai'));
      const selesai = Utils.parseTime(g('selesai'));
      const prodName = g('batch');
      const durEl = tr.querySelector('.dur-v');

      const goodRaw = g('good').trim();
      const dRaw = g('defect').trim();
      const gVal = parseFloat(goodRaw.replace(',', '.')) || 0;
      const dVal = parseFloat(dRaw.replace(',', '.')) || 0;
      const rowActual = gVal + dVal;

      // Kode 2 = produksi. Jika Good belum diisi, atau produk/rate belum
      // tersedia, P/Q/OEE belum layak dianggap sebagai hasil final.
      if (kode === '2') {
        const rowRate = Rows.getRateForProduct ? Rows.getRateForProduct(prodName) : 0;
        if (!goodRaw || (!prodName && rowRate <= 0)) incompleteProduction = true;
      }

      sumGood += gVal;
      sumDefect += dVal;

      if (mulai == null || selesai == null) {
        durEl.textContent = '—';
        durEl.removeAttribute('title');
        return;
      }
      const dur = (selesai - mulai + 1440) % 1440;
      durEl.textContent = Utils.nf0(dur);
      durEl.title = selesai < mulai ? 'Lintas tengah malam (+24 jam)' : '';
      tot += dur;

      const c = Utils.catOf(kode);
      const si = Utils.shiftOf(mulai);
      if (si === State.evalShift) nShift++;

      if (c === 'planned')       { B += dur; if (si != null) sh[si].B += dur; }
      else if (c === 'unplanned'){ D += dur; if (si != null) sh[si].D += dur; }
      else if (c === 'prod') {
        if (si === State.evalShift && prodName) {
          for (let i = 0; i < 3; i++) {
            if (pNames[i] && pNames[i] === prodName) {
              prodStats[i].dur += dur;
              prodStats[i].actual += rowActual;
            }
          }
        }
      }
    });

    const totalOutputJ = sumGood + sumDefect;
    const sA = CONFIG.SHIFT_A[State.evalShift];
    const sB = sh[State.evalShift].B;
    const sC = Math.max(sA - sB, 0);
    const sD = sh[State.evalShift].D;
    const sE = Math.max(sC - sD, 0);
    const sF = sC > 0 ? sE / sC * 100 : 0;

    State.el.oA.textContent = Utils.nf0(sA);
    State.el.oB.textContent = Utils.nf0(sB);
    State.el.oC.textContent = Utils.nf0(sC);
    State.el.oD.textContent = Utils.nf0(sD);
    State.el.oE.textContent = Utils.nf0(sE);

    const oFEl = State.el.oF;
    oFEl.textContent = Utils.nf2(sF);
    oFEl.style.color = sF >= CONFIG.TARGET.AVAILABILITY ? 'var(--green-d)' : 'var(--red)';
    oFEl.style.fontWeight = '700';

    // === PERFORMANCE PER PRODUK ===
    let totalPerfSum = 0, activeCount = 0;
    for (let i = 0; i < 3; i++) {
      const gTarget = prodStats[i].dur * prodStats[i].rate;
      const hAct = prodStats[i].actual;
      const perfI = gTarget > 0 ? (hAct / gTarget) * 100 : 0;

      // Hanya hitung produk sebagai "aktif" untuk rata-rata jika nama ada DAN rate > 0
      if (pNames[i] && prodStats[i].rate > 0) { activeCount++; totalPerfSum += perfI; }

      State.el['oG' + (i+1)].textContent = Utils.nf0(gTarget);
      State.el['oH' + (i+1)].textContent = Utils.nf0(hAct);
      const elI = State.el['oI' + (i+1)];
      elI.textContent = Utils.nf2(perfI);
      elI.style.color = perfI >= CONFIG.TARGET.PERFORMANCE ? 'var(--green-d)' : 'var(--red)';
      elI.style.fontWeight = '700';
    }

    const avgPerfI = activeCount > 0 ? (totalPerfSum / activeCount) : 0;
    State.el.oITotal.textContent = Utils.nf2(avgPerfI);
    const badge = State.el.badgeAvgP;
    badge.style.color = avgPerfI >= CONFIG.TARGET.PERFORMANCE ? 'var(--green-d)' : 'var(--red)';
    badge.style.borderColor = avgPerfI >= CONFIG.TARGET.PERFORMANCE ? 'rgba(18,161,80,0.3)' : 'rgba(220,38,38,0.3)';

    // === QUALITY ===
    const K = sumDefect;
    const J = totalOutputJ;
    const L = Math.max(sumGood, 0);
    const M = J > 0 ? L / J * 100 : 0;

    State.el.oJ.textContent = Utils.nf0(J);
    State.el.oK.textContent = Utils.nf0(K);
    State.el.oL.textContent = Utils.nf0(L);
    const oMEl = State.el.oM;
    oMEl.textContent = Utils.nf2(M);
    oMEl.style.color = M >= CONFIG.TARGET.QUALITY ? 'var(--green-d)' : 'var(--red)';
    oMEl.style.fontWeight = '700';

    // === OEE ===
    const oee = sF * avgPerfI * M / 10000;
    const oeeEl = State.el.oee;
    oeeEl.textContent = Utils.nf2(oee) + '%';
    oeeEl.style.color = oee >= CONFIG.TARGET.OEE ? '#2ee27e' : '#f87171';

    // Badge %OEE mini di toolbar atas — biar kelihatan real-time tanpa
    // harus pindah ke screen "Perhitungan OEE". 3 tingkat warna:
    // merah (<80%) / kuning (80% s.d. sebelum target) / hijau (≥ target).
    if (State.el.oeeIndicatorValue) {
      State.el.oeeIndicatorValue.textContent = Utils.nf2(oee) + '%';
      if (State.el.oeeIndicator) {
        State.el.oeeIndicator.classList.remove('good', 'warn', 'bad');
        if (oee >= CONFIG.TARGET.OEE) State.el.oeeIndicator.classList.add('good');
        else if (oee >= 80) State.el.oeeIndicator.classList.add('warn');
        else State.el.oeeIndicator.classList.add('bad');
      }
    }

    // Health bar: isi 0–100% dan warna berdasarkan target masing-masing.
    updateHealthCard(State.el.sheetKpiCardA, State.el.sheetHealthA, sF, CONFIG.TARGET.AVAILABILITY);
    updateHealthCard(State.el.sheetKpiCardP, State.el.sheetHealthP, avgPerfI, CONFIG.TARGET.PERFORMANCE, false);
    updateHealthCard(State.el.sheetKpiCardQ, State.el.sheetHealthQ, M, CONFIG.TARGET.QUALITY, false);
    updateHealthCard(State.el.sheetKpiCardOEE, State.el.sheetHealthOEE, oee, CONFIG.TARGET.OEE, false);
    [
      [State.el.sheetKpiCardA, CONFIG.TARGET.AVAILABILITY, 'Availability'],
      [State.el.sheetKpiCardP, CONFIG.TARGET.PERFORMANCE, 'Performance'],
      [State.el.sheetKpiCardQ, CONFIG.TARGET.QUALITY, 'Quality'],
      [State.el.sheetKpiCardOEE, CONFIG.TARGET.OEE, 'OEE'],
    ].forEach(([card, target, label]) => {
      if (card) card.title = `${label} · Target ${Utils.nf2(target)}%`;
    });
    if (incompleteProduction) {
      [State.el.sheetKpiCardP, State.el.sheetKpiCardQ].forEach(card => {
        if (card) card.title = 'Ada Kode 2 yang belum lengkap. Angka KPI tetap mengikuti hasil hitungan pada halaman OEE.';
      });
    }

    // === DIAGNOSTIK ===
    const issues = [];
    if (nShift === 0) issues.push(`Tidak ada baris log pada Shift ${State.evalShift + 1} — cek tombol SHIFT atau jam mulai.`);
    if (sC <= 0)      issues.push('Availability 0% — Planned DT (B) ≥ menit shift (A).');
    else if (sE <= 0) issues.push('Availability 0% — Unplanned DT (D) ≥ waktu terencana (C).');
    if (incompleteProduction) issues.push('Kode 2 belum lengkap — isi Produk, Rate, dan Good agar Performance/Quality/OEE valid.');
    if (J <= 0)       issues.push('Quality/Performance 0% — Output aktual belum diisi.');

    const dEl = State.el.diag;
    if (issues.length === 0) {
      dEl.innerHTML = `<div class="d-item ok">✓ Semua komponen lengkap — OEE = ${Utils.nf2(sF)}% × ${Utils.nf2(avgPerfI)}% × ${Utils.nf2(M)}% = ${Utils.nf2(oee)}%</div>`;
    } else {
      dEl.innerHTML = issues.map(s => `<div class="d-item err">⚠ ${s}</div>`).join('');
    }

    Rows.updateRowNumbers();
    State.el.sumDur.textContent = Utils.nf0(tot);
    State.el.totalDurasi.textContent = Utils.nf0(tot);
    State.el.rowN.textContent = Rows.rows().length;

    Rows.updateProductDetailTable();
    Navigation.applyTabOrder();

    // Sinkronkan KPI compact pada kontrol unified di atas log sheet.
    if (typeof UI !== 'undefined' && UI.updateUnifiedControl) UI.updateUnifiedControl();
  };

  return { validateTimeInput, validateAllTimeInputs, recalc };
})();
