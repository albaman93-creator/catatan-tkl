/**
 * PRINTSHEET.JS
 * Cetak (Print) data yang sedang diisi ke format kertas A4 Landscape,
 * mengikuti tata-letak formulir kertas "Formulir Catatan Pemakaian TKL
 * (Tenaga Kerja Langsung) dan Mesin" milik FIMA.
 *
 * Cara kerja: saat tombol 🖨️ Print diklik, seluruh isi tabel Log Sheet +
 * tabel Perhitungan OEE (yang nilainya sudah live ter-hitung di layar)
 * disalin ke #printArea (elemen tersembunyi, hanya tampil lewat CSS
 * @media print). Browser lalu diminta print (window.print()). Halaman
 * lain (toolbar, sidebar, dsb) otomatis disembunyikan saat print lewat
 * CSS di style.css.
 *
 * Pagination: tabel Log Sheet pakai <thead> asli HTML supaya browser
 * OTOMATIS mengulang header kolom di setiap halaman baru kalau jumlah
 * baris melebihi 1 halaman A4 — tidak perlu hitung manual berapa baris
 * muat per halaman.
 */
const PrintSheet = (() => {
  'use strict';

  // ====== LEGENDA STATIS (sesuai formulir kertas, tidak berubah) ======
  const KODE_LEGEND = [
    { k: 1, label: 'Adjustment Loss (Kegiatan setting mesin karena berubah, dll)' },
    { k: 2, label: 'Primary (Machine Running)' },
    { k: 3, label: 'Breakdown (Kerusakan Mesin)' },
    { k: 4, label: 'Carry Loss (Over Kegiatan Kode 7)' },
    { k: 5, label: 'Autonomous Maintenance (AM) Activity (CILT dan Close White Tag)' },
    { k: 6, label: 'Preventive Maintenance (PM, Close Yellow dan Red Tag)' },
    { k: 7, label: 'Ganti Standar (G.BN, G. LOT, Ganti Material dll)' },
    { k: 8, label: 'Planned Shutdown (Istirahat, Briefing, Ganti Baju, dll)' },
    { k: 9, label: 'Line Stop (Tunggu Release, Tunggu Material, dll)' },
  ];

  const KAMUS_KECIL = [
    { ket: 'Istirahat (shift 1, 2 & 3)', kode: 8, durasi: '30 menit' },
    { ket: 'Extra Fooding',              kode: 8, durasi: '30 menit' },
  ];

  // ====== KUMPULKAN DATA DARI FORM ======
  const collectHeaderInfo = () => {
    const dateVal = State.el.fDate ? State.el.fDate.value : '';
    const dateText = dateVal ? Utils.formatDateText(dateVal) : '—';
    const shiftText = `Shift ${State.evalShift + 1}`;
    const lineText = State.el.fLine ? `Line ${State.el.fLine.value}` : '—';
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
    return { dateText, shiftText, lineText, stageText, ops, rateText };
  };

  const readField = (tr, f) => {
    const el = tr.querySelector(`[data-f="${f}"]`);
    return el ? el.value : '';
  };

  // ====== HALAMAN 1: HEADER + TABEL LOG SHEET ======
  const buildPage1 = () => {
    const info = collectHeaderInfo();
    const rowsArr = Rows.rows();

    let totalDurasi = 0;
    const bodyRows = rowsArr.map((tr, i) => {
      const durasiVal = parseFloat(readField(tr, 'durasi')) || 0;
      // Durasi kolom "durasi" cuma terisi di Mode Cepat; di Mode Normal
      // durasi dihitung dari selesai-mulai lewat teks .dur-v di layar.
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
          <div class="print-logo">FIMA</div>
          <h2>Formulir Catatan Pemakaian TKL (Tenaga Kerja Langsung) dan Mesin</h2>
        </div>
        <table class="print-info-tbl">
          <tr>
            <td><b>Tanggal</b> : ${info.dateText}</td>
            <td><b>Shift</b> : ${info.shiftText}</td>
            <td><b>Line</b> : ${info.lineText}</td>
            <td><b>Tahapan Proses</b> : ${info.stageText}</td>
          </tr>
          <tr>
            <td colspan="2"><b>Inisial OP/Packer</b> : ${info.ops}</td>
            <td colspan="2"><b>Produk &amp; Kec. Standar</b> : ${info.rateText}</td>
          </tr>
        </table>

        <table class="print-log-tbl">
          <thead>
            <tr>
              <th rowspan="2">Kode</th>
              <th rowspan="2">OP</th>
              <th colspan="4">Definisi Waktu</th>
              <th rowspan="2">Durasi<br>(menit)</th>
              <th rowspan="2">Aktivitas Kegiatan</th>
              <th rowspan="2">Masalah / Penyebab</th>
              <th rowspan="2">Disposisi / Tindakan</th>
              <th rowspan="2">No. WO</th>
              <th rowspan="2">Produk &amp; Batch</th>
              <th colspan="2">Total Output</th>
            </tr>
            <tr>
              <th>Dari</th><th>Panggil Teknik</th><th>Teknik Datang</th><th>Sampai</th>
              <th>Good</th><th>Defect</th>
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
          <tfoot>
            <tr><td colspan="6" class="tot-label">Total Durasi</td><td class="pc"><b>${Utils.nf0(totalDurasi)}</b></td><td colspan="7"></td></tr>
          </tfoot>
        </table>

        <table class="print-legend-tbl">
          <tr><th colspan="2">Kode Kegiatan TKL</th></tr>
          ${KODE_LEGEND.map(l => `<tr><td class="pc">${l.k}</td><td>${l.label}</td></tr>`).join('')}
        </table>
      </div>`;
  };

  // ====== HALAMAN 2: KAMUS KECIL + DEFECT + PERHITUNGAN OEE ======
  const buildPage2 = () => {
    const oeeTbl = document.querySelector('.oee-matrix-tbl');
    const oeeClone = oeeTbl ? oeeTbl.outerHTML : '<p>(Tabel OEE tidak ditemukan)</p>';

    return `
      <div class="print-page print-page-break">
        <div class="print-header">
          <div class="print-logo">FIMA</div>
          <h2>Formulir Catatan Pemakaian TKL — Kamus &amp; Perhitungan OEE</h2>
        </div>

        <div class="print-2col">
          <div class="print-col">
            <table class="print-kamus-tbl">
              <tr><th colspan="3">Kamus Kecil dan Standar Waktu Kegiatan</th></tr>
              <tr><th>Keterangan</th><th>Kode</th><th>Durasi (menit)</th></tr>
              ${KAMUS_KECIL.map(k => `<tr><td>${k.ket}</td><td class="pc">${k.kode}</td><td class="pc">${k.durasi}</td></tr>`).join('')}
              <tr><td>&nbsp;</td><td></td><td></td></tr>
              <tr><td>&nbsp;</td><td></td><td></td></tr>
              <tr><td>&nbsp;</td><td></td><td></td></tr>
            </table>

            <table class="print-defect-tbl">
              <tr><th>Jenis Defect</th><th>Frekuensi Defect</th><th>Total</th></tr>
              <tr><td>&nbsp;</td><td></td><td></td></tr>
              <tr><td>&nbsp;</td><td></td><td></td></tr>
              <tr><td>&nbsp;</td><td></td><td></td></tr>
              <tr><td>&nbsp;</td><td></td><td></td></tr>
              <tr><td>&nbsp;</td><td></td><td></td></tr>
            </table>
          </div>

          <div class="print-col print-oee-col">${oeeClone}</div>
        </div>
      </div>`;
  };

  const buildAndPrint = () => {
    if (!State.el.printArea) return;
    State.el.printArea.innerHTML = buildPage1() + buildPage2();
    // Beri jeda 1 frame supaya browser sempat layout dulu sebelum print dialog muncul
    requestAnimationFrame(() => window.print());
  };

  const bind = () => {
    if (State.el.btnPrint) {
      State.el.btnPrint.addEventListener('click', buildAndPrint);
    }
  };

  return { buildAndPrint, bind };
})();
