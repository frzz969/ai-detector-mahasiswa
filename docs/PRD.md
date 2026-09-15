# PRD — Faraz Detector AI (AI Detector Mahasiswa)

**Versi:** 1.0 — 15 Sep 2026
**Status:** Draft untuk implementasi
**Bahasa:** Indonesia
**Sumber acuan kode:** `js/core.js`, `js/detector.js`, `js/referensi.js`, `js/humanizer.js`, `js/main.js`, `index.html`, `style.css`, `mobile.css`
**Sumber acuan aturan (wajib audit):** `AGENTS.md`, `referensi/detector-rules.md`, `referensi/humanizer-rules.md`, `referensi/validation-rules.md`

---

## 1. Ringkasan Eksekutif

Faraz Detector AI adalah aplikasi web statis, gratis, tanpa daftar, untuk membantu mahasiswa mengecek indikasi teks AI pada naskah akademik (skripsi, esai, makalah, diskusi) dalam Bahasa Indonesia dan Inggris.

Value proposition:
- Privat: analisis berjalan lokal di browser (heuristik + model lokal opsional), tanpa upload ke server.
- Actionable: skor + highlight per kalimat (merah/kuning/hijau) + alasan + statistik.
- Jujur: bahasa hanya "terindikasi / perlu ditinjau / confidence rendah-sedang-tinggi", humanizer formal→formal dengan regresi per kalimat dan verdict BETTER/EQUIVALENT/WORSE.

Non-goal PRD ini: mengubah layout/visual (tugas mesin = `js/*.js`; `style.css` desktop dan `mobile.css` ≤1100px hanya disentuh bila user eksplisit minta).

## 2. Masalah & Latar Belakang

1. Mahasiswa butuh cek cepat sebelum kumpul tugas, tanpa daftar dan tanpa kuota.
2. Tool generik bias Bahasa Inggris, overflag teks akademik formal Indonesia yang sah.
3. Humanizer generik merusak fakta/angka/sitasi dan mengubah gaya menjadi slang.

Kebutuhan turunan: deteksi ID/EN yang kalem untuk teks akademik, humanizer yang mempertahankan fakta dan gaya formal, export yang hanya dari hasil final segar.

## 3. Target Pengguna

- **Primer:** Mahasiswa (skripsi, esai, makalah, jawaban diskusi).
- **Sekunder:** Dosen/asisten yang meninjau ulang naskah (sebagai sinyal awal, bukan vonis).
- **Bukan target:** Pemeriksa forensik / penegakan integritas otomatis.

Persona singkat: menempel naskah → tekan cek → perbaiki yang merah → humanize yang perlu → export.

## 4. Tujuan & Metrik Keberhasilan

| Tujuan | Metrik | Target |
|---|---|---|
| Cek cepat dan berguna | Waktu cek → hasil tampil | < 5 detik untuk naskah ≤30k karakter (tanpa model) |
| Tidak overflag akademik | Teks formal manusia tidak terindikasi tinggi | Skor rendah + highlight hijau dominan pada harness uji |
| Humanize tidak regresi | Skor humanize vs asli | Tidak naik ≥+10 per kalimat (auto-revert), verdict jujur |
| Export tepercaya | Export basi terblokir | 100% teks berubah → status basi → blokir sampai cek ulang |
| Tanpa klaim menyesatkan | Bahasa user-facing | Nol kemunculan `100% AI / pasti AI / dijamin / bebas AI / khas AI` |

## 5. Scope

### In-scope (kondisi saat ini, dipertahankan)
- Input tempel + counter kata, upload `.txt/.md/.pdf/.docx` (pdf.js/mammoth, chip `fileChip`, maks file 8MB).
- Toggle `autoRef` (deteksi referensi otomatis) dan `useLocal` (model lokal opsional).
- Tombol: `btnCheck`, `btnClear`, `btnSampleID/EN`, `btnHumanize`, `btnApplyHumanize`, `btnCopyHumanize`, `btnPrint`, `btnDownload`, `Reset`.
- Status bertahap: Memindai → 10 pola → konteks → render + auto-scroll ke verdict.
- Hasil: `aiPct/humanPct/barFill/mixLbl/verdict/highlight/reasons/stats/statSent/statReview/statSafe`.
- Highlight: merah ≥70, kuning ≥45, hijau di bawahnya.
- Humanizer box: `humanizeOut/humanizeBox/humanizeStatus` + restore asli.
- Demo hero: tab AI/Human (`demoAi/demoHuman/demoPct/demoLbl/demoFill/demoText/demoOpen`) — skor selalu dihitung ulang via heuristik asli, bukan dummy.
- Contoh ID/EN, `refInfo`, `printArea` untuk export PDF/Print + `.txt`.

### Out-of-scope
- Backend, akun, penyimpanan cloud, API berbayar.
- Vonis akademik otomatis ("pasti AI", sanksi).
- Iterasi humanize otomatis tanpa batas.
- Redesign visual tanpa permintaan eksplisit.

## 6. Alur Pengguna

1. Buka halaman → hero + editor (`#editor`) + hasil (`#hasil`).
2. Tempel naskah atau upload file → `wordCount` update, `fileChip` tampil.
3. Tekan Cek → `doCheck()` jalan bertahap → `render()` tampilkan verdict + highlight + reasons + stats.
4. Tinjau merah/kuning → tekan Humanize → tinjau per kalimat → Apply/Copy bila BETTER, bila WORSE/EQUIVALENT pertahankan teks asli.
5. Export PDF/Print/`.txt` hanya bila hasil final segar (tidak basi). Teks berubah → `markStale()` → `refreshRail()` blokir sampai rescan.
6. CTA `#mulai`: tempel → cek → perbaiki yang merah.

## 7. Persyaratan Fungsional

| ID | Fitur | Perilaku wajib |
|---|---|---|
| F-01 | Input & batas | `MIN_WORDS 20`, `MAX_CHARS 30k`, `MAX_FILE 8MB`, `MAX_PDF 30` halaman, `MAX_CHUNKS 6`. Teks pendek di-cap (lihat F-10). |
| F-02 | Upload | `.txt/.md/.pdf/.docx` via pdf.js/mammoth. PDF scan tak terbaca → pesan jelas. `.doc` lama ditolak. Chip `fileName/fileMeta/fileClear`. |
| F-03 | Toggle | `autoRef`: pisahkan referensi via `splitReferences()`. `useLocal`: aktifkan model lokal bila tersedia/online. |
| F-04 | Cek bertahap | Status: Memindai → 10 pola → konteks → render. Auto-scroll ke verdict. Demo hero ≠ produksi. |
| F-05 | Skor & verdict | Skor 15–98 + prior +22. Bahasa hanya indikasi + confidence rendah/sedang/tinggi. Dilarang klaim pasti/100%/dijamin/bebas. |
| F-06 | Highlight | Per kalimat: merah ≥70, kuning ≥45, hijau sisanya. Klik/hover menjelaskan sinyal bila tersedia. |
| F-07 | Reasons & stats | `reasons` daftar sinyal terpicu, `stats` + `statSent/statReview/statSafe`. Tanpa data karangan. |
| F-08 | Humanizer | Formal→formal, tanpa slang (`bisa/buat/banget`). Pemicu tunggal `dapat/merupakan/terdapat/dengan demikian` tidak diubah. Fakta/angka/sitasi/istilah tidak diubah. |
| F-09 | Regresi humanize | Skip kalimat baik skor <45. Pecah kalimat >26 kata, gabung <10 kata. Guard `idealRate>75%` maks 8x. Regresi per kalimat: revert bila +10. Verdict BETTER (Δ≥3) / EQUIVALENT / WORSE + restore asli. |
| F-10 | Short-text & single-signal | <80 kata tambah damp +6; <50 kata / <3 kalimat cap 45. Sinyal tunggal (`posSig≤1`) → damp +10, confidence rendah. |
| F-11 | Akademik | `cleanAcademic()` buang `[1]`/sitasi/URL/DOI sebelum skor. Damp dikumpulkan di-cap 14. `rhythmPos` diskon 50% bila akademik tanpa template. Formal akademik tidak overflag. |
| F-12 | Referensi | `splitReferences()`: pindai 80 baris akhir, syarat main ≥50 kata. Referensi tidak ikut menaikkan skor. |
| F-13 | Model lokal | `localScore()` via Xenova `roberta-base-openai-detector` (~130MB, lazy import). Ensemble: EN 50%, ID 25% × coverage. Offline/CDN gagal → heuristik saja + status jelas. |
| F-14 | Export | Hanya dari hasil final segar (rescan + regression + quality gate). `resultStale` → blokir Print/Download sampai cek ulang. |
| F-15 | Demo & contoh | Demo AI terindikasi, demo human rendah, teks pendek di-cap, humanize tidak regresi (harness `tests/faraztest.js`: load `js/core→js/referensi→js/detector→js/humanizer→js/main` dengan stub DOM). |
| F-16 | CTA `#mulai` | Responsif (aturan di `mobile.css` saja). Stack vertikal, gambar `max 38–42vw`, tombol full-width di ≤600px, tanpa overflow-x di 360/390/430px. |

## 8. Persyaratan Non-Fungsional

- **Performa:** Heuristik sinkron ringan; model lazy agar first-load tetap cepat.
- **Privasi:** Lokal-first; tanpa kirim naskah ke server untuk heuristik. Model via CDN hanya bila toggle aktif.
- **Responsif:** Desktop `style.css` (biru langit + putih, full-width); HP/tablet ≤1100px `mobile.css`. Jangan campur edit keduanya.
- **Aksesibilitas:** Status terbaca screen-reader, kontras tombol, fokus keyboard pada editor dan hasil.
- **Kompatibilitas:** Browser modern + `pdf.js`/`mammoth` via CDN dengan fallback pesan.
- **Kualitas kode:** `node --check` semua `*.js` yang diubah; `grep` klaim terlarang pada output user-facing (komentar internal dikecualikan).

## 9. Arsitektur Singkat (Peta Kode)

- `js/core.js` — DOM refs, state (`lastResult/resultStale/localPipe`), `AI_PHRASES`, konstanta batas.
- `js/detector.js` — `heuristic()` (10+ sinyal + dampening + caps), `splitReferences()`, `cleanAcademic()`, model lokal opsional.
- `js/referensi.js` — data `REF_*` (connectors/hedge/enum/meth/personal/fluffy/voice/sent) + `REF_HUMANIZE_EXTRA` (formal) + `REF_RULE_DOCS` (provenance) + `REF_PAPER Cahyana dkk 2025`.
- `js/humanizer.js` — `humanizeSentence()` + `humanizeText()` + handler tombol + verdict + restore.
- `js/main.js` — `render()` (bahasa indikasi), `doCheck()` (status + rescan), stale-guard export, demo hero.
- `index.html` — struktur + semua ID fungsional (jangan rename/hapus).
- `style.css` / `mobile.css` — pemisahan desktop/mobile tegas.

Urutan load: `js/core → js/referensi → js/detector → js/humanizer → js/main` (defer).

## 10. Sinyal Deteksi (Ringkas, dari `detector-rules.md`)

Burst ritme, TTR, n-gram diversity, frasa generik, konektor, pola 12–28 kata, personal voice, lively (`?!`/kutip), data konkret, paragraf CV, opener berulang, repetisi ide Jaccard >0.55, fluffy/voice, hedge manfaat-generik, enumerasi. Prior +22, skor akhir 15–98.

## 11. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Akurasi <80% (lihat FAQ) | Kepercayaan turun | Bahasa indikasi + confidence, bukan vonis; tampilkan reasons |
| False positive formal/pendek | Mahasiswa benar terindikasi | Dampening akademik, short-text cap, single-signal cap |
| Bias EN model | ID over/underflag | Bobot ID hanya 25% × coverage; heuristik tetap utama untuk ID |
| CDN/model offline | Fitur lokal mati | Fallback heuristik + pesan jelas |
| PDF scan / `.doc` lama | Upload gagal | Pesan spesifik, tolak dini, batas 8MB/30 halaman |
| Humanize merusak makna | Nilai akademik rusak | Larang ubah fakta/angka/sitasi; revert +10; WORSE→asli |

## 12. Roadmap Usulan

- **P1:** Uji harness `tests/faraztest.js` permanen (demo AI terindikasi, demo human rendah, cap teks pendek, formal tidak overflag, humanize tidak regresi).
- **P2:** Penjelasan per-highlight ("mengapa kalimat ini merah") + statistik Dalang.
- **P3:** Cache model lokal (IndexedDB) + indikator progres unduh ~130MB.
- **P4:** Mode batch (multi-file) dengan ringkasan campuran 38–62 untuk human+AI.
- **Non-goal:** Skor 100%/vonis pasti — tetap dilarang.

## 13. Kriteria Penerimaan (Acceptance)

1. `node --check` lolos untuk semua `*.js` yang diubah.
2. Harness temp: demo AI terindikasi, demo human rendah, teks pendek di-cap 45, formal akademik tidak overflag, humanize tidak regresi.
3. `grep` output user-facing bersih dari `100% AI|pasti AI|dijamin|bebas AI|khas AI`.
4. Export basi terblokir sampai rescan.
5. CTA `#mulai` tanpa horizontal scroll di 360/390/430px.
6. Setiap analisis menyebut aturan yang dipakai (audit balik ke `referensi/*`).

---

*Dokumen ini adalah PRD produk, bukan vonis akademik. Semua skor adalah indikasi yang perlu ditinjau manusia.*
