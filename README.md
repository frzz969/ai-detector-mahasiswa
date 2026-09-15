# Faraz Detector AI — AI Detector Mahasiswa

![Vanilla JS](https://img.shields.io/badge/Vanilla_JS-tanpa_framework-yellow)
![No Backend](https://img.shields.io/badge/backend-tidak_ada-blue)
![ID/EN](https://img.shields.io/badge/bahasa-ID_%2F_EN-green)
![Local First](https://img.shields.io/badge/privasi-local_first-lightgrey)

Aplikasi web statis, gratis, tanpa daftar, untuk mengecek **indikasi pola AI** pada tulisan akademik — skripsi, esai, makalah, laporan, jawaban diskusi — dalam Bahasa Indonesia dan Inggris.

Analisis berjalan **lokal di browser** (mesin heuristik + model lokal opsional). Naskah tidak dikirim ke server mana pun.

> **Prinsip utama:** sistem memberi *indikasi yang perlu ditinjau manusia*, bukan vonis. Bahasa hasil selalu "terindikasi / perlu ditinjau / confidence rendah-sedang-tinggi" — tidak pernah "pasti AI", tidak pernah klaim persen probabilitas.

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

| Fitur | Keterangan |
|---|---|
| **Cek tulisan** | Tempel naskah atau upload `.txt` / `.md` / `.pdf` / `.docx`. Hasil tampil bertahap: skor indikasi /100, highlight per kalimat (merah ≥ 70, kuning ≥ 45, hijau), alasan tiap sinyal, statistik kalimat. |
| **Humanizer formal → formal** | Perbaiki kalimat yang ditandai tanpa slang, tanpa mengubah fakta/angka/sitasi/istilah. Dilengkapi guard regresi per kalimat (revert bila skor naik +10), verdict BETTER/EQUIVALENT/WORSE, dan restore teks asli. |
| **Export tepercaya** | PDF / Print / `.txt` hanya dari hasil final yang segar. Begitu teks berubah, hasil dinyatakan basi dan export diblokir sampai cek ulang. |
| **Demo hero** | Contoh tulisan AI vs manusia yang dihitung detector asli — bukan angka tempelan. |
| **Responsif** | Desktop (`style.css`) dan HP/tablet ≤ 1100px (`mobile.css`). |

## Cara pakai

1. Buka halaman, tempel naskah ke editor (atau upload file).
2. Tekan **Cek** — status berjalan bertahap lalu hasil tampil dengan auto-scroll ke verdict.
3. Tinjau kalimat merah/kuning beserta alasannya.
4. Tekan **Humanize** untuk kalimat yang perlu diperbaiki; pertahankan teks asli bila verdict WORSE/EQUIVALENT.
5. Export bila hasil sudah final dan segar.

## Cara kerja mesin

```text
input → pisah referensi → bersihkan sitasi/URL/DOI → deteksi bahasa (ID/EN)
  → konteks akademik (LOW/MEDIUM/HIGH) → skor per kalimat (independen)
  → agregasi dokumen (median + proporsi kalimat AI-like)
  → fusi model lokal opsional → kalibrasi → confidence → indikasi akhir
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
├── js/          # core.js → referensi.js → detector.js → humanizer.js → main.js
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
