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
- Jujur: bahasa hanya "terindikasi / perlu ditinjau / confidence rendah-sedang-tinggi", humanizer formal→formal dengan regresi per kalimat dan verdict BETTER/EQUIVALENT/WORSE; Summarize hybrid (AI ringkasan abstractive divalidasi fakta → fallback ekstraktif kalimat asli verbatim) dan Explain hybrid (materi → AI tervalidasi → deskriptif struktur) — keduanya bukan vonis.

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
| F-17 | Summarize hybrid + validasi output | Tombol `btnSummarize` (tetap di `aside.rail` card "Ringkasan"; gate rail `refreshRail()`: `disabled` bila <20 kata/`MIN_WORDS`, handler juga menolak <20 kata) → `/api/summarize` dulu (spec kompresi SEDANG 20–40/30–50/40–60% + few-shot fotosintesis + CORE_RULES; `api/summarize.js`): hasil AI divalidasi `validateAiOutput()` (`js/main.js`: `numbers`/`citations`/`doiUrl`/`protected`/`terminology` + `meaning`/`causality`/`uncertainty`/`relevance` dari `FarazValidate.checks`) sebelum tampil; gagal → fallback lokal + status jujur ("hasil AI tidak lolos validasi fakta — dipakai ringkasan lokal", suffix lokal "tidak terhubung ke internet"). Prompt AI = `MODE ABSTRACTIVE` (boleh gabung/padatkan kalimat; dilarang menambah fakta atau membalik negasi; angka/sitasi/istilah wajib persis); `sentences[]` = jejak audit verbatim, disaring server-side bila provider mengirim yang bukan substring. Fallback `FarazSummarize.summarize()` (`js/ai/summarizer.js`): kalimat ASLI verbatim (skor frekuensi+posisi+data, penalti kalimat generik + penalti kalimat bergantung, dedupe Jaccard >0.7, sebar lintas paragraf maks 1/paragraf, keep ~1/5 kalimat min 2 maks 5; teks ≤3 kalimat utuh), tanpa ubah fakta/simpulan baru. Output bernomor di `#aiToolsOut` (`section#hasil`, `.ai-tools-result#aiToolsResult`) via `showAiTools()`; teks pendek/gagal → pesan jujur. |
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
- `js/ai/` — `preprocess.js` (`FarazPre`: hash/v + canonicalText) → `client.js` (`FarazAIClient`: `/api/analyze`, timeout 15 dtk, echo hash/v) → `combine.js` (`FarazCombine`: evidence-based + cap supremacy + agreement gate) → `validate.js` (`FarazValidate`: 10 checks + gerbang regresi) → `status.js` (`FarazStatus`: status jujur per tahap) → `summarizer.js` (`FarazSummarize`: fallback ekstraktif verbatim, penalti kalimat bergantung) → `explainer.js` (`FarazExplain`: deskriptif struktur).
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
- Teks <20 kata, 20-49 kata, 50-79 kata, 80+ kata; 1 kalimat, 2-3 kalimat.
- 30k karakter, >30k karakter; PDF teks, PDF scan, DOCX, DOC lama.
- Referensi panjang; URL/DOI/sitasi; model lokal tersedia/gagal.
- API timeout, 401/403, 429, 5xx, malformed response, hash mismatch.
- Request lama datang setelah request baru; teks berubah setelah check.
- Humanize WORSE/EQUIVALENT/BETTER; export stale.

---

## 16. REGRESSION CASE — EXPLAINER (retrieval materi)

Input: teks 844 kata tentang kelinci.

Observed incorrect output (ditolak): "Materi terkait" menampilkan sumber yang
hanya cocok keyword, tanpa hubungan topik:
- GASTRONOMI MAKANAN BETAWI SEBAGAI SALAH SATU IDENTITAS BUDAYA DAERAH
- IbM Kelompok Usaha Wanita Budidaya Kelinci Pedaging
- Perancangan Sistem Informasi Penjualan Hewan Peliharaan Kelinci
- Bromo kian rawan banjir
- dan sumber "kelinci" lainnya.

Problem: keyword overlap dianggap cukup untuk menentukan relevansi. Sumber yang
hanya memiliki overlap entitas, tetapi tidak mendukung isi utama teks, tetap
ditampilkan. Root cause: `api/material.js` membentuk query dari 8 token
frekuensi tertinggi dan mengurutkan hanya tier + sitasi + tahun, tanpa skor
relevansi, lalu memaksa 10 hasil.

Expected behavior:
- Relevansi berbasis topik/isi, bukan keyword tunggal.
- Sumber yang hanya overlap nama entitas tidak dianggap relevan.
- Maksimal menampilkan sumber dengan relevansi kuat; tidak memaksa jumlah.
- Jika tidak ada sumber yang cukup relevan, tampilkan: "Tidak ditemukan materi
  yang cukup relevan dengan teks."
- Setiap sumber memiliki alasan relevansi singkat.
- Tidak menyatakan sumber mendukung isi teks sebelum diverifikasi.

Implemented contract (`api/material.js`):
- `buildProfile()` -> topics (freq + IDF ringan, min frekuensi 2), context
  (ko-occurrence dengan topik jangkar, min 2 kalimat), entities (nama proper
  non-sentence-initial, binomial latin, angka+satuan).
- `buildQueries()` -> 2-3 query dari profil (bukan dump token).
- `scoreCandidate()` -> relevance = semantic x 0.45 + topic x 0.25 +
  context x 0.20 + entity x 0.10, dikali quality (tier). Komponen = rasio
  jenuh: semantic = presisi isi judul terhadap teks, topic = BREADTH topik
  berbeda yang tertutup, context = bobot ko-occurrence, entity = entitas cocok.
- `MIN_SOURCE_RELEVANCE = 0.70`; di bawah ambang tidak ditampilkan.
- Gerbang keras: wajib menutup >= 1 topik jangkar, presisi >= 0.34, dan
  `relevanceReason` harus spesifik (menyebut term yang cocok).
- Dedupe DOI/URL/judul ternormalisasi; `relevance` + `relevanceReason`
  dibawa ke UI (`js/main.js`) dan ke audit `method`.
- Empty result state jujur + hitungan kandidat yang ditolak.

## 17. REGRESSION CASE — SUMMARIZER (ringkasan terlalu umum)

Input: teks 844 kata tentang kelinci.

Observed incorrect output (ditolak) — 5 kalimat generik:
1. Kelinci memang menjadi salah satu hewan yang cukup dekat dengan manusia.
2. Kelinci tidak hanya terdiri dari satu jenis saja.
3. Salah satu hal yang paling mudah dikenali dari kelinci adalah telinganya.
4. Karena itu, kelinci perlu sering mengunyah makanan berserat.
5. Pada saat yang sama, kelinci juga menjadi makanan bagi hewan lain.

Problem: ringkasan terlalu umum dan tidak mewakili informasi utama teks.
Metode ekstraktif lama (frekuensi kata isi + bonus posisi/data) memilih kalimat
yang mudah dianggap penting, tanpa memperhatikan distribusi topik, kepadatan
informasi, dan kalimat generik.

Expected behavior:
- Tetap ekstraktif/verbatim.
- Kalimat dipilih berdasarkan kepentingan informasi.
- Ringkasan mencakup topik utama dan subtopik penting, proporsional.
- Hindari kalimat yang hanya berisi fakta umum.
- Tidak mengarang atau mengubah fakta.

Implemented contract (`js/ai/summarizer.js`):
- `scoreSentences()` -> parts { topic (tf-idf), density (porsi isi distinctive),
  entity, position } - 0.34 * generic - penalty.
- `genericness()` -> penanda pernyataan umum + bukti konkret (angka, nama
  proper, istilah distinctive). Kalimat generik regression turun ke bawah.
- Filter redundansi (Jaccard > 0.7) + sebar lintas paragraf (maks 1/paragraf).
- `verifyExtractive(text, sentences)` -> WAJIB substring verbatim, tanpa
  duplikat. Dipakai `js/main.js` untuk memeriksa jejak audit `sentences[]`, dan
  oleh test sebagai jaminan fallback lokal tidak mengorbankan verbatim.
- `orphanPenalty(sent)` -> penalti 0,35–0,95 untuk kalimat yang bergantung pada
  kalimat sebelumnya ("Namun, kemampuan reproduksi ...", "Selain itu, ...",
  "Hewan ini termasuk ..."). Ekstraktif menyalin utuh, jadi kalimat seperti ini
  berdiri tanpa konteks. Ditambah swap ke kandidat mandiri satu paragraf.

Test: `node tests/tools-regression.js` (CASE A-G, tanpa jaringan, mock).

---

## 18. REGRESSION CASE — RINGKASAN BAGUS DITOLAK VALIDASI

Input: teks 708 kata tentang kelinci (12 paragraf).

Observed incorrect output (ditolak) — 5 kalimat terputus + catatan internal:
1. "Hewan ini termasuk ke dalam ordo Lagomorpha dan famili Leporidae."
2. "Secara ilmiah, salah satu spesies kelinci ... Oryctolagus cuniculus ..."
3. "Selain itu, kelinci memiliki kemampuan melihat ke arah yang luas ..."
4. "Namun, kemampuan reproduksi yang tinggi juga dapat menimbulkan masalah ..."
5. "Namun, memelihara kelinci tetap membutuhkan tanggung jawab."
   + "(hasil AI ditolak validasi (terminology) — dipakai ringkasan ekstraktif lokal)"

Problem: hasil AI yang BENAR justru ditolak, dan output yang tampil tidak
terbaca sebagai ringkasan.

Akar masalah (dua bug terpisah, keduanya dihitung dari teks yang sama):
1. `properNouns()` memakai `/\s[A-ZÀ-Þ][a-zà-ÿ]{2,}/` — menghitung SETIAP kata
   yang diawali huruf besar, termasuk setiap kata awal kalimat. Teks Indonesia
   memakai huruf besar di awal kalimat, sehingga 708 kata menghasilkan **34
   "istilah"** yang sebagian besar kata tugas (`selain`, `dari`, `dalam`,
   `kemudian`, `selama`). Istilah sungguhan hanya 4: `Lagomorpha`, `Leporidae`,
   `Oryctolagus cuniculus`, `Eropa`. `checkTerminology` ambang 0,7 → hasil
   10/34 (29%) = GAGAL. every ringkasan ditolak, termasuk yang sempurna.
2. `checkMeaning()` ambang Jaccard 0,45 — tidak bisa dicapai ringkasan mana pun.
   Kompresi 75% (25% sisa) menghasilkan Jaccard 0,34 secara matematis. Check
   yang sama juga menolak `checkCausality` (4 negasi → 0) dan `checkHedge`,
   padahal pengurangan itu konsekuensi normal menyingkirkan kalimat, bukan
   pembalikan makna.

Expected behavior:
- Ringkasan AI yang faktanya utuh DITAMPILKAN, bukan dibuang demi ambang yang
  tidak bisa dicapai.
- Ringkasan boleh abstractive (gabung/padatkan kalimat) — inilah bedanya
  ringkasan dengan potongan teks.
- Fakta TIDAK boleh longgar: angka, sitasi, DOI, kutipan, istilah, dan arah
  negasi tetap dijaga seketat rewrite.

Implemented contract:
- `properNouns()` -> hanya kata yang (a) pernah kapital, (b) tidak pernah
  huruf kecil, (c) muncul minimal sekali di TENGAH kalimat, (d) bukan kata
  tugas; nama majemuk/binomial digabung jadi satu unit. 34 → 4 istilah.
- Konteks ringkasan = rasio token kandidat/original < 0,45. Di konteks itu:
  `meaning` 0,45→0,12; `terminology` 0,7→0,3; `causality` hanya menolak
  PENAMBAHAN/pembalikan negasi; `hedge` tidak menolak penghilangan;
  `relevance` hanya menghitung kata ISI baru (kata penghubung bukan karangan).
  Rewrite (rasio ≥ 0,45) tetap ambang penuh.
- `api/summarize.js` prompt `MODE EKSTRAKTIF WAJIB` → `MODE ABSTRACTIVE`:
  boleh menggabungkan/memadatkan kalimat, dilarang menambah fakta, dilarang
  membalik arah negasi, angka/sitasi/istilah wajib persis. `sentences[]`
  menjadi jejak audit, disaring server-side supaya tidak menyesatkan.
- `js/main.js` gate ringkasan ke 9 check fakta; `validateAiOutput(orig, cand,
  extraChecks)` dipisah supaya humanizer tidak ikut memakai check ringkasan.

Test: `node tests/tools-regression.js` CASE F (validator) + CASE G (kalimat
yatim). Anti-bocor dijaga: karangan dengan angka/istilah rekaan ditolak
(`terminology`,`meaning`), pembalikan negasi ditolak (`causality`), angka yang
hilang saat ringkasan ditolak (`numbers`).

---

## 19. TIGA PIPELINE TERPISAH (sumber kebenaran arsitektur)

Tiga fitur ini **bukan satu pipeline**. Mencampurkannya bikin dokumentasi
menyesatkan dan tempted orang meng-`combine`-kan output yang tak bisa
di-`combine`-kan. Kontrak bersama: `main.js` = orchestrator + satu-satunya
penulis skor, `validate.js` = gerbang lokal, `api/*` = proxy tipis.

### 19.1 F-21 Detector — local dan AI PARALEL

```text
INPUT
 ↓
PREPROCESS (canonicalText + hash/v)
 ↓
┌───────────────┴───────────────┐
LOCAL heuristic()          AI /api/analyze
10 sinyal + dampening      timeout 15 dtk, echo hash/v
│                          gagal → hasil lokal + pesan jujur
└───────────────┬───────────────┘
                ↓
COMBINE (evidence-based, confidence×coverage×bahasa)
                ↓
VALIDATE (gerbang regresi: tolak bila >+10 di atas bukti lokal)
                ↓
RENDER → SKOR + VERDICT (indikasi, bukan vonis)
```

`combine` dipakai karena lokal dan AI sama-sama menghasilkan **evidence/skor**
yang bisa digabung berbobot.

### 19.2 F-22 Summarizer — select-or-fallback, tanpa combine

```text
INPUT → /api/summarize → 9 check fakta → VALID? → AI ringkasan
                                          └→ INVALID → FarazSummarize (ekstraktif)
```

**Tidak ada `combine`:** tidak ada dua ringkasan yang bisa di-blend. "AI 60% +
lokal 40%" tidak bermakna untuk teks naratif — yang ada hanya pilih salah
satu atau fallback.

### 19.3 F-23 Explainer — select-or-fallback, tanpa combine

```text
INPUT → /api/material → /api/explain → 5 check fakta
       → VALID? → AI penjelasan
                 → INVALID → FarazExplain (deskriptif struktur)
```

Penjabaran **menjelaskan pola**, bukan meringkas isi. Karena itu check
`meaning`/`relevance` sengaja tidak dipasang di jalur ini: penjelasan boleh
memakai kosakata analisis yang tidak ada di teks asli ("pola enumerasi",
"transisi frekuentatif") tanpa berarti mengarang. Yang wajib dijaga hanya
fakta: angka, sitasi, DOI/URL, kutipan langsung, istilah.

### 19.4 Runtime validation ≠ AI quality evaluation

Dua hal berbeda yang tidak boleh dicampur:

| | Runtime validation | AI quality evaluation |
|---|---|---|
| File | `js/ai/validate.js` | `tests/ai-live-eval.js`, `eval/run.js` |
| Pertanyaan | "apakah output AI untuk user ini aman dipakai?" | "apakah AI masih layak dipercaya setelah perubahan kode/model?" |
| Kapan | tiap request user | oleh developer, offline, di luar runtime |
| Sumber kebenaran | kode lokal | benchmark berlabel |

Validator menjawab **"apakah output konsisten dengan input?"** — bukan
**"apakah skor AI 72 itu benar?"`. Yang kedua hanya bisa dijawab benchmark.
Dataset evaluasi TIDAK boleh masuk ke pipeline scan user.

### 19.5 Status method — user tahu skor dari mana

`js/ai/status.js` wajib membedakan, bukan hanya menampilkan "68/100":

| Keadaan | Method yang ditulis |
|---|---|
| Lokal + model lokal + AI | `gabungan heuristik X/100 + AI Y/100` + catatan combine |
| AI tidak tersedia | `heuristik offline X/100 (AI <reason>)` |
| AI ditolak gerbang regresi | `AI ditolak gerbang regresi — dipakai hasil lokal` |

Ditulis ke `render()` (`method`) dan ke status akhir `doCheck()`, muncul di
`<details>Detail teknis</details>` dan laporan ekspor.

### 19.6 Larangan yang sudah dibuktikan (jangan dikembalikan)

- **Jangan pakai `combine` untuk summary/explain** — lihat 19.2/19.3.
- **Jangan hidupkan lagi aturan "wajib cocok topik utama"** di `api/material.js` —
  sudah diuji menolak paper yang relevan ("Diagnosis Kanker Paru-paru Berbasis
  Data Klinis"). Relevansi berbasis skor + alasan, bukan kecocokan kata.
- **Jangan naikkan bobot AI di `js/ai/combine.js`** — data membuktikan merusak
  (10 teks manusia ID dapat +25 poin palsu).
- **Jangan turunkan standar test** supaya CI hijau.

---

## 20. CASE SEMANTIC — semantic sinyal utama

Sinyal utama relevansi materi adalah semantic similarity embedding dokumen ↔
(judul + abstrak); keyword-overlap != relevansi (sumber keyword-only seperti
"Sistem Informasi … Kelinci" atau "Bromo" tetap ditolak; paper relevan beda
istilah seperti "Diagnosis Kanker Paru … Data Klinis" tetap lolos).

Ambang yang berlaku sekarang (baca dari `api/material.js`, jangan diubah di sini):
- Tampil/tolak: `MIN_SOURCE_RELEVANCE = 0.70` (di bawah ambang tidak tampil).
- Semantic: `SEM_HIGH = 0.72` (semantic saja sah) dan `SEM_GATE = 0.62`
  (semantic sedang sah bila ada dukungan lexical topik/konteks).
- Mode embedding: `relevance = semantic*0.55 + lexical*0.25 + context*0.20`,
  dikali quality tier; mode fallback leksikal dilaporkan via `semanticMode`.

Test matrix: `tests/faraztest.js` (S6–S7), `tests/tools-regression.js`
(CASE A/C/E + CASE 1–6 semantic injeksi, CASE F/G validator/summarizer),
`tests/domain-independence.js` (4 domain), `tests/material-live.js`
(embedding nyata + gate live). Evaluasi berlabel manual:
`eval/retrieval-benchmark.jsonl` + `tests/retrieval-eval.js` (offline).

---

## 21. Pilot benchmark retrieval (30 query)

Struktur pilot di `eval/retrieval-benchmark.jsonl` — TANPA label asli
(semua baris TEMPLATE, semua URL `example.invalid`, semua teks diawali
"CONTOH TEMPLATE"):

- Komposisi: 10 kelinci + 10 perpajakan + 8 ML kesehatan + 2 literasi
  digital = 30 query (`query_id` `<slug>-q<nn>`).
- 10 kandidat per query; tiap query memuat minimal 2 `hard_negative:true`
  (keyword cocok tapi konteks salah, relevance 0) + 1 kandidat off-domain.
- Label manual 0/1/2 (0 = tidak relevan, 1–2 = relevan) — diisi manusia,
  bukan oleh file ini.
- Metrik via `tests/retrieval-eval.js` (offline): P@3 / P@10 / recall /
  off-domain count + info hard-negative (tidak memengaruhi exit code).
- `BASELINE_PRECISION_AT_10 = 0` sampai label manual ada dan baseline
  ditetapkan; bila P@10 di bawah baseline → exit 1 (regresi).
- Status: template saja — `node tests/retrieval-eval.js` exit 0 dengan pesan
  BUTUH LABEL MANUAL (30 template dilewati).

## 22. Protokol audit blind 1-reviewer

Cermin dari `eval/audit_triage.md` §5 (sumber kebenaran operasional ada di
file tersebut):

- Blind + acak: reviewer hanya melihat ID + teks dari `dataset_v2.jsonl`
  (label/source/generator disembunyikan); urutan 100 sampel diacak.
- Form per sampel: ID | bahasa (id/en) | domain
  (news/encyclopedia/abstract/academic) | verdict (AI / Human / Uncertain) |
  confidence (Low / Med / High) | catatan.
- Uncertain wajib dipakai bila ragu — keraguan adalah data.
- Metadata (`pub_date`/lisensi/panjang kata) = data-quality issue, bukan
  dasar verdict.
- Kerjakan 15 sampel prioritas (`audit_triage.md` §2) dulu; adjudikasi semua
  Uncertain + disagree-vs-label setelah label asli dibuka.
- Status: `reviewer_verdict` 0/100 terisi (belum mulai).

## 23. Status validasi (Okt 2026)

| Lini | Lampu | Arti |
|---|---|---|
| Engineering (fitur + harness) | 🟢 | Jalan, regression hijau |
| Regression (faraztest, tools-regression, domain, material-live) | 🟢 | Hijau |
| Retrieval benchmark | 🟡 | Struktur pilot siap, BELUM berlabel |
| Audit manual | 🟡 | Berjalan (triase siap, verdict 0/100) |
| Validasi ID | 🟠 | Temuan terbuka: reproduksi baseline DEV mencatat F1 ID 26,1% vs EN 66,7% — temuan yang harus ditindaklanjuti, bukan aib |
| Klaim "tervalidasi esai ID" | 🔴 | Belum waktunya — dilarang sampai urutan di bawah tuntas |

Urutan wajib: label manual → audit blind → perkuat set ID → mixed →
ablation → untouched test → CI → klaim. Larangan: tanpa tuning ambang agar
cocok data, tanpa klaim kemampuan dari `dataset/`, metrik selalu dipisah
per-bahasa (id/en tidak dicampur).

UI Okt 2026: penyesuaian hero/CTA/maskot/FAQ/fitur/footer untuk mobile +
desktop dilakukan tanpa mengubah logika deteksi; `mobile.css` mengatur
≤1100px, `style.css` khusus desktop, dengan kunci min-1101 untuk trik
tampilan desktop.

*Dokumen ini adalah PRD produk, bukan vonis akademik. Semua skor adalah indikasi yang perlu ditinjau manusia.*
