// tests/tools-regression.js - Regression test fitur pendukung (Explainer & Summarizer).
//
// Aturan: validation-rules P6 (uji regresi wajib tiap ubah kode). Load file asli
// (bukan implementasi ulang): js/core -> js/referensi -> js/detector ->
// js/ai/summarizer untuk summarise, dan api/material.js (CommonJS) untuk
// relevance gate. Tanpa jaringan: kandidat materi = mock.
//
// CASE A  Explainer: sumber yang HANYA punya keyword "kelinci" tidak boleh tampil.
// CASE B  Summarizer: ringkasan tidak boleh didominasi kalimat generik.
// CASE C  Semua kandidat relevance < threshold -> materials kosong (boleh 0).
// CASE D  Kalimat hasil AI yang tidak verbatim -> TOLAK (fallback lokal).
// CASE E  Sumber dengan relevance lemah -> ditolak meski sitasi tinggi.
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

// ---------- Harness DOM (ringkas, sama pola tests/faraztest.js) ----------
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

function loadSummarizer() {
  const files = ['js/core.js', 'js/referensi.js', 'js/detector.js', 'js/ai/summarizer.js'];
  const code = files.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
  const factory = new Function('document', 'window', 'navigator', code +
    '\n;return globalThis.FarazSummarize;');
  return factory(documentStub, {}, {});
}

const MATERIAL = require(path.join(ROOT, 'api', 'material.js'));

// ---------- Data regression (teks ~40 kalimat, multi-topik, multi-paragraf) ----------
const RABBIT = [
  'Kelinci termasuk hewan herbivora yang telah lama domesticated di Indonesia.',
  'Klasifikasi yang paling umum adalah Oryctolagus cuniculus, kelinci rumah.',
  'Sistem pencernaan kelinci bergantung pada fermentasi selulosa di usus besar caecum.',
  'Akibatnya kelinci tidak dapat mencerna SERAT dalam jumlah besar dan membutuhkan hijauan agar mikrobiota caecum seimbang.',
  'Pola hidup kelinci bersifat soliter dan aktif pada malam hari sehingga kebutuhan lingkungan yang hangat perlu diperhatikan.',
  'Kelinci memang menjadi salah satu hewan yang cukup dekat dengan manusia.',
  'Kelinci tidak hanya terdiri dari satu jenis saja.',
  'Salah satu hal yang paling mudah dikenali dari kelinci adalah telinganya.',
  'Klasifikasi ras kelinci meliputi Rex, Angora, dan Dutch yang dibedakan panjang bulu dan ukuran tubuh.',
  'Kebutuhan nutrisi kelinci terutama dipenuhi oleh hijauan dan Timothy hay agar mikrobiota caecum tetap seimbang.',
  'Penyakit yang umum muncul pada kelinci adalah pasteurellosis, coccidiosis, dan snuffles.',
  'Karena itu, kelinci perlu sering mengunyah makanan berserat agar kesehatan pencernaan tetap baik.',
  'Pembiaban kelinci menuntut pengaturan suhu kandang yang stabil agar reproduksi berjalan optimal.',
  'Produksi daging kelinci di Indonesia masih terbatas dan belum banyak dipakai.',
  'Mortalitas anakan dapat turun jika sanitasi kandang dilakukan rutin setiap minggu.',
  'Kelinci juga menjadi makanan bagi hewan lain seperti burung dan ular.',
  'Kelinci umumnya banyak dijumpai di pasar rakyat pada bulan tertentu.',
  'Kelinci perlu dijaga agar tidak terlalu lama dipelihara tanpa perhatian.',
  'Nilai daging kelinci di Indonesia masih memerlukan pasar yang lebih luas.',
  'Penjualan kelinci dilakukan langsung oleh pembudidaya kecil di desa.',
].join(' ');

const MATERIAL_CANDIDATES = [
  { id: 'ontopic', title: 'Klasifikasi dan kebutuhan nutrisi kelinci rumah (Oryctolagus cuniculus)', venue: 'Jurnal Ternak', doi: '10.1/a', tier: 'Jurnal/paper', citations: 12, year: 2020, source: 'OpenAlex' },
  { id: 'betawi', title: 'GASTRONOMI MAKANAN BETAWI SEBAGAI SALAH SATU IDENTITAS BUDAYA DAERAH', venue: 'Jurnalraryawan', doi: '10.1/b', tier: 'Jurnal/paper', citations: 40, year: 2018, source: 'Crossref' },
  { id: 'ibm', title: 'IbM Kelompok Usaha Wanita Budidaya Kelinci Pedaging', venue: 'Jurnal pengmas', doi: '10.1/c', tier: 'Jurnal/paper', citations: 5, year: 2022, source: 'Crossref' },
  { id: 'sistem', title: 'Perancangan Sistem Informasi Penjualan Hewan Peliharaan Kelinci Berbasis Web', venue: 'Jurnal tiulik', doi: '10.1/d', tier: 'Jurnal/paper', citations: 8, year: 2023, source: 'OpenAlex' },
  { id: 'bromo', title: 'Bromo kian rawan banjir, warga diminta segera mengungsi', venue: 'Berita', doi: '10.1/e', tier: 'Umum', citations: 9999, year: 2024, source: 'Crossref' },
  { id: 'dupe', title: 'Klasifikasi dan kebutuhan nutrisi kelinci rumah (Oryctolagus cuniculus)', venue: 'Jurnal Ternak', doi: '10.1/a', tier: 'Jurnal/paper', citations: 12, year: 2020, source: 'Semantic Scholar' },
];

// ---------- Assertion helper ----------
const failures = [];
function ok(cond, label, detail) {
  if (cond) console.log('  OK   ' + label + (detail ? '  [' + detail + ']' : ''));
  else { console.log('  GAGAL ' + label + (detail ? '  [' + detail + ']' : '')); failures.push(label + (detail ? ' (' + detail + ')' : '')); }
}

function titlesOf(list) { return list.map((m) => m.title); }

// ================= CASE A =================
console.log('CASE A - Explainer: sumber keyword-only tidak boleh tampil');
{
  const profile = MATERIAL.buildProfile(RABBIT);
  const sel = MATERIAL.selectMaterials(MATERIAL_CANDIDATES, profile, {});
  const titles = titlesOf(sel.materials);
  const bad = sel.materials.filter((m) => /BETAWI|Bromo/.test(m.title));
  ok(bad.length === 0, 'tidak ada sumber tak relevan (BETAWI/Bromo)', 'ada: ' + titles.join(' | '));
  const sistem = sel.materials.filter((m) => /Sistem Informasi/.test(m.title));
  ok(sistem.length === 0, 'judul "sistem informasi kelinci" ditolak (keyword-only)');
  ok(titles.some((t) => /Klasifikasi dan kebutuhan/.test(t)), 'sumber on-topic tetap tampil');
  sel.materials.forEach((m) => {
    ok(typeof m.relevance === 'number' && m.relevance >= MATERIAL.MIN_SOURCE_RELEVANCE,
      'relevansi sumber di atas ambang', m.title.slice(0, 34) + ' = ' + m.relevance);
    ok(!!m.relevanceReason && !/^(ada kata|keyword)/i.test(m.relevanceReason),
      'alasan relevansi spesifik', m.relevanceReason);
  });
}

// ================= CASE B =================
console.log('CASE B - Summarizer: ringkasan tidak boleh didominasi kalimat generik');
let sumResult = null;
{
  const S = loadSummarizer();
  sumResult = S.summarize(RABBIT);
  const chosen = sumResult.sentences;
  const scored = S.scoreSentences(RABBIT);
  const genericOld = [
    'Kelinci memang menjadi salah satu hewan yang cukup dekat dengan manusia.',
    'Kelinci tidak hanya terdiri dari satu jenis saja.',
    'Salah satu hal yang paling mudah dikenali dari kelinci adalah telinganya.',
  ];
  const genericChosen = chosen.filter((s) => genericOld.indexOf(s) !== -1);
  ok(genericChosen.length === 0, 'tidak ada kalimat generik lama yang dipilih',
    genericChosen.length ? genericChosen[0] : '');
  const gset = {};
  scored.forEach((e) => { gset[e.sent] = e.generic; });
  const picked = chosen.map((s) => gset[s]);
  const maxGeneric = Math.max.apply(null, picked.concat([0]));
  ok(maxGeneric < 0.5, 'semua kalimat terpilih punya generic < 0.5', 'maks = ' + maxGeneric);
  ok(chosen.length >= 3, 'ringkasan minimal 3 kalimat (bukan 1-2 pembuka)', chosen.length + ' kalimat');
  // Verbatim + urutan asli.
  ok(S.verifyExtractive(RABBIT, chosen) === null, '100% ekstraktif (verbatim, tanpa duplikat)');
  const idx = chosen.map((s) => scored.findIndex((e) => e.sent === s));
  const sorted = idx.slice().sort((a, b) => a - b);
  ok(JSON.stringify(idx) === JSON.stringify(sorted), 'urutan mengikuti posisi asli', idx.join(','));
  // Coverage: tidak semua dari satu paragraf/kalimat berdekatan.
  ok(idx[idx.length - 1] - idx[0] >= 3, 'pilihan tersebar (bukan berdekatan)', idx.join(','));
  console.log('  info  ringkasan: ' + chosen.map((s, i) => (i + 1) + ') ' + s.slice(0, 58)).join('\n        '));
}

// ================= CASE C =================
console.log('CASE C - semua kandidat relevance < threshold -> materials kosong');
{
  const profile = MATERIAL.buildProfile(RABBIT);
  // Hanya kandidat yang benar-benar lemah: tidak cocok topik (Betawi/Bromo) dan
  // hanya cocok satu kata kunci (sistem informasi). "IbM kelinci pedaging" TIDAK
  // masuk daftar ini: ia menutup 2 topik nyata (kelinci + daging) dan diuji
  // di CASE E sebagai sumber yang BOLEH tampil dengan skor + alasan.
  const weakOnly = MATERIAL_CANDIDATES.filter((c) => ['betawi', 'sistem', 'bromo'].indexOf(c.id) !== -1);
  const sel = MATERIAL.selectMaterials(weakOnly, profile, {});
  ok(sel.materials.length === 0, 'hasil kosong (tidak dipaksa 10 sumber)', sel.materials.length + ' sumber');
  ok(sel.threshold === MATERIAL.MIN_SOURCE_RELEVANCE, 'ambang tercatat', String(sel.threshold));
  ok(sel.rejectedLowRelevance + sel.rejectedGate + sel.rejectedNoReason === weakOnly.length,
    'semua kandidat tercatat ditolak', JSON.stringify(sel));
  // Kandidat yang lolos TIDAPermesta tanpa alasan relevansi (anti "ada kata X").
  const withAny = MATERIAL.selectMaterials(MATERIAL_CANDIDATES, profile, {});
  ok(withAny.materials.every((m) => typeof m.relevance === 'number' && m.relevance >= sel.threshold && m.relevanceReason),
    'semua sumber yang tampil punya skor + alasan relevansi');
}

// ================= CASE D =================
console.log('CASE D - kalimat AI tidak verbatim -> TOLAK (fallback lokal)');
{
  const S = loadSummarizer();
  const paraphrase = 'Kelinci punya sistem pencernaan khusus yang unik untuk literasinya.';
  ok(S.verifyExtractive(RABBIT, [paraphrase]) !== null, 'kalimat paraphrase ditolak');
  const angkaUbah = 'Klasifikasi yang paling umum adalah Oryctolagus domesticus, kelinci rumah.';
  ok(S.verifyExtractive(RABBIT, [angkaUbah]) !== null, 'kalimat dengan angka/istilah diubah ditolak');
  const duplikat = ['Klasifikasi ras kelinci meliputi Rex, Angora, dan Dutch yang dibedakan panjang bulu dan ukuran tubuh.'];
  ok(S.verifyExtractive(RABBIT, duplikat.concat(duplikat)) !== null, 'duplikat ditolak');
  ok(S.verifyExtractive(RABBIT, duplikat) === null, 'kalimat verbatim asli diterima');
}

// ================= CASE E =================
console.log('CASE E - sumber relevance lemah DITOLAK meski sitasi tinggi');
{
  const profile = MATERIAL.buildProfile(RABBIT);
  const bromo = MATERIAL_CANDIDATES.find((c) => c.id === 'bromo');
  const sc = MATERIAL.scoreCandidate(bromo, profile);
  ok(sc.relevance < MATERIAL.MIN_SOURCE_RELEVANCE, 'Bromo (9999 sitasi) relevance di bawah ambang',
    'relevance = ' + sc.relevance);
  ok(sc.passes === false, 'Bromo gagal gate');
  const sistem = MATERIAL_CANDIDATES.find((c) => c.id === 'sistem');
  const sc2 = MATERIAL.scoreCandidate(sistem, profile);
  ok(sc2.relevance < MATERIAL.MIN_SOURCE_RELEVANCE,
    'judul sistem informasi kelinci di bawah ambang', 'relevance = ' + sc2.relevance);
  // Dedupe
  const dup = MATERIAL.selectMaterials(MATERIAL_CANDIDATES, profile, {});
  const dois = dup.materials.map((m) => m.doi);
  ok(new Set(dois).size === dois.length, 'tidak ada duplikat DOI', dois.join(','));
  ok(dup.rejectedDuplicate >= 1, 'duplikat tercatat', String(dup.rejectedDuplicate));

  // CATATAN desain (bukan bug): "IbM Kelompok Usaha Wanita Budidaya Kelinci
  // Pedaging" BOLEH tampil pada teks kelinci ini, karena ia menutup dua topik
  // nyata (kelinci + daging) dan skornya di atas ambang. Yang ditolak adalah
  // sumber yang hanya cocok satu kata kunci - bukan sumber yang memang membahas
  // kelinci. Keyword-only != relevan; keyword-only TIDAK otomatis relevan.
  const ibm = MATERIAL_CANDIDATES.find((c) => c.id === 'ibm');
  const ibmSel = MATERIAL.selectMaterials([ibm], profile, {});
  ok(ibmSel.materials.length === 1 && ibmSel.materials[0].relevance >= MATERIAL.MIN_SOURCE_RELEVANCE,
    'sumber 2-topik (kelinci+daging) tampil dengan skor, bukan dibuang diam-diam',
    ibmSel.materials.length ? String(ibmSel.materials[0].relevance) : 'tidak tampil');
}

// ---------- Ringkasan ----------
console.log('');
if (failures.length) {
  console.log('REGRESSION GAGAL (' + failures.length + '):');
  failures.forEach((f) => console.log(' - ' + f));
  process.exit(1);
}
console.log('REGRESSION LOLOS: CASE A-E semua sesuai kontrak.');
