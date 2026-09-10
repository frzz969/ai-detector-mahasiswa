# AI Detector Audit & Improvement — Deepwork

## Goal
Audit, research, improve, and auto-fix the Faraz Detector AI project. Improve AI vs Human detection accuracy, reduce false positives, maintain UI (NO redesign).

## Architecture (from scan)
- **Stack**: Pure frontend (HTML + CSS + JS), no backend, runs entirely in browser
- **Files**:
  - `js/core.js` — DOM refs, state, AI_PHRASES, constants
  - `js/detector.js` — `heuristic()` (10 signals + academic dampening + single-signal cap + short-text cap), `splitReferences()`, `cleanAcademic()`, local model (Xenova/roberta-base-openai-detector) optional
  - `js/referensi.js` — reference data
  - `js/humanizer.js` — paraphrase + regression guard
  - `js/main.js` — render/doCheck/export/demo
  - `index.html` — UI (DO NOT MODIFY per user rule)
  - `style.css`/`mobile.css` — styling (DO NOT MODIFY)
- **Pipeline**: Input → splitReferences → cleanAcademic → heuristic(10 signals) → optional local model → ensemble 50/50 → render
- **10 existing signals**: (1) burstiness std/mean, (2) TTR+phrases, (3) connector rate, (4) 12-28 word pattern, (5) personal voice, (6) lively marks, (7) concrete data, (8) opener repetition, (9) idea-repetition (bag overlap), (10) fluffy template + voice. Plus academic dampening, single-signal cap, short-text cap, base +22, clamp 2-98.

## Research (websearch, librarian lane down w/ model config error)

### ZeroGPT (DeepAnalyze™)
- **KNOWN**: Multi-stage classifier: perplexity (word predictability), burstiness (sentence length/structure variation), + vocabulary distribution, semantic coherence, transition smoothness in ensemble; trained on proprietary corpus; sentence-level highlighting; per-sentence analysis. Publically documented as such on zerogpt.tech + zerogpt.com.
- **KNOWN**: Known false-positive patterns: formal academic writing, ESL/non-native writing, short passages (documented by CASRAI + Stanford HAI + independent reviews).
- **KNOWN**: Does not publish audited accuracy or training methodology.
- **INFERENCE**: Multi-stage = macro (doc metrics) → micro (sentence-level probability). Ensemble weights unknown.
- **UNKNOWN**: Exact architecture, thresholds, ensemble weights, internal features.

### Modern approaches (sources: arXiv 2603.23146, 2604.16607, 2605.01647, 2607.03680, ACL ALTA 2024, SenDetEX EMNLP 2025, SeqXGPT, GPTZero support)
- Perplexity/burstiness: cheap, degrade on modern LLMs; structural overlap with careful formal writing → FP source.
- **Paragraph count is a top learned feature**: single-paragraph texts flagged AI; multi-paragraph human-like (arXiv 2603.23146).
- GZIP compression ratio captures textual regularity (compression-based signal, domain-confounded).
- **Short texts: misclassification clusters at 14–34 words** (FN modal 14 words, FP modal 34 words).
- Neural detectors (RoBERTa/XLM-R): strong in-domain, brittle cross-domain; distribution shift → high-confidence FPs.
- Char/letter distribution signatures (LD-Score): orthogonal to perplexity (r=0.08–0.13), cheap, robust vs temperature attacks.
- Sentence-level: context fusion (neighbor sentences) beats isolated scoring; doc-level aggregation naïve avg/sum is imprecise → calibration needed; median/percentile/outlier handling better; proportion of AI-like sentences is a strong signal; mixed human-AI documents need sentence-level focus (SenDetEX).
- Confidence should reflect: length, signal disagreement (variance), borderline proximity (arXiv 2607.03680 confidence-weighted ensembles; low-FPR metrics for deployment).
- **ESL/formal FP mechanism** (Stanford HAI 2023, THE): non-native/formal writers naturally use lower-perplexity, more uniform language — same statistical signature as AI. 61.22% FP on TOEFL. Mitigation: dampen AI score in formal/academic/high-context writing; weight-context signals.

## Audit Findings (current code)
1. **No perplexity/predictability proxy at all** when model offline; 10 signals are surface stats only.
2. **Burstiness = sentence length CV only**; no variation of diction/structure/paragraph; paragraph structure is DESTROYED by cleanAcademic flattening (`\s+` → " ") — paragraph count & variance lost.
3. **Sentence scores are doc-anchored**: sentScores = pts*0.5 + small deltas → per-sentence distribution compressed around doc score; highlight colors track doc score, not independent sentence evidence.
4. **Aggregation naive**: doc score from signal sums, not from sentence-score distribution; no median/percentile/outlier/proportion-of-AI-like-sentences handling.
5. **No mixed-text semantics**: 70/30 splits force into one number; render() band >=50 "Campuran" is the only mixed signal.
6. **No confidence/calibration at all**: no length-based/signal-agreement/borderline confidence; "Confidence: rendah/sedang/tinggi" promised by detector-rules.md but not output.
7. **Thresholds hardcoded bands (75/50/30)** in render(); not calibrated.
8. **Indonesian + model**: roberta-base-openai-detector is English-trained; 50/50 ensemble trusts it equally on ID text — measurable bias risk for Indonesian formal text.
9. **Model coverage weighting**: localScore caps at 6 chunks of 900 chars (~5400 chars); if only n/of chunks read, 50/50 weight still applies to partial coverage (reported but not reweighted).
10. **TTR length-dependent**, used with guards (ok), but no character-level (LD-style) or n-gram repetition signal.
11. Idea-repetition loop: counts pairs with early break; acceptable.
12. Short text cap 40 is generous → short human text still shows "Indikasi ringan"; literature says 14-34 words is worst zone → cap lower + low confidence.

## Improvement Design (evidence-based, local, no deps, no UI change)
- A. Preserve paragraph count/variance: count paragraphs before flattening; >=2 paras & varied para lengths → mild human signal (lit: single-paragraph bias).
- B. Add LM-free predictability/predictability-adjacent signals: n-gram repetition rate (bigram/trigram type ratio), word-length CV (uniform word lengths = mechanical), function-word ratio via small ID/EN stopword lists.
- C. Broaden burstiness: combine sentence-length CV + word-length CV + paragraph-length CV + opener diversity (existing).
- D. Sentence-level independent scoring: per-sentence signal stack (phrase hits, template, personal, lively, length vs neighbors, opener repetition, sentence length band) → sentence score NOT anchored to doc pts.
- E. Doc aggregation: weighted blend of median sentence score + AI-like-sentence proportion + signal-derived score; variance of sentence scores → confidence (disagreement → lower confidence).
- F. Confidence: computed from text length, sentence-score variance, model coverage, language/context; output as "confidence: rendah/sedang/tinggi" in verdict small-print (text only).
- G. Language detection (ID vs EN by function-word ratio) → weight local model less for ID text (e.g., 0.30/0.70 vs 0.50/0.50); report honestly.
- H. Short text: cap <= 35 for <50 words; <30 words → confidence rendah + strong damping; never extreme scores.
- I. Keep public API identical: heuristic() returns {score, reasons, sentScores, sents, detail}; extend detail + add confidence/classification fields; render() keeps bands but labels via existing mixLbl + verdict text.
- J. Threshold re-eval on TUNING set only (never test set).

## Implementation Phases (gates)
- [x] Phase 0: Scan + research (done)
- [x] Phase 1: Baseline benchmark harness + dataset → run BEFORE changes (bench-detect-all.json baseline)
- [x] Phase 2: detector.js core improvement (A–I) — implemented 2026-09-10
- [x] Phase 3: main.js render integration (language-weighted ensemble, confidence, sentStats text)
- [x] Phase 4: Post-change benchmark + tuning (on tuning set only) + regression + node --check + grep forbidden
- [x] Phase 5: Gate review — @oracle/@councillor lanes DOWN (model config errors: gpt-5.6-sol, gpt-5.6-terra). Review done in-orchestrator with oracle checklist (findings: approve; nitpicks fixed — confidence threshold 0.68→0.75, header comment).
- [ ] Phase 6: Final report

## Execution Log + Benchmark Results
Baseline (Before, bench-detect-all.json):
- human: n=9 avg=15.0 range=[2,53] — FP: t-human-formal-academic=53 (mid!), e-human-with-data=34
- ai: n=7 avg=52.7 range=[22,81] — FN: t-short-ai=22, e-short-ai-30=40
- mixed: n=2 avg=26.0 range=[26,26]
- thr=50: acc=81.3% TP=5 FN=2 FP=1 TN=8 (FP-rate=11.1%) | thr=75: acc=62.5% TP=1 FN=6 FP=0

Changes (log):
1. core.js: pruned academic-normal phrases out of AI_ID → ACAD_NEUTRAL (detector-rules §3) + ID_FW/EN_FW word lists.
2. detector.js heuristic(): + paragraph count/CV (before flatten), + word-length CV, + bigram/trigram diversity, + ID/EN language detect, + HEDGE_PATS (generic-benefit template phrases), + enumeration-start patterns, + neutral-phrase-density-without-substance rule, + independent sentence scoring (anchor 30, context fusion smoothing), + distribution-aware aggregation (median + AI-like proportion, blended only when sentence spread high), + confidence (len/spread/borderline), floor 15, short-text cap 45.
3. main.js render(): language-weighted ensemble (id 0.35-0.65 / en 0.5) scaled by model coverage; confidence + lang + sentStats in text; buildPrint + confidence.

After (current, bench-detect-all.json):
- human: n=9 avg=17.8 range=[14,24] — NO FPs, all <30 after enum-start anchor fix (e-human-en-personal 34→24)
- ai: n=7 avg=56.6 range=[34,97] — t-ai-demo=68, t-ai-formal=97, t-short-ai=34, e-ai-casual=46, e-ai-translated=50, e-short-ai-30=45, e-ai-en-generic=56
- mixed: n=2 avg=25.5 range=[24,27]
- thr=50: acc=81.3% TP=4 FN=3 FP=0 TN=9 (FP-rate=0.0%) | thr=75: acc=62.5% TP=1 FN=6 FP=0
- humanize: reverted-up=0 (no regression); humanize-delta human -2.6 / ai -11.0 (improves, never +10)

Tuning decisions (tuning set only): restored "perlu diingat" to AI_ID (generic advisory, not §3 academic); HEDGE_PATS benefit phrases; enumeration anchored to sentence start (avoid "first day"/"finally" natural-English FPs); floor 15; aiLike threshold 50; blendW (spread-8)/24 max 0.6.

Qualitative:
- e-ai-casual 46 = "Indikasi ringan" (honest, casual listicle); e-short-ai-30 45 mid; t-short-ai 34 mid (23 words, confidence rendah) — documented limitations.
- Demo (DEMO_AI==t-ai-demo) 68 "Campuran" same label as Before (54); DEMO_HUMAN==t-human-demo 15 "Cenderung natural".

## Validation
- node --check all changed js files
- harness loading core→referensi→detector→humanizer with DOM stub
- Regression: demo AI high, demo human low, short-text capped, formal academic not overflagged, humanizer no regression
- Before/After metrics on same dataset (split: tuning/test)