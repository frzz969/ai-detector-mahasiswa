// tests/material-live.js - Live check relevance gate dengan API sungguhan.
//
// Butuh INTERNET (OpenAlex/Crossref/Wikipedia/Wikidata). Dipisah dari test
// offline karena jaringan tidak selalu tersedia di CI.
// Aturan: validation-rules P6 (regresi wajib tiap ubah kode) - ini bukti
// bahwa relevance gate tetap menyaring sumber keyword-only pada data nyata.
//
// Run: node tests/material-live.js
'use strict';

const crypto = require('crypto');
const path = require('path');
const MATERIAL = require(path.join(__dirname, '..', 'api', 'material.js'));

const OFFTOPIC = /\b(kelinci|hewan|ternak|unggas|ayam|sapi|domba|rabbit|livestock|poultry|cattle)\b/i;

const DOC_RABBIT = [
  'Kelinci termasuk hewan herbivora yang telah lama domesticated di Indonesia.',
  'Klasifikasi yang paling umum adalah Oryctolagus cuniculus, kelinci rumah.',
  'Sistem pencernaan kelinci bergantung pada fermentasi selulosa di usus besar caecum.',
  'Akibatnya kelinci tidak dapat mencerna SERAT dalam jumlah besar dan membutuhkan hijauan agar mikrobiota caecum seimbang.',
  'Klasifikasi ras kelinci meliputi Rex, Angora, dan Dutch yang dibedakan panjang bulu dan ukuran tubuh.',
  'Kebutuhan nutrisi kelinci terutama dipenuhi oleh hijauan dan Timothy hay.',
  'Penyakit yang umum muncul pada kelinci adalah pasteurellosis, coccidiosis, dan snuffles.',
  'Pembiaan kelinci menuntut pengaturan suhu kandang yang stabil agar reproduksi berjalan optimal.',
].join(' ');

const DOC_TAX = [
  'Peraturan perpajakan terbaru mengubah struktur tarif bagi wajib pajak pribadi.',
  'Pembagian wajib pajak pribadi meningkat setiap tahun seiring pertumbuhan ekonomi nasional.',
  'Penghitungan kewajiban pajak bagi perusahaan membutuhkan data transaksi yang terverifikasi.',
  'Kepatuhan terhadap kewajiban perpajakan menjadi perhatian utama dalam pengauditan internal perusahaan.',
  'Pemodelan penghitungan pajak memerlukan data transaksi yang lengkap dan dapat ditelusuri.',
  'Penyetoran pajak dilakukan secara bulanan melalui sistem resmi milik negara.',
].join(' ');

function mkRes() {
  const r = { code: 0, body: null };
  r.status = function (c) { r.code = c; return r; };
  r.json = function (o) { r.body = o; return r; };
  r.setHeader = function () {};
  r.end = function (s) { r.body = JSON.parse(s); return r; };
  return r;
}
const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');

const failures = [];
function ok(cond, label, detail) {
  if (cond) console.log('  OK   ' + label + (detail ? '  [' + detail + ']' : ''));
  else {
    console.log('  GAGAL ' + label + (detail ? '  [' + detail + ']' : ''));
    failures.push(label);
  }
}

async function run(key, doc, isAnimal) {
  const res = mkRes();
  await MATERIAL({ method: 'POST', body: { v: 1, hash: sha(doc), canonicalText: doc } }, res);
  const b = res.body || {};
  console.log('\n### ' + key);
  console.log('  status    : ' + res.code);
  console.log('  topics    : ' + (b.topics || []).join(', '));
  console.log('  threshold : ' + b.threshold);
  console.log('  materials : ' + (b.materials || []).length);
  (b.materials || []).slice(0, 5).forEach((m, i) => {
    console.log('   ' + (i + 1) + '. rel=' + m.relevance + ' | ' + String(m.title).slice(0, 66));
    console.log('      ' + m.relevanceReason);
  });
  (b.warnings || []).slice(0, 2).forEach((w) => console.log('   ! ' + String(w).slice(0, 110)));

  ok(res.code === 200, 'status 200', String(res.code));
  ok(b.threshold === MATERIAL.MIN_SOURCE_RELEVANCE, 'ambang terkirim', String(b.threshold));
  (b.materials || []).forEach((m) => {
    ok(typeof m.relevance === 'number' && m.relevance >= b.threshold && !!m.relevanceReason,
      'materi punya skor+alasan', String(m.relevance));
  });
  if (!isAnimal) {
    const leak = (b.materials || []).filter((m) => OFFTOPIC.test(m.title + ' ' + m.relevanceReason));
    ok(leak.length === 0, 'tidak ada kebocoran domain hewan pada dokumen non-hewan', leak.length + ' kebocoran');
  }
  return b;
}

(async function () {
  console.log('MATERIAL LIVE (butuh internet)');
  // Kontrak error harus tetap berlaku.
  let r = mkRes();
  await MATERIAL({ method: 'POST', body: { v: 1, hash: sha('beda'), canonicalText: DOC_RABBIT } }, r);
  ok(r.code === 400 && r.body.code === 'HASH_MISMATCH', 'hash tidak cocok ditolak', r.code + '/' + r.body.code);
  r = mkRes();
  await MATERIAL({ method: 'GET', body: null }, r);
  ok(r.code === 405, 'GET ditolak', String(r.code));

  await run('kelinci', DOC_RABBIT, true);
  await run('perpajakan', DOC_TAX, false);

  console.log('');
  if (failures.length) {
    console.log('GAGAL (' + failures.length + '):');
    failures.forEach((f) => console.log(' - ' + f));
    process.exit(1);
  }
  console.log('MATERIAL LIVE LOLOS.');
})();