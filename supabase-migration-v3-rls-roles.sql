-- =====================================================
-- MIGRASI v3 — ROLE-BASED RLS UNTUK TKL-OEE (Fima Farma)
-- Jalankan SETELAH supabase-setup.sql (v2) sudah ada.
-- Script ini TIDAK mengubah struktur atau data di tabel
-- oee_data sedikit pun — murni menambah 2 tabel baru
-- (user_profiles, audit_log) dan mengganti KEBIJAKAN AKSES
-- (policy) di oee_data dari "semua user login lihat semua"
-- menjadi berbasis role (operator/supervisor/admin).
--
-- Aman dijalankan ulang (idempotent) — pakai IF NOT EXISTS /
-- IF EXISTS di titik-titik pentingnya.
-- =====================================================


-- =====================================================
-- 1. TABEL user_profiles
-- Satu baris per akun Supabase Auth. role menentukan
-- cakupan akses; assigned_shift dipakai khusus role
-- 'supervisor' untuk membatasi ke shift-nya sendiri.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       text,
  role            text NOT NULL DEFAULT 'operator'
                    CHECK (role IN ('admin','supervisor','operator')),
  assigned_shift  smallint CHECK (assigned_shift IN (1,2,3)),  -- dipakai kalau role = supervisor
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.user_profiles_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.user_profiles_set_updated_at();


-- =====================================================
-- 2. TABEL audit_log
-- Diisi OTOMATIS lewat trigger di bagian 5 — bukan oleh
-- kode JS. Jadi tetap tercatat walau perubahan data terjadi
-- lewat jalur mana pun (Log Sheet, Isi Massal, Admin, dll).
-- =====================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
  id            bigserial PRIMARY KEY,
  user_id       uuid REFERENCES auth.users(id),
  action        text NOT NULL,             -- 'insert' | 'update' | 'delete'
  record_key    text,                      -- oee_data.key yang terdampak
  old_data      jsonb,
  new_data      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_record_key ON public.audit_log (record_key);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log (created_at DESC);


-- =====================================================
-- 3. FUNGSI HELPER (SECURITY DEFINER)
-- Dipakai di dalam policy RLS. SECURITY DEFINER supaya
-- boleh baca user_profiles walau RLS tabel itu sendiri
-- membatasi user biasa — menghindari deadlock/rekursi policy.
-- =====================================================

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_user_shift()
RETURNS smallint
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT assigned_shift FROM public.user_profiles WHERE id = auth.uid();
$$;


-- =====================================================
-- 4. GANTI POLICY oee_data: dari blanket "authenticated"
-- MENJADI role-based. INI SATU-SATUNYA BAGIAN YANG MENYENTUH
-- oee_data — dan yang diubah HANYA policy-nya, bukan datanya.
--
-- Aturan (silakan koreksi kalau tidak sesuai keinginan Anda):
--  - operator   : lihat & ubah HANYA data miliknya sendiri (user_id = dirinya)
--  - supervisor : lihat & ubah data pada shift yang ditugaskan ke dia
--  - admin      : akses penuh, termasuk hapus (operator/supervisor TIDAK bisa hapus)
-- =====================================================

DROP POLICY IF EXISTS "authenticated_select_oee_data" ON public.oee_data;
DROP POLICY IF EXISTS "authenticated_insert_oee_data" ON public.oee_data;
DROP POLICY IF EXISTS "authenticated_update_oee_data" ON public.oee_data;
DROP POLICY IF EXISTS "authenticated_delete_oee_data" ON public.oee_data;

CREATE POLICY "oee_data_select_by_role" ON public.oee_data FOR SELECT
  USING (
    public.current_user_role() = 'admin'
    OR (public.current_user_role() = 'supervisor' AND shift = public.current_user_shift())
    OR (public.current_user_role() = 'operator' AND user_id = auth.uid())
  );

CREATE POLICY "oee_data_insert_own_or_admin" ON public.oee_data FOR INSERT
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR user_id = auth.uid()
  );

CREATE POLICY "oee_data_update_by_role" ON public.oee_data FOR UPDATE
  USING (
    public.current_user_role() = 'admin'
    OR (public.current_user_role() = 'supervisor' AND shift = public.current_user_shift())
    OR (public.current_user_role() = 'operator' AND user_id = auth.uid())
  );

CREATE POLICY "oee_data_delete_admin_only" ON public.oee_data FOR DELETE
  USING (public.current_user_role() = 'admin');


-- =====================================================
-- 5. TRIGGER AUDIT LOG OTOMATIS DI oee_data
-- =====================================================

CREATE OR REPLACE FUNCTION public.oee_data_audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.audit_log(user_id, action, record_key, old_data, new_data)
    VALUES (auth.uid(), 'insert', NEW.key, NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO public.audit_log(user_id, action, record_key, old_data, new_data)
    VALUES (auth.uid(), 'update', NEW.key, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO public.audit_log(user_id, action, record_key, old_data, new_data)
    VALUES (auth.uid(), 'delete', OLD.key, to_jsonb(OLD), NULL);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_oee_data_audit ON public.oee_data;
CREATE TRIGGER trg_oee_data_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.oee_data
  FOR EACH ROW EXECUTE FUNCTION public.oee_data_audit_trigger();


-- =====================================================
-- 6. RLS UNTUK user_profiles & audit_log
-- =====================================================

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_profiles_select" ON public.user_profiles FOR SELECT
  USING (id = auth.uid() OR public.current_user_role() = 'admin');

CREATE POLICY "user_profiles_insert_admin" ON public.user_profiles FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "user_profiles_update_admin" ON public.user_profiles FOR UPDATE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "user_profiles_delete_admin" ON public.user_profiles FOR DELETE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "audit_log_select_admin_only" ON public.audit_log FOR SELECT
  USING (public.current_user_role() = 'admin');
-- Tidak ada policy INSERT/UPDATE/DELETE untuk audit_log dari sisi client —
-- satu-satunya jalan masuk adalah trigger di atas (SECURITY DEFINER),
-- supaya log tidak bisa diubah/dihapus lewat aplikasi oleh siapa pun.


-- =====================================================
-- 7. AUTO-PROVISION user_profiles UNTUK USER BARU
-- Setiap kali ada akun Supabase Auth baru dibuat, otomatis
-- dapat baris user_profiles dengan role default 'operator'.
-- Admin tinggal naikkan role-nya lewat halaman Admin nanti.
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), 'operator')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_new_auth_user ON auth.users;
CREATE TRIGGER trg_handle_new_auth_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Backfill untuk akun yang SUDAH ADA sebelum migrasi ini (kalau ada) —
-- semua dapat role default 'operator' dulu, aman untuk di-upgrade manual.
INSERT INTO public.user_profiles (id, full_name, role)
SELECT id, COALESCE(raw_user_meta_data->>'full_name', email), 'operator'
FROM auth.users
ON CONFLICT (id) DO NOTHING;


-- =====================================================
-- 8. WAJIB DIJALANKAN MANUAL SEKALI: SET ADMIN PERTAMA
-- Fungsi current_user_role() butuh MINIMAL satu admin supaya
-- halaman Admin bisa dipakai untuk mengatur user lainnya.
-- Ganti email di bawah dengan akun Anda, lalu jalankan baris
-- ini sendiri di SQL Editor:
-- =====================================================
-- UPDATE public.user_profiles SET role = 'admin'
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@fimafarma.co.id');

-- Kalau mau langsung set assigned_shift untuk supervisor:
-- UPDATE public.user_profiles SET role = 'supervisor', assigned_shift = 2
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'supervisor2@fimafarma.co.id');
