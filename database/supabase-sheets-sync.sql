-- =====================================================
-- SINKRON GOOGLE SHEETS — jalankan SEKALI di Supabase → SQL Editor
-- Jalankan SEBELUM deploy aplikasi versi baru.
-- =====================================================

-- 1. Penanda asal data ('app' = log sheet OEE, 'sheet' = Google Sheets)
alter table public.oee_data      add column if not exists source text default 'app';
alter table public.pica_analysis add column if not exists source text default 'app';

-- 2. Waktu ubah dari SERVER (dipakai Apps Script untuk menarik data baru;
--    "updatedAt" dari browser tidak cukup karena antrean offline bisa tiba terlambat)
alter table public.oee_data      add column if not exists modified_at timestamptz default now();
alter table public.pica_analysis add column if not exists modified_at timestamptz default now();

-- Isi awal dari waktu ubah yang sudah ada (agar tiap baris punya nilai berbeda)
update public.oee_data      set modified_at = "updatedAt";
update public.pica_analysis set modified_at = coalesce(updated_at, now());

create or replace function public.touch_modified_at()
returns trigger language plpgsql as $$
begin
  new.modified_at := now();
  return new;
end $$;

drop trigger if exists trg_oee_data_modified on public.oee_data;
create trigger trg_oee_data_modified
  before insert or update on public.oee_data
  for each row execute function public.touch_modified_at();

drop trigger if exists trg_pica_modified on public.pica_analysis;
create trigger trg_pica_modified
  before insert or update on public.pica_analysis
  for each row execute function public.touch_modified_at();

create index if not exists idx_oee_data_modified_at      on public.oee_data (modified_at);
create index if not exists idx_pica_analysis_modified_at on public.pica_analysis (modified_at);

-- 3. Muat ulang cache skema API
notify pgrst, 'reload schema';
