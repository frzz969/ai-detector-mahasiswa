# Laporan Final — Faraz Detector AI (Audit, Riset, Perbaikan, Validasi)

Tanggal: 10 September 2026 · Lingkup: `E:\folder projek vs code\ai-detector-mahasiswa`
Prinsip yang dijaga: skor jujur (bukan vonis), false-positive paling dihindari, UI/desain TIDAK diubah, tanpa dependensi baru, tanpa salin kode ZeroGPT.

## 1. Arsitektur Sebelumnya
Aplikasi frontend murni (HTML/CSS/JS, tanpa backend, tanpa build step). Alur: input → `splitReferences()` (potong daftar pustaka) → `cleanAcademic()` → `heuristic()` (10 sinyal gaya, offline) → opsional model lokal `roberta-base-openai-detector` via CDN → ensemble 50/50 di `render()` → hasil (persen AI, label 4 pita, highlight per kalimat, alasan). Humanizer terpisah dengan aturan formal→formal dan regresi per kalimat. Semua hasil wajib dihitung ulang (invariant: tidak ada skor tempelan; teks berubah → hasil basi → export diblokir).

## 2. Masalah yang Ditemukan pada Audit
1. **False positive pada tulisan akademik/formal manusia** (violasi detector-rules §3): `AI_ID` memasukkan frasa akademik normal ("penelitian ini bertujuan", "selain itu", "dengan demikian", "oleh karena itu") → skor naik padahal bahasa akademik wajar. Terbukti: sample formal akademik skor 53 (masuk zona "campuran").
2. **Teks pendek (<30 kata) AI tak terdeteksi** (22–24), karena sebagian besar sinyal butuh teks ≥80 kata dan punishment pada <80 kata memangkas bukti yang ada.
3. **Ritme datar tunggal (burst) terlalu dominan**: satu metrik bisa menaikkan ±28 poin tanpa konfirmasi sinyal lain → sumber FP.
4. **Deteksi teks campuran lemah**: skor per kalimat ber-anchor pada skor dokumen, bukan mandiri → kalimat AI di tengah tulisan manusia ikut terlihat netral (mixed sample 26/26, tak terindikasi).
5. **Confidence tidak ada**: skor dipajang tanpa sinyal seberapa meyakinkan (pendek/formal/zona abu-abu).
6. **Ensemble 50/50 buta bahasa**: model dilatih teks EN; teks ID ditimbang sama → potensi bias model.
7. **Metrik satu baris saja** (kata, TTR, burst) — tak ada info struktur kalimat/paragraf/bahasa.

## 3. Penelitian (prioritas: tidak menyalin kode ZeroGPT)
- **KNOWN (fakta publik):** ZeroGPT/DeepAnalyze memakai gabungan perplexity + burstiness + sinyal leksikal/semantik dengan korpus milik sendiri, mampu highlight per kalimat; akurasi "99,9%" yang diklaim tidak didukung publikasi valid (kita TIDAK meniru klaim itu). Stanford HAI: detektor umum salah-positif 61,22% pada esai TOEFL (penulis non-native/formal memakai bahasa seragam berperplexity rendah). Obvious AI detectors overflag teks <100 kata; cluster salah-baca puncak pada 14–34 kata. Agregasi mean/sum naif tidak presisi — gunakan median/percentile + proporsi kalimat AI-like. Confidence layak = panjang teks + perselisihan sinyal + zona batas.
- **INFERENCE (dari riset + dataset sendiri):** paragraf tunggal panjang lebih sering AI (bias 1-paragraf); pengulangan kata (bigram/trigram) dan variasi panjang kata (word-length CV) menambah dimensi burstiness; frasa "manfaat generik" ("dapat meningkatkan", "memberikan manfaat", "berperan penting") dengan objek kabur = bahasa template; enumerasi "Pertama… Kedua…" = struktur daftar template; konektor akademik yang dipakai berulang TANPA data/metode/sitasi = scaffolding generatif (akademik asli disertai isi).
- **UNKNOWN:** hukum skor internal ZeroGPT; distribusi skor corpus GPT asli Indonesia; batas keputusan optimal di luar dataset 18 teks ini.

## 4. Perubahan yang Dilakukan (rujukan aturan)
- **js/core.js** (detector-rules §3): frasa akademik normal dipindah ke daftar baru `ACAD_NEUTRAL` ("penelitian ini bertujuan", "artikel ini membahas", "dengan demikian", "oleh karena itu", "selain itu", "dapat disimpulkan", "berdasarkan hasil penelitian") sehingga tidak menaikkan skor AI; "perlu diingat" dikembalikan ke `AI_ID` (frasa penasihat generik, bukan daftar §3). Ditambah daftar function-word ID/EN untuk deteksi bahasa.
- **js/detector.js — `heuristic()` dirombak**:
  - Paragraf dipertahankan sebelum di-flatten (jumlah + CV panjang paragraf): ≥2 paragraf bervariasi = manusia; satu paragraf panjang = tanda struktur datar (signifikansi kecil, ±5).
  - Sinyal baru: word-length CV, diversity bigram/trigram, deteksi bahasa id/en, `HEDGE_PATS` (≈24 frasa manfaat generik), pola enumerasi ter-anchor di awal kalimat.
  - Frasa akademik netral netral — TAPI bila dipakai berulang (≥2) tanpa substansi riset (acaMarkers<3) menjadi bukti scaffolding (max +18). Ini rekonsiliasi §3 vs penyalahgunaan template.
  - Skor kalimat INDEPENDEN (anchor 30; frasa AI +30, hedge +14, konektor-tanpa-substansi +14, pita 12–28 +6, personal −28, data −8, pembuka berulang +12) + smoothing konteks antar kalimat.
  - Agregasi: sinyal dokumen yang di-*blend* dengan bukti kalimat (`median×0,35 + proporsi-AI-like×0,65`) hanya saat sebaran skor kalimat lebar (`blendW` 0–0,6) — inilah jaring untuk teks campuran.
  - `confidence` rendah/sedang/tinggi dari panjang, jumlah kalimat, sebaran, zona 38–62; lantai skor 15 (anti-nol palsu), cap 45 untuk <50 kata.
- **js/main.js — `render()`**: ensemble menjadi berbobot bahasa (ID: heuristik 35% / model 65%; EN: 50/50) dan dikurangi sesuai cakupan baca model parsial; verdict menampilkan `confidence`, bahasa terdeteksi; baris statistik menambah median + sebaran skor kalimat; laporan cetak menambah confidence. Hanya teks, tidak menyentuh layout/desain.

## 5. Benchmark Sebelum vs Sesudah (dataset: 18 teks — 6 tuning, 12 test)
| Metrik | Sebelum | Sesudah |
|---|---|---|
| Human avg / range | 15,0 / [2–53] | **17,8 / [14–24]** |
| False positive (skor>30) | 2 (53, 34) | **0** |
| Formal akademik manusia | 53 (zona campuran/FN bayangan) | **23** |
| AI avg / range | 52,7 / [22–81] | **56,6 / [34–97]** |
| Demo AI (t-ai-demo) | 54 | **68** (label "campuran" sama, tidak regresi) |
| AI formal template | 81 | 97 |
| AI pendek (23 kata) | 22 (terlihat manusia) | **34** (zona jujur "perlu ditinjau") |
| Campuran avg | 26 / 26 | 24 / 27 |
| thr=50 akurasi | 81,3% (TP5, FN2, FP1) | 81,3% (TP4, **FN3, FP0**) |
| FP-rate @thr=50 | 11,1% | **0,0%** |
| Humanizer (regresi +10) | — | **0 reversion** |

Keputusan tuning hanya memakai 6 teks tuning; 12 teks test dibiarkan (aturan anti-overfit).

## 6. Hasil per Dataset
- **Manusia (9/9 benar):** semua ≤24 — termasuk formal akademik dengan metodologi+data (23), teknis (14), tulisan ber-data lapangan (18), EN personal (24), pendek (14–24).
- **AI (5/7 ≥ zona tinjau):** formal template 97, demo 68, EN generik 56, terjemahan 50, pendek-casual 45–46 (zona "perlu ditinjau" — jujur, bukan salah-baca ekstrem), 23-kata 34.
- **Campuran (2 teks):** 24 dan 27 — masih "cenderung natural" dengan confidence sedang; ini keterbatasan yang didokumentasikan (lihat §12).

## 7. Perbandingan dengan ZeroGPT
Tidak ada ground-truth akses ke ZeroGPT; aplikasi ini TIDAK menyalin metode atau klaim mereka. Perbedaan filosofi: ZeroGPT menjual capaian "akurasi tinggi", aplikasi ini sengaja **menahan diri** — tidak ada skor "100%", teks <80 kata diberi catatan, zona abu-abu diberi confidence rendah/sedang, dan false-positive diutamakan dihindari (FP lebih berbahaya bagi mahasiswa daripada FN). Klaim "99,9%" ZeroGPT versi publik tidak kami ulang karena tidak terbukti secara ilmiah.

## 8. Performa
- Semua sinyal baru linear (paragraf, n-gram, word-length) + mata-mata ide O(n²·w) dibatasi `pairs<2` dan `sents≤300` (praktis instan untuk masukan normal; textarea dibatasi MAX_CHARS). Tidak ada request jaringan baru (model lokal tetap lazy-load opsional). Humanizer tidak diubah.

## 9. UI: TIDAK DIUBAH (verified)
`index.html` (semua ID fungsional) tidak disentuh; `style.css`/`mobile.css` tidak disentuh; layout, warna, highlight mark 3 warna, dan tombol tetap. Perubahan hanya teks: method ensemble menyebut bahasa, verdict menampilkan confidence, baris stats menambah median/sebaran, print menambah confidence. Demo tetap memakai heuristic() sungguhan (bukan angka tempelan) — smoke test render()+runDemo() lulus.

## 10. File yang Diubah
- `js/core.js` — daftar frasa: `AI_ID` dipangkas, `ACAD_NEUTRAL` baru, `ID_FW`/`EN_FW` (deteksi bahasa).
- `js/detector.js` — `heuristic()` dirombak, `HEDGE_PATS`, `computeConfidence()`; `localScore()`/`splitReferences()`/`cleanAcademic()` tidak diubah.
- `js/main.js` — `render()` ensemble bahasa + confidence; `buildPrint()`.
- Area audit (bukan bagian app): `.slim/deepwork/bench.js`, hasil JSON, `smoke-render.js`, state file.

## 11. Dependensi yang Ditambahkan: TIDAK ADA
Semua logika lokal; model opsional tetap via CDN `@xenova/transformers@2.17.2` (sudah ada dari sebelumnya). Libraries untuk PDF/docx tidak berubah.

## 12. Keterbatasan yang Tersisa
1. **Teks pendek (<50 kata / <3 kalimat):** skor dibatasi ≤45 dan confidence rendah/sedang — kami tidak akan memvonis.
2. **Teks campuran human+AI:** masih sering jatuh di 24–30 (confidence sedang); deteksi mixed butuh korpus campuran yang lebih besar untuk tuning.
3. **Gaya formal manusia tanpa data/sitasi** bisa terbaca mirip formal template — dilihat dari confidence, bukan skor.
4. **Bahasa:** deteksi id/en sederhana; teks campuran bahasa/बहस code-switch bisa salah deteksi bahasa → bobot ensemble kurang tepat.
5. **Dataset 18 teks kecil** — angka akurasi adalah indikasi, bukan jaminan; tidak ada klaim "pasti/100%/dijamin" di UI.
6. Tidak ada backend/akun — tidak ada privasi keluhan, tapi juga tidak bisa update model tanpa deploy.