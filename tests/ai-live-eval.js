// tests/ai-live-eval.js - Mengukur apakah skor Gemini/Groq berguna sebagai diskriminator.
//
// Guardian case (terukur 5 Okt 2026, dataset eval/dataset.jsonl):
//   4 teks manusia ID  -> heuristik 14/20/15/21 (benar semua)
//                        Gemini     78/82/78/78 (SEMUA false positive)
//   4 teks machine ID  -> heuristik 42/32/19/28 (2 benar)
//                        Gemini     85/85/45/85 (4 benar, tapi tidak bisa membedakan)
// Artinya skor AI nyaris konstan tinggi -> bukan diskriminator. Karena itu bobot
// AI SENGAJA konservatif (combine.js: langFactor 0.5 + cap supremacy + gate).
//
// Test ini adalah VALIDATOR untuk setiap perubahan prompt/bobot: kalau skor AI
// tidak bisa memisahkan manusia vs machine, perubahan itu HARUS ditolak.
//
// STEP 1B (2026-10-05): confusion matrix + Precision/Recall/F1/FNR/FPR/AUC
// ditambahkan dengan rumus yang SAMA persis seperti eval/run.js, supaya LOCAL
// (eval/run.js) vs AI (file ini) bisa dibaca apples-to-apples. Gate median-gap
// yang lama TIDAK dihapus — ia masih jadi syarat, hanya bukan satu-satunya bukti.
//
// Ground truth = `label` di dataset. Skor AI dibandingkan dengan label itu
// untuk hitung TP/TN/FP/FN. Output AI TIDAK PERNAH dipakai sebagai label.
//
// TEST-blind: default hanya split `dev` (identik eval/run.js). Split lain harus
// diminta eksplisit lewat argumen --split. TEST beku tidak boleh dipakai untuk
// keputusan ambigu.
// Baris di luar `dev` tidak pernah dievaluasi kalau --split tidak diberikan.
//
// Skor 0-100 BUKAN probability: kalibrasi tidak diuji di file ini maupun
// eval/run.js. Jangan dibaca sebagai peluang.
//
// Butuh: INTERNET + GEMINI_API_KEY/GROQ_API_KEY di .env.
// Run: node tests/ai-live-eval.js [jumlahPerKelas] [--split=dev]
// Exit 1 = AI gagal sebagai diskriminator (jangan naikkan bobotnya).
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');

// Muat .env (tidak mencetak key).
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((l) => {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
}

// Muat modul browser.
function makeEl() {
  return {
    value: '', textContent: '', innerHTML: '', hidden: false, disabled: false, checked: false,
    style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false },
    appendChild() {}, remove() {}, addEventListener() {}, removeEventListener() {},
    scrollIntoView() {}, focus() {}, select() {}, click() {},
    setAttribute() {}, getAttribute: () => null, querySelectorAll: () => [],
  };
}
const elCache = {};
const documentStub = {
  getElementById: (id) => (elCache[id] || (elCache[id] = makeEl())),
  querySelectorAll: () => [], createElement: () => makeEl(), execCommand: () => false,
};
const files = ['js/core.js', 'js/referensi.js', 'js/detector.js', 'js/ai/combine.js', 'js/ai/validate.js'];
const code = files.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
const mod = new Function('document', 'window', 'navigator', code +
  '\n;return {heuristic, FarazCombine: globalThis.FarazCombine, FarazValidate: globalThis.FarazValidate};')(documentStub, {}, {});

const analyze = require(path.join(ROOT, 'api', 'analyze.js'));
const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
function mkRes() {
  const r = { code: 0, body: null };
  r.status = function (c) { r.code = c; return r; };
  r.json = function (o) { r.body = o; return r; };
  r.setHeader = function () {};
  r.end = function (s) { r.body = JSON.parse(s); return r; };
  return r;
}
async function ask(text) {
  const res = mkRes();
  await analyze({ method: 'POST', body: { v: 1, hash: sha(text), canonicalText: text } }, res);
  return res.code === 200 ? res.body : null;
}

// Panggilan provider dengan rate-limit handling.
// 2026-10-05, run pertama di dataset_v2 gagal 21/80 (26%). Setelah retry
// dipasang, SEMUA kegagalan terbukti `429/RATE_LIMITED` (bukan timeout) dan
// terkonsentrasi di sel academic/en: teks academic lebih panjang (median 293
// vs 261 kata) jadi lebih banyak token per panggilan, lebih cepat kena limit.
//
// Dua perbaikan: (1) jeda antar-panggilan sukses (rate limit butuh laju,
// bukan burst), (2) backoff agresif khusus 429 karena itu perintah eksplisit
// "kurangi laju". 4xx lain (auth/malformed/not-configured) TIDAK di-retry.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GAP_MS = Number(process.env.EVAL_GAP_MS || 2000);       // jeda antar-call
const BASE_MS = Number(process.env.EVAL_BASE_MS || 4000);     // backoff awal 429
const RETRY_429_CAP = Number(process.env.EVAL_429_RETRY || 5);

function isTransient(reason) {
  return reason === 'timeout' || reason === 'rate-limited' ||
         reason === 'RATE_LIMITED' ||
         (typeof reason === 'string' && reason.indexOf('http-5') === 0);
}
async function askRetry(text, opts) {
  const o = opts || {};
  const maxRetry = typeof o.maxRetry === 'number' ? o.maxRetry : 3;
  let lastReason = 'unknown';
  for (let a = 0; a <= maxRetry; a++) {
    const res = mkRes();
    try {
      await analyze({ method: 'POST', body: { v: 1, hash: sha(text), canonicalText: text } }, res);
    } catch (e) {
      lastReason = 'throw:' + ((e && e.code) || 'error');
    }
    if (res.code === 200) return { body: res.body, attempts: a + 1 };
    let reason = 'http-' + res.code;
    const b = res.body;
    if (b && typeof b.code === 'string') reason = b.code;
    lastReason = res.code + '/' + reason;
    const is429 = reason === 'rate-limited' || reason === 'RATE_LIMITED';
    if (a < maxRetry && isTransient(reason)) {
      if (is429 && a >= RETRY_429_CAP) break;
      const base = is429 ? BASE_MS : 1200;
      const wait = base * Math.pow(2, a) + Math.floor(Math.random() * 600);
      await sleep(wait);
      continue;
    }
    break;
  }
  return { body: null, attempts: maxRetry + 1, reason: lastReason };
}

const args = process.argv.slice(2);
const flag = (name) => {
  const hit = args.find((a) => a.indexOf('--' + name + '=') === 0);
  return hit ? hit.split('=').slice(1).join('=') : '';
};
const dsArg = flag('dataset');
const DATASET = dsArg ? path.resolve(ROOT, dsArg) : path.join(ROOT, 'eval', 'dataset.jsonl');
const SPLIT = flag('split') || 'dev';   // default dev = TEST-blind, sama seperti eval/run.js
const perArg = args.find((a) => /^[0-9]+$/.test(a));
const PER = perArg ? Number(perArg) : 6;

// Ambil sampel berlabel. Filter panjang 400-3000 char DISAMAKAN dengan
// eval/run.js agar kedua evaluasi mengukur input yang sebanding.
let rowsAll;
try {
  rowsAll = fs.readFileSync(DATASET, 'utf8')
    .split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (_) { return null; } })
    .filter((r) => r && typeof r.text === 'string' && typeof r.label === 'string')
    .filter((r) => r.text.length > 400 && r.text.length < 3000);
} catch (e) {
  console.log('AI-LIVE-EVAL: GAGAL baca ' + DATASET + ' (' + e.message + ').');
  process.exit(2);
}

const rows = rowsAll.filter((r) => r.split === SPLIT);
// stratified: ambil PER dari tiap (label, lang) supaya sel academic (en)
// ikut terukur dan tidak tenggelam oleh sel id yang lebih besar.
const strata = {};
rows.forEach((r) => {
  const k = r.label + '/' + (r.lang || '?');
  (strata[k] = strata[k] || []).push(r);
});
const human = [], machine = [];
Object.keys(strata).sort().forEach((k) => {
  strata[k].slice(0, PER).forEach((r) => {
    (r.label === 'human' ? human : machine).push(r);
  });
});

// ---- Metrik klasifikasi: rumus SAMA dengan eval/run.js ------------------
// Positif = machine. Pembagi 0 -> null ("n/a"), bukan 0.
function div(n, d) { return d ? n / d : null; }
function precisionOf(tp, fp) { return div(tp, tp + fp); }
function recallOf(tp, fn) { return div(tp, tp + fn); }   // = TPR
function f1Of(p, r) {
  if (p === null || r === null) return null;
  const s = p + r;
  return s ? (2 * p * r) / s : null;
}
function fnrOf(tp, fn) {
  const r = recallOf(tp, fn);
  return r === null ? null : 1 - r;
}

// AUC via peringkat (Mann-Whitney; seri = 0.5). Skor = indikasi AI.
function aucPOS(neg, pos) {
  const all = neg.map((s) => ({ s: s, y: 0 })).concat(pos.map((s) => ({ s: s, y: 1 })));
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

const pct = (x) => (x === null || x === undefined ? "n/a" : (x * 100).toFixed(1) + "%");

function stats(list) {
  if (!list.length) return null;
  const v = list.slice().sort((a, b) => a - b);
  return {
    n: v.length,
    min: v[0],
    med: v[Math.floor(v.length / 2)],
    max: v[v.length - 1],
    avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length),
  };
}

(async function () {
  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY) {
    console.log('AI-LIVE-EVAL: dilewati (GEMINI_API_KEY/GROQ_API_KEY tidak ada).');
    console.log('Isi .env atau set env di shell, lalu jalankan ulang.');
    process.exit(0);
  }

  console.log('AI LIVE EVAL - apakah skor AI bisa membedakan manusia vs machine?');
  console.log('sampel: ' + human.length + ' manusia + ' + machine.length +
    ' machine, split=' + SPLIT + ', dataset=' + path.relative(ROOT, DATASET).replace(/\\/g, '/'));
  console.log('strata (label/lang): ' + Object.keys(strata).sort().map((k) =>
    k + '=' + Math.min(PER, strata[k].length)).join(', '));
  console.log('metrik: positif = machine; ground truth = label dataset (skor AI BUKAN label)');
  console.log('skor 0-100 bukan probability (kalibrasi tidak diuji).\n');
  console.log('id                label      heur lang |  AI  conf   | final | benar');

  // Kumpulkan skor per kelas. Skor yang dinilai untuk metrik klasifikasi =
  // SKOR AI MENTAH (bukan `final` gabungan) — supaya apples-to-apples dengan
  // eval/run.js yang mengukur heuristic() mentah. `final` tetap ditampilkan
  // sebagai info-output produksi, tidak dipakai untuk metrik.
  const out = { human: { h: [], a: [], f: [] }, machine: { h: [], a: [], f: [] } };
  const failReasons = {};
  let err = 0;
  let retryUsed = 0;

  for (const r of human.concat(machine)) {
    const isMachine = r.label.indexOf('machine') === 0;
    const bucket = isMachine ? out.machine : out.human;
    const heu = mod.heuristic(r.text);
    await sleep(GAP_MS);   // jeda antar-call: 429 = laju, bukan burst
    const g = await askRetry(r.text, {});
    if (g.attempts > 1) retryUsed++;
    if (!g.body) {
      failReasons[g.reason || 'unknown'] = (failReasons[g.reason || 'unknown'] || 0) + 1;
      console.log((r.id || '-') + '  GAGAL ' + (g.reason || 'unknown') +
        ' (percobaan ' + g.attempts + ', ' + (r.lang || '?') + ')');
      err++;
      continue;
    }
    const ai = g.body;
    const c = mod.FarazCombine.combine(heu, { score: ai.score, confidence: ai.confidence }, null);
    const gate = mod.FarazValidate.checks.regression(r.text, r.text, { origScore: heu.score, revScore: c.final });
    const verdictAi = c.final >= 45;
    const okFinal = verdictAi === isMachine;
    bucket.h.push(heu.score);
    bucket.a.push(ai.score);
    bucket.f.push(c.final);
    console.log(
      (r.id || '-').padEnd(17) + r.label.padEnd(11) +
      String(heu.score).padStart(4) + ' ' + String(heu.lang).padEnd(4) + '|' +
      String(ai.score).padStart(4) + ' ' + String(ai.confidence).slice(0, 5).padEnd(5) + '|' +
      String(c.final).padStart(6) + ' | ' + (okFinal ? 'ya' : 'TIDAK') + (gate ? ' [GATE GAGAL]' : '')
    );
  }

  // ---- Confusion matrix + metrik, untuk LOCAL vs AI berdampingan --------
  // Prediksi positif = skor >= ambang yang SAMA untuk keduanya (THR_MID 50, cermin
  // core.js) supaya perbandingan adil. Ambang TIDAK diubah di file ini.
  const THR = 50;
  function matrix(scoresHuman, scoresMachine) {
    const tp = scoresMachine.filter((s) => s >= THR).length;
    const fn = scoresMachine.length - tp;
    const fp = scoresHuman.filter((s) => s >= THR).length;
    const tn = scoresHuman.length - fp;
    const n = scoresHuman.length + scoresMachine.length;
    const precision = precisionOf(tp, fp);
    const recall = recallOf(tp, fn);
    return {
      n: n, tp: tp, tn: tn, fp: fp, fn: fn,
      accuracy: n ? (tp + tn) / n : null,
      precision: precision, recall: recall, f1: f1Of(precision, recall),
      fpr: scoresHuman.length ? fp / scoresHuman.length : null,
      fnr: fnrOf(tp, fn),
      auc: aucPOS(scoresHuman, scoresMachine),
    };
  }
  const mLocal = matrix(out.human.h, out.machine.h);
  const mAi = matrix(out.human.a, out.machine.a);

  const row = (k, v) => (k + ' ').padEnd(14, '.') + ' ' + String(v).padStart(12);
  const COUNT_KEYS = ['n', 'tp', 'tn', 'fp', 'fn'];
  console.log('');
  console.log('=== LOCAL vs AI (ambang ' + THR + ', split ' + SPLIT + ', positif = machine) ===');
  console.log('metrik        LOCAL          AI');
  COUNT_KEYS.concat(['accuracy', 'precision', 'recall', 'f1', 'fpr', 'fnr', 'auc']).forEach((k) => {
    // n/tp/tn/fp/fn = hitungan BUKAN persen; sisanya persen/AUC.
    const f = (x) => {
      if (COUNT_KEYS.indexOf(k) !== -1) return (x === null || x === undefined) ? 'n/a' : String(x);
      if (k === 'auc') return x === null ? 'n/a' : x.toFixed(3);
      return pct(x);
    };
    console.log(row(k, f(mLocal[k])) + '  ' + String(f(mAi[k])).padStart(12));
  });
  if (!out.human.h.length || !out.machine.h.length) {
    console.log('CATATAN: n=0 pada salah satu kelas -> metrik berbasis confusion (precision/f1/fpr/fnr/auc)');
    console.log('         TIDAK dihitung karena tidak valid, bukan diisi 0. Ambil lebih banyak sampel.');
  }
  if (mLocal.n && mAi.n && mLocal.n === mAi.n) {
    console.log('delta AI-LOCAL: F1 ' + (mLocal.f1 === null || mAi.f1 === null ? 'n/a'
      : ((mAi.f1 - mLocal.f1) >= 0 ? '+' : '') + ((mAi.f1 - mLocal.f1) * 100).toFixed(1) + ' poin') +
      ' | recall ' + (mLocal.recall === null || mAi.recall === null ? 'n/a'
        : ((mAi.recall - mLocal.recall) >= 0 ? '+' : '') + ((mAi.recall - mLocal.recall) * 100).toFixed(1) + ' poin') +
      ' | FPR ' + (mLocal.fpr === null || mAi.fpr === null ? 'n/a'
        : ((mAi.fpr - mLocal.fpr) >= 0 ? '+' : '') + ((mAi.fpr - mLocal.fpr) * 100).toFixed(1) + ' poin'));
    console.log('Interpretasi delta: BUKAN bukti AI layak. Sample kecil + dataset machine');
    console.log('hanya news/gpt-3.5 (lihat eval/report.md). Bobot AI TIDAK diubah oleh file ini.');
  }

  const line = (name, s) => s ? (name + ': n=' + s.n + ' min=' + s.min + ' median=' + s.med + ' max=' + s.max + ' rata=' + s.avg) : (name + ': (tidak ada data)');
  console.log('');
  console.log(line('heuristik-human ', stats(out.human.h)));
  console.log(line('AI skor -human  ', stats(out.human.a)));
  console.log(line('final    -human ', stats(out.human.f)));
  console.log(line('heuristik-machine', stats(out.machine.h)));
  console.log(line('AI skor -machine', stats(out.machine.a)));
  console.log(line('final    -machine', stats(out.machine.f)));

  // Diskusi: AI yang selalu tinggi tidak bisa memisahkan.
  const aiHuman = stats(out.human.a);
  const aiMachine = stats(out.machine.a);
  let verdict = 'TIDAK DAPAT DIPERCAYA';
  if (aiHuman && aiMachine) {
    const gap = aiMachine.med - aiHuman.med;
    const overlap = aiMachine.min <= aiHuman.max;   // rentang saling tumpang tindih
    if (gap >= 20 && !overlap) verdict = 'DAPAT DIPERCAYA (diskriminator)';
    else if (gap >= 20) verdict = 'SEBAGIAN (pisah median, rentang tumpang tindih)';
  }
  console.log('');
  console.log('KESIMPULAN skor AI: ' + verdict);
  console.log('Rule: bobot AI di combine.js hanya boleh naik kalau verdict =');
  console.log('      "DAPAT DIPERCAYA (diskriminator)".');
  if (err) {
    console.log('catatan: ' + err + ' panggilan provider gagal setelah retry');
    console.log('  alasan: ' + JSON.stringify(failReasons));
    console.log('  retry berhasil: ' + retryUsed + ' sampel (transien: timeout/rate-limit/5xx)');
    const total = human.length + machine.length;
    const rate = Math.round((1 - err / Math.max(1, total)) * 100);
    console.log('  coverage sampel: ' + (total - err) + '/' + total + ' (' + rate + '%)');
    if (rate < 90) {
      console.log('  PERINGATAN: coverage < 90% -> hasil TIDAK boleh dipakai untuk keputusan');
      console.log('  (sampel hilang tidak acak; hilang concentrating di sel tertentu = bias).');
    }
  }
  if (!mAi.n) {
    console.log('CATATAN: tidak ada sampel tervalidasi -> gate median tidak bisa diputuskan.');
  }
  // Gate tetap sama seperti sebelumnya: median-gap + overlap. Metrik klasifikasi
  // di atas hanya INFORMATIF - exit code TIDAK bergantung padanya, supaya file ini
  // tidak bisa dipakai menaikkan/menurunkan bobot AI lewat jalan pintas.
  process.exit(verdict === 'DAPAT DIPERCAYA (diskriminator)' ? 0 : 1);
})();