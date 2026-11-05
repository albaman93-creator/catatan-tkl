-- Cek data dobel di Supabase: sheet berbeda (tanggal/shift/line/tahapan) tapi ISI baris identik.
-- Jalankan di SQL Editor. SELECT saja — tidak mengubah data.
select
  md5((payload->'rows')::text)                                  as signature,
  count(*)                                                      as jumlah,
  array_agg(date || ' S' || shift || ' L' || line || ' ' || tahapan
            order by date, shift)                               as lokasi
from oee_data
where jsonb_path_exists(payload, '$.rows[*] ? (@.kode != "")')
group by 1
having count(*) > 1
order by jumlah desc;

-- Setelah memastikan mana yang SALINAN NYASAR (bukan data asli), hapus per slot, contoh:
-- delete from oee_data where date = '2026-11-03' and shift = 1 and line = '1' and tahapan = 'filling';
