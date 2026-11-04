# 📘 Panduan Setup Supabase Auth + RLS

Implementasi Supabase Auth + RLS sudah diterapkan di project TKL-OEE. Ikuti langkah berikut untuk mengaktifkannya.

---

## 📋 Apa yang Sudah Diubah?

| File | Perubahan |
|---|---|
| `index.html` | + Supabase SDK, + form login email/password |
| `config.js` | + konfigurasi Supabase URL & key |
| `js/supabase-client.js` | **BARU** — inisialisasi client Supabase |
| `js/auth.js` | Rewrite — mendukung Supabase Auth + PIN legacy |
| `js/storage.js` | Rewrite — Supabase DB + Google Sheets backup |
| `js/app.js` | Toggle UI login berdasarkan AUTH_MODE |
| `supabase-setup.sql` | **BARU** — SQL script database + RLS |

---

## 🚀 Langkah Setup (WAJIB DILAKUKAN)

### 1. Buat Project Supabase

1. Buka [https://supabase.com](https://supabase.com)
2. Klik **New Project**
3. Isi nama project (misal: `tkl-oee`)
4. Set **Database Password** (catat baik-baik!)
5. Pilih region terdekat (Singapore `ap-southeast-1` recommended)
6. Tunggu project siap (~2 menit)

### 2. Copy URL & Key

1. Masuk ke project → **Settings** → **API**
2. Catat 2 nilai ini:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbGciOi...`

### 3. Edit `config.js`

Buka `js/config.js` dan ganti placeholder dengan nilai asli:

```javascript
SUPABASE_URL: 'https://xxxxx.supabase.co',         // ← ganti ini
SUPABASE_ANON_KEY: 'eyJhbGciOi...',                  // ← ganti ini
```

### 4. Setup Database & RLS

1. Buka **SQL Editor** di Supabase Dashboard
2. Klik **New Query**
3. Copy **SELURUH isi** file `supabase-setup.sql`
4. Paste ke SQL Editor
5. Klik **Run** (atau Ctrl+Enter)
6. Tunggu hingga semua query selesai ✓

### 5. Buat User Admin Pertama

1. Buka **Authentication** → **Users** → **Add User** → **Create new user**
2. Isi:
   - Email: `admin@pabrik.com`
   - Password: (buat password kuat)
   - Auto Confirm User: ✓ (centang)
3. Klik **Create User**
4. Kembali ke **SQL Editor**, jalankan:

```sql
UPDATE public.user_profiles SET role = 'admin' WHERE email = 'admin@pabrik.com';
```

### 6. Buat User Operator

Untuk setiap operator, buat user via SQL Editor:

```sql
-- Buat user + profile operator
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
SELECT
  gen_random_uuid(),
  'operator1@pabrik.com',
  crypt('password123', gen_salt('bf')),
  now(),
  '{"role": "operator", "full_name": "Budi Santoso", "shift": "S1"}'::jsonb;
```

**ATAU** lebih mudah: gunakan Supabase Dashboard → Authentication → Users → Add User untuk setiap operator.

Kemudian update profile-nya:

```sql
UPDATE public.user_profiles
SET role = 'operator', shift = 'S1', full_name = 'Budi Santoso'
WHERE email = 'operator1@pabrik.com';
```

### 7. Uji Login

1. Buka aplikasi (via browser atau Vercel)
2. Login dengan email admin: `admin@pabrik.com` + password
3. Seharusnya langsung masuk ke aplikasi
4. Simpan data → cek di Supabase → **Table Editor** → `oee_records`

---

## 🔄 Mode Operasi

### Mode `supabase` (recommended)
- Login: email/password
- Data: Supabase Database dengan RLS
- Backup: Google Sheets (opsional)
- User management: penuh (admin/supervisor/operator)

### Mode `pin` (legacy)
- Login: PIN statis ("2026")
- Data: localStorage + Google Sheets
- User management: tidak ada
- **Untuk backward compatibility**

Untuk switch mode, edit `config.js`:

```javascript
AUTH_MODE: 'supabase',  // atau 'pin'
```

---

## 🔒 RLS Policies yang Diterapkan

| Role | Akses Data |
|---|---|
| **Operator** | Hanya bisa baca/edit data yang dia buat sendiri |
| **Supervisor** | Bisa baca data di shift-nya + data operatornya |
| **Admin** | Akses penuh ke semua data + audit log |

RLS aktif secara otomatis — bahkan jika seseorang mencoba akses langsung via API, mereka hanya bisa melihat data yang diizinkan.

---

## 📊 Struktur Database

```
├── user_profiles
│   ├── id (uuid → auth.users)
│   ├── full_name
│   ├── email
│   ├── role (admin/supervisor/operator)
│   ├── shift (S1/S2/S3)
│   └── line_ids (integer[])
│
├── oee_records
│   ├── id (bigserial)
│   ├── user_id (uuid)
│   ├── record_date
│   ├── shift (1/2/3)
│   ├── line
│   ├── stage
│   ├── payload (jsonb — seluruh form data)
│   ├── summary (jsonb — ringkasan OEE)
│   └── timestamps
│
└── audit_log
    ├── id (bigserial)
    ├── user_id
    ├── action (create/update/delete)
    ├── old_data / new_data
    └── created_at
```

---

## ⚡ Tips Optimasi

1. **Index sudah dibuat** otomatis di SQL script untuk performa query
2. **Upsert function** mencegah duplicate records
3. **Payload disimpan sebagai JSONB** — fleksibel tanpa perlu ubah schema saat ada field baru
4. **View `oee_summary_view`** tersedia untuk laporan cepat

---

## 🆘 Troubleshooting

### Login gagal: "Invalid login credentials"
- Pastikan email sudah dikonfirmasi
- Cek password benar
- Cek `SUPABASE_URL` dan `SUPABASE_ANON_KEY` sudah benar di config.js

### Data tidak tersimpan ke Supabase
- Cek RLS sudah aktif (di Table Editor → Enable RLS)
- Pastikan user sudah punya profile di `user_profiles`
- Buka browser DevTools → Console untuk lihat error detail

### RLS block semua akses
- Jalankan ulang `supabase-setup.sql` di SQL Editor
- Cek user role sudah di-set (bukan null)

### Google Sheets masih dipakai
- Set `USE_SHEETS_BACKUP: false` di config.js jika tidak mau backup ke Sheets

---

## 📝 Checklist Implementasi

- [ ] Project Supabase dibuat
- [ ] SUPABASE_URL & SUPABASE_ANON_KEY diisi di config.js
- [ ] SQL script dijalankan di SQL Editor
- [ ] User admin pertama dibuat + role di-set ke 'admin'
- [ ] User operator dibuat sesuai kebutuhan
- [ ] Aplikasi dites login dengan akun admin
- [ ] Data tes disimpan → muncul di Supabase Table Editor
- [ ] RLS dites: login sebagai operator → hanya bisa lihat data sendiri
- [ ] (Opsional) Deploy ulang ke Vercel

---

## 🎯 Next Step (Opsional)

Setelah setup dasar selesai, Anda bisa tambahkan:

1. **Halaman Admin** — UI untuk manage user (CRUD operator)
2. **Dashboard OEE** — grafik tren OEE per line/shift
3. **Export PDF** — laporan harian dalam format PDF
4. **Real-time sync** — data update otomatis antar device (pakai Supabase Realtime)
5. **Shift auto-detect** — otomatis pilih shift berdasarkan waktu login

Semua fitur ini bisa dibangun di atas fondasi RLS yang sudah disiapkan. 🚀
