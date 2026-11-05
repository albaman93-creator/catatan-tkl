# Perbaikan data dobel (tanggal/shift lain ikut terisi)

**Penyebab utama** — `js/storage.js`: simpan memakai `curKey()` (filter BARU) saat form masih berisi data filter LAMA.
Auto-save (10 dtk lokal / 30 dtk cloud) yang jatuh di jendela waktu antara ganti tanggal/shift dan data selesai dimuat
menulis data lama ke tanggal/shift baru. Respons Supabase yang telat juga di-cache ke key yang salah.

**Perbaikan**
- `storage.js`: `formKey` (pemilik isi form) + `loading`; simpan ditahan saat memuat; respons usang dibuang;
  form lama di-flush ke key-nya sendiri (lokal + cloud) sebelum pindah; record bertanda `formKey` salah ditolak.
- Salin/Pindah: key ke Supabase sekarang key TUJUAN (sebelumnya key sumber → baris sumber rusak / terhapus saat Pindah);
  peringatan "akan ditimpa" juga mengecek cloud; sumber kosong ditolak.
- `csv-import.js`: muat record tujuan dulu setelah filter berganti.
- `config.js`: `COPY_MOVE_ENABLED: false` untuk menonaktifkan fitur Salin/Pindah sepenuhnya.
- Diagnostik: Console → `Storage.scanDuplicates()` (lokal) · `database/cek-duplikat.sql` (cloud).

Data dobel yang SUDAH terlanjur ada tidak dihapus otomatis — cek lalu hapus manual.
