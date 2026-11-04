/**
 * TKL-OEE  ⇄  Google Sheets  (Apps Script terikat Spreadsheet)
 *
 * Alur:
 *  - Aplikasi → Supabase → (polling tiap 5 menit) → tab log / ringkasan / issue / speed standar
 *  - Edit di tab log → (langsung, onEdit) → Supabase → muncul di log sheet aplikasi
 *  - Edit Why-Why di tab "issue" → (langsung) → tabel pica_analysis
 *  - Edit tab "speed standar" → (langsung) → tabel speed_standar
 *
 * Kunci Supabase (service_role) disimpan HANYA di Script Properties (menu TKL Sync).
 */


// ============================ KONSTANTA ============================
var TAHAPAN = ['mixing', 'filling', 'steril', 'visual', 'kemas'];
var LINES = ['1', '2', '4'];
var UNPLANNED = [1, 3, 4, 9];
var MINOR_MAX_MIN = 10;
var LOG_TAB_RE = /^(mixing|filling|steril|visual|kemas) line (\d+)$/;


var SHEET_SHIFT = 'ringkasan shift';
var SHEET_PROD = 'ringkasan produk';
var SHEET_ISSUE = 'issue';
var SHEET_MESIN = 'mesin';
var SHEET_SPEED = 'speed standar';
var SHEET_SPEED_PROD = 'speed standar produksi';
var MESIN_DEFAULT = {
  'mixing|1': 'Mixing Tank OLSA PCBS 2500', 'filling|1': 'Automatic Form Fill Seal Machine Shinva RSYG2-1-23005',
  'steril|1': 'Autoclave Getinge 2', 'visual|1': 'Mesin Bonfiglioli', 'kemas|1': 'Overwrapping Machine Sysflex Line 1',
  'mixing|2': 'Mixing Tank Tofflon APLS 3500', 'filling|2': 'Automatic Form Fill Seal Machine Plumat FFS 991',
  'steril|2': 'Autoclave Shinva', 'visual|2': 'NIKKA DENSOK', 'kemas|2': 'Overwrapping Machine Sysflex Line 2',
  'mixing|4': 'Mixing TANK LB4000/1', 'filling|4': 'Automatic Form Fill Seal Machine Plumat FFS 892',
  'steril|4': 'Autoclave Getinge 4', 'visual|4': 'NIKKA DENSOK', 'kemas|4': 'Overwrapping Machine Plumat OW 834'
};
var COLOR_UNPLANNED = '#fde2e4', COLOR_PLANNED = '#fff1d6', COLOR_PROD = '#dcfce7';


var LOG_HEADERS = ['No', 'Tanggal', 'Shift', 'Nama Mesin', 'Kode Mesin', 'Produk', 'Batch Number', 'Rate/menit',
  'Kode', 'Man Power', 'Mulai', 'Panggil', 'Datang', 'Selesai', 'Durasi', 'Kegiatan', 'Masalah',
  'Frekuensi Minor Stop', 'Disposisi', 'Description', 'WO', 'Good', 'Defect', 'Operator', 'Updated At', 'Source'];
var C = { NO: 1, TGL: 2, SHIFT: 3, MESIN: 4, KODEMESIN: 5, PRODUK: 6, BN: 7, RATE: 8, KODE: 9, OP: 10, MULAI: 11,
  PANGGIL: 12, DATANG: 13, SELESAI: 14, DURASI: 15, KEGIATAN: 16, MASALAH: 17, MS: 18, DISPOSISI: 19,
  DESC: 20, WO: 21, GOOD: 22, DEFECT: 23, OPER: 24, UPD: 25, SRC: 26 };


var SHIFT_HEADERS = ['Tanggal', 'Shift', 'Line', 'Tahapan', 'Kode Produk', 'Nomor Batch', 'Operator', 'OPE A', 'OPE P',
  'OPE Q', 'OPE OEE', '365 A', '365 P', '365 Q', '365 OEE', 'Updated At'];
var PROD_HEADERS = ['Tanggal', 'Shift', 'Line', 'Tahapan', 'Nama Produk', 'Waktu Shift Total (mnt)',
  'Waktu Operasional (mnt)', 'Planned (mnt)', 'Unplanned (mnt)', 'Speed Std (u/mnt)', 'Output Std',
  'Output Aktual', 'Output Baik', 'Output Defect', 'Updated At'];
var ISSUE_HEADERS = ['Tanggal', 'Shift', 'Line', 'Tahapan', 'Jenis', 'Produk', 'Batch', 'Problem', 'Durasi (mnt)',
  'Why 1', 'Why 2', 'Why 3', 'Corrective', 'Preventive', 'PIC', 'Status', 'Row Key', 'Updated At'];
var ISS = { TGL: 1, SHIFT: 2, LINE: 3, TAHAPAN: 4, JENIS: 5, PRODUK: 6, BATCH: 7, PROBLEM: 8, DUR: 9,
  W1: 10, W2: 11, W3: 12, COR: 13, PRE: 14, PIC: 15, STATUS: 16, KEY: 17, UPD: 18 };

// Tab Speed Standar (master admin) ⇄ tabel public.speed_standar
var SPEED_HEADERS = ['No', 'Line', 'Produk', 'Speed Standar (bag/menit)', 'Id', 'Updated At', 'Source'];
var SP = { NO: 1, LINE: 2, PRODUK: 3, RATE: 4, ID: 5, UPD: 6, SRC: 7 };

// Tab Speed Standar Produksi = ringkasan rate dari oee_data (Tabel 1 di aplikasi), per bulan
var SPEED_PROD_HEADERS = ['Bulan', 'No', 'Line', 'Produk', 'Speed Standar (bag/menit)', 'Updated At'];
var SPP = { BULAN: 1, NO: 2, LINE: 3, PRODUK: 4, RATE: 5, UPD: 6 };


// ============================ HELPER UMUM ============================
var _ss = null;
function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function setProp_(k, v) { PropertiesService.getScriptProperties().setProperty(k, v); }
function ss_() {
  if (_ss) return _ss;
  var id = prop_('SPREADSHEET_ID');
  _ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  return _ss;
}
function tz_() { return ss_().getSpreadsheetTimeZone(); }
function pad2_(n) { n = String(n); return n.length < 2 ? '0' + n : n; }
function s_(v) { return v == null ? '' : String(v).trim(); }
function shiftN_(v) { var n = parseInt(String(v == null ? '' : v).trim(), 10); return n > 0 ? String(n) : ''; }
function nowIso_() { return new Date().toISOString(); }


function normDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  var s = s_(v), m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + pad2_(m[2]) + '-' + pad2_(m[3]);
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return m[3] + '-' + pad2_(m[2]) + '-' + pad2_(m[1]);
  return s;
}
function normTime_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'HH:mm');
  if (typeof v === 'number' && v >= 0 && v < 1) {
    var mins = Math.round(v * 1440);
    return pad2_(Math.floor(mins / 60) % 24) + ':' + pad2_(mins % 60);
  }
  var s = s_(v);
  if (!s) return '';
  var m = s.match(/^(\d{1,2})[:.](\d{2})/);
  if (m) return pad2_(m[1]) + ':' + m[2];
  m = s.match(/^(\d{3,4})$/);
  if (m) { var t = ('0000' + m[1]).slice(-4); return t.slice(0, 2) + ':' + t.slice(2); }
  return s;
}
function parseMin_(t) {
  var m = String(t == null ? '' : t).trim().match(/^(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
}
/** "msa, ren;FRD" → ['MSA','REN','FRD'] (huruf A–Z saja, maks. 3 huruf per orang, maks. 6 orang) */
function parseOps_(v) {
  return s_(v).toUpperCase().split(/[^A-Z]+/).filter(Boolean)
    .map(function (x) { return x.slice(0, 3); }).slice(0, 6);
}
function opsFromPayload_(p) {
  var o = (p && p.operators) || {};
  return [1, 2, 3, 4, 5, 6].map(function (i) { return s_(o['op' + i]); }).filter(Boolean);
}
function hhmm_(h, mi, orig) {
  h = parseInt(h, 10); mi = parseInt(mi, 10);
  return (h > 23 || mi > 59) ? orig : pad2_(h) + ':' + pad2_(mi);
}
/** Ketikan jam: 0830 / 830 / 8:30 / 8.30 → 08:30 ; 07 → 07:00 ; selain itu dibiarkan */
function normTypedTime_(v) {
  if (v instanceof Date || (typeof v === 'number' && v >= 0 && v < 1)) return normTime_(v);
  var s = s_(v), m;
  if (!s) return '';
  m = s.match(/^(\d{1,2})[:.](\d{2})$/); if (m) return hhmm_(m[1], m[2], s);
  m = s.match(/^(\d{3,4})$/); if (m) { var t = ('0000' + m[1]).slice(-4); return hhmm_(t.slice(0, 2), t.slice(2), s); }
  m = s.match(/^(\d{1,2})$/); if (m) return hhmm_(m[1], '00', s);
  return s;
}
function num_(v) {
  if (v == null || v === '') return null;
  var n = Number(String(v).replace(',', '.'));
  return isFinite(n) ? n : null;
}


// ============================ SUPABASE REST ============================
function sb_(method, path, body, extra) {
  var base = prop_('SUPABASE_URL'), key = prop_('SUPABASE_SERVICE_KEY');
  if (!base || !key) throw new Error('Koneksi Supabase belum diisi (menu TKL Sync → 2).');
  var headers = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  if (extra) for (var k in extra) headers[k] = extra[k];
  var opt = { method: method, headers: headers, muteHttpExceptions: true };
  if (body !== undefined && body !== null) opt.payload = JSON.stringify(body);
  var res = UrlFetchApp.fetch(base.replace(/\/$/, '') + '/rest/v1/' + path, opt);
  var code = res.getResponseCode(), text = res.getContentText();
  if (code >= 300) throw new Error('Supabase ' + code + ': ' + text.slice(0, 300));
  return text ? JSON.parse(text) : null;
}
function q_(v) { return encodeURIComponent(String(v)); }


// ============================ KONVERSI DATA (murni, bisa diuji) ============================
function slotFor_(pr, name) {
  name = s_(name);
  if (!name) return 0;
  for (var h = 1; h <= 3; h++) {
    var nm = s_(pr['p' + h + 'Name']);
    if (nm && (name === nm || name.indexOf(nm + ' ') === 0)) return h;
  }
  return 0;
}
function isEmptyRow_(r) {
  var f = ['kode', 'op', 'ms', 'mulai', 'panggil', 'teknik', 'selesai', 'durasi', 'kegiatan', 'masalah',
    'disposisi', 'description', 'good', 'defect'];
  for (var i = 0; i < f.length; i++) if (s_(r[f[i]]) !== '') return false;
  return true;
}


/** record oee_data → baris untuk tab log */
function payloadToLogRows_(rec) {
  var p = rec.payload || {}, pr = p.products || {}, ms = p.mesin || {}, rows = p.rows || [], out = [];
  var operator = opsFromPayload_(p).join(',');
  rows.forEach(function (r) {
    if (isEmptyRow_(r)) return;
    var h = slotFor_(pr, r.batch);
    // Kolom Produk = kode produk saja (mis. VTRM5). Aplikasi menyimpan label "VTRM5 L037012"; nomor batch ada di kolom sendiri.
    var produk = h ? (s_(pr['p' + h + 'Name']) || s_(r.batch)) : s_(r.batch);
    out.push([out.length + 1, normDate_(rec.date), Number(rec.shift), s_(ms.nama), s_(ms.kode), produk,
      h ? s_(pr['p' + h + 'Bn']) : '', h ? s_(pr['p' + h + 'Rate']) : '',
      s_(r.kode), s_(r.op), s_(r.mulai), s_(r.panggil), s_(r.teknik), s_(r.selesai), s_(r.durasi),
      s_(r.kegiatan), s_(r.masalah), s_(r.ms), s_(r.disposisi), s_(r.description), s_(r.wo),
      s_(r.good), s_(r.defect), operator, rec.updatedAt || '', rec.source || 'app']);
  });
  return out;
}


/** baris tab log (satu tanggal+shift) → payload; field yang tidak ada di sheet dipertahankan dari payload lama */
function logRowsToPayload_(vals, existing) {
  var p = JSON.parse(JSON.stringify(existing || {}));
  p.products = p.products || {};
  p.operators = p.operators || {};
  p.mesin = p.mesin || {};
  var rows = [], nama = '', kode = '', opList = [];
  vals.forEach(function (v) {
    if (!opList.length) opList = parseOps_(v[C.OPER - 1]);
    if (!nama) nama = s_(v[C.MESIN - 1]);
    if (!kode) kode = s_(v[C.KODEMESIN - 1]);
    var produk = s_(v[C.PRODUK - 1]);
    if (produk) {
      var h = slotFor_(p.products, produk);
      if (!h) for (var i = 1; i <= 3; i++) if (!s_(p.products['p' + i + 'Name'])) { h = i; p.products['p' + i + 'Name'] = produk; break; }
      if (h) {
        var bn = s_(v[C.BN - 1]), rate = s_(v[C.RATE - 1]);
        if (bn) p.products['p' + h + 'Bn'] = bn;
        if (rate) p.products['p' + h + 'Rate'] = rate;
      }
    }
    rows.push({
      kode: s_(v[C.KODE - 1]), op: s_(v[C.OP - 1]), ms: s_(v[C.MS - 1]),
      mulai: normTime_(v[C.MULAI - 1]), panggil: normTime_(v[C.PANGGIL - 1]),
      teknik: normTime_(v[C.DATANG - 1]), selesai: normTime_(v[C.SELESAI - 1]),
      durasi: s_(v[C.DURASI - 1]), kegiatan: s_(v[C.KEGIATAN - 1]), masalah: s_(v[C.MASALAH - 1]),
      disposisi: s_(v[C.DISPOSISI - 1]), description: s_(v[C.DESC - 1]),
      wo: s_(v[C.WO - 1]), batch: produk, good: s_(v[C.GOOD - 1]), defect: s_(v[C.DEFECT - 1])
    });
  });
  if (opList.length) for (var o2 = 1; o2 <= 6; o2++) p.operators['op' + o2] = opList[o2 - 1] || '';
  if (nama) p.mesin.nama = nama;
  if (kode) p.mesin.kode = kode;
  p.rows = rows;
  return p;
}


/** Breakdown (unplanned kode 1,3,4,9 dan > 10 menit) — sama dengan aturan pica.js */
function breakdownFromPayload_(rec) {
  var p = rec.payload || {}, pr = p.products || {}, out = [];
  (p.rows || []).forEach(function (x) {
    var k = parseInt(s_(x.kode), 10);
    if (UNPLANNED.indexOf(k) < 0) return;
    var s = parseMin_(x.mulai), e = parseMin_(x.selesai);
    var d = (s != null && e != null) ? ((e - s + 1440) % 1440) : (num_(x.durasi) || 0);
    if (!(d > MINOR_MAX_MIN)) return;
    var prodName = s_(x.batch), toks = prodName.split(/\s+/), batch = '';
    if (toks.length >= 2) batch = toks.slice(1).join(' ');
    else { var h = slotFor_(pr, prodName); if (h) batch = s_(pr['p' + h + 'Wo']); }
    out.push({
      rowKey: [x.kode, x.mulai, x.selesai].map(function (v) { return s_(v); }).join('|'),
      produk: toks[0] || prodName || '—', batch: batch,
      problem: s_(x.masalah) || s_(x.kegiatan) || '(tanpa keterangan)', dur: d
    });
  });
  return out;
}


// ============================ TULIS KE SHEET ============================
function ensureRows_(sh, needed) {
  var max = sh.getMaxRows();
  if (max < needed) sh.insertRowsAfter(max, needed - max + 200);
}


/** Ganti blok baris dengan kunci sama (in-place bila berurutan, selain itu hapus lalu tambah di bawah) */
function replaceBlock_(sh, keyCols, norms, keyVals, newRows, nCols) {
  var last = sh.getLastRow(), matches = [];
  if (last >= 2) {
    var maxC = Math.max.apply(null, keyCols);
    var data = sh.getRange(2, 1, last - 1, maxC).getValues();
    for (var i = 0; i < data.length; i++) {
      var ok = true;
      for (var j = 0; j < keyCols.length; j++) {
        if (norms[j](data[i][keyCols[j] - 1]) !== keyVals[j]) { ok = false; break; }
      }
      if (ok) matches.push(i + 2);
    }
  }
  var n = newRows.length;
  if (matches.length && matches[matches.length - 1] - matches[0] + 1 === matches.length) {
    var start = matches[0], old = matches.length;
    if (n > old) sh.insertRowsAfter(start + old - 1, n - old);
    else if (n < old) sh.deleteRows(start + n, old - n);
    if (n) sh.getRange(start, 1, n, nCols).setValues(newRows);
    return;
  }
  for (var k = matches.length - 1; k >= 0;) {
    var end = matches[k], s = end;
    while (k > 0 && matches[k - 1] === s - 1) { k--; s = matches[k]; }
    sh.deleteRows(s, end - s + 1);
    k--;
  }
  if (n) {
    var at = sh.getLastRow() + 1;
    ensureRows_(sh, at + n);
    sh.getRange(at, 1, n, nCols).setValues(newRows);
  }
}


function writeLog_(rec) {
  var sh = ss_().getSheetByName(rec.tahapan + ' line ' + rec.line);
  if (!sh) return;
  replaceBlock_(sh, [C.TGL, C.SHIFT], [normDate_, shiftN_],
    [normDate_(rec.date), shiftN_(rec.shift)], payloadToLogRows_(rec), LOG_HEADERS.length);
}


function writeSummary_(rec) {
  var sm = (rec.payload || {}).summary || {};
  var date = normDate_(rec.date), shift = shiftN_(rec.shift), line = String(rec.line), tah = rec.tahapan;
  var pct = function (v) { var n = num_(v); return n == null ? '' : n / 100; };
  var shSh = ss_().getSheetByName(SHEET_SHIFT), shPr = ss_().getSheetByName(SHEET_PROD);
  var pr0 = (rec.payload || {}).products || {};
  var names = [], bns = [];
  [1, 2, 3].forEach(function (h) {
    var nm = s_(pr0['p' + h + 'Name']);
    if (nm) { names.push(nm); bns.push(s_(pr0['p' + h + 'Bn']) || '-'); }
  });
  var opStr = opsFromPayload_(rec.payload || {}).join(',');
  var upd = rec.updatedAt || nowIso_();
  if (shSh && sm.ope && sm.oee365) {
    replaceBlock_(shSh, [1, 2, 3, 4], [normDate_, shiftN_, s_, s_], [date, shift, line, tah],
      [[date, Number(shift), line, tah, names.join(' | '), bns.join(' | '), opStr].concat([pct(sm.ope.a),
        pct(sm.ope.p), pct(sm.ope.q), pct(sm.ope.oee), pct(sm.oee365.a), pct(sm.oee365.p), pct(sm.oee365.q),
        pct(sm.oee365.oee), upd])], SHIFT_HEADERS.length);
  }
  if (shPr && Array.isArray(sm.produk)) {
    var rows = sm.produk.map(function (x) {
      return [date, Number(shift), line, tah, s_(x.nama), num_(x.waktuShift), num_(x.operasional), num_(x.planned),
        num_(x.unplanned), num_(x.speedStd), num_(x.outputStd), num_(x.outputAktual), num_(x.outputBaik),
        num_(x.outputDefect), upd];
    });
    replaceBlock_(shPr, [1, 2, 3, 4], [normDate_, shiftN_, s_, s_], [date, shift, line, tah], rows, PROD_HEADERS.length);
  }
}


// ---- tab issue ----
function issueKey_(date, shift, line, tah, rowKey) {
  return [normDate_(date), shiftN_(shift), s_(line), s_(tah), s_(rowKey)].join('|');
}
function issueIndex_(sh) {
  var map = {}, last = sh.getLastRow();
  if (last < 2) return map;
  var d = sh.getRange(2, 1, last - 1, ISS.KEY).getValues();
  d.forEach(function (v, i) {
    if (s_(v[ISS.KEY - 1])) map[issueKey_(v[0], v[1], v[2], v[3], v[ISS.KEY - 1])] = i + 2;
  });
  return map;
}
function writeBreakdownIssues_(rec) {
  var sh = ss_().getSheetByName(SHEET_ISSUE);
  if (!sh) return;
  var list = breakdownFromPayload_(rec);
  if (!list.length) return;
  var idx = issueIndex_(sh), add = [];
  list.forEach(function (b) {
    var key = issueKey_(rec.date, rec.shift, rec.line, rec.tahapan, b.rowKey), at = idx[key];
    if (at) {
      sh.getRange(at, ISS.PRODUK, 1, 4).setValues([[b.produk, b.batch, b.problem, b.dur]]);
    } else {
      add.push([normDate_(rec.date), Number(rec.shift), String(rec.line), rec.tahapan, 'Breakdown', b.produk, b.batch,
        b.problem, b.dur, '', '', '', '', '', '', 'Open', b.rowKey, nowIso_()]);
    }
  });
  if (add.length) {
    var at2 = sh.getLastRow() + 1;
    ensureRows_(sh, at2 + add.length);
    sh.getRange(at2, 1, add.length, ISSUE_HEADERS.length).setValues(add);
  }
}
function upsertIssueFromPica_(r) {
  var sh = ss_().getSheetByName(SHEET_ISSUE);
  if (!sh) return;
  var key = issueKey_(r.rec_date, r.shift, r.line, r.tahapan, r.row_key), at = issueIndex_(sh)[key];
  var row = [normDate_(r.rec_date), Number(r.shift), String(r.line), r.tahapan, 'Breakdown', s_(r.produk), s_(r.batch),
    s_(r.problem), r.durasi_min == null ? '' : Number(r.durasi_min), s_(r.why1), s_(r.why2), s_(r.why3),
    s_(r.corrective), s_(r.preventive), s_(r.pic), s_(r.status) || 'Open', s_(r.row_key), r.updated_at || nowIso_()];
  if (at) sh.getRange(at, 1, 1, ISSUE_HEADERS.length).setValues([row]);
  else {
    at = sh.getLastRow() + 1;
    ensureRows_(sh, at + 1);
    sh.getRange(at, 1, 1, ISSUE_HEADERS.length).setValues([row]);
  }
}


function applyOeeRecord_(rec) {
  writeLog_(rec);
  writeSummary_(rec);
  writeBreakdownIssues_(rec);
}


// ============================ SPEED STANDAR (Sheets ⇄ Supabase) ============================
/**
 * Tulis / update satu baris speed_standar ke tab "speed standar".
 * Kunci utama: kolom Id (uuid). Jika id belum ada di sheet, ditambah baris baru.
 */
function upsertSpeedStandarRow_(r) {
  var sh = ss_().getSheetByName(SHEET_SPEED);
  if (!sh) return;
  var id = s_(r.id);
  if (!id) return;
  var last = sh.getLastRow(), at = 0;
  if (last >= 2) {
    var ids = sh.getRange(2, SP.ID, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (s_(ids[i][0]) === id) { at = i + 2; break; }
    }
  }
  var row = [
    at ? sh.getRange(at, SP.NO).getValue() : (last >= 2 ? last : 1),
    s_(r.line),
    s_(r.produk),
    r.rate == null ? '' : Number(r.rate),
    id,
    r.updatedAt || r.modified_at || nowIso_(),
    s_(r.source) || 'app'
  ];
  if (at) {
    sh.getRange(at, 1, 1, SPEED_HEADERS.length).setValues([row]);
  } else {
    at = sh.getLastRow() + 1;
    ensureRows_(sh, at + 1);
    row[0] = at - 1; // No = urutan data
    sh.getRange(at, 1, 1, SPEED_HEADERS.length).setValues([row]);
  }
}

/** Muat ulang seluruh tab speed standar dari Supabase (replace all data rows) */
function refreshSpeedStandarSheet_() {
  var sh = ss_().getSheetByName(SHEET_SPEED);
  if (!sh) return 0;
  var rows = sb_('GET', 'speed_standar?select=*&order=line.asc,produk.asc');
  var last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, SPEED_HEADERS.length).clearContent();
  if (!rows || !rows.length) return 0;
  var vals = rows.map(function (r, i) {
    return [
      i + 1,
      s_(r.line),
      s_(r.produk),
      r.rate == null ? '' : Number(r.rate),
      s_(r.id),
      r.updatedAt || r.modified_at || '',
      s_(r.source) || 'app'
    ];
  });
  ensureRows_(sh, 1 + vals.length);
  sh.getRange(2, 1, vals.length, SPEED_HEADERS.length).setValues(vals);
  return vals.length;
}

/**
 * Kirim baris tab "speed standar" (r1..r2) ke Supabase.
 * - Baris dengan Id: PATCH
 * - Baris tanpa Id tapi Produk+Rate terisi: POST, lalu tulis Id kembali ke sheet
 * - Baris kosong total diabaikan
 */
function pushSpeedStandarRows_(sh, r1, r2) {
  var vals = sh.getRange(r1, 1, r2 - r1 + 1, SPEED_HEADERS.length).getValues();
  var iso = nowIso_();
  var n = 0;
  vals.forEach(function (v, i) {
    var line = s_(v[SP.LINE - 1]);
    var produk = s_(v[SP.PRODUK - 1]);
    var rate = num_(v[SP.RATE - 1]);
    var id = s_(v[SP.ID - 1]);
    // Abaikan baris benar-benar kosong
    if (!line && !produk && rate == null && !id) return;
    if (!produk || rate == null || rate < 0) {
      throw new Error('Baris ' + (r1 + i) + ': Produk & Speed Standar (angka ≥ 0) wajib diisi');
    }
    var payload = { line: line, produk: produk, rate: rate, source: 'sheet', updatedAt: iso };
    if (id) {
      sb_('PATCH', 'speed_standar?id=eq.' + q_(id), payload, { Prefer: 'return=minimal' });
    } else {
      var created = sb_('POST', 'speed_standar', payload, { Prefer: 'return=representation' });
      var newId = created && created[0] && created[0].id ? created[0].id : '';
      if (newId) sh.getRange(r1 + i, SP.ID).setValue(newId);
      id = newId;
    }
    sh.getRange(r1 + i, SP.UPD, 1, 2).setValues([[iso, 'sheet']]);
    // Renumber No
    sh.getRange(r1 + i, SP.NO).setValue(r1 + i - 1);
    n++;
  });
  return n;
}

/** Menu: tarik ulang semua speed standar dari Supabase ke Sheet */
function refreshSpeedStandarMenu() {
  try {
    var n = refreshSpeedStandarSheet_();
    ss_().toast('Speed standar dimuat: ' + n + ' baris dari Supabase', 'TKL Sync', 5);
  } catch (err) {
    ss_().toast('Gagal muat speed standar: ' + err.message, 'TKL Sync', 12);
  }
}


// ============================ SPEED STANDAR PRODUKSI (oee_data → Sheet) ============================
/**
 * Agregasi unik Line+Produk+Rate dari record oee_data (logika sama Tabel 1 di aplikasi).
 * Rate diambil dari payload.products.p{n}Rate; record terbaru menang.
 */
function aggregateSpeedFromOee_(records) {
  var map = {};
  (records || []).forEach(function (rec) {
    var line = s_(rec.line) || '—';
    var p = (rec.payload && rec.payload.products) || {};
    var upd = rec.updatedAt || rec.modified_at || rec.date || '';
    for (var i = 1; i <= 3; i++) {
      var name = s_(p['p' + i + 'Name']);
      var rate = num_(p['p' + i + 'Rate']);
      if (!name || rate == null || rate <= 0) continue;
      var key = (line + '|' + name).toLowerCase();
      var prev = map[key];
      if (!prev || String(upd) >= String(prev.upd)) {
        map[key] = { line: line, produk: name, rate: rate, upd: upd };
      }
    }
  });
  var list = Object.keys(map).map(function (k) { return map[k]; });
  list.sort(function (a, b) {
    var la = a.line.localeCompare(b.line, 'id', { numeric: true });
    if (la !== 0) return la;
    return a.produk.localeCompare(b.produk, 'id', { sensitivity: 'base' });
  });
  return list;
}

function monthKeyLabel_(ym) {
  // ym = 'YYYY-MM' → 'YYYY-MM'
  return s_(ym);
}

function monthRangeIso_(ym) {
  var parts = String(ym).split('-');
  var y = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
  if (!y || !m) return null;
  var from = y + '-' + pad2_(m) + '-01';
  var last = new Date(y, m, 0).getDate();
  var to = y + '-' + pad2_(m) + '-' + pad2_(last);
  return { from: from, to: to };
}

/** Ambil oee_data satu bulan, agregasi, tulis ke tab speed standar produksi (hanya baris bulan itu diganti). */
function writeSpeedProduksiMonth_(ym) {
  var range = monthRangeIso_(ym);
  if (!range) return 0;
  var sh = ss_().getSheetByName(SHEET_SPEED_PROD);
  if (!sh) return 0;

  // Ambil semua oee_data bulan itu (pagination sederhana)
  var all = [], offset = 0, page;
  do {
    page = sb_('GET',
      'oee_data?select=date,line,payload,modified_at' +
      '&date=gte.' + q_(range.from) +
      '&date=lte.' + q_(range.to) +
      '&order=date.desc&limit=1000&offset=' + offset);
    if (!page || !page.length) break;
    all = all.concat(page);
    offset += page.length;
  } while (page.length === 1000);

  var agg = aggregateSpeedFromOee_(all);
  var label = monthKeyLabel_(ym);

  // Hapus baris bulan yang sama di sheet
  var last = sh.getLastRow();
  if (last >= 2) {
    var months = sh.getRange(2, SPP.BULAN, last - 1, 1).getValues();
    var toDelete = [];
    for (var i = months.length - 1; i >= 0; i--) {
      if (s_(months[i][0]) === label) toDelete.push(i + 2);
    }
    // hapus dari bawah supaya index stabil
    toDelete.forEach(function (row) { sh.deleteRow(row); });
  }

  if (!agg.length) return 0;

  var vals = agg.map(function (r, i) {
    return [label, i + 1, r.line, r.produk, r.rate, r.upd || ''];
  });
  var at = sh.getLastRow() + 1;
  ensureRows_(sh, at + vals.length);
  sh.getRange(at, 1, vals.length, SPEED_PROD_HEADERS.length).setValues(vals);
  return vals.length;
}

/**
 * Muat ulang speed standar produksi untuk bulan berjalan + N bulan ke belakang.
 * Default: bulan ini dan 2 bulan sebelumnya.
 */
function refreshSpeedProduksiSheet_(backMonths) {
  backMonths = backMonths == null ? 2 : backMonths;
  var sh = ss_().getSheetByName(SHEET_SPEED_PROD);
  if (!sh) ensureSpeedProduksiTab_(false);
  var now = new Date();
  var total = 0;
  for (var i = 0; i <= backMonths; i++) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    var ym = d.getFullYear() + '-' + pad2_(d.getMonth() + 1);
    total += writeSpeedProduksiMonth_(ym);
  }
  return total;
}

function refreshSpeedProduksiMenu() {
  try {
    var n = refreshSpeedProduksiSheet_(2);
    ss_().toast('Speed standar produksi dimuat: ' + n + ' baris (3 bulan terakhir)', 'TKL Sync', 6);
  } catch (err) {
    ss_().toast('Gagal muat speed produksi: ' + err.message, 'TKL Sync', 12);
  }
}

function ensureSpeedProduksiTab_(clear) {
  var sh = prepTab_(SHEET_SPEED_PROD, SPEED_PROD_HEADERS, !!clear);
  var rows = sh.getMaxRows() - 1;
  sh.getRange(2, SPP.BULAN, rows, 1).setNumberFormat('@');
  sh.getRange(2, SPP.LINE, rows, 1).setNumberFormat('@');
  sh.getRange(2, SPP.PRODUK, rows, 1).setNumberFormat('@');
  sh.getRange(2, SPP.RATE, rows, 1).setNumberFormat('0.##');
  sh.setColumnWidth(SPP.BULAN, 90);
  sh.setColumnWidth(SPP.NO, 40);
  sh.setColumnWidth(SPP.LINE, 70);
  sh.setColumnWidth(SPP.PRODUK, 180);
  sh.setColumnWidth(SPP.RATE, 160);
  sh.setColumnWidth(SPP.UPD, 160);
  // Read-only warning: diisi dari aplikasi / Supabase
  sh.getRange(2, 1, rows, SPEED_PROD_HEADERS.length).setBackground('#f1f5f9');
  sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) { p.remove(); });
  sh.protect().setDescription('Diisi otomatis dari log produksi (oee_data)').setWarningOnly(true);
  return sh;
}

// ============================ SUPABASE → SHEET (polling) ============================
function defaultCursor_() {
  return prop_('SYNC_FROM') || new Date(Date.now() - 30 * 86400000).toISOString();
}
function syncFromSupabase() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  var info = { oee: 0, issue: 0, speed: 0, err: 0 };
  try {
    var t0 = Date.now();
    ['oee_data', 'pica_analysis', 'speed_standar'].forEach(function (tbl) {
      var cur = prop_('CURSOR_' + tbl) || defaultCursor_();
      while (Date.now() - t0 < 4.2 * 60 * 1000) {
        var rows = sb_('GET', tbl + '?select=*&modified_at=gt.' + q_(cur) + '&order=modified_at.asc&limit=25');
        if (!rows || !rows.length) break;
        rows.forEach(function (r) {
          if (r.source === 'sheet') return; // berasal dari Spreadsheet — sudah ada di sheet
          try {
            if (tbl === 'oee_data') { applyOeeRecord_(r); info.oee++; }
            else if (tbl === 'pica_analysis') { upsertIssueFromPica_(r); info.issue++; }
            else if (tbl === 'speed_standar') { upsertSpeedStandarRow_(r); info.speed++; }
          } catch (e) { info.err++; console.error(tbl + ' ' + (r.key || r.row_key || r.id) + ': ' + e); }
        });
        cur = rows[rows.length - 1].modified_at;
        setProp_('CURSOR_' + tbl, cur);
        if (rows.length < 25) break;
      }
    });
    // Perbarui ringkasan speed produksi bulan berjalan (dari oee yang baru masuk)
    try {
      var now = new Date();
      var ymNow = now.getFullYear() + '-' + pad2_(now.getMonth() + 1);
      info.speedProd = writeSpeedProduksiMonth_(ymNow);
    } catch (eSp) { console.error('speed produksi: ' + eSp); info.err++; }

    setProp_('LAST_SYNC', nowIso_() + ' · oee ' + info.oee + ' · issue ' + info.issue +
      ' · speed ' + info.speed + ' · speedProd ' + (info.speedProd || 0) + ' · error ' + info.err);
  } finally { lock.releaseLock(); }
  return info;
}


// ============================ SHEET → SUPABASE (onEdit) ============================
function pushOeeFromSheet_(tab, date, shift) {
  var m = tab.match(LOG_TAB_RE), tah = m[1], line = m[2];
  var sh = ss_().getSheetByName(tab), last = sh.getLastRow(), vals = [];
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, LOG_HEADERS.length).getValues().forEach(function (v) {
      if (normDate_(v[C.TGL - 1]) !== date || shiftN_(v[C.SHIFT - 1]) !== shift) return;
      var any = false;
      for (var c = C.KODE; c <= C.DEFECT; c++) if (s_(v[c - 1]) !== '') { any = true; break; }
      if (any) vals.push(v);
    });
  }
  var filt = 'date=eq.' + q_(date) + '&shift=eq.' + q_(shift) + '&line=eq.' + q_(line) + '&tahapan=eq.' + q_(tah);
  var ex = sb_('GET', 'oee_data?select=payload&' + filt);
  var exists = ex && ex.length > 0;
  if (!exists && !vals.length) return;
  var payload = logRowsToPayload_(vals, exists ? ex[0].payload : null);
  var iso = nowIso_();
  payload.meta = { source: 'sheet', needsRecalc: true, at: iso };
  payload.savedAt = iso;
  if (exists) {
    sb_('PATCH', 'oee_data?' + filt, { payload: payload, updatedAt: iso, source: 'sheet' }, { Prefer: 'return=minimal' });
  } else {
    sb_('POST', 'oee_data', { key: date + '|S' + shift + '|L' + line + '|' + tah, date: date, shift: Number(shift),
      line: line, tahapan: tah, payload: payload, updatedAt: iso, schemaVersion: 1, source: 'sheet' },
      { Prefer: 'return=minimal' });
  }
}


function pushIssueRows_(sh, r1, r2) {
  var vals = sh.getRange(r1, 1, r2 - r1 + 1, ISSUE_HEADERS.length).getValues(), recs = [], iso = nowIso_();
  vals.forEach(function (v, i) {
    var d = normDate_(v[0]), sf = shiftN_(v[1]), ln = s_(v[2]), tah = s_(v[3]);
    if (!d || !sf || !ln || !tah) return;
    var rk = s_(v[ISS.KEY - 1]);
    if (!rk) { rk = 'manual|' + Utilities.getUuid().slice(0, 8); sh.getRange(r1 + i, ISS.KEY).setValue(rk); }
    recs.push({ rec_date: d, shift: Number(sf), line: ln, tahapan: tah, row_key: rk,
      produk: s_(v[ISS.PRODUK - 1]), batch: s_(v[ISS.BATCH - 1]), problem: s_(v[ISS.PROBLEM - 1]),
      durasi_min: num_(v[ISS.DUR - 1]), why1: s_(v[ISS.W1 - 1]), why2: s_(v[ISS.W2 - 1]), why3: s_(v[ISS.W3 - 1]),
      corrective: s_(v[ISS.COR - 1]), preventive: s_(v[ISS.PRE - 1]), pic: s_(v[ISS.PIC - 1]),
      status: s_(v[ISS.STATUS - 1]) || 'Open', source: 'sheet', updated_at: iso });
  });
  if (!recs.length) return 0;
  sb_('POST', 'pica_analysis?on_conflict=rec_date,shift,line,tahapan,row_key', recs,
    { Prefer: 'resolution=merge-duplicates,return=minimal' });
  sh.getRange(r1, ISS.UPD, vals.length, 1).setValues(vals.map(function () { return [iso]; }));
  return recs.length;
}


/** Trigger onEdit (installable) */
function onEditInstalled_(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet(), name = sh.getName();
  var r1 = Math.max(e.range.getRow(), 2), r2 = e.range.getLastRow();
  if (r2 < 2) return;
  var isLog = LOG_TAB_RE.test(name), isIssue = name === SHEET_ISSUE, isSpeed = name === SHEET_SPEED;
  if (!isLog && !isIssue && !isSpeed) return;
  var lock = isLog ? null : LockService.getScriptLock();
  if (lock) lock.waitLock(25000);
  try {
    if (isLog) {
      var ec1 = e.range.getColumn(), ec2 = e.range.getLastColumn();
      if (ec1 >= C.UPD) return;
      normalizeEdited_(sh, r1, r2, ec1, ec2);
      if ((C.TGL >= ec1 && C.TGL <= ec2) || (C.SHIFT >= ec1 && C.SHIFT <= ec2)) fillMesinAndNo_(sh, name, r1, r2);
      var vals = sh.getRange(r1, 1, r2 - r1 + 1, LOG_HEADERS.length).getValues(), keys = {}, iso = nowIso_();
      vals.forEach(function (v) {
        var d = normDate_(v[C.TGL - 1]), s = shiftN_(v[C.SHIFT - 1]);
        if (d && s) keys[d + '|' + s] = [d, s];
      });
      var list = Object.keys(keys).map(function (k) { return keys[k]; });
      if (list.length) {
        markDirty_(name, list);
        sh.getRange(r1, C.UPD, vals.length, 2).setValues(vals.map(function (v) {
          return s_(v[C.TGL - 1]) ? [iso, 'sheet'] : ['', ''];
        }));
        e.source.toast('Tercatat — dikirim ke Supabase ±1 menit setelah selesai mengetik', 'TKL Sync', 3);
      }
    } else if (isIssue) {
      if (e.range.getColumn() >= ISS.UPD) return;
      var n = pushIssueRows_(sh, r1, r2);
      if (n) e.source.toast('Why-Why tersimpan ke Supabase ✓', 'TKL Sync', 4);
    } else if (isSpeed) {
      // Jangan trigger ulang saat skrip mengisi Id / Updated At / Source
      if (e.range.getColumn() >= SP.ID) return;
      var ns = pushSpeedStandarRows_(sh, r1, r2);
      if (ns) e.source.toast('Speed standar tersimpan ke Supabase ✓ (' + ns + ')', 'TKL Sync', 4);
    }
  } catch (err) {
    e.source.toast('Gagal simpan ke Supabase: ' + err.message, 'TKL Sync', 10);
    console.error(err);
  } finally { if (lock) lock.releaseLock(); }
}


/** Tandai (tab, tanggal, shift) "kotor"; pengiriman ke Supabase dilakukan flushDirty_ agar hemat kuota */
function markDirty_(tab, list) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(15000);
  try {
    var d = JSON.parse(prop_('DIRTY') || '{}'), now = Date.now();
    list.forEach(function (k) { d[tab + '#' + k[0] + '#' + k[1]] = { t: now, n: 0 }; });
    setProp_('DIRTY', JSON.stringify(d));
  } finally { lock.releaseLock(); }
}
/** Trigger tiap 1 menit: kirim entri yang sudah ≥20 detik tidak diedit (satu kali kirim per shift, bukan per sel) */
function flushDirty_() { flushDirtyImpl_(false); }


/** Menu / tombol: kirim SEKARANG semua perubahan yang menunggu, tanpa menunggu jeda 20 detik */
var _lastFlushError = '';
function sendNowMenu() {
  _lastFlushError = '';
  var n = flushDirtyImpl_(true);
  if (_lastFlushError) { ss_().toast('GAGAL kirim: ' + _lastFlushError, 'TKL Sync', 15); return; }
  ss_().toast(n ? 'Terkirim ' + n + ' shift ke Supabase ✓ — buka ulang record di aplikasi' :
    'Tidak ada perubahan yang menunggu', 'TKL Sync', 6);
}
/** Kirim ulang semua shift di tab aktif yang pernah diedit dari Spreadsheet (Source = sheet) */
function resendActiveTabMenu() {
  var sh = ss_().getActiveSheet(), name = sh.getName();
  if (!LOG_TAB_RE.test(name)) { ss_().toast('Pilih dulu salah satu tab log (mis. filling line 1)', 'TKL Sync', 6); return; }
  var last = sh.getLastRow(), keys = {};
  if (last >= 2) sh.getRange(2, 1, last - 1, LOG_HEADERS.length).getValues().forEach(function (v) {
    var d = normDate_(v[C.TGL - 1]), sf = shiftN_(v[C.SHIFT - 1]);
    if (d && sf && s_(v[C.SRC - 1]) === 'sheet') keys[d + '|' + sf] = [d, sf];
  });
  var list = Object.keys(keys).map(function (k) { return keys[k]; });
  if (!list.length) { ss_().toast('Tidak ada baris dengan Source = sheet di tab ini', 'TKL Sync', 6); return; }
  markDirty_(name, list);
  var failed = [];
  try { failed = JSON.parse(prop_('FAILED') || '[]'); } catch (e) {}
  setProp_('FAILED', JSON.stringify(failed.filter(function (k) { return k.indexOf(name + '#') !== 0; })));
  sendNowMenu();
}
function markFailed_(key) {
  var f = [];
  try { f = JSON.parse(prop_('FAILED') || '[]'); } catch (e) {}
  if (f.indexOf(key) < 0) f.push(key);
  setProp_('FAILED', JSON.stringify(f));
}


function flushDirtyImpl_(force) {
  if (!prop_('DIRTY') || prop_('DIRTY') === '{}') return 0;
  var due = [], dl = LockService.getDocumentLock();
  dl.waitLock(15000);
  try {
    var d = JSON.parse(prop_('DIRTY') || '{}'), now = Date.now(), keep = {};
    Object.keys(d).forEach(function (k) { if (force || now - d[k].t >= 20000) due.push([k, d[k]]); else keep[k] = d[k]; });
    setProp_('DIRTY', JSON.stringify(keep));
  } finally { dl.releaseLock(); }
  if (!due.length) return 0;
  var lock = LockService.getScriptLock();
  lock.waitLock(60000);
  var failed = [], sent = 0;
  try {
    due.forEach(function (x) {
      var p = x[0].split('#');
      try { pushOeeFromSheet_(p[0], p[1], p[2]); sent++; }
      catch (err) {
        var msg = x[0] + ': ' + (err && err.message ? err.message : err);
        console.error(msg);
        _lastFlushError = msg;
        setProp_('LAST_ERROR', nowIso_() + ' · ' + msg);
        if (x[1].n < 5) failed.push([x[0], { t: Date.now(), n: x[1].n + 1 }]); else markFailed_(x[0]);
      }
    });
  } finally { lock.releaseLock(); }
  if (failed.length) {
    var dl2 = LockService.getDocumentLock();
    dl2.waitLock(15000);
    try {
      var d2 = JSON.parse(prop_('DIRTY') || '{}');
      failed.forEach(function (f) { if (!d2[f[0]]) d2[f[0]] = f[1]; });
      setProp_('DIRTY', JSON.stringify(d2));
    } finally { dl2.releaseLock(); }
  }
  return sent;
}


// ============================ ISI OTOMATIS (tab log) ============================
var _mesin = null;
function getMesinMap_() {
  if (_mesin) return _mesin;
  _mesin = {};
  var sh = ss_().getSheetByName(SHEET_MESIN);
  if (!sh || sh.getLastRow() < 2) return _mesin;
  sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().forEach(function (r) {
    var t = s_(r[0]).toLowerCase(), l = s_(r[1]);
    if (t && l) _mesin[t + '|' + l] = { nama: s_(r[2]), kode: s_(r[3]) };
  });
  return _mesin;
}
/** Nomor urut per (Tanggal + Shift): baris pertama = 1, dst. Baris tanpa tanggal dikosongkan */
function renumber_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return;
  var v = sh.getRange(2, 1, last - 1, C.SHIFT).getValues(), cnt = {}, ch = false;
  var out = v.map(function (row) {
    var d = normDate_(row[C.TGL - 1]);
    if (!d) { if (s_(row[0]) !== '') ch = true; return ['']; }
    var k = d + '|' + shiftN_(row[C.SHIFT - 1]);
    cnt[k] = (cnt[k] || 0) + 1;
    if (row[0] !== cnt[k]) ch = true;
    return [cnt[k]];
  });
  if (ch) sh.getRange(2, 1, out.length, 1).setValues(out);
}
/** Saat Tanggal/Shift diisi: isi Nama Mesin & Kode Mesin (dari tab "mesin") bila masih kosong, lalu renumber */
function fillMesinAndNo_(sh, tab, r1, r2) {
  var m = tab.match(LOG_TAB_RE), info = m ? getMesinMap_()[m[1] + '|' + m[2]] : null;
  if (info) {
    var rg = sh.getRange(r1, C.TGL, r2 - r1 + 1, C.KODEMESIN - C.TGL + 1), v = rg.getValues(), ch = false;
    v.forEach(function (row) {
      if (!s_(row[0])) return;
      if (!s_(row[C.MESIN - C.TGL]) && info.nama) { row[C.MESIN - C.TGL] = info.nama; ch = true; }
      if (!s_(row[C.KODEMESIN - C.TGL]) && info.kode) { row[C.KODEMESIN - C.TGL] = info.kode; ch = true; }
    });
    if (ch) rg.setValues(v);
  }
  renumber_(sh);
}
/** Rapikan ketikan di sel yang baru diedit (jam, operator) */
function normalizeEdited_(sh, r1, r2, c1, c2) {
  var hits = function (c) { return c >= c1 && c <= c2; }, n = r2 - r1 + 1;
  [C.MULAI, C.PANGGIL, C.DATANG, C.SELESAI].forEach(function (c) {
    if (!hits(c)) return;
    var rg = sh.getRange(r1, c, n, 1), ch = false;
    var out = rg.getValues().map(function (r) {
      var t = normTypedTime_(r[0]);
      if (t !== s_(r[0])) ch = true;
      return [t];
    });
    if (ch) rg.setValues(out);
  });
  if (hits(C.OPER)) {
    var rg2 = sh.getRange(r1, C.OPER, n, 1), ch2 = false;
    var out2 = rg2.getValues().map(function (r) {
      var t = parseOps_(r[0]).join(',');
      if (t !== s_(r[0])) ch2 = true;
      return [t];
    });
    if (ch2) rg2.setValues(out2);
  }
}


// ============================ SETUP & MENU ============================
function onOpen() {
  SpreadsheetApp.getUi().createMenu('TKL Sync')
    .addItem('⚡ Kirim ke Supabase SEKARANG', 'sendNowMenu')
    .addItem('Kirim ulang tab ini (yang diedit dari Sheet)', 'resendActiveTabMenu')
    .addSeparator()
    .addItem('1. Buat semua tab', 'setupAll')
    .addItem('2. Isi koneksi Supabase', 'configSupabase')
    .addItem('3. Pasang trigger otomatis', 'installTriggers')
    .addSeparator()
    .addItem('Muat ulang Speed Standar (master admin)', 'refreshSpeedStandarMenu')
    .addItem('Muat ulang Speed Standar Produksi (dari log)', 'refreshSpeedProduksiMenu')
    .addItem('Bangun ulang semua tab (setelah ganti kode)', 'rebuildAll')
    .addItem('Sinkron sekarang (Supabase → Sheet)', 'syncNowMenu')
    .addItem('Mulai sinkron dari tanggal…', 'setSyncFromMenu')
    .addItem('Status', 'statusMenu')
    .addToUi();
}


function styleHeader_(sh, n) {
  var r = sh.getRange(1, 1, 1, n);
  r.setFontWeight('bold').setBackground('#1e3a5f').setFontColor('#ffffff').setHorizontalAlignment('center')
    .setVerticalAlignment('middle').setWrap(true);
  sh.setFrozenRows(1);
  sh.setRowHeight(1, 38);
}
function getOrCreate_(name) {
  return ss_().getSheetByName(name) || ss_().insertSheet(name);
}
function colLetter_(c) { return String.fromCharCode(64 + c); }
function prepTab_(name, headers, clear) {
  var sh = getOrCreate_(name);
  if (clear) {
    sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) { p.remove(); });
    sh.clear();
    sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).clearDataValidations();
  }
  if (sh.getMaxColumns() < headers.length) sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  styleHeader_(sh, headers.length);
  return sh;
}
function setOperValidation_(rng, L) {
  var help = 'Inisial operator dipisah koma, maks. 3 huruf per orang, maks. 6 orang. Contoh: MSA,REN,FRD';
  var re = '"^[A-Za-z]{1,3}(\\s*,\\s*[A-Za-z]{1,3}){0,5}$"';
var formulas = [
    '=OR(' + L + '2="";REGEXMATCH(' + L + '2;' + re + '))',  // locale dengan pemisah ';' (TARUH DI ATAS)
    '=OR(' + L + '2="",REGEXMATCH(' + L + '2,' + re + '))',  // locale dengan pemisah ','
    '=LEN(' + L + '2)<=23'                                    // cadangan tanpa pemisah
  ];
  for (var i = 0; i < formulas.length; i++) {
    try {
      rng.setDataValidation(SpreadsheetApp.newDataValidation().requireFormulaSatisfied(formulas[i])
        .setAllowInvalid(false).setHelpText(help).build());
      return true;
    } catch (e) { console.warn('validasi operator #' + i + ' ditolak: ' + e); }
  }
  return false;
}
function ensureMesinTab_() {
  if (ss_().getSheetByName(SHEET_MESIN)) return;
  var sh = ss_().insertSheet(SHEET_MESIN), rows = [];
  TAHAPAN.forEach(function (t) { LINES.forEach(function (l) { rows.push([t, l, MESIN_DEFAULT[t + '|' + l] || '', '']); }); });
  sh.getRange(1, 1, 1, 4).setValues([['Tahapan', 'Line', 'Nama Mesin', 'Kode Mesin']]);
  styleHeader_(sh, 4);
  sh.getRange(2, 1, rows.length, 4).setNumberFormat('@');
  sh.getRange(2, 1, rows.length, 4).setValues(rows);
  sh.setColumnWidth(3, 340); sh.setColumnWidth(4, 120);
}
function ensureSpeedStandarTab_(clear) {
  var sh = prepTab_(SHEET_SPEED, SPEED_HEADERS, !!clear);
  var rows = sh.getMaxRows() - 1;
  sh.getRange(2, SP.LINE, rows, 1).setNumberFormat('@');
  sh.getRange(2, SP.PRODUK, rows, 1).setNumberFormat('@');
  sh.getRange(2, SP.RATE, rows, 1).setNumberFormat('0.##');
  sh.getRange(2, SP.ID, rows, 1).setNumberFormat('@');
  sh.setColumnWidth(SP.NO, 40);
  sh.setColumnWidth(SP.LINE, 80);
  sh.setColumnWidth(SP.PRODUK, 180);
  sh.setColumnWidth(SP.RATE, 160);
  sh.setColumnWidth(SP.ID, 280);
  sh.setColumnWidth(SP.UPD, 160);
  sh.setColumnWidth(SP.SRC, 80);
  // Id / Updated At / Source diisi otomatis — warn saja
  sh.getRange(1, SP.ID, 1, 3).setBackground('#64748b');
  return sh;
}
function buildAllTabs_(clear) {
  ensureMesinTab_(); // tab "mesin" TIDAK pernah dikosongkan (kode mesin diisi manual oleh pengguna)
  ensureSpeedStandarTab_(clear);
  ensureSpeedProduksiTab_(clear);
  var first = ss_().getSheets()[0];
  TAHAPAN.forEach(function (t) {
    LINES.forEach(function (l) {
      var sh = prepTab_(t + ' line ' + l, LOG_HEADERS, clear), rows = sh.getMaxRows() - 1;
      [C.TGL, C.BN, C.MULAI, C.PANGGIL, C.DATANG, C.SELESAI, C.WO, C.OPER].forEach(function (c) {
        sh.getRange(2, c, rows, 1).setNumberFormat('@');
      });
      sh.getRange(2, C.SHIFT, rows, 1).setDataValidation(
        SpreadsheetApp.newDataValidation().requireValueInList(['1', '2', '3'], true).setAllowInvalid(true).build());
      setOperValidation_(sh.getRange(2, C.OPER, rows, 1), colLetter_(C.OPER));
      var numRule = function (help) {
        return SpreadsheetApp.newDataValidation().requireNumberBetween(0, 9).setAllowInvalid(false).setHelpText(help).build();
      };
      sh.getRange(2, C.KODE, rows, 1).setDataValidation(numRule('Kode: 1 angka (0–9)'));
      sh.getRange(2, C.OP, rows, 1).setDataValidation(numRule('Man Power: 1 angka (0–9)'));
      sh.getRange(2, C.MS, rows, 1).setDataValidation(SpreadsheetApp.newDataValidation()
        .requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(false).setHelpText('Isi angka frekuensi (kali)').build());
      // Warna baris sesuai kode: unplanned (1,3,4,9) merah · planned (5–8) kuning · produksi (2, lainnya) hijau
      var kc = colLetter_(C.KODE), area = sh.getRange(2, 1, rows, LOG_HEADERS.length), rules = [];
      var colorOf = { 0: COLOR_PROD, 1: COLOR_UNPLANNED, 2: COLOR_PROD, 3: COLOR_UNPLANNED, 4: COLOR_UNPLANNED,
        5: COLOR_PLANNED, 6: COLOR_PLANNED, 7: COLOR_PLANNED, 8: COLOR_PLANNED, 9: COLOR_UNPLANNED };
      for (var dg = 0; dg <= 9; dg++) {
        rules.push(SpreadsheetApp.newConditionalFormatRule()
          .whenFormulaSatisfied('=$' + kc + '2&""="' + dg + '"').setBackground(colorOf[dg]).setRanges([area]).build());
      }
      sh.setConditionalFormatRules(rules);
      sh.setColumnWidth(C.OPER, 150);
      sh.getRange(1, C.UPD, 1, 2).setBackground('#64748b');
      sh.setColumnWidth(C.NO, 36);
      sh.setColumnWidth(C.KEGIATAN, 220); sh.setColumnWidth(C.MASALAH, 220);
      sh.setColumnWidth(C.DISPOSISI, 200); sh.setColumnWidth(C.DESC, 200);
      sh.setColumnWidth(C.UPD, 150);
    });
  });
  var s1 = prepTab_(SHEET_SHIFT, SHIFT_HEADERS, clear);
  s1.getRange(2, 1, s1.getMaxRows() - 1, 1).setNumberFormat('@');
  s1.getRange(2, 8, s1.getMaxRows() - 1, 8).setNumberFormat('0.00%');
  s1.setColumnWidth(5, 140); s1.setColumnWidth(6, 170); s1.setColumnWidth(7, 150);
  var s2 = prepTab_(SHEET_PROD, PROD_HEADERS, clear);
  s2.getRange(2, 1, s2.getMaxRows() - 1, 1).setNumberFormat('@');
  var s3 = prepTab_(SHEET_ISSUE, ISSUE_HEADERS, clear);
  s3.getRange(2, 1, s3.getMaxRows() - 1, 1).setNumberFormat('@');
  s3.getRange(2, ISS.STATUS, s3.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['Open', 'On Progress', 'Closed'], true).build());
  [ISS.PROBLEM, ISS.W1, ISS.W2, ISS.W3, ISS.COR, ISS.PRE].forEach(function (c) { s3.setColumnWidth(c, 220); });
  [s1, s2].forEach(function (sh) {
    sh.getRange(2, 1, sh.getMaxRows() - 1, sh.getLastColumn()).setBackground('#f1f5f9');
    sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) { p.remove(); });
    sh.protect().setDescription('Diisi otomatis oleh aplikasi').setWarningOnly(true);
  });
  if (first && first.getName() === 'Sheet1' && first.getLastRow() === 0 && ss_().getSheets().length > 1) ss_().deleteSheet(first);
}
function setupAll() {
  setProp_('SPREADSHEET_ID', SpreadsheetApp.getActiveSpreadsheet().getId());
  _ss = null;
  buildAllTabs_(false);
  SpreadsheetApp.getUi().alert(
    'Selesai: 15 tab log + ringkasan shift + ringkasan produk + issue + speed standar sudah dibuat.\n' +
    'Lanjut: menu TKL Sync → 2. Isi koneksi Supabase.\n' +
    'Pastikan SQL database/supabase-speed-standar.sql sudah dijalankan di Supabase.');
}
/** Setelah mengganti kode / susunan kolom: kosongkan semua tab, bangun ulang, tarik ulang dari Supabase */
function rebuildAll() {
  var ui = SpreadsheetApp.getUi();
  var ok = ui.alert('Bangun ulang semua tab',
    'Isi semua tab (log, ringkasan, issue, speed standar) akan DIHAPUS lalu ditarik ulang dari Supabase.\n' +
    'Data tetap aman di Supabase. Lanjut?', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  setProp_('SPREADSHEET_ID', SpreadsheetApp.getActiveSpreadsheet().getId());
  _ss = null;
  buildAllTabs_(true);
  var from = defaultCursor_();
  setProp_('CURSOR_oee_data', from);
  setProp_('CURSOR_pica_analysis', from);
  setProp_('CURSOR_speed_standar', from);
  var i = syncFromSupabase();
  try { refreshSpeedStandarSheet_(); } catch (e) { console.error(e); }
  ui.alert('Selesai dibangun ulang.' + (i ? '\nRecord log: ' + i.oee + ' · issue: ' + i.issue +
    ' · speed: ' + i.speed + ' · error: ' + i.err : '') +
    '\nJika data banyak, sisanya ditarik otomatis oleh trigger tiap 5 menit.');
}


function configSupabase() {
  var ui = SpreadsheetApp.getUi();
  var a = ui.prompt('Supabase URL', 'Contoh: https://xxxx.supabase.co', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  var b = ui.prompt('Supabase service_role key', 'Settings → API → service_role (RAHASIA, jangan dibagikan)', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;
  setProp_('SUPABASE_URL', a.getResponseText().trim());
  setProp_('SUPABASE_SERVICE_KEY', b.getResponseText().trim());
  try {
    sb_('GET', 'oee_data?select=key&limit=1');
    sb_('GET', 'oee_data?select=modified_at&limit=1');
    try { sb_('GET', 'speed_standar?select=id&limit=1'); } catch (e2) {
      ui.alert('Koneksi oee_data OK, tapi tabel speed_standar belum ada.\nJalankan SQL supabase-speed-standar.sql di Supabase.');
      return;
    }
    ui.alert('Koneksi OK ✓ (termasuk speed_standar)');
  } catch (e) { ui.alert('Koneksi gagal: ' + e.message + '\n\nPastikan SQL supabase-sheets-sync.sql sudah dijalankan.'); }
}


function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction();
    if (f === 'syncFromSupabase' || f === 'onEditInstalled_' || f === 'flushDirty_') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncFromSupabase').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('flushDirty_').timeBased().everyMinutes(1).create();
  ScriptApp.newTrigger('onEditInstalled_').forSpreadsheet(ss_()).onEdit().create();
  SpreadsheetApp.getUi().alert('Trigger terpasang:\n• Supabase → Sheet: tiap 5 menit\n• Sheet → Supabase: dicatat saat diedit, dikirim ±1 menit setelah selesai mengetik\n• Tab speed standar: langsung saat diedit');
}
function syncNowMenu() {
  var i = syncFromSupabase();
  SpreadsheetApp.getUi().alert(i ? 'Selesai. Record log: ' + i.oee + ' · issue: ' + i.issue +
    ' · speed: ' + i.speed + ' · error: ' + i.err : 'Sinkron lain sedang berjalan, coba lagi.');
}
function setSyncFromMenu() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Mulai sinkron dari tanggal', 'Format YYYY-MM-DD (data sebelum tanggal ini tidak ditarik)', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var d = normDate_(r.getResponseText());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { ui.alert('Format salah'); return; }
  setProp_('SYNC_FROM', d + 'T00:00:00Z');
  setProp_('CURSOR_oee_data', d + 'T00:00:00Z');
  setProp_('CURSOR_pica_analysis', d + 'T00:00:00Z');
  setProp_('CURSOR_speed_standar', d + 'T00:00:00Z');
  ui.alert('Sinkron berikutnya mulai dari ' + d);
}
function statusMenu() {
  var pend = 0, failed = [];
  try { pend = Object.keys(JSON.parse(prop_('DIRTY') || '{}')).length; } catch (e) {}
  try { failed = JSON.parse(prop_('FAILED') || '[]'); } catch (e) {}
  SpreadsheetApp.getUi().alert('Sinkron terakhir (Supabase → Sheet):\n' + (prop_('LAST_SYNC') || '(belum pernah)') +
    '\n\nMenunggu dikirim ke Supabase: ' + pend + ' shift' +
    '\nGagal & dihentikan (perlu "Kirim ulang tab ini"): ' + failed.length +
    (failed.length ? '\n  ' + failed.slice(0, 5).join('\n  ') : '') +
    '\n\nError terakhir kirim:\n' + (prop_('LAST_ERROR') || '(tidak ada)') +
    '\n\nKursor log: ' + (prop_('CURSOR_oee_data') || defaultCursor_()) +
    '\nKursor issue: ' + (prop_('CURSOR_pica_analysis') || defaultCursor_()) +
    '\nKursor speed: ' + (prop_('CURSOR_speed_standar') || defaultCursor_()));
}
