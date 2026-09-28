/**
 * PRINTSHEET.JS — Cetak log sheet mengikuti form kertas FIMA.
 * Halaman 1: Header info + tabel log sheet.
 * Halaman 2: Kamus Kecil + OEE + Minor Stoppages + Defect + Kode Kegiatan TKL.
 */
const PrintSheet = (() => {
  'use strict';

  /* =========================================================
     LOGO PERUSAHAAN
     =========================================================
     Path file logo. Kalau file dipindah/rename, sesuaikan di sini.
     Kalau dikosongkan ('') → otomatis pakai teks "FIMA".
     ========================================================= */
  const LOGO_BASE64 = './icons/logo_fima.jpeg';

  // Helper: pilih logo img atau teks fallback
  const logoHtml = () => {
    const src = String(LOGO_BASE64 || '').trim();
    const isValid =
      src &&
      src !== 'PASTE_DISINI' &&
      (src.startsWith('data:image') ||
       src.startsWith('./') ||
       src.startsWith('../') ||
       src.startsWith('/') ||
       src.startsWith('http'));

    if (isValid) {
      return `<img src="${src}" alt="Logo" class="print-logo-img">`;
    }
    return `<div class="print-logo">FIMA</div><div class="print-logo-sub">LOG SHEET</div>`;
  };

  // ====== LEGENDA / KAMUS KECIL (dari form kertas) ======
  const KODE_LEGEND = [
    { k: 1, label: 'Adjustment Loss (Kegiatan setting mesin karena berubah, dll)' },
    { k: 2, label: 'Primary (Machine Running)' },
    { k: 3, label: 'Breakdown (Kerusakan Mesin)' },
    { k: 4, label: 'SUCU Loss (Over Kegiatan Kode 7)' },
    { k: 5, label: 'Line Clearance, CIP, SIP, Musnah & hilang reject (visual)' },
    { k: 6, label: 'Autonomous Maintenance (AM) & Preventive Maintenance Activity' },
    { k: 7, label: 'Ganti Lot, Approve Spesimen, Pasang Filter, Flushing, Papar Media, Cek Val 2, Persiapan Mixing, Change Part' },
    { k: 8, label: 'Planned Shutdown (Istirahat, Briefing, Ganti Baju dll)' },
    { k: 9, label: 'Line Stop (Tunggu Release, Tunggu Material, dll)' },
  ];

  const KAMUS_KECIL = [
    { ket: 'Istirahat (shift 1, 2 & 3)', kode: 8, durasi: '30 menit' },
    { ket: 'Extra Fooding',              kode: 8, durasi: '30 menit' },
  ];

  // ====== KUMPULKAN DATA HEADER ======
  const collectHeaderInfo = () => {
    const dateVal = State.el.fDate ? State.el.fDate.value : '';
    const dateText = dateVal ? Utils.formatDateText(dateVal) : '—';
    const shiftText = `Shift ${State.evalShift + 1}`;
    const stageText = State.el.fStage
      ? State.el.fStage.options[State.el.fStage.selectedIndex].text
      : '—';
    const ops = ['op1','op2','op3','op4','op5','op6']
      .map(id => State.el[id] && State.el[id].value.trim())
      .filter(Boolean)
      .join(' / ') || '—';
    const prods = Rows.getActiveProducts();
    const rateText = prods.length
      ? prods.map(p => `${p} (${Rows.getRateForProduct ? Rows.getRateForProduct(p) : '—'}/mnt)`).join(', ')
      : '—';
    const namaMesin = (State.el.fMesinNama || document.getElementById('fMesinNama'))?.value || '';
    const kodeMesin = (State.el.fMesinKode || document.getElementById('fMesinKode'))?.value || '';
    return { dateText, shiftText, stageText, ops, rateText, namaMesin, kodeMesin };
  };

  const readField = (tr, f) => {
    const el = tr.querySelector(`[data-f="${f}"]`);
    return el ? el.value : '';
  };

  // ====== HALAMAN 1 — LOG SHEET ======
  const buildPage1 = () => {
    const info = collectHeaderInfo();
    const rowsArr = Rows.rows();

    let totalDurasi = 0;
    const bodyRows = rowsArr.map((tr) => {
      const durasiVal = parseFloat(readField(tr, 'durasi')) || 0;
      const durV = tr.querySelector('.dur-v');
      const durText = durV && durV.textContent.trim() ? durV.textContent.trim() : (durasiVal || '');
      if (!isNaN(parseFloat(durText))) totalDurasi += parseFloat(durText);

      return `
        <tr>
          <td class="pc">${Utils.escapeHtml(readField(tr, 'kode'))}</td>
          <td class="pc">${Utils.escapeHtml(readField(tr, 'op'))}</td>
          <td class="pt">${Utils.escapeHtml(readField(tr, 'mulai'))}</td>
          <td class="pt">${Utils.escapeHtml(readField(tr, 'panggil'))}</td>
          <td class="pt">${Utils.escapeHtml(readField(tr, 'teknik'))}</td>
          <td class="pt">${Utils.escapeHtml(readField(tr, 'selesai'))}</td>
          <td class="pc">${Utils.escapeHtml(durText)}</td>
          <td class="pl">${Utils.escapeHtml(readField(tr, 'kegiatan'))}</td>
          <td class="pl">${Utils.escapeHtml(readField(tr, 'masalah'))}</td>
          <td class="pl">${Utils.escapeHtml(readField(tr, 'disposisi'))}</td>
          <td class="pc">${Utils.escapeHtml(readField(tr, 'wo'))}</td>
          <td class="pl">${Utils.escapeHtml(readField(tr, 'batch'))}</td>
          <td class="pc">${Utils.escapeHtml(readField(tr, 'good'))}</td>
          <td class="pc">${Utils.escapeHtml(readField(tr, 'defect'))}</td>
        </tr>`;
    }).join('');

    return `
      <div class="print-page">
        <div class="print-header">
          <div class="print-header-top">
            <div class="print-logo-block">
              ${logoHtml()}
            </div>
            <h2>Formulir Catatan Pemakaian TKL (Tenaga Kerja Langsung) dan Mesin</h2>
            <div class="print-approved">
              <div class="print-approved-label">Approved (Tanda Tangan)</div>
              <div class="print-approved-box"></div>
            </div>
          </div>
          <table class="print-info-tbl">
            <tr>
              <td><b>Tanggal</b> : ${info.dateText}</td>
              <td><b>Nama Mesin</b> : ${info.namaMesin || '—'}</td>
              <td><b>No. Mesin</b> : ${info.kodeMesin || '—'}</td>
              <td><b>Kec. Standar PQ</b> : ${info.rateText}</td>
              <td rowspan="2"><b>Inisial OP/Packer</b><br>${info.ops}</td>
            </tr>
            <tr>
              <td><b>Shift</b> : ${info.shiftText}</td>
              <td colspan="2"><b>Tahapan Proses</b> : ${info.stageText}</td>
              <td><b>Kec. Actual</b> : —</td>
            </tr>
          </table>
        </div>

        <table class="print-log-tbl">
          <colgroup>
            <col class="col-kode"><col class="col-op">
            <col class="col-mulai"><col class="col-panggil"><col class="col-teknik"><col class="col-selesai">
            <col class="col-durasi">
            <col class="col-kegiatan"><col class="col-masalah"><col class="col-disposisi">
            <col class="col-wo"><col class="col-batch">
            <col class="col-good"><col class="col-defect">
          </colgroup>
          <thead>
            <tr>
              <th rowspan="2">Kode<br>Keg.</th>
              <th rowspan="2">Jumlah<br>TKL</th>
              <th colspan="4">Definisi Waktu</th>
              <th rowspan="2">Durasi<br>(menit)</th>
              <th rowspan="2">Aktivitas Kegiatan<br><small>(yang dilakukan oleh Operator/Packer)</small></th>
              <th rowspan="2">Masalah / Penyebab<br><small>(Alasan terjadinya masalah)</small></th>
              <th rowspan="2">Disposisi/Tindakan Sementara<br><small>(Tindakan yang dilakukan untuk pengurusan masalah)</small></th>
              <th rowspan="2">Nomor WO<br><small>(Yang dibuat)</small></th>
              <th rowspan="2">Kode Produk &amp; Batch Number<br><small>(Oli/Logsheet)</small></th>
              <th colspan="2">Total Output<br><small>(Operator/Packer)</small></th>
            </tr>
            <tr>
              <th>Dari</th>
              <th>Panggil<br>Teknik</th>
              <th>Teknik<br>Datang</th>
              <th>Sampai</th>
              <th>Good</th>
              <th>Defect</th>
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
          <tfoot>
            <tr>
              <td colspan="6" class="tot-label">Total Durasi</td>
              <td class="pc"><b>${Utils.nf0(totalDurasi)}</b></td>
              <td colspan="7"></td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  };

  // ====== HALAMAN 2 — KAMUS + OEE ======
  const buildPage2 = () => {
    const oeeTbl = document.querySelector('.oee-matrix-tbl');
    const oeeClone = oeeTbl ? oeeTbl.outerHTML : '<p>(Tabel OEE tidak ditemukan)</p>';

    // Kamus Kecil 2 sub-kolom: kiri kode 1-5, kanan kode 6-9
    const leftKamus = KODE_LEGEND.slice(0, 5);
    const rightKamus = KODE_LEGEND.slice(5);
    const maxLen = Math.max(leftKamus.length, rightKamus.length);
    const kamusRows = [];
    for (let i = 0; i < maxLen; i++) {
      const L = leftKamus[i] || { k: '', label: '' };
      const R = rightKamus[i] || { k: '', label: '' };
      kamusRows.push(`
        <tr>
          <td class="pc kamus-k">${L.k}</td>
          <td class="kamus-lbl">${L.label}</td>
          <td class="pc kamus-k">${R.k}</td>
          <td class="kamus-lbl">${R.label}</td>
        </tr>`);
    }

    // Baris kosong untuk tabel yang perlu diisi tangan
    const blankRows = (n, cols) =>
      Array.from({ length: n }, () =>
        `<tr>${Array.from({ length: cols }, () => '<td>&nbsp;</td>').join('')}</tr>`
      ).join('');

    return `
      <div class="print-page print-page-break">
        <div class="print-header">
          <div class="print-header-top">
            <div class="print-logo-block">
              ${logoHtml()}
            </div>
            <h2>Formulir Catatan Pemakaian TKL (Tenaga Kerja Langsung) dan Mesin</h2>
          </div>
        </div>

        <div class="print-2col">
          <!-- KIRI -->
          <div class="print-col print-col-left">
            <table class="print-kamus-tbl">
              <thead>
                <tr><th colspan="4">Kamus Kecil dan Standar Waktu Kegiatan</th></tr>
                <tr>
                  <th class="kamus-k">Kode</th>
                  <th class="kamus-lbl">Kegiatan</th>
                  <th class="kamus-k">Kode</th>
                  <th class="kamus-lbl">Kegiatan</th>
                </tr>
              </thead>
              <tbody>${kamusRows.join('')}</tbody>
            </table>

            <table class="print-ms-tbl">
              <thead>
                <tr><th colspan="3">Minor Stoppages</th></tr>
                <tr>
                  <th>Keterangan</th>
                  <th>Frekuensi Kejadian</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>${blankRows(4, 3)}</tbody>
            </table>

            <table class="print-defect-tbl">
              <thead>
                <tr><th colspan="3">Defect Produk</th></tr>
                <tr>
                  <th>Keterangan</th>
                  <th>Frekuensi Defect</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>${blankRows(4, 3)}</tbody>
            </table>

            <table class="print-kktbl-tbl">
              <thead>
                <tr><th colspan="6">Kode Kegiatan TKL</th></tr>
                <tr>
                  <th>Keterangan</th><th>Kode</th><th>Durasi (menit)</th>
                  <th>Keterangan</th><th>Kode</th><th>Durasi (menit)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Istirahat (shift 1, 2 &amp; 3)</td>
                  <td class="pc">8</td><td class="pc">30 menit</td>
                  <td>&nbsp;</td><td></td><td></td>
                </tr>
                <tr>
                  <td>Extra Fooding</td>
                  <td class="pc">8</td><td class="pc">30 menit</td>
                  <td>&nbsp;</td><td></td><td></td>
                </tr>
                ${blankRows(2, 6)}
              </tbody>
            </table>
          </div>

          <!-- KANAN: OEE -->
          <div class="print-col print-col-right print-oee-col">
            ${oeeClone}
            <div class="print-oee-footer">
              <div class="print-oee-formula">OEE = %Availability × %Performance × %Quality</div>
              <div class="print-oee-sign">_______ × _______ × _______ = _______ %</div>
            </div>
          </div>
        </div>
      </div>`;
  };

  const buildAndPrint = () => {
    if (!State.el.printArea) return;
    State.el.printArea.innerHTML = buildPage1() + buildPage2();
    requestAnimationFrame(() => window.print());
  };

  const bind = () => {
    if (State.el.btnPrint) {
      State.el.btnPrint.addEventListener('click', buildAndPrint);
    }
  };

  return { buildAndPrint, bind };
})();