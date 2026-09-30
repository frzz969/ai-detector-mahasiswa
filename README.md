# Faraz Detector AI — AI Detector Mahasiswa

![Vanilla JS](https://img.shields.io/badge/Vanilla_JS-tanpa_framework-yellow)
![No Backend](https://img.shields.io/badge/backend-tidak_ada-blue)
![ID/EN](https://img.shields.io/badge/bahasa-ID_%2F_EN-green)
![Local First](https://img.shields.io/badge/privasi-local_first-lightgrey)

Aplikasi web statis, gratis, tanpa daftar, untuk mengecek **indikasi pola AI** pada tulisan akademik — skripsi, esai, makalah, laporan, jawaban diskusi — dalam Bahasa Indonesia dan Inggris.

Analisis berjalan **lokal di browser** (mesin heuristik `js/detector.js` + model lokal opsional).
Mode hybrid (`js/ai/*` + `api/*`) tersedia sebagai jalur tambahan: bila backend Vercel dideploy
dengan key, `js/main.js` `doCheck()` menggabungkan bukti lokal + AI secara evidence-based
(`js/ai/combine.js`) dengan gerbang regresi (`js/ai/validate.js`); bila AI gagal/tidak tersedia,
dipakai hasil lokal secara jujur (graceful degradation). **Catatan: `api/*` saat ini skeleton
belum deploy** — key hanya via env, lihat `.env.example`; tanpa deploy + key, aplikasi tetap jalan penuh secara lokal.

> **Prinsip utama:** sistem memberi *indikasi yang perlu ditinjau manusia*, bukan vonis. Bahasa hasil selalu "terindikasi / perlu ditinjau / confidence rendah-sedang-tinggi" — tidak pernah vonis absolut, tidak pernah klaim persen probabilitas.

## Daftar isi

- [Fitur](#fitur)
- [Cara pakai](#cara-pakai)
- [Cara kerja mesin](#cara-kerja-mesin)
- [Hasil evaluasi](#hasil-evaluasi)
- [Struktur folder](#struktur-folder)
- [Menjalankan & menguji](#menjalankan--menguji)
- [Aturan dan batasan](#aturan-dan-batasan)
- [Roadmap](#roadmap)
- [Kontribusi](#kontribusi)

## Fitur

| Fitur | Keterangan (padanan kode) |
|---|---|
| **Detect (skor indikasi + highlight klik per kalimat)** | Tempel naskah atau upload `.txt` / `.md` / `.pdf` / `.docx` (`js/main.js` upload + `fileChip`). Tekan **Cek sekarang** (`#btnCheck`): alur hybrid `doCheck()` — validate → preprocess `js/ai/preprocess.js` (`FarazPre`: hash/v + canonicalText) → heuristik lokal `js/detector.js` + model lokal opsional → AI `/api/analyze` via `js/ai/client.js` (`FarazAIClient`, gagal → fallback lokal jujur + status `js/ai/status.js`) → gabung evidence-based `js/ai/combine.js` (`FarazCombine`) → gerbang regresi `js/ai/validate.js` (`FarazValidate`) → `render()`. Hasil tampil bertahap: skor indikasi /100, highlight per kalimat (merah ≥ 70, kuning ≥ 45, hijau), alasan tiap sinyal, statistik kalimat. Tiap highlight (`#highlight mark`) dapat diklik/fokus keyboard → penjelasan kalimat (nomor + skor + pemicu utama + 1 saran formal) di `#sentExplain` tepat di bawah highlight (`js/main.js` `sentTriggers()`/`sentExplainText()`/`showSentExplain()`). Status jujur per tahap: Menyiapkan → lokal → AI → gabung → validasi. |
| **Humanizer formal → formal** | Perbaiki kalimat yang ditandai tanpa slang, tanpa mengubah fakta/angka/sitasi/istilah (`js/humanizer.js`). Dilengkapi guard regresi per kalimat (revert bila skor naik +10), verdict BETTER/EQUIVALENT/WORSE, dan restore teks asli. |
| **Summarize (extractive, kalimat asli verbatim)** | Tombol **Summarize** (`#btnSummarize`, rail Natural) → `js/ai/summarizer.js` (`FarazSummarize.summarize()`, lokal tanpa AI key): memilih kalimat ASLI verbatim (skor frekuensi kata isi + bonus posisi/data/panjang, maks 5, teks ≤3 kalimat ditampilkan utuh), tanpa ubah fakta dan tanpa simpulan baru. Output tampil di `#aiToolsOut`. |
| **Explain / penjabaran teks (deskriptif struktur, bukan vonis)** | Tombol **Explain** (`#btnExplain`, rail Natural) → `js/ai/explainer.js` (`FarazExplain.explain()`, lokal tanpa AI key): deskripsi statistik teramati (paragraf, kalimat, penanda bagian, enumerasi, penghubung, angka/sitasi, suara penulis), bukan vonis AI. Output tampil di `#aiToolsOut`. |
| **Copy di judul hasil** | Tombol **Copy** (`#btnCopyHumanize`) berada di `panel-head #hasil` (`index.html`), aktif bila ada keluaran humanizer untuk disalin. |
| **Export tepercaya** | PDF / Print / `.txt` (`#btnPrint`/`#btnDownload`) hanya dari hasil final yang segar (`js/main.js` `refreshRail()` + `markStale()`). Begitu teks berubah, hasil dinyatakan basi dan export diblokir sampai cek ulang. |
| **Upload multi-format** | `.txt/.md/.pdf/.docx` via pdf.js/mammoth, chip `fileChip` (`#fileName/#fileMeta/#fileClear`), maks file 8MB. |
| **Demo hero** | Contoh tulisan AI vs manusia (`#demoAi`/`#demoHuman`/`#demoOpen`) yang dihitung detector asli (`js/main.js` `runDemo()`) — bukan angka tempelan. Contoh ID/EN sekali-klik (`#btnSampleID`/`#btnSampleEN`, class `ghost small`). |
| **Responsif** | Desktop (`style.css`) dan HP/tablet ≤ 1100px (`mobile.css`). |

## Cara pakai

1. Buka halaman, tempel naskah ke editor (`#inputText`, `#editor`) atau upload file.
2. Tekan **Cek** (`#btnCheck`) — status berjalan bertahap (Menyiapkan → lokal → AI → gabung → validasi) lalu hasil tampil (`#hasil`) dengan auto-scroll ke verdict (`#verdict`).
3. Tinjau kalimat merah/kuning beserta alasannya; klik salah satu highlight untuk penjelasan kalimat di `#sentExplain` (legenda warna ada di bawah highlight: hijau aman · kuning cek · merah tulis ulang; info ringkas merah/hijau ada di score-hero `#aiPct/#humanPct/#mixLbl`).
4. Tekan **Humanize** (`#btnHumanize`) untuk kalimat yang perlu diperbaiki; pertahankan teks asli bila verdict WORSE/EQUIVALENT. Tombol **Copy** (`#btnCopyHumanize` di judul panel `#hasil`) menyalin keluaran bila ada.
5. Opsional: **Summarize** (`#btnSummarize`) untuk ringkasan ekstraktif (kalimat asli verbatim) atau **Explain** (`#btnExplain`) untuk penjabaran struktur teks — keduanya tampil di `#aiToolsOut`, bukan vonis.
6. Export (`#btnPrint`/`#btnDownload`) bila hasil sudah final dan segar.

## Cara kerja mesin

```text
input → validate → preprocess js/ai/preprocess.js (hash/v + canonicalText)
  → pisah referensi → bersihkan sitasi/URL/DOI → deteksi bahasa (ID/EN)
  → konteks akademik (LOW/MEDIUM/HIGH) → skor per kalimat (independen)
  → agregasi dokumen (median + proporsi kalimat AI-like)
  → fusi model lokal opsional → AI /api/analyze via js/ai/client.js
    (gagal → fallback lokal jujur + pesan js/ai/status.js)
  → combine evidence-based js/ai/combine.js (bobot confidence×coverage×bahasa,
    cap supremacy, agreement gate)
  → gerbang regresi js/ai/validate.js → kalibrasi → confidence → indikasi akhir
  → render() js/main.js (satu-satunya penulis skor)
```

Hal-hal yang dijaga mesin:

- **Anti false-positive akademik** — frasa akademik wajar tidak menaikkan skor; dampening hanya menyentuh sinyal lemah, bukti struktural kuat tetap berpengaruh.
- **Single-signal protection** — satu sinyal lemah tidak bisa menghasilkan skor ekstrem; confidence ikut turun.
- **Teks pendek** — di bawah 50 kata / 3 kalimat skor di-cap dan confidence rendah (jujur mengakui data kurang).
- **Seimbang dua arah** — sinyal *human-like* (pengalaman pribadi, data konkret, variasi natural) ikut menurunkan skor, bukan hanya sinyal AI yang dihitung.
- **Model bahasa Inggris tidak mendominasi teks Indonesia** — bobot model mengecil otomatis bila cakupan rendah; bila model offline, mode heuristik tetap jalan penuh.

Detail algoritma dan ambang: `referensi/detector-rules.md`, `referensi/humanizer-rules.md`, `referensi/validation-rules.md`.

## Hasil evaluasi

Harness `tests/faraztest.js` + 37 teks berlabel (`dataset/`, split train/validation/test — test bersifat held-out dan dilarang untuk tuning):

| Split | n | Accuracy | Precision | Recall | F1 | FPR |
|---|---|---|---|---|---|---|
| train | 12 | 91.7% | 100% | 80% | 88.9% | 0% |
| validation | 9 | 100% | 100% | 100% | 100% | 0% |
| test (frozen) | 10 | 70% | 100% | 25% | 40% | 0% |
| **all** | 31 | 87.1% | 100% | 69.2% | 81.8% | 0% |

Manusia 18/18 benar di semua split (termasuk akademik formal dan teks 200+ kata). Sisa FN adalah kasus yang memang didokumentasikan sebagai keterbatasan: trio test-AI 44/46/48 tepat di bawah ambang, teks rewrite, dan teks pendek yang di-cap.

## Struktur folder

```text
├── index.html, style.css, mobile.css   # halaman + styling (desktop / mobile)
│   # ID aktual: btnCheck, btnSummarize, btnExplain (rail Natural, output #aiToolsOut),
│   # btnCopyHumanize di panel-head #hasil, highlight #highlight + #sentExplain,
│   # btnSampleID/btnSampleEN (ghost small), demo demoAi/demoHuman/demoOpen
├── js/          # core.js → detector.js → referensi.js → humanizer.js → js/ai/* → main.js
│   ├── ai/preprocess.js  # FarazPre (hash/v + canonicalText)
│   ├── ai/client.js      # FarazAIClient (/api/analyze, timeout 15 dtk, echo hash/v)
│   ├── ai/combine.js     # FarazCombine (evidence-based, bukan average buta)
│   ├── ai/validate.js    # FarazValidate (10 checks + gerbang regresi)
│   ├── ai/status.js      # FarazStatus (status jujur per tahap hybrid)
│   ├── ai/summarizer.js  # FarazSummarize (extractive, kalimat asli verbatim)
│   └── ai/explainer.js   # FarazExplain (deskriptif struktur, bukan vonis)
├── api/         # skeleton Vercel gateway, BELUM deploy (key hanya via env, lihat `.env.example`)
│   ├── config.js / analyze.js / humanize.js / summarize.js / explain.js
│   # key hanya via env (GEMINI_API_KEY/GROQ_API_KEY); tanpa deploy+key,
│   # frontend tetap jalan penuh secara lokal dengan fallback jujur.
├── tests/       # faraztest.js (harness) + dataset.js (registry/loader)
├── dataset/     # 37 teks evaluasi: train/ validation/ test
├── referensi/   # aturan mesin + referensi 1–8
├── docs/        # PRD.md, architecture.md
├── img/mascot|icons/  # aset gambar
└── .slim/deepwork/    # catatan kerja internal (git-local, bukan dependency app)
```

## Menjalankan & menguji

Tanpa build step — buka `index.html` langsung, atau via server lokal:

```bash
npx serve .
```

```bash
node --check js/detector.js              # syntax check tiap file js/ yang diubah
node tests/faraztest.js --split=train
node tests/faraztest.js --split=validation
node tests/faraztest.js --split=test     # held-out: hanya dilaporkan
node tests/faraztest.js --split=all
```

## Aturan dan batasan

- Deteksi ≠ bukti; zona abu-abu dilaporkan sebagai "perlu ditinjau" dengan confidence rendah/sedang.
- Teks AI yang sudah diedit manusia diperlakukan sebagai kasus ambigu, bukan dipaksa salah satu sisi.
- Daftar pustaka, sitasi, URL, dan DOI tidak ikut menaikkan skor.
- Demo hero ≠ analisis produksi; setiap hasil selalu dihitung ulang dari teks.

## Roadmap

- Penjelasan per-highlight yang lebih kaya ("mengapa kalimat ini merah").
- Cache model lokal (IndexedDB) + indikator progres unduh.
- Mode batch multi-file dengan ringkasan campuran.
- Yang tetap dilarang: skor 100%, vonis pasti, backend pengirim naskah.

## Kontribusi

Baca `AGENTS.md` dulu (wajib): peta kode, batasan bahasa, dan verifikasi tiap ubah `js/` (`node --check` + harness + grep klaim terlarang). Ubah salah satu dari `style.css` / `mobile.css`, jangan keduanya — dan jangan ubah visual tanpa permintaan eksplisit.
