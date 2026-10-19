/**
 * Supabase Edge Function: parse-tkl-photo
 *
 * Secret wajib: GEMINI_API_KEY
 * Secret opsional: GEMINI_MODEL (default: gemini-3.5-flash-lite)
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Kamu mengekstrak data dari foto FORM TKL (log sheet produksi pabrik) — tulisan tangan atau cetak.

Kembalikan HANYA JSON valid (tanpa markdown, tanpa penjelasan di luar JSON).

## Struktur form kertas (penting)

### Header atas (abaikan logo & approve/TTD)
- Tanggal → meta.tanggal (YYYY-MM-DD jika bisa, atau teks asli)
- Shift → meta.shift (angka 1/2/3 atau teks S1/S2/S3/P)
- Nama Mesin → meta.nama_mesin
- No. Mesin → meta.no_mesin
- Tahapan proses → meta.tahapan (mixing/filling/steril/visual/kemas jika terbaca)
- Kec. standar PQ (output/menit) → meta.rate_standar (angka rate per menit)
- Kec. Actual → ABAIKAN
- Inisial OP/Packer (kotak inisial, biasanya 3 huruf, max 6) → meta.inisial

### Tabel baris data (setiap baris kegiatan)
| Kolom form | Field JSON |
|---|---|
| Kode keg. | kode (1 digit 1-9) |
| Jumlah TKL | op |
| Dari | mulai (HH:MM) |
| Panggil teknik | panggil (HH:MM) |
| Teknik datang | teknik (HH:MM) |
| Sampai | selesai (HH:MM) |
| Durasi (menit) | durasi (angka menit) |
| Aktivitas kegiatan | kegiatan |
| Masalah/penyebab | masalah |
| Disposisi/tindakan sementara | disposisi |
| Nomor WO | wo |
| Kode produk & batch number | batch |
| Good | good |
| Defect | defect |

## Format output WAJIB
{
  "rows": [
    {
      "kode": "2",
      "op": "2",
      "mulai": "07:00",
      "panggil": "",
      "teknik": "",
      "selesai": "07:35",
      "durasi": "35",
      "durasi_flag": "",
      "kegiatan": "Running produksi",
      "masalah": "",
      "disposisi": "",
      "wo": "WO-123",
      "batch": "PRODUK A / B123",
      "good": "918",
      "defect": "4"
    }
  ],
  "meta": {
    "tanggal": "2026-09-27",
    "shift": "1",
    "nama_mesin": "",
    "no_mesin": "",
    "tahapan": "filling",
    "rate_standar": "12",
    "inisial": "ABC",
    "catatan": ""
  }
}

## Aturan ketat
1. kode: hanya digit 1-9. Tidak jelas → "".
2. Jam (mulai, panggil, teknik, selesai): format HH:MM 24 jam.
   - 7.30 / 730 / 07.30 → "07:30"
   - 1630 → "16:30"
   - Kosong di form → ""
3. durasi: angka menit (string).
4. SINKRONISASI JAM ↔ DURASI (sangat penting):
   - Hitung selisih menit dari mulai → selesai (perhatikan lintas tengah malam jika selesai < mulai).
   - Jika form punya durasi DAN jam, bandingkan:
     - cocok (selisih ≤ 1 menit) → durasi_flag = ""
     - tidak cocok → durasi_flag = "mismatch" dan isi meta.catatan singkat, contoh: "Baris 3: jam 07:00-07:40=40m tapi durasi tertulis 35"
   - Jika hanya jam ada, durasi kosong → isi durasi dari hitungan jam, durasi_flag = "calculated"
   - Jika hanya durasi ada, jam kosong → biarkan, durasi_flag = ""
5. good & defect: angka; utamanya pada kode "2". Kode lain boleh kosong.
6. op = Jumlah TKL (bukan inisial orang).
7. batch = gabungan kode produk + batch number apa adanya dari form.
8. Abaikan baris benar-benar kosong. Urut atas → bawah.
9. Jangan field ekstra. Jangan bungkus dengan backtick/markdown.
10. Gambar bukan form TKL / tidak terbaca → {"rows":[],"meta":{},"error":"Gambar tidak dapat dibaca sebagai form TKL"}`;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stripDataUrl(b64: string): { mime: string; data: string } {
  const m = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/s.exec(b64);
  if (m) return { mime: m[1], data: m[2] };
  return { mime: "image/jpeg", data: b64.replace(/\s/g, "") };
}

function extractJson(text: string): unknown {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("Respons AI bukan JSON valid");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return jsonResponse(
      { error: "GEMINI_API_KEY belum di-set di Edge Function Secrets" },
      500,
    );
  }

  const model = Deno.env.get("GEMINI_MODEL") || "gemini-3.5-flash-lite";

  let payload: { imageBase64?: string; mimeType?: string; hint?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Body harus JSON" }, 400);
  }

  if (!payload.imageBase64 || typeof payload.imageBase64 !== "string") {
    return jsonResponse({ error: "imageBase64 wajib diisi" }, 400);
  }

  if (payload.imageBase64.length > 12_000_000) {
    return jsonResponse(
      { error: "Gambar terlalu besar. Kompres dulu (max ~4MB)." },
      413,
    );
  }

  const { mime, data } = stripDataUrl(payload.imageBase64);
  const mimeType = payload.mimeType || mime;

  const userText = payload.hint
    ? `Ekstrak data form TKL dari gambar ini sesuai mapping kolom yang sudah dijelaskan. Petunjuk tambahan: ${payload.hint}`
    : "Ekstrak SEMUA baris + header form TKL dari gambar ini sesuai mapping kolom yang sudah dijelaskan. Periksa sinkronisasi jam vs durasi.";

  const geminiUrl =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const geminiBody = {
    contents: [
      {
        role: "user",
        parts: [
          { text: SYSTEM_PROMPT + "\n\n" + userText },
          {
            inline_data: {
              mime_type: mimeType,
              data,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  };

  let geminiRes: Response;
  try {
    geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    });
  } catch (err) {
    return jsonResponse(
      { error: "Gagal menghubungi Gemini", detail: String(err) },
      502,
    );
  }

  const geminiJson = await geminiRes.json().catch(() => ({}));

  if (!geminiRes.ok) {
    const msg =
      geminiJson?.error?.message ||
      geminiJson?.message ||
      `Gemini HTTP ${geminiRes.status}`;
    return jsonResponse({ error: msg, detail: geminiJson }, 502);
  }

  const text =
    geminiJson?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text || "")
      .join("") || "";

  if (!text) {
    return jsonResponse(
      { error: "Gemini tidak mengembalikan teks", detail: geminiJson },
      502,
    );
  }

  try {
    const parsed = extractJson(text) as {
      rows?: unknown[];
      meta?: Record<string, string>;
      error?: string;
    };

    const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
    return jsonResponse({
      ok: true,
      rows,
      meta: parsed.meta || {},
      error: parsed.error || null,
      model,
      rowCount: rows.length,
    });
  } catch (err) {
    return jsonResponse(
      {
        error: "Gagal parse JSON dari Gemini",
        detail: String(err),
        raw: text.slice(0, 2000),
      },
      502,
    );
  }
});
