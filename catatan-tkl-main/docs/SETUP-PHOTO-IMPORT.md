# Setup Input dari Foto TKL (Gemini + Supabase Edge Function)

Fitur **📷 Input dari Foto** mengirim gambar form TKL ke Supabase Edge Function.
Function memanggil **Gemini Vision** dengan API key yang disimpan sebagai **Secret**
(tidak pernah terlihat di frontend / operator).

## Prasyarat

1. Project Supabase aktif (sudah dipakai app: `rximlgklzghbtgyqvmux`)
2. Akun Google AI Studio / Gemini API key
3. [Supabase CLI](https://supabase.com/docs/guides/cli) terpasang (opsional tapi disarankan)

## 1. Simpan token Gemini (aman)

**Jangan** taruh key di `config.js` atau Google Sheet yang dibaca app.

### Via Dashboard
1. Buka [Supabase Dashboard](https://supabase.com/dashboard) → project kamu
2. **Project Settings** → **Edge Functions** → **Secrets**
3. Tambah secret:
   - Name: `GEMINI_API_KEY`
   - Value: token Gemini kamu (`AIza...`)
4. (Opsional) `GEMINI_MODEL` = `gemini-2.0-flash` (default) atau `gemini-1.5-flash` / `gemini-1.5-pro`

### Via CLI
```bash
supabase login
supabase link --project-ref rximlgklzghbtgyqvmux
supabase secrets set GEMINI_API_KEY=AIza_xxx_ganti_dengan_token_kamu
# opsional:
supabase secrets set GEMINI_MODEL=gemini-2.0-flash
```

## 2. Deploy Edge Function

Dari folder project (yang berisi `supabase/functions/parse-tkl-photo`):

```bash
cd catatan-tkl-main
supabase functions deploy parse-tkl-photo
```

URL function nanti:
```
https://rximlgklzghbtgyqvmux.supabase.co/functions/v1/parse-tkl-photo
```

### JWT / auth
App mengirim `Authorization: Bearer <session atau anon key>`.

Jika deploy gagal karena JWT, bisa sementara:
```bash
supabase functions deploy parse-tkl-photo --no-verify-jwt
```
(lebih longgar; idealnya biarkan JWT on + user login).

## 3. Pakai di aplikasi

1. Deploy / refresh app (hard refresh `Ctrl+Shift+R`)
2. Menu ☰ → **📷 Input dari Foto**
3. Ambil / pilih foto form TKL
4. Tunggu AI membaca
5. **Review** tabel hasil (koreksi jika perlu)
6. **Masukkan ke Sheet** → OEE dihitung otomatis

## Keamanan

| Item | Terlihat operator? |
|------|--------------------|
| `SUPABASE_ANON_KEY` | Ya (wajar, dilindungi RLS) |
| `GEMINI_API_KEY` | **Tidak** (hanya Edge Secret) |
| Foto form | Lewat HTTPS ke function kamu, lalu ke Gemini |

Siapa yang bisa lihat `GEMINI_API_KEY`: hanya admin yang login ke Dashboard Supabase / CLI dengan akses project.

## Troubleshooting

| Gejala | Cek |
|--------|-----|
| `GEMINI_API_KEY belum di-set` | Secrets belum diisi / belum deploy ulang |
| `Gemini HTTP 400/403` | Token salah / model tidak tersedia di region |
| `Failed to fetch` / CORS | Function belum deploy / URL project salah |
| 0 baris terdeteksi | Foto buram, miring, atau bukan form TKL — foto ulang dengan cahaya cukup |
| HTTP 413 | Gambar terlalu besar — app sudah kompres, coba crop form saja |

## Biaya

- Supabase Edge Function: kuota gratis biasanya cukup untuk pemakaian internal
- Gemini: per gambar (flash relatif murah). Cek kuota di Google AI Studio

## File terkait

- `supabase/functions/parse-tkl-photo/index.ts` — server (Gemini)
- `js/photo-import.js` — UI upload + preview + apply ke sheet
- Menu: `#btnPhotoImport` di `index.html`
