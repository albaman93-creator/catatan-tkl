/**
 * CALCULATION.JS
 * Inti logika bisnis: menghitung durasi, Availability, Performance, Quality, OEE.
 */
const Calculation = (() => {
  'use strict';

  /**
   * Apakah menit `mins` valid untuk shift `shiftIndex` pada input Mulai/Selesai.
   * Berbeda dari Utils.shiftOf (half-open, tiap menit 1 shift): di sini batas
   * shift bersifat inklusif di kedua sisi, supaya jam akhir shift boleh sama
   * persis dengan jam mulai shift berikutnya tanpa peringatan kuning.
   *
   * Contoh (Issue #3):
   *   Shift 1 07:00–15:30 → 15:30 OK; kuning mulai 15:31
   *   Shift 2 15:30–23:30 → 23:30 OK; kuning mulai 23:31
   *   Shift 3 23:30–07:00 → 07:00 OK; kuning mulai 07:01
   */
  const isTimeAllowedInShift = (mins, shiftIndex) => {
    if (mins == null || isNaN(mins)) return false;
    for (const range of CONFIG.SHIFT_RANGES) {
      if (range.index !== shiftIndex) continue;
      // Inklusif di from dan to → menit batas (930, 1410, 420) diterima
      // baik oleh shift yang berakhir maupun yang dimulai di menit itu.
      if (mins >= range.from && mins <= range.to) return true;
    }
    return false;
  };

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

    if (!isTimeAllowedInShift(mins, State.evalShift)) {
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

  /**
   * Fungsi utama: recalculate semua angka OEE + update UI.
   */
  const recalc = () => {
    let B = 0, D = 0, tot = 0, nShift = 0;
    let sumGood = 0, sumDefect = 0;
    const sh = [{B:0,D:0},{B:0,D:0},{B:0,D:0}];

    // Label produk: kode saja ATAU "kode + BN" (setelah issue #7)
    const pLabels = [];
    for (let i = 1; i <= 3; i++) {
      const name = (State.el['prodName' + i]?.value || '').trim();
      const bn = (State.el['prodBn' + i]?.value || '').trim();
      const label = bn ? `${name} ${bn}` : name;
      pLabels.push(label);
    }
    const prodStats = [
      { dur:0, rate:parseFloat(State.el.prodRate1.value)||0, target:0, actual:0 },
      { dur:0, rate:parseFloat(State.el.prodRate2.value)||0, target:0, actual:0 },
      { dur:0, rate:parseFloat(State.el.prodRate3.value)||0, target:0, actual:0 },
    ];

    /** Cocokkan batch baris ke slot produk 0..2 (fleksibel: "VPEL1" ≈ "VPEL1 L027103"). */
    const matchProdSlot = (batchVal) => {
      const v = String(batchVal || '').trim();
      if (!v) return -1;
      const lower = v.toLowerCase();
      for (let i = 0; i < 3; i++) {
        const label = pLabels[i];
        if (!label) continue;
        const l = label.toLowerCase();
        if (l === lower) return i;
        if (l.startsWith(lower + ' ') || lower.startsWith(l + ' ')) return i;
        const l0 = l.split(/\s+/)[0];
        const v0 = lower.split(/\s+/)[0];
        if (l0 && l0 === v0) return i;
      }
      return -1;
    };

    Rows.rows().forEach(tr => {
      const g = (f) => { const el = tr.querySelector(`[data-f="${f}"]`); return el ? el.value : ''; };
      const kode = g('kode').trim();
      const mulai = Utils.parseTime(g('mulai'));
      const selesai = Utils.parseTime(g('selesai'));
      const prodName = g('batch');
      const durEl = tr.querySelector('.dur-v');
      const durInput = tr.querySelector('[data-f="durasi"]');

      const gVal = parseFloat(g('good').replace(',', '.')) || 0;
      const dVal = parseFloat(g('defect').replace(',', '.')) || 0;
      const rowActual = gVal + dVal;

      sumGood += gVal;
      sumDefect += dVal;

      // Durasi:
      // - Jika user sedang mengetik di kolom Durasi → pakai nilai manual.
      // - Selain itu, jika mulai + selesai ada → hitung otomatis & isi kolom Durasi.
      // - Jika hanya manual (tanpa selesai) → tetap pakai manual.
      let dur = null;
      const editingDurasi = durInput && document.activeElement === durInput;
      const manualDur = durInput && durInput.value.trim() !== ''
        ? parseFloat(String(durInput.value).replace(',', '.'))
        : NaN;

      if (editingDurasi && isFinite(manualDur) && manualDur >= 0) {
        dur = manualDur;
      } else if (mulai != null && selesai != null) {
        dur = (selesai - mulai + 1440) % 1440;
        if (durInput) durInput.value = String(dur);
      } else if (isFinite(manualDur) && manualDur >= 0) {
        dur = manualDur;
      } else {
        if (durEl) {
          durEl.textContent = '—';
          durEl.removeAttribute('title');
        }
        return;
      }

      if (durEl) {
        durEl.textContent = Utils.nf0(dur);
        durEl.title = (mulai != null && selesai != null && selesai < mulai)
          ? 'Lintas tengah malam (+24 jam)' : '';
      }
      tot += dur;

      const c = Utils.catOf(kode);
      const si = Utils.shiftOf(mulai);
      if (si === State.evalShift) nShift++;

      if (c === 'planned')       { B += dur; if (si != null) sh[si].B += dur; }
      else if (c === 'unplanned'){ D += dur; if (si != null) sh[si].D += dur; }
      else if (c === 'prod') {
        if (si === State.evalShift && prodName) {
          const slot = matchProdSlot(prodName);
          if (slot >= 0) {
            prodStats[slot].dur += dur;
            prodStats[slot].actual += rowActual;
            // Rate efektif: Kemas L1/L2 proporsional OP baris; selain itu rate master
            const eff = (Rows.getEffectiveRate)
              ? Rows.getEffectiveRate(prodName, g('op'))
              : (prodStats[slot].rate || 0);
            prodStats[slot].target += dur * (eff || 0);
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
    // Target (G) = Σ (durasi × rate efektif baris). Kemas L1/L2: rate mengikuti OP.
    let totalPerfSum = 0, activeCount = 0;
    for (let i = 0; i < 3; i++) {
      const gTarget = prodStats[i].target > 0
        ? prodStats[i].target
        : (prodStats[i].dur * prodStats[i].rate);
      const hAct = prodStats[i].actual;
      const perfI = gTarget > 0 ? (hAct / gTarget) * 100 : 0;

      if (pLabels[i] && (prodStats[i].rate > 0 || prodStats[i].target > 0 || prodStats[i].actual > 0)) {
        activeCount++; totalPerfSum += perfI;
      }

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

    // === OEE standar (Availability = E/C vs waktu terencana) ===
    const oee = sF * avgPerfI * M / 10000;
    const oeeEl = State.el.oee;
    oeeEl.textContent = Utils.nf2(oee) + '%';
    oeeEl.style.color = oee >= CONFIG.TARGET.OEE ? '#2ee27e' : '#f87171';

    // === OEE 365 (Availability = E / A_shift penuh, mis. 510 mnt) ===
    // Contoh: shift 510 mnt, waktu operasional E = 400 → A365 = 400/510 ≈ 78,43%
    const a365 = sA > 0 ? (sE / sA) * 100 : 0;
    const oee365 = a365 * avgPerfI * M / 10000;

    const set365 = (key, text, color) => {
      let el = State.el[key];
      if (!el) { el = document.getElementById(key); if (el) State.el[key] = el; }
      if (!el) return;
      el.textContent = text;
      if (color) el.style.color = color;
    };
    set365('o365A', Utils.nf0(sA));
    set365('o365E', Utils.nf0(sE));
    set365('o365F', Utils.nf2(a365) + ' %', a365 >= CONFIG.TARGET.AVAILABILITY ? 'var(--green-d)' : 'var(--red)');
    set365('o365P', Utils.nf2(avgPerfI) + ' %');
    set365('o365Q', Utils.nf2(M) + ' %');
    set365('oee365', Utils.nf2(oee365) + '%', oee365 >= CONFIG.TARGET.OEE ? '#2ee27e' : '#f87171');
    if (State.el.rincSub365) {
      State.el.rincSub365.textContent =
        `Shift ${State.evalShift + 1} · A₃₆₅ = ${sA} mnt · E = ${Utils.nf0(sE)} mnt · A365 = ${Utils.nf2(a365)}%`;
    }
    if (State.el.diag365) {
      State.el.diag365.innerHTML =
        `<div class="d-item ok">OEE 365 = ${Utils.nf2(a365)}% × ${Utils.nf2(avgPerfI)}% × ${Utils.nf2(M)}% = <b>${Utils.nf2(oee365)}%</b>
         <br><small>Availability 365 = waktu operasional (E) ÷ menit penuh shift (${sA}), bukan ÷ waktu terencana (C).</small></div>`;
    }

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
    if (State.el.oee365IndicatorValue) {
      State.el.oee365IndicatorValue.textContent = Utils.nf2(oee365) + '%';
      if (State.el.oee365Indicator) {
        State.el.oee365Indicator.classList.remove('good', 'warn', 'bad');
        if (oee365 >= CONFIG.TARGET.OEE) State.el.oee365Indicator.classList.add('good');
        else if (oee365 >= 80) State.el.oee365Indicator.classList.add('warn');
        else State.el.oee365Indicator.classList.add('bad');
      }
    }

    // Kartu A / P / Q / OEE di atas log sheet — tulis LANGSUNG dari angka hitung
    // (jangan hanya mengandalkan salinan DOM lewat updateUnifiedControl).
    const setKpi = (key, text) => {
      let el = State.el[key];
      if (!el) { el = document.getElementById(key); if (el) State.el[key] = el; }
      if (el) el.textContent = text;
    };
    setKpi('sheetKpiA', Utils.nf2(sF) + '%');
    setKpi('sheetKpiP', Utils.nf2(avgPerfI) + '%');
    setKpi('sheetKpiQ', Utils.nf2(M) + '%');
    setKpi('sheetKpiOEE', Utils.nf2(oee) + '%');
    // Health-bar warna (jika UI tersedia)
    if (typeof UI !== 'undefined' && UI.updateKpiHealthBar) {
      const bar = (id, val) => {
        const node = State.el[id];
        const card = node && node.closest ? node.closest('.sheet-kpi') : null;
        if (card) UI.updateKpiHealthBar(card, String(val));
      };
      bar('sheetKpiA', sF);
      bar('sheetKpiP', avgPerfI);
      bar('sheetKpiQ', M);
      bar('sheetKpiOEE', oee);
    } else {
      // Fallback: update fill lebar sederhana
      [['sheetKpiA', sF, 90], ['sheetKpiP', avgPerfI, 98], ['sheetKpiQ', M, 99.5], ['sheetKpiOEE', oee, 88]].forEach(([id, val, tgt]) => {
        const node = State.el[id];
        const card = node && node.closest ? node.closest('.sheet-kpi') : null;
        if (!card) return;
        const fill = card.querySelector('.kpi-fill');
        if (fill) fill.style.width = Math.max(0, Math.min(100, (val / tgt) * 100)) + '%';
        card.removeAttribute('data-state');
        if (val >= tgt) card.setAttribute('data-state', 'ok');
        else if (val >= tgt * 0.75) card.setAttribute('data-state', 'near');
        else card.setAttribute('data-state', 'bad');
      });
    }

    // === DIAGNOSTIK ===
    const issues = [];
    if (nShift === 0) issues.push(`Tidak ada baris log pada Shift ${State.evalShift + 1} — cek tombol SHIFT atau jam mulai.`);
    if (sC <= 0)      issues.push('Availability 0% — Planned DT (B) ≥ menit shift (A).');
    else if (sE <= 0) issues.push('Availability 0% — Unplanned DT (D) ≥ waktu terencana (C).');
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
