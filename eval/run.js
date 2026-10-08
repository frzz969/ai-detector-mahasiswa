// eval/run.js — Baseline DEV (TEST-blind, tanpa tuning).
//
// Aturan pakai: `.slim/deepwork/dataset-eval.md` (tune hanya di DEV, TEST beku),
// `referensi/validation-rules.md` §2 (gagal → exit non-nol, tanpa fallback),
// §5 + `referensi/detector-rules.md` §6 (bahasa indikasi, tanpa klaim pasti).
// `js/` READ-ONLY: ambang eksisting (core.js THR_MID_DOC=50) dipakai apa adanya.
//
// Muat: js/core.js → js/referensi.js → js/detector.js → js/humanizer.js
// (urutan sama seperti tests/faraztest.js; main.js tidak dimuat agar tanpa DOM penuh).
// Ukur: heuristic() pada split DEV saja (bukan TEST, bukan train).
// File test_hashes*.txt TIDAK PERNAH dibuka di sini (TEST-blind).
//
// METRIK (STEP 1, 2026-10-05): Precision + Recall/TPR + F1 + FNR ditambahkan.
// Alasan: accuracy saja MENYESATKAN pada dataset yang timpang (DEV 80 human
// vs 20 machine). Menebak "semua human" memberi accuracy 81% dengan recall 5%
// (TP=1, FN=19) — terlihat bagus, kemampuan nyata mendekati nol. F1 + FNR
// membongkar itu tanpa mengubah ambang/dataset/split.
//
// STEP 2 (2026-10-05): dataset_v2 menambah sel `academic` (M4 PeerRead,
// lang=en) yang menutup gap machine-academic = 0 pada dataset lama. Karena
// sel itu BEDA BAHASA, metrik overall TIDAK boleh dicampur diam-diam —
// `run.js` mencetak breakdown per (lang, genre) dan akurasi overall diberi
// catatan. Ambang, split, dan TEST tidak berubah.
'use strict';
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const THR_MID = 50; // cermin THR_MID_DOC core.js — dipakai, bukan diubah.
const THR_STRONG = 75;

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

function loadDetector() {
  const files = ["js/core.js", "js/referensi.js", "js/detector.js", "js/humanizer.js"];
  const code = files.map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n");
  const factory = new Function(
    "document", "window", "navigator",
    code + "\n;return {heuristic, countWords};"
  );
  return factory(documentStub, {}, {});
}

// AUC via peringkat (Mann-Whitney; seri = 0.5). Skor = indikasi AI, label machine = positif.
function aucPOS(neg, pos) {
  const all = neg.map((s) => ({ s, y: 0 })).concat(pos.map((s) => ({ s, y: 1 })));
  all.sort((a, b) => a.s - b.s);
  let rankSum = 0, i = 0;
  while (i < all.length) {
    let j = i;
    while (j < all.length && all[j].s === all[i].s) j++;
    const avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) if (all[k].y === 1) rankSum += avgRank;
    i = j;
  }
  const n1 = pos.length, n0 = neg.length;
  if (!n1 || !n0) return null;
  return (rankSum - (n1 * (n1 + 1)) / 2) / (n1 * n0);
}

// Metrik klasifikasi (STEP 1)
// Positif = machine. Pembagi 0 -> null (dicetak "n/a"), BUKAN 0: precision
// dengan 0 prediksi positif harus null, bukan 0%, agar tidak dibaca "buruk"
// padahal memang tidak ada klaim yang dibuat. Recall == TPR (satu angka, bukan
// dua perhitungan berbeda).
// Rumus: precision = TP/(TP+FP), recall = TP/(TP+FN), F1 = 2PR/(P+R),
//         FNR = FN/(TP+FN) = 1 - recall.
function div(n, d) { return d ? n / d : null; }
function precisionOf(tp, fp) { return div(tp, tp + fp); }
function recallOf(tp, fn) { return div(tp, tp + fn); }   // = TPR
function f1Of(p, r) {
  if (p === null || r === null) return null;
  const s = p + r;
  return s ? (2 * p * r) / s : null;                    // P=R=0 -> null
}
function fnrOf(tp, fn) {
  const r = recallOf(tp, fn);
  return r === null ? null : 1 - r;                     // tak ada machine -> null
}
const pct = (x) => (x === null || x === undefined ? "n/a" : (x * 100).toFixed(1) + "%");
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const med = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const bucket = (w) => (w < 50 ? "pendek<50" : w < 120 ? "sedang50-119" : "panjang>=120");
const GENRES = ["news", "encyclopedia", "abstract", "academic"];

function main() {
  let api;
  try {
    api = loadDetector();
  } catch (e) {
    console.error("GAGAL muat js/core→referensi→detector→humanizer: " + e.message);
    process.exit(2);
  }
  if (typeof api.heuristic !== "function") {
    console.error("GAGAL: heuristic() tidak tersedia setelah load.");
    process.exit(2);
  }

  let rows;
  const dsArg = (process.argv.slice(2).find((x) => x.indexOf("--dataset=") === 0)
    || "").split("=").slice(1).join("=");
  const devPath = dsArg ? path.resolve(ROOT, dsArg) : path.join(ROOT, "eval", "dataset.jsonl");
  try {
    rows = fs.readFileSync(devPath,
      "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  } catch (e) {
    console.error("GAGAL baca " + devPath + ": " + e.message);
    process.exit(2);
  }
  console.log("dataset: " + path.relative(ROOT, devPath).replace(/\\/g, "/"));
  const dev = rows.filter((r) => r.split === "dev");
  if (!dev.length) { console.error("GAGAL: split dev kosong."); process.exit(2); }
  if (dev.some((r) => r.split !== "dev") || rows.some((r) => dev.includes(r)
    && r.split === "test")) {
    console.error("GAGAL: kebocoran split terdeteksi.");
    process.exit(2);
  }

  const scored = dev.map((r) => {
    let heu;
    try {
      heu = api.heuristic(r.text);
    } catch (e) {
      console.error("GAGAL heuristic(" + r.id + "): " + e.message);
      process.exit(2);
    }
    return {
      id: r.id, label: r.label, source: r.source, genre: r.genre, lang: r.lang,
      words: r.words, bucket: bucket(r.words),
      score: heu.score, confidence: heu.confidence, predAI: heu.score >= THR_MID,
    };
  });

  const humans = scored.filter((r) => r.label === "human");
  const machines = scored.filter((r) => r.label === "machine");
  const tp = machines.filter((r) => r.predAI).length;
  const tn = humans.filter((r) => !r.predAI).length;
  const fp = humans.length - tn, fn = machines.length - tp;
  const n = scored.length;
  const acc = (tp + tn) / n;
  const auc = aucPOS(humans.map((r) => r.score), machines.map((r) => r.score));
  const fpr = humans.length ? fp / humans.length : null;
  // Recall == TPR: satu sumber kebenaran (recallOf), dipakai untuk dua label.
  const tpr = recallOf(tp, fn);
  const precision = precisionOf(tp, fp);
  const f1 = f1Of(precision, tpr);
  const fnr = fnrOf(tp, fn);
  // Accuracy baseline pembanding: menebak "semua human" tanpa melihat teks.
  const majorityAcc = humans.length ? humans.length / n : null;

  // Manusia-formal = genre abstract (abstrak akademik = register paling formal);
  // encyclopedia/news ditampilkan sebagai konteks (detector-rules §4).
  const formalH = humans.filter((r) => r.genre === "abstract");
  const fprFormal = formalH.length ? formalH.filter((r) => r.predAI).length / formalH.length : null;

  const tprGenre = {};
  GENRES.forEach((g) => {
    const m = machines.filter((r) => r.genre === g);
    if (m.length) tprGenre[g] = { n: m.length, tpr: m.filter((r) => r.predAI).length / m.length };
  });
  const tprLang = {};
  [...new Set(machines.map((r) => r.lang))].forEach((l) => {
    const m = machines.filter((r) => r.lang === l);
    tprLang[l] = { n: m.length, tpr: m.filter((r) => r.predAI).length / m.length };
  });
  const tprBucket = {};
  ["pendek<50", "sedang50-119", "panjang>=120"].forEach((b) => {
    const m = machines.filter((r) => r.bucket === b);
    if (m.length) tprBucket[b] = { n: m.length, tpr: m.filter((r) => r.predAI).length / m.length };
    else tprBucket[b] = { n: 0, tpr: null };
  });
  const fprBucket = {};
  ["pendek<50", "sedang50-119", "panjang>=120"].forEach((b) => {
    const h = humans.filter((r) => r.bucket === b);
    if (h.length) fprBucket[b] = { n: h.length, fpr: h.filter((r) => r.predAI).length / h.length };
    else fprBucket[b] = { n: 0, fpr: null };
  });

  console.log("=== Baseline DEV (TEST-blind, ambang eksisting " + THR_MID + ", tanpa tuning) ===");
  console.log("n DEV=" + n + " (human=" + humans.length + ", machine=" + machines.length + ")");
  console.log("confusion: TP=" + tp + " TN=" + tn + " FP=" + fp + " FN=" + fn);
  console.log("AUC=" + (auc === null ? "n/a" : auc.toFixed(3)) +
    " | akurasi=" + pct(acc) +
    " | presisi=" + pct(precision) +
    " | recall/TPR=" + pct(tpr) +
    " | F1=" + pct(f1) +
    " | FPR=" + pct(fpr) +
    " | FNR=" + pct(fnr));
  // Konteks wajib: tanpa ini, accuracy tinggi pada dataset timpang terbaca
  // sebagai kemampuan deteksi. Baseline "tebak semua human" = majorityAcc.
  console.log("-- konteks --");
  console.log("   akurasi tebak-semua-human (tanpa baca teks)=" + pct(majorityAcc) +
    " -> selisih vs detektor=" + pct(acc - (majorityAcc === null ? 0 : majorityAcc)));
  console.log("   machine terdeteksi=" + tp + "/" + machines.length + " ->FN yang luput=" + fn +
    "; presisi berarti dari " + (tp + fp) + " klaim AI, " + tp + " benar.");
  console.log("FPR manusia=" + pct(fpr) + " | FPR manusia-formal(abstract)=" + pct(fprFormal) +
    " (n=" + formalH.length + ") | TPR machine=" + pct(tpr));
  console.log("-- TPR machine per genre --");
  Object.keys(tprGenre).forEach((g) => console.log("   " + g + ": n=" + tprGenre[g].n + " TPR=" + pct(tprGenre[g].tpr)));
  console.log("-- TPR machine per lang --");
  Object.keys(tprLang).forEach((l) => console.log("   " + l + ": n=" + tprLang[l].n + " TPR=" + pct(tprLang[l].tpr)));
  console.log("-- TPR machine per bucket panjang --");
  Object.keys(tprBucket).forEach((b) => console.log("   " + b + ": n=" + tprBucket[b].n + " TPR=" + pct(tprBucket[b].tpr)));
  console.log("-- FPR human per genre / bucket (konteks) --");
  GENRES.forEach((g) => {
    const h = humans.filter((r) => r.genre === g);
    if (h.length) console.log("   human/" + g + ": n=" + h.length + " FPR=" + pct(h.filter((r) => r.predAI).length / h.length));
  });
  Object.keys(fprBucket).forEach((b) => console.log("   human/" + b + ": n=" + fprBucket[b].n + " FPR=" + pct(fprBucket[b].fpr)));
  console.log("median skor human=" + med(humans.map((r) => r.score)) +
    " vs machine=" + med(machines.map((r) => r.score)));
  // Breakdown per bahasa: sel academic (lang=en) BERBEDA BAHASA dari sel lama
  // (lang=id). Akurasi overall di atas mencampur keduanya — baca per baris.
  const langs = [...new Set(scored.map((r) => r.lang))];
  console.log("-- metrik per bahasa (jangan campur) --");
  langs.forEach((L) => {
    const hL = humans.filter((r) => r.lang === L);
    const mL = machines.filter((r) => r.lang === L);
    if (!hL.length || !mL.length) {
      console.log("   " + L + ": human=" + hL.length + " machine=" + mL.length +
        " -> confusion matrix TIDAK valid (salah satu kelas kosong)");
      return;
    }
    const tpL = mL.filter((r) => r.predAI).length, fnL = mL.length - tpL;
    const fpL = hL.filter((r) => r.predAI).length, tnL = hL.length - fpL;
    const pL = precisionOf(tpL, fpL), rL = recallOf(tpL, fnL);
    console.log("   " + L + ": n=" + (hL.length + mL.length) +
      " (human=" + hL.length + ", machine=" + mL.length + ")" +
      " | TP=" + tpL + " TN=" + tnL + " FP=" + fpL + " FN=" + fnL +
      " | akurasi=" + pct((tpL + tnL) / (hL.length + mL.length)) +
      " presisi=" + pct(pL) + " recall=" + pct(rL) + " F1=" + pct(f1Of(pL, rL)) +
      " FPR=" + pct(fpL / hL.length) + " FNR=" + pct(fnrOf(tpL, fnL)) +
      " AUC=" + (aucPOS(hL.map((x) => x.score), mL.map((x) => x.score)) || 0).toFixed(3));
  });
  console.log("Catatan bahasa: hasil berupa indikasi (confidence rendah/sedang/tinggi), bukan vonis.");

  const args = process.argv.slice(2);
  const outArg = (args.find((a) => a.startsWith("--out=")) || "").split("=").slice(1).join("=");
  const outPath = outArg || path.join(ROOT, "eval", "dev_baseline.json");
  const payload = {
    note: "Baseline DEV Fase 3 SLIM — TEST-blind, ambang eksisting 50/75/30, tanpa tuning. js/ read-only. " +
      "Presisi/recal/F1/FNR = null bila pembagi 0 (bukan 0). Skor 0-100 BUKAN probability: " +
      "kalibrasi tidak diuji, jangan dibaca sebagai peluang.",
    split: "dev", thr_mid: THR_MID, thr_strong: THR_STRONG,
    n, n_human: humans.length, n_machine: machines.length,
    auc, accuracy: acc,
    precision: precision, recall_tpr: tpr, f1: f1, fnr: fnr,
    fpr_human: fpr,
    accuracy_majority_baseline: majorityAcc,
    calibration: "not_tested",
    per_lang: langs.reduce((acc, L) => {
      const hL = humans.filter((r) => r.lang === L);
      const mL = machines.filter((r) => r.lang === L);
      if (!hL.length || !mL.length) {
        acc[L] = { n: hL.length + mL.length, human: hL.length, machine: mL.length,
                   valid: false, note: "salah satu kelas kosong -> metrics n/a" };
        return acc;
      }
      const tpL = mL.filter((r) => r.predAI).length, fnL = mL.length - tpL;
      const fpL = hL.filter((r) => r.predAI).length, tnL = hL.length - fpL;
      const pL = precisionOf(tpL, fpL), rL = recallOf(tpL, fnL);
      acc[L] = { n: hL.length + mL.length, human: hL.length, machine: mL.length,
        valid: true, confusion: { tp: tpL, tn: tnL, fp: fpL, fn: fnL },
        accuracy: (tpL + tnL) / (hL.length + mL.length),
        precision: pL, recall: rL, f1: f1Of(pL, rL),
        fpr: fpL / hL.length, fnr: fnrOf(tpL, fnL),
        auc: aucPOS(hL.map((x) => x.score), mL.map((x) => x.score)) };
      return acc;
    }, {}),
    confusion: { tp, tn, fp, fn },
    fpr_formal_abstract: { n: formalH.length, fpr: fprFormal }, tpr_machine: tpr,
    tpr_genre: tprGenre, tpr_lang: tprLang, tpr_bucket: tprBucket, fpr_bucket: fprBucket,
    med_human: med(humans.map((r) => r.score)), med_machine: med(machines.map((r) => r.score)),
    rows: scored.map((r) => ({ id: r.id, label: r.label, genre: r.genre, words: r.words,
      score: r.score, confidence: r.confidence, predAI: r.predAI })),
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log("Disimpan: " + outPath);
}

main();
