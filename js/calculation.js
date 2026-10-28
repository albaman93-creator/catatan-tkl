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
    let mixingDur = 0; // Kegiatan "Mixing" — dikurangi dari basis OEE 365
    let minMixingStart = null; // menit dari 00:00 kegiatan Mixing paling awal di shift eval
    const sh = [{B:0,D:0},{B:0,D:0},{B:0,D:0}];

    // Label produk: kode saja ATAU "kode + BN" (setelah issue #7)
    const pLabels = [];
    for (let i = 1; i <= 3; i++) {
      // Prioritas ambil dari form sheet, fallback ke master jika kosong
      let name = (State.el['prodName' + i]?.value || '').trim();
      let bn = (State.el['prodBn' + i]?.value || '').trim();
      
      if (!name) {
        const mName = document.getElementById('masterProdName' + i);
        if (mName) name = mName.value.trim();
      }
      if (!bn) {
        const mBn = document.getElementById('masterProdBn' + i);
        if (mBn) bn = mBn.value.trim();
      }

      const label = bn ? `${name} ${bn}` : name;
      pLabels.push(label);
    }

    // --- TAMBAHAN: KEMAS KINI NAMA PRODUK DI HEADER TABEL OEE ---
    const thProd1 = document.getElementById('thProd1');
    const thProd2 = document.getElementById('thProd2');
    const thProd3 = document.getElementById('thProd3');

    if (thProd1) thProd1.textContent = pLabels[0] || 'Produk 1';
    if (thProd2) thProd2.textContent = pLabels[1] || 'Produk 2';
    if (thProd3) thProd3.textContent = pLabels[2] || 'Produk 3';
    // -------------------------------------------------------------

    const prodStats = [  
    { dur:0, rate:parseFloat(State.el.prodRate1.value)||0, target:0, actual:0, good:0, defect:0, planned:0, unplanned:0 },  
    { dur:0, rate:parseFloat(State.el.prodRate2.value)||0, target:0, actual:0, good:0, defect:0, planned:0, unplanned:0 },  
    { dur:0, rate:parseFloat(State.el.prodRate3.value)||0, target:0, actual:0, good:0, defect:0, planned:0, unplanned:0 },  
    ];

    /**
     * Cocokkan batch baris ke slot produk 0..2.
     * Delegasi ke Rows.findProductSlot (skor paling spesifik) supaya
     * "VPEL1 mixing L027103" tidak tertarik ke slot "VPEL1".
     * Fallback lokal tanpa matching "kata pertama saja".
     */
    const matchProdSlot = (batchVal) => {
      if (typeof Rows !== 'undefined' && typeof Rows.findProductSlot === 'function') {
        const slot1 = Rows.findProductSlot(batchVal); // 1..3 atau -1
        return slot1 > 0 ? slot1 - 1 : -1;
      }
      const v = String(batchVal || '').trim();
      if (!v) return -1;
      const lower = v.toLowerCase();
      let best = -1, bestScore = 0;
      for (let i = 0; i < 3; i++) {
        const label = pLabels[i];
        if (!label) continue;
        const l = label.toLowerCase();
        let score = 0;
        if (l === lower) score = 100;
        else if (lower.startsWith(l + ' ')) score = 80 + Math.min(l.length, 19);
        if (score > bestScore) { bestScore = score; best = i; }
      }
      return best;
    };

    Rows.rows().forEach(tr => {
      const g = (f) => { const el = tr.querySelector(`[data-f="${f}"]`); return el ? el.value : ''; };
      const kode = g('kode').trim();
      const mulai = Utils.parseTime(g('mulai'));
      const selesai = Utils.parseTime(g('selesai'));
      const prodName = g('batch');
      const durEl = tr.querySelector('.dur-v');
      const durInput = tr.querySelector('[data-f="durasi"]');

      const gVal = Utils.parseArithmeticExpression(g('good')) ?? 0;
      const dVal = Utils.parseArithmeticExpression(g('defect')) ?? 0;
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
      if (si === State.evalShift && c) nShift++;

      if (c === 'planned') {
        B += dur;
        if (si != null) sh[si].B += dur;
        
        // TAMBAHAN: Catat Planned downtime ke dalam produk (jika dipilih)
        if (si === State.evalShift && prodName) {
          const slot = matchProdSlot(prodName);
          if (slot >= 0) prodStats[slot].planned += dur;
        }

        // OEE 365: kegiatan "Mixing" (apa pun kodenya planned) dikurangi dari basis shift
        const keg = String(g('kegiatan') || '').trim().toLowerCase();
        if (si === State.evalShift && /\bmixing\b/.test(keg)) {
          mixingDur += dur;
          if (mulai != null && (minMixingStart == null || mulai < minMixingStart)) {
            minMixingStart = mulai;
          }
        }
      }
      else if (c === 'unplanned'){ 
        D += dur; 
        if (si != null) sh[si].D += dur; 
        
        // TAMBAHAN: Catat Unplanned downtime ke dalam produk (jika dipilih)
        if (si === State.evalShift && prodName) {
          const slot = matchProdSlot(prodName);
          if (slot >= 0) prodStats[slot].unplanned += dur;
        }
      }
      else if (c === 'prod') {
        if (si === State.evalShift && prodName) {
          const slot = matchProdSlot(prodName);
          if (slot >= 0) {
            prodStats[slot].dur += dur;
            prodStats[slot].actual += rowActual;
            prodStats[slot].good += gVal;
            prodStats[slot].defect += dVal;
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
    const hasShiftData = nShift > 0;
    const hasAvailabilityData = hasShiftData && sC > 0;

    State.el.oA.textContent = Utils.nf0(sA);
    State.el.oB.textContent = Utils.nf0(sB);
    State.el.oC.textContent = Utils.nf0(sC);
    State.el.oD.textContent = Utils.nf0(sD);
    State.el.oE.textContent = Utils.nf0(sE);

    const oFEl = State.el.oF;
    oFEl.textContent = hasAvailabilityData ? Utils.nf2(sF) : '—';
    oFEl.style.color = hasAvailabilityData
      ? (sF >= CONFIG.TARGET.AVAILABILITY ? 'var(--green-d)' : 'var(--red)')
      : '#94a3b8';
    oFEl.style.fontWeight = '700';

    // === PERFORMANCE PER PRODUK ===
    // Setiap slot produk dihitung INDEPENDEN: target = Σ(durasi_baris × rate_efektif_baris).
    // Rate mengikuti master produk slot tersebut (atau tabel man-power Kemas L1/L2).
    // Performance total = tertimbang: Σ actual / Σ target (bukan rata-rata % antar produk),
    // supaya produk A rate 10 dan produk B rate 20 tidak "digabung" secara setara.
    let sumTargetAll = 0, sumActualAll = 0;
    for (let i = 0; i < 3; i++) {
      const gTarget = prodStats[i].target > 0
        ? prodStats[i].target
        : (prodStats[i].dur * prodStats[i].rate);
      const hAct = prodStats[i].actual;
      const perfI = gTarget > 0 ? (hAct / gTarget) * 100 : 0;

      if (pLabels[i] && (prodStats[i].rate > 0 || prodStats[i].target > 0 || prodStats[i].actual > 0)) {
        sumTargetAll += gTarget;
        sumActualAll += hAct;
      }

      State.el['oG' + (i+1)].textContent = Utils.nf0(gTarget);
      State.el['oH' + (i+1)].textContent = Utils.nf0(hAct);
      const elI = State.el['oI' + (i+1)];
      elI.textContent = Utils.nf2(perfI);
      elI.style.color = perfI >= CONFIG.TARGET.PERFORMANCE ? 'var(--green-d)' : 'var(--red)';
      elI.style.fontWeight = '700';
    }

    // Tertimbang: total output aktual ÷ total target teoritis seluruh produk aktif
    const avgPerfI = sumTargetAll > 0 ? (sumActualAll / sumTargetAll) * 100 : 0;
    State.el.oITotal.textContent = Utils.nf2(avgPerfI);
    const badge = State.el.badgeAvgP;
    badge.style.color = avgPerfI >= CONFIG.TARGET.PERFORMANCE ? 'var(--green-d)' : 'var(--red)';
    badge.style.borderColor = avgPerfI >= CONFIG.TARGET.PERFORMANCE ? 'rgba(18,161,80,0.3)' : 'rgba(220,38,38,0.3)';

// === RINGKASAN PRODUK (tabel modern di atas matrix OEE) ===  
  const summaryBody = document.getElementById('oeeSummaryBody');  
  if (summaryBody) {  
    const rows = [];  
    
    // Fungsi bantuan untuk mengubah angka 0 menjadi N/A
    const formatNA = (val) => (val === 0) ? 'N/A' : Utils.nf0(val);

    for (let i = 0; i < 3; i++) {  
      const st = prodStats[i];  
      const label = pLabels[i];  
      const hasData = label && (st.dur > 0 || st.actual > 0 || st.target > 0 || st.rate > 0 || st.planned > 0 || st.unplanned > 0);  
      if (!hasData) continue;  
      
      const gTarget = st.target > 0 ? st.target : (st.dur * st.rate);  
      const defectCls = st.defect > 0 ? ' class="defect-val"' : ''; 
      
      // HITUNG WAKTU TOTAL SHIFT
      const waktuTotal = st.dur + st.planned + st.unplanned;
      
      rows.push(  
        `<tr>` +  
        `<td><span class="prod-icon">📦</span>${Utils.escapeHtml ? Utils.escapeHtml(label) : label}</td>` +
        `<td class="highlight-text bg-waktu-total"><b>${formatNA(waktuTotal)}</b></td>` +
        `<td class="highlight-text bg-waktu-ops">${formatNA(st.dur)}</td>` +  
        `<td class="bg-planned-dt">${formatNA(st.planned)}</td>` +  
        `<td class="bg-unplanned-dt">${formatNA(st.unplanned)}</td>` +  
        `<td>${formatNA(st.rate)}</td>` +  
        `<td>${formatNA(gTarget)}</td>` +  
        `<td>${formatNA(st.actual)}</td>` +  
        `<td>${formatNA(st.good)}</td>` +  
        `<td${defectCls}>${formatNA(st.defect)}</td>` +  
        `</tr>`  
      );  
    }  
    summaryBody.innerHTML = rows.length  
      ? rows.join('')  
      : `<tr class="oee-summary-empty"><td colspan="10">Belum ada data produk pada shift ini</td></tr>`;  
  }

    // === QUALITY PER PRODUK ===
    // Mengisi J/K/L/M per kolom produk (oJ1..oJ3, oK1..oK3, oL1..oL3, oM1..oM3),
    // lalu menghitung M gabungan tertimbang untuk rumus OEE di bawahnya.
    let sumJ = 0, sumK = 0, sumL = 0;

    for (let i = 1; i <= 3; i++) {
      const st = prodStats[i - 1];
      const Ki = st.defect || 0;
      const Li = Math.max(st.good || 0, 0);
      const Ji = Ki + Li;
      const Mi = Ji > 0 ? (Li / Ji) * 100 : 0;

      sumJ += Ji;
      sumK += Ki;
      sumL += Li;

      const elJ = document.getElementById('oJ' + i);
      const elK = document.getElementById('oK' + i);
      const elL = document.getElementById('oL' + i);
      const elM = document.getElementById('oM' + i);

      if (elJ) elJ.textContent = Utils.nf0(Ji);
      if (elK) elK.textContent = Utils.nf0(Ki);
      if (elL) elL.textContent = Utils.nf0(Li);
      if (elM) {
        elM.textContent = Utils.nf2(Mi);
        elM.style.color = Mi >= (CONFIG.TARGET.QUALITY || 99.5) ? 'var(--green-d)' : 'var(--red)';
        elM.style.fontWeight = '700';
      }
    }

    // Gabungan OEE Quality (Quality total tertimbang)
    const avgM = sumJ > 0 ? (sumL / sumJ) * 100 : 0;
    const M = avgM; // ← dipakai rumus OEE & OEE 365 di bawah
    const J = sumJ; // ← dipakai diagnostik di bawah

    // === OEE standar (Availability = E/C vs waktu terencana) ===
    const oee = sF * avgPerfI * M / 10000;
    const oeeEl = State.el.oee;
    oeeEl.textContent = Utils.nf2(oee) + '%';
    oeeEl.style.color = oee >= CONFIG.TARGET.OEE ? '#2ee27e' : '#f87171';

    // === OEE 365 ===
    // Jeda = waktu dari awal shift sampai kegiatan Mixing pertama (waktu sebelum Mixing).
    // Time Available Filling / basis OEE 365 = shift − jeda − Mixing.
    // Contoh (Shift 2 = 480, jeda 67, Mixing 268):
    //   A365_base = 480 − 67 − 268 = 145
    //   Planned non-mixing = 30, Unplanned = 20 → E = 145 − 30 − 20 = 95
    //   A365 = 95/145 ≈ 65,52%  →  OEE365 = A365 × P × Q
    // Jika tidak ada Mixing, basis = menit penuh shift (perilaku lama).
    let jedaDur = 0;
    if (mixingDur > 0 && minMixingStart != null) {
      const shiftStarts = [420, 930, 1410]; // 07:00, 15:30, 23:30
      let startMin = shiftStarts[State.evalShift];
      if (State.evalShift === 2 && minMixingStart < 420) startMin = 0;
      jedaDur = Math.max(0, minMixingStart - startMin);
      if (jedaDur > sA) jedaDur = 0;
    }
    const a365Base = Math.max(sA - jedaDur - mixingDur, 0);
    // E tetap sama: sE = sA − B − D
    const a365 = a365Base > 0 ? (sE / a365Base) * 100 : 0;
    const hasAvailability365Data = hasShiftData && a365Base > 0;
    const oee365 = a365 * avgPerfI * M / 10000;

    const set365 = (key, text, color) => {
      let el = State.el[key];
      if (!el) { el = document.getElementById(key); if (el) State.el[key] = el; }
      if (!el) return;
      el.textContent = text;
      if (color) el.style.color = color;
    };
    set365('o365A', Utils.nf0(a365Base));
    set365('o365E', Utils.nf0(sE));
    set365(
      'o365F',
      hasAvailability365Data ? Utils.nf2(a365) : '—',
      hasAvailability365Data
        ? (a365 >= CONFIG.TARGET.AVAILABILITY ? 'var(--green-d)' : 'var(--red)')
        : '#94a3b8'
    );
    set365('o365P', Utils.nf2(avgPerfI) + ' %');
    set365('o365Q', Utils.nf2(M) + ' %');
    set365('oee365', Utils.nf2(oee365) + '%');
    const oee365Result = (State.el.oee365 || document.getElementById('oee365'))
      ?.closest('.oee365-result-row');
    if (oee365Result) {
      oee365Result.classList.toggle('is-good', nShift > 0 && oee365 >= (CONFIG.TARGET.OEE365 || 55));
      oee365Result.classList.toggle('is-bad', nShift > 0 && oee365 < (CONFIG.TARGET.OEE365 || 55));
    }
    if (State.el.rincSub365 && !hasAvailability365Data) {
      State.el.rincSub365.textContent =
        `Shift ${State.evalShift + 1} · Belum ada data untuk menghitung Availability 365`;
    } else if (State.el.rincSub365) {
      let note = '';
      if (jedaDur > 0 || mixingDur > 0) {
        note = (jedaDur > 0 ? ` − Jeda ${Utils.nf0(jedaDur)}` : '') +
               (mixingDur > 0 ? ` − Mixing ${Utils.nf0(mixingDur)}` : '');
      }
      State.el.rincSub365.textContent =
        `Shift ${State.evalShift + 1} · A₃₆₅ = ${Utils.nf0(a365Base)} mnt (${sA}${note}) · E = ${Utils.nf0(sE)} mnt · A365 = ${Utils.nf2(a365)}%`;
    }
    if (State.el.diag365) {
      State.el.diag365.innerHTML = hasAvailability365Data
        ? `<div class="d-item ok">OEE 365 = ${Utils.nf2(a365)}% × ${Utils.nf2(avgPerfI)}% × ${Utils.nf2(M)}% = <b>${Utils.nf2(oee365)}%</b>
           <br><small>Availability 365 = E ÷ Time Available Filling.</small></div>`
        : `<div class="d-item">Belum ada data pada Shift ${State.evalShift + 1} untuk menghitung OEE 365.</div>`;
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
      State.el.oee365IndicatorValue.textContent = hasShiftData ? Utils.nf2(oee365) + '%' : '—';
      if (State.el.oee365Indicator) {
        State.el.oee365Indicator.classList.remove('good', 'warn', 'bad');
        // OEE 365 pakai target khusus 55%, bukan target OEE utama (88%)
        if (hasShiftData) {
          if (oee365 >= (CONFIG.TARGET.OEE365 || 55)) State.el.oee365Indicator.classList.add('good');
          else if (oee365 >= 45) State.el.oee365Indicator.classList.add('warn');
          else State.el.oee365Indicator.classList.add('bad');
        }
      }
    }

    // Kartu A / P / Q / OEE di atas log sheet — tulis LANGSUNG dari angka hitung
    // (jangan hanya mengandalkan salinan DOM lewat updateUnifiedControl).
    const setKpi = (key, text) => {
      let el = State.el[key];
      if (!el) { el = document.getElementById(key); if (el) State.el[key] = el; }
      if (el) el.textContent = text;
    };
    setKpi('sheetKpiA', hasAvailabilityData ? Utils.nf2(sF) + '%' : '—');
    setKpi('sheetKpiP', Utils.nf2(avgPerfI) + '%');
    setKpi('sheetKpiQ', Utils.nf2(M) + '%');
    setKpi('sheetKpiOEE', Utils.nf2(oee) + '%');
    // Baris OEE 365 (A365 = E ÷ basis shift − Mixing; P & Q sama dengan OPE)
    setKpi('sheetKpiA365', hasAvailability365Data ? Utils.nf2(a365) + '%' : '—');
    setKpi('sheetKpiP365', Utils.nf2(avgPerfI) + '%');
    setKpi('sheetKpiQ365', Utils.nf2(M) + '%');
    setKpi('sheetKpiOEE365', Utils.nf2(oee365) + '%');
    // Health-bar warna (jika UI tersedia)
    const kpiPairs = [
      ['sheetKpiA', hasAvailabilityData ? sF : null, 90], ['sheetKpiP', avgPerfI, 98], ['sheetKpiQ', M, 99.5], ['sheetKpiOEE', oee, 88],
      ['sheetKpiA365', hasAvailability365Data ? a365 : null, 56], ['sheetKpiP365', avgPerfI, 98], ['sheetKpiQ365', M, 99.5],
      ['sheetKpiOEE365', oee365, (CONFIG.TARGET.OEE365 || 55)],
    ];
    if (typeof UI !== 'undefined' && UI.updateKpiHealthBar) {
      kpiPairs.forEach(([id, val]) => {
        const node = State.el[id] || document.getElementById(id);
        const card = node && node.closest ? node.closest('.sheet-kpi') : null;
        if (!card) return;
        if (val === null) {
          card.querySelector('.kpi-fill')?.style.setProperty('width', '0%');
          card.removeAttribute('data-state');
          card.classList.remove('kpi-achieved');
          return;
        }
        UI.updateKpiHealthBar(card, String(val));
      });
    } else {
      kpiPairs.forEach(([id, val, tgt]) => {
        const node = State.el[id] || document.getElementById(id);
        const card = node && node.closest ? node.closest('.sheet-kpi') : null;
        if (!card) return;
        const fill = card.querySelector('.kpi-fill');
        if (val === null) {
          if (fill) fill.style.width = '0%';
          card.removeAttribute('data-state');
          card.classList.remove('kpi-achieved');
          return;
        }
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