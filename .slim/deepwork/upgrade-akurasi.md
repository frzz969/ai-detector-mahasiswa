# Upgrade Akurasi — Deepwork State

## Goal
Implementasi MASTER PROMPT upgrade akurasi Faraz Detector AI tanpa merusak fitur berjalan, tanpa redesign visual, tanpa backend, tanpa klaim absolut. Prioritas: akurasi > konsistensi > FP control > explainability > performance > maintainability.

## Accepted context (jangan riset ulang)
- Prior work: `.slim/deepwork/ai-detector-audit.md` (103 baris, Phase 0-5 done, Phase 6 pending) + `.slim/deepwork/final-report.md` (80 baris).
- Baseline bench: `.slim/deepwork/bench-detect-all.json` (before), `.slim/deepwork/bench.js`, `.slim/deepwork/smoke-render.js`, `.slim/deepwork/compare-baseline.js`.
- Peta kode (lihat AGENTS.md): `core.js` DOM/state/batas, `detector.js` heuristic, `referensi.js` data+provenance, `humanizer.js` regression guard +10, `main.js` render/stale-guard/demo, `index.html` ID fungsional, `style.css` desktop / `mobile.css` ≤1100px.
- Aturan audit wajib: `referensi/detector-rules.md`, `referensi/humanizer-rules.md`, `referensi/validation-rules.md`.
- Temuan prior: FP akademik 53→23, FP-rate 11.1%→0.0%, floor 15, cap 45 (<50 kata), ensemble bahasa di main.js, confidence len/spread/borderline, sentence scoring independen anchor 30 + smoothing, agregasi median+proporsi blendW 0-0.6.

## Gap ke Master Prompt (hipotesis, perlu validasi Oracle P0)
1. Fixed prior +22 masih ada? Audit lama sebut base +22, clamp 2-98. Master §7 minta hapus → evidence-based adjustment.
2. Skor ditampilkan sebagai probabilitas? Master §8 minta Indication Score /100 + wording bukan probabilitas.
3. Evidence grouping Strong/Medium/Weak + caps per grup (§9, §42) belum eksplisit; double-counting burst/uniformity/length (§41) belum diaudit formal.
4. Academic context LOW/MEDIUM/HIGH (§11) belum ada sebagai fungsi terpisah; dampening global vs selektif perlu dipisah.
5. Short-text constants (§13, §40) perlu dinamai: SHORT_TEXT_CAP dsb, bukan magic numbers tersebar.
6. Document-level (§15) + consistency sebagai confidence modifier (§16) sudah parsial (median+proporsi+spread) — perlu validasi vs spek master.
7. Human-like offset (§43) parsial (personal −28, data −8) — perlu batas agar bukan proof-human.
8. Language-aware fusion confidence-aware (§18, §20) parsial (ID 35/65, EN 50/50 + coverage scaling) — perlu cek model contribution=0 bila coverage rendah.
9. Calibration layer raw vs calibrated (§21) + threshold tuning validation-only (§22, §29) belum terpisah.
10. Harness metrics Accuracy/Precision/Recall/F1/FPR/FNR + confusion matrix + per-category (§24-27) + dataset train/val/test (§28-29) + AI-edited handling (§30) — bench ada 18 teks, perlu perluasan kategori.

## Phased plan (delivery boundaries, bukan split kecil)
- Fase 1: Harness + dataset + metrics (P1-P2 master). Owner: fixer (harness/dataset), oracle gate 1.
- Fase 2: Core scoring (hapus +22, magic numbers → constants, evidence groups+caps, academic context, short-text, single-signal, language-aware, human-like). Owner: fixer, oracle gate 2.
- Fase 3: Sentence/doc/consistency/confidence/calibration/fusion/verdict + humanizer regression + UI integration + final QA. Owner: fixer, oracle gate 3.

Gate order + rationale:
1. Gate 1 (harness/dataset): pastikan tuning tidak pakai test, metrics per-kategori benar — cegah overfit sebelum ubah skor.
2. Gate 2 (core scoring): risiko tertinggi (FP regresi) — review bobot, caps, double-counting.
3. Gate 3 (final): validasi acceptance §45, stale-export, forbidden claims, mobile 360/390/430, report §49.

Oracle budget: 1 review + max 2 re-review per gate. State attempt di tiap prompt.

## Todos aktif
Lihat opencode todo list (fase setup in_progress).

## P0 Reconciled (ora-1 ses_f5acddbf3ffeMeecd7f254y1Ar)
- +22 masih ada di detector.js:383 `pts=max(15,min(98,pts+22))` → hapus di Fase 2.
- Wording probabilitas di main.js:41-60,115,366-367 → jadi Indication Score di Fase 3.
- Flat pts+= tanpa groups/caps; double-count ritme (burst+ideal 12-28+rhythmPos+paraCV/wlCV) + template (hits+hedge+fluffy+neutral scaffolding +18); single-signal hanya damp+10 parsial; posSig inkonsisten.
- Academic boolean inline (acaMarkers/strongAcad) + damp global DAMP_CAP=14 → pisah academicContext() LOW/MED/HIGH + damp selektif di Fase 2.
- Short-text ambang tersebar (80/60/50/40, cap 45) + MIN_WORDS=20 tidak selaras → constants bernama di Fase 2.
- Fusion ID 0.25/EN 0.5 + modW=base*(0.5+0.5*cov) belum floor-0 saat coverage rendah → floor-0 di Fase 2/3.
- Sentence anchor 30 + smoothing 0.88/0.06/0.06, agregasi median*0.35+prop*0.65 blendW=(spread-8)/24 max 0.6 — arah benar tapi konstanta tak bernama → rapikan Fase 3.
- Human-like tanpa HUMAN_LIKE_MAX eksplisit; confidence thresholds 0.75/0.45 + faktor magic; threshold 75/50/30 hardcode → constants + calibration raw vs calibrated di Fase 3.
- TIDAK diubah: humanizer revert +10, verdict ±3, stale-guard/export-block, demo heuristic() asli, REF_HUMANIZE_EXTRA formal.

## Validation results
- P0: oracle gap done (read-only, no code change).
- Fase 1 (fix-1 ses_f5acc6568ffe0qf9T3snZppS2N): faraztest.js 218 baris + test-data/dataset.js 198 baris (34 item, train 11/val 10/test 13 FREEZE). node --check lolos. Smoke S1-S5 lolos. Split=test thr=50: Acc 70%, Prec 100%, Rec 25%, F1 40%, FPR 0%, FNR 75% (n=10). Baseline drift t-ai-demo 68→58 = pre-existing (0791048), bukan regresi Fase 1; baseline dipulihkan. Grep forbidden user-facing BERSIH (hit hanya komentar internal). Scoring detector/main/humanizer TIDAK diubah.
- Gate 1 (ora-2 ses_f5ab6f07cffelGmKZD3w1utG9a): APPROVE with nits. Freeze train/val/test SAH, confusion benar, FPR 0% aset dipertahankan. Guardrails Fase 2: (a) FPR academic-human/formal tetap 0%; (b) recall/F1 train+val naik vs baseline, test hanya dilaporkan; (c) no tuning pakai test; hapus +22 wajib kompensasi (bukan standalone); lapor ternary + biner; isolate mobile.css 41 baris + PRD.md untracked dari diff scoring; fix label tr-ai-academic→ai/academic; pin baseline hash; length bias (50-72 kata, nol 200+) dinyatakan skop short-medium kecuali tambah teks panjang.
- Fase 2 (fix-2 ses_f5ab4f597ffek8E5VUs00fnXbN): +22 dihapus → anchor+grup ter-cap; academicContext() LOW/MED/HIGH + damp selektif; constants bernama di core.js:96-126; groups TEMPLATE_MAX/RHYTHM_MAX/STRUCTURE_MAX/LEXICAL_MAX + HUMAN_LIKE_MAX 14; single-signal cap 60 + posSig selaras; label tr-ai-academic fixed. Diff murni: core.js +31, detector.js ±191, mobile.css tetap 41 pre-existing (tak disentuh), main.js/humanizer/index.html/css lain tak disentuh. node --check lolos (verif orchestrator). Train Acc90/F1 85.7/Rec75/FPR0 (ceiling, tr-short-ai FN by-design); val Acc87.5/F1 85.7/Rec75/FPR0 (naik dari 62.5/40/25); test Acc70/F1 40/Rec25/FPR0 (lapor saja). Ternary train 7/2/2, val 6/4/0, test 9/4/0. FPR human 0% semua split. Baseline hash HEAD 8c07a15.
- Gate 2 (ora-3 ses_f5aa942faffeaf9uYSZonalr4g): APPROVE with nits. Hapus +22 terkompensasi (anchor+grup ter-cap); TEMPLATE/STRUCTURE/LEXICAL efektif, residu RHYTHM_MAX 20 + double-damp ritme kecil (cleanup Fase 3); academic selektif + posSig konsisten + cap 60 benar, tapi MIN_RELIABLE_W=80 membuat cap+acadDamp dorman di >90% data (uji 200+ kata Fase 3); HUMAN_LIKE_MAX 14 aman di set ini tapi agresif + triple-upward di n kecil (no tuning tambahan tanpa teks panjang); guardrails Gate 1 terpenuhi; trio test-AI 44/46/48 rapuh (jangan sentuh ambang pakai test); mobile.css +41 tetap di tree (rapikan sebelum commit); va-ai-generic humanize +12 input wajib Fase 3.
- Fase 3 (fix-3): dataset +3 long (tr-human-academic-long 229, tr-ai-long 214, va-human-academic-long 211; TEST FROZEN tak disentuh); detector: rhythmDiscounted flag (weakPool tak diskon ulang gRhythm), consistency reason eksplisit (spread>18, confidence-only), detail.rawScore+calibratedScore (display=calibrated); main: fusion floor-0 (cov<0.5/unknown→0, bobot bahasa tetap), wording Skor indikasi /100 + bukan probabilitas (verdict/buildPrint/txt/stats), ambang cermin THR_*_DOC; humanizer: merge-guard 3b (batal gabungan bila >+10, root-cause va-ai-generic: merge 5→4 kalimat tanpa cek 1b → connRate + median naik). Train Acc91.7/F1 88.9/Rec80/FPR0 (hold-or-better vs 90/85.7/75); val Acc88.9/F1 85.7/Rec75/FPR0 (vs 87.5/85.7/75); test Acc70/F1 40/Rec25/FPR0 identik (lapor saja). Ternary train 7/5/1, val 6/5/0, test 8/5/0. Humanize regresi Δ>+5 = 0 semua split (va-ai-generic +12→+0). Long-text groups: acad HIGH/MED, acadDamp 4/6 aktif, HUMAN_LIKE cap 14 mengikat, RHYTHM cap 20 mengikat (tr-ai-long), raw81→cal79. S1-S5 lolos 3 split; stale-export headless OK (check→ok, ubah→blocked, rescan→ok; floor-0 unknown-cov→0); forbidden user-facing BERSIH (3 hit = komentar internal/regex harness). core.js/mobile.css tak disentuh Fase 3 (diff pre-existing).
- Gate 3 FINAL (ora-4 ses_f5a9dbd24ffeNEHMn6XrliYFZ9): APPROVE with nits. Rhythm cleanup + consistency-confidence-only BENAR; raw vs calibrated SANE (display=calibrated, raw di stats/print/txt/lastResult); floor-0 + wording non-probabilistik + threshold mirror AMAN; humanizer root-cause + guard 3b TEPAT (va-ai-generic +12→+0, alur BETTER/±3/WORSE/REVERT/restore/rescan utuh); acceptance §45 lolos (S1 short-cap, S2 akademik 14-20, S3 single 19, mixed uncertain, referensi tak diubah, model-off fallback); FPR 0% semua split; test identik (no tuning); stale text-only; mobile tanpa rename ID. Nits: higiene tree (pisahkan commit scoring vs CSS sebelum DONE), harness belum ekspor raw/groups, va-ai-rewritten 36 + trio 44/46/48 rapuh diterima sebagai batas short-medium.

## Blockers / follow-ups
- Oracle lanes pernah DOWN (model config error gpt-5.6-sol/terra) — fallback: in-orchestrator checklist bila oracle gagal.
- .gitignore tidak ada di root — perlu tambah `.slim/deepwork/` bila buat file baru (cek duplikat).
