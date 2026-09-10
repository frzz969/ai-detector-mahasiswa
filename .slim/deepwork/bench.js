// bench.js — Benchmark harness for Faraz Detector AI (deepwork, git-ignored)
// Loads core.js → referensi.js → detector.js → humanizer.js with a DOM stub,
// runs heuristic() + humanizeText() on a labeled dataset, prints metrics.
// Usage: node bench.js [--split=tuning|test|all] [--mode=detect|humanize]
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../.."); // ai-detector-mahasiswa

// ---------- DOM stub (enough to load js files without crashing) ----------
function makeEl() {
  return {
    value: "", textContent: "", innerHTML: "", hidden: false, disabled: false,
    files: [], onclick: null, title: "", className: "",
    style: {},
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    addEventListener() {}, removeEventListener() {},
    scrollIntoView() {}, focus() {}, setAttribute() {}, getAttribute: () => null,
    appendChild() {}, querySelectorAll: () => [],
  };
}
const documentStub = { getElementById: () => makeEl(), querySelectorAll: () => [], createElement: () => makeEl() };
const windowStub = {};
const navigatorStub = {};

// ---------- Load source ----------
function loadSources() {
  const files = ["js/core.js", "js/referensi.js", "js/detector.js", "js/humanizer.js"];
  const code = files
    .map((f) => fs.readFileSync(path.join(ROOT, f), "utf8"))
    .join("\n;\n");
  const factory = new Function(
    "document", "window", "navigator", "console",
    code + "\n;return {heuristic, splitReferences, cleanAcademic, splitSentences, words, countWords, humanizeText, localScore, AI_PHRASES, REF_FLUFF_EXTRA, REF_VOICE_EXTRA, REF_HEADS, REF_HUMANIZE_EXTRA};"
  );
  return factory(documentStub, windowStub, navigatorStub, console);
}

// ---------- Dataset (labeled; ground truth = human/ai/mixed) ----------
// tuning = threshold adjustment set; test = held-out. Never tune on test.
const DATASET = [
  // ---------------- TUNING (6) ----------------
  {
    id: "t-ai-demo", split: "tuning", label: "ai",
    text: "Perkembangan teknologi informasi memiliki peran yang penting dalam meningkatkan efektivitas proses pembelajaran di perguruan tinggi. Pemanfaatan teknologi dapat memberikan berbagai kemudahan dalam memperoleh informasi dan mendukung kegiatan akademik mahasiswa. Selain itu, penggunaan teknologi informasi juga dapat meningkatkan kualitas proses pembelajaran. Oleh karena itu, perguruan tinggi perlu memanfaatkan teknologi informasi secara optimal untuk mendukung kegiatan akademik. Dengan demikian, penerapan teknologi informasi di lingkungan perguruan tinggi diharapkan dapat memberikan manfaat yang positif bagi mahasiswa dan institusi."
  },
  {
    id: "t-human-demo", split: "tuning", label: "human",
    text: "Berdasarkan hasil observasi awal di Program Studi Teknik Informatika Universitas X, sebagian mahasiswa masih mengalami kesulitan dalam mengakses materi perkuliahan di luar jam pembelajaran. Kondisi tersebut terlihat dari hasil kuesioner awal yang diberikan kepada 40 mahasiswa, di mana 27 mahasiswa menyatakan bahwa mereka membutuhkan media yang dapat digunakan untuk mengakses materi secara lebih fleksibel. Temuan ini menunjukkan bahwa ketersediaan media pembelajaran yang mudah diakses masih menjadi kebutuhan bagi mahasiswa. Oleh sebab itu, penelitian ini berfokus pada pengembangan media pembelajaran berbasis web yang dapat digunakan untuk mengakses materi dan latihan secara mandiri."
  },
  {
    id: "t-human-formal-academic", split: "tuning", label: "human",
    text: "Penelitian ini bertujuan untuk menganalisis pengaruh model pembelajaran berbasis proyek terhadap hasil belajar siswa pada mata pelajaran IPA di SMP Negeri 3 Bandung. Metode yang digunakan adalah kuasi eksperimen dengan desain pretest-posttest control group. Populasi penelitian berjumlah 240 siswa kelas VII, dengan sampel sebanyak 70 siswa yang dipilih melalui teknik purposive sampling. Instrumen penelitian berupa tes hasil belajar yang telah diuji validitas dan reliabilitasnya. Data dianalisis menggunakan uji t independen dengan taraf signifikansi 0,05. Hasil penelitian menunjukkan terdapat perbedaan yang signifikan antara kelas eksperimen dan kelas kontrol. Temuan ini mengindikasikan bahwa model pembelajaran berbasis proyek efektif meningkatkan hasil belajar siswa. Implikasi praktis dari penelitian ini adalah guru dapat menerapkan model tersebut pada materi yang relevan."
  },
  {
    id: "t-ai-formal", split: "tuning", label: "ai",
    text: "Dalam era digital yang berkembang pesat saat ini, teknologi informasi memegang peranan penting dalam berbagai aspek kehidupan. Secara keseluruhan, pemanfaatan teknologi telah membawa perubahan signifikan dalam cara manusia berkomunikasi dan berinteraksi. Selain itu, perkembangan kecerdasan buatan semakin memudahkan berbagai aktivitas manusia. Dengan demikian, dapat disimpulkan bahwa teknologi informasi memberikan dampak yang positif dalam kehidupan sehari-hari. Penting untuk dicatat bahwa adaptasi terhadap teknologi baru juga menghadirkan tantangan tersendiri bagi masyarakat. Oleh karena itu, sangat penting untuk meningkatkan literasi digital di kalangan masyarakat."
  },
  {
    id: "t-short-human", split: "tuning", label: "human",
    text: "Kemarin saya coba menanam tomat di halaman rumah pakai pot bekas. Lumayan, tiga minggu kemudian sudah mulai berbunga. Semoga cepat berbuah biar bisa dipakai masak."
  },
  {
    id: "t-short-ai", split: "tuning", label: "ai",
    text: "Menanam tomat di rumah memberikan banyak manfaat. Pertama, kegiatan ini hemat biaya. Kedua, hasilnya dapat dikonsumsi langsung. Selain itu, menanam juga sangat menyenangkan."
  },

  // ---------------- TEST (held-out) ----------------
  {
    id: "e-human-casual-slang", split: "test", label: "human",
    text: "Jujur sih tadi malem aku panik banget soalnya tugasnya belum kelar. Eh ternyata deadline-nya mundur, akhirnya lega. Temenku bilang jangan kebanyakan scroll sosmed, tapi ya gimana lagi, refreshing juga perlu. Pokoknya besok aku usahakan selesai dulu, baru deh lanjut healing ke kafe baru."
  },
  {
    id: "e-human-technical", split: "test", label: "human",
    text: "Pada pengujian kali ini kami menerapkan algoritma TF-IDF untuk ekstraksi fitur pada dataset berita berbahasa Indonesia. Jumlah dokumen yang diproses adalah 1.200 artikel dari lima portal berita. Stopword dihapus menggunakan daftar dari Sastrawi, kemudian klasifikasi dilakukan dengan Multinomial Naive Bayes. Akurasi yang diperoleh mencapai 87,4 persen pada data uji, sedikit lebih tinggi dibandingkan percobaan sebelumnya yang hanya 84,1 persen. Perbedaan ini diduga karena penambahan fitur bigram pada percobaan kedua. Kami juga mencatat waktu komputasi rata-rata 12 detik per seribu dokumen, yang masih dapat diterima untuk kebutuhan riset."
  },
  {
    id: "e-human-with-data", split: "test", label: "human",
    text: "Dari hasil wawancara dengan 15 peternak di Kecamatan Taman, delapan di antaranya mengeluhkan pakan yang mulai mahal sejak awal tahun. Pak Slamet, peternak sapi yang sudah 20 tahun berjualan, bilang harga konsentrat naik hampir tiga ribu per kilogram. Saya sempat ikut mengecek harga di dua koperasi, dan memang selisihnya cukup terasa. Menariknya, tiga peternak justru beralih ke pakan fermentasi dan mengaku biayanya turun. Temuan lapangan ini setidaknya memberi gambaran bahwa solusi alternatif mulai dilirik."
  },
  {
    id: "e-ai-casual", split: "test", label: "ai",
    text: "Hai! Hari ini kita akan membahas cara merawat tanaman hias di rumah. Pertama, pastikan tanaman mendapatkan sinar matahari yang cukup setiap pagi. Kedua, jangan lupa menyiram tanaman secara teratur namun jangan berlebihan. Selain itu, penggunaan pupuk organik sangat disarankan untuk hasil yang optimal. Kesimpulannya, merawat tanaman hias sebenarnya cukup mudah jika dilakukan dengan konsisten."
  },
  {
    id: "e-ai-translated", split: "test", label: "ai",
    text: "Dapat dikatakan bahwa penguasaan literasi digital merupakan faktor kunci dalam menghadapi tantangan ekonomi modern. Pada dasarnya, kemampuan untuk mengakses, memahami, dan mengevaluasi informasi secara kritis menjadi semakin relevan seiring dengan pertumbuhan konten digital yang pesat. Perlu diingat bahwa tidak semua informasi yang beredar dapat dipercaya begitu saja. Dengan demikian, setiap individu diharapkan mampu memilah informasi secara bijak. Hal tersebut menuntut adanya kolaborasi antara pemerintah, pendidik, dan masyarakat secara menyeluruh."
  },
  {
    id: "e-mixed-human-ai", split: "test", label: "mixed",
    text: "Saya memulai proyek ini karena melihat langsung teman-teman di kampus kesulitan membagi waktu kuliah dan kerja. Mereka sering mengeluh tugas menumpuk di akhir pekan. Dari situlah saya dan dua teman membuat aplikasi jadwal belajar sederhana. Aplikasi ini dirancang untuk membantu mahasiswa mengatur waktu secara lebih efektif. Dengan adanya fitur pengingat otomatis, pengguna dapat meningkatkan produktivitas harian mereka. Selain itu, aplikasi ini juga menawarkan berbagai fitur tambahan yang dapat mendukung kegiatan akademik. Kami berharap aplikasi ini dapat memberikan dampak positif bagi penggunanya. Kalau hasilnya bagus, kami berencana mengembangkannya lebih lanjut."
  },
  {
    id: "e-human-edited-ai", split: "test", label: "mixed",
    text: "Metode yang kami gunakan dalam penelitian ini adalah regresi linear sederhana. Data diambil dari 89 responden yang mengisi kuesioner secara daring. Sebelum dianalisis, data melalui uji normalitas dan uji heteroskedastisitas. Lalu saya melakukan uji t untuk melihat signifikansi variabel bebas. Hasilnya ternyata menarik, karena pengaruhnya kecil tapi signifikan. Secara keseluruhan temuan ini mendukung hipotesis awal yang kami ajukan."
  },
  {
    id: "e-short-human-30", split: "test", label: "human",
    text: "Beli bakso tadi di pinggir jalan, enak banget ternyata. Satu porsi aja nggak cukup, akhirnya nambah lagi. Makanan begini mah kalo lagi musim hujan emang paling cocok."
  },
  {
    id: "e-short-ai-30", split: "test", label: "ai",
    text: "Penting untuk menjaga kesehatan tubuh setiap hari. Pola makan sehat dan olahraga teratur adalah kuncinya. Selain itu, tidur yang cukup juga sangat diperlukan. Dengan demikian, kesehatan akan tetap terjaga dengan baik."
  },
  {
    id: "e-human-en-personal", split: "test", label: "human",
    text: "I remember my first day at the lab pretty well. I spilled coffee on the keyboard within ten minutes, and my supervisor just laughed and handed me a towel. After that, everything went surprisingly smooth. We spent the next three months refining the sensor readings, and honestly, the best part was seeing the data finally make sense. The professor kept saying that patience pays off, and now I actually believe him."
  },
  {
    id: "e-ai-en-generic", split: "test", label: "ai",
    text: "In today's fast-paced digital era, it is important to note that technology plays a crucial role in modern education. Furthermore, the integration of artificial intelligence can enhance learning outcomes significantly. Moreover, adaptive learning systems provide personalized experiences for every student. In conclusion, embracing technological advancement is essential for the future of education."
  },
  {
    id: "e-human-trivial", split: "test", label: "human",
    text: "Setiap pagi sebelum berangkat kerja, saya selalu menyempatkan diri untuk sarapan nasi uduk di warung Bu Minah. Soto ayamnya paling enak kalau dimakan saat hujan. Selama bertahun-tahun saya nggak pernah bosan dengan menu yang itu-itu saja. Kata Bu Minah, rahasianya ada di bawang goreng yang digoreng dua kali. Kalau lagi rezeki, saya kadang minta tambah telur dadar. Habis itu baru deh berangkat, full energi."
  },
];

// ---------- Metrics ----------
function classify(score) {
  if (score >= 75) return "ai";
  if (score < 30) return "human";
  return "mid";
}

function runBench(api, texts, mode) {
  const rows = texts.map((t) => {
    const heu = api.heuristic(t.text);
    const row = {
      id: t.id, split: t.split, label: t.label,
      words: api.countWords(t.text),
      score: heu.score, sentScores: heu.sentScores, sentCount: heu.sents.length,
      cls: classify(heu.score),
      reasons: heu.reasons,
      detail: heu.detail,
    };
    if (mode === "humanize") {
      const pre = t.label === "ai" ? null : null;
      const r = api.humanizeText(t.text, heu.sentScores.length === heu.sents.length ? heu.sentScores : null);
      const post = api.heuristic(r.text);
      row.humanize = { newScore: post.score, changed: r.changed, reverted: r.reverted, merges: r.merges, splits: r.splits };
    }
    return row;
  });
  return rows;
}

function printMetrics(rows, opts) {
  const groups = opts.mode === "humanize"
    ? [{ name: "human", pred: (r) => r.label === "human" }, { name: "ai", pred: (r) => r.label === "ai" }]
    : [{ name: "human", pred: (r) => r.label === "human" }, { name: "ai", pred: (r) => r.label === "ai" }, { name: "mixed", pred: (r) => r.label === "mixed" }];

  for (const g of groups) {
    const sub = rows.filter((r) => r.split !== "exclude" && g.pred(r));
    if (!sub.length) continue;
    const scores = sub.map((r) => r.score);
    const avg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
    const mn = Math.min(...scores), mx = Math.max(...scores);
    if (opts.mode === "humanize") {
      const deltas = sub.map((r) => r.humanize.newScore - r.score);
      const avgDelta = (deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(1);
      const regress = deltas.filter((d) => d > 5).length;
      console.log(`${g.name}: n=${sub.length} avg=${avg} range=[${mn},${mx}] humanize-delta=${avgDelta} reverted-up=${regress}`);
      sub.forEach((r) => console.log(`   ${r.id}: ${r.score} -> ${r.humanize.newScore} (chg=${r.humanize.changed},rev=${r.humanize.reverted},mrg=${r.humanize.merges},spl=${r.humanize.splits})`));
    } else {
      console.log(`${g.name}: n=${sub.length} avg=${avg} range=[${mn},${mx}]`);
      sub.forEach((r) => console.log(`   ${r.id}: ${r.score} ${r.cls} words=${r.words} sents=${r.sentCount}`));
    }
  }

  if (opts.mode !== "humanize") {
    // Confusion for human/ai at both thresholds
    for (const thr of [50, 75]) {
      let tp = 0, fp = 0, tn = 0, fn = 0;
      rows.filter((r) => r.label !== "mixed").forEach((r) => {
        const predAI = r.score >= thr;
        if (r.label === "ai" && predAI) tp++;
        else if (r.label === "ai" && !predAI) fn++;
        else if (r.label === "human" && predAI) fp++;
        else tn++;
      });
      const acc = ((tp + tn) / Math.max(1, tp + tn + fp + fn) * 100).toFixed(1);
      console.log(`thr=${thr}: acc=${acc}% TP=${tp} FN=${fn} FP=${fp} TN=${tn} (FP-rate=${(fp / Math.max(1, fp + tn) * 100).toFixed(1)}%)`);
    }
    const mids = rows.filter((r) => r.cls === "mid");
    console.log(`mid-zone (30-74): n=${mids.length} ${mids.map((r) => `${r.id}:${r.label}`).join(", ")}`);
  }
}

// ---------- Main ----------
const args = process.argv.slice(2);
const split = (args.find((a) => a.startsWith("--split=")) || "--split=all").split("=")[1];
const mode = (args.find((a) => a.startsWith("--mode=")) || "--mode=detect").split("=")[1];

const api = loadSources();
let texts = DATASET;
if (split === "tuning") texts = DATASET.filter((t) => t.split === "tuning");
if (split === "test") texts = DATASET.filter((t) => t.split === "test");

console.log(`=== FarazDetector bench (${mode}) split=${split} n=${texts.length} ===`);
const rows = runBench(api, texts, mode);
printMetrics(rows, { mode });

// Export full rows as JSON for before/after comparison
const outPath = path.join(__dirname, `bench-${mode}-${split}.json`);
fs.writeFileSync(outPath, JSON.stringify(rows, null, 2));
console.log(`\nSaved: ${outPath}`);