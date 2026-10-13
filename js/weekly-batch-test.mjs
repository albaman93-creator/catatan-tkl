/**
 * Tes hitungan OEE per batch (tanpa DOM / browser).
 * Jalankan: node js/weekly-batch-test.mjs
 *
 * Kasus utama = contoh issue #12 / contohhitung_oee.xlsx (VPEL1 L027103, 5 shift):
 *   C 1320 · E 1295 · Output Std 25.900 · Aktual 24.764 · Baik 24.731
 *   A 98,11% · P 95,61% · Q 99,87% · OEE 93,68%
 */
import fs from 'fs';
import vm from 'vm';

const ctx = vm.createContext({
  console,
  CONFIG: {
    SHIFT_A: [510, 480, 450],
    SHIFT_RANGES: [
      { from: 420, to: 930, index: 0 },
      { from: 930, to: 1410, index: 1 },
      { from: 1410, to: 1440, index: 2 },
      { from: 0, to: 420, index: 2 },
    ],
    PLANNED_CODES: new Set([5, 6, 7, 8]),
    UNPLANNED_CODES: new Set([1, 3, 4, 9]),
    PROD_CODES: new Set([2]),
    VALID_CODES: new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]),
    KEMAS_L1_RATE: { low: 8, high: 12, opThreshold: 3 },
    KEMAS_L2_RATE: {},
  },
  document: { getElementById: () => null },
});
['utils.js', 'weekly-calc.js', 'weekly-batch.js'].forEach((f) =>
  vm.runInContext(fs.readFileSync(new URL('./' + f, import.meta.url), 'utf8'), ctx, { filename: f }));
const WeeklyBatch = vm.runInContext('WeeklyBatch', ctx);

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.error('FAIL:', msg); } else console.log('PASS:', msg); };
const near = (a, b, eps = 0.005) => a != null && Math.abs(a - b) <= eps;

// ---- helper: record 1 shift. Menit planned/unplanned/prod disusun agar C & E sama dengan Excel ----
const START = { 1: '08:00', 2: '16:00', 3: '00:30' };
const rec = (date, shift, { B, D, prod, good, defect, label = 'VPEL1 L027103', bn = 'L027103', code = 'VPEL1', rate = 20, extra = [] }) => ({
  date, shift, tahapan: 'filling', line: '1',
  payload: {
    products: { p1Name: code, p1Bn: bn, p1Rate: String(rate) },
    rows: [
      { kode: '5', mulai: START[shift], durasi: String(B), batch: '', good: '', defect: '' },
      ...(D ? [{ kode: '3', mulai: START[shift], durasi: String(D), batch: '', good: '', defect: '' }] : []),
      { kode: '2', mulai: START[shift], durasi: String(prod), batch: label, good: String(good), defect: String(defect) },
      ...extra,
    ],
  },
});

// ---- 1) Contoh issue #12 ----
const recs = [
  rec('2026-09-23', 2, { B: 365, D: 20, prod: 95,  good: 1600, defect: 2 }),
  rec('2026-09-24', 3, { B: 165, D: 0,  prod: 285, good: 5301, defect: 6 }),
  rec('2026-09-24', 1, { B: 200, D: 5,  prod: 305, good: 5681, defect: 8 }),
  rec('2026-09-24', 2, { B: 145, D: 0,  prod: 335, good: 6246, defect: 8 }),
  rec('2026-09-25', 3, { B: 175, D: 0,  prod: 275, good: 5903, defect: 9 }),
];
let r = WeeklyBatch.calc(recs, '');
ok(r.batches.length === 1 && r.batches[0].label === 'VPEL1 L027103', 'satu batch: VPEL1 L027103');
const b = r.batches[0];
ok(near(b.C, 1320), `C = 1320 (dapat ${b.C})`);
ok(near(b.E, 1295), `E = 1295 (dapat ${b.E})`);
ok(near(b.std, 25900), `Output Standar = 25.900 (dapat ${b.std})`);
ok(near(b.actual, 24764), `Output Aktual = 24.764 (dapat ${b.actual})`);
ok(near(b.good, 24731), `Output Baik = 24.731 (dapat ${b.good})`);
ok(near(b.speed, 20), `Speed = 20 (dapat ${b.speed})`);
ok(near(b.a, 98.11), `A = 98,11% (dapat ${b.a?.toFixed(2)})`);
ok(near(b.p, 95.61), `P = 95,61% (dapat ${b.p?.toFixed(2)})`);
ok(near(b.q, 99.87), `Q = 99,87% (dapat ${b.q?.toFixed(2)})`);
ok(near(b.oee, 93.68), `OEE = 93,68% (dapat ${b.oee?.toFixed(2)})`);
ok(near(r.total.oee, b.oee), 'TOTAL = batch tunggal');

// ---- 2) Filter produk: kode & kode+BN memberi hasil sama; produk lain kosong ----
ok(near(WeeklyBatch.calc(recs, 'VPEL1').total.oee, b.oee), 'filter kode VPEL1');
ok(near(WeeklyBatch.calc(recs, 'VPEL1 L027103').total.oee, b.oee), 'filter "VPEL1 L027103"');
ok(WeeklyBatch.calc(recs, 'XXXX').batches.length === 0, 'filter produk lain → kosong');

// ---- 3) Satu shift, dua batch: C & E dibagi proporsional menit produksi, tidak dobel ----
const two = {
  date: '2026-09-26', shift: 1, tahapan: 'filling', line: '1',
  payload: {
    products: { p1Name: 'AAA1', p1Bn: 'L1', p1Rate: '20', p2Name: 'BBB2', p2Bn: 'L2', p2Rate: '10' },
    rows: [
      { kode: '5', mulai: '08:00', durasi: '60', batch: '', good: '', defect: '' },
      { kode: '3', mulai: '09:00', durasi: '30', batch: '', good: '', defect: '' },
      { kode: '2', mulai: '09:30', durasi: '140', batch: 'AAA1 L1', good: '2700', defect: '50' },
      { kode: '2', mulai: '12:00', durasi: '280', batch: 'BBB2 L2', good: '2790', defect: '10' },
    ],
  },
};
r = WeeklyBatch.calc([two], '');
// C = 510−60 = 450, D = 30 → E = 420; menit produksi 140 : 280 = 1/3 : 2/3
const A1 = r.batches.find((x) => x.label === 'AAA1 L1'), B2 = r.batches.find((x) => x.label === 'BBB2 L2');
ok(A1 && B2, 'dua batch terdeteksi');
ok(near(A1.C + B2.C, 450) && near(A1.E + B2.E, 420), 'ΣC = 450 & ΣE = 420 (tidak dobel)');
ok(near(A1.E, 140) && near(B2.E, 280), 'E dibagi 1/3 : 2/3');
ok(near(A1.std, 20 * 140) && near(B2.std, 10 * 280), 'Output standar = speed batch × E batch');
ok(near(A1.p, (2750 / 2800) * 100) && near(B2.p, (2800 / 2800) * 100), 'P tiap batch');
ok(near(A1.a, (420 / 450) * 100), 'A tiap batch = E ÷ C record');

// ---- 4) Data kosong ----
r = WeeklyBatch.calc([], '');
ok(r.batches.length === 0 && r.total.oee === null, 'tanpa data → kosong, OEE null');

if (fails) { console.error(`\n${fails} tes GAGAL`); process.exitCode = 1; } else console.log('\nSemua tes lulus');
