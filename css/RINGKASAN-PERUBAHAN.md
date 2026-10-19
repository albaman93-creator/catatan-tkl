# Ringkasan Perubahan — Issue 11 Shutdown Normalisasi + Tema + Konteks

## File yang berubah

| File | Perubahan |
|------|-----------|
| `js/shutdown.js` | Kolom Frekuensi + Rata-rata; tooltip lengkap; konteks tanggal/shift; kartu ringkasan total & kegiatan terbesar; komentar rata-rata per kejadian; stroke donat pakai CSS var |
| `css/shutdown.css` | Semua warna → CSS variables (`--bg-surface`, `--text-primary`, dll.); font tabel 14px; scroll horizontal; baris selang-seling; gaya cetak (selalu terang, tanpa pager) |
| `js/weekly-dashboard.js` | `Shutdown.render` menerima meta lengkap: `from`, `to`, `days`, `shiftLabel`, `product`, `updatedAt` |
| `js/settings.js` | Default tema dari `prefers-color-scheme` jika belum ada pilihan di localStorage; try/catch pada setItem |
| `index.html` | Header tabel baru (No, Aktivitas, Menit, Frek., Rata-rata, Persentase); elemen konteks `#sdPlanCtx` dll.; ringkasan total |
| `js/shutdown-test.mjs` | Tes unit agregasi (baru) |

## Keputusan desain

### Rata-rata
**Per kejadian**, bukan per hari kalender.  
`rata-rata = totalMenit / jumlahKejadian` (dibulatkan).  
Contoh: 3 kejadian 20+30+10 mnt di hari berbeda → rata-rata 20 mnt.

### Warna tema
Mengikuti token yang sudah ada di `css/variables.css`:

| Token | Terang | Gelap |
|-------|--------|-------|
| `--bg-surface` | `#FFFFFF` | `#161618` |
| `--bg-surface-hover` | `#F1F5F9` | `#1c1c1f` |
| `--text-primary` | `#0F172A` | `#f5f5f7` |
| `--text-secondary` | `#475569` | `#aeaeb2` |
| `--text-muted` | `#94A3B8` | `#8e8e93` |
| `--border-default` | `#E2E8F0` | `rgba(255,255,255,0.08)` |

Kontras teks normal vs latar diperkirakan ≥ 4.5:1 (WCAG AA) di kedua tema karena memakai token yang sudah didefinisikan untuk itu.

### Planned vs Unplanned
- Planned: palet biru (`#2563eb` …)
- Unplanned: palet hijau (`#15803d` …)
- Bukan merah–hijau sebagai satu-satunya pembeda; judul panel + posisi (atas/bawah) juga membedakan.
- Teks di dalam slice donat dipilih otomatis lewat `textOn()` berdasarkan kecerahan fill.

### Format angka
- Menit & frekuensi: pemisah ribuan `id-ID` (`1.234`)
- Persentase tabel: 2 desimal
- Persentase donat: 1 desimal

### Pagination
Tetap 8 baris per halaman.

### Cetak
`@media print` memaksa latar putih, teks gelap, menyembunyikan tombol pager, menampilkan konteks tanggal/shift di judul.

## Yang diuji

- [x] `node --check` pada shutdown.js, weekly-dashboard.js, settings.js
- [x] Tes agregasi: case-insensitive, alias, durasi 0, kode di luar daftar, dua hari berbeda → rata-rata per kejadian
- [ ] Tampilan visual di browser (tema terang/gelap) — perlu dicek manusia
- [ ] Kontras warna terprogram (luminansi) — bisa ditambahkan; saat ini mengandalkan token yang sudah ada
- [ ] Layout meeting (1366–1920) & ponsel — perlu dicek manusia
- [ ] Cetak preview — perlu dicek manusia

## Risiko yang perlu dicek manusia

1. **HTML partial match** — pastikan blok shutdown di `index.html` produksi sama dengan yang diganti (jika ada divergensi lokal).
2. **Tema gelap di panel lain** — shutdown sekarang ikut token global; panel PICA/minor stop masih mungkin hardcode gelap.
3. **Donat stroke** — stroke memakai `var(--bg-surface)`; di browser lama tanpa dukungan var di atribut SVG fill/stroke, fallback `#0b1626` dipakai.
4. **localStorage private mode** — sudah di-try/catch; tema tetap bisa diubah sesi berjalan tanpa persist.

## Cara menerapkan

1. Cadangkan proyek.
2. Ekstrak `catatan-tkl-issue11-shutdown-fixed.zip` ke root proyek (timpa file yang ada).
3. Jalankan `node js/shutdown-test.mjs` untuk verifikasi agregasi.
4. Buka halaman detail mesin, pilih rentang tanggal + shift, cek:
   - Judul menampilkan rentang tanggal & shift
   - Tabel punya kolom Frek. & Rata-rata
   - Toggle tema terang/gelap
   - Cetak (Ctrl+P) tanpa tombol pager, tema terang
