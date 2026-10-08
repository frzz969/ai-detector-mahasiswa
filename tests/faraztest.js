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

// Stub DOM (cukup agar main.js bisa load + runDemo + updateWC)
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
  const files = ["js/core.js", "js/referensi.js", "js/detector.js", "js/humanizer.js",
    "js/main.js"];
  const code = files.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n");
  const factory = new Function(
    "document", "window", "navigator",
    code + "\n;return {heuristic, splitReferences, cleanAcademic, splitSentences," +
    " words, countWords, humanizeText, humanizeSentence, stripMarkdown, render, doCheck, markStale, ID_FW, EN_FW};"
  );
  return factory(documentStub, {}, {});
}

// Klasifikasi biner harness (thr eksisting 50, bukan tuning)
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

// Main
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
if (["train", "validation",
  "test"].includes(splitArg)) items = DATASET.filter((t) => t.split === splitArg);

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

// Humanize rescan (ukur regresi, bukan tuning): hanya label ai + kata cukup
const humRows = [];
rows.filter((r) => r.label === "ai" && r.words >= 20).forEach((r) => {
  const src = items.find((t) => t.id === r.id);
  try {
    const heu = api.heuristic(src.text);
    const h = api.humanizeText(src.text,
      heu.sentScores.length === heu.sents.length ? heu.sentScores : null);
    const post = api.heuristic(h.text);
    humRows.push({ id: r.id, pre: r.score, post: post.score, delta: post.score - r.score,
      changed: h.changed, reverted: h.reverted });
  } catch (e) { humRows.push({ id: r.id, error: String(e.message) }); }
});

let failures = [];

// Smoke S1: short-text cap (detector.js:386-389 → skor ≤45 bila <50 kata/<3 kalimat)
rows.filter((r) => r.edge.includes("short")).forEach((r) => {
  const ok = r.score <= 45;
  console.log(`S1 short-cap ${r.id}: words=${r.words} sents=${r.sentCount} score=${r.score} → ${ok ? "OK" : "GAGAL"}`);
  if (!ok) failures.push(`S1 ${r.id}`);
});

// Smoke S2: akademik manusia tidak overflag kuat (detector-rules §4)
rows.filter((r) => r.edge.includes("academic-human")).forEach((r) => {
  const ok = r.score < THR_STRONG;
  console.log(`S2 academic-human ${r.id}: score=${r.score} (<${THR_STRONG}) → ${ok ? "OK" : "GAGAL"}`);
  if (!ok) failures.push(`S2 ${r.id}`);
});

// Smoke S3: single-signal tidak boleh vonis kuat (detector-rules §3)
rows.filter((r) => r.edge.includes("single-signal")).forEach((r) => {
  const ok = r.score < THR_STRONG;
  console.log(`S3 single-signal ${r.id}: score=${r.score} (<${THR_STRONG}) → ${ok ? "OK" : "GAGAL"}`);
  if (!ok) failures.push(`S3 ${r.id}`);
});

// Smoke S4: humanize tidak crash + lapor regresi (humanizer-rules §1, validation-rules §4)
humRows.forEach((h) => {
  if (h.error) { console.log(`S4 humanize ${h.id}: ERROR ${h.error}`); failures.push(`S4 ${h.id}`); }
  else console.log(`S4 humanize ${h.id}: ${h.pre} → ${h.post} (Δ${h.delta >= 0 ? "+" : ""}${h.delta}, chg=${h.changed}, rev=${h.reverted})`);
});
const regressed = humRows.filter((h) => !h.error && h.delta > 5);

// Smoke S5: klaim terlarang pada reasons user-facing
let forbidHits = [];
rows.forEach((r) => r.reasons.forEach((t) => { if (FORBIDDEN.test(t)) forbidHits.push(`${r.id}: ${t}`); }));
console.log(`S5 forbidden-claims pada reasons: ${forbidHits.length === 0 ? "BERSIH" : "DITEMUKAN " + forbidHits.length}`);
forbidHits.forEach((h) => console.log("   ! " + h));
if (forbidHits.length) failures.push("S5 forbidden-claims");

// Smoke S6: matrix mixed-language (PRD §15.2/§15.3 + sebagian §15.9)
// Threshold 50/75/30 TIDAK diubah. GAGAL bila ada assert tidak lolos.
const MX_MIXED = "Penelitian ini bertujuan untuk menganalisis pengaruh media sosial terhadap prestasi belajar siswa di sekolah menengah atas. " +
  "Data yang dikumpulkan berasal dari kuesioner yang disebarkan kepada responden dengan metode yang sistematis dan terstruktur. " +
  "Hasil yang diperoleh menunjukkan bahwa penggunaan yang berlebihan dapat menurunkan konsentrasi belajar para siswa. " +
  "The results of this study show that the use of social media has a significant effect on students and their academic performance in the classroom. " +
  "The data were collected from a survey that was distributed to the participants in several schools across the region. " +
  "The analysis indicates that the relationship between the variables is strong and consistent over time. " +
  "Oleh karena itu, guru dan orang tua perlu bekerja sama dengan baik untuk membimbing para siswa dalam menggunakan teknologi secara bijak. " +
  "Selain itu, sekolah dapat membuat aturan yang jelas agar proses belajar tetap efektif dan kondusif bagi semua pihak yang terlibat di dalamnya.";
const MX_BASE = "Saya dan tim kami melakukan observasi langsung di tiga sekolah dasar pada bulan Maret hingga Mei tahun lalu. " +
  "Kami mewawancarai dua belas guru dan mencatat jawaban mereka dengan teliti setiap harinya. " +
  "Menurut pengalaman kami, anak-anak yang sarapan sebelum berangkat terlihat lebih fokus saat mengerjakan soal matematika di kelas. " +
  "Data kehadiran yang kami kumpulkan menunjukkan rata-rata kehadiran mencapai sembilan puluh persen selama satu semester penuh. " +
  "Wah, hasilnya sungguh menggembirakan bagi kami semua! " +
  "Kami bertanya kepada siswa, apakah mereka senang belajar kelompok? " +
  "Ternyata sebagian besar menjawab dengan antusias dan penuh semangat setiap harinya.";
const MX_NOISE_ADD = "Implementasi memakai `model.fit(X, y)` dengan pustaka TensorFlow dan PyTorch pada Microsoft Visual Studio Code, " +
  "lihat https://example.org/paper serta DOI:10.1234/abcd.5678 dan rujukan (Santoso, 2020) [12].";
const MX_UNKNOWN = "TensorFlow PyTorch API QoS TF-IDF Naive Bayes RPC gRPC JSON XML HTTP TCP UDP Kubernetes Docker GitHub README CHANGELOG " +
  "dataset preprocessing backpropagation hyperparameter throughput latency bandwidth endpoint microservice middleware OAuth SSO LDAP CRUD REST GraphQL " +
  "YAML CSV Parquet Spark Hadoop Kafka Redis MongoDB PostgreSQL compiler linker debugger breakpoint refactor commit push merge rebase stash branch tag " +
  "release deploy rollback monitor alert dashboard metric log trace pipeline artifact registry container pod node cluster shard replica index query schema " +
  "migration seed fixture mock stub benchmark profiling cache queue stack heap thread process socket port proxy gateway load balancer DNS CDN TLS SSL SSH " +
  "ad hoc et cetera inter alia per se de facto de jure status quo v2.4 foo() bar.baz contact@mail.example.org";
const s6assert = (name, cond, info) => {
  console.log(`S6 ${name}: ${cond ? "OK" : "GAGAL"}${info ? " (" + info + ")" : ""}`);
  if (!cond) failures.push(`S6 ${name}`);
};
// (a) campur ID/EN signifikan → mixed + confidence maks sedang
const mxHeu = api.heuristic(MX_MIXED);
s6assert("mixed-detect", mxHeu.detail.language === "mixed" && mxHeu.mixed === true,
  `language=${mxHeu.detail.language} mixed=${mxHeu.mixed} idProp=${Number(mxHeu.detail.idProp).toFixed(2)} enProp=${Number(mxHeu.detail.enProp).toFixed(2)} words=${mxHeu.detail.totalW}`);
s6assert("mixed-confcap", mxHeu.confidence === "sedang" || mxHeu.confidence === "rendah",
  `confidence=${mxHeu.confidence}`);
// (b) istilah teknis/code/URL/DOI/sitasi tidak menaikkan skor
const baseHeu = api.heuristic(MX_BASE);
const noisyHeu = api.heuristic(MX_BASE + " " + MX_NOISE_ADD);
s6assert("noise-noscore", noisyHeu.score <= baseHeu.score + 5,
  `base=${baseHeu.score} noisy=${noisyHeu.score}`);
s6assert("noise-id-stable", noisyHeu.detail.language === baseHeu.detail.language,
  `base=${baseHeu.detail.language} noisy=${noisyHeu.detail.language}`);
// (c) derau non-bahasa saja → unknown
const unkHeu = api.heuristic(MX_UNKNOWN);
s6assert("unknown-detect", unkHeu.detail.language === "unknown",
  `language=${unkHeu.detail.language} fwTotal=${unkHeu.detail.fwTotal} words=${unkHeu.detail.totalW}`);
// (d) paritas preprocess + combine mixed (modul js/ai/* asli)
let s6pre = null, s6cmb = null;
try {
  (0, eval)(fs.readFileSync(path.join(ROOT, "js/ai/preprocess.js"), "utf8") + "\n;" +
    fs.readFileSync(path.join(ROOT, "js/ai/combine.js"), "utf8"));
  s6pre = globalThis.FarazPre; s6cmb = globalThis.FarazCombine;
  s6assert("ai-modules-load", !!(s6pre && s6cmb), "");
} catch (e) { s6assert("ai-modules-load", false, String(e && e.message || e)); }
if (s6pre && s6cmb) {
  if (api.ID_FW && api.EN_FW) { globalThis.ID_FW = api.ID_FW; globalThis.EN_FW = api.EN_FW; }
  const pMix = s6pre.preprocess(MX_MIXED);
  s6assert("preprocess-parity", pMix.language === mxHeu.detail.language
    && pMix.mixed === mxHeu.mixed,
    `pre=${pMix.language}/${pMix.mixed} heu=${mxHeu.detail.language}/${mxHeu.mixed}`);
  const pBase = s6pre.preprocess(MX_BASE);
  s6assert("preprocess-id", pBase.language === "id" && pBase.mixed === false,
    `pre=${pBase.language}`);
  const cMix = s6cmb.combine(
    { score: mxHeu.score, confidence: "tinggi", lang: mxHeu.lang, mixed: mxHeu.mixed,
      detail: mxHeu.detail },
    { score: 80, confidence: "tinggi", coverage: 1 }, null);
  s6assert("combine-mixed", cMix.confidence !== "tinggi" && /bahasa 0\.5/.test(cMix.method),
    `conf=${cMix.confidence}`);
  const cSolo = s6cmb.combine(
    { score: 80, confidence: "tinggi", lang: "id", mixed: true, detail: { language: "mixed",
      mixed: true, totalW: 120 } },
    null, { reason: "offline" });
  s6assert("combine-solo-cap", cSolo.confidence !== "tinggi", `conf=${cSolo.confidence}`);
}

if (!bootOK) failures.push("boot main.js");

// Smoke S7: strip markdown + verdict bersih (detector-rules §1, validation-rules §5)
const s7assert = (name, cond, info) => {
  console.log(`S7 ${name}: ${cond ? "OK" : "GAGAL"}${info ? " (" + info + ")" : ""}`);
  if (!cond) failures.push(`S7 ${name}`);
};
// (a) helper hanya buang penanda, isi dipertahankan
const MD_UNIT_IN = "**tebal** dan *miring*\n# Judul\n- item\n> kutip\n[link](https://x.id)";
s7assert("strip-unit", typeof api.stripMarkdown === "function" &&
  api.stripMarkdown(MD_UNIT_IN) === "tebal dan miring\nJudul\nitem\nkutip\nlink",
  JSON.stringify(String(api.stripMarkdown ? api.stripMarkdown(MD_UNIT_IN) : "n/a")));
// (b) tempelan markdown tidak menaikkan skor dibanding teks polos yang sama
const MD_PLAIN = "Berdasarkan hasil observasi di kelas, sebagian mahasiswa terlihat lebih fokus ketika materi disampaikan dengan contoh konkret dari pengalaman sehari-hari. " +
  "Kami mewawancarai sepuluh guru dan mencatat jawaban mereka selama dua minggu berturut-turut. " +
  "Menurut pengalaman kami, anak-anak yang berdiskusi kelompok terlihat lebih berani menyampaikan pendapat di depan kelas. " +
  "Data kehadiran yang kami kumpulkan menunjukkan rata-rata kehadiran mencapai delapan puluh persen selama satu semester. " +
  "Wah, hasilnya sungguh menggembirakan bagi kami semua! " +
  "Kami bertanya kepada siswa, apakah mereka senang belajar kelompok setiap harinya? " +
  "Ternyata sebagian besar menjawab dengan antusias dan penuh semangat.";
const MD_NOISY = "# Catatan Lapangan\n\n**Hasil pengamatan** minggu ini:\n\n- " +
  MD_PLAIN.split(". ").slice(0,
    3).join(".\n- ") + ".\n\n> *Catatan*: hasil ini **menggembirakan**.\n\n" +
  "Rincian lanjutan [dokumen](https://example.com/paper):\n\n" +
  MD_PLAIN.split(". ").slice(3).join(". ") + ".";
const mdBase = api.heuristic(MD_PLAIN);
const mdNoisy = api.heuristic(MD_NOISY);
s7assert("markdown-noscore", mdNoisy.score <= mdBase.score + 5,
  `polos=${mdBase.score} markdown=${mdNoisy.score}`);
// (c) verdict bersih: tanpa angka bobot internal, confidence tepat sekali
try {
  const vHeu = api.heuristic(MD_PLAIN);
  vHeu.combineNote = "gabungan heuristik 23/100 + AI 92/100 (bobot AI 0.11: conf tinggi × cakupan 0.50 × bahasa 0.5; selisih 69 → tidak sepakat, perlu ditinjau)";
  vHeu.confidence = "sedang";
  api.render(vHeu, null, 0);
  const vHtml = (elCache.verdict && elCache.verdict.innerHTML) || "";
  s7assert("verdict-bersih", !/bobot|selisih|cakupan|×/.test(vHtml), vHtml.slice(0, 140));
  const confN = (vHtml.match(/confidence/gi) || []).length;
  const skorN = (vHtml.match(/skor indikasi/gi) || []).length;
  s7assert("verdict-sekali", confN === 1 && skorN === 1 && /Skor indikasi \d+\/100/.test(vHtml),
    `confidence×${confN} skor-indikasi×${skorN}`);
} catch (e) { s7assert("verdict-render", false, String((e && e.message) || e)); }

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
    const d = { human: sub.filter((r) => r.cls === "human").length,
      mid: sub.filter((r) => r.cls === "mid").length, ai: sub.filter((r) => r.cls === "ai").length };
    extra = ` distribusi(H/M/AI)=${d.human}/${d.mid}/${d.ai}`;
  }
  console.log(`- ${c}: n=${sub.length} avg=${avg(sc).toFixed(1)} range=[${Math.min(...sc)},${Math.max(...sc)}] predAI=${nPredAI}${extra}`);
});

console.log("\n=== Edge cases ===");
rows.filter((r) => r.edge.length).forEach((r) => {
  console.log(`- ${r.id} [${r.edge.join(",")}] label=${r.label} score=${r.score} cls=${r.cls} conf=${r.confidence} words=${r.words}`);
});

console.log(`\nHumanize rescan (AI, n=${humRows.length}): avgΔ=${avg(humRows.filter((h) => !h.error).map((h) => h.delta)).toFixed(1)} regresi(Δ>+5)=${regressed.length}${regressed.length ? " [" + regressed.map((h) => h.id).join(",") + "]" : ""}`);

// Simpan JSON (area audit, bukan sumber skor)
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
