// tools/merge-review.js - Gabung hasil audit 4-5 reviewer jadi satu rekap (tanpa dependensi).
// Masukan: semua file .json di folder input (default: folder TEMP audit-masuk),
//   tiap file hasil tools/audit-guest.html (tombol Unduh):
//   { reviewer, potongan, range:[start,end], mulai, selesai,
//     total_di_potongan, filled, samples:[ { no, id, verdict, confidence, note, reviewed_at } ] }
//   verdict "AI"|"Human"|"Uncertain", atau null bila sampel belum diisi.
//   verdict null / nilai lain DIABAIKAN (bukan dihitung sebagai isi).
// Keluaran:
//   1. Laporan console berbahasa Indonesia (rekap reviewer + tabel status + ringkasan + daftar BEDA).
//   2. File JSON rekap ke TEMP (default audit-merged.json, overridable argumen ke-2).
// Status tiap sampel:
//   SEPAKAT = semua reviewer aktif mengisi dan verdict sama.
//   BEDA    = semua reviewer aktif mengisi tetapi verdict tidak sama -> perlu adjudikasi manusia.
//   KURANG  = diisi sebagian reviewer saja (parsial), apa pun isi verdictnya.
//   BELUM   = belum ada reviewer yang mengisi.
// Prinsip blind review: reviewer BEDA = temuan untuk diperiksa manusia.
//   Skrip ini TIDAK PERNAH memilih jawaban final otomatis (tanpa majority vote);
//   cukup beri flag BEDA + daftar adjudikasi.
// File rusak / JSON invalid / tanpa nama reviewer -> dilaporkan lalu dilanjut (continue),
//   tidak crash dan tidak diam-diam dilewati.
// Hasil audit reviewer belum final -> skrip ini TIDAK menulis apa pun ke dalam repo,
//   hanya menulis file rekap ke path output (TEMP).
// Cara pakai:
//   node tools/merge-review.js [folder-input] [file-output]
//   Contoh:
//   node tools/merge-review.js "C:\Users\Atmint\AppData\Local\Temp\opencode\audit-masuk" "C:\Users\Atmint\AppData\Local\Temp\opencode\audit-merged.json"
'use strict';

const fs = require('fs');
const path = require('path');

// Folder/file kerja lokal (TEMP), bukan di dalam repo.
const DEFAULT_IN = 'C:\\Users\\Atmint\\AppData\\Local\\Temp\\opencode\\audit-masuk\\';
const DEFAULT_OUT = 'C:\\Users\\Atmint\\AppData\\Local\\Temp\\opencode\\audit-merged.json';

// Verdict yang sah dari audit-guest.html; selain ini (termasuk null) = belum diisi.
const VERDICT_OK = { AI: true, Human: true, Uncertain: true };

function pad(str, len) {
  const s = String(str == null ? '' : str);
  if (s.length >= len) return s;
  return s + ' '.repeat(len - s.length);
}

function nowISO() {
  return new Date().toISOString();
}

function main() {
  const inDir = process.argv[2] || DEFAULT_IN;
  const outFile = process.argv[3] || DEFAULT_OUT;

  // 1. Baca daftar file .json di folder input.
  let names;
  try {
    names = fs.readdirSync(inDir).filter((n) => /\.json$/i.test(n)).sort();
  } catch (e) {
    console.log('GAGAL baca folder input: ' + inDir);
    console.log('  sebab: ' + e.message);
    console.log('  Pastikan folder ada dan berisi file hasil-audit-<nama>.json.');
    process.exit(2);
    return;
  }
  if (!names.length) {
    console.log('REKAP GABUNGAN HASIL AUDIT');
    console.log('Folder input : ' + inDir);
    console.log('Tidak ada file .json di folder tersebut — belum ada yang bisa digabung.');
    process.exit(0);
    return;
  }

  // 2. Muat tiap file; yang rusak dilaporkan lalu dilanjut (continue).
  const reviewers = []; // { file, reviewer, potongan, range, expected, filled, byNo: {no: {id, verdict, confidence, note, reviewed_at}} }
  const rusak = []; // { file, sebab }
  names.forEach((n) => {
    const fp = path.join(inDir, n);
    let o;
    try {
      o = JSON.parse(fs.readFileSync(fp, 'utf8'));
    } catch (e) {
      rusak.push({ file: n, sebab: 'JSON tidak valid (' + e.message + ')' });
      return;
    }
    if (!o || typeof o !== 'object' || Array.isArray(o)) {
      rusak.push({ file: n, sebab: 'isi bukan objek hasil audit' });
      return;
    }
    const reviewer = String((o.reviewer == null ? '' : o.reviewer)).trim();
    if (!reviewer) {
      rusak.push({ file: n, sebab: 'tanpa nama reviewer (kolom reviewer kosong)' });
      return;
    }
    if (!Array.isArray(o.samples)) {
      rusak.push({ file: n, sebab: 'kolom samples bukan array' });
      return;
    }
    const byNo = {};
    o.samples.forEach((s) => {
      if (!s || s.no == null) return;
      const no = Number(s.no);
      if (!Number.isFinite(no)) return;
      if (!VERDICT_OK[s.verdict]) return; // null / kosong / nilai asing = belum diisi, diabaikan
      byNo[no] = {
        id: s.id == null ? '' : String(s.id),
        verdict: s.verdict,
        confidence: s.confidence == null ? '' : String(s.confidence),
        note: s.note == null ? '' : String(s.note),
        reviewed_at: s.reviewed_at == null ? null : s.reviewed_at,
      };
    });
    const expected = Number(o.total_di_potongan) || o.samples.length;
    reviewers.push({
      file: n,
      reviewer: reviewer,
      potongan: o.potongan == null ? '-' : String(o.potongan),
      range: Array.isArray(o.range) ? o.range : null,
      expected: expected,
      filled: Object.keys(byNo).length,
      byNo: byNo,
    });
  });

  const aktif = reviewers.length;

  console.log('REKAP GABUNGAN HASIL AUDIT');
  console.log('Folder input : ' + inDir);
  console.log('File .json ditemukan : ' + names.length);
  console.log('  - berhasil dimuat : ' + aktif);
  console.log('  - rusak / dilewati : ' + rusak.length);
  rusak.forEach((r) => console.log('    ! ' + r.file + ' -> ' + r.sebab + ' (dilanjut, bukan berhenti)'));
  if (!aktif) {
    console.log('Tidak ada file reviewer yang valid — belum ada yang bisa digabung.');
    process.exit(0);
    return;
  }

  // 3. Rekap per reviewer.
  console.log('');
  console.log('REKAP PER REVIEWER (' + aktif + ' reviewer aktif):');
  reviewers.forEach((r) => {
    const rg = r.range ? ' no ' + r.range[0] + '-' + r.range[1] : '';
    console.log('  - ' + r.reviewer + ' | potongan ' + r.potongan + rg +
      ' | terisi ' + r.filled + '/' + r.expected + ' (' + r.file + ')');
  });

  // 4. Gabung sampel per no (diurut menaik); id diambil dari pengisi pertama.
  const noSet = {};
  reviewers.forEach((r) => Object.keys(r.byNo).forEach((k) => { noSet[k] = true; }));
  const nos = Object.keys(noSet).map(Number).sort((a, b) => a - b);

  // Kumpulkan juga no sampel yang strukturnya diketahui tapi belum diisi siapa pun?
  // Tidak bisa: file guest hanya berisi potongannya sendiri. Sampel tanpa isi dari
  // reviewer mana pun tidak tercatat di sini, jadi status BELUM berarti "ada di
  // potongan tetapi tidak diisi" hanya bila no tersebut muncul di file lain yang
  // potongannya sama. Di bawah, no yang hanya muncul di satu potongan tetapi tidak
  // diisi siapa pun di potongan itu memang tidak terlihat — itu keterbatasan wajar
  // (laporan per reviewer di atas menunjukkan filled/expected untuk itu).
  const rows = nos.map((no) => {
    let id = '';
    const reviews = [];
    reviewers.forEach((r) => {
      const e = r.byNo[no];
      if (e) {
        if (!id) id = e.id;
        reviews.push({
          reviewer: r.reviewer,
          verdict: e.verdict,
          confidence: e.confidence,
          note: e.note,
          reviewed_at: e.reviewed_at,
        });
      }
    });
    let status;
    if (reviews.length === 0) {
      status = 'BELUM';
    } else if (reviews.length < aktif) {
      status = 'KURANG';
    } else if (reviews.every((x) => x.verdict === reviews[0].verdict)) {
      status = 'SEPAKAT';
    } else {
      status = 'BEDA';
    }
    return { no: no, id: id, reviews: reviews, status: status };
  });

  // 5. Tabel status tiap sampel.
  console.log('');
  console.log('TABEL STATUS TIAP SAMPEL (SEPAKAT=sama semua, BEDA=perlu adjudikasi,');
  console.log('KURANG=diisi sebagian reviewer, BELUM=belum ada yang mengisi):');
  const wNo = 6, wId = 16, wIsi = 9;
  console.log('  ' + pad('no', wNo) + pad('id', wId) + pad('isi',
    wIsi) + pad('verdict per reviewer', 44) + 'status');
  rows.forEach((r) => {
    const isi = r.reviews.length + '/' + aktif;
    const det = r.reviews.map((x) => x.reviewer + ':' + x.verdict).join(' | ') || '-';
    console.log('  ' + pad(r.no, wNo) + pad(r.id, wId) + pad(isi, wIsi) + pad(det, 44) + r.status);
  });
  if (!rows.length) console.log('  (belum ada sampel terisi dari reviewer mana pun)');

  // 6. Ringkasan kesesuaian + agreement rate.
  let sepakat = 0, beda = 0, belum = 0, kurang = 0;
  rows.forEach((r) => {
    if (r.status === 'SEPAKAT') sepakat++;
    else if (r.status === 'BEDA') beda++;
    else if (r.status === 'BELUM') belum++;
    else kurang++;
  });
  const denom = sepakat + beda;
  const rate = denom > 0 ? (sepakat / denom) * 100 : null;
  console.log('');
  console.log('RINGKASAN KESESUAIAN:');
  console.log('  total sampel tercatat : ' + rows.length);
  console.log('  SEPAKAT : ' + sepakat);
  console.log('  BEDA    : ' + beda);
  console.log('  KURANG  : ' + kurang);
  console.log('  BELUM   : ' + belum);
  console.log('  agreement rate (SEPAKAT dibagi SEPAKAT+BEDA) : ' +
    (rate == null ? '-' : rate.toFixed(1) + '%'));
  if (rate != null && rate < 100) {
    console.log('  INFO: kesesuaian di bawah 100% — sampel berstatus BEDA/KURANG/BELUM');
    console.log('  perlu ditinjau ulang oleh manusia (adjudikasi). Ini info, bukan error.');
  } else if (rate != null) {
    console.log('  INFO: semua sampel yang terisi penuh sudah sama antar-reviewer.');
  }

  // 7. Daftar BEDA untuk adjudikasi (tanpa memilih jawaban final apa pun).
  const disagreements = rows
    .filter((r) => r.status === 'BEDA')
    .map((r) => {
      const verdicts = {};
      r.reviews.forEach((x) => { verdicts[x.reviewer] = x.verdict; });
      return { no: r.no, id: r.id, verdicts: verdicts, reviews: r.reviews };
    });
  console.log('');
  console.log('DAFTAR BEDA UNTUK ADJUDIKASI (' + disagreements.length + ' sampel):');
  if (!disagreements.length) {
    console.log('  (tidak ada — tidak ada sampel yang perlu adjudikasi)');
  } else {
    console.log('  Catatan: daftar ini untuk diperiksa manusia; skrip tidak menentukan jawaban final.');
    disagreements.forEach((d) => {
      console.log('  - no ' + d.no + ', id ' + d.id);
      Object.keys(d.verdicts).sort().forEach((rv) => {
        console.log('      ' + rv + ': ' + d.verdicts[rv]);
      });
    });
  }

  // 8. Simpan rekap ke file output (TEMP, di luar repo). Folder dibuat bila belum ada.
  const out = {
    generated_at: nowISO(),
    reviewer_count: aktif,
    samples: rows,
    summary: {
      total_sampel: rows.length,
      sepakat: sepakat,
      beda: beda,
      kurang: kurang,
      belum: belum,
      agreement_rate: rate == null ? null : Math.round(rate * 10) / 10,
      reviewer_aktif: reviewers.map((r) => r.reviewer),
    },
    disagreements: disagreements,
    skipped: rusak,
  };
  try {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  } catch (e) {
    console.log('');
    console.log('GAGAL simpan file rekap: ' + outFile + ' (' + e.message + ')');
    process.exit(2);
    return;
  }
  console.log('');
  console.log('Rekap tersimpan di: ' + outFile);
  console.log('(File kerja lokal; tidak ada file repo yang diubah.)');
}

main();
