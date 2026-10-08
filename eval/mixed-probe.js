// eval/mixed-probe.js — Apakah skor detector merespons porsi AI?
//
// STEP 4 (2026-10-05). Sel mixed dari eval/build_mixed.py mengukur kasus nyata
// yang paling sering: pengguna tidak memakai AI mentah, tapi menyalin sebagian
// dan menulis sisanya sendiri.
//
// PERTANYAAN YANG DIUJI: kalau porsi machine naik (30% -> 50% -> 70%), apakah
// skor detector naik? Kalau tidak, berarti skor tidak membedakan "campuran"
// dari "murni" — itu informasi penting untuk user yang tulisannya campur.
//
// YANG TIDAK DIUJI (dan tidak boleh diklaim): akurasi deteksi tulisan campuran.
// Cell mixed dikonstruksi dengan sentence-interleave, jadi batas kalimatnya
// artificial. Angka di sini = "respons skor terhadap porsi AI", bukan
// "detektor mengenali tulisan campuran seperti manusia CAMPUR".
//
// Tidak masuk confusion matrix binary run.js: label `mixed` bukan kelas ketiga
// yang bisa dijumlahkan dengan human/machine.
//
// Cara pakai: node eval/mixed-probe.js [--data=eval/raw_mixed.jsonl]
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const THR = 50; // cermin core.js THR_MID_DOC — dipakai, bukan diubah.

function makeEl() {
  return {
    value: "", textContent: "", innerHTML: "", hidden: false, disabled: false, checked: false,
    style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false },
    appendChild() {}, remove() {}, addEventListener() {}, removeEventListener() {},
    scrollIntoView() {}, focus() {}, select() {}, click() {},
    setAttribute() {}, getAttribute: () => null, querySelectorAll: () => [],
  };
}
const elCache = {};
const doc = {
  getElementById: (id) => (elCache[id] || (elCache[id] = makeEl())),
  querySelectorAll: () => [], createElement: () => makeEl(), execCommand: () => false,
};
const files = ['js/core.js', 'js/referensi.js', 'js/detector.js'];
const code = files.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
const api = new Function('document', 'window', 'navigator',
  code + '\n;return {heuristic};')(doc, {}, {});

const dataArg = (process.argv.slice(2).find((x) => x.indexOf('--data=') === 0)
  || '').split('=').slice(1).join('=');
const DATA = dataArg ? path.resolve(ROOT, dataArg) : path.join(ROOT, 'eval', 'raw_mixed.jsonl');

let rows;
try {
  rows = fs.readFileSync(DATA, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
} catch (e) {
  console.error('GAGAL baca ' + DATA + ': ' + e.message);
  process.exit(2);
}
if (!rows.length) { console.error('GAGAL: tidak ada baris.'); process.exit(2); }

const med = (a) => { const s = [...a].sort((x,
  y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const pct = (x) => (x === null || x === undefined ? 'n/a' : (x * 100).toFixed(1) + '%');

const buckets = {};
rows.forEach((r) => {
  const f = r.ai_fraction;
  (buckets[f] = buckets[f] || []).push(api.heuristic(r.text).score);
});
const fracs = Object.keys(buckets).map(Number).sort((a, b) => a - b);

console.log('=== MIXED PROBE: skor detector vs porsi machine (ambang ' + THR + ') ===');
console.log('data: ' + path.relative(ROOT, DATA).replace(/\\/g, '/'));
console.log('CATATAN: sentence-interleave -> batas kalimat artificial. Ini mengukur');
console.log('        respons skor terhadap porsi AI, BUKAN akurasi deteksi mixture.\n');
console.log('porsi AI   n   median   rata   min  max   >=50');

const pts = [];
fracs.forEach((f) => {
  const v = buckets[f];
  const over = v.filter((s) => s >= THR).length;
  const m = med(v);
  pts.push({ f: f, med: m });
  console.log('  ' + (f * 100).toFixed(0).padStart(3) + '%  ' +
    String(v.length).padStart(4) + String(m).padStart(8) +
    String(Math.round(v.reduce((a, b) => a + b, 0) / v.length)).padStart(6) +
    String(Math.min(...v)).padStart(6) + String(Math.max(...v)).padStart(5) +
    String(over).padStart(7) + ' (' + pct(over / v.length) + ')');
});

// Monotonic naik? Selisih median antar-bucket.
let mono = true;
const deltas = [];
for (let i = 1; i < pts.length; i++) {
  const d = pts[i].med - pts[i - 1].med;
  deltas.push(d);
  if (d <= 0) mono = false;
}
console.log('');
console.log('delta median per bucket: ' +
  (deltas.length ? deltas.map((d) => (d >= 0 ? '+' : '') + d.toFixed(1)).join(' | ') : 'n/a'));
console.log('monotonik naik: ' + (mono ? 'YA' : 'TIDAK'));
if (!mono && pts.length > 1) {
  console.log('  -> skor TIDAK menaikkan secara konsisten seiring porsi AI.');
  console.log('     Artinya nilai skor tidak membedakan "campuran" dari "murni"');
  console.log('     pada rentang ini. Jangan klaim deteksi teks campuran.');
} else if (mono) {
  console.log('  -> skor naik seiring porsi AI pada rentang ini. ITU TETAP BUKAN');
  console.log('     bukti akurasi: cell ini konstruksi artificial (lihat header).');
}

// Compare: human murni vs machine murni dari sumber yang sama.
const base = fs.existsSync(path.join(ROOT, 'eval', 'raw_m4_peerread.jsonl'))
  ? fs.readFileSync(path.join(ROOT, 'eval', 'raw_m4_peerread.jsonl'), 'utf8')
    .split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) : [];
if (base.length) {
  const pure = { human: [], machine: [] };
  base.forEach((r) => { pure[r.label].push(api.heuristic(r.text).score); });
  console.log('');
  console.log('-- pembanding (Murni, sumber_peer review yang sama) --');
  console.log('   human  murni : n=' + pure.human.length + ' median=' + med(pure.human) +
    ' >=50: ' + pct(pure.human.filter((s) => s >= THR).length / pure.human.length));
  console.log('   machine murni : n=' + pure.machine.length + ' median=' + med(pure.machine) +
    ' >=50: ' + pct(pure.machine.filter((s) => s >= THR).length / pure.machine.length));
  const hMed = med(pure.human), mMed = med(pure.machine);
  console.log('  celah median human->machine murni = ' + (mMed - hMed).toFixed(1) +
    ' poin (acak = tidak ada sinyal)');
}
process.exit(0);
