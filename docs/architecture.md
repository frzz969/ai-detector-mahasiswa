# Architecture — Faraz Detector AI (Struktur Direktori)

Hasil structural refactor (logic, skor, dan UI tidak berubah).
Aturan audit wajib: `referensi/detector-rules.md`, `referensi/humanizer-rules.md`,
`referensi/validation-rules.md` (lihat `AGENTS.md`).

## Pohon direktori

```text
index.html          struktur + semua ID fungsional (script: js/core → js/detector → js/referensi → js/humanizer → js/ai/* → js/main)
  # ID aktual: btnCheck (rail Cek) · btnSummarize/btnExplain + #aiToolsOut (section #hasil, .hasil-tools; rail-card "Ringkasan" dihapus)
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
    summarizer.js   FarazSummarize (extractive verbatim: dedupe Jaccard >0.7, sebar lintas paragraf, keep ~1/5 min 2 maks 5)
    explainer.js    FarazExplain (deskriptif struktur: paragraf/kalimat/bagian/enumerasi/penghubung/data/suara; urutan Explain: material → AI → lokal)
  main.js           render() + doCheck() hybrid + highlight klik (sentExplain) + Summarize/Explain hybrid + validateAiOutput() ke #aiToolsOut (#hasil) + stale-guard export + demo hero
  # score-hero: #aiPct/#humanPct/#mixLbl + ringkas "Merah = cek lagi · Hijau = aman";
  # legenda warna di bawah #highlight: hijau aman · kuning cek · merah tulis ulang
api/                skeleton Vercel gateway — BELUM deploy (key hanya via env, lihat `.env.example`)
  config.js         konstanta timeout/modelId/maxRetry (MAX_CHUNKS=6, ~900 char/chunk cermin localScore)
  analyze.js        POST {v,hash,canonicalText} → {score,confidence,modelId,coverage,hash,v} (Gemini primer, Groq fallback)
  humanize.js       thin proxy parafrasa formal + AI Core Rules
  summarize.js      thin proxy ringkasan setia (spec kompresi SEDANG + few-shot fotosintesis) + AI Core Rules
  explain.js        thin proxy penjelasan indikasi (bahasa indikasi saja) + AI Core Rules
  material.js       fan-out 7 sumber (Wikipedia id+en, Wikidata, OpenAlex, Crossref, Semantic Scholar, PubMed, arXiv) → filter → ranking tier jurnal>wiki → validasi; maks 10; fail-soft per sumber
  .env.example      template env (tanpa secret; key hanya via env)
img/
  icons/            logo + heading (dipakai nav/hero/footer)
  mascot/           maskot + ilustrasi langkah (halo babay.jpg tak terpakai halaman, disimpan di sini)
tests/
  faraztest.js      harness evaluasi (stub DOM; tulis JSON via --out, default .slim/deepwork/)
  dataset.js        registry + loader (baca dataset/*.txt via fs; export tetap { DATASET })
dataset/            evaluation data SAJA — dilarang dibaca detector/JS saat runtime
  train|validation|test/
    human/ | ai/ | ai_edited_human/ | human_edited_human/ | paraphrased/
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

## Catatan komentar

Komentar `js/*.js` + `js/ai/*.js` dirapikan (garis dekorasi/narasi berlebih dihapus; identitas file, dependensi, sitasi aturan, invariant, dan kontrak tak-obvious dipertahankan) — logic tidak berubah.
