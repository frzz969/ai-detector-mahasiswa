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
// CASE F  Validator: hanya istilah sungguhan yang dihitung (bukan kata awal
//         kalimat), dan ringkasan terkompresi boleh lolos tanpa mengorbankan fakta.
// CASE G  Summarizer: hindari kalimat bergantung ("Namun, ..."/"Hewan ini ...").
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

// Harness DOM (ringkas, sama pola tests/faraztest.js)
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

function loadValidate() {
  const code = fs.readFileSync(path.join(ROOT, 'js/ai/validate.js'), 'utf8');
  return new Function('globalThis', code + '\n;return globalThis.FarazValidate;')({});
}

const MATERIAL = require(path.join(ROOT, 'api', 'material.js'));

// Data regression (teks ~40 kalimat, multi-topik, multi-paragraf)
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
  { id: 'ontopic', title: 'Klasifikasi dan kebutuhan nutrisi kelinci rumah (Oryctolagus cuniculus)',
    venue: 'Jurnal Ternak', doi: '10.1/a', tier: 'Jurnal/paper', citations: 12, year: 2020, source: 'OpenAlex' },
  { id: 'betawi', title: 'GASTRONOMI MAKANAN BETAWI SEBAGAI SALAH SATU IDENTITAS BUDAYA DAERAH',
    venue: 'Jurnalraryawan', doi: '10.1/b', tier: 'Jurnal/paper', citations: 40, year: 2018, source: 'Crossref' },
  { id: 'ibm', title: 'IbM Kelompok Usaha Wanita Budidaya Kelinci Pedaging',
    venue: 'Jurnal pengmas', doi: '10.1/c', tier: 'Jurnal/paper', citations: 5, year: 2022, source: 'Crossref' },
  { id: 'sistem',
    title: 'Perancangan Sistem Informasi Penjualan Hewan Peliharaan Kelinci Berbasis Web', venue: 'Jurnal tiulik', doi: '10.1/d', tier: 'Jurnal/paper', citations: 8, year: 2023, source: 'OpenAlex' },
  { id: 'bromo', title: 'Bromo kian rawan banjir, warga diminta segera mengungsi', venue: 'Berita',
    doi: '10.1/e', tier: 'Umum', citations: 9999, year: 2024, source: 'Crossref' },
  { id: 'dupe', title: 'Klasifikasi dan kebutuhan nutrisi kelinci rumah (Oryctolagus cuniculus)',
    venue: 'Jurnal Ternak', doi: '10.1/a', tier: 'Jurnal/paper', citations: 12, year: 2020, source: 'Semantic Scholar' },
];

// Assertion helper
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
  ok(bad.length === 0, 'tidak ada sumber tak relevan (BETAWI/Bromo)',
    'ada: ' + titles.join(' | '));
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
  ok(chosen.length >= 3, 'ringkasan minimal 3 kalimat (bukan 1-2 pembuka)',
    chosen.length + ' kalimat');
  // Verbatim + urutan asli.
  ok(S.verifyExtractive(RABBIT, chosen) === null, '100% ekstraktif (verbatim, tanpa duplikat)');
  const idx = chosen.map((s) => scored.findIndex((e) => e.sent === s));
  const sorted = idx.slice().sort((a, b) => a - b);
  ok(JSON.stringify(idx) === JSON.stringify(sorted), 'urutan mengikuti posisi asli',
    idx.join(','));
  // Coverage: tidak semua dari satu paragraf/kalimat berdekatan.
  ok(idx[idx.length - 1] - idx[0] >= 3, 'pilihan tersebar (bukan berdekatan)', idx.join(','));
  console.log('  info  ringkasan: ' + chosen.map((s, i) => (i + 1) + ') ' + s.slice(0,
    58)).join('\n        '));
}

// ================= CASE C =================
console.log('CASE C - semua kandidat relevance < threshold -> materials kosong');
{
  const profile = MATERIAL.buildProfile(RABBIT);
  // Hanya kandidat yang benar-benar lemah: tidak cocok topik (Betawi/Bromo) dan
  // hanya cocok satu kata kunci (sistem informasi). "IbM kelinci pedaging" TIDAK
  // masuk daftar ini: ia menutup 2 topik nyata (kelinci + daging) dan diuji
  // di CASE E sebagai sumber yang BOLEH tampil dengan skor + alasan.
  const weakOnly = MATERIAL_CANDIDATES.filter((c) => ['betawi', 'sistem',
    'bromo'].indexOf(c.id) !== -1);
  const sel = MATERIAL.selectMaterials(weakOnly, profile, {});
  ok(sel.materials.length === 0, 'hasil kosong (tidak dipaksa 10 sumber)',
    sel.materials.length + ' sumber');
  ok(sel.threshold === MATERIAL.MIN_SOURCE_RELEVANCE, 'ambang tercatat', String(sel.threshold));
  ok(sel.rejectedLowRelevance + sel.rejectedGate + sel.rejectedNoReason === weakOnly.length,
    'semua kandidat tercatat ditolak', JSON.stringify(sel));
  // Kandidat yang lolos TIDAPermesta tanpa alasan relevansi (anti "ada kata X").
  const withAny = MATERIAL.selectMaterials(MATERIAL_CANDIDATES, profile, {});
  ok(withAny.materials.every((m) => typeof m.relevance === 'number'
    && m.relevance >= sel.threshold && m.relevanceReason),
    'semua sumber yang tampil punya skor + alasan relevansi');
}

// ================= CASE D =================
console.log('CASE D - kalimat AI tidak verbatim -> TOLAK (fallback lokal)');
{
  const S = loadSummarizer();
  const paraphrase = 'Kelinci punya sistem pencernaan khusus yang unik untuk literasinya.';
  ok(S.verifyExtractive(RABBIT, [paraphrase]) !== null, 'kalimat paraphrase ditolak');
  const angkaUbah = 'Klasifikasi yang paling umum adalah Oryctolagus domesticus, kelinci rumah.';
  ok(S.verifyExtractive(RABBIT, [angkaUbah]) !== null,
    'kalimat dengan angka/istilah diubah ditolak');
  const duplikat = ['Klasifikasi ras kelinci meliputi Rex, Angora, dan Dutch yang dibedakan panjang bulu dan ukuran tubuh.'];
  ok(S.verifyExtractive(RABBIT, duplikat.concat(duplikat)) !== null, 'duplikat ditolak');
  ok(S.verifyExtractive(RABBIT, duplikat) === null, 'kalimat verbatim asli diterima');
}

// ================= CASE F =================
// REGRESSION CASE (ringkasan bagus tertolak): properNouns() lama memakai
// /\s[A-Z][a-z]+/ yang menghitung SETIAP kata awal kalimat sebagai "istilah",
// sehingga teks Indonesia (huruf besar di awal kalimat) menghasilkan puluhan
// istilah palsu dan setiap ringkasan ditolak oleh checkTerminology.
console.log('CASE F - Validator: istilah sungguhan, bukan kata awal kalimat');
const LONG_SRC = [
  'Kelinci merupakan salah satu jenis mamalia yang dikenal di berbagai belahan dunia.',
  'Hewan ini termasuk ke dalam ordo Lagomorpha dan famili Leporidae.',
  'Kelinci memiliki ciri khas berupa telinga panjang, tubuh berbulu, kaki belakang yang kuat, serta gigi seri yang terus tumbuh.',
  'Salah satu spesies yang menjadi dasar kelinci domestik adalah Oryctolagus cuniculus atau kelinci Eropa.',
  'Kelinci merupakan hewan herbivora yang memakan rumput, daun, dan berbagai tumbuhan.',
  'Sistem pencernaannya mampu mengolah makanan yang kaya serat, termasuk melalui memakan cecotropes.',
  'Di alam, kelinci berperan sebagai pemakan tumbuhan sekaligus bagian dari rantai makanan bagi predator.',
  'Kelinci juga memiliki kemampuan berkembang biak yang cukup tinggi sehingga populasinya cepat berkembang.',
  'Kelinci telah didomestikasi dan dikembangkan menjadi berbagai ras dengan ukuran dan warna bulu berbeda.',
  'Oleh karena itu, kelinci memiliki peranan penting dalam ekosistem maupun kehidupan manusia.',
].join(' ');
{
  const V = loadValidate();
  // Ringkasan abstractive (gabung + parafrase) yang_SEHAT_: harus LOLOS.
  const RINGKAS_BAGUS = [
    'Kelinci termasuk ordo Lagomorpha dan famili Leporidae dengan ciri khas telinga panjang, tubuh berbulu, dan gigi seri yang terus tumbuh.',
    'Oryctolagus cuniculus atau kelinci Eropa menjadi dasar kelinci domestik.',
    'Sebagai herbivora, kelinci mengolah serat melalui cecotropes dan berperan dalam rantai makanan sebagai makanan predator.',
    'Kemampuan berkembang biaknya tinggi, dan setelah didomestikasi menjadi berbagai ras dengan ukuran serta warna bulu berbeda.',
  ].join(' ');
  const r1 = V.validate(LONG_SRC, RINGKAS_BAGUS, {});
  ok(r1.pass === true, 'ringkasan abstractive yang sehat LOLOS',
    r1.fails.map((f) => f.check).join(','));

  // Fallback ekstraktif: kalimat ASLI yang benar-benar ada di LONG_SRC.
  const FALLBACK_LAMA = [
    'Hewan ini termasuk ke dalam ordo Lagomorpha dan famili Leporidae.',
    'Kelinci merupakan hewan herbivora yang memakan rumput, daun, dan berbagai tumbuhan.',
    'Oleh karena itu, kelinci memiliki peranan penting dalam ekosistem maupun kehidupan manusia.',
  ].join(' ');
  const r2 = V.validate(LONG_SRC, FALLBACK_LAMA, {});
  ok(r2.pass === true, 'fallback ekstraktif tetap valid', r2.fails.map((f) => f.check).join(','));

  // ANTI BOCOR: karangan harus tetap DITOLAK.
  const KARPAN = 'Kelinci termasuk ordo Lagomorpha. Kelinci dapat terbang 300 km dalam 15 menit dan dapat hidup 50 tahun. Predator utamanya adalah Harimau Jawa yang sering memangsa kelinci dewasa. Penelitian menunjukkan 87% kelinci memiliki struktur khusus pada rahangnya.';
  const r3 = V.validate(LONG_SRC, KARPAN, {});
  ok(r3.fails.length > 0, 'karangan (angka/istilah rekaan) DITOLAK',
    r3.fails.map((f) => f.check).join(','));

  // Angka/sitasi/istilah asli WAJIB utuh walau ringkasan boleh parafrase.
  const dgnAngka = 'Penelitian dilakukan di tiga sekolah tahun 2021 dengan 120 siswa. Data dianalisis dengan uji t. Hasil menunjukkan perbedaan signifikan antarkelompok, namun terbatas pada satu wilayah.';
  const r4 = V.validate(dgnAngka,
    'Penelitian dilakukan di tiga sekolah dengan kuesioner dan uji t, menunjukkan perbedaan signifikan antarkelompok.', {});
  ok(r4.fails.some((f) => f.check === 'numbers'), 'angka/tahun hilang saat ringkasan DITOLAK',
    r4.fails.map((f) => f.check).join(','));
  // Negasi: boleh berkurang (kompresi) tapi TIDAK boleh dibalik.
  // Teks asli panjang agar kandidat benar-benar "summary-like" (rasio < 0,45).
  const negAsli = 'Kelinci tidak dapat hidup tanpa air karena sistem pencernaannya bergantung pada cairan. '
    + 'Kelinci tidak takut pada cahaya lemah selama lingkungan tetap hangat. '
    + 'Hewan ini tidak menyukai suhu yang sangat tinggi di lingkungan lembap. '
    + 'Kelinci tidak pernah berkumpul dengan predatornya di alam terbuka. '
    + 'Kelinci tidak memiliki kemampuan untuk berenang dalam waktu lama. '
    + 'Pola hidup soliter membuat kelinci tidak mudah beradaptasi pada kandang beramai-ramai.';
  const r5 = V.validate(negAsli,
    'Kelinci membutuhkan air, toleransi cahaya, dan suhu yang tidak terlalu tinggi agar bertahan hidup.', {});
  ok(r5.pass === true, 'ringkasan yang membuang negasi (kompresi) LOLOS',
    r5.fails.map((f) => f.check).join(','));
  const r6 = V.validate(negAsli,
    negAsli + ' Kelinci dapat hidup tanpa air dan tidak takut pada cahaya.', {});
  ok(r6.fails.length > 0, 'pembalikan negasi DITOLAK', r6.fails.map((f) => f.check).join(','));
  // Rewrite panjang sebanding TIDAK boleh ikut ambang ringkasan.
  const par = dgnAngka.replace('Penelitian dilakukan', 'Penelitian ini dilaksanakan');
  ok(V.validate(dgnAngka, par, {}).pass === true, 'rewrite sebanding tetap lolos (ambang 0,45)');
}

// ================= CASE G =================
// REGRESSION CASE (ringkasan menggantung): ekstraktif menyalin utuh, jadi kalimat
// berawalan "Namun,"/"Selain itu,"/"Hewan ini" berdiri tanpa kalimat sebelumnya.
console.log('CASE G - Summarizer: hindari kalimat bergantung (yatim)');
{
  const S = loadSummarizer();
  const scored = S.scoreSentences(LONG_SRC);
  const chosen = S.summarize(LONG_SRC).sentences;
  // Searik dengan ORPHAN_STRONG/ORPHAN_LEADERS di js/ai/summarizer.js.
  const ORPHAN_HEAD = /^(namun|tetapi|sedangkan|namun demikian|melainkan|sebaliknya|oleh karena itu|karena itu|oleh sebab itu|dengan demikian|maka dari itu|sehingga|selain itu|selain|menurut|sebab|hal ini|keadaan ini|hal tersebut|keadaan tersebut|hal itu|keadaan itu)\b/i;
  const orphan = chosen.filter((s) =>
    ORPHAN_HEAD.test(s) || /^\S+\s+(ini|itu|tersebut)\b/i.test(s));
  ok(orphan.length === 0, 'fallback tidak memilih kalimat bergantung', orphan.length + ' yatim');
  // Penalti orphan harus terpasang di skor (bukan hanya dihapus pasif).
  const orphanScored = scored.filter((e) => e.parts.orphan > 0);
  ok(orphanScored.length > 0, 'penalti kalimat bergantung terdeteksi',
    orphanScored.length + ' kalimat');
  // Sifat verbatim tidak boleh dikorbankan demi menghindari kalimat yatim.
  ok(S.verifyExtractive(LONG_SRC, chosen) === null, 'fallback tetap 100% verbatim');
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
  ok(ibmSel.materials.length === 1
    && ibmSel.materials[0].relevance >= MATERIAL.MIN_SOURCE_RELEVANCE,
    'sumber 2-topik (kelinci+daging) tampil dengan skor, bukan dibuang diam-diam',
    ibmSel.materials.length ? String(ibmSel.materials[0].relevance) : 'tidak tampil');
}

// Ringkasan
console.log('');
// ================= CASE 1-6: SEMANTIC RELEVANCE =================
// Sinyal utama = semantic similarity (embedding). Diuji OFFLINE dengan skor
// semantic DI-INJEKSI supaya kontrak scoring bisa dijaga tanpa jaringan.
// Test semantic sungguhan (embedding Gemini) ada di tests/material-live.js.
console.log('CASE 1-6 - semantic relevance (skor diinjeksi, offline)');
const SEM_DOC_PARU = [
  'Machine learning diterapkan untuk mendeteksi penyakit paru-paru dari citra rontgen dada.',
  'Model klasifikasi dilatih memakai ribuan citra yang berlabel oleh dokter spesialis.',
  'Evaluasi model memakai metrik akurasi, sensitivitas, dan spesifisitas pada data uji.',
  'Dataset tidak seimbang dapat menimbulkan bias pada hasil prediksi kelompok minoritas.',
].join(' ');
const SEM_DOC_KELINCI = [
  'Kelinci termasuk hewan herbivora yang telah lama domesticated di Indonesia.',
  'Sistem pencernaan kelinci bergantung pada fermentasi selulosa di usus besar caecum.',
  'Kebutuhan nutrisi kelinci dipenuhi oleh hijauan dan Timothy hay agar mikrobiota caecum seimbang.',
  'Penyakit yang umum muncul pada kelinci adalah pasteurellosis, coccidiosis, dan snuffles.',
].join(' ');

// Skor semantic nyata yang terukur (embedding Gemini; lihat material-live.js):
// dokumen kelinci vs judul relevan 0.74-0.80, vs tidak relevan 0.51-0.57.
function withSemantic(map) { return { mode: 'embedding', scores: map }; }
function cand(title, id) {
  return { title: title, venue: 'Jurnal Uji', doi: id, tier: 'Jurnal/paper', citations: 20,
    year: 2023 };
}
function semKey(c) { return MATERIAL.candKey(c); }

// CASE 1: sumber hanya menyebut entitas sebagai objek sampingan.
{
  const p = MATERIAL.buildProfile(SEM_DOC_KELINCI);
  const a = cand('Perancangan Sistem Informasi Penjualan Hewan Peliharaan Kelinci', 'c1a');
  const b = cand('GASTRONOMI MAKANAN BETAWI SEBAGAI IDENTITAS BUDAYA DAERAH', 'c1b');
  const sel = MATERIAL.selectMaterials([a, b], p,
    { semantic: withSemantic({ [semKey(a)]: 0.71, [semKey(b)]: 0.55 }) });
  ok(sel.materials.length === 0, 'CASE 1 entitas-sampingan DITOLAK (walaupun semantic 0.71)',
    'lolos: ' + sel.materials.length);
}

// CASE 2: paper relevan dengan terminologi berbeda.
{
  const p = MATERIAL.buildProfile(SEM_DOC_PARU);
  const target = cand('Diagnosis Kanker Paru-paru Berbasis Data Klinis: Evaluasi Performa Algoritma',
    'c2a');
  const off = cand('Reformasi Transportasi Umum sebagai Solusi Kemacetan di Kota Besar', 'c2b');
  const sel = MATERIAL.selectMaterials([target, off], p,
    { semantic: withSemantic({ [semKey(target)]: 0.77, [semKey(off)]: 0.51 }) });
  ok(sel.materials.length === 1 && sel.materials[0].title === target.title,
    'CASE 2 paper paru LOLOS walau judulnya tidak memuat kata model', 'lolos: ' + sel.materials.length);
  ok(!sel.materials.some((m) => m.title === off.title), 'CASE 2 paper tak relevan ditolak');
}

// CASE 3: satu keyword sama, semantic moderat tanpa dukungan lexical.
{
  const p = MATERIAL.buildProfile(SEM_DOC_KELINCI);
  const only = cand('Studi Kelinci dan Domba', 'c3');
  const sc = MATERIAL.scoreCandidate(only, p, withSemantic({ [semKey(only)]: 0.63 }));
  ok(sc.passes === false, 'CASE 3 satu keyword + semantic 0.63 tanpa breadth/context DITOLAK',
    'semantic: ' + sc.semantic + ', passes: ' + sc.passes);
}

// CASE 4: semua kandidat semantic rendah -> kosong.
{
  const p = MATERIAL.buildProfile(SEM_DOC_KELINCI);
  const a = cand('Reformasi Transportasi Umum Kota Besar', 'c4a');
  const b = cand('Kajian Ekonomi PerDense', 'c4b');
  const sel = MATERIAL.selectMaterials([a, b], p,
    { semantic: withSemantic({ [semKey(a)]: 0.50, [semKey(b)]: 0.52 }) });
  ok(sel.materials.length === 0, 'CASE 4 semua semantic rendah -> EMPTY RESULT',
    'lolos: ' + sel.materials.length);
}

// CASE 5: semantic tinggi, lexical rendah -> tetap boleh lolos.
{
  const p = MATERIAL.buildProfile(SEM_DOC_PARU);
  const target = cand('Resevaluasi Radiograf Toraks dengan Jaringan Syaraf Dalam', 'c5');
  const sc = MATERIAL.scoreCandidate(target, p, withSemantic({ [semKey(target)]: 0.74 }));
  ok(sc.passes === true, 'CASE 5 semantic tinggi (0.74) + lexical rendah tetap LOLOS',
    'semantic: ' + sc.semantic + ', lexical: ' + sc.lexical);
}

// CASE 6: fallback leksikal harus dilaporkan, bukan diam-diam.
{
  const p = MATERIAL.buildProfile(SEM_DOC_KELINCI);
  const sel = MATERIAL.selectMaterials([cand('Klasifikasi dan kebutuhan nutrisi kelinci rumah',
    'c6')], p, {});
  ok(sel.semanticMode === 'fallback', 'fallback leksikal dilaporkan lewat semanticMode',
    sel.semanticMode);
}

if (failures.length) {
  console.log('REGRESSION GAGAL (' + failures.length + '):');
  failures.forEach((f) => console.log(' - ' + f));
  process.exit(1);
}
console.log('REGRESSION LOLOS: CASE A-G semua sesuai kontrak.');
