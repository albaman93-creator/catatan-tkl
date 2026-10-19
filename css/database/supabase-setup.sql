-- =====================================================
-- SUPABASE DATABASE SETUP — TKL-OEE (v2)
-- Jalankan script ini di Supabase Dashboard → SQL Editor
-- Project: rximlgklzghbtgyqvmux
-- =====================================================

-- =====================================================
-- 0. (OPSIONAL) BERSIHKAN SKEMA LAMA
-- Jika sebelumnya sudah pernah menjalankan supabase-setup.sql versi lama
-- (tabel oee_records / user_profiles / audit_log), dan Anda ingin mulai
-- bersih dengan struktur baru di bawah, un-comment blok ini dahulu.
-- =====================================================
-- drop table if exists public.audit_log cascade;
-- drop table if exists public.oee_records cascade;
-- drop function if exists upsert_oee_record cascade;


-- =====================================================
-- 1. TABEL oee_data
-- Struktur mengikuti pola penyimpanan lama di spreadsheet:
-- satu baris unik per kombinasi (date, shift, line, tahapan),
-- diidentifikasi oleh kolom `key` (format: 'YYYY-MM-DD|S1|L1|mixing').
-- =====================================================

CREATE TABLE public.oee_data (
  key               text PRIMARY KEY,
  date              date NOT NULL,
  shift             integer NOT NULL CHECK (shift IN (1, 2, 3)),
  line              text NOT NULL,
  tahapan           text NOT NULL CHECK (tahapan IN ('mixing','filling','steril','visual','kemas')),

  payload           jsonb NOT NULL,          -- seluruh data form (rows, produk, operator, summary, dst)

  "updatedAt"       timestamptz NOT NULL DEFAULT now(),
  "schemaVersion"   integer NOT NULL DEFAULT 1,

  -- Ringkasan OEE (angka, supaya mudah dipakai untuk laporan/filter/agregasi)
  availability      numeric,
  performance       numeric,
  quality           numeric,
  oee               numeric,

  total_downtime    numeric,                 -- menit downtime tidak terencana (unplanned)
  total_good        numeric,
  total_defect      numeric,

  keterangan_masalah text,                   -- gabungan kolom "masalah" semua baris log
  penanggulangan      text,                  -- gabungan kolom "disposisi" semua baris log
  produk_batch         text,                 -- ringkasan produk + nomor WO yang diproses
  inisial_operator     text,                 -- gabungan inisial operator (op1..op6)

  user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- Satu record unik per kombinasi tanggal/shift/line/tahapan (selain key)
  UNIQUE (date, shift, line, tahapan)
);

-- Index untuk filter & query cepat (4 parameter filter: date, line, tahapan, shift)
CREATE INDEX idx_oee_data_date            ON public.oee_data (date);
CREATE INDEX idx_oee_data_line            ON public.oee_data (line);
CREATE INDEX idx_oee_data_tahapan         ON public.oee_data (tahapan);
CREATE INDEX idx_oee_data_shift           ON public.oee_data (shift);
CREATE INDEX idx_oee_data_filter_combo    ON public.oee_data (date, line, tahapan, shift);
CREATE INDEX idx_oee_data_user            ON public.oee_data (user_id);


-- =====================================================
-- 2. AUTO-UPDATE "updatedAt" SETIAP KALI ROW DI-UPDATE
-- =====================================================

CREATE OR REPLACE FUNCTION public.oee_data_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_oee_data_updated_at
  BEFORE UPDATE ON public.oee_data
  FOR EACH ROW EXECUTE FUNCTION public.oee_data_set_updated_at();


-- =====================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- Kebijakan sederhana: setiap user yang SUDAH LOGIN (authenticated)
-- lewat Supabase Auth boleh baca & tulis semua data (cocok untuk tim
-- kecil operator/admin pabrik yang saling berbagi data shift).
-- =====================================================

ALTER TABLE public.oee_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_oee_data"
  ON public.oee_data FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated_insert_oee_data"
  ON public.oee_data FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated_update_oee_data"
  ON public.oee_data FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated_delete_oee_data"
  ON public.oee_data FOR DELETE
  USING (auth.role() = 'authenticated');

-- Catatan: kalau nanti Anda ingin membatasi akses berdasarkan role
-- (admin/supervisor/operator) seperti versi awal, tabel user_profiles
-- dari supabase-setup lama masih bisa dipakai — tinggal ganti kondisi
-- USING/WITH CHECK di atas untuk merujuk ke role user tsb.


-- =====================================================
-- 4. BUAT USER LOGIN PERTAMA (WAJIB)
-- =====================================================
-- Buka Supabase Dashboard → Authentication → Users → Add User → Create new user
--   Email   : email kerja Anda, mis. admin@pabrik.com
--   Password: buat password kuat
--   ✓ centang "Auto Confirm User"
-- Setelah dibuat, akun ini langsung bisa dipakai untuk login di aplikasi.


-- =====================================================
-- 5. VIEW RINGKASAN (opsional, untuk laporan cepat di Table Editor / SQL)
-- =====================================================

CREATE OR REPLACE VIEW public.oee_data_summary_view AS
SELECT
  date, shift, line, tahapan,
  availability, performance, quality, oee,
  total_downtime, total_good, total_defect,
  produk_batch, inisial_operator,
  keterangan_masalah, penanggulangan,
  "updatedAt"
FROM public.oee_data
ORDER BY date DESC, shift, line, tahapan;
