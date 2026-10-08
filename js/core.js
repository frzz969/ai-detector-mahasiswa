// core.js — fondasi: DOM refs, state, konstanta, util kecil.
// dimuat pertama, berurutan dengan file lain.

const $ = (id) => document.getElementById(id);

const inputText = $("inputText");
const statusEl = $("status");
const wcEl = $("wordCount");
const refInfo = $("refInfo");
const fileInput = $("fileInput");
const fileChip = $("fileChip");
const fileName = $("fileName");
const fileMeta = $("fileMeta");

// State bersama, dipakai detector dan main.
let localPipe = null;
let localLoading = false;
let lastResult = null;
let checking = false;
let pipeLoader = null;
let resultStale = false;
let localParts = null;
let aiPending = false;
let aiResult = null;
let aiError = null;
// resultStale true berarti teks berubah sesudah hasil keluar,
// sehingga hasil lama tidak boleh dipakai untuk export.
// localParts mencatat potongan model {n, of}.
// aiPending, aiResult, aiError digabung lewat FarazCombine.

// Frasa generik keluaran model. Lihat detector-rules §3:
// frasa akademik normal dipindah ke ACAD_NEUTRAL agar tidak
// menaikkan skor dan tidak menimbulkan false positive.
const AI_ID = [
  "sebagai model bahasa",
  "penting untuk dicatat",
  "secara keseluruhan",
  "dalam konteks",
  "pada dasarnya",
  "kesimpulannya",
  "perlu diingat",
  "dalam era digital",
  "memainkan peran penting",
  "tidak dapat dipungkiri",
];

const AI_EN = [
  "as an ai language model",
  "it is important to note",
  "overall,",
  "in conclusion",
  "in today's fast-paced",
  "delve into",
  "plays a crucial role",
  "it is worth noting",
  "this article explores",
];

const AI_PHRASES = [...AI_ID, ...AI_EN];

// Frasa akademik standar (detector-rules §3).
// Ini konteks akademik, tidak menaikkan skor.
const ACAD_NEUTRAL = [
  "penelitian ini bertujuan",
  "artikel ini membahas",
  "dengan demikian",
  "oleh karena itu",
  "selain itu",
  "dapat disimpulkan",
  "berdasarkan hasil penelitian",
];

// Function word ID/EN untuk deteksi bahasa.
// Dipakai bobot model lokal dan sinyal kepadatan FW.
const ID_FW = new Set([
  "yang", "dan", "di", "ke", "dari", "dengan", "untuk", "pada", "ini", "itu",
  "adalah", "akan", "juga", "dalam", "oleh", "sebagai", "tidak", "atau",
  "karena", "serta", "antara", "melalui", "para", "sudah", "telah", "sangat",
  "lebih", "dapat", "bisa", "menjadi", "ada", "saya", "kami", "kita", "maka",
  "sehingga", "namun", "tetapi", "agar", "bila", "jika", "kalau", "supaya",
  "hanya", "sekali", "semua", "setiap", "paling", "terus", "lagi", "masih",
]);

const EN_FW = new Set([
  "the", "and", "of", "to", "in", "is", "are", "was", "were", "a", "an",
  "for", "with", "on", "that", "this", "these", "those", "it", "as", "by",
  "at", "from", "be", "been", "being", "which", "who", "whom", "not", "than",
  "but", "or", "if", "when", "while", "also", "can", "will", "would",
  "should", "may", "might", "has", "have", "had", "their", "its", "our",
  "your", "my", "them", "they", "we", "you", "he", "she", "i", "there",
  "then", "than", "so", "do", "does", "did", "about", "into", "over",
  "after", "before", "under", "during", "between",
]);

const REF_HEADS = [
  "daftar pustaka",
  "references",
  "bibliography",
  "referensi",
  "daftar referensi",
];

// Batas global, ubah di sini saja.
const MIN_WORDS = 20;
const MAX_CHARS = 30000;
const MAX_PDF_PAGES = 30;
const MAX_CHUNKS = 6;
const MAX_FILE_MB = 8;

// Skoring heuristic (detector-rules §3-§4, validation-rules §4).
// THR_*_DOC hanya cermin ambang render di main.js.
// Klasifikasi jangan diubah dari sini.
const SCORE_FLOOR = 15;
const SCORE_CEIL = 98;
const SCORE_ANCHOR = 22;
const SHORT_W = 50;
const SHORT_SENTS = 3;
const SHORT_TEXT_CAP = 45;
const MIN_RELIABLE_W = 80;
const LEX_MIN_W = 50;
const MED_MIN_W = 60;
const HEDGE_MIN_W = 40;
const IMPERS_MIN_W = 50;
const SINGLE_SIGNAL_CAP = 60;
const TEMPLATE_MAX = 36;
const RHYTHM_MAX = 20;
const STRUCTURE_MAX = 18;
const LEXICAL_MAX = 20;
const HUMAN_LIKE_MAX = 14;
const ACAD_DAMP_LOW = 2;
const ACAD_DAMP_MED = 6;
const ACAD_DAMP_HIGH = 10;
const BLEND_SPREAD_LO = 8;
const BLEND_SPREAD_RANGE = 24;
const BLEND_MAX_W = 0.6;
const THR_STRONG_DOC = 75;
const THR_MID_DOC = 50;
const THR_HUMAN_DOC = 30;

// S1 ID-Scaffold Dispersion (detector-rules §2/§4, ref-1 §3-§5, ref-7).
// Gerbang FIRE: totalW >= S1_MIN_W dan density >= S1_MIN_DENSITY
// dan dispersi >= S1_MIN_DISPERSION dan distinct >= S1_MIN_DISTINCT.
// Dilewati bila strongAcad, atau kalimat hit berangka/sitasi/metode
// konkret dalam +-1 kalimat. Bonus masuk gTemplate dengan clamp
// TEMPLATE_MAX tetap, tambah 1 posSig. Bonus per kalimat S1_SENT_PTS
// hanya bila union-hit dan acaMarkers < 3. Cap tunggal 60 dan cap
// teks pendek 45 tidak diubah.
const S1_MIN_W = 50;
const S1_MIN_DENSITY = 3.0;
const S1_MIN_DISPERSION = 2;
const S1_MIN_DISTINCT = 2;
const S1_TEMPLATE_PTS = 8;
const S1_SENT_PTS = 14;

const escapeHtml = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c])
  );

const countWords = (t) =>
  (t.trim().match(/[\p{L}\p{N}']+/gu) || []).length;

const formatBytes = (n) =>
  n > 1048576
    ? (n / 1048576).toFixed(1) + " MB"
    : Math.max(1, Math.round(n / 1024)) + " KB";
