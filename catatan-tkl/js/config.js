/**
 * CONFIG.JS
 * Semua konstanta & konfigurasi aplikasi terpusat di sini.
 * Untuk ubah nilai (PIN, target OEE, URL server), cukup edit file ini.
 */
const CONFIG = Object.freeze({
  // ====== SUPABASE ======
  // Project: rximlgklzghbtgyqvmux
  SUPABASE_URL:      'https://rximlgklzghbtgyqvmux.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4aW1sZ2tsemdoYnRneXF2bXV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MjYyMDcsImV4cCI6MjEwMjAwMjIwN30.igM5-0JRWQSb6zAlN9qN2MvuG4A5UGuIL3OpVX1nFMo',

  // Nama tabel Supabase tempat data OEE disimpan (lihat supabase-setup.sql)
  DB_TABLE: 'oee_data',
  SCHEMA_VERSION: 1,

  // ====== AUTENTIKASI ======
  // 'supabase' = login email/password via Supabase Auth (rekomendasi)
  // 'pin'      = login PIN lama (fallback, tidak butuh internet/Supabase)
  AUTH_MODE:   'supabase',
  CORRECT_PIN: '2026',
  AUTH_KEY:    'fima_oee_logged_in',

  // ====== STORAGE ======
  DB_KEY:      'fima_oee_db_v3',
  NAV_MODE_KEY: 'fima_nav_mode',
  EVAL_SHIFT_KEY: 'fima_eval_shift',
  TOOLBAR_COLLAPSED_KEY: 'fima_toolbar_collapsed',
  ACTIVE_SCREEN_KEY: 'fima_active_screen',
  COL_PRESET_KEY: 'fima_col_preset',
  WIZARD_SEEN_KEY: 'fima_wizard_seen',
  DEFAULT_WO_KEY: 'fima_default_wo',
  COL_TOGGLE_OPEN_KEY: 'fima_col_toggle_open',
  VIEW_MODE_KEY: 'fima_view_mode',

  // Auto-save LOKAL (localStorage) setiap N ms. Tidak menyentuh Supabase —
  // hanya menjaga-jaga data tidak hilang kalau browser/tab tertutup tiba-tiba.
  AUTO_SAVE_INTERVAL_MS: 60000, // 1 menit

  // ====== DEFAULTS ======
  DEFAULT_ROWS: 10,

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
  // 'durasi' hanya terlihat/terpakai pada Mode Cepat 1 & Mode Cepat 2
  // (disembunyikan otomatis di Mode Normal, tidak ikut tab order berkat
  // filter offsetParent di Navigation.navCells).
  NAV_FIELDS: [
    'kode', 'mulai', 'panggil', 'teknik', 'selesai', 'durasi',
    'kegiatan', 'masalah', 'disposisi', 'wo', 'batch',
    'good', 'defect'
  ],

  // ====== LABEL KOLOM (untuk indikator posisi) ======
  FIELD_LABELS: {
    kode: 'KODE', mulai: 'JAM MULAI', panggil: 'PANGGIL TEKNIK',
    teknik: 'TEKNIK DATANG', selesai: 'JAM SELESAI', durasi: 'DURASI (MENIT)',
    kegiatan: 'KEGIATAN',
    masalah: 'MASALAH', disposisi: 'DISPOSISI', wo: 'NOMOR WO',
    batch: 'PRODUK & BATCH', good: 'GOOD', defect: 'DEFECT'
  },

  // ====== SUGESTI KEGIATAN (ghost-text) ======
  // Muncul otomatis saat mengetik di kolom Kegiatan (sel tabel, Isi Massal,
  // maupun Form Input), disesuaikan dengan Tahapan Proses yang aktif
  // (dropdown "Tahapan" di Data & Penyimpanan). Silakan tambah/ubah daftar
  // di bawah ini sesuka hati — tidak perlu ubah kode JS lain.
  // 'common' = selalu ikut disertakan di tahapan manapun.
  KEGIATAN_SUGGESTIONS: {
    mixing: [
      'Loading Lot A', 'Loading Lot B', 'Loading Lot C', 'Loading Lot D',
      'Mixing', 'Persiapan', 'Ganti Lot', 'Ganti Baju',
    ],
    filling: [
      'Filling Lot A', 'Filling Lot B', 'Filling Lot C', 'Filling Lot D',
      'Persiapan',
    ],
    steril: [
      'Sterilisasi', 'Persiapan', 'Loading Chamber', 'Unloading Chamber',
    ],
    visual: [
      'Inspeksi Visual', 'Persiapan', 'Sortir Reject',
    ],
    kemas: [
      'Pengemasan Sekunder', 'Persiapan', 'Ganti Batch', 'Labeling',
    ],
    common: [
      'Cleaning', 'Istirahat', 'Menunggu Instruksi',
    ],
  },

  // ====== KODE PRODUK REFERENSI (autocomplete nama produk) ======
  // Filter prefix saat mengetik di kolom Nama Produk. Klik pilihan → isi kode,
  // kursor di akhir supaya bisa lanjut ketik bebas (mis. "VTTS1 L030001").
  // visual & kemas memakai sufiks huruf; tahapan lain memakai sufiks angka.
  PRODUCT_CODE_SUGGESTIONS: {
    mixing:  ['VTTS1','VKAM1','VLON1','VMON1','VTRA1','VCLN2','VMNT1','VTRM1','VPEL1','ITTC2','VTTC1'],
    filling: ['VTTS1','VKAM1','VLON1','VMON1','VTRA1','VCLN2','VMNT1','VTRM1','VPEL1','ITTC2','VTTC1'],
    steril:  ['VTTS1','VKAM1','VLON1','VMON1','VTRA1','VCLN2','VMNT1','VTRM1','VPEL1','ITTC2','VTTC1'],
    visual:  ['VTTSA','VKAMA','VLONA','VMONA','VTRAB','VCLNB','VMNTA','VTRME','VPELA','ITTCB','VTTCA'],
    kemas:   ['VTTSA','VKAMA','VLONA','VMONA','VTRAB','VCLNB','VMNTA','VTRME','VPELA','ITTCB','VTTCA'],
  },

  // ====== MODE INPUT (Normal / Cepat 1 / Cepat 2) ======
  INPUT_MODE_KEY: 'fima_input_mode',

  // Jam mulai standar per shift, dipakai untuk dropdown cepat pada baris pertama
  // di Mode Cepat 1 & Mode Cepat 2 (lihat js/quickmode.js).
  SHIFT_START_TIMES: ['07:00', '15:30', '23:30'],

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
  AUTUMN_MONTHS: [9, 10, 11],   // bulan dengan efek daun berguguran (state musim gugur dekoratif)
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
