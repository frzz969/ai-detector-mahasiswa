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
const fs = require('fs');
const path = require('path');
// Muat .env bila ada (untuk lokal). Di CI key datang dari secrets/env.
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((l) => {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
}
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

// CASE 2 (nyata): topik model/citra/data klinis paru.
const DOC_LUNG = [
  'Machine learning diterapkan untuk mendeteksi penyakit paru-paru dari citra rontgen dada.',
  'Model klasifikasi dilatih memakai ribuan citra yang berlabel oleh dokter spesialis.',
  'Evaluasi model memakai metrik akurasi, sensitivitas, dan spesifisitas pada data uji.',
  'Dataset tidak seimbang dapat menimbulkan bias pada hasil prediksi kelompok minoritas.',
  'Integrasi model ke alur kerja klinis memerlukan validasi prospektif dan pemantauan.',
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
  // Tanpa key: lewati, jangan paksa hijau. Provider yang dikonfigurasi tapi
  // tidak merespons = kegagalan (itu bug), key yang tidak ada = tidak diuji.
  const hasKeys = !!(process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY);
  if (!hasKeys) {
    console.log('  DILEWATI: GEMINI_API_KEY / GROQ_API_KEY tidak diset.');
    console.log('  (di CI, tambahkan secret bila ingin menguji jalur provider)');
    process.exit(0);
  }
  // Kontrak error harus tetap berlaku.
  let r = mkRes();
  await MATERIAL({ method: 'POST', body: { v: 1, hash: sha('beda'), canonicalText: DOC_RABBIT } }, r);
  ok(r.code === 400 && r.body.code === 'HASH_MISMATCH', 'hash tidak cocok ditolak', r.code + '/' + r.body.code);
  r = mkRes();
  await MATERIAL({ method: 'GET', body: null }, r);
  ok(r.code === 405, 'GET ditolak', String(r.code));

  await run('kelinci', DOC_RABBIT, true);
  await run('perpajakan', DOC_TAX, false);

  // ---- SEMANTIC: embedding sungguhan (bukan skor diinjeksi) ----
  // Lewati kalau tidak ada key / EMBEDDING_ENABLED=false: semantic yang
  // tidak aktif harus dilaporkan, bukan dianggap lulus diam-diam.
  console.log('\n=== 3. semantic similarity (embedding nyata) ===');
  if (!process.env.GEMINI_API_KEY || String(process.env.EMBEDDING_ENABLED || 'true').toLowerCase() === 'false') {
    console.log('  DILEWATI: tidak ada GEMINI_API_KEY atau EMBEDDING_ENABLED=false.');
    console.log('  Di produksi, api/material.js mengirim semanticMode; kalau fallback,');
    console.log('  user melihat warning bahwa relevansi hanya dari pencocokan kata.');
  } else {
    const rmk = mkRes();
    await MATERIAL({ method: 'POST', body: { v: 1, hash: sha(DOC_LUNG), canonicalText: DOC_LUNG } }, rmk);
    const bmk = rmk.body || {};
    console.log('  semanticMode   : ' + bmk.semanticMode + (bmk.embeddingModel ? ' (' + bmk.embeddingModel + ')' : ''));
    console.log('  confidence     : ' + bmk.retrievalConfidence);
    ok(bmk.semanticMode === 'embedding', 'semantic AKTIF (bukan fallback)', String(bmk.semanticMode));
    (bmk.materials || []).slice(0, 4).forEach((m) => {
      console.log('   - rel=' + m.relevance + ' conf=' + m.confidence +
        ' sem=' + (m.signals && m.signals.semantic) + ' | ' + String(m.title).slice(0, 56));
    });
    // CASE 2 sungguhan: judul tanpa kata "model" tetap boleh lolos.
    const paru = (bmk.materials || []).filter((m) => /paru|toraks|rontgen|tuberculosis/i.test(m.title));
    ok(paru.length > 0, 'CASE 2 (nyata): paper paru lolos walau judul tanpa kata model',
      paru.length + ' dari ' + (bmk.materials || []).length);
    // CASE 1 sungguhan: tidak boleh ada materi yang cuma menyinggung topik.
    const singleton = (bmk.materials || []).filter((m) =>
      m.signals && m.signals.semantic !== undefined && m.signals.semantic < 0.62);
    ok(singleton.length === 0, 'tidak ada materi dengan semantic di bawah ambang',
      singleton.length + ' lolos');
    (bmk.materials || []).forEach((m) => {
      ok(!!m.confidence && !!m.signals,
        'materi punya confidence + rincian sinyal', String(m.title).slice(0, 30));
    });
  }

  console.log('');
  if (failures.length) {
    console.log('GAGAL (' + failures.length + '):');
    failures.forEach((f) => console.log(' - ' + f));
    process.exit(1);
  }
  console.log('MATERIAL LIVE LOLOS.');
})();