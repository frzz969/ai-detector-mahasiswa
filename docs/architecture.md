# Architecture — Faraz Detector AI (Struktur Direktori)

Hasil structural refactor (logic, skor, dan UI tidak berubah).
Aturan audit wajib: `referensi/detector-rules.md`, `referensi/humanizer-rules.md`,
`referensi/validation-rules.md` (lihat `AGENTS.md`).

## Pohon direktori

```text
index.html          struktur + semua ID fungsional (script: js/core → js/detector → js/referensi → js/humanizer → js/main)
style.css           DESKTOP saja (biru langit + putih, full-width)
mobile.css          HP/tablet ≤1100px (via media query)
js/
  core.js           DOM refs, state, AI_PHRASES, konstanta batas
  referensi.js      data referensi + REF_HUMANIZE_EXTRA + REF_RULE_DOCS
  detector.js       heuristic() + splitReferences() + cleanAcademic() + model lokal opsional
  humanizer.js      humanizeSentence()/humanizeText() + verdict + restore
  main.js           render() + doCheck() + stale-guard export + demo hero
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

Urutan `<script>` di `index.html` dipertahankan persis seperti sebelum refactor
(`js/core → js/detector → js/referensi → js/humanizer → js/main`);
hanya prefix path yang berubah (`./` → `./js/`).
