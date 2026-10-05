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
// Butuh: INTERNET + GEMINI_API_KEY/GROQ_API_KEY di .env.
// Run: node tests/ai-live-eval.js [jumlahPerKelas]
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

// Ambil sampel berlabel dari dataset repo.
const rows = fs.readFileSync(path.join(ROOT, 'eval', 'dataset.jsonl'), 'utf8')
  .split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (_) { return null; } })
  .filter((r) => r && typeof r.text === 'string' && typeof r.label === 'string')
  .filter((r) => r.text.length > 400 && r.text.length < 3000);

const PER = Number(process.argv[2]) || 6;
const human = rows.filter((r) => r.label.indexOf('human') === 0).slice(0, PER);
const machine = rows.filter((r) => r.label.indexOf('machine') === 0).slice(0, PER);

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
  console.log('sampel: ' + human.length + ' manusia + ' + machine.length + ' machine (ID)\n');
  console.log('id                label      heur lang |  AI  conf   | final | benar');

  const out = { human: { h: [], a: [], f: [] }, machine: { h: [], a: [], f: [] } };
  let err = 0;

  for (const r of human.concat(machine)) {
    const isMachine = r.label.indexOf('machine') === 0;
    const bucket = isMachine ? out.machine : out.human;
    const heu = mod.heuristic(r.text);
    const ai = await ask(r.text);
    if (!ai) { console.log((r.id || '-') + '  GAGAL panggil provider'); err++; continue; }
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
  if (err) console.log('catatan: ' + err + ' panggilan provider gagal (dicek lewat FarazStatus di UI).');
  process.exit(verdict === 'DAPAT DIPERCAYA (diskriminator)' ? 0 : 1);
})();