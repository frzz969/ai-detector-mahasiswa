// ============================================================
// core.js — Fondasi: DOM refs, state, konstanta, util kecil
// File 1 dari 4. Muat PERTAMA (defer = berurutan).
// Cek error: ID tidak ketemu / konstanta salah → buka file ini.
// ============================================================

// ---- DOM refs (semua ID ada di index.html) ----
const $ = (id) => document.getElementById(id);

const inputText = $("inputText");
const statusEl  = $("status");
const wcEl      = $("wordCount");
const refInfo   = $("refInfo");
const fileInput = $("fileInput");
const fileChip  = $("fileChip");
const fileName  = $("fileName");
const fileMeta  = $("fileMeta");

// ---- State bersama (dipakai detector + main) ----
let localPipe = null;
let localLoading = false;
let lastResult = null;
let checking = false;
let pipeLoader = null;
let resultStale = false;
let localParts = null;
// resultStale=true artinya teks berubah sesudah hasil keluar —
// hasil di layar untuk teks LAMA dan dilarang di-export.
// localParts mencatat {n, of} potongan model (lapor jujur bila parsial).

// ---- Konstanta: frasa khas AI ----
// Detector-rules §3: frasa seperti "penelitian ini bertujuan", "oleh karena
// itu", "selain itu" adalah bahasa akademik NORMAL, BUKAN bukti AI. Frasa
// itu dipindah ke ACAD_NEUTRAL agar tidak menaikkan skor AI (menghilangkan
// false positive pada tulisan akademik manusia formal). Yang tersisa di
// AI_ID hanyalah frasa generik yang memang khas output model.
const AI_ID = [
  "sebagai model bahasa", "penting untuk dicatat", "secara keseluruhan",
  "dalam konteks", "pada dasarnya", "kesimpulannya", "perlu diingat",
  "dalam era digital", "memainkan peran penting", "tidak dapat dipungkiri",
];

const AI_EN = [
  "as an ai language model", "it is important to note", "overall,",
  "in conclusion", "in today's fast-paced", "delve into",
  "plays a crucial role", "it is worth noting",
  "this article explores",
];

const AI_PHRASES = [...AI_ID, ...AI_EN];

// Frasa akademik standar (detector-rules §3): dihitung sebagai konteks
// akademik, TIDAK menaikkan skor AI. Munculnya frasa ini di teks formal
// yang disertai metodologi/sitasi/data memperkuat penilaian academic
// convention (mengurangi false positive).
const ACAD_NEUTRAL = [
  "penelitian ini bertujuan", "artikel ini membahas", "dengan demikian",
  "oleh karena itu", "selain itu",
  "dapat disimpulkan", "berdasarkan hasil penelitian",
];

// Daftar function word ID/EN untuk deteksi bahasa (ID vs EN) di detector.js.
// Dipakai untuk: bobot model lokal (model dilatih bahasa Inggris → bobot
// dikurangi untuk teks Indonesia) dan sinyal kepadatan function word.
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
  "daftar pustaka", "references", "bibliography",
  "referensi", "daftar referensi",
];

// ---- Batas global (ubah di sini saja kalau perlu) ----
const MIN_WORDS     = 20;    // minimal kata untuk dicek
const MAX_CHARS     = 30000; // potong teks upload sepanjang ini
const MAX_PDF_PAGES = 30;    // halaman PDF yang dibaca
const MAX_CHUNKS    = 6;     // potongan teks ke model lokal
const MAX_FILE_MB   = 8;     // ukuran file maksimal

// ---- Util kecil ----
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

const countWords = (t) =>
  (t.trim().match(/[\p{L}\p{N}']+/gu) || []).length;

const formatBytes = (n) =>
  n > 1048576
    ? (n / 1048576).toFixed(1) + " MB"
    : Math.max(1, Math.round(n / 1024)) + " KB";
