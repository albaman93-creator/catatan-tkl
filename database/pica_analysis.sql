-- PICA Analysis (Why-Why) — run di Supabase SQL Editor
create table if not exists public.pica_analysis (
  id           uuid primary key default gen_random_uuid(),
  rec_date     date not null,
  shift        int  not null,
  line         text not null,
  tahapan      text not null,
  row_key      text not null,             -- kode|mulai|selesai baris unplanned
  produk       text,
  batch        text,
  problem      text,
  durasi_min   numeric,
  why1         text default '',
  why2         text default '',
  why3         text default '',
  corrective   text default '',
  preventive   text default '',
  pic          text default '',
  status       text default 'Open',   -- Open | On Progress | Closed
  updated_at   timestamptz default now(),
  unique (rec_date, shift, line, tahapan, row_key)
);

alter table public.pica_analysis enable row level security;

create policy "pica read"   on public.pica_analysis for select using (true);
create policy "pica insert" on public.pica_analysis for insert with check (true);
create policy "pica update" on public.pica_analysis for update using (true) with check (true);
create policy "pica delete" on public.pica_analysis for delete using (true);
