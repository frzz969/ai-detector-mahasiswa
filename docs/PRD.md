# PRD — Faraz Detector AI (AI Detector Mahasiswa)

**Versi:** 1.3 — 01 Okt 2026 (tambah §15 kontrak & aturan: API, bahasa, mixed, reproducibility, state, concurrency, privasi hybrid, interpretasi, test matrix; revisi klaim privat §1)
**Status:** Draft untuk implementasi
**Bahasa:** Indonesia
**Sumber acuan kode:** `js/core.js`, `js/detector.js`, `js/referensi.js`, `js/humanizer.js`, `js/ai/preprocess.js`, `js/ai/client.js`, `js/ai/combine.js`, `js/ai/validate.js`, `js/ai/status.js`, `js/ai/summarizer.js`, `js/ai/explainer.js`, `js/main.js`, `index.html`, `api/config.js`, `api/analyze.js`, `api/humanize.js`, `api/summarize.js`, `api/explain.js`, `api/material.js`, `.env.example`, `style.css`, `mobile.css`
**Sumber acuan aturan (wajib audit):** `AGENTS.md`, `referensi/detector-rules.md`, `referensi/humanizer-rules.md`, `referensi/validation-rules.md`

---

## 1. Ringkasan Eksekutif

Faraz Detector AI adalah aplikasi web statis, gratis, tanpa daftar, untuk membantu mahasiswa mengecek indikasi teks AI pada naskah akademik (skripsi, esai, makalah, diskusi) dalam Bahasa Indonesia dan Inggris.

Value proposition:
- Privat-first: analisis heuristik dan model lokal berjalan di browser tanpa mengirim naskah ke server. Pada mode hybrid, teks dapat dikirim ke `/api/analyze` hanya ketika endpoint AI tersedia dan jalur AI digunakan.
- Hybrid bila tersedia: `js/main.js` `doCheck()` menggabung bukti lokal + AI `/api/analyze` secara evidence-based (`js/ai/combine.js`) dengan gerbang regresi (`js/ai/validate.js`); AI gagal/tidak tersedia → hasil lokal + pesan jujur (`js/ai/status.js`, graceful degradation).
- Actionable: skor + highlight per kalimat yang bisa diklik untuk penjelasan (merah/kuning/hijau) + alasan + statistik.
- Jujur: bahasa hanya "terindikasi / perlu ditinjau / confidence rendah-sedang-tinggi", humanizer formal→formal dengan regresi per kalimat dan verdict BETTER/EQUIVALENT/WORSE; Summarize hybrid (AI divalidasi fakta → fallback ekstraktif kalimat asli verbatim) dan Explain hybrid (materi → AI tervalidasi → deskriptif struktur) — keduanya bukan vonis.

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
| Tanpa klaim menyesatkan | Bahasa user-facing | Nol klaim absolut pada output user-facing (vonis kepastian, skor mutlak, jaminan lolos, klaim bersih) |

## 5. Scope

### In-scope (kondisi saat ini, dipertahankan)
- Input tempel + counter kata, upload `.txt/.md/.pdf/.docx` (pdf.js/mammoth, chip `fileChip`, maks file 8MB).
- Toggle `autoRef` (deteksi referensi otomatis) dan `useLocal` (model lokal opsional).
- Tombol: `btnCheck`, `btnClear`, `btnSampleID/EN` (ghost small), `btnHumanize` (label "Humanize"), `btnApplyHumanize`, `btnSummarize`/`btnExplain` (tetap di `aside.rail` card "Ringkasan", `index.html:101-105`) + output `#aiToolsOut` (pindah ke `section#hasil` wrapper `.ai-tools-result#aiToolsResult`, `index.html:116-118`), `btnCopyHumanize` (di panel-head `#hasil`, fallback salin `aiToolsOut`), `btnPrint`, `btnDownload`, `Reset`.
- Status bertahap hybrid (`js/ai/status.js` via `js/main.js` `doCheck()`): Menyiapkan (`js/ai/preprocess.js` hash/v + canonicalText) → lokal (heuristik + model lokal) → AI (`js/ai/client.js` ke `/api/analyze`, gagal → fallback lokal jujur) → gabung (`js/ai/combine.js` evidence-based) → validasi (`js/ai/validate.js` gerbang regresi) → render + auto-scroll ke verdict.
- Arsitektur hybrid Local+AI: `FarazPre` → heuristik → `FarazAIClient` → `FarazCombine` (bobot confidence×coverage×bahasa, cap supremacy +5, agreement gate selisih ≥30) → `FarazValidate` (tolak gabungan bila skor naik >+10 di atas bukti lokal) → `render()` satu-satunya penulis skor. `api/*` skeleton Vercel (`api/config.js`, `api/analyze.js`, `api/humanize.js`, `api/summarize.js`, `api/explain.js`, `api/material.js`) — **belum deploy**; key hanya via env (`GEMINI_API_KEY`/`GROQ_API_KEY`, lihat `.env.example`); tanpa deploy+key aplikasi tetap jalan penuh secara lokal.
- Hasil: `aiPct/humanPct/barFill/mixLbl/verdict/highlight/reasons/stats/statSent/statReview/statSafe` + legenda warna di bawah highlight (hijau aman · kuning cek · merah tulis ulang) + ringkas merah/hijau di score-hero.
- Highlight: merah ≥70, kuning ≥45, hijau sisanya; tiap mark dapat diklik/fokus keyboard → penjelasan kalimat di `#sentExplain` (`sentTriggers()`/`sentExplainText()`/`showSentExplain()`).
- Humanizer box: `humanizeOut/humanizeBox/humanizeStatus` + restore asli.
- Demo hero: tab AI/Human (`demoAi/demoHuman/demoPct/demoLbl/demoFill/demoText/demoOpen`) — skor selalu dihitung ulang via heuristik asli, bukan dummy.
- Contoh ID/EN, `refInfo`, `printArea` untuk export PDF/Print + `.txt`.

### Out-of-scope
- Backend, akun, penyimpanan cloud, API berbayar (gateway `api/*` ada sebagai skeleton belum deploy — deploy + key di luar scope PRD ini).
- Vonis akademik otomatis (vonis kepengarangan absolut, sanksi).
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
| F-04 | Cek bertahap | Status jujur per tahap via `js/ai/status.js` (`doCheck()` di `js/main.js`): Menyiapkan → lokal → AI → gabung → validasi → render. Auto-scroll ke verdict. Demo hero ≠ produksi. |
| F-05 | Skor & verdict | Skor 15–98 + anchor netral 22 (`SCORE_ANCHOR` pengganti prior; `detector.js` tanpa prior tetap; clamp `SCORE_FLOOR/CEIL`) + combine (cap supremacy +5, agreement gate selisih ≥30, clamp 15–98). Bahasa hanya indikasi + confidence rendah/sedang/tinggi. Dilarang klaim absolut (vonis kepastian, skor mutlak, jaminan). |
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
| F-16 | CTA `#mulai` | Responsif (aturan di `mobile.css` saja). Stack vertikal, gambar `max 38–42vw`, tombol full-width di ≤600px, tanpa overflow-x di 360/390/430px. Guard khusus window 861–1100px (`mobile.css`: `@media(max-width:1100px) and (min-width:861px)`) untuk mode desktop-site ±980px (meta viewport diabaikan browser) — kunci wrap + shrink intrinsik agar CTA tidak luber. |
| F-17 | Summarize hybrid + validasi output | Tombol `btnSummarize` (tetap di `aside.rail` card "Ringkasan"; gate rail `refreshRail()`: `disabled` bila <20 kata/`MIN_WORDS`, handler juga menolak <20 kata) → `/api/summarize` dulu (spec kompresi SEDANG 20–40/30–50/40–60% + few-shot fotosintesis + CORE_RULES; `api/summarize.js`): hasil AI divalidasi `validateAiOutput()` (`js/main.js`: `numbers`/`citations`/`doiUrl`/`terminology` dari `FarazValidate.checks`) sebelum tampil; gagal → fallback lokal + status jujur ("hasil AI tidak lolos validasi fakta — dipakai ringkasan lokal", suffix lokal "tidak terhubung ke internet"). Fallback `FarazSummarize.summarize()` (`js/ai/summarizer.js`): kalimat ASLI verbatim (skor frekuensi+posisi+data, dedupe Jaccard >0.7, sebar lintas paragraf maks 2/paragraf, keep ~1/5 kalimat min 2 maks 5; teks ≤3 kalimat utuh), tanpa ubah fakta/simpulan baru. Output bernomor di `#aiToolsOut` (`section#hasil`, `.ai-tools-result#aiToolsResult`) via `showAiTools()`; teks pendek/gagal → pesan jujur. |
| F-18 | Explain hybrid + materi | Tombol `btnExplain` (tetap di `aside.rail` card "Ringkasan"; gate rail `refreshRail()`: `disabled` bila <5 kata/`MIN_TOOLS_WORDS`, handler juga menolak <5 kata) → urutan: materi `FarazAIClient.material()` (`api/material.js`: fan-out paralel Wikipedia id+en, Wikidata, OpenAlex, Crossref, Semantic Scholar, PubMed, arXiv → filter → ranking tier jurnal>wiki → validasi; maks 10; fail-soft per sumber via warnings) → `/api/explain` (hasil AI divalidasi `validateAiOutput()` seperti F-17; gagal → lokal + status jujur, suffix lokal "tidak terhubung ke internet") → `FarazExplain.explain()` (`js/ai/explainer.js`): statistik teramati (paragraf, kalimat, penanda bagian, enumerasi, penghubung, angka/sitasi, suara penulis) — deskriptif struktur, bukan vonis. Offline (API unavailable + tanpa materi) → pesan persis "Maaf, kamu sedang mode offline — fitur Explainer tidak bisa digunakan. Hubungkan ke internet" (`js/main.js`); wording lama (bayangan "API … tersedia") sudah tidak dipakai. Output di `#aiToolsOut` (`section#hasil`); gagal → pesan jujur. |
| F-19 | Highlight explainable (klik kalimat) | Tiap `mark` di `#highlight` (`js/main.js` `render()`): `tabindex/role/button` + `title` "Klik untuk lihat alasan" + handler klik/Enter/Spasi → `showSentExplain()` menulis `sentExplainText()` (nomor + skor indikasi + pemicu utama dari sinyal yang sama dengan `heuristic()` + 1 saran formal) ke `<p id="sentExplain">` tepat di bawah highlight (dalam `<details>` yang sama, tanpa section/card baru). Reset tiap render; `markStale()` mengosongkannya agar tidak basi. Legenda warna di bawah highlight + ringkas merah/hijau di score-hero (`#aiPct/#humanPct/#mixLbl`). |
| F-20 | Copy di judul hasil | Tombol `btnCopyHumanize` berada di `panel-head #hasil` (`index.html`, bukan rail), aktif bila ada keluaran humanizer ATAU isi `#aiToolsOut` (`js/main.js` `refreshRail()`); bila `humanizeOut` kosong tapi `aiToolsOut` ada → salin `aiToolsOut` dengan label jujur "(ringkasan/penjelasan)" (+ fallback textarea sementara bila clipboard gagal). |
| F-21 | Hybrid Local+AI + validasi + graceful degradation | `doCheck()` (`js/main.js`): `FarazPre.preprocess()` (hash/v + canonicalText) → heuristik `heuristic()` + `localScore()` opsional → `FarazAIClient.analyze()` ke `/api/analyze` (timeout 15 dtk, echo hash/v; gagal → `{ai:null, reason}` jujur: timeout/offline/rate-limited/unauthorized/malformed/http-*/unavailable) → `FarazCombine.combine()` (bobot AI = confidence×coverage×faktor bahasa; teks ID ×0.5 kecuali server cocok ID; cap supremacy +5 di atas bukti lokal; selisih ≥30 → confidence maks sedang + perlu ditinjau) → gerbang regresi `FarazValidate.checks.regression()` (tolak gabungan bila >+10 di atas bukti lokal) → `render()`. Status jujur per tahap via `FarazStatus` (`js/ai/status.js`). `api/*` (`config/analyze/humanize/summarize/explain/material`) skeleton Vercel belum deploy — key hanya via env, lihat `.env.example`; dilarang commit secret. |
| F-22 | Isi laporan Export PDF | `buildPrint()` (`js/main.js`): kop + hero verdict (skor indikasi + label + bukan probabilitas/vonis) + statistik NARATIF formal ("X kata dianalisis dalam Y kalimat" ribuan id-ID; pola kondisional ambang render; variasi aiLikeProp±sentSpread; "Hasil akhir: ai/100"; confidence + pustaka 1 baris) + alasan + SATU blok "Teks yang dicek" (highlight hanya kuning ≥45/merah ≥70, legenda formal) + batasan + "Dasar analisis" LIST 5 sitasi (Cahyana 2025, Mursalin 2025, Trismanto 2016, Aquariza 2018, Ilham 2025). Halaman mengikuti panjang teks (tanpa batas tetap/potong). Istilah mentah (TTR/burst/skor mentah) hanya di layar. |
| F-23 | Rail & tombol HP (`mobile.css` saja) | `.samples` ID/EN kanan-kiri; rail grid 2 kolom (Upload full-atas; Cek full; kicker MAIN ACTIONS/TOOLS-RESULT; urutan Terapkan(3)\|Humanize(4), Reset(8)\|PDF(9); Unduh hidden-HP); hero-cta ramping sejajar; `.mobile-cta` kecil; FAB/maskot compact. Tanpa polish visual besar. |

## 8. Persyaratan Non-Fungsional

- **Performa:** Heuristik sinkron ringan; model lazy agar first-load tetap cepat.
- **Privasi:** Lokal-first; tanpa kirim naskah ke server untuk heuristik. Model via CDN hanya bila toggle aktif.
- **Responsif:** Desktop `style.css` (biru langit + putih, full-width); HP/tablet ≤1100px `mobile.css`. Jangan campur edit keduanya.
- **Aksesibilitas:** Status terbaca screen-reader, kontras tombol, fokus keyboard pada editor dan hasil.
- **Kompatibilitas:** Browser modern + `pdf.js`/`mammoth` via CDN dengan fallback pesan.
- **Kualitas kode:** `node --check` semua `*.js` yang diubah; `grep` klaim terlarang pada output user-facing (komentar internal dikecualikan). Komentar `js/*.js` dirapikan (identitas file, dependensi, sitasi aturan, invariant, dan kontrak tak-obvious dipertahankan).

## 9. Arsitektur Singkat (Peta Kode)

- `js/core.js` — DOM refs, state (`lastResult/resultStale/localPipe`), `AI_PHRASES`, konstanta batas.
- `js/detector.js` — `heuristic()` (10+ sinyal + dampening + caps), `splitReferences()`, `cleanAcademic()`, model lokal opsional.
- `js/referensi.js` — data `REF_*` (connectors/hedge/enum/meth/personal/fluffy/voice/sent) + `REF_HUMANIZE_EXTRA` (formal) + `REF_RULE_DOCS` (provenance) + `REF_PAPER Cahyana dkk 2025`.
- `js/humanizer.js` — `humanizeSentence()` + `humanizeText()` + handler tombol + verdict + restore.
- `js/main.js` — `render()` (bahasa indikasi; satu-satunya penulis skor), `doCheck()` hybrid (preprocess → lokal → AI → combine → gerbang regresi → render), highlight klik + `sentTriggers()/sentExplainText()/showSentExplain()` ke `#sentExplain`, Summarize/Explain hybrid (`validateAiOutput()` sebelum tampil) ke `#aiToolsOut` di `#hasil`, stale-guard export, demo hero.
- `js/ai/` — `preprocess.js` (`FarazPre`: hash/v + canonicalText) → `client.js` (`FarazAIClient`: `/api/analyze`, timeout 15 dtk, echo hash/v) → `combine.js` (`FarazCombine`: evidence-based + cap supremacy + agreement gate) → `validate.js` (`FarazValidate`: 10 checks + gerbang regresi) → `status.js` (`FarazStatus`: status jujur per tahap) → `summarizer.js` (`FarazSummarize`: ekstraktif verbatim) → `explainer.js` (`FarazExplain`: deskriptif struktur).
- `api/` — skeleton Vercel gateway **belum deploy**: `config.js` (konstanta + key via env), `analyze.js` (validasi hash/v + chunking cermin `localScore` + Gemini primer/Groq fallback), `humanize.js`/`summarize.js`/`explain.js` (thin proxy + AI Core Rules), `material.js` (fan-out 7 sumber materi akademik → filter → ranking tier jurnal>wiki → validasi; maks 10; fail-soft). Key hanya via env, lihat `.env.example`.
- `index.html` — struktur + semua ID fungsional (jangan rename/hapus): `btnCheck`, `btnSummarize`/`btnExplain` (tetap di `aside.rail` card "Ringkasan", `index.html:101-105`) + `#aiToolsOut` (pindah ke `section#hasil` wrapper `.ai-tools-result#aiToolsResult`, `index.html:116-118`), `btnCopyHumanize` (panel-head `#hasil`), `#highlight` + `#sentExplain`, `btnSampleID/EN` (ghost small), demo `demoAi/demoHuman/demoOpen`.
- `style.css` / `mobile.css` — pemisahan desktop/mobile tegas.

Urutan load: `js/core → js/detector → js/referensi → js/humanizer → js/ai/preprocess → js/ai/client → js/ai/combine → js/ai/validate → js/ai/status → js/ai/summarizer → js/ai/explainer → js/main` (defer).

## 10. Sinyal Deteksi (Ringkas, dari `detector-rules.md`)

Burst ritme, TTR, n-gram diversity, frasa generik, konektor, pola 12–28 kata, personal voice, lively (`?!`/kutip), data konkret, paragraf CV, opener berulang, repetisi ide Jaccard >0.55, fluffy/voice, hedge manfaat-generik, enumerasi. Anchor netral 22 (`SCORE_ANCHOR`, pengganti prior — tanpa prior tetap), skor akhir 15–98. Alur: preprocess (`FarazPre`: hash/v + canonicalText) → heuristik 10 sinyal (`heuristic()`) + model lokal opsional (`localScore()`) → AI opsional (`FarazAIClient`) → combine (`FarazCombine`: bobot confidence×coverage×bahasa, cap supremacy +5, agreement gate selisih ≥30, clamp 15–98) → validasi (`FarazValidate`: gerbang regresi) → verdict indikasi (`render()`, satu-satunya penulis skor).

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
- **P2:** Deploy gateway `api/*` (Vercel + `GEMINI_API_KEY`/`GROQ_API_KEY`, key hanya via env, lihat `.env.example`) agar jalur AI hybrid aktif; tanpa deploy, aplikasi tetap lokal-first dengan fallback jujur (`js/ai/status.js`, `js/ai/combine.js`, `js/ai/validate.js`).
- **P3:** Cache model lokal (IndexedDB) + indikator progres unduh ~130MB.
- **P4:** Mode batch (multi-file) dengan ringkasan campuran 38–62 untuk human+AI.
- **Non-goal:** Skor mutlak / vonis kepastian — tetap dilarang.

## 13. Status Deploy (Backend AI)

- `api/*` (`config.js`, `analyze.js`, `humanize.js`, `summarize.js`, `explain.js`, `material.js`) adalah skeleton gateway Vercel — **belum di-deploy** (key hanya via env, lihat `.env.example`).
- Mode AI butuh deploy Vercel + key via env (`GEMINI_API_KEY`/`GROQ_API_KEY`, primer Gemini → fallback Groq); key dilarang di-commit.
- Tanpa deploy + key, seluruh fitur (Detect lokal, Humanize, Summarize, Explain, Export, Upload, Demo) tetap jalan penuh secara lokal dengan fallback jujur (`js/ai/status.js`).

## 14. Kriteria Penerimaan (Acceptance)

1. `node --check` lolos untuk semua `*.js` yang diubah.
2. Harness temp: demo AI terindikasi, demo human rendah, teks pendek di-cap 45, formal akademik tidak overflag, humanize tidak regresi.
3. Output user-facing bersih dari klaim absolut (verifikasi: pencocokan pola klaim-vonis sesuai `AGENTS.md` §2; pengecualian label existing di `index.html`).
4. Export basi terblokir sampai rescan.
5. CTA `#mulai` tanpa horizontal scroll di 360/390/430px.
6. Setiap analisis menyebut aturan yang dipakai (audit balik ke `referensi/*`).

## 15. Kontrak & Aturan Tambahan (v1.3, tanpa ubah logika kode)

### 15.1 API Contract Ringkas
- Request `/api/analyze`: `canonicalText`, `hash`, `version`, `language`, `options`.
- Response wajib: `hash`, `version`, `ai`, `language`, `confidence`, `coverage`, `reasons`, `status`.
- Client wajib menolak response bila `hash` atau `version` tidak sama dengan request aktif.
- Response malformed, timeout, HTTP error, atau hash/version mismatch → AI dianggap tidak tersedia dan hasil lokal dipertahankan.
- API tidak boleh mengembalikan secret/key ke client.

### 15.2 Deteksi Bahasa
- Bahasa ditentukan sebelum proses hybrid.
- Minimal mendukung `id`, `en`, dan `unknown`.
- Jika confidence bahasa rendah atau campuran ID/EN signifikan → gunakan `unknown/mixed`.
- Model EN tidak boleh diberi bobot penuh untuk teks ID.
- Bahasa yang terdeteksi dan confidence-nya dicatat dalam hasil analisis.

### 15.3 Teks Campuran
- Istilah teknis, nama metode, nama software, dan istilah akademik berbahasa asing tidak dianggap sebagai pergantian bahasa utama.
- Code, URL, DOI, nama produk, nama organisasi, dan sitasi tidak digunakan sebagai sinyal gaya AI.
- Jika proporsi dua bahasa cukup tinggi, hasil diberi status mixed dan confidence dapat diturunkan.

### 15.4 Reproducibility
- Setiap hasil menyimpan `detectorVersion`, `ruleVersion`, `modelVersion` bila model lokal digunakan, `language`, dan timestamp.
- Export hanya menggunakan metadata dari analisis terakhir yang menghasilkan teks tersebut.
- Perubahan rule/model tidak boleh mengubah hasil yang sudah diekspor secara retroaktif.

### 15.5 State Hasil
- `EMPTY`: belum ada teks.
- `CHECKING`: analisis sedang berjalan.
- `FRESH`: hasil sesuai dengan teks editor terakhir.
- `STALE`: teks berubah setelah analisis terakhir.
- `FAILED`: analisis gagal total.
- `HUMANIZED`: tersedia keluaran humanizer yang belum diterapkan.
- Perubahan teks selalu menghapus/menandai hasil yang bergantung pada teks tersebut sebagai stale.
- Hasil stale tidak boleh digunakan untuk Export, Summarize, Explain, atau Apply Humanize tanpa validasi ulang bila fitur tersebut bergantung pada teks terbaru.

### 15.6 Concurrency & Cancellation
- Setiap analisis memiliki `requestId`.
- Hanya hasil dari request aktif yang boleh memanggil `render()`.
- Response dari request lama wajib diabaikan.
- Analisis baru membatalkan atau menginvalidasi analisis sebelumnya.
- Response AI yang datang terlambat tidak boleh menimpa hasil terbaru.

### 15.7 Privasi & Data (hybrid)
- Mode lokal tidak mengirim isi naskah ke server.
- Mode hybrid mengirim teks yang diperlukan ke `/api/analyze` ketika endpoint tersedia dan fitur AI aktif.
- Server tidak boleh menyimpan naskah atau API key dalam response/log aplikasi.
- UI wajib memberi tahu ketika teks diproses melalui endpoint eksternal.
- API key hanya berada di environment server dan tidak pernah dikirim ke browser.

### 15.8 Interpretasi Skor
- Skor merupakan skor indikasi internal aplikasi, bukan probabilitas bahwa teks dibuat AI.
- Skor tidak boleh diterjemahkan menjadi persentase kepastian kepengarangan.
- Perubahan skor antar-versi detector tidak dianggap sebagai bukti perubahan kepengarangan.
- Hasil harus selalu diposisikan sebagai sinyal untuk ditinjau manusia.

### 15.9 Test Matrix Minimum
- ID akademik formal, EN akademik formal, ID informal, EN informal, ID/EN mixed.
- Teks <20 kata, 20–49 kata, 50–79 kata, 80+ kata; 1 kalimat, 2–3 kalimat.
- 30k karakter, >30k karakter; PDF teks, PDF scan, DOCX, DOC lama.
- Referensi panjang; URL/DOI/sitasi; model lokal tersedia/gagal.
- API timeout, 401/403, 429, 5xx, malformed response, hash mismatch.
- Request lama datang setelah request baru; teks berubah setelah check.
- Humanize WORSE/EQUIVALENT/BETTER; export stale.

---

*Dokumen ini adalah PRD produk, bukan vonis akademik. Semua skor adalah indikasi yang perlu ditinjau manusia.*
