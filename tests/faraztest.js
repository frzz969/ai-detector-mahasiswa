// faraztest.js — Harness Fase 1 Deepwork (ukur saja, JANGAN tuning).
//
// Aturan pakai: validation-rules §6 (harness node heuristic+humanizeText asli),
// detector-rules §7 (kasus uji), detector-rules §6 + validation-rules §5
// (bahasa terlarang). Threshold pakai yang ada (50/75/30) — tanpa tuning.
// Load: core → referensi → detector → humanizer → main dengan stub DOM.
//
// FREEZE (Gate 1): split "test" held-out; harness ini TIDAK memuat kode
// pencarian threshold/bobot apa pun. Angka test hanya dilaporkan.
// Cara pakai: node tests/faraztest.js [--split=train|validation|test|all] [--out=path]
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, ".."); // repo root (harness tinggal di tests/)
const { DATASET } = require(path.join(ROOT, "tests", "dataset.js"));

// Threshold EKSISTING (main.js:52-56, bench.js classify) — Fase 1 dilarang tuning.
const THR_STRONG = 75; // >=75 indikasi kuat
const THR_MID = 50;    // >=50 campuran/AI (batas biner harness)
const THR_HUMAN = 30;  // <30 cenderung natural

// ---------- Stub DOM (cukup agar main.js bisa load + runDemo + updateWC) ----------
function makeEl() {
  return {
    value: "", textContent: "", innerHTML: "", hidden: false, disabled: false,
    files: [], onclick: null, title: "", className: "", checked: false,
    style: {},
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    addEventListener() {}, removeEventListener() {},
    scrollIntoView() {}, focus() {}, select() {}, click() {},
    setAttribute() {}, getAttribute: () => null,
    appendChild() {}, querySelectorAll: () => [],
  };
}
const elCache = {};
const documentStub = {
  getElementById: (id) => (elCache[id] || (elCache[id] = makeEl())),
  querySelectorAll: () => [],
  createElement: () => makeEl(),
  execCommand: () => false,
};

function loadSources() {
  const files = ["js/core.js", "js/referensi.js", "js/detector.js", "js/humanizer.js", "js/main.js"];
  const code = files.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n");
  const factory = new Function(
    "document", "window", "navigator",
    code + "\n;return {heuristic, splitReferences, cleanAcademic, splitSentences," +
    " words, countWords, humanizeText, humanizeSentence, render, doCheck, markStale};"
  );
  return factory(documentStub, {}, {});
}

// ---------- Klasifikasi biner harness (thr eksisting 50, bukan tuning) ----------
const predAI = (score) => score >= THR_MID;
const cls3 = (score) => (score >= THR_STRONG ? "ai" : score < THR_HUMAN ? "human" : "mid");

function binaryMetrics(rows) {
  // mixed dikecualikan dari metrik biner (dilapor terpisah sebagai distribusi).
  const pure = rows.filter((r) => r.label !== "mixed");
  let tp = 0, fn = 0, fp = 0, tn = 0;
  pure.forEach((r) => {
    const p = predAI(r.score);
    if (r.label === "ai" && p) tp++;
    else if (r.label === "ai") fn++;
    else if (p) fp++;
    else tn++;
  });
  const n = tp + fn + fp + tn;
  const acc = n ? (tp + tn) / n : 0;
  const prec = tp + fp ? tp / (tp + fp) : 0;
  const rec = tp + fn ? tp / (tp + fn) : 0;
  const f1 = prec + rec ? (2 * prec * rec) / (prec + rec) : 0;
  const fpr = fp + tn ? fp / (fp + tn) : 0;
  const fnr = tp + fn ? fn / (tp + fn) : 0;
  return { n, tp, fn, fp, tn, acc, prec, rec, f1, fpr, fnr };
}

const pct = (x) => (x * 100).toFixed(1) + "%";
const avg = (a) => (a.reduce((x, y) => x + y, 0) / Math.max(1, a.length));

// Klaim terlarang pada output user-facing (detector-rules §6, validation-rules §5).
const FORBIDDEN = /100% AI|pasti AI|pasti manusia|dijamin|bebas AI|khas AI/i;

// ---------- Main ----------
const args = process.argv.slice(2);
const splitArg = ((args.find((a) => a.startsWith("--split=")) || "--split=all").split("=")[1]);
const outArg = (args.find((a) => a.startsWith("--out=")) || "").split("=").slice(1).join("=");

let api;
try {
  api = loadSources();
} catch (e) {
  console.error("FATAL: gagal load core→referensi→detector→humanizer→main:", e.message);
  process.exit(2);
}
// Bukti main.js ikut ter-load headless: updateWC() tulis "0 kata", runDemo() tulis "NN%".
const bootOK =
  elCache.wordCount && elCache.wordCount.textContent === "0 kata" &&
  elCache.demoPct && /^\d+%$/.test(elCache.demoPct.textContent);
console.log(`boot main.js headless: ${bootOK ? "OK" : "GAGAL"} (wordCount="${elCache.wordCount && elCache.wordCount.textContent}", demoPct="${elCache.demoPct && elCache.demoPct.textContent}")`);

let items = DATASET;
if (["train", "validation", "test"].includes(splitArg)) items = DATASET.filter((t) => t.split === splitArg);

const rows = items.map((t) => {
  const heu = api.heuristic(t.text);
  const w = api.countWords(t.text);
  return {
    id: t.id, split: t.split, label: t.label, language: t.language,
    category: t.category, edge: t.edge, words: w,
    lenBucket: w < 50 ? "short" : w < 120 ? "medium" : "long",
    score: heu.score, cls: cls3(heu.score), pred: predAI(heu.score) ? "AI" : "Human",
    confidence: heu.confidence, lang: heu.lang,
    sentCount: heu.sents.length, sentSpread: heu.detail.sentSpread,
    reasons: heu.reasons,
  };
});

// ---- Humanize rescan (ukur regresi, bukan tuning): hanya label ai + kata cukup ----
const humRows = [];
rows.filter((r) => r.label === "ai" && r.words >= 20).forEach((r) => {
  const src = items.find((t) => t.id === r.id);
  try {
    const heu = api.heuristic(src.text);
    const h = api.humanizeText(src.text, heu.sentScores.length === heu.sents.length ? heu.sentScores : null);
    const post = api.heuristic(h.text);
    humRows.push({ id: r.id, pre: r.score, post: post.score, delta: post.score - r.score, changed: h.changed, reverted: h.reverted });
  } catch (e) { humRows.push({ id: r.id, error: String(e.message) }); }
});

let failures = [];

// ---- Smoke S1: short-text cap (detector.js:386-389 → skor ≤45 bila <50 kata/<3 kalimat) ----
rows.filter((r) => r.edge.includes("short")).forEach((r) => {
  const ok = r.score <= 45;
  console.log(`S1 short-cap ${r.id}: words=${r.words} sents=${r.sentCount} score=${r.score} → ${ok ? "OK" : "GAGAL"}`);
  if (!ok) failures.push(`S1 ${r.id}`);
});

// ---- Smoke S2: akademik manusia tidak overflag kuat (detector-rules §4) ----
rows.filter((r) => r.edge.includes("academic-human")).forEach((r) => {
  const ok = r.score < THR_STRONG;
  console.log(`S2 academic-human ${r.id}: score=${r.score} (<${THR_STRONG}) → ${ok ? "OK" : "GAGAL"}`);
  if (!ok) failures.push(`S2 ${r.id}`);
});

// ---- Smoke S3: single-signal tidak boleh vonis kuat (detector-rules §3) ----
rows.filter((r) => r.edge.includes("single-signal")).forEach((r) => {
  const ok = r.score < THR_STRONG;
  console.log(`S3 single-signal ${r.id}: score=${r.score} (<${THR_STRONG}) → ${ok ? "OK" : "GAGAL"}`);
  if (!ok) failures.push(`S3 ${r.id}`);
});

// ---- Smoke S4: humanize tidak crash + lapor regresi (humanizer-rules §1, validation-rules §4) ----
humRows.forEach((h) => {
  if (h.error) { console.log(`S4 humanize ${h.id}: ERROR ${h.error}`); failures.push(`S4 ${h.id}`); }
  else console.log(`S4 humanize ${h.id}: ${h.pre} → ${h.post} (Δ${h.delta >= 0 ? "+" : ""}${h.delta}, chg=${h.changed}, rev=${h.reverted})`);
});
const regressed = humRows.filter((h) => !h.error && h.delta > 5);

// ---- Smoke S5: klaim terlarang pada reasons user-facing ----
let forbidHits = [];
rows.forEach((r) => r.reasons.forEach((t) => { if (FORBIDDEN.test(t)) forbidHits.push(`${r.id}: ${t}`); }));
console.log(`S5 forbidden-claims pada reasons: ${forbidHits.length === 0 ? "BERSIH" : "DITEMUKAN " + forbidHits.length}`);
forbidHits.forEach((h) => console.log("   ! " + h));
if (forbidHits.length) failures.push("S5 forbidden-claims");

if (!bootOK) failures.push("boot main.js");

// ================= METRICS =================
const m = binaryMetrics(rows);
console.log(`\n=== Metrics overall (split=${splitArg}, thr=${THR_MID}, mixed excluded, n=${m.n}) ===`);
console.log(`Accuracy=${pct(m.acc)} Precision=${pct(m.prec)} Recall=${pct(m.rec)} F1=${pct(m.f1)} FPR=${pct(m.fpr)} FNR=${pct(m.fnr)}`);
console.log("Confusion (Actual x Predicted):");
console.log(`  Actual AI    → Pred AI=${m.tp}  Pred Human=${m.fn}`);
console.log(`  Actual Human → Pred AI=${m.fp}  Pred Human=${m.tn}`);

const CATS = ["human/personal", "human/academic", "human/formal", "human/discussion",
  "ai/generic", "ai/academic", "ai/formal", "ai/rewritten",
  "mixed/ai-edited-human", "mixed/human-edited-ai", "mixed/paraphrased"];
console.log("\n=== Per kategori (pred AI = skor>=50) ===");
CATS.forEach((c) => {
  const sub = rows.filter((r) => r.category === c);
  if (!sub.length) { console.log(`- ${c}: n=0`); return; }
  const sc = sub.map((r) => r.score);
  const nPredAI = sub.filter((r) => predAI(r.score)).length;
  let extra = "";
  if (sub[0].label === "human") extra = ` correct-human=${sub.filter((r) => !predAI(r.score)).length}/${sub.length}`;
  else if (sub[0].label === "ai") extra = ` correct-ai=${nPredAI}/${sub.length}`;
  else {
    const d = { human: sub.filter((r) => r.cls === "human").length, mid: sub.filter((r) => r.cls === "mid").length, ai: sub.filter((r) => r.cls === "ai").length };
    extra = ` distribusi(H/M/AI)=${d.human}/${d.mid}/${d.ai}`;
  }
  console.log(`- ${c}: n=${sub.length} avg=${avg(sc).toFixed(1)} range=[${Math.min(...sc)},${Math.max(...sc)}] predAI=${nPredAI}${extra}`);
});

console.log("\n=== Edge cases ===");
rows.filter((r) => r.edge.length).forEach((r) => {
  console.log(`- ${r.id} [${r.edge.join(",")}] label=${r.label} score=${r.score} cls=${r.cls} conf=${r.confidence} words=${r.words}`);
});

console.log(`\nHumanize rescan (AI, n=${humRows.length}): avgΔ=${avg(humRows.filter((h) => !h.error).map((h) => h.delta)).toFixed(1)} regresi(Δ>+5)=${regressed.length}${regressed.length ? " [" + regressed.map((h) => h.id).join(",") + "]" : ""}`);

// ---- Simpan JSON (area audit, bukan sumber skor) ----
const outPath = outArg || path.join(ROOT, ".slim", "deepwork", `fase1-metrics-${splitArg}.json`);
const payload = {
  note: "Fase 1 baseline — ukur saja. Threshold eksisting 50/75/30, tanpa tuning. Split test FROZEN.",
  split: splitArg, thr: { strong: THR_STRONG, mid: THR_MID, human: THR_HUMAN },
  metrics: m, rows, humRows, regressed: regressed.map((h) => h.id),
  smoke: { bootOK, failures, forbidHits },
};
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
console.log(`\nSaved: ${outPath}`);

if (failures.length) { console.log(`\nSMOKE GAGAL: ${failures.join("; ")}`); process.exit(1); }
console.log("\nSMOKE: semua lolos.");
