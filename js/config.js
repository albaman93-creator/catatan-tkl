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

  // ====== CUACA & EFEK VISUAL ======
  // Koordinat pabrik untuk fetch cuaca dari Open-Meteo (gratis, tanpa API key)
  // ⚠ Ubah ke koordinat pabrik Anda sendiri untuk akurasi maksimal.
  LOCATION: {
    lat: -6.9147,       // contoh: Bandung
    lon: 107.6098,
    label: 'Bandung'
  },
  WEATHER_REFRESH_MIN: 30,      // refresh API tiap N menit
  SNOW_MONTHS: [12],            // bulan dengan efek salju dekoratif (1=Jan..12=Des)
  RAINBOW_RECENT_MIN: 90,       // menit setelah hujan → pelangi muncul

  // Tanggal khusus yang memicu kembang api di background login
  SPECIAL_DATES: [
    { month: 1,  day: 1,  name: 'Tahun Baru' },
    { month: 8,  day: 17, name: 'HUT RI' },
    { month: 12, day: 31, name: 'Malam Tahun Baru' }
  ],

  // ====== SCENE SCHEDULE (tema background login berdasarkan waktu) ======
  // Jam dalam menit dari 00:00. Edit rentang ini untuk mengubah kapan tema berganti.
  SCENE_SCHEDULE: [
    { from: 0,    to: 240,  name: 'night'   }, // 00:00 - 04:00
    { from: 240,  to: 420,  name: 'sunrise' }, // 04:00 - 07:00  (fajar)
    { from: 420,  to: 960,  name: 'day'     }, // 07:00 - 16:00  (siang)
    { from: 960,  to: 1080, name: 'sunset'  }, // 16:00 - 18:00  (senja)
    { from: 1080, to: 1440, name: 'night'   }, // 18:00 - 24:00  (malam)
  ],
});
