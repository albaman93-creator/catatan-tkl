/**
 * CONFIG.JS
 * Semua konstanta & konfigurasi aplikasi terpusat di sini.
 * Untuk ubah nilai (PIN, target OEE, URL server), cukup edit file ini.
 */
const CONFIG = Object.freeze({
  // ====== AUTENTIKASI ======
  CORRECT_PIN: '2026',
  AUTH_KEY:    'fima_oee_logged_in',

  // ====== STORAGE ======
  DB_KEY:      'fima_oee_db_v3',
  NAV_MODE_KEY: 'fima_nav_mode',
  EVAL_SHIFT_KEY: 'fima_eval_shift',

  // ====== DEFAULTS ======
  DEFAULT_ROWS: 30,

  // ====== SHIFT (menit) ======
  // S1=510, S2=480, S3=450
  SHIFT_A: [510, 480, 450],
  SHIFT_LABELS: ['S1', 'S2', 'S3'],

  // ====== RENTANG SHIFT (dalam menit dari 00:00) ======
  // S1: 07:00 (420) - 15:30 (930)
  // S2: 15:30 (930) - 23:30 (1410)
  // S3: 23:30 (1410) - 07:00 (420) — lintas tengah malam
  SHIFT_RANGES: [
    { from: 420,  to: 930,  index: 0 }, // S1
    { from: 930,  to: 1410, index: 1 }, // S2
    { from: 1410, to: 1440, index: 2 }, // S3 (sebelum tengah malam)
    { from: 0,    to: 420,  index: 2 }, // S3 (setelah tengah malam)
  ],

  // ====== KODE LOG SHEET ======
  PLANNED_CODES:   new Set([5, 6, 7, 8]), // Planned Down Time (putih/amber)
  UNPLANNED_CODES: new Set([1, 3, 4, 9]), // Unplanned Down Time (merah)
  // Lainnya → produksi (hijau)

  // ====== TARGET OEE ======
  TARGET: {
    AVAILABILITY: 90,     // %
    PERFORMANCE:  98,     // %
    QUALITY:      99.50,  // %
    OEE:          88,     // %
  },

  // ====== URUTAN KOLOM NAVIGASI (tab order) ======
  NAV_FIELDS: [
    'kode', 'mulai', 'panggil', 'teknik', 'selesai',
    'kegiatan', 'masalah', 'disposisi', 'wo', 'batch',
    'good', 'defect'
  ],

  // ====== LABEL KOLOM (untuk indikator posisi) ======
  FIELD_LABELS: {
    kode: 'KODE', mulai: 'JAM MULAI', panggil: 'PANGGIL TEKNIK',
    teknik: 'TEKNIK DATANG', selesai: 'JAM SELESAI', kegiatan: 'KEGIATAN',
    masalah: 'MASALAH', disposisi: 'DISPOSISI', wo: 'NOMOR WO',
    batch: 'PRODUK & BATCH', good: 'GOOD', defect: 'DEFECT'
  },

  // ====== GOOGLE SHEETS SYNC ======
  // ⚠ GANTI URL INI dengan endpoint Apps Script kamu
  SHEETS_ENDPOINT: 'https://script.google.com/macros/s/AKfycbzO3LR5QZNxIUTLC6Htpm1z-T7oszjo1PS7s6j54g2CtfPDWCsrjH1nmDz84vkpc-32pw/exec',
  SHEETS_TOKEN:    'oee-fima-2026-secret',
  SHEETS_DB_URL:   'https://docs.google.com/spreadsheets/d/16N5vCzssLshBb3_eKqOq9wRdAtr9NkM4E_CXHC3yFTI/edit?gid=1800639959#gid=1800639959',

  // ====== BULAN (untuk format tanggal) ======
  MONTHS: ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'],
});
