// tests/retrieval-eval.js - Evaluasi retrieval offline dari label manual.
// Skema per baris eval/retrieval-benchmark.jsonl:
//   { text, topic, query_id, candidates: [{ source, title, url, relevance: 0/1/2,
//     hard_negative: true/false }], note: "TEMPLATE - ganti dengan penilaian manual"
//     untuk baris template }
// Aturan: offline saja (fs/path, tanpa network/secret); baris TEMPLATE dilewati;
// relevansi 0 = tidak relevan, 1-2 = relevan (2 = sangat relevan).
// Metrik: precision@10, precision@3 (macro-avg per query), recall
// (relevan di top-10 / total relevan di pool kandidat), off-domain count
// (kandidat relevance=0 yang masuk top-10).
// Info tambahan (tidak memengaruhi exit code): hard-negative yang masuk top-10
// dan precision@10 tanpa hard-negative.
// Exit 0 bila file hanya berisi template (pesan BUTUH LABEL MANUAL).
// Exit 1 bila precision@10 di bawah baseline (konstanta di bawah, default 0).
'use strict';

const fs = require('fs');
const path = require('path');

// BASELINE_PRECISION_AT_10: ambang baca-manusia dari README/eval.
// Belum ada baseline manual -> default 0 (tidak menghukum template/awal).
// Saat label manual sudah ada dan baseline ditetapkan, ubah konstanta ini.
const BASELINE_PRECISION_AT_10 = 0;

const BENCH = path.resolve(__dirname, '..', 'eval', 'retrieval-benchmark.jsonl');

function isTemplateRow(obj) {
  if (!obj || typeof obj !== 'object') return true;
  const note = String((obj.note == null ? '' : obj.note));
  if (/template/i.test(note)) return true;
  if (/template/i.test(String(obj.text == null ? '' : obj.text))) return true;
  return false;
}

function isRelevant(c) {
  return Number(c && c.relevance) >= 1;
}

function isHardNeg(c) {
  return !!(c && c.hard_negative === true);
}

function main() {
  let raw;
  try {
    raw = fs.readFileSync(BENCH, 'utf8');
  } catch (e) {
    console.log('RETRIEVAL-EVAL GAGAL: file tidak ditemukan: eval/retrieval-benchmark.jsonl');
    process.exit(2);
    return;
  }
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  let skipped = 0;
  const queries = [];
  lines.forEach((line, idx) => {
    let obj = null;
    try { obj = JSON.parse(line); } catch (_) { console.log('  SKIP baris ' + (idx + 1) + ': bukan JSON valid'); skipped++; return; }
    if (isTemplateRow(obj)) { skipped++; return; }
    if (!Array.isArray(obj.candidates) || obj.candidates.length === 0) {
      console.log('  SKIP baris ' + (idx + 1) + ': tanpa candidates');
      skipped++;
      return;
    }
    queries.push(obj);
  });

  if (queries.length === 0) {
    console.log('BUTUH LABEL MANUAL: eval/retrieval-benchmark.jsonl hanya berisi TEMPLATE (' + skipped + ' baris template dilewati). Ganti dengan penilaian manual relevance 0/1/2.');
    process.exit(0);
    return;
  }

  let sumP10 = 0, sumP3 = 0, sumRecall = 0, offDomainTotal = 0;
  let hardNegInTop10 = 0, sumP10noHN = 0;
  queries.forEach((q) => {
    const cands = q.candidates;
    const totalRelevant = cands.filter(isRelevant).length;
    const top10 = cands.slice(0, 10);
    const top3 = cands.slice(0, 3);
    const rel10 = top10.filter(isRelevant).length;
    const rel3 = top3.filter(isRelevant).length;
    const p10 = top10.length ? rel10 / top10.length : 0;
    const p3 = top3.length ? rel3 / top3.length : 0;
    const recall = totalRelevant ? rel10 / totalRelevant : 1;
    const off = top10.filter((c) => Number(c.relevance) === 0).length;
    sumP10 += p10; sumP3 += p3; sumRecall += recall; offDomainTotal += off;
    // Info saja: hard-negative di top-10 + precision tanpa hard-negative.
    hardNegInTop10 += top10.filter(isHardNeg).length;
    const top10noHN = top10.filter((c) => !isHardNeg(c));
    sumP10noHN += top10noHN.length ? top10noHN.filter(isRelevant).length / top10noHN.length : 0;
  });
  const n = queries.length;
  const p10 = sumP10 / n, p3 = sumP3 / n, recall = sumRecall / n;

  console.log('RETRIEVAL-EVAL: queries=' + n + ' skipped-template=' + skipped);
  console.log('  precision@10=' + p10.toFixed(3) + ' baseline=' + BASELINE_PRECISION_AT_10.toFixed(3));
  console.log('  precision@3=' + p3.toFixed(3) + ' recall=' + recall.toFixed(3) + ' off-domain-top10=' + offDomainTotal);
  console.log('  [info] hard-negative di top-10=' + hardNegInTop10 + ' precision@10-tanpa-hardneg=' + (sumP10noHN / n).toFixed(3) + ' (info saja, tidak memengaruhi exit code)');

  if (p10 + 1e-9 < BASELINE_PRECISION_AT_10) {
    console.log('REGRESI: precision@10 ' + p10.toFixed(3) + ' di bawah baseline ' + BASELINE_PRECISION_AT_10.toFixed(3));
    process.exit(1);
    return;
  }
  console.log('RETRIEVAL-EVAL OK.');
  process.exit(0);
}

main();
