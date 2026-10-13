/**
 * Tes sederhana agregasi shutdown (tanpa DOM / browser).
 * Jalankan: node js/shutdown-test.mjs
 */
import fs from 'fs';
import vm from 'vm';

const sandbox = {
  console,
  CONFIG: {
    PLANNED_CODES: new Set([5, 6, 7, 8]),
    UNPLANNED_CODES: new Set([1, 3, 4, 9]),
    KEGIATAN_ALIASES: {
      'merapihkan media': 'Merapihkan Media',
      'rapihkan media': 'Merapihkan Media',
      'ganti sp': 'Ganti SP Media',
    }
  },
  Utils: {
    parseTime: (t) => {
      if (!t) return null;
      const m = String(t).match(/^(\d{1,2}):(\d{2})$/);
      return m ? Number(m[1]) * 60 + Number(m[2]) : null;
    },
    escapeHtml: (s) => String(s)
  },
  document: { readyState: 'complete', getElementById: () => null, addEventListener: () => {} }
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;

const code = fs.readFileSync(new URL('./shutdown.js', import.meta.url), 'utf8');
vm.runInNewContext(code, sandbox);

const Shutdown = sandbox.Shutdown;
const CONFIG = sandbox.CONFIG;

const assert = (cond, msg) => {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; }
  else console.log('PASS:', msg);
};

const records = [
  {
    date: '2026-10-01', shift: 1,
    payload: {
      rows: [
        { kode: 5, kegiatan: 'GANTI BAJU', mulai: '08:00', selesai: '08:20', durasi: 20 },
        { kode: 5, kegiatan: 'ganti  baju', mulai: '09:00', selesai: '09:30', durasi: 30 },
        { kode: 5, kegiatan: 'Ganti baju', mulai: '10:00', selesai: '10:10', durasi: 10 },
        { kode: 5, kegiatan: 'rapihkan media', mulai: '11:00', selesai: '11:15', durasi: 15 },
        { kode: 5, kegiatan: 'Merapihkan Media', mulai: '12:00', selesai: '12:25', durasi: 25 },
        { kode: 5, kegiatan: 'ganti sp', mulai: '13:00', selesai: '13:05', durasi: 5 },
        { kode: 5, kegiatan: 'Idle', mulai: '14:00', selesai: '14:00', durasi: 0 },
        { kode: 2, kegiatan: 'Produksi', mulai: '15:00', selesai: '16:00', durasi: 60 },
      ]
    }
  },
  {
    date: '2026-10-02', shift: 2,
    payload: {
      rows: [
        { kode: 5, kegiatan: 'Ganti Baju', mulai: '08:00', selesai: '08:40', durasi: 40 },
        { kode: 1, kegiatan: 'Breakdown mesin', mulai: '09:00', selesai: '09:50', durasi: 50 },
      ]
    }
  }
];

const plan = Shutdown._aggregate(records, CONFIG.PLANNED_CODES);
const unp  = Shutdown._aggregate(records, CONFIG.UNPLANNED_CODES);

const ganti = plan.list.find(x => /ganti baju/i.test(x.label));
assert(ganti, 'Ganti baju terkelompok');
assert(ganti && ganti.v === 100, `Ganti baju total menit = 100 (got ${ganti?.v})`);
assert(ganti && ganti.n === 4, `Ganti baju frekuensi = 4 (got ${ganti?.n})`);
assert(ganti && ganti.avg === 25, `Ganti baju rata-rata = 25 (got ${ganti?.avg})`);

const media = plan.list.find(x => x.label === 'Merapihkan Media');
assert(media, 'Alias Merapihkan Media terkelompok');
assert(media && media.v === 40, `Merapihkan Media total = 40 (got ${media?.v})`);
assert(media && media.n === 2, `Merapihkan Media n = 2 (got ${media?.n})`);

const sp = plan.list.find(x => x.label === 'Ganti SP Media');
assert(sp && sp.v === 5 && sp.n === 1, 'Alias Ganti SP Media');

assert(plan.total === 145, `Total planned = 145 (got ${plan.total})`);
assert(!plan.list.find(x => /idle/i.test(x.label)), 'Durasi 0 diabaikan');
assert(!plan.list.find(x => /produksi/i.test(x.label)), 'Kode di luar daftar diabaikan');

assert(unp.total === 50 && unp.list.length === 1, 'Unplanned Breakdown 50 mnt');
assert(Shutdown._normKey('  Ganti  BAJU ') === 'ganti baju', 'normKey case+space');

console.log('\nSelesai. exitCode =', process.exitCode || 0);
