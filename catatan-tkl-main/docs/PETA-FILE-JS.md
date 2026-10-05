# 🗺️ Peta File JavaScript — TKL-OEE System

Dokumen ini menjelaskan **fungsi tiap file** di folder `js/`, supaya kamu tahu
harus edit file mana untuk kebutuhan tertentu. Disusun dari yang paling sering
disentuh sampai yang jarang.

> 💡 **Cara pakai dokumen ini:** scroll ke bagian "Kalau saya mau..." di paling
> bawah untuk pencarian cepat, atau baca per kategori di bawah untuk paham
> alur besar aplikasinya.

---

## 🧠 Konsep Dasar Arsitektur

Setiap file adalah **1 modul JS** yang membungkus dirinya sendiri dengan pola:
```js
const NamaModul = (() => {
  'use strict';
  // ...isi...
  return { fungsi1, fungsi2 };
})();
```
Jadi `Rows.js` → objek global `Rows`, `State.js` → objek global `State`, dst.
Modul lain memanggil lewat nama itu, misal `Rows.makeRow()`, `UI.toast()`.

**State terpusat** ada di `state.js` (`State.el.xxx` untuk semua elemen DOM,
`State.evalShift` untuk shift aktif, dst). Hampir semua modul lain
membaca/menulis ke `State`.

---

## 🔥 FILE INTI (paling sering diedit)

### `state.js`
Menyimpan **state global** aplikasi (shift aktif, mode navigasi, mode input,
WO default) dan **cache semua elemen DOM** (`State.el.xxx`) supaya modul lain
tidak perlu `document.getElementById` berulang-ulang.
→ Edit di sini kalau: nambah state baru, atau nambah ID elemen HTML baru yang
perlu di-cache.

### `rows.js`
Mengurus **baris log sheet**: bikin baris baru (`makeRow`), hapus baris,
dropdown Produk & Batch per baris, auto-isi No. WO dari produk, dan tabel
"Rincian Performa Produk".
→ Edit di sini kalau: perilaku baris tabel log sheet (isi kolom, dropdown,
default value per baris) perlu diubah. **Ini file yang kita edit untuk fitur
default jam mulai shift.**

### `calculation.js`
**Logika bisnis inti**: hitung durasi tiap baris, Availability, Performance,
Quality, dan OEE akhir. Juga validasi apakah jam yang diinput cocok dengan
shift yang dipilih.
→ Edit di sini kalau: rumus OEE/Availability/Performance/Quality berubah, atau
aturan validasi jam berubah.

### `ui.js`
Komponen **UI non-bisnis**: jam & tanggal live, toast notifikasi, mode
navigasi (vertikal/horizontal), **pemilihan shift** (`setEvalShift`), toggle
sidebar, ganti tampilan (tabel/form/form-lengkap), status sync chip, install
PWA.
→ Edit di sini kalau: perilaku UI umum (toast, shift, sidebar, mode tampilan)
perlu diubah. **Titik tunggal ganti shift (`setEvalShift`) ada di sini.**

### `navigation.js`
Navigasi **keyboard** antar input tabel (Tab/Enter/panah), highlight kolom
aktif, dan toggle visibility kolom (ceklis kolom mana yang ditampilkan).
→ Edit di sini kalau: urutan Tab/Enter salah, atau kolom yang
disembunyikan/ditampilkan tidak sesuai.

### `app.js`
**Entry point** aplikasi. Menjalankan semua `init`/`load`/`bind` dari modul
lain secara berurutan setelah login berhasil.
→ Edit di sini kalau: ada modul baru yang perlu di-inisialisasi saat app
mulai, atau urutan booting perlu diubah.

---

## 💾 DATA & PENYIMPANAN

### `config.js`
**Semua konstanta terpusat**: kredensial Supabase, nama tabel, target OEE,
daftar kode Planned/Unplanned Down Time, dsb.
→ Edit di sini kalau: ganti target OEE, ganti kredensial Supabase, atau
tambah/ubah daftar kode.

### `storage.js`
Baca/tulis data ke **localStorage** (cache offline) dan **Supabase** (tabel
`oee_data`). Strategi hybrid: online → langsung Supabase, offline → antre di
localStorage lalu sync otomatis saat online lagi.
→ Edit di sini kalau: field data yang disimpan/dimuat berubah, atau logika
online/offline bermasalah.

### `sync.js`
Antrean sinkronisasi **offline → online**. Menyimpan baris yang gagal
ter-upload lalu mencoba ulang otomatis.
→ Edit di sini kalau: retry logic sinkronisasi perlu diubah.

### `supabase-client.js`
Inisialisasi **client Supabase** global. Harus dimuat setelah `config.js`,
sebelum `auth.js`.
→ Jarang diedit — hanya kalau setup koneksi Supabase berubah total.

### `supabase-js.v2.112.3.min.js`
Library pihak ketiga (SDK resmi Supabase), **JANGAN diedit**.

### `auth.js`
Login/logout via **Supabase Auth** (email & password). Session otomatis
tersimpan supaya user tetap login walau app ditutup.
→ Edit di sini kalau: alur login/logout atau pesan error login berubah.

---

## 🖱️ INPUT & MODE PENGISIAN

### `mode.js`
Mengatur 3 **mode input**: Normal, Cepat 1, Cepat 2 (Super Cepat) — termasuk
dialog konfirmasi ganti mode dan visibility kolom per mode.
→ Edit di sini kalau: aturan pindah antar mode input berubah.

### `quickmode.js`
Detail perilaku **Mode Cepat 1 & Cepat 2**: fokus ke Kode & Rate, pemilihan
produk aktif, kolom yang ditampilkan lebih ringkas.
→ Edit di sini kalau: field/kolom yang muncul di mode cepat perlu diubah.

### `formmode.js`
Tampilan **"Form Input"**: satu baris log sheet ditampilkan sebagai kartu
besar (Kode, Jam Mulai, Kegiatan, Good, Defect) — cocok dipakai berdiri di
lini produksi. Tidak simpan data sendiri, langsung tulis ke input asli tabel.
→ Edit di sini kalau: field ringkas di Form Input kurang/lebih.

### `formfull.js`
Sama seperti `formmode.js` tapi menampilkan **SEMUA kolom** (Form Lengkap).
→ Edit di sini kalau: field di Form Lengkap perlu ditambah/dikurangi.

### `bulkfill.js`
Fitur **"Isi Massal"**: klik ikon 📥 di header kolom untuk isi banyak baris
sekaligus lewat daftar bernomor.
→ Edit di sini kalau: perilaku isi massal (misal kolom mana yang bisa diisi
massal) berubah.

### `suggest.js`
**Ghost text autocomplete** untuk kolom Kegiatan — saran otomatis muncul abu-
abu di belakang kursor sesuai Tahapan Proses aktif (Mixing/Filling/dst).
→ Edit di sini kalau: daftar saran kegiatan perlu ditambah/diubah.

---

## 📊 DASHBOARD, CETAK & SINKRONISASI TAMPILAN

### `dashboard.js`
Screen **"Dashboard OEE"** — rekap tabel + grafik OEE.
→ Edit di sini kalau: tampilan/grafik dashboard perlu diubah.

### `printsheet.js`
Fitur **Cetak (Print)** ke format A4 Landscape mengikuti formulir kertas resmi
FIMA.
→ Edit di sini kalau: layout hasil print perlu diubah.

### `sheet-op-sync.js`
Sinkronisasi tampilan ringkas **kotak Operator (OP1-OP6)** di halaman Sheet
dengan field asli di section Inisial. Murni cermin tampilan, tidak mengubah
data asli.
→ Edit di sini kalau: kotak operator ringkas di halaman Sheet bermasalah.

### `sheet-product-sync.js`
Cermin ringkas **Produk/Rate/No. WO** di halaman Sheet, sinkron dengan Master
Produk.
→ Edit di sini kalau: tampilan ringkas produk di halaman Sheet bermasalah.

### `sheet-product-wo-sync.js`
Mirip di atas tapi fokus **Produk + No. WO** ringkas — No. WO otomatis
mengikuti produk yang dipilih tapi tetap bisa diedit manual.
→ Edit di sini kalau: auto-isi No. WO ringkas di halaman Sheet bermasalah.

### `wizard.js`
**"Setup Awal"** — alur tanya-jawab step-by-step (Shift → Tahapan → Tanggal →
Operator → No. WO → Produk & Rate) di awal pemakaian. Semua input di sini
langsung sinkron ke elemen asli, bukan sumber data terpisah.
→ Edit di sini kalau: urutan/isi wizard setup awal perlu diubah.

### `shell.js`
Navigasi shell: collapse nav rail desktop, command palette (Ctrl/Cmd+K),
breadcrumb, visibility menu berbasis role.
→ Edit di sini kalau: navigasi besar/shell aplikasi berubah.

### `settings.js`
Preferensi tampilan yang disimpan lokal (localStorage) — independen dari
akun/login. Contoh: toggle dekorasi visual, tema terang/gelap.
→ Edit di sini kalau: ada preferensi tampilan baru yang perlu disimpan lokal.

---

## 🎨 EFEK VISUAL & DEKORASI (halaman login)

Semua file ini murni **kosmetik/dekoratif** untuk background halaman login —
TIDAK menyentuh logika data/OEE sama sekali. Aman diabaikan kalau kamu fokus
ke fitur logsheet.

| File | Fungsi |
|---|---|
| `scene.js` | Tema background sesuai waktu hari (fajar/siang/senja/malam), posisi matahari/bulan |
| `nature.js` | Elemen dekoratif tambahan (sungai, kincir, bunga matahari, kunang-kunang) — murni aditif, tidak ubah scene.js |
| `fx.js` | Particle effects: hujan, salju, kembang api, petir |
| `weather.js` | Fetch cuaca asli dari Open-Meteo, aktifkan efek visual sesuai cuaca nyata |
| `clean-live.js` | Sembunyikan elemen jam "LIVE" duplikat |
| `industrial-toolbar.js` | Branding toolbar atas |
| `mobile-nav.js` | Bottom navigation khusus mobile |

---

## 🔧 UTILITAS & PERFORMA

### `utils.js`
Kumpulan **fungsi murni** (pure function) tanpa efek samping: format angka,
parse waktu, penentuan kategori kode, dsb.
→ Edit di sini kalau: butuh helper baru yang dipakai di banyak tempat, atau
format angka/waktu default berubah.

### `perf.js`
**Scheduler ringan** pengganti banyak `setInterval` terpisah (jam, sync
status, cuaca, dst) jadi satu mesin (`Perf.every`) yang otomatis berhenti saat
app disembunyikan (hemat baterai).
→ Edit di sini kalau: ada timer baru yang perlu didaftarkan, atau perilaku
auto-pause saat app di-background bermasalah.

---

## 🔍 Kalau saya mau... (pencarian cepat)

| Saya mau... | Edit file |
|---|---|
| Ubah default jam/isian awal baris log sheet | `rows.js` |
| Ubah rumus OEE/Availability/Performance/Quality | `calculation.js` |
| Ubah perilaku tombol ganti Shift, toast, sidebar | `ui.js` |
| Tambah/ubah state global atau elemen DOM yang di-cache | `state.js` |
| Ubah urutan Tab/Enter atau kolom yang disembunyikan | `navigation.js` |
| Ubah target OEE, kredensial Supabase, daftar kode DT | `config.js` |
| Field data yang disimpan/dimuat dari Supabase/localStorage | `storage.js` |
| Login/logout tidak berfungsi | `auth.js` |
| Ubah field di Mode Cepat 1/2 | `quickmode.js` + `mode.js` |
| Ubah field di Form Input ringkas | `formmode.js` |
| Ubah field di Form Lengkap | `formfull.js` |
| Ubah fitur Isi Massal | `bulkfill.js` |
| Ubah saran ghost-text kolom Kegiatan | `suggest.js` |
| Ubah tampilan Dashboard OEE | `dashboard.js` |
| Ubah layout hasil Print A4 | `printsheet.js` |
| Ubah urutan Wizard Setup Awal | `wizard.js` |
| Tambah helper fungsi umum (format angka dll) | `utils.js` |
| Ada timer/interval baru yang perlu hemat baterai | `perf.js` |
| Modul baru perlu di-load saat app start | `app.js` |
| Ubah efek visual/background halaman login | `scene.js`, `nature.js`, `fx.js`, `weather.js` |

---

## 📌 Urutan Load (penting untuk konteks)

Modul saling bergantung. Urutan umum di `index.html` biasanya:
```
config.js → supabase-client.js → auth.js
→ utils.js → state.js
→ ui.js → navigation.js → rows.js → calculation.js
→ mode.js → quickmode.js → formmode.js → formfull.js
→ bulkfill.js → suggest.js
→ storage.js → sync.js
→ dashboard.js → printsheet.js → wizard.js → shell.js → settings.js
→ sheet-*-sync.js
→ app.js (paling akhir — manggil semua init/load/bind modul lain)
```
Kalau nambah modul baru yang butuh `State.el.xxx`, pastikan dimuat **setelah**
`state.js`. Kalau modul baru dipanggil dari modul lain (misal `Rows` dipanggil
dari `ui.js`), pastikan urutannya benar atau pakai `typeof X !== 'undefined'`
sebagai pengaman (pola yang sudah dipakai di banyak file ini).
