-- =====================================================
-- TABEL speed_standar — master Speed Standar (input admin)
-- Jalankan di Supabase Dashboard → SQL Editor
-- =====================================================

CREATE TABLE IF NOT EXISTS public.speed_standar (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line        text NOT NULL DEFAULT '',
  produk      text NOT NULL,
  rate        numeric NOT NULL CHECK (rate >= 0),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Sinkron Google Sheets (sama pola oee_data / pica_analysis)
  source      text DEFAULT 'app',
  modified_at timestamptz DEFAULT now()
);

-- Satu kombinasi Line + Produk (case-insensitive) unik
CREATE UNIQUE INDEX IF NOT EXISTS uq_speed_standar_line_produk
  ON public.speed_standar (lower(trim(line)), lower(trim(produk)));

CREATE INDEX IF NOT EXISTS idx_speed_standar_line
  ON public.speed_standar (line);

CREATE INDEX IF NOT EXISTS idx_speed_standar_modified_at
  ON public.speed_standar (modified_at);

-- updatedAt dari aplikasi
CREATE OR REPLACE FUNCTION public.speed_standar_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_speed_standar_updated_at ON public.speed_standar;
CREATE TRIGGER trg_speed_standar_updated_at
  BEFORE UPDATE ON public.speed_standar
  FOR EACH ROW EXECUTE FUNCTION public.speed_standar_set_updated_at();

-- modified_at dari server (polling Sheets)
DROP TRIGGER IF EXISTS trg_speed_standar_modified ON public.speed_standar;
CREATE TRIGGER trg_speed_standar_modified
  BEFORE INSERT OR UPDATE ON public.speed_standar
  FOR EACH ROW EXECUTE FUNCTION public.touch_modified_at();

ALTER TABLE public.speed_standar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_speed_standar" ON public.speed_standar;
DROP POLICY IF EXISTS "authenticated_insert_speed_standar" ON public.speed_standar;
DROP POLICY IF EXISTS "authenticated_update_speed_standar" ON public.speed_standar;
DROP POLICY IF EXISTS "authenticated_delete_speed_standar" ON public.speed_standar;

CREATE POLICY "authenticated_select_speed_standar"
  ON public.speed_standar FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated_insert_speed_standar"
  ON public.speed_standar FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated_update_speed_standar"
  ON public.speed_standar FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated_delete_speed_standar"
  ON public.speed_standar FOR DELETE
  USING (auth.role() = 'authenticated');

-- Muat ulang cache skema API PostgREST
NOTIFY pgrst, 'reload schema';

COMMENT ON TABLE public.speed_standar IS
  'Master speed standar produk (bag/menit) — diisi manual admin / Google Sheets.';
