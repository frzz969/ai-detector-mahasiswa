# Architecture — Faraz Detector AI (Struktur Direktori)

Hasil structural refactor (logic, skor, dan UI tidak berubah).
Aturan audit wajib: `referensi/detector-rules.md`, `referensi/humanizer-rules.md`,
`referensi/validation-rules.md` (lihat `AGENTS.md`).

## Pohon direktori

```text
index.html          struktur + semua ID fungsional (script: js/core → js/detector → js/referensi → js/humanizer → js/ai/* → js/main)
  # ID aktual: btnCheck (rail Cek) · btnSummarize/btnExplain (tetap di aside.rail card "Ringkasan", index.html:101-105) + #aiToolsOut (pindah ke section #hasil, wrapper .ai-tools-result#aiToolsResult, index.html:116-118)
  # btnCopyHumanize di panel-head #hasil (bukan rail) · #highlight + #sentExplain (klik per kalimat)
  # btnSampleID/btnSampleEN (ghost small) · demo demoAi/demoHuman/demoPct/demoLbl/demoFill/demoText/demoOpen
style.css           DESKTOP saja (biru langit + putih, full-width)
mobile.css          HP/tablet ≤1100px (via media query)
js/
  core.js           DOM refs, state, AI_PHRASES, konstanta batas
  referensi.js      data referensi + REF_HUMANIZE_EXTRA + REF_RULE_DOCS
  detector.js       heuristic() + splitReferences() + cleanAcademic() + model lokal opsional
  humanizer.js      humanizeSentence()/humanizeText() + verdict + restore + Copy fallback salin aiToolsOut
  ai/
    preprocess.js   FarazPre (hash/v + canonicalText; wrapper splitReferences/cleanAcademic/splitSentences)
    client.js       FarazAIClient (POST /api/analyze, timeout 15 dtk, echo hash/v, taksonomi reason jujur)
    combine.js      FarazCombine (evidence-based: bobot confidence×coverage×bahasa, cap supremacy +5, gap ≥30)
    validate.js     FarazValidate (10 checks murni + gerbang regresi +10)
    status.js       FarazStatus (label per tahap hybrid: preparing/local/ai/combining/validating/done)
    summarizer.js   FarazSummarize (fallback ekstraktif verbatim: dedupe Jaccard >0.7,
                                  penalti kalimat generik + kalimat bergantung,
                                  sebar lintas paragraf, keep ~1/5 min 2 maks 5)
    explainer.js    FarazExplain (deskriptif struktur: paragraf/kalimat/bagian/enumerasi/penghubung/data/suara; urutan Explain: material → AI → lokal)
  main.js           render() + doCheck() hybrid + highlight klik (sentExplain) + Summarize/Explain hybrid + validateAiOutput() ke #aiToolsOut (#hasil) + stale-guard export + demo hero
  # score-hero: #aiPct/#humanPct/#mixLbl + ringkas "Merah = cek lagi · Hijau = aman";
  # legenda warna di bawah #highlight: hijau aman · kuning cek · merah tulis ulang
api/                Vercel serverless (live; key hanya via env, lihat `.env.example` di root)
  config.js         konstanta timeout/modelId/maxRetry (MAX_CHUNKS=6, ~900 char/chunk cermin localScore)
  analyze.js        POST {v,hash,canonicalText} → {score,confidence,modelId,coverage,hash,v} (Gemini primer, Groq fallback)
  humanize.js       thin proxy parafrasa formal + AI Core Rules
  summarize.js      thin proxy ringkasan abstractive-terjaga (spec kompresi SEDANG +
                    few-shot fotosintesis + AI Core Rules; facts gate di klien)
  explain.js        thin proxy penjelasan indikasi (bahasa indikasi saja) + AI Core Rules
  material.js       fan-out 7 sumber (Wikipedia id+en, Wikidata, OpenAlex, Crossref, Semantic Scholar, PubMed, arXiv) → filter → ranking tier jurnal>wiki → validasi; maks 10; fail-soft per sumber
  contact.js        POST form kontak/rate-limit (tidak tercakup PRD §15, endpoint mandiri)
img/
  icons/            logo + heading (dipakai nav/hero/footer)
  mascot/           maskot + ilustrasi langkah (halo babay.jpg tak terpakai halaman, disimpan di sini)
tests/
  faraztest.js      harness evaluasi (stub DOM; tulis JSON via --out, default .slim/deepwork/)
  dataset.js        registry + loader (baca dataset/*.txt via fs; export tetap { DATASET })
dataset/            evaluation data SAJA — dilarang dibaca detector/JS saat runtime
  train|validation|test/
    human/ | ai/ | ai_edited_human/ | human_edited_ai/ | paraphrased/
    └─ <id>.txt  (isi teks byte-identik dari registry lama; metadata di tests/dataset.js)
docs/
  PRD.md            PRD produk (pindahan dari root, isi substantif tetap)
  architecture.md   file ini (struktur direktori saja)
referensi/          dokumen aturan + referensi-1..8 (tidak dipindah, tidak diubah)
.slim/deepwork/     area deepwork yang diabaikan git (.gitignore):
  upgrade-akurasi.md  state deepwork (tetap)
  audit/              ai-detector-audit.md (bukan dependency aplikasi)
  reports/            final-report.md (bukan dependency aplikasi)
  benchmarks/         bench.js, compare-baseline.js, smoke-render.js + *.json
                      (bukan dependency aplikasi)
```
## Catatan pemetaan dataset

- `label human → human/`, `label ai → ai/`,
  `mixed/ai-edited-human → ai_edited_human/`,
  `mixed/human-edited-ai → human_edited_ai/`; metadata `category` asli utuh di `tests/dataset.js`.
- Deviasi: `mixed/paraphrased` tidak ada di target → direktori tambahan
  `paraphrased/` per split (2 item: `va-mixed-paraphrase`, `te-mixed-paraphrase`);
  label/ground truth tidak diubah, tidak ada item dibuang.

## Catatan urutan script

Urutan `<script>` di `index.html` dipertahankan berurutan dengan tambahan hybrid
(`js/core → js/detector → js/referensi → js/humanizer → js/ai/preprocess → js/ai/client → js/ai/combine → js/ai/validate → js/ai/status → js/ai/summarizer → js/ai/explainer → js/main`);
hanya prefix path yang berubah (`./` → `./js/`), modul `js/ai/*` disisipkan sebelum `js/main.js`.
Catatan: harness Node (`tests/faraztest.js`, `eval/run.js`) memuat `js/core → js/referensi → js/detector → js/humanizer`
(urutan `detector`/`referensi` tertukar vs browser) — aman dan setara, karena `detector.js`/`humanizer.js`
hanya memakai `AI_PHRASES`/`REF_*` di dalam badan fungsi (call-time), bukan saat load.

## Alur runtime (pipeline data)

```text
INPUT (index.html — UI/DOM)
  ↓
core.js (state + DOM refs + AI_PHRASES + konstanta batas)
  ↓
PREPROCESS — js/ai/preprocess.js (FarazPre.preprocess; main.js:357)
  canonicalText + hash/v + wrapper splitReferences/cleanAcademic/splitSentences
  ↓
  ┌─────────────────────────────┴──────────────────────────────┐
  ▼                                                            ▼
LOCAL DETECTOR                                               AI OPSIONAL
js/detector.js heuristic()                                   js/ai/client.js (FarazAIClient.analyze; main.js:385)
  10 sinyal + academic dampening +                            POST /api/analyze {v,hash,canonicalText}
  single-signal cap + short-text cap                          gagal → hasil lokal dipertahankan + pesan jujur
  │                                                            │
  └─────────────────────────────┬──────────────────────────────┘
                                ▼
COMBINE — js/ai/combine.js (FarazCombine.combine; main.js:407)
  bobot confidence×coverage×bahasa, supremacy cap +5, agreement gap ≥30
                                ▼
VALIDATE — js/ai/validate.js (gerbang regresi; main.js:418)
  FarazValidate.checks.regression(origScore → revScore)
                                ▼
FINAL — js/main.js render() (satu-satunya penulis skor)
  skor + verdict indikasi + confidence + method/status (FarazStatus)
                                ▼
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
Highlight klik              Summarize                 Explain
(#highlight +               AI → lokal                material → AI → lokal
 #sentExplain)               (main.js:683-705)         (main.js:723-777)
         │                    FarazSummarize            FarazExplain
         ▼                    (fallback ekstraktif)      (deskriptif struktur)
Export (stale-guard: hanya dari hasil final segar)
Humanize terpisah: js/humanizer.js (formal→formal + verdict
  BETTER/EQUIVALENT/WORSE + restore; AI opsional via FarazAIClient.humanize)
```

## Tiga pipeline terpisah

Detector, Summarizer, dan Explainer TIDAK satu pipeline. Ringkasan dan
penjabaran memakai **select-or-fallback** (AI valid → tampil, invalid → lokal),
bukan `combine` — tidak ada dua ringkasan/penjabaran yang bisa di-blend.
Detail + alasan: `docs/PRD.md` §19.

```text
F-21 DETECTOR — lokal & AI PARALEL
  INPUT → PREPROCESS → ┌LOCAL heuristic()┬AI /api/analyze┐
                       └──────┬───────────┴───────────────┘
                              ↓ COMBINE (evidence-based)
                              ↓ VALIDATE (gerbang regresi >+10)
                              ↓ RENDER → SKOR + VERDICT

F-22 SUMMARIZER — select-or-fallback
  INPUT → /api/summarize → 9 check fakta → VALID? → AI ringkasan
                                           → INVALID → FarazSummarize (ekstraktif)

F-23 EXPLAINER — select-or-fallback
  INPUT → /api/material → /api/explain → 5 check fakta
         → VALID? → AI penjelasan  |  → INVALID → FarazExplain (deskriptif)

AI TRUST EVALUATION — offline, developer, BUKAN bagian runtime
  DATASET → ┌LOCAL metrics┬AI metrics┐ → COMPARE → QUALITY GATE → TRUST / NO TRUST
  (tests/ai-live-eval.js, eval/run.js — bukan file di request user)
```

Lapisan konsep: Core (state) → Input (preprocess) → Detection (heuristik lokal)
→ Intelligence (AI + combine + validate) → Tools (summarize/explain/humanize)
→ Presentation (render/highlight/export). `main.js` adalah orchestrator +
satu-satunya penulis skor; pemisahan lebih jauh ditunda (risiko > manfaat).

## Catatan komentar

Komentar `js/*.js` + `js/ai/*.js` dirapikan (garis dekorasi/narasi berlebih dihapus; identitas file, dependensi, sitasi aturan, invariant, dan kontrak tak-obvious dipertahankan) — logic tidak berubah.
