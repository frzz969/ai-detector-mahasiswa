// tests/domain-independence.js - Offline regression: relevance gate tidak bias domain.
//
// Guardian case (user): teks kelinci hanya CONTOH. Kalau user mengetik topik lain
// (bukan hewan), hasil materi tidak boleh ikut membahas hewan.
// Aturan: validation-rules P6. OFFLINE - kandidat mock, tanpa jaringan.
//
// Run: node tests/domain-independence.js
'use strict';

const path = require('path');
const MATERIAL = require(path.join(__dirname, '..', 'api', 'material.js'));

const OFFTOPIC = /\b(kelinci|hewan|ternak|unggas|ayam|sapi|domba|kucing|anjing|ikan|rabbit|livestock|poultry|cattle|lamb|goat)\b/i;

const CORPUS = [
  {
    key: 'kelinci',
    animalDomain: true,
    doc: [
      'Kelinci termasuk hewan herbivora yang telah lama domesticated di Indonesia.',
      'Klasifikasi yang paling umum adalah Oryctolagus cuniculus, kelinci rumah.',
      'Sistem pencernaan kelinci bergantung pada fermentasi selulosa di usus besar caecum.',
      'Akibatnya kelinci tidak dapat mencerna SERAT dalam jumlah besar dan membutuhkan hijauan agar mikrobiota caecum seimbang.',
      'Klasifikasi ras kelinci meliputi Rex, Angora, dan Dutch yang dibedakan panjang bulu dan ukuran tubuh.',
      'Kebutuhan nutrisi kelinci terutama dipenuhi oleh hijauan dan Timothy hay agar mikrobiota caecum tetap seimbang.',
      'Penyakit yang umum muncul pada kelinci adalah pasteurellosis, coccidiosis, dan snuffles.',
      'Pembiaban kelinci menuntut pengaturan suhu kandang yang stabil agar reproduksi berjalan optimal.',
    ],
    onTopic: [
      'Klasifikasi dan kebutuhan nutrisi kelinci rumah (Oryctolagus cuniculus)',
      'Pengaruh Pemberian Jenis Hijauan terhadap Performans Ternak Kelinci',
    ],
    offTopic: [
      'Perancangan Sistem Informasi Penjualan Hewan Peliharaan Kelinci Berbasis Web',
      'GASTRONOMI MAKANAN BETAWI SEBAGAI IDENTITAS BUDAYA DAERAH',
    ],
  },
  {
    key: 'literasi digital',
    doc: [
      'Literasi digital mahasiswa menjadi perhatian utama dalam perkuliahan masa kini.',
      'Survei terhadap 1200 mahasiswa menunjukkan 45 persen masih kesulitan menilai informasi daring.',
      'Keterampilan mencari dan memeriksa sumber menjadi bagian penting dari literasi digital.',
      'Hoaks dan disinformasi menjadi tantangan utama dalam literasi digital di perguruan tinggi.',
      'Pelatihan literasi digital di perguruan tinggi masih terbatas dan belum merata.',
      'Faktor akses internet menentukan kemampuan mahasiswa mencari dan memeriksa informasi.',
    ],
    onTopic: [
      'Literasi Digital Mahasiswa Menggunakan Kerangka Pengukuran Literasi Digital',
      'Tingkat Literasi Digital Mahasiswa dalam Mengonsumsi Informasi Politik',
    ],
    offTopic: [
      'Pangan dan Gizi Anak Sekolah Dasar di Indonesia',
      'Nutrisi Pakan Sapi Potong pada Musim Kemarau',
    ],
  },
  {
    key: 'perpajakan',
    doc: [
      'Peraturan perpajakan terbaru mengubah struktur tarif bagi wajib pajak pribadi.',
      'Pembagian wajib pajak pribadi meningkat setiap tahun seiring pertumbuhan ekonomi nasional.',
      'Penghitungan kewajiban pajak bagi perusahaan membutuhkan data transaksi yang terverifikasi.',
      'Kepatuhan terhadap kewajiban perpajakan menjadi perhatian utama dalam pengauditan internal perusahaan.',
      'Pemodelan penghitungan pajak memerlukan data transaksi yang lengkap dan dapat ditelusuri.',
    ],
    onTopic: [
      'Kepatuhan Wajib Pajak Badan Atas Kewajiban Administrasi Perpajakan',
      'Penerapan Penghitungan dan Pelaporan Pajak Penghasilan Orang Pribadi',
    ],
    offTopic: [
      'Palatabilitas Beberapa Hijauan Pakan pada Kelinci',
      'Sistem Informasi Penjualan Hewan Peliharaan Kelinci',
    ],
  },
  {
    key: 'machine learning kesehatan',
    doc: [
      'Machine learning diterapkan untuk mendeteksi penyakit paru-paru dari citra rontgen dada.',
      'Model klasifikasi dilatih memakai ribuan citra yang sudah diberi label oleh dokter spesialis.',
      'Evaluasi model memakai metrik akurasi, sensitivitas, dan spesifisitas pada data uji.',
      'Model yang dapat ditafsirkan tetap menjadi prioritas untuk adopsi klinis.',
      'Dataset tidak seimbang dapat menimbulkan bias pada hasil prediksi kelompok minoritas.',
      'Integrasi model ke alur kerja klinis memerlukan validasi prospektif dan pemantauan berkelanjutan.',
    ],
    onTopic: [
      'Diagnosis Kanker Paru-paru Berbasis Data Klinis: Evaluasi Performa Algoritma',
    ],
    sparseOverlap: [
      'Deteksi Tuberculosis pada Citra Rontgen Dada dengan Deep Learning',
    ],
    offTopic: [
      'Budidaya Kelinci Pedaging dan Potensi Daginnya',
      'Kepatuhan Wajib Pajak Badan Atas Kewajiban Administrasi Perpajakan',
    ],
  },
];

const failures = [];
function ok(cond, label, detail) {
  if (cond) console.log('  OK   ' + label + (detail ? '  [' + detail + ']' : ''));
  else {
    console.log('  GAGAL ' + label + (detail ? '  [' + detail + ']' : ''));
    failures.push(label);
  }
}

console.log('DOMAIN INDEPENDENCE (offline, relevance gate)');
CORPUS.forEach((c) => {
  const profile = MATERIAL.buildProfile(c.doc.join(' '));
  const cands = c.onTopic.concat(c.offTopic).map((t, i) => ({
    title: t, venue: 'Jurnal Uji', doi: 'd' + i, tier: 'Jurnal/paper',
  }));
  const sel = MATERIAL.selectMaterials(cands, profile, {});
  console.log('\n### ' + c.key);
  console.log('  topics: ' + profile.topics.map((t) => t.term).join(', '));

  c.onTopic.forEach((t) => {
    const hit = sel.materials.filter((m) => m.title === t)[0];
    ok(!!hit, 'on-topic lolos: ' + t.slice(0, 46), hit ? 'rel=' + hit.relevance : 'ditolak');
  });
  (c.sparseOverlap || []).forEach((t) => {
    const hit = sel.materials.filter((m) => m.title === t)[0];
    ok(!hit, 'on-topic tapi hanya 1 kata kunci -> ditolak (pagar): ' + t.slice(0, 40), hit ? 'rel=' + hit.relevance : 'ditolak');
  });
  c.offTopic.forEach((t) => {
    const hit = sel.materials.filter((m) => m.title === t)[0];
    ok(!hit, 'off-topic ditolak: ' + t.slice(0, 46), hit ? 'rel=' + hit.relevance : 'ditolak');
  });

  // Guardian case: tidak boleh ada materi hewan di dokumen non-hewan.
  if (!c.animalDomain) {
    const leak = sel.materials.filter((m) => OFFTOPIC.test(m.title + ' ' + m.relevanceReason));
    ok(leak.length === 0, 'tidak ada kebocoran domain hewan', leak.length + ' kebocoran');
    const qLeak = MATERIAL.buildQueries(profile).some((q) => OFFTOPIC.test(q));
    ok(!qLeak, 'query tidak tercemar kata hewan');
  } else {
    console.log('  info  korpus hewan: cek kebocoran tidak berlaku (dokumen memang membahas hewan)');
  }

  // Kontrak: sumber yang tampil selalu punya skor + alasan spesifik.
  ok(sel.materials.every((m) => typeof m.relevance === 'number' &&
    m.relevance >= MATERIAL.MIN_SOURCE_RELEVANCE && !!m.relevanceReason),
    'semua materi punya skor di atas ambang + alasan relevansi');
});

console.log('');
if (failures.length) {
  console.log('GAGAL (' + failures.length + '):');
  failures.forEach((f) => console.log(' - ' + f));
  process.exit(1);
}
console.log('DOMAIN INDEPENDENCE LOLOS: tidak ada bias domain lintas 4 bidang.');